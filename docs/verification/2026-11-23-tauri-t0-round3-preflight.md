# SC-20261123-001 · macOS T0 第 3 轮制品及环境预检

**真实交互未验收。** 本轮只补[上轮复测](2026-11-22-tauri-t0-retest.md)的制品和环境门槛。D01～D02、P01～P08 和参考动效均未测；T0 仍未验收，T1 未启动。后续操作使用[手测单](2026-11-12-tauri-t0-manual.md)，不重新执行已记录的定位、350 ms 修复和历史专项。

## 基线及安装副本（只读）

- 2026-11-23 15:15 起（北京时间）；`git status`、工作区和暂存区 `git diff` 均确认开始时干净。`feat/global-dictation` 的初始 HEAD 为 `db426411e4e0dec75bd4e617a8108ab96b0a7826`（SC-20261122-001），相比本地远端跟踪引用 `3cab5c4dfbd31bfa2e7b287f0680d924847b6ece`（SC-20261117-003）领先 1、落后 0；两提交间只有文档和文档守护变更。核对 PLAN、操作日志及手测单，未找到可用于关闭门槛的新补验。`origin` 为 `https://github.com/xumuyan/starcore-assistant.git`；初次 `git ls-remote` 达到 25 秒工具时限，追加 HTTP 低速阈值的只读复核退出 128（8 秒未收到有效传输），随后以 15 秒低速阈值重试退出 0，实际远端返回 `3cab5c4dfbd31bfa2e7b287f0680d924847b6ece`，与当时跟踪引用相符。
- `/Applications/MOSS T0 Probe.app`：`plutil -extract CFBundleIdentifier raw` 和 `plutil -extract CFBundleExecutable raw` 各退出 0，分别读到 `dev.starcore.moss.t0-probe`、`moss-desktop-probe`。`stat` 和 `file` 退出 0，可执行路径 `/Applications/MOSS T0 Probe.app/Contents/MacOS/moss-desktop-probe` 为普通文件、Mach-O arm64。`shasum -a 256` 退出 0，SHA-256 为 `ac070b6066a83af9595c46092028ce21e03725ceaeab90eeba1368d6bee26b9c`；与上轮本地 release bundle 的二进制 `cmp -s` 退出 0。字节吻合不证明安装包整包一致，也没有把该哈希绑定到待测提交的可信构建记录。
- **安装副本整包未通过**：`codesign --verify --deep --strict --verbose=2` 退出 1：`code has no resources but signature indicates they must be present`。没有启动、重签、复制或覆盖安装副本，也未以裸二进制签名代替整包验证。

## 隔离构建记录

构建来源精确固定为 `3cab5c4dfbd31bfa2e7b287f0680d924847b6ece`（tree `9c855a0395fe7266bf2e707f514c60a8c0e35ccd`）；`git archive --format=tar` 后解包至临时 `src`，不复用任何旧 `target`、前端产物或本地 release。`source.tar` 的 SHA-256 为 `e98c1cf1d74b72977288eac42b4de13d9fdc58f0aa77f0aa54fa8f75f71c7cad`；`package-lock.json` 为 `b38e0da745042e292e39ff18dc7e52229fdddd06626d9904461c704932f4ac3d`；`desktop/src-tauri/Cargo.lock` 为 `9c8417a555d95804039a1aca1305d10df9e293367f8e75248dcb51991326a4ef`。

- 工具：Node `v22.22.0`、npm `10.9.4`、rustc/cargo `1.100.0`、Tauri CLI `2.12.4`、Xcode macOS SDK `27.0`，版本查询均退出 0。使用临时 HOME、TMPDIR、Cargo 缓存及目标目录；从已有工具缓存复制，不更改全局配置。`cargo metadata --locked --offline` 未限定平台时退出 101（缺其他目标依赖 `bit-set 0.11.1`）；限定 `--filter-platform aarch64-apple-darwin` 后退出 0，实际核对该图的 244 个 registry 归档 SHA-256 均与 `Cargo.lock` 相符。
- `npm ci --offline --no-audit --no-fund --ignore-scripts` 退出 1（`yargs-parser` 的镜像缓存未命中）。未下载；改为用 `ditto` 复制工作区已有 `node_modules` 到隔离源码。`npm ls --all` 退出 0，56 个已安装条目的包版本、缓存锁与仓库锁的 integrity 字段均吻合；复制前后 12,113 个文件和符号链接清单完全一致，清单 SHA-256 为 `110a555216a2f3bb0508ef603ea1969ce0a374c8f7785dc7136ba7588522c4a6`。这是既有依赖快照，不宣称离线从 npm 归档重装或逐包独立验证成功。
- 从隔离 `src/desktop` 运行 `../node_modules/.bin/tauri build --target aarch64-apple-darwin --bundles app --ci --no-sign -- --locked --offline`；设置 `CARGO_NET_OFFLINE=true`、`CARGO_TARGET_DIR` 为临时 `target`、`npm_config_offline=true`。先让 Tauri 产出 bundle，再单独检查其签名，不使用签名钥匙或公证服务。

### 隔离包整包通过（未安装、未启动）

- Tauri 构建退出 **0**（先运行同提交的合成前端构建，再生成一个 arm64 release `.app`）。`rust-objcopy` 缺 `libLLVM.dylib` 导致调试信息剥离告警，未阻止构建；`cmp -s` 在签名前确认包内二进制与本次 cargo release 二进制字节一致（退出 0）。
- 路径：`/private/tmp/moss-t0-round3.s2tJRQt1/target/aarch64-apple-darwin/release/bundle/macos/MOSS T0 Probe.app`；可执行相对路径 `Contents/MacOS/moss-desktop-probe`。`plutil` 读取 ID `dev.starcore.moss.t0-probe`、版本 `0.1.0`、可执行文件名，`file` 确认 Mach-O arm64，均退出 0。
- `--no-sign` 产物首次 `codesign --verify --deep --strict --verbose=2` 退出 1（资源未封签）。仅在这个新建临时包运行 `codesign --force --sign - "$app"`（退出 0）后，同样的**整包**严格校验退出 0（`valid on disk`、`satisfies its Designated Requirement`）。`codesign -dv --verbose=4` 退出 0：`Signature=adhoc`、`TeamIdentifier=not set`、Sealed Resources v2、CDHash `b8e61275387cd7be8925490c70183e43c96247ac`。不是 Developer ID 签名或公证。
- 签名后 `shasum -a 256` 退出 0：可执行文件 `0b82a5f5a60e0215d0720169853b63108989727d53611abd0b8d4247be258236`；`Info.plist` `57fe5e45b96283d857bdd1abc9928b0916c102391ac8d17b9a5ad3aecd82660f`；`_CodeSignature/CodeResources` `6bae7f38001fd81b6c66bc80e88cf161f33e87de446c4bda741025a85418deda`。
- 临时根目录 `/private/tmp/moss-t0-round3.s2tJRQt1` 权限 `0700`，本机保留 `source.tar`、`tauri-build.log`、`tauri-build.exit`、`bundle-verification.log` 和 `npm-dependency-inventory.jsonl` 供后续复核，不提交二进制或原始日志。临时文件若被系统清理，应重建并重新核验，不能退回安装副本或开发版充当同一制品。

## 会话与桌面安全门槛

`sw_vers` 退出 0：macOS 27.0.1（26A434）arm64；`launchctl managername` 退出 0：Aqua；进程 UID 与 `/dev/console` 所有者一致。`pgrep -x moss-desktop-probe` 退出 1（无匹配）；`osascript` 只读按独立 bundle ID 查询，进程数为 0；`AXIsProcessTrusted()` 对该调用上下文返回 `true`（不请求授权），CG 会话控制台、登录和锁屏标志未取到可用值。AX 信任不是受保护观察事务；当前工具接口没有能同时确认探针状态项、窗口与焦点的受保护桌面工具，且无法确认会话安全空闲。不枚举私人窗口、桌面内容或焦点对象；没有截图或发送输入。

后续先复核可追溯隔离包的签名与哈希；在能确认安全空闲和目标/焦点保护时，择一启动并核对 PID/路径，再测 P01/D01 的锚定、两个按钮及 350 ms 宽限之后的外点收起。开发版须独立记录，不能把本轮包验证写成开发版通过。未更改系统权限，未触碰沐言、旧服务或真实设置/运行数据。
