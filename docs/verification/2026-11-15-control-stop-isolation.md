# SC-20261115-006 stop 控制命令隔离修正

## 发现与范围

静态审查确认 Node `src/client-control.mjs` 与 Rust `rust-host/src/control.rs` 的 stop 入口硬编码 `/bin/launchctl`，绕过 start/status 已有的 `MOSS_LAUNCHCTL` 注入。旧 `test/rust-host.test.mjs` stop 对照仅替换 HOME；临时 HOME 不能隔离当前用户的 `gui/UID` launchd 域。撤回旧测试注释中“对未注册代理双方均为安全空操作”的无条件判断，历史影响未核实，不能再以此前临时目录记录证明真实代理未触及。

本轮不查询或恢复真实 LaunchAgents，不重启、不终止未知进程、不修改设备/权限/用户配置，不安装构建产物。这个独立隔离缺陷不是已证明的超时根因。

## 修改

- Node stop 使用已有 launchctl 变量；Rust run(stop) 使用已有 `launchctl_path()` 结果。未设置 `MOSS_LAUNCHCTL` 的生产默认仍为 `/bin/launchctl`，保持倒序停止、吞掉 bootout 失败、随后输出状态的行为。
- Node 新增 bootout 退出 0/1 两种路径，严格核对先 desktop-watch 后 notifier 的两次 bootout，以及随后两次 print；失败仍继续。
- Rust 控制单测严格对比完整日志，补失败仍停止第二项的测试。
- 宿主 stop 对照两边均显式注入假命令，不再假设临时 HOME 能隔离 launchd，同时核对完整调用日志和原字节级输出。
- 新增源码隔离守卫，检查 stop 注入、默认路径及双方测试注入，避免将测试重新指向真实 bootout。守卫不替代运行验证。
- 原 timeout、stdio、并发和业务断言不放宽，无重试兜底，无普通文件 stdio 替换。

## 实际验证

进程级 Node 22.22.0 与 `RUSTUP_TOOLCHAIN=1.100.0`，未修改 rustup 默认配置。

- `node --test test/control-isolation.test.mjs test/client-control.test.mjs`：7/7，0 skipped。
- `cargo test --manifest-path rust-host/Cargo.toml control::tests`：6/6，其他测试被名称筛选不算运行。
- `node --test test/rust-host.test.mjs`：8/8，0 skipped。
- `npm run build:mac:check`：通过，`APP_BUILT`，未安装应用。
- 首次 `npm test`：755/755，0 fail/cancelled/skipped，约29.8秒。新增文档检查后756项755通过/1失败，原因为当前标记白名单缺006；补齐后文档与隔离27/27，最终完整756/756，0 fail/cancelled/skipped，约29.2秒。

## 验收边界

本轮全绿不证明设备延迟已修复，不把历史 service/rust-state/native dictation 的不同失败合并归因，不把 stop 安全修正冒充整个环境修复。无需也没有执行自动重启或系统维护；stable 别名健康及 fmt/clippy 未验证。

SC021 整批仍未验收、T0 未验收、T1 未启动；G1～G6仍未验收。未新增浏览器、真实语音、物理热键、真实输入/剪贴板、托盘点击或多屏验收。本轮回归通过只解除此次回归失败阻塞，下一批继续离线组合，不跳过原生和真实服务门槛。
