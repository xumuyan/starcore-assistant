// moss-host status：与 src/client-control.mjs 的 status 命令逐字段对齐的只读实现。
// 对齐基准：operatelog SC-20261109-012 之后的 client-control（含 delivery 字段）。
// 已知可容忍差异（均比 node 版更稳健，不影响正常数据）：
//   1. 事件缺少 time 字段时 node 版会在排序时抛错，本实现按空串处理不崩溃；
//   2. checkedAt 只接受 toISOString 形状（YYYY-MM-DDTHH:MM:SS.mmmZ），
//      node 的 Date.parse 接受更多宽松格式；生产写入恒为 toISOString。
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const LABELS: [&str; 2] = [
    "local.codex-weixin-notifier",
    "local.codex-weixin-desktop-watch",
];
const FRESH_WINDOW_MS: i64 = 15000;

#[derive(Serialize)]
pub struct Snapshot {
    pub delivery: bool,
    #[serde(rename = "serviceRunning")]
    pub service_running: bool,
    pub watching: bool,
    pub bound: bool,
    pub ready: bool,
    pub paused: bool,
    pub sent: usize,
    pub pending: usize,
    pub uncertain: usize,
    #[serde(rename = "remoteEnabled")]
    pub remote_enabled: bool,
    #[serde(rename = "remoteProject")]
    pub remote_project: Option<String>,
    #[serde(rename = "remoteThreadId")]
    pub remote_thread_id: Option<String>,
    #[serde(rename = "remoteStatus")]
    pub remote_status: &'static str,
    pub latest: Option<Latest>,
}

#[derive(Serialize)]
pub struct Latest {
    pub project: String,
    pub summary: String,
    pub status: String,
}

pub fn state_dir() -> PathBuf {
    match std::env::var("CODEX_WEIXIN_STATE_DIR") {
        Ok(v) if !v.is_empty() => PathBuf::from(v),
        _ => home_dir().join(".codex-weixin-notifier"),
    }
}

fn home_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

// 与 node 版一致：允许测试注入，生产固定系统路径。
fn launchctl() -> String {
    std::env::var("MOSS_LAUNCHCTL").unwrap_or_else(|_| "/bin/launchctl".to_string())
}

fn domain() -> String {
    format!("gui/{}", unsafe { libc::getuid() })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// launchctl print 的 state = running 判定（node 版正则 /^\s*state = running\s*$/m 的等价实现）。
fn loaded(label: &str) -> bool {
    let output = Command::new(launchctl())
        .args(["print", &format!("{}/{}", domain(), label)])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output();
    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .any(|line| line.trim() == "state = running"),
        _ => false,
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// node 版 `read(name)` catch {} 的等价：缺失或损坏返回 Null。
fn read_state(dir: &Path, name: &str) -> Value {
    read_json(&dir.join(name)).unwrap_or(Value::Null)
}

fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Some(_) => true,
    }
}

fn prepare(dir: &Path) {
    // node 版 prepare()：0o700 目录，失败静默（只读命令不因目录问题崩溃）。
    for sub in [dir, &dir.join("events")] {
        if fs::create_dir_all(sub).is_ok() {
            let _ = fs::set_permissions(sub, fs::Permissions::from_mode(0o700));
        }
    }
}

fn is_hex_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 64 + 5
        && name.ends_with(".json")
        && bytes[..64].iter().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn events(dir: &Path) -> Vec<Value> {
    prepare(dir);
    let mut list: Vec<Value> = Vec::new();
    let entries = match fs::read_dir(dir.join("events")) {
        Ok(entries) => entries,
        Err(_) => return list,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_hex_name(&name) {
            continue;
        }
        if let Ok(text) = fs::read_to_string(entry.path()) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if value.get("status").and_then(Value::as_str) == Some("cancelled") {
                    continue;
                }
                list.push(value);
            }
        }
    }
    list.sort_by(|a, b| {
        a.get("time")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("time").and_then(Value::as_str).unwrap_or(""))
    });
    list
}

fn requests(dir: &Path) -> Vec<Value> {
    prepare(dir);
    let root = dir.join("remote-requests");
    let _ = fs::create_dir_all(&root);
    let _ = fs::set_permissions(&root, fs::Permissions::from_mode(0o700));
    let mut list: Vec<Value> = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return list,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_hex_name(&name) {
            continue;
        }
        if let Ok(text) = fs::read_to_string(entry.path()) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                list.push(value);
            }
        }
    }
    list.sort_by(|a, b| {
        a.get("receivedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("receivedAt").and_then(Value::as_str).unwrap_or(""))
    });
    list
}

fn remote_status(requests: &[Value]) -> &'static str {
    if requests
        .iter()
        .any(|r| r.get("status").and_then(Value::as_str) == Some("running"))
    {
        "执行中"
    } else if requests.iter().any(|r| {
        matches!(
            r.get("status").and_then(Value::as_str),
            Some("submitting") | Some("submitted")
        )
    }) {
        "已投递，等待桌面执行"
    } else if requests
        .iter()
        .any(|r| r.get("status").and_then(Value::as_str) == Some("pending"))
    {
        "等待投递"
    } else {
        "空闲"
    }
}

fn thread_id_ok(id: Option<&Value>) -> bool {
    match id.and_then(Value::as_str) {
        Some(s) => s.len() == 36 && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-'),
        None => false,
    }
}

/// toISOString 固定形状解析（YYYY-MM-DDTHH:MM:SS.mmmZ）→ epoch 毫秒。
pub fn iso_ms(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() != 24 {
        return None;
    }
    for (index, expected) in [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':'), (19, b'.'), (23, b'Z')] {
        if bytes[index] != expected {
            return None;
        }
    }
    for index in [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22] {
        if !bytes[index].is_ascii_digit() {
            return None;
        }
    }
    let num = |range: std::ops::Range<usize>| -> i64 {
        text[range].parse().unwrap_or(-1)
    };
    let (year, month, day) = (num(0..4), num(5..7), num(8..10));
    let (hour, minute, second, milli) = (num(11..13), num(14..16), num(17..19), num(20..23));
    if year < 0 || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) || !(0..=59).contains(&second) || !(0..=999).contains(&milli) {
        return None;
    }
    Some(days_from_civil(year, month, day) * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1_000 + milli)
}

/// Howard Hinnant 的 days_from_civil：公历日期 → 自 1970-01-01 的天数。
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_pattern = (month + 9) % 12;
    let day_of_year = (153 * month_pattern + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

pub fn snapshot() -> Snapshot {
    let dir = state_dir();
    // delivery：wechatDelivery !== false（缺失/损坏 → true，与 node 版 read() 兜底一致）。
    let delivery = read_state(&dir, "runtime-settings.json")
        .get("wechatDelivery")
        != Some(&Value::Bool(false));

    let service_running = loaded(LABELS[0]);
    let watcher_running = loaded(LABELS[1]);
    let desktop = read_state(&dir, "desktop-status.json");
    let desktop_fresh = desktop
        .get("checkedAt")
        .and_then(Value::as_str)
        .and_then(iso_ms)
        .map(|checked| now_ms() - checked < FRESH_WINDOW_MS)
        .unwrap_or(false);
    let watching = watcher_running
        && desktop.get("running").and_then(Value::as_bool) == Some(true)
        && !truthy(desktop.get("error"))
        && desktop_fresh;

    let accounts = dir.join("weixin/openclaw-weixin/accounts.json");
    let bound = matches!(
        read_json(&accounts).as_ref().and_then(Value::as_array),
        Some(items) if !items.is_empty()
    );

    let service = read_state(&dir, "status.json");
    let ready = service_running && service.get("ready").and_then(Value::as_bool) == Some(true);
    let paused = service.get("paused").and_then(Value::as_bool) == Some(true);

    let list = events(&dir);
    fn status_of(event: &Value) -> &str {
        event.get("status").and_then(Value::as_str).unwrap_or("")
    }
    let sent = list.iter().filter(|e| status_of(e) == "sent").count();
    let pending = list.iter().filter(|e| status_of(e) == "pending").count();
    let uncertain = list
        .iter()
        .filter(|e| matches!(status_of(e), "sending" | "uncertain"))
        .count();
    let latest = list.last().map(|event| Latest {
        project: event
            .get("project")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        summary: event
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        status: status_of(event).to_string(),
    });

    let remote_enabled = read_state(&dir, "remote-settings.json").get("enabled")
        != Some(&Value::Bool(false));
    let target = list
        .iter()
        .rev()
        .find(|e| status_of(e) == "sent" && thread_id_ok(e.get("threadId")));
    let requests = requests(&dir);

    Snapshot {
        delivery,
        service_running,
        watching,
        bound,
        ready,
        paused,
        sent,
        pending,
        uncertain,
        remote_enabled,
        remote_project: target
            .and_then(|e| e.get("project"))
            .and_then(Value::as_str)
            .map(str::to_string),
        remote_thread_id: target
            .and_then(|e| e.get("threadId"))
            .and_then(Value::as_str)
            .map(str::to_string),
        remote_status: remote_status(&requests),
        latest,
    }
}

pub fn snapshot_json() -> String {
    serde_json::to_string(&snapshot()).expect("snapshot 序列化不应失败")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "moss-host-test-{}-{}-{}",
            tag,
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn hex_event_names_only() {
        let hex = "a".repeat(64);
        assert!(is_hex_name(&format!("{}.json", hex)));
        assert!(!is_hex_name(&format!("{}.json", "A".repeat(64))), "大写不匹配");
        assert!(!is_hex_name(&format!("{}.json", "a".repeat(63))));
        assert!(!is_hex_name(&format!("{}.txt", hex)));
        assert!(!is_hex_name("random.json"));
    }

    #[test]
    fn thread_id_matches_node_regex() {
        let uuid = "12345678-1234-4123-8123-123456789abc";
        assert!(thread_id_ok(Some(&json!(uuid))));
        assert!(!thread_id_ok(Some(&json!("not-a-uuid"))));
        assert!(!thread_id_ok(Some(&json!(123))));
        assert!(!thread_id_ok(None));
    }

    #[test]
    fn iso_parses_to_isostring_epoch() {
        assert_eq!(iso_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(iso_ms("2000-03-01T00:00:00.000Z"), Some(951_868_800_000));
        assert_eq!(
            iso_ms("2026-11-09T11:45:48.594Z"),
            Some(1_794_224_748_594)
        );
        assert_eq!(iso_ms("2026-11-09 11:45:48"), None, "非 toISOString 形状");
        assert_eq!(iso_ms(""), None);
        assert_eq!(iso_ms("garbage-in-the-middle-of-it!"), None);
    }

    #[test]
    fn remote_status_follows_node_chain() {
        assert_eq!(remote_status(&[json!({"status": "running"})]), "执行中");
        assert_eq!(
            remote_status(&[json!({"status": "pending"}), json!({"status": "running"})]),
            "执行中"
        );
        assert_eq!(remote_status(&[json!({"status": "submitted"})]), "已投递，等待桌面执行");
        assert_eq!(remote_status(&[json!({"status": "pending"})]), "等待投递");
        assert_eq!(remote_status(&[json!({"status": "completed"})]), "空闲");
        assert_eq!(remote_status(&[]), "空闲");
    }

    #[test]
    fn events_filter_parse_and_sort_like_node() {
        let dir = temp_dir("events");
        let valid = |id: &str, time: &str, status: &str| {
            write(
                &dir.join(format!("events/{}.json", id)),
                &json!({"id": id, "time": time, "status": status, "project": "p", "summary": "s", "threadId": "t"})
                    .to_string(),
            );
        };
        let id = |n: usize| "a".repeat(63) + &n.to_string();
        valid(&id(2), "2026-11-09T10:00:00.000Z", "pending");
        valid(&id(1), "2026-11-09T09:00:00.000Z", "sent");
        valid(&id(3), "2026-11-09T11:00:00.000Z", "cancelled"); // 排除
        valid(&id(4), "2026-11-09T12:00:00.000Z", "sending");
        write(&dir.join("events/deadbeef.json"), "{}"); // 文件名不匹配
        write(&dir.join(format!("events/{}.json", "b".repeat(64))), "not-json"); // 损坏
        let list = events(&dir);
        assert_eq!(list.len(), 3, "cancelled/坏名/损坏 JSON 均排除");
        assert_eq!(list[0]["status"], "sent"); // 按 time 排序
        assert_eq!(list[2]["status"], "sending");
        let snapshot_counts = Snapshot {
            delivery: true,
            service_running: false,
            watching: false,
            bound: false,
            ready: false,
            paused: false,
            sent: list.iter().filter(|e| e["status"] == "sent").count(),
            pending: list.iter().filter(|e| e["status"] == "pending").count(),
            uncertain: list.iter().filter(|e| e["status"] == "sending" || e["status"] == "uncertain").count(),
            remote_enabled: true,
            remote_project: None,
            remote_thread_id: None,
            remote_status: "空闲",
            latest: None,
        };
        assert_eq!((snapshot_counts.sent, snapshot_counts.pending, snapshot_counts.uncertain), (1, 1, 1));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn defaults_match_node_when_files_missing_or_garbled() {
        let dir = temp_dir("defaults");
        // 全部文件缺失：delivery=true、remoteEnabled=true（node 版 catch {} 兜底）。
        let json = read_state(&dir, "runtime-settings.json");
        assert!(json.get("wechatDelivery") != Some(&Value::Bool(false)));
        assert!(
            read_state(&dir, "remote-settings.json").get("enabled") != Some(&Value::Bool(false))
        );
        write(&dir.join("runtime-settings.json"), "not json");
        assert!(
            read_state(&dir, "runtime-settings.json").get("wechatDelivery") != Some(&Value::Bool(false))
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_json_is_compact_camel_case() {
        let text = snapshot_json();
        assert!(text.starts_with('{') && !text.contains('\n'), "紧凑单行");
        assert!(text.contains("\"serviceRunning\""));
        assert!(text.contains("\"remoteThreadId\""));
        assert!(text.contains("\"remoteStatus\""));
    }

    #[test]
    fn events_dir_is_prepared_read_only() {
        let dir = temp_dir("prepare");
        events(&dir);
        assert!(dir.join("events").is_dir(), "events() 会像 node 版一样建目录");
        let mode = fs::metadata(dir.join("events")).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700, "目录权限 700");
        fs::remove_dir_all(&dir).ok();
    }
}
