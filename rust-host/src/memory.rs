// moss-host 会话存储模块（Rust 阶段三 P3，第三模块）：与 src/assistant-memory.mjs 共享
// 同一 conversations.sqlite（sealed_messages 密文行 + metadata），加密走 JRV1 金库格式，
// 数据格式互操作由沙箱测试验证，真实引擎切换留待 P4。旧明文 history.json/messages 表的迁移由
// node 版完成（rust 只读新格式，不重复迁移）。
use crate::vault::Vault;
use rusqlite::{Connection, OpenFlags};
use serde_json::json;
use std::path::Path;
use std::sync::Mutex;

pub struct ConversationStore {
    conn: Mutex<Connection>,
}

impl ConversationStore {
    pub fn open(root: &Path) -> Result<Self, String> {
        let _dir = crate::vault::private_directory(root)?;
        let path = root.join("conversations.sqlite");
        match std::fs::symlink_metadata(&path) {
            Ok(meta) => {
                use std::os::unix::fs::MetadataExt;
                if !meta.is_file() || meta.uid() != unsafe { libc::getuid() } {
                    return Err("会话库文件状态异常".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("会话库检查失败：{e}")),
        }
        // Rust 暂不迁移旧明文库：显式要求 Node 完成迁移，避免忽略旧消息。
        if std::fs::symlink_metadata(root.join("history.json")).is_ok() {
            return Err("检测到旧会话文件，请先使用 Node 引擎完成迁移".into());
        }
        let flags = OpenFlags::default() | OpenFlags::SQLITE_OPEN_NOFOLLOW;
        let conn = Connection::open_with_flags(&path, flags).map_err(|e| format!("会话库打开失败：{e}"))?;
        let legacy: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if legacy { return Err("检测到旧会话表，请先使用 Node 引擎完成迁移".into()); }
        conn.execute_batch(
            "PRAGMA secure_delete=ON;
             CREATE TABLE IF NOT EXISTS sealed_messages (id INTEGER PRIMARY KEY, data BLOB NOT NULL);
             CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);",
        ).map_err(|e| format!("会话库初始化失败：{e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
        }
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// 启动时逐行认证已有密文，不把解密失败当成空历史。
    pub fn validate(&self, vault: &Vault) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id,data FROM sealed_messages").map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: i64 = row.get(0).map_err(|e| e.to_string())?;
            let data: Vec<u8> = row.get(1).map_err(|e| e.to_string())?;
            let plain = vault.open_data(&data, &format!("message/{id}"))?;
            let value: serde_json::Value = serde_json::from_slice(&plain).map_err(|_| "会话记录格式异常")?;
            if !matches!(value["role"].as_str(), Some("user" | "assistant")) || !value["content"].is_string() {
                return Err("会话记录格式异常".into());
            }
        }
        Ok(())
    }

    /// 与 node 版 append 对齐：单事务「预留 id + 加密回填」，purpose=message/{id}。
    pub fn append(&self, vault: &Vault, role: &str, content: &str, source: &str) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO sealed_messages(data) VALUES (?1)", [vec![0u8; 0].as_slice()]).map_err(|e| e.to_string())?;
        let id = tx.last_insert_rowid();
        let row = json!({ "role": role, "content": content, "time": crate::serve::utc_now_rfc3339(), "source": source });
        let sealed = vault.seal(row.to_string().as_bytes(), &format!("message/{id}"))?;
        tx.execute("UPDATE sealed_messages SET data=?1 WHERE id=?2", rusqlite::params![sealed, id]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 与 node 版 context(limit) 对齐：最新 limit 条，按时间正序返回 (role, content)。
    pub fn context(&self, vault: &Vault, limit: usize) -> Result<Vec<(String, String)>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, data FROM sealed_messages WHERE id > (SELECT COALESCE(MAX(id),0) FROM sealed_messages) - 200 ORDER BY id DESC LIMIT ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([limit as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?))).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let (id, data) = row.map_err(|e| e.to_string())?;
            let plain = vault.open_data(&data, &format!("message/{id}"))?;
            let value: serde_json::Value = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
            let role = value.get("role").and_then(serde_json::Value::as_str).unwrap_or("user").to_string();
            let content = value.get("content").and_then(serde_json::Value::as_str).unwrap_or("").to_string();
            result.push((role, content));
        }
        result.reverse();
        Ok(result)
    }

    /// 与 node 版 clear 对齐：清空密文行并 VACUUM。
    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sealed_messages", []).map_err(|e| e.to_string())?;
        conn.execute("VACUUM", []).map_err(|e| e.to_string())?;
        Ok(())
    }
}
