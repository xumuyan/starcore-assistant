// moss-host 聊天模块（Rust 阶段三 P3，第一模块）：与 src/assistant-service.mjs 的
// 闲聊路径的初步实现；上下文使用本机加密 SQLite，完整协议对齐尚未验收。
// Codex 派发与 Fish 合成未实现，以显式 error/降级提示，不静默假装。
use regex::Regex;
use serde_json::{json, Value};
use std::io::Write;
use std::sync::{Arc, Mutex};

use crate::memory::ConversationStore;
use crate::vault::Vault;
use std::time::Duration;

const DEFAULT_CHAT_BASE: &str = "https://api.yunqiao.me/v1";
const DEFAULT_CHAT_MODEL: &str = "gpt-6-astra";

// One lock is the linearization point for request ownership, configuration and effects.
// Never hold it over HTTP/body reads. A control command either follows a committed
// reply (then stops its audio), or invalidates it before any DB/output effect.
#[derive(Default)]
struct Session {
    settings: Value,
    keys: Value,
    generation: u64,
    active: Option<u64>,
    playback: Option<String>,
}

impl Session {
    fn invalidate(&mut self) {
        self.generation += 1;
        self.active = None;
        self.playback = None;
    }

    fn audio_busy(&self) -> bool { self.active.is_some() || self.playback.is_some() }

    fn start_playback(&mut self) -> String {
        let id = format!("rust-{}", self.generation);
        self.playback = Some(id.clone());
        id
    }

    fn end_playback(&mut self, id: Option<&str>) -> bool {
        if self.playback.is_none() || self.playback.as_deref() != id { return false; }
        self.playback = None;
        true
    }

    fn claim(&mut self) -> Option<u64> {
        if self.active.is_some() { return None; }
        self.generation += 1;
        self.active = Some(self.generation);
        self.active
    }

    fn owns(&self, generation: u64) -> bool { self.active == Some(generation) }

    fn finish(&mut self, generation: u64) -> bool {
        if !self.owns(generation) { return false; }
        self.active = None;
        true
    }
}

// Immutable snapshot captured in stdin order, before spawning the worker.
struct ChatRequest {
    generation: u64,
    url: String,
    key: String,
    body: Value,
    timeout: Duration,
}

pub struct ChatEngine {
    session: Mutex<Session>,
    vault: Vault,
    store: ConversationStore,
    out: Mutex<std::io::Stdout>,
}

fn str_field<'a>(value: &'a Value, field: &str, default: &'a str) -> &'a str {
    value.get(field).and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(default)
}

impl ChatEngine {
    /// 与 AssistantService(dir).root 一致；显式状态目录优先，测试必须隔离 HOME/状态目录。
    pub fn open_state() -> Result<(Vault, ConversationStore), String> {
        let root = crate::status::state_dir().join("assistant");
        let vault = Vault::open(&root)?;
        let store = ConversationStore::open(&root)?;
        // 以现有密钥开封全部行；损坏或密钥不匹配时拒绝启动，不默默开新会话。
        store.validate(&vault)?;
        Ok((vault, store))
    }

    pub fn new() -> Result<Self, String> {
        let (vault, store) = Self::open_state()?;
        Ok(Self {
            session: Mutex::new(Session::default()),
            vault,
            store,
            out: Mutex::new(std::io::stdout()),
        })
    }

    pub fn emit(&self, event: &Value) {
        let mut out = self.out.lock().unwrap();
        let _ = serde_json::to_writer(&mut *out, event);
        let _ = out.write_all(b"\n");
        let _ = out.flush();
    }

    fn context(&self, limit: usize, budget: usize) -> Vec<Value> {
        let Ok(rows) = self.store.context(&self.vault, limit) else { return Vec::new() };
        let mut result = Vec::new();
        let mut budget = budget;
        for (role, content) in rows {
            if budget == 0 { break; }
            let cut = content.char_indices().nth(budget).map(|(i, _)| i).unwrap_or(content.len());
            budget -= content[..cut].chars().count();
            result.push(json!({ "role": role, "content": &content[..cut] }));
        }
        result
    }

    fn record(&self, role: &str, content: &str, source: &str) {
        if let Err(error) = self.store.append(&self.vault, role, content, source) {
            self.emit(&json!({ "type": "error", "message": format!("对话保存失败：{error}") }));
        }
    }

    pub fn configure(&self, settings: Value, keys: Value) {
        let mut session = self.session.lock().unwrap();
        session.invalidate();
        self.emit(&json!({ "type": "stopAudio" }));
        self.emit(&json!({ "type": "state", "name": "idle", "detail": "语音监听未开启" }));
        session.settings = settings;
        session.keys = keys;
        self.emit(&json!({
            "type": "configured", "settings": session.settings,
            "hasGateway": !str_field(&session.keys, "yunqiao", "").is_empty(),
            "hasDeepSeek": !str_field(&session.keys, "deepseek", "").is_empty(),
            "hasFish": !str_field(&session.keys, "fish", "").is_empty(),
        }));
    }

    fn stop(&self, detail: &str) {
        let mut session = self.session.lock().unwrap();
        session.invalidate();
        self.emit(&json!({ "type": "stopAudio" }));
        self.emit(&json!({ "type": "state", "name": "idle", "detail": detail }));
    }

    pub fn cancel(&self) { self.stop("已打断"); }

    pub fn sleep(&self) { self.stop("已休眠，唤醒词或按键可再次开始"); }

    pub fn playback_ended(&self, id: Option<&str>) {
        let mut session = self.session.lock().unwrap();
        // Rust emits tagged speech; missing/late/duplicate acknowledgements must
        // never release a replacement's gate or overwrite its thinking state.
        if !session.end_playback(id) { return; }
        self.emit(&json!({ "type": "state", "name": "idle", "detail": "播放结束" }));
    }

    pub fn reject_dictation(&self, kind: &str, id: Option<&str>) {
        let Some(id) = id else { return; };
        let uuid = Regex::new(r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").unwrap();
        if !uuid.is_match(id) || kind == "dictationCancel" { return; }
        let session = self.session.lock().unwrap();
        let message = if kind == "dictationPrepare" && session.settings.get("dictationEnabled").and_then(Value::as_bool) != Some(true) {
            "请先启用全局听写"
        } else if session.audio_busy() {
            "助手正在工作，请稍后听写"
        } else {
            "Rust 宿主暂不支持全局听写，请切换回 node 引擎"
        };
        // Never acknowledge readiness or accept audio without a real ASR backend.
        self.emit(&json!({ "type": "dictationError", "id": id, "message": message }));
    }

    pub fn clear(&self) {
        let mut session = self.session.lock().unwrap();
        session.invalidate();
        self.emit(&json!({ "type": "stopAudio" }));
        if let Err(error) = self.store.clear() {
            self.fail(&format!("对话清空失败：{error}"));
            return;
        }
        self.emit(&json!({ "type": "history", "messages": [] }));
        self.emit(&json!({ "type": "state", "name": "idle", "detail": "对话已清空" }));
    }

    // Synchronous receipt/claim: a queued cancel/clear cannot be overtaken by a
    // worker that has not yet started. Only network I/O moves to another thread.
    fn prepare_text(&self, text: &str, mode: &str, source: &str, timeout: Duration) -> Option<ChatRequest> {
        let mut session = self.session.lock().unwrap();
        if session.active.is_some() {
            self.emit(&json!({ "type": "error", "message": "正在回复，可先点击「打断」再提交" }));
            return None;
        }
        session.playback = None;
        self.emit(&json!({ "type": "stopAudio" }));
        let sleep_re = Regex::new(r"^(?:结束对话|休眠|退下吧)[。！!\s]*$").unwrap();
        if sleep_re.is_match(text) {
            session.invalidate();
            self.emit(&json!({ "type": "state", "name": "idle", "detail": "已休眠，唤醒词或按键可再次开始" }));
            return None;
        }
        if mode == "codex" {
            self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Codex 派发，请切换回 node 引擎" }));
            return None;
        }
        let codex_re = Regex::new(r"^(?:请\s*)?(?:让|叫|交给|发给|发送给)\s*(?:codex|扣得克斯|代码助手)[，,:：\s]*(.*)$").unwrap();
        let question_re = Regex::new(r"[吗么][。！!\s]*$|[？?][。\s]*$").unwrap();
        if let Some(caps) = codex_re.captures(text) {
            let rest = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            // node 版先排除疑问语气；疑问句走闲聊，命令句才派发。
            if !question_re.is_match(text) && !(rest.is_empty() && text.contains('？')) {
                self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Codex 派发，请切换回 node 引擎" }));
                return None;
            }
        }
        let key = str_field(&session.keys, "yunqiao", "").to_string();
        if key.is_empty() {
            self.answer("本地语音已能识别。请打开设置，填写云桥 API Key 后，我就可以和你连续对话。也可以直接点击「交给 Codex」发送开发要求。", false);
            return None;
        };

        self.emit(&json!({ "type": "message", "role": "user", "content": text }));
        self.record("user", text, source);
        let generation = session.claim()?;
        self.emit(&json!({ "type": "state", "name": "thinking", "detail": "云桥聊天正在回复" }));
        let name = str_field(&session.settings, "name", "沐言");
        let base = str_field(&session.settings, "chatBaseUrl", DEFAULT_CHAT_BASE);
        let model = str_field(&session.settings, "chatModel", DEFAULT_CHAT_MODEL);
        let context = self.context(16, 12000);
        let system = format!("你是用户的 Mac 私人助理，名字是{name}。自然简洁地用中文交谈，默认三句话以内。用户的对话完整保存在本机，但本次只携带近期上下文；不知道的旧内容不要假装记得。可以讨论开发问题；实际改文件或跑命令请提示用户说“让 Codex”加具体要求，会连同相关讨论交给选定的原聊天。不得声称已执行未调用的工具，不得虚构电脑状态或联网结果。");
        let mut input = vec![json!({ "role": "system", "content": system }), json!({ "role": "system", "content": "" }), json!({ "role": "user", "content": text })];
        for item in context { input.push(item); }
        Some(ChatRequest {
            generation,
            url: format!("{}/responses", base.trim_end_matches('/')),
            key,
            body: json!({
                "model": model, "input": input, "max_output_tokens": 800,
                "reasoning": { "effort": "low" }, "store": false
            }),
            timeout,
        })
    }

    fn perform(&self, request: ChatRequest) {
        // Avoid starting already-invalidated work. Cancellation during blocking
        // HTTP remains logical only: the socket is bounded by the request timeout.
        if !self.session.lock().unwrap().owns(request.generation) { return; }
        let agent = ureq::AgentBuilder::new().timeout(request.timeout).build();
        let result = agent.post(&request.url)
            .set("Authorization", &format!("Bearer {}", request.key))
            .set("Content-Type", "application/json")
            .timeout(request.timeout)
            .send_json(request.body)
            .map_err(|error| match error {
                ureq::Error::Status(code, _) => format!("云桥聊天失败（HTTP {code}），请检查密钥分组、模型与额度；未改用 DeepSeek"),
                _ => "对话已超时或取消".to_string(),
            })
            // Read the entire body BEFORE checking ownership, not just headers.
            .and_then(|response| response.into_json::<Value>().map_err(|_| "云桥响应读取失败或格式异常".to_string()));
        self.complete(request.generation, result);
    }

    fn complete(&self, generation: u64, result: Result<Value, String>) {
        let mut session = self.session.lock().unwrap();
        // An obsolete worker must neither emit/record nor release a new owner.
        if !session.finish(generation) { return; }
        match result {
            Ok(data) => {
                if data.get("error").is_some() {
                    self.fail("云桥返回接口错误，请检查模型分组与请求状态");
                    return;
                }
                let text = data.get("output").and_then(Value::as_array).map(|items| {
                    items.iter()
                        .filter(|x| x.get("type").and_then(Value::as_str) == Some("message") && x.get("role").and_then(Value::as_str) == Some("assistant"))
                        .flat_map(|x| x.get("content").and_then(Value::as_array).cloned().unwrap_or_default())
                        .filter(|x| x.get("type").and_then(Value::as_str) == Some("output_text"))
                        .filter_map(|x| x.get("text").and_then(Value::as_str).map(String::from))
                        .collect::<Vec<_>>().join("\n")
                }).filter(|s: &String| !s.trim().is_empty())
                  .or_else(|| data.get("output_text").and_then(Value::as_str).map(String::from));
                let Some(text) = text else { self.fail("云桥未返回可显示的文本，未改用其他付费服务"); return; };
                let text = text.trim().to_string();
                if let Some(usage) = data.get("usage") {
                    self.emit(&json!({ "type": "usage", "input": usage.get("input_tokens").cloned().unwrap_or(Value::Null), "output": usage.get("output_tokens").cloned().unwrap_or(Value::Null) }));
                }
                self.answer(&text, true);
                self.speak_if_enabled(&text, &mut session);
            }
            Err(message) => self.fail(&message),
        }
    }

    fn fail(&self, message: &str) {
        self.emit(&json!({ "type": "error", "message": message }));
        self.emit(&json!({ "type": "state", "name": "error", "detail": "对话未完成" }));
    }

    fn answer(&self, content: &str, save: bool) {
        if save { self.record("assistant", content, "chat"); }
        self.emit(&json!({ "type": "message", "role": "assistant", "content": content }));
        self.emit(&json!({ "type": "state", "name": "idle", "detail": "回复已就绪" }));
    }

    /// speak 对齐：node 版系统声音由 Swift 端播报；Fish 合成未实现，诚实降级为系统声音。
    fn speak_if_enabled(&self, content: &str, session: &mut Session) {
        let speak = session.settings.get("speak").and_then(Value::as_bool).unwrap_or(false);
        if !speak { return; }
        let voice = str_field(&session.settings, "voice", "system");
        if voice == "fish" {
            if str_field(&session.keys, "fish", "").is_empty() {
                self.emit(&json!({ "type": "error", "message": "Fish API Key 未配置，本次使用系统声音" }));
            } else {
                self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Fish 合成，本次使用系统声音" }));
            }
        }
        let playback_id = session.start_playback();
        self.emit(&json!({ "type": "speak", "text": speech_text(content), "playbackId": playback_id }));
    }
}

/// speechText 对齐：代码块与 Markdown 元符号转为口播友好文本，1000 字截断。
pub fn speech_text(text: &str) -> String {
    let code = Regex::new(r"(?s)```[\s\S]*?```").unwrap();
    let link = Regex::new(r"\[([^\]]+)\]\([^)]*\)").unwrap();
    let marks = Regex::new(r"[*#_`]").unwrap();
    let no_code = code.replace_all(text, "代码已显示在屏幕上。").into_owned();
    let no_link = link.replace_all(&no_code, "$1").into_owned();
    let result = marks.replace_all(&no_link, "").into_owned();
    result.chars().take(1000).collect()
}

/// 从请求线程调用的聊天入口：独立线程保证 serve 主循环在 HTTP 期间仍能读 cancel。
pub fn spawn_text(engine: Arc<ChatEngine>, text: String, mode: String, source: String, timeout: Duration) {
    let Some(request) = engine.prepare_text(&text, &mode, &source, timeout) else { return; };
    let generation = request.generation;
    let worker = engine.clone();
    if std::thread::Builder::new().name("moss-chat".into()).spawn(move || worker.perform(request)).is_err() {
        engine.complete(generation, Err("无法启动聊天请求线程，请稍后重试".into()));
    }
}

#[cfg(test)]
mod tests {
    use super::Session;
    use std::sync::{Arc, Barrier, Mutex};

    #[test]
    fn concurrent_claims_have_exactly_one_owner() {
        let session = Arc::new(Mutex::new(Session::default()));
        let barrier = Arc::new(Barrier::new(12));
        let threads: Vec<_> = (0..12).map(|_| {
            let session = session.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                session.lock().unwrap().claim()
            })
        }).collect();
        let owners: Vec<_> = threads.into_iter().filter_map(|t| t.join().unwrap()).collect();
        assert_eq!(owners.len(), 1);
        assert!(session.lock().unwrap().owns(owners[0]));
    }

    #[test]
    fn obsolete_completion_never_releases_a_replacement() {
        let mut session = Session::default();
        let old = session.claim().unwrap();
        session.invalidate();
        let current = session.claim().unwrap();
        assert_ne!(current, old);
        assert!(!session.finish(old));
        assert!(session.owns(current));
        assert!(session.claim().is_none());
        assert!(session.finish(current));
        assert!(!session.finish(current), "a result can only commit once");
        assert!(session.claim().is_some());
    }

    #[test]
    fn repeated_idle_invalidation_cannot_revalidate_any_old_request() {
        let mut session = Session::default();
        let mut old = Vec::new();
        for _ in 0..100 {
            old.push(session.claim().unwrap());
            session.invalidate();
            session.invalidate();
        }
        let current = session.claim().unwrap();
        for generation in old {
            assert!(!session.owns(generation));
            assert!(!session.finish(generation));
            assert!(session.owns(current));
        }
    }

    #[test]
    fn playback_gate_is_independent_of_completed_chat() {
        let mut session = Session::default();
        assert!(!session.audio_busy());
        let generation = session.claim().unwrap();
        assert!(session.audio_busy());
        assert!(session.finish(generation));
        assert!(!session.audio_busy());
        let playback = session.start_playback();
        assert!(session.audio_busy());
        assert!(!session.end_playback(None));
        assert!(!session.end_playback(Some("unknown")));
        assert!(session.audio_busy());
        assert!(session.end_playback(Some(&playback)));
        assert!(!session.audio_busy());
        assert!(!session.end_playback(Some(&playback)));
    }

    #[test]
    fn late_playback_ack_cannot_release_replacement_or_chat() {
        let mut session = Session::default();
        let first = session.claim().unwrap();
        session.finish(first);
        let old = session.start_playback();
        session.invalidate();
        assert!(!session.audio_busy());
        let next = session.claim().unwrap();
        assert!(!session.end_playback(Some(&old)));
        assert!(session.owns(next));
        session.finish(next);
        let current = session.start_playback();
        assert_ne!(old, current);
        assert!(!session.end_playback(Some(&old)));
        assert!(session.audio_busy());
        assert!(session.end_playback(Some(&current)));
    }

}
