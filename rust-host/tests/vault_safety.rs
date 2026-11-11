#![cfg(unix)]
use moss_host::Vault;
use std::fs;
use std::os::unix::fs::{symlink, PermissionsExt};
use std::path::PathBuf;
use std::sync::{Arc, Barrier};

struct Sandbox(PathBuf);
impl Sandbox {
    fn new(tag: &str) -> Self {
        let path = std::env::temp_dir().join(format!("moss-vault-{tag}-{}", std::process::id()));
        // Each test owns a unique path; never remove a pre-existing directory.
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Sandbox {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}

#[test]
fn missing_key_with_encrypted_artifacts_never_creates_a_replacement() {
    let dir = Sandbox::new("missing");
    for artifact in ["credentials.bin", "preferences.bin", "conversations.sqlite", "conversations.sqlite-wal", "history.json.sealed"] {
        let root = dir.0.join(artifact.replace('.', "-"));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(artifact), b"synthetic existing data").unwrap();
        assert!(Vault::open(&root).is_err(), "must refuse {artifact}");
        assert!(!root.join("master.key").exists());
        assert_eq!(fs::read(root.join(artifact)).unwrap(), b"synthetic existing data");
    }
}

#[test]
fn rejects_symlink_directory_and_invalid_key_without_touching_targets() {
    let dir = Sandbox::new("types");
    let root = dir.0.join("vault");
    fs::create_dir(&root).unwrap();
    let target = dir.0.join("outside");
    fs::write(&target, [7u8; 32]).unwrap();
    fs::set_permissions(&target, fs::Permissions::from_mode(0o644)).unwrap();
    symlink(&target, root.join("master.key")).unwrap();
    assert!(Vault::open(&root).is_err());
    assert_eq!(fs::read(&target).unwrap(), [7u8; 32]);
    assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o644);
    fs::remove_file(root.join("master.key")).unwrap();
    symlink(dir.0.join("absent"), root.join("master.key")).unwrap();
    assert!(Vault::open(&root).is_err());
    assert!(!dir.0.join("absent").exists(), "dangling symlink must not be followed on create");
    fs::remove_file(root.join("master.key")).unwrap();
    fs::create_dir(root.join("master.key")).unwrap();
    assert!(Vault::open(&root).is_err());
    fs::remove_dir(root.join("master.key")).unwrap();
    fs::write(root.join("master.key"), b"short").unwrap();
    assert!(Vault::open(&root).is_err());
    assert_eq!(fs::read(root.join("master.key")).unwrap(), b"short");
    let alias = dir.0.join("alias");
    symlink(&root, &alias).unwrap();
    assert!(Vault::open(&alias).is_err());
}

#[test]
fn new_vault_is_private_and_concurrent_initializers_share_one_key() {
    let dir = Sandbox::new("concurrent");
    let root = dir.0.join("vault");
    fs::create_dir(&root).unwrap();
    let barrier = Arc::new(Barrier::new(12));
    let workers: Vec<_> = (0..12).map(|_| {
        let root = root.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            barrier.wait();
            Vault::open(&root).unwrap().seal(b"fixture", "test").unwrap()
        })
    }).collect();
    let sealed: Vec<_> = workers.into_iter().map(|worker| worker.join().unwrap()).collect();
    let vault = Vault::open(&root).unwrap();
    for bytes in sealed {
        assert_eq!(vault.open_data(&bytes, "test").unwrap(), b"fixture");
    }
    let key_before = fs::read(root.join("master.key")).unwrap();
    assert_eq!(key_before.len(), 32);
    assert_eq!(fs::metadata(&root).unwrap().permissions().mode() & 0o777, 0o700);
    assert_eq!(fs::metadata(root.join("master.key")).unwrap().permissions().mode() & 0o777, 0o600);
    Vault::open(&root).unwrap();
    assert_eq!(fs::read(root.join("master.key")).unwrap(), key_before);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1, "temporary key files must be removed");
}
