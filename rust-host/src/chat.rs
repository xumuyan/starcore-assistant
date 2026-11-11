// moss-host 聊天模块（Rust 阶段三 P3，第一模块）：与 src/assistant-service.mjs 的
// 闲聊路径逐事件对齐。会话上下文仅存内存（加密落盘属金库模块，后续批次对齐）；
// Codex 派发与 Fish 合成未实现，以显式 error/降级提示，不静默假装。
use regex::Regex;
use serde_json::{json, Value};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::memory::ConversationStore;
use crate::vault::Vault;
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_CHAT_BASE: &str = "https://api.yunqiao.me/v1";
const DEFAULT_CHAT_MODEL: &str = "gpt-6-astra";

pub struct ChatEngine {
    pub settings: Mutex<Value>,
    pub keys: Mutex<Value>,
    pub vault: Vault,
    pub store: ConversationStore,
    pub busy: AtomicBool,
    pub generation: Mutex<u64>,
    pub aborted: Arc<AtomicBool>,
    pub out: Mutex<std::io::Stdout>,
}

fn str_field<'a>(value: &'a Value, field: &str, default: &'a str) -> &'a str {
    value.get(field).and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(default)
}

impl ChatEngine {
    /// 状态目录与 node 版同路径（HOME 下的 .codex-weixin-notifier），供测试以 HOME 沙箱隔离。
    pub fn open_state() -> (Vault, ConversationStore) {
        let root = std::env::var("HOME").map(|h| PathBuf::from(h).join(".codex-weixin-notifier")).unwrap_or_else(|_| PathBuf::from(".codex-weixin-notifier"));
        let vault = Vault::open(&root).expect("金库初始化失败");
        let store = ConversationStore::open(&root).expect("会话库初始化失败");
        (vault, store)
    }

    // ChatEngine 构造需要 HOME 沙箱状态目录，Default 语义不适用。
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        let (vault, store) = Self::open_state();
        Self {
            settings: Mutex::new(json!({})),
            keys: Mutex::new(json!({})),
            vault,
            store,
            busy: AtomicBool::new(false),
            generation: Mutex::new(0),
            aborted: Arc::new(AtomicBool::new(false)),
            out: Mutex::new(std::io::stdout()),
        }
    }

    pub fn emit(&self, event: &Value) {
        let mut out = self.out.lock().unwrap();
        let _ = serde_json::to_writer(&mut *out, event);
        let _ = out.write_all(b"\n");
        let _ = out.flush();
    }

    fn key(&self, field: &str) -> Option<String> {
        let keys = self.keys.lock().unwrap();
        keys.get(field).and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from)
    }

    fn setting(&self, field: &str, default: &str) -> String {
        let settings = self.settings.lock().unwrap();
        str_field(&settings, field, default).to_string()
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

    pub fn cancel(&self) -> bool {
        if !self.busy.load(Ordering::SeqCst) { return false; }
        self.aborted.store(true, Ordering::SeqCst);
        true
    }

    pub fn clear(&self) {
        if let Err(error) = self.store.clear() {
            self.emit(&json!({ "type": "error", "message": format!("对话清空失败：{error}") }));
        }
    }

    /// 闲聊主路径；返回 Ok(()) 时事件已按序发出。Codex 派发不在本模块。
    pub fn text(&self, text: &str, mode: &str, source: &str, timeout: Duration) {
        if self.busy.load(Ordering::SeqCst) {
            self.emit(&json!({ "type": "error", "message": "正在回复，可先点击「打断」再提交" }));
            return;
        }
        let sleep_re = Regex::new(r"^(?:结束对话|休眠|退下吧)[。！!\s]*$").unwrap();
        if sleep_re.is_match(text) {
            self.emit(&json!({ "type": "state", "name": "idle", "detail": "已休眠，唤醒词或按键可再次开始" }));
            return;
        }
        if mode == "codex" {
            self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Codex 派发，请切换回 node 引擎" }));
            return;
        }
        let codex_re = Regex::new(r"^(?:请\s*)?(?:让|叫|交给|发给|发送给)\s*(?:codex|扣得克斯|代码助手)[，,:：\s]*(.*)$").unwrap();
        let question_re = Regex::new(r"[吗么][。！!\s]*$|[？?][。\s]*$").unwrap();
        if let Some(caps) = codex_re.captures(text) {
            let rest = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            // node 版先排除疑问语气；疑问句走闲聊，命令句才派发。
            if !question_re.is_match(text) && !(rest.is_empty() && text.contains('？')) {
                self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Codex 派发，请切换回 node 引擎" }));
                return;
            }
        }
        let Some(key) = self.key("yunqiao") else {
            self.answer("本地语音已能识别。请打开设置，填写云桥 API Key 后，我就可以和你连续对话。也可以直接点击「交给 Codex」发送开发要求。", false);
            return;
        };

        self.emit(&json!({ "type": "message", "role": "user", "content": text }));
        self.record("user", text, source);
        let generation = { let mut g = self.generation.lock().unwrap(); *g += 1; *g };
        self.busy.store(true, Ordering::SeqCst);
        self.aborted.store(false, Ordering::SeqCst);
        self.emit(&json!({ "type": "state", "name": "thinking", "detail": "云桥聊天正在回复" }));
        let name = self.setting("name", "沐言");
        let base = self.setting("chatBaseUrl", DEFAULT_CHAT_BASE);
        let model = self.setting("chatModel", DEFAULT_CHAT_MODEL);
        let context = self.context(16, 12000);
        let system = format!("你是用户的 Mac 私人助理，名字是{name}。自然简洁地用中文交谈，默认三句话以内。用户的对话完整保存在本机，但本次只携带近期上下文；不知道的旧内容不要假装记得。可以讨论开发问题；实际改文件或跑命令请提示用户说“让 Codex”加具体要求，会连同相关讨论交给选定的原聊天。不得声称已执行未调用的工具，不得虚构电脑状态或联网结果。");
        let mut input = vec![json!({ "role": "system", "content": system }), json!({ "role": "system", "content": "" }), json!({ "role": "user", "content": text })];
        for item in context { input.push(item); }
        let aborted = self.aborted.clone();
        let url = format!("{}/responses", base.trim_end_matches('/'));
        let agent = ureq::AgentBuilder::new().timeout(timeout).build();
        let result = agent.post(&url)
            .set("Authorization", &format!("Bearer {key}"))
            .set("Content-Type", "application/json")
            .timeout(timeout)
            .send_json(json!({
                "model": model, "input": input, "max_output_tokens": 800,
                "reasoning": { "effort": "low" }, "store": false
            }));
        if aborted.load(Ordering::SeqCst) || generation != *self.generation.lock().unwrap() {
            self.busy.store(false, Ordering::SeqCst);
            return;
        }
        match result {
            Ok(response) => {
                let data: Value = response.into_json().unwrap_or(Value::Null);
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
                self.speak_if_enabled(&text);
            }
            Err(ureq::Error::Status(code, _)) => self.fail(&format!("云桥聊天失败（HTTP {code}），请检查密钥分组、模型与额度；未改用 DeepSeek")),
            Err(_) => self.fail("对话已超时或取消"),
        }
    }

    fn fail(&self, message: &str) {
        self.busy.store(false, Ordering::SeqCst);
        self.emit(&json!({ "type": "error", "message": message }));
        self.emit(&json!({ "type": "state", "name": "error", "detail": "对话未完成" }));
    }

    fn answer(&self, content: &str, save: bool) {
        if save { self.record("assistant", content, "chat"); }
        self.emit(&json!({ "type": "message", "role": "assistant", "content": content }));
        self.busy.store(false, Ordering::SeqCst);
        self.emit(&json!({ "type": "state", "name": "idle", "detail": "回复已就绪" }));
    }

    /// speak 对齐：node 版系统声音由 Swift 端播报；Fish 合成未实现，诚实降级为系统声音。
    fn speak_if_enabled(&self, content: &str) {
        let speak = self.settings.lock().unwrap().get("speak").and_then(Value::as_bool).unwrap_or(false);
        if !speak { return; }
        let voice = self.setting("voice", "system");
        if voice == "fish" {
            if self.key("fish").is_none() {
                self.emit(&json!({ "type": "error", "message": "Fish API Key 未配置，本次使用系统声音" }));
            } else {
                self.emit(&json!({ "type": "error", "message": "Rust 宿主暂不支持 Fish 合成，本次使用系统声音" }));
            }
        }
        self.emit(&json!({ "type": "speak", "text": speech_text(content) }));
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
    std::thread::spawn(move || engine.text(&text, &mode, &source, timeout));
}

