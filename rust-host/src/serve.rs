// moss-host serve：Rust 阶段二（P2）宿主 stdio 协议最小子集。
// 目标是与 src/assistant-host.mjs 的 JSON 行协议形状逐字段对齐（tasks/configure/listen），
// 真实能力（任务读取、本地 ASR、聊天、听写）按计划在 P3 逐模块补齐；
// 未提供的能力以显式 error/capture=false 呈现，不静默假装成功。
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn utc_now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
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
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

fn err_event(message: &str) -> Value {
    json!({ "type": "error", "message": message })
}

fn handle(request: &Value) -> Vec<Value> {
    match request.get("type").and_then(Value::as_str) {
        // tasks：与 node 版快照同形状；P2 仅协议对齐，任务读取 P3 提供。
        Some("tasks") => vec![json!({
            "type": "tasks",
            "available": false,
            "tasks": [],
            "checkedAt": utc_now_rfc3339(),
            "error": "Rust 宿主任务读取将在下一阶段提供（P3）"
        })],
        // configure：回显形状与 assistant-service emit 的 configured 一致。
        Some("configure") => {
            let keys = request.get("keys").cloned().unwrap_or(Value::Null);
            let has = |field: &str| {
                keys.get(field).and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false)
            };
            vec![json!({
                "type": "configured",
                "settings": request.get("settings").cloned().unwrap_or(json!({})),
                "hasGateway": has("yunqiao"),
                "hasDeepSeek": has("deepseek"),
                "hasFish": has("fish")
            })]
        }
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
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let events = match serde_json::from_str::<Value>(&line) {
            Ok(request) => handle(&request),
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
