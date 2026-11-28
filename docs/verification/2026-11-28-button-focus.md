# SC-20261128-003 按钮外圈修正

记录时间：2026-11-28 11:19:38 +08:00。用户截图可见历史页退出按钮外侧蓝色轮廓。源码退出按钮采用outline变体，且未重置WebKit默认焦点轮廓；静态截图不能独立区分系统焦点状态。

仅修改probe.css：限定probe-surface内按钮/开关，取消原生appearance、border、outline与box-shadow；去掉菜单行分隔线及旧focus-visible外圈。Tab焦点使用底色/下划线，开关增加滑块颜色反馈；forced-colors高对比模式保留Highlight轮廓。未调用blur、未移除Tab顺序，保留原生按钮激活、disabled及ARIA。整个面板Beam边缘、输入框焦点、共享beUI控件实现均未改。

专项9/9通过；新增测试守护作用域、无边框、替代焦点反馈和高对比例外。首次打包未带既有Rust环境失败，补齐进程级PATH、RUSTUP_TOOLCHAIN=1.100.0和TMPDIR后打包通过；没有放宽超时或修改全局环境。无Rust/Swift改动，未重复build:mac:check。完整回归结果见日志。

沿用用户对安装替换的授权，安装 /private/tmp/moss-t0-artifact-qSugjP 到 /Applications/MOSS T0 Probe.app。此包构建于本批未提交源码（dirty=true），清单保留真实源码摘要；不冒充最终提交构建。暂存及安装严格签名、二进制/整包摘要通过；旧PID 93672经精确路径复核后SIGTERM并查询消失，新启动PID 76294。非设置退出按钮验收。

- 二进制SHA256：084507f04c63e2455520ace88c39d6f6966d4a8843ba54ad4ebecbd294aff3ca
- 整包SHA256：05bc0fbfac7a779b0fd441a304e5cc0bde38c9a0b1f8a9e438c22bd652ec0861
- 旧探针备份：~/Library/Application Support/MOSS T0 Probe Backups/SC-20261128-003-CkZRBT/MOSS T0 Probe.app，备份摘要与替换前一致；同目录installation.json保留制品清单。

下一步实际观察普通点击与Tab切换时无蓝圈、键盘焦点清晰、Enter/Space仍可激活。未重新执行受阻的Chromium检查，未作真机修复通过声明；用户截图不作为仓库附件。旧沐言/配置/权限/服务未动。T0未验收，T1未启动。

## SC-20261128-004 去除焦点下划线

- 记录时间：2026-11-28 12:50:06 +08:00。用户明确反馈外圈没有了，附图可见“收音外观”下划线，来自SC003添加的text-decoration。只记外圈消失的用户反馈，不扩大到全页面/全部状态验收。
- 仅probe.css取消按钮及开关标签的焦点下划线，按钮常态显式text-decoration:none。保留底色/文字颜色与开关滑块颜色反馈、键盘语义和forced-colors例外；Beam/输入框/原命令不改。测试新增禁止underline/offset回归并守护开关反馈。
- 专项9/9、隔离打包与安装严格签名/整包摘要通过；完整回归见日志。未新增原生代码，不重复Mac原生构建；Chromium未重试，实际无下划线仍待用户验收。
- 新源包/private/tmp/moss-t0-artifact-cFNxMh，dirty=true；二进制SHA256 2c86cb6cde1923b20c2b7dff845e32dd741bb4de0846ca573b51d2f779808714，整包SHA256 f1d1b79f49b6096e95e3e92804ff6c0661f99534d958c2f4351559640f66e374。安装至/Applications/MOSS T0 Probe.app；旧包备份~/Library/Application Support/MOSS T0 Probe Backups/SC-20261128-004-3S93Rt/MOSS T0 Probe.app，备份摘要一致。
- 精确路径停止PID 76294后确认消失再替换；首次open失败（仅记录通用失败，具体状态未保留，不猜测原因）。复查无同路径进程后重试open退出0，成功查询新PID 98315。启动不是菜单/视觉验收。未动旧沐言、真实数据、权限或服务。
- 下一步检查设置按钮不再带线，Tab焦点仍可辨识、Enter/Space可操作。T0未验收，T1未启动。
