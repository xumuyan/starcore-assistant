// moss-host 金库模块（Rust 阶段三 P3，第二模块）：与 src/assistant-vault.mjs 的 JRV1
// 加密格式逐字段对齐——魔数 JRV1 + 12 字节 IV + AES-256-GCM 密文 + 16 字节 AuthTag，
// AAD 固定 `jarvis/v1/{purpose}`。master.key 读写与权限检查同 node 版（0600、拒符号链接、
// 拒非本用户属主）。互操作由 test/fixtures/vault-vectors.json 共享向量双向验证。
use aes_gcm::aead::{Aead, AeadCore, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use std::path::{Path, PathBuf};

pub const MAGIC: &[u8; 4] = b"JRV1";
const TAG_LEN: usize = 16;

pub struct Vault {
    #[allow(dead_code)]
    root: PathBuf,
    key: [u8; 32],
}

fn aad(purpose: &str) -> Vec<u8> {
    format!("jarvis/v1/{purpose}").into_bytes()
}

impl Vault {
    /// 打开或初始化金库：读 master.key（无则生成），权限语义与 node 版一致。
    pub fn open(root: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(root).map_err(|e| format!("金库目录创建失败：{e}"))?;
        set_dir_mode(root)?;
        let path = root.join("master.key");
        let key = match std::fs::read(&path) {
            Ok(bytes) => {
                let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
                if meta.file_type().is_symlink() { return Err("本地密钥文件状态异常".into()); }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                    if meta.uid() != unsafe { libc::getuid() } { return Err("本地密钥文件状态异常".into()); }
                }
                set_file_mode(&path)?;
                let key: [u8; 32] = bytes.try_into().map_err(|_| "本地密钥格式无效")?;
                key
            }
            Err(_) => {
                let mut key = [0u8; 32];
                use rand_core::RngCore;
                rand_core::OsRng.fill_bytes(&mut key);
                write_new(&path, &key)?;
                key
            }
        };
        Ok(Self { root: root.to_path_buf(), key })
    }

    /// 测试与互操作用：以给定 32 字节密钥构造（绕过 master.key 文件）。
    pub fn with_key(key: [u8; 32]) -> Self {
        Self { root: PathBuf::from("(with-key)"), key }
    }

    /// 与 node 版 seal 对齐：JRV1 || iv || ciphertext || tag。
    pub fn seal(&self, value: &[u8], purpose: &str) -> Result<Vec<u8>, String> {
        let cipher = Aes256Gcm::new((&self.key).into());
        let nonce = Aes256Gcm::generate_nonce(&mut aes_gcm::aead::OsRng);
        let ct = cipher
            .encrypt(Nonce::from_slice(&nonce), aes_gcm::aead::Payload { msg: value, aad: &aad(purpose) })
            .map_err(|_| "加密失败".to_string())?;
        let mut out = Vec::with_capacity(4 + 12 + ct.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ct); // ciphertext || tag（RustCrypto 拼接返回）
        Ok(out)
    }

    /// 与 node 版 open 对齐：校验魔数与长度，AAD 绑定 purpose，tag 不符即拒绝。
    pub fn open_data(&self, data: &[u8], purpose: &str) -> Result<Vec<u8>, String> {
        if data.len() < 4 + 12 + TAG_LEN || &data[..4] != MAGIC {
            return Err("加密数据格式无效".into());
        }
        let cipher = Aes256Gcm::new((&self.key).into());
        cipher
            .decrypt(Nonce::from_slice(&data[4..16]), aes_gcm::aead::Payload { msg: &data[16..], aad: &aad(purpose) })
            .map_err(|_| "加密数据校验失败；未覆盖原数据".to_string())
    }
}

#[cfg(unix)]
fn set_dir_mode(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())
}

#[cfg(unix)]
fn set_file_mode(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn set_dir_mode(_: &Path) -> Result<(), String> { Ok(()) }

#[cfg(not(unix))]
fn set_file_mode(_: &Path) -> Result<(), String> { Ok(()) }

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| format!("master.key 写入失败：{e}"))?;
    set_file_mode(path)
}
