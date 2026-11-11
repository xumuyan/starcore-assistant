// moss-host serve：Rust 阶段二（P2）宿主 stdio 协议最小子集。
// 目标是与 src/assistant-host.mjs 的 JSON 行协议形状逐字段对齐（tasks/configure/listen），
// 真实能力（任务读取、本地 ASR、聊天、听写）按计划在 P3 逐模块补齐；
// 未提供的能力以显式 error/capture=false 呈现，不静默假装成功。
use crate::chat::{spawn_text, ChatEngine};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

fn chat_timeout() -> Duration {
    // 默认与 node 版一致（60s）；仅供测试用环境变量缩短。
    std::env::var("MOSS_CHAT_TIMEOUT_MS").ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_millis)
        .unwrap_or(Duration::from_secs(60))
}

fn utc_now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, min, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Howard Hinnant civil_from_days：由 Unix 天数得年月日。
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{min:02}:{s:02}Z")
}

fn err_event(message: &str) -> Value {
    json!({ "type": "error", "message": message })
}

fn handle(request: &Value, engine: &Arc<ChatEngine>) -> Vec<Value> {
    match request.get("type").and_then(Value::as_str) {
        // tasks：与 node 版快照同形状；P2 仅协议对齐，任务读取 P3 提供。
        Some("tasks") => vec![json!({
            "type": "tasks",
            "available": false,
            "tasks": [],
            "checkedAt": utc_now_rfc3339(),
            "error": "Rust 宿主任务读取将在下一阶段提供（P3）"
        })],
        // configure：回显形状与 assistant-service emit 的 configured 一致；快照供聊天模块使用。
        Some("configure") => {
            let keys = request.get("keys").cloned().unwrap_or(Value::Null);
            let has = |field: &str| {
                keys.get(field).and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false)
            };
            let flags = [has("yunqiao"), has("deepseek"), has("fish")];
            *engine.settings.lock().unwrap() = request.get("settings").cloned().unwrap_or(json!({}));
            *engine.keys.lock().unwrap() = keys;
            vec![json!({
                "type": "configured",
                "settings": request.get("settings").cloned().unwrap_or(json!({})),
                "hasGateway": flags[0],
                "hasDeepSeek": flags[1],
                "hasFish": flags[2]
            })]
        }
        // text：闲聊路径（P3 第一模块）；HTTP 在独立线程，主循环保持可响应 cancel。
        Some("text") => {
            let text = request.get("text").and_then(Value::as_str).unwrap_or("").to_string();
            let mode = request.get("mode").and_then(Value::as_str).unwrap_or("chat").to_string();
            spawn_text(engine.clone(), text, mode, chat_timeout());
            vec![]
        }
        // cancel：打断进行中的回复；clear：清空内存会话；sleep：休眠。
        Some("cancel") => {
            if engine.cancel() {
                *engine.generation.lock().unwrap() += 1;
                engine.busy.store(false, Ordering::SeqCst);
                vec![json!({ "type": "state", "name": "idle", "detail": "已打断" })]
            } else { vec![] }
        }
        Some("clear") => {
            engine.clear();
            vec![json!({ "type": "state", "name": "idle", "detail": "对话已清空" })]
        }
        Some("sleep") => vec![json!({ "type": "state", "name": "idle", "detail": "已休眠，唤醒词或按键可再次开始" })],
        // listen：P2 未实现采集与 ASR，按 node 关闭语义输出 capture=false 并给出明确状态。
        Some("listen") => vec![
            json!({ "type": "state", "name": "error", "detail": "Rust 宿主尚未提供语音监听（P3 提供）" }),
            json!({ "type": "capture", "enabled": false }),
        ],
        Some(other) => vec![err_event(&format!("rust host serve: 不支持的类型 {other}"))],
        None => vec![err_event("rust host serve: 请求缺少 type")],
    }
}

pub fn run() {
    let engine = Arc::new(ChatEngine::new());
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let events = match serde_json::from_str::<Value>(&line) {
            Ok(request) => handle(&request, &engine),
            Err(_) => vec![err_event("rust host serve: 无法解析的 JSON 行")],
        };
        let mut out = stdout.lock();
        for event in events {
            let _ = serde_json::to_writer(&mut out, &event);
            let _ = out.write_all(b"\n");
        }
        let _ = out.flush();
    }
}
