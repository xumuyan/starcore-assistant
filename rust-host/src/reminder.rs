//! Completion events are a single-consumer queue (WeChat delivery remains off).
//! Match the Node watcher: consume history, skip disabled arrivals, coalesce fresh
//! turns, hold while busy, never write chat memory. No audio/network happens here.
use serde_json::Value;
use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::fs::{File, OpenOptions};
use std::io::{self, Read};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::PathBuf;
use std::time::{Duration, Instant};

const MAX_EVENT_BYTES: u64 = 64 * 1024;
const WAIT: Duration = Duration::from_secs(120);

#[derive(Debug, PartialEq)]
pub enum Action {
    Announce(Value),
    Dropped(Value),
}

pub struct CompletionReminder {
    files: EventFiles,
    seen: HashSet<String>,
    pending: Option<(Value, Instant)>,
}

impl CompletionReminder {
    pub fn new(directory: PathBuf) -> Self {
        let files = EventFiles(directory);
        let mut seen = HashSet::new();
        if let Ok(batch) = files.list() {
            for name in &batch.names {
                seen.insert(name.clone());
                batch.remove(name);
            }
        }
        Self { files, seen, pending: None }
    }

    pub fn disable(&mut self) { self.pending = None; }

    pub fn tick(&mut self, enabled: bool, busy: bool, now: Instant) -> Option<Action> {
        let mut fresh = Vec::new();
        if let Ok(batch) = self.files.list() {
            for name in &batch.names {
                if !self.seen.insert(name.clone()) { continue; }
                let event = if enabled { batch.read(name) } else { None };
                // Mark seen before best-effort unlink: deletion failure must not replay.
                batch.remove(name);
                if let Some(event) = event {
                    if event.get("id").and_then(Value::as_str) == name.strip_suffix(".json") {
                        fresh.push(event);
                    }
                }
            }
        }
        self.advance(fresh, enabled, busy, now)
    }

    fn advance(&mut self, mut fresh: Vec<Value>, enabled: bool, busy: bool, now: Instant) -> Option<Action> {
        // Disable is terminal even while busy (and configure clears it immediately).
        if !enabled { self.disable(); return None; }
        // Producer emits ISO UTC timestamps, so lexical and chronological order match.
        // Stable sort preserves filename order when times tie, like Node readdir/sort.
        fresh.sort_by(|a, b| field(a, "time").cmp(field(b, "time")));
        if let Some(newest) = fresh.pop() { self.pending = Some((newest, now)); }
        let (_, at) = self.pending.as_ref()?;
        if busy {
            if now.saturating_duration_since(*at) > WAIT {
                return self.pending.take().map(|(event, _)| Action::Dropped(event));
            }
            return None;
        }
        self.pending.take().map(|(event, _)| Action::Announce(event))
    }
}

fn field<'a>(event: &'a Value, name: &str) -> &'a str {
    event.get(name).and_then(Value::as_str).unwrap_or("")
}

pub fn project(event: &Value) -> &str {
    let name = field(event, "project").trim();
    if name.is_empty() { "未命名项目" } else { name }
}

pub fn speech(event: &Value) -> String { format!("{}的 Codex 本轮已结束", project(event)) }

pub fn summary(event: &Value) -> String {
    // Node uses slice(0, 200), measured in UTF-16 code units. A cut surrogate is
    // replaced for valid Rust/UTF-8 output, rather than emitting invalid Unicode.
    String::from_utf16_lossy(&field(event, "summary").encode_utf16().take(200).collect::<Vec<_>>())
}

fn is_event_name(name: &str) -> bool {
    name.len() == 69 && name.ends_with(".json") && name.as_bytes()[..64].iter().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
}

struct EventFiles(PathBuf);
struct Batch { directory: File, names: Vec<String> }

impl EventFiles {
    fn list(&self) -> io::Result<Batch> {
        // Do not follow a replaced/symlinked events directory or block on a FIFO.
        let directory = OpenOptions::new().read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
            .open(&self.0)?;
        if directory.metadata()?.uid() != unsafe { libc::geteuid() } {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "event directory owner"));
        }
        // Enumerate and operate on the same directory descriptor, not a reopened path.
        let fd = unsafe { libc::fcntl(directory.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 0) };
        if fd < 0 { return Err(io::Error::last_os_error()); }
        let stream = unsafe { libc::fdopendir(fd) };
        if stream.is_null() { unsafe { libc::close(fd); } return Err(io::Error::last_os_error()); }
        let mut names = Vec::new();
        loop {
            let entry = unsafe { libc::readdir(stream) };
            if entry.is_null() { break; }
            let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_string_lossy();
            if is_event_name(&name) { names.push(name.into_owned()); }
        }
        unsafe { libc::closedir(stream); }
        names.sort();
        Ok(Batch { directory, names })
    }
}

impl Batch {
    fn read(&self, name: &str) -> Option<Value> {
        let name = CString::new(name).ok()?;
        let fd = unsafe { libc::openat(self.directory.as_raw_fd(), name.as_ptr(), libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC) };
        if fd < 0 { return None; }
        let file = unsafe { File::from_raw_fd(fd) };
        let meta = file.metadata().ok()?;
        if !meta.is_file() || meta.uid() != unsafe { libc::geteuid() } || meta.len() > MAX_EVENT_BYTES { return None; }
        let mut bytes = Vec::new();
        file.take(MAX_EVENT_BYTES + 1).read_to_end(&mut bytes).ok()?;
        if bytes.len() as u64 > MAX_EVENT_BYTES { return None; }
        serde_json::from_slice(&bytes).ok()
    }

    fn remove(&self, name: &str) {
        if let Ok(name) = CString::new(name) {
            // No AT_REMOVEDIR: never recurse into or remove an unexpected directory.
            unsafe { libc::unlinkat(self.directory.as_raw_fd(), name.as_ptr(), 0); }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty() -> CompletionReminder {
        CompletionReminder { files: EventFiles(PathBuf::new()), seen: HashSet::new(), pending: None }
    }
    #[test]
    fn exact_wait_boundary_and_single_drop() {
        let mut watcher = empty(); let now = Instant::now(); let event = json!({"id":"synthetic"});
        assert_eq!(watcher.advance(vec![event.clone()], true, true, now), None);
        assert_eq!(watcher.advance(vec![], true, true, now + WAIT), None);
        assert_eq!(watcher.advance(vec![], true, true, now + WAIT + Duration::from_millis(1)), Some(Action::Dropped(event)));
        assert_eq!(watcher.advance(vec![], true, false, now + WAIT + Duration::from_secs(1)), None);
    }
    #[test]
    fn latest_batch_and_replacement_reset_wait() {
        let mut watcher = empty(); let now = Instant::now();
        let old = json!({"time":"2026-01-01T00:00:00.000Z"});
        let latest = json!({"time":"2026-01-02T00:00:00.000Z"});
        watcher.advance(vec![latest.clone(), old], true, true, now);
        assert_eq!(watcher.advance(vec![], true, false, now), Some(Action::Announce(latest.clone())));
        watcher.advance(vec![latest.clone()], true, true, now);
        watcher.advance(vec![latest.clone()], true, true, now + WAIT);
        assert_eq!(watcher.advance(vec![], true, true, now + WAIT + Duration::from_secs(1)), None);
        assert_eq!(watcher.advance(vec![], true, false, now + WAIT + Duration::from_secs(2)), Some(Action::Announce(latest)));
    }
    #[test]
    fn disabled_pending_never_reappears_even_if_busy() {
        let mut watcher = empty(); let now = Instant::now();
        watcher.advance(vec![json!({})], true, true, now);
        assert_eq!(watcher.advance(vec![], false, true, now + WAIT + Duration::from_secs(1)), None);
        assert_eq!(watcher.advance(vec![], true, false, now), None);
        watcher.advance(vec![json!({})], true, true, now);
        watcher.disable();
        assert_eq!(watcher.advance(vec![], true, false, now), None);
    }
    #[test]
    fn speech_and_namespace_are_bounded_and_honest() {
        assert_eq!(speech(&json!({"project":"  合成项目  "})), "合成项目的 Codex 本轮已结束");
        assert_eq!(speech(&json!({"project":" "})), "未命名项目的 Codex 本轮已结束");
        assert_eq!(summary(&json!({"summary":"😀".repeat(101)})), "😀".repeat(100));
        assert!(is_event_name(&format!("{}.json", "a".repeat(64))));
        for name in ["../bad.json".to_string(), format!("{}.json", "A".repeat(64)), format!("{}.json.tmp", "a".repeat(64))] { assert!(!is_event_name(&name)); }
    }
    #[test]
    fn deletion_failure_still_marks_seen() {
        // A directory named like an event cannot be unlinked as a regular file.
        use rand_core::RngCore;
        let nonce = rand_core::OsRng.next_u64();
        let dir = std::env::temp_dir().join(format!("moss-reminder-test-{}-{nonce}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut watcher = CompletionReminder::new(dir.clone());
        let name = format!("{}.json", "b".repeat(64));
        std::fs::create_dir(dir.join(&name)).unwrap();
        assert_eq!(watcher.tick(true, false, Instant::now()), None);
        assert!(watcher.seen.contains(&name));
        std::fs::remove_dir(dir.join(&name)).unwrap();
        std::fs::write(dir.join(&name), serde_json::to_vec(&json!({"id":"b".repeat(64)})).unwrap()).unwrap();
        assert_eq!(watcher.tick(true, false, Instant::now()), None);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
