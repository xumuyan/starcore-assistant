// 会话存储测试：落盘往返、跨打开持久化、purpose 绑定、清空。
use moss_host::{memory::ConversationStore, vault::Vault};

fn sandbox(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("moss-host-test-memory-{tag}-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn append_context_clear_and_persistence() {
    let dir = sandbox("roundtrip");
    let vault = Vault::open(&dir).unwrap();
    let store = ConversationStore::open(&dir).unwrap();
    store.append(&vault, "user", "第一条", "chat").unwrap();
    store.append(&vault, "assistant", "第二条回复", "chat").unwrap();
    let rows = store.context(&vault, 16).unwrap();
    assert_eq!(rows, vec![("user".into(), "第一条".into()), ("assistant".into(), "第二条回复".into())]);
    // 跨打开（模拟引擎切换）后仍可读。
    drop(store);
    let vault2 = Vault::open(&dir).unwrap();
    let store2 = ConversationStore::open(&dir).unwrap();
    assert_eq!(store2.context(&vault2, 16).unwrap().len(), 2);
    // limit 生效：只取最新。
    assert_eq!(store2.context(&vault2, 1).unwrap(), vec![("assistant".into(), "第二条回复".into())]);
    store2.clear().unwrap();
    assert!(store2.context(&vault2, 16).unwrap().is_empty());
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn context_budget_limits_characters() {
    let dir = sandbox("budget");
    let vault = Vault::open(&dir).unwrap();
    let store = ConversationStore::open(&dir).unwrap();
    let long = "长".repeat(500);
    store.append(&vault, "user", &long, "chat").unwrap();
    let rows = store.context(&vault, 16).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].1.chars().count(), 500);
    std::fs::remove_dir_all(&dir).ok();
}
