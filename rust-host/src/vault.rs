// moss-host 金库模块（Rust 阶段三 P3，第二模块）：与 src/assistant-vault.mjs 的 JRV1
// 加密格式逐字段对齐——魔数 JRV1 + 12 字节 IV + AES-256-GCM 密文 + 16 字节 AuthTag，
// AAD 固定 `jarvis/v1/{purpose}`。在 macOS/Unix 上先验证文件描述符再读取；
// 新密钥完整写入并同步后排他发布，已有密文缺密钥时拒绝启动，绝不自动重置。
use aes_gcm::aead::{Aead, AeadCore, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use std::path::Path;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};

pub const MAGIC: &[u8; 4] = b"JRV1";
const TAG_LEN: usize = 16;

pub struct Vault {
    key: [u8; 32],
}

fn aad(purpose: &str) -> Vec<u8> {
    format!("jarvis/v1/{purpose}").into_bytes()
}

impl Vault {
    /// 数据格式兼容 Node；仅真正的 NotFound 允许初始化，其他错误一律保留原状。
    pub fn open(root: &Path) -> Result<Self, String> {
        let dir = private_directory(root)?;
        let key = match read_key(&dir) {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                // 包括数据库及旧版封存文件；链接也算“已有数据”，不能因目标缺失而绕过。
                for name in ["credentials.bin", "preferences.bin", "conversations.sqlite",
                    "conversations.sqlite-wal", "conversations.sqlite-shm", "conversations.sqlite-journal",
                    "history.json.sealed", "settings.json.sealed", "backups"] {
                    if entry_exists(&dir, name).map_err(|_| "金库目录无法检查；未创建新密钥")? {
                        return Err("本地解密密钥缺失，请恢复原 master.key；未覆盖加密数据".into());
                    }
                }
                publish_key(&dir).map_err(|e| format!("master.key 初始化失败：{e}"))?;
                read_key(&dir).map_err(|e| format!("本地密钥读取失败：{e}"))?
            }
            Err(error) => return Err(format!("本地密钥读取失败：{error}")),
        };
        Ok(Self { key })
    }

    /// 测试与互操作用：以给定 32 字节密钥构造（绕过 master.key 文件）。
    pub fn with_key(key: [u8; 32]) -> Self { Self { key } }

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

// 本宿主目标为 macOS/Unix。描述符检查/修改权限避免先读再检查、按路径 chmod 的竞态。
// 和 Node 一样，这不是对同一 OS 账号恶意进程的隔离边界。
pub(crate) fn private_directory(path: &Path) -> Result<File, String> {
    std::fs::DirBuilder::new().recursive(true).mode(0o700).create(path)
        .map_err(|e| format!("金库目录创建失败：{e}"))?;
    let dir = OpenOptions::new().read(true).custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW).open(path)
        .map_err(|e| format!("金库目录打开失败：{e}"))?;
    let meta = dir.metadata().map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.uid() != unsafe { libc::getuid() } {
        return Err("金库目录状态异常".into());
    }
    dir.set_permissions(std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn open_at(dir: &File, name: &str, flags: i32) -> io::Result<File> {
    let name = std::ffi::CString::new(name)?;
    let fd = unsafe { libc::openat(dir.as_raw_fd(), name.as_ptr(), flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK, 0o600) };
    if fd < 0 { Err(io::Error::last_os_error()) } else { Ok(unsafe { File::from_raw_fd(fd) }) }
}

fn entry_exists(dir: &File, name: &str) -> io::Result<bool> {
    let name = std::ffi::CString::new(name)?;
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    let rc = unsafe { libc::fstatat(dir.as_raw_fd(), name.as_ptr(), stat.as_mut_ptr(), libc::AT_SYMLINK_NOFOLLOW) };
    if rc == 0 { return Ok(true); }
    let error = io::Error::last_os_error();
    if error.kind() == io::ErrorKind::NotFound { Ok(false) } else { Err(error) }
}

fn read_key(dir: &File) -> io::Result<[u8; 32]> {
    let file = open_at(dir, "master.key", libc::O_RDONLY)?;
    let meta = file.metadata()?;
    if !meta.is_file() || meta.uid() != unsafe { libc::getuid() } || meta.len() != 32 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "本地密钥文件状态或格式异常"));
    }
    file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    let mut bytes = Vec::with_capacity(33);
    file.take(33).read_to_end(&mut bytes)?;
    bytes.try_into().map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "本地密钥格式无效"))
}

fn publish_key(dir: &File) -> io::Result<()> {
    use rand_core::RngCore;
    let mut key = [0u8; 32];
    let mut suffix = [0u8; 16];
    rand_core::OsRng.try_fill_bytes(&mut key).map_err(|e| io::Error::other(e.to_string()))?;
    rand_core::OsRng.try_fill_bytes(&mut suffix).map_err(|e| io::Error::other(e.to_string()))?;
    let name = format!(".master.key-{:032x}.tmp", u128::from_ne_bytes(suffix));
    let mut file = open_at(dir, &name, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL)?;
    let temp = std::ffi::CString::new(name)?;
    let result = (|| {
        file.write_all(&key)?;
        file.sync_all()?;
        // linkat 不覆盖已存在目标；所有竞争者读取赢家的完整密钥，无半写入可见窗口。
        let target = c"master.key";
        let rc = unsafe { libc::linkat(dir.as_raw_fd(), temp.as_ptr(), dir.as_raw_fd(), target.as_ptr(), 0) };
        if rc != 0 {
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::AlreadyExists { return Err(error); }
        }
        Ok(())
    })();
    let removed = unsafe { libc::unlinkat(dir.as_raw_fd(), temp.as_ptr(), 0) };
    result?;
    if removed != 0 { return Err(io::Error::last_os_error()); }
    dir.sync_all()
}
