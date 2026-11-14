# 星核助理操作日志

时间口径：北京时间 `Asia/Shanghai`（UTC+08:00）。补记的历史 Git 时间仅代表提交时间。日志只保留改动、难题、解决方式和验证摘要，不记录凭据、私人输入正文或原始抓包载荷。

## SC-20261112-009 记录单次受保护观察与一页手工验收交接

- 北京时间：2026-11-12 16:37:24 +08:00（桌面观察清理、文档专项和完整回归后现场读取，不冒充每项动作精确时刻）。
- 修改或新增：只改文档和文档测试；新增 docs/verification/2026-11-12-tauri-t0-manual.md，提供普通诊断 D01～D02、默认目标 P01～P08 的操作/通过标准、风险提示、开发进程退出、一次回复模板与反馈后的下一步；同步 README、T0 验证记录和 PLAN。所有手工结果为未测、待用户反馈，T0 仍未验收、T1 未启动。
- 遇到的难题：复用最新 debug 二进制复制到已有临时 bundle，cmp 核对一致后显式启动 --diagnostic-controls；只读权限允许且两显示器。工具窗口列表可见 280×140 diagnostic chooser，但首次单窗截图即报告“截图期间焦点发生变化”，事务自动结束，无法取得输入 observationId。自动验收依旧不可推进。
- 处理方式：按本次预告只尝试一次，未发送点击或键盘输入、未抢回焦点/重试或改用其他注入途径。取消返回事务已结束；仅定向 SIGTERM 该临时 bundle 测试进程（系统将 /tmp 解析为 /private/tmp，首次精确路径匹配未找到进程，按只读进程实际路径核对后定向清理），再次检查无残留。没有读取/提交私人桌面截图或原始运行数据；未修改已安装应用、真实配置/历史、权限或系统快捷键。清理不冒充界面退出功能验收。整理手工清单，不再用合成测试替代物理操作。
- 验证结果：新增手工交接文档守护，检查所有编号初始未测、诊断/默认模式分离、最小风险、CLI 清理、反馈与下一步和本地链接/隐私；文档专项 17/17、完整 npm test 279/279，0 失败/跳过，git diff --check 通过；新清单逐项人工核对无预填通过。没有修改原生代码，未重新运行两类构建，不将上一批构建结果记为本批新结果；没有取得本批单窗截图或业务功能验收证据。
- 遗留问题：T0 所有未完成实际交互、精确视觉和跨平台项目维持未勾选；下一步用户按清单反馈，失败先复现修复，必要门槛和精确视觉齐全后进入 T1 受限业务 IPC/sidecar/单实例单消费者。没有为等待手工验收越过依赖接真实语音/聊天或数据服务。历史 service 偶发超时本轮未复现，根因仍未定位。后续每批完成主动报告完成/未通过/下一步及是否需用户操作。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261112-009] hand off mode-separated T0 manual acceptance`；上一批 SC-20261112-008 已知提交 61f78a9cd4d3428b8b811030d118fbad7056ebc6；提交前 fetch 核对当前 feat/global-dictation 与 origin 差异 0/0，本批普通 push 后核对远端，不预写推送成功。

## SC-20261112-008 增加并实际运行原生合成 IPC 自检

- 北京时间：2026-11-12 16:17:42 +08:00（专项、完整回归、原生自检重复执行和两类构建后现场读取）。
- 修改或新增：新增显式 --self-check、四个后端受启动参数/真实调用窗口身份限制的自检命令、顺序检查状态与 20 秒 watchdog；四窗本地订阅/snapshot 就绪后，由 chooser 驱动既有合成命令并由 overlay 在 React 提交后确认自身 DOM/Canvas 和隐藏卸载。新增 desktop/check-native.mjs 与 check:desktop:native，runner 要求九点顺序、成功标记和退出码 0，30 秒/64 KiB 上限，不打印原始进程日志。新增 Rust/Node 测试与生成 ACL，更新 README、PLAN、迁移规格和验证记录。正常启动不运行自检，自检帮助命令默认拒绝；不可混用普通诊断窗口/show-chooser。旧客户端入口、安装、真实配置/加密历史与权限未改变。
- 遇到的难题：首轮实际 WKWebView 已通过 Boot 至 Dictation，但 Hidden 检查失败；渲染确认放在 requestAnimationFrame，隐藏 WebView 可能暂停动画帧，无法据此等待卸载。首次新增静态测试忽略 cargo fmt 对条件换行，导致断言不匹配。必须区分实际原生 IPC 成功和仍被桌面焦点保护阻止的点击/输入验收。
- 处理方式：改为 React useEffect 在 DOM 提交后检查自身组件与 Canvas，隐藏必须确认节点已卸载；增加不依赖动画帧的测试，未延长超时或跳过隐藏检查。静态条件检查允许格式化换行后重跑。以实际 Tauri 注入窗口身份限制确认/结束权限，拒绝非法枚举与 chooser 冒充 overlay；检查点不得跳过/重复/提前完成。只显式运行合成集成路径，不注入键盘/鼠标、不操作外部输入框、不绕过桌面安全检查；不启用测试热键、不注册右 Ctrl、不申请权限/调用服务。
- 验证结果：最终组件/壳/自检/文档专项 29/29；完整 npm test 278/278、0 失败、0 跳过；Rust 测试 6/6，cargo fmt --check 与 cargo clippy --all-targets --locked -- -D warnings 通过；npm run build:desktop:check 与 npm run build:mac:check 通过（后者 RUST_HOST_READY / APP_BUILT，仅检查未安装）；git diff --check 通过。最终实际原生 runner 连续 3 次均九点齐全、T0_SELF_CHECK PASS、退出码 0；--self-check 与两个互斥参数分别以退出码 2 拒绝。原生检查覆盖四窗初始化/隐藏、真实 IPC 参数和调用身份拒绝、历史/设置显隐、四种合成状态事件→React DOM/Canvas、隐藏卸载和 Esc 插件注册表释放；进程已退出并核对无 probe 残留。证据为固定无私人内容标签，见 docs/verification/2026-11-12-tauri-t0.md；未提交桌面截图/原始运行载荷。
- 遗留问题：T0 仍未验收：本次没有物理按钮点击、输入框键入、外部焦点保持/穿透、物理热键和冲突/Esc 派发、启用热键后的手工退出清理、全屏/多屏/Spaces/睡眠恢复或精确视觉验收。Esc 插件注册表不等于 OS 输入行为已证明，合成 Canvas 存在不证明像素/GPU/帧率。稳定桌面焦点环境或手工反馈仍是解除条件；Windows、签名/许可审计、参考动效差异和历史 service 偶发超时根因保持原状态，本次未复现 service 超时。T1～T4 未推进，未接真实语音/模型/微信或数据宿主。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261112-008] verify synthetic IPC in native Tauri WebViews`。上批 SC-20261112-007 已知提交为 1f09bcf7a791f28ec06cf9500cc1e304ea224b3b；提交前 fetch 核对 feat/global-dictation 与 origin 无领先/落后，本批普通 push 后核对远端，不预写线上成功。

## SC-20261112-007 增加显式普通控制窗口诊断模式

- 北京时间：2026-11-12 15:58:30 +08:00（专项、完整回归、两类构建完成后现场读取）。
- 修改或新增：仅隔离 T0 probe 增加 --diagnostic-controls 参数、内存 ControlMode 与对应 Rust/静态测试；显式启用时三个控制页使用普通层、不透明、带标题栏窗口及 macOS Regular 激活策略，标题标记 diagnostic 并预留额外标题栏空间。默认 accessory 隐藏启动、透明置顶控制页和 overlay 非聚焦/穿透配置不变。更新 README、PLAN、T0 验证记录、手工验收步骤及文档守护；未修改产品入口、已安装应用、权限或真实数据。
- 遇到的难题：系统 CoreGraphics 只读查询能看到默认 chooser（浮动层 layer 5、alpha 1、共享可见），桌面工具却列出 0 个窗口；不足以确认其过滤原因。普通诊断窗口可列出，但输入仍会因焦点变化中止。首次诊断构建因 setup 闭包借用 controls 不满足静态生命周期失败；新文档测试要求的未完成措辞与 README 原句不一致。
- 处理方式：以显式普通控制窗口模式提高可观测性，不放宽 overlay、不绕过桌面焦点保护或另用输入注入。setup 改为 move 闭包后构建通过；明确 README 的 T0 仍未完成措辞，重跑测试。正常工具激活后观察单窗截图与 Tab 按钮焦点，后续受控动作失败即停止，不认定 IPC 成功。补充逐项手工验收及诊断/默认模式证据分离要求，测试进程已关闭并核对无残留；未安装临时 bundle 或创建长期启动项。
- 验证结果：最终组件/壳/文档专项 22/22；完整 npm test 271/271、0 失败、0 跳过；Rust 测试 3/3，cargo fmt --check 通过；npm run build:desktop:check debug 构建通过；npm run build:mac:check 通过（RUST_HOST_READY / APP_BUILT，仅检查未安装）；git diff --check 通过。原生有限观察为默认 chooser 确实在屏、诊断窗口可列出/截图、Tab 焦点环；不是按钮点击、输入框、IPC 或热键验收。最后的标题标记/空间调整仅构建测试，未声称现场布局验收。无真实录音、模型、微信、配置/历史访问或付费调用。详情见 docs/verification/2026-11-12-tauri-t0.md。
- 遗留问题：T0 仍未验收；焦点无法稳定确认的阻碍仅部分缓解，页面切换、IPC、输入框、热键/Esc、穿透、外部焦点、全屏/多屏/Spaces/睡眠恢复与正常退出清理仍需稳定环境或用户手工反馈。layer 5 非工具故障的已证实唯一原因；普通窗口不替代目标透明置顶控制页验收。Windows、签名公证、完整原生许可、参考动效差异和历史 service 偶发超时根因保持原状态；本次完整回归未复现 service 超时。T1 及真实服务接线未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261112-007] add opt-in diagnostic control windows for T0`。上批 SC-20261112-006 已知提交为 1283f062a03421dba0b8178d4844d18aaff33376；提交前 fetch 核对 feat/global-dictation 与 origin 无领先/落后，本批普通 push 后核对远端，不预写线上成功。

## SC-20261112-006 建立隔离 Tauri 2 可行性验证壳

- 北京时间：2026-11-12 15:14:35 +08:00（最终专项、完整回归、两类构建与进程清理后现场读取）。
- 修改或新增：新增 desktop/src-tauri，锁定 Tauri 2.12.5、tauri-build 2.7.4、global-shortcut 2.4.1，npm CLI/API 2.12.4；新增合成 React probe 页面、隐藏透明置顶窗口、独立菜单栏图标与两步按钮组、临时默认关闭测试热键、可见期间 Esc 和退出；六个枚举/布尔参数命令纳入 AppManifest ACL，无通用 Shell/FS/HTTP 插件。接入既有四个原组件与 API MIT 通知，新增 Rust/Node 测试、T0 验证记录，同步 PLAN、架构设计、桌面 README、许可清单和构建脚本。旧产品入口与运行数据不变，未替换已安装应用。
- 遇到的难题：Cargo 直接 check 未合并 macOS 配置导致 feature 校验失败；首次 CLI 编译缺默认图标。透明 WKWebView 要求 macos-private-api，不能承诺 App Store 兼容。直接 shell 子进程未在工具会话间持续，临时 bundle 启动后区域可见按钮组，但窗口未在桌面工具列表中出现，不能稳定确认窗口/焦点。新增测试首次发现鼠标穿透声明漏接。
- 处理方式：CLI 自动合并平台配置，独立 Cargo 测试显式传 TAURI_CONFIG；添加原创简单 RGBA 图标。明确私有 API 和分发审计未验收；临时目录 bundle 仅用于本机观察，不安装/公证。桌面工具停止无法确认焦点的点击后不绕过保护、不使用额外输入注入；补接 set_ignore_cursor_events 后重跑测试与构建。热键不注册右 Ctrl、不持久化、不录音，测试后关闭临时进程并核对无残留。
- 验证结果：组件/壳/文档专项 20/20；完整 npm test 269/269、0 失败、0 跳过；Rust 状态测试 2/2，cargo fmt --check 通过；npm run build:desktop:check 最终 debug 构建通过；npm run build:mac:check 通过（RUST_HOST_READY / APP_BUILT，仅 dist 检查构建未安装）；git diff --check 通过。区域截图观察到原生按钮组与透明留白，仅证明该画面显示，不证明入口点击或非激活行为；最终鼠标穿透修改后仅构建/测试，未新增桌面行为验收。未调用真实模型、微信、麦克风/声音，不读取真实历史、凭据或配置；未修改系统权限。证据见 docs/verification/2026-11-12-tauri-t0.md。
- 遗留问题：T0 保持未勾选：托盘实际点击、IPC 端到端、键盘输入/非激活焦点、热键/Esc、全屏/多屏/Spaces、退出资源行为仍需可确认窗口/焦点的环境或用户手工验收；Windows 工具链/WebView2、签名公证、完整原生许可证分发审计未完成。T1 sidecar/业务 IPC/单实例与数据单消费者均未实现，不能以合成命令替代。参考 Pro 动效/精确视觉差异、既有 service 偶发超时根因继续保留，本批未复现超时。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261112-006] add isolated Tauri 2 feasibility probe`。上批 SC-20261112-005 为 631adca；提交前 fetch 核对 feat/global-dictation 与 origin 无领先/落后，本批完成后普通 push 并核对远端，不预写线上成功。

## SC-20261112-005 直接集成 Libraries.dev 原始前端组件

- 北京时间：2026-11-12 14:35:50 +08:00（专项、离线构建、浏览器检查和完整回归后现场读取）。
- 修改或新增：延续上次中断留下的 package.json/package-lock.json 改动，核对已安装依赖与四个参考页后，新增 desktop/frontend React 隔离预览、状态/电平适配、中文分词淡入、构建脚本及专项测试。直接引用 voice-ring@0.2.0、border-beam@1.4.1、voice-glow@0.3.0、既有 thinking-orbs@0.3.2；React/React DOM 固定 19.2.0。保留上游 MIT 文本，离线产物包含所有运行时许可；同步 PLAN、两份设计和文档测试。旧客户端、构建入口、已安装应用和真实数据未改变。
- 遇到的难题：参考页 voice 示例写有 processing 属性，但 npm 0.3.0 类型和实现不支持；README 标注扫动处理态为 Libraries Pro hook。voice 本身提供底部声音光效而非文字入场。恢复后的 shell PATH 没有 Node。中文分词后，原安全测试错误地假设转义标签仍处于单个 span 中。
- 处理方式：检查实际包接口后移除无效 processing prop，不复制 Pro hook，听写处理态用原版 orbs；文字淡入作为本地补充明确标注未逐像素验收。前端不自行获取麦克风，电平由未来宿主提供，预览仅手动模拟；隐藏直接卸载动画，CSP 禁止网络连接。命令显式使用已有 Node v22.22.0 和 Cargo PATH，不重装依赖；安全测试重组各 span 的转义文本验证，未放宽脚本注入检查。
- 验证结果：首次恢复后裸 node 命令因 PATH 缺失未运行；路径修正后组件专项通过。中文分词调整后一轮专项出现断言失败，修正测试后最终组件+文档专项 16/16；npm run build:desktop:preview 通过；隔离临时 Chromium 本地页面状态切换/中文/原组件 DOM/Esc 卸载通过，零外部请求、零控制台错误；观察合成对话与听写截图，无私人数据，截图仅在临时目录。最终 npm test 265/265、0 失败、0 跳过；git diff --check 通过。未修改原生源码，未运行 build:mac:check；未构建/安装 Tauri，未做 WKWebView/WebView2、全局热键、真人语音、透明非激活、多屏全屏或逐帧参考对照验收。
- 遗留问题：本批仅完成参考组件预备，不勾选 T0～T4 或 B1～B8；下一批先做 T0 最小 Tauri 壳及窗口焦点/托盘/热键可行性，再做受限 IPC 和业务接线。voice Pro 扫动处理态不在本次许可与实现内；不能将本地文字入场或 Chromium 冒烟结果写成参考效果已完全还原。上一批 service 偶发超时根因仍未解决，本批完整回归未复现。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261112-005] integrate upstream voice effects in isolated preview`。上批 SC-20261112-004 为 1ac026f6211615e13c4a4dfa06d7bf004488b067；提交前 fetch 核对 feat/global-dictation 与 origin 无领先/落后，本批提交后普通 push 并核对远端，不预写成功。

## SC-20261112-004 确定 Tauri 2 + Rust 与 Windows 适配目标

- 北京时间：2026-11-12 13:29:25 +08:00（专项和完整回归复跑后现场读取）。
- 修改或新增：仅架构文档、PLAN、界面设计与文档测试。新增 Tauri 2 + Rust 迁移决策，确认 macOS 先迁移、Windows 纳入架构约束；定义共享视觉/Rust 业务层与平台适配层，Node.js 受管 sidecar 过渡、数据单写入者/消费者、最小 IPC 权限、分平台构建和真机验收。T0～T4 均未勾选；B1/B4 不再以新增 Swift 专用界面实现，B8 分平台验收。PLAN 顶部旧安装版本表述改为当前架构现状，未重新核实安装版本。
- 遇到的难题：Tauri 壳本身不能解决左右热键、非激活透明置顶、录音与输入框写入的系统差异；Rust 宿主含 Unix 专用实现且 ASR/听写未补齐。首次完整回归的既有 service 测试 20 秒超时，原因未定位，不能隐藏该次失败。
- 处理方式：迁移前先做平台关键能力验证，原生插件限制在适配层；保留现有 Swift/Node 链路与回滚能力，未切换当前应用。检查 service 测试使用隔离目录及本地 HTTP mock，独立复跑 1/1（约 6.4 秒）通过，未修改超时或产品代码；随后完整回归复跑通过，不把推测负载原因写为已确认。
- 验证结果：文档专项 13/13；首次完整回归含 service 超时失败，最终 npm test 262/262、0 失败、0 跳过；git diff --check 通过。人工核对选型与未来 Windows 要求已写入设计、依赖顺序与未验收边界。未涉及原生源码，未安装依赖、未构建 Tauri 或原生包、未安装/变更权限与运行数据。
- 遗留问题：Tauri 工程与 T0～T4 尚未实施，Windows 构建和真机验收均未完成；透明窗口分发限制、目标 Windows 版本/CPU 架构、原生 ASR 依赖、签名与更新机制需实施核查。service 首次超时未定位，后续若复现需独立处理，不能把本次复跑通过当作已修复。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261112-004] adopt Tauri 2 and Rust migration plan`。上批 SC-20261112-003 为27325cd；提交前 fetch 核对 feat/global-dictation 与 origin 无领先/落后，本批提交后普通 push 并核对远端，不预写成功。

## SC-20261112-003 确认参考站还原、浏览器范围与历史/设置菜单

- 北京时间：2026-11-12 13:14:04 +08:00（测试后现场读取）。
- 修改或新增：仅更新重制设计、PLAN 与文档测试。确认视觉完全照参考站，不混用现有 MOSS 风格；语音操作第一期只支持浏览器及打开网址，未指定时使用系统默认浏览器，不修改默认应用；菜单栏图标点击先显示「历史记录 / 设置」按钮组，选择后再打开对应 beam 置顶窗口，沿用加密历史数据和设置保存链路。B5/B7 范围同步，全部实施批次仍未勾选。
- 遇到的难题：上一版文档仍写点击图标直接打开设置、应用范围不明确；新增检查首次未识别「既有加密聊天记录」的同义表述。参考站状态与许可尚未实际核查，不能声称已还原。
- 处理方式：替换旧入口和范围表述，检查双步骤入口、完整视觉目标、浏览器限定、默认浏览器、HTTP/HTTPS 与历史数据保留；修正测试匹配现有明确措辞。参考站核查和视觉对照留给实施批次，不变更现有运行配置或权限。
- 验证结果：文档专项 12/12；完整 npm test 261/261，0 失败、0 跳过；git diff --check 通过。人工核对设计与本轮三项确认一致；未涉及原生源码，未构建、未安装或做真机功能验收。
- 遗留问题：B1～B8 未实施；参考站各状态观察、许可核查、视觉还原、浏览器指令及历史/设置真实交互均未验收。本批只确认设计，不代表界面功能完成。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261112-003] confirm reference visuals and history settings menu`。上批 SC-20261112-002 为361ed63；提交前 fetch 核对当前 feat/global-dictation 与 origin 无领先/落后，提交后普通 push 并独立核对远端。

## SC-20261112-001 登记单页语音助理界面重制方向

- 北京时间：2026-11-12 13:05:00 +08:00（现场读取）。
- 修改或新增：仅文档。PLAN.md 新增"单页语音助理界面重制"章节，登记用户批准的方向：删除现有全屏页面，待唤醒常驻监听无界面；唤醒后 voice-ring 收音、beam 框、voice 文字浮现、思考态 voice-ring、回复文字同框显示；"退下/退出"隐藏全部浮层回到监听；按键说话用 voice 长条框 + orbs 思考效果，Esc 取消，功能不变仅换呈现；菜单栏图标打开 beam 设置框；Codex 项目面板砍掉，完成弹框保留且默认直接开启。不改动任何代码、样式或运行数据。
- 遇到的难题：无。
- 处理方式：方向原文逐条转写为 PLAN 待实施范围，标注未拆批次、未写代码、未验收；实施时按仓库规则逐批补测试与日志。
- 验证结果：`test/project-docs.test.mjs` 文档守护 9/9 通过；`git diff --check` 通过。未涉及代码与构建。
- 遗留问题：本批仅登记方向，不代表任何界面功能已实现或验收；具体批次拆分、视觉细节（各效果的参数与状态映射）待实施时与用户确认。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261112-001] register single-page voice assistant UI redesign direction`；最终哈希按 Change-ID 查询。

## SC-20261112-002 重制方案落成设计与批次拆分

- 北京时间：2026-11-12 13:03:13 +08:00。
- 修改或新增：仅文档与文档测试。新增 docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md，把用户本轮口述的完整方案固化为状态机与 B1～B8 批次拆分，并登记新补充点：语音指令打开本机应用并进入网址（独立批次、默认关闭、白名单边界），Codex 项目面板砍掉但完成弹框保留、去掉开关默认直接开启并改为 beam 样式置顶。PLAN 重制章节改为引用设计并新增 8 个未勾选批次项；test/project-docs.test.mjs 新增设计守护检查（状态映射、批次完整、勾选必须带证据）并把新设计文档纳入链接/隐私扫描。
- 遇到的难题：用户描述的四个 libraries.dev 效果只能作视觉参考，不能在线加载；语音打开应用的意图与安全边界若不加约束会变成任意命令执行。
- 处理方式：设计中明确效果离线复刻、不联网；语音指令限定“打开应用+打开网址”，默认关闭，白名单先行；全部批次保持未勾选，不预写任何验收结论。
- 验证结果：npm test 260/260、0 跳过，含新增重制守护检查；git diff --check 通过。未写任何界面代码，未构建、未安装。
- 遗留问题：B1～B8 全部未实施；voice-ring/beam/voice/orbs 的具体动画参数、语音指令白名单应用清单、旧全屏页下线后历史聊天记录是否需要入口，待实施批次中与用户确认。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261112-002] split voice-first UI redesign into batches`；上批 SC-20261112-001 提交042f9c8已推送，本批提交后普通 push 并核对远端。

## SC-20261111-008 Rust Fish Audio 合成接入与完成提醒 Fish 播报


- 北京时间：2026-11-12 12:33:48 +08:00（本批专项测试、完整回归、原生构建与 release 沙箱复验后现场读取）。
- 修改或新增：页面/样式、版本、默认 Node 与已安装副本不变；无新增依赖。新增 `rust-host/src/fish.rs`：端点、Bearer/model 头、`{text, format, reference_id}` 请求体、45 秒超时、20 MiB 上限、RFC 4648 base64 编码均对齐 Node `assistant-service.mjs` speak；`MOSS_FISH_URL`/`MOSS_FISH_TIMEOUT_MS` 仅作沙箱覆盖，生产默认不变。`chat.rs` 完成路径重构：文本提交后按 speak/voice 决定系统声音或 Fish，Fish 任务在锁外由独立线程执行，播放占用在合成前登记（与降级路径同一 gate），结果回锁内按 playback 编号和 generation 归属复核后发 `play` 或降级 `speak`，取消/clear/sleep/configure/新 text 使在途合成结果静默丢弃；合成期间聊天保持占用（与 Node busy 语义一致），完成提醒在 Fish 播放结束后才播报，`reminder_tick` 改为锁外派发合成。缺 Fish Key 诚实降级并提示，不发起请求。新增 9 场景宿主沙箱 `test/rust-fish.test.mjs`（合成播放与确认释放、fishModel/voiceId 请求字段、HTTP 500/空/超限降级精确文案、缺 Key 不请求、取消静默、打断后可继续、提醒等待合成、超时降级释放、合成期间听写拒绝）与 3 项 Rust 单测（base64 RFC 4648 向量含中文多字节、生产默认值不被覆盖泄漏、合成归属随失效/换播放失效）。更新 PLAN 剩余模块分项。
- 遇到的难题：测试 harness 一次只持有一个 Fish mock 处理器，取消/打断后的重试请求仍被挂起处理器拦住导致超时；首轮实现把 configure 的 idle 状态计入断言序列；测试编写的 base64 中文向量与 RFC/Node 实际值不符。
- 处理方式：重试前恢复默认 fish 响应器并核对 mock URL 精确区分 `/v1/responses` 与 Fish；状态断言改为仅检查发送 text 之后的事件；以 Node `Buffer.toString('base64')` 实测值修正测试向量。实现遵循测试先行：修正后旧实现基线 1/9，实现后 9/9。
- 验证结果：相关 `test/rust-fish.test.mjs` 9/9；最终 `npm test` 259/259、0 跳过；`cargo test` 34/34（27 lib、2 memory、2 interop、3 safety）、`cargo test --release` 通过；`cargo clippy --all-targets -- -D warnings` 与 `git diff --check` 通过。`npm run build:mac:check` 通过（RUST_HOST_READY / APP_BUILT，未安装，strict 签名通过）。实际 release 二进制生命周期沙箱 25/25。全部宿主测试隔离 HOME 与 `CODEX_WEIXIN_STATE_DIR`，仅本地 HTTP mock 与合成音频，不调用真实 Fish 付费接口、不发声。未做真实 Fish 音频播放、真实网络超时与设备回调验收；未安装或切换当前应用。
- 遗留问题：Rust 侧真实 Fish 声音、超时/降级的真机表现未验收；传输级取消仍未实现（合成线程最多等待自身超时）；`fishModel`/`voiceId` 合法值域未校验。听写/ASR 未实现，合成占用期间听写拒绝仍为"暂不支持"文案而非互斥成功。P3 其余缺口、P4 灰度与回滚、许可证分发不变。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261111-008] synthesize chat and reminder speech via Fish Audio in Rust host`；最终哈希按 Change-ID 查询。上批 SC-20261111-007 提交已普通推送，本批提交后普通 push 并核对远端，不预写成功。

## SC-20261111-007 Rust Codex 完成提醒事件消费与播放接线

- 北京时间：2026-11-11 17:36:19 +08:00（本批完整回归、构建与 release 沙箱复验后现场读取）。
- 修改或新增：页面/样式、版本、默认 Node 与已安装副本不变；无新增依赖。新增 Rust reminder 模块，复用现有状态目录 events 和 Node 事件格式：构造时历史只消费不重播、仅 64 位小写十六进制 JSON 文件、ID 与文件名相符才接受、同进程 seen 去重、消费后尽力删除、批内按生产者 ISO 时间取最新、忙时保留一个待播项且新批次替换、持续忙碌超过 120 秒放弃并 notice。仅 codexVoiceReminder 严格 true 时启用，轮询观察为关闭时到达项直接消费，configure 关闭立即清空待播项，独立于聊天 speak。事件以既有 codexReminder 横幅和系统 speak 协议输出，不写聊天、不访问模型/Codex/微信、不修改目标；文案只说“本轮已结束”，不代表代码或测试成功。serve 增加一个 1 秒轮询线程，EOF 断开通道并 join；扫描、忙闲检查和播报归属使用同一 Session 锁。播放编号改为独立递增序列，避免未发生新聊天时连续提醒复用编号。目录/文件使用描述符、O_NOFOLLOW/O_NONBLOCK、属主和普通文件检查，单文件限 64 KiB，unlink 不递归删除目录。更新 PLAN 当前阶段与文档守护，P3/P4 继续未勾选。
- 遇到的难题：提醒不能靠 stdin 新命令触发；聊天 HTTP 结束并不等于原生声音完成；旧 generation 派生 playbackId 会让连续提醒重复编号、迟到回调误结束下一条。还需避免 FIFO 卡住、链接跟随、关闭再开启恢复旧待播，以及测试无声通过却被误记为设备验收。
- 处理方式：先增加 5 个有行为变化的宿主场景，旧实现实测 0/5 通过，再接线并扩至 6 个；单一周期线程和 Session 锁保证不在聊天/播放占用时插播，每次声音登记独立编号；关闭开关立即丢弃待播，即使下一次轮询前重新启用也不恢复。测试使用现有 Node enqueue 生产合成事件，HOME/状态目录都隔离，覆盖启动/重启历史、默认关闭、重复 ID、最新合并与替换、聊天→声音两阶段等待、旧确认/取消、EOF、坏 JSON/错 ID/超限/链接/FIFO、目录保留及 Fish 明确降级；检查沙箱数据库无提醒消息、无额外 HTTP。新增 5 个队列/文件/文案 Rust 单测和 1 个连续播放编号单测，120 秒边界通过注入 Instant 逻辑时间验证，不冒充真人等待。Rust 丢弃提示没有照抄 Node 遗留的“微信提醒不受影响”，因为微信链路当前关闭；Node 运行实现未修改。
- 验证结果：相关 Node 测试 59/59 通过；最终 `npm test` 250/250、0 跳过；`cargo test` 31/31（24 lib、2 memory、2 interop、3 safety）和 `cargo clippy --all-targets -- -D warnings` 通过；`git diff --check` 通过。`npm run build:mac:check` 通过（RUST_HOST_READY / APP_BUILT，未安装），strict/deep codesign 通过，Rust release/Swift 可执行文件均 arm64，bundle runtimeEngine 实读 node。实际 release 二进制运行提醒 6 项与生命周期 25 项共 31/31 通过；重启与 EOF 是真实沙箱子进程验证，声音仅检查 JSON 事件，未发声/未调用付费服务。最终 fetch 与既有远端 0a5b442 一致、无分叉/积压。未安装或切换当前应用；真实 Codex 自动完成→Rust 横幅/声音、设备回调、120 秒忙碌和听写共存均未验收，不能套用 Node 既有真机验收结论。
- 遗留问题：Fish 仍明确降级系统声音；Rust ASR/听写仍不返回 Ready、不录音，未来实现必须把录音/识别占用纳入同一 gate 后再验收提醒共存。文件枚举/读取在 Session 锁内，超大目录/长运行 seen 集合资源上限与磁盘阻塞未压测；读取/删除失败不重试且可能保留文件，恢复后不在同进程重播；关闭开关语义以轮询观察为准。仅单消费者模型，不保证两个宿主同时消费的全局恰好一次，也不隔离同一账号恶意进程。传输取消/旧 worker 上限、聊天协议/任务/项目/Codex、完整许可证分发和 P4 真实数据切换回滚仍待完成；原生漏回调仍保持播放占用直到显式控制，设备故障须真机验收。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261111-007] consume Codex completion events in Rust with playback gating`；最终哈希按 Change-ID 查询。上批 SC-20261111-006 实际提交 0a5b442f4a7f6019b444dd84f69a4e0ffce8160e 已普通推送，本次 fetch 再核对；本批提交后普通 push 并核对远端，不预写成功。

## SC-20261111-006 播放归属与 Rust 听写明确拒绝

- 北京时间：2026-11-11 16:18:30 +08:00（完整回归、原生构建与 release 沙箱复验后现场读取）。
- 修改或新增：页面和样式冻结，默认 Node、版本与已安装副本保持不变。Rust Session 在聊天 active 之外增加播放占用，speak 携带 playbackId；只接受匹配当前播放的 playbackEnded，过期/重复/无编号回调不能解除新占用或覆盖新聊天状态；cancel/clear/sleep/configure、下一条 text 和 listen=false 清理播放归属，关闭监听同时使在途回复失效。Swift 新增 AssistantPlayback，以实际 AVSpeechUtterance/AVAudioPlayer 对象归属筛选正常结束、取消、解码失败回调；停止前先失效，旧回调不恢复麦克风、不清新播放器、不发错误的完成通知。播放排队到结束期间通过 playback.isActive 阻止全局听写；空内容、无效音频和播放启动失败通过同一归属路径回报结束；宿主退出时停止声音。Node 无编号事件仍回传原有无编号 playbackEnded。Rust ASR/听写仍未实现，合法请求 ID 的 prepare/chunk/finish 返回 dictationError，区分未启用、助手忙碌和暂不支持；不返回 Ready、不假装接受音频，cancel/无效 ID 无副作用。更新 PLAN 并保留 P3/P4 未勾选；未新增依赖或更改配置默认值。
- 遇到的难题：Rust 原来不识别 playbackEnded，也没有独立 playing 状态，回复完成不代表声音结束；通用“不支持类型”错误不能让原生听写面板按请求 ID 结束等待。Swift 原 stoppingAudio 只覆盖同步 stop 调用，迟到 delegate 回调可错误恢复麦克风/清空新播放器；isSpeaking 在声音排队时还不一定为真。Rust 尚无听写识别后端，不能把忙闲保护写成听写可用。
- 处理方式：先新增 9 个沙箱场景，旧实现实测 0/9 通过，再补归属与显式拒绝。聊天/播放占用检查和完成确认复用 Session 锁；Swift 使用独立可执行夹具检查对象身份、停止后旧回调、重复完成、无编号 Node 兼容及失败归属，原生控制器夹具检查排队播放阻止听写、过期 ID 忽略和明确失败不启动录音。进一步补 listen=false 打断慢响应体回归，生命周期总数由 15 增至 25；新增 2 个 Rust 播放占用单元测试与文档守护。全部宿主测试隔离 HOME 和 CODEX_WEIXIN_STATE_DIR，仅合成消息/密钥及本地 HTTP，不调用付费接口或访问真实会话；Swift 夹具不发声、不申请麦克风权限。
- 验证结果：`npm test` 最终 243/243 通过、0 跳过；`cargo test` 25/25 通过（18 lib、2 memory、2 interop、3 safety）；`cargo clippy --all-targets -- -D warnings` 与 `git diff --check` 通过。`npm run build:mac:check` 通过（RUST_HOST_READY / APP_BUILT，未安装），`codesign --verify --deep --strict dist/MuYan.app` 通过，Rust release 和 Swift 可执行文件均 arm64，bundle runtimeEngine 实读 node。实际 release 二进制运行完整生命周期沙箱 25/25 通过；Swift 播放归属/接线检查及听写控制器夹具通过。未做真实系统声音/Fish 播放、音频设备故障、麦克风恢复或快捷键人声验收；未安装/切换当前应用。提交前 fetch 核对本地与远端均为 3c602de，无分叉和积压。
- 遗留问题：本批只完成播放协议与未实现听写的失败路径，不代表完整听写互斥、ASR 或语音提醒已实现；完成提醒监听尚未接入，Fish 合成仍明确降级。若原生客户端未回传匹配的完成事件，Rust 保持播放占用直到显式打断/控制或下一条 text，不设置可能在播放中提前释放的超时；真实系统回调与失效设备行为待真机验收。传输取消与旧 worker 资源上限、聊天输入/预算/history/targets/configure、任务/Codex、长历史压测、完整许可证分发及 P4 真实数据往返/回滚仍待完成。夹具/源码接线检查和构建不能替代 AVFoundation 真机效果。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261111-006] track playback ownership and reject unsupported Rust dictation`；最终哈希按 Change-ID 查询。上批 SC-20261111-005 实际提交 3c602de358676f3197adf9df7cbc9fe535acfc7e 已普通推送，本次 fetch 再次核对；本批提交后普通 push 并核对远端，不在本条预写成功。

## SC-20261111-005 Rust 聊天请求归属与取消提交屏障

- 北京时间：2026-11-11 15:45:40 +08:00（本批自动回归、构建与 release 沙箱复验后现场读取）。
- 修改或新增：页面与样式保持冻结，默认 Node 与已安装副本不变。本批仅修 Rust 聊天生命周期：用同一 Session 锁管理配置、请求编号与 active 所有权；text 在 stdin 处理顺序中同步准备/记录并取得归属，再启动阻塞 HTTP worker；完整 JSON 响应体读取后，只有当前所有者可以提交消息、usage、声音、数据库和结束状态。旧请求成功、HTTP 错误、超时均不能释放新请求 busy。cancel、sleep、clear、configure 使旧请求失效且发 stopAudio，空闲时 cancel 也能要求停止原生声音；clear 仅在数据库清空成功后发空 history 和成功状态，失败明确报错。线程创建失败也通过同一归属检查释放请求。serve 统一走带锁的 JSON 行输出。新增 15 项本地 HTTP/stdio 生命周期回归、3 项 Rust 请求归属单元测试，更新 configure 协议断言与验收边界文档守护；未加依赖、未改版本。
- 遇到的难题：旧实现检查与设置 busy 分离、worker 启动晚于后续控制命令、共用 aborted 状态且过期 worker 无条件清 busy；只在 HTTP 头返回后检查 generation，慢响应体期间取消仍可能写库/播报；clear 失败仍发“对话已清空”。单靠等待自然超时容易漏掉立即重入和迟到响应体竞态。
- 处理方式：先用受控本地 HTTP 服务复现，初始 10 个场景在旧实现 0/10 通过；进一步把 stopAudio 断言后移后，确认旧成功/失败/超时释放新 busy、慢 body 的迟到结果、批量 stdin 顺序与重复提交问题。改为一个线性化锁保护接收/控制/提交，HTTP 和完整 body 读取均在锁外；控制命令若先取得锁，旧结果被丢弃，回复若先提交，后续 stopAudio 在同一有序输出之后。增加当前 JSON/HTTP/API/缺失文本/超时失败后重试测试、SQLite 合成触发器拒绝 DELETE 的失败测试。所有 HOME 与 CODEX_WEIXIN_STATE_DIR 都指向临时沙箱，使用合成密钥/消息、本地 mock，不请求真实付费接口、不访问真实会话。
- 验证结果：`npm test` 230/230 通过、0 跳过；`cargo test` 23/23 通过（16 lib、2 memory、2 interop、3 safety）；`cargo clippy --all-targets -- -D warnings` 通过；`npm run build:mac:check` 通过（RUST_HOST_READY / APP_BUILT，未安装）；`codesign --verify --deep --strict dist/MuYan.app` 通过，Rust release 与 Swift 可执行文件均 arm64，bundle runtimeEngine 实读 node。另以实际 release 二进制运行全部 15 项生命周期沙箱用例，15/15 通过；包括取消→立即新请求、旧结果/超时不抢 busy、四类控制命令打断慢响应体、12 批 text/cancel/clear 顺序、错误恢复及 clear 失败保留数据。`git diff --check` 通过。未做真机交互/人声/系统声音停止验收，未安装或切换当前应用。提交前 fetch 核对远端与本地均为 2a5c80f，无分叉或积压。
- 遗留问题：本批是逻辑取消，阻塞 ureq 连接仍等响应或超时，不承诺立即关闭网络或阻止已发出的请求计费；连续取消下的旧 worker/连接资源上限待补齐。缺 Key 用户记录、输入校验、模型输入重复/最新优先预算、运行中读库错误处理、完整 history/targets/configure 默认合并、HTTP 重定向及真实网络取消仍未对齐。播放结束/playing 状态、听写忙闲互斥须在提醒接入前补齐；提醒/Fish/ASR/任务/Codex、完整许可分发和 P4 用户真实数据往返/回滚未验收。单锁内仍有本地 SQLite 与 stdout 操作，长历史/磁盘阻塞压测未做。P3/P4 保持未勾选。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261111-005] guard Rust chat lifecycle against stale replies`；最终哈希按 Change-ID 查询。上批 SC-20261111-004 实际提交 2a5c80fd8443d90b784e67cb3a9b3c8a6296f35b，已于上一轮普通推送且本次 fetch 再次核对；本批提交后执行普通 push 并核对远端，不在本条预写推送成功。

## SC-20261111-004 Rust 会话路径纠正与金库失败关闭保护

- 北京时间：2026-11-11 14:58:31 +08:00（本次测试与构建完成后现场读取；不作为此前批次时间的推断）。
- 修改或新增：本批暂停继续堆叠提醒模块，先修复依赖的数据边界。Rust 改为与 Node AssistantService 同用 `(CODEX_WEIXIN_STATE_DIR || HOME/.codex-weixin-notifier)/assistant`；金库用 O_NOFOLLOW/openat 先验普通文件、属主、长度，再限长读取与描述符 chmod；仅 NotFound 可初始化，已有数据库/凭据/偏好/封存文件而无密钥时拒绝。临时密钥以 0600 排他创建、完整同步后 linkat 无覆盖发布，并发打开共享同一密钥。初始化改 Result→JSON error+exit 1，去除 expect panic；启动逐行认证密文，拒绝错误密钥/损坏记录/数据库链接；旧明文表或 history.json 提示先用 Node 迁移。补 3 项 Rust 金库边界测试、6 项 Node 状态互操作测试和文档守护测试；旧 serve 最小测试改隔离 HOME/状态目录，聊天测试关闭数据库/进程/HTTP 并清理沙箱与超时轮询。补录 rusqlite/libsqlite3-sys/SQLite 许可来源（完整分发许可仍待审计）。页面样式、默认 node、版本及已安装运行副本均不改。
- 遇到的难题：复核发现前批次根路径少 assistant 子目录，且已有测试仅证明密文格式可读，并未证明真实服务路径双向互读；master.key 任意读取错误都会走重建、写入不排他，悬空链接可被跟随。新失败测试实际复现缺密钥误建与悬空链接问题（2/3 失败）。首次修复编译遇到 rand_core::Error 未实现 StdError，不能直接交给 io::Error::other。
- 处理方式：先补失败测试再修复；密钥生成与原子发布分离，不截断现有目标；只接受明确不存在，其他 I/O 错误保持失败；随机数错误转为说明字符串。互操作用真实 Node AssistantService 作为起点和终点、中间启动 Rust 本地 mock 云桥，显式隔离两个环境路径；测试错误密钥/损坏库的字节保持、近期窗口外密文认证、FIFO 不阻塞、链接目标不修改、12 线程初始化、默认/覆盖路径与重启。SC-001/002/003 的“逐事件对齐/安全语义同 Node/共享同一路径/模块完成”历史表述过强，本条与 PLAN 当前分项纠正为初版实现；早期 minimal serve 曾继承真实 HOME，其历史影响未调查，不删除或合并任何真实文件。此前三条手填时间无法由本轮核实，不冒充实际验收时间。
- 验证结果：`npm test` 214/214 通过（0 跳过）；`cargo test` 20/20 通过（13 lib、2 memory、2 interop、3 safety）；`cargo clippy --all-targets -- -D warnings` 通过；`npm run build:mac:check` 通过（Swift 编译、Rust release，APP_BUILT/RUST_HOST_READY）；额外 strict/deep codesign 通过，两个二进制均 arm64，bundle runtimeEngine 读回 node。release 宿主在临时沙箱完成启动/tasks 与删除测试密钥后 JSON 拒绝启动、无替代密钥的实测。`git diff --check` 通过。全部数据测试为合成夹具；未安装、未切换真实引擎，真机语音/听写/P4 未验收。fetch 后远端为 e70650c，本地领先 41 且无远端独有提交；269 个待推历史文本 blob 凭据特征扫描未命中（不宣称完整安全审计）。
- 遗留问题：P3 聊天取消/重入/clear/sleep、请求输入重复、预算/分页/运行中读库错误、配置与目标/任务/Codex、提醒/Fish/ASR/听写尚未全对齐；P4 真实备份切换/回滚未验收；全库认证的长历史启动耗时未压测；同一 OS 账号的恶意进程不在本地金库隔离保证内。早期 Rust 错位文件保留原位，不自动迁移。完整依赖许可随产物分发待核对。按仓库规则本提交后普通 push（包含既有 41 个积压提交），推送及远端哈希在提交后核对，不在本条预写成功；若失败保留提交并报告恢复步骤。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261111-004] harden Rust vault initialization and align Node state path`；最终哈希按 Change-ID 查询。前批次已知提交 SC-001=f7ddd77、SC-002=2be4bc8、SC-003=92df1fa，未改写历史。

## SC-20261111-003 Rust 宿主 P3 会话落盘与引擎互读

- 北京时间：2026-11-11 12:10:30 +08:00（开发自 2026-11-11 上午开始）。
- 修改或新增：完成 Rust 引擎阶段三第三模块（PLAN P3 对话持久化）。① 新增 rust-host/src/memory.rs：与 src/assistant-memory.mjs 共享同一 `~/.codex-weixin-notifier/conversations.sqlite`（secure_delete=ON、sealed_messages+metadata 表、0600）；append 单事务「预留 id+加密回填」（purpose=message/{id}）；context 取最新 limit 条开封为 (role, content) 正序；clear 清空并 VACUUM。② chat.rs 移除内存会话改用落盘存储：text 成功路径落盘 user（source 取请求字段缺省 chat）与 assistant 消息、上下文改为从密文库读取、clear 直达密文库；时间戳复用 serve 的 UTC RFC3339。③ 测试：cargo 集成测试新增 memory_store（往返、跨打开持久化、limit 生效、清空）；node 端 rust-host chat 测试改为 HOME 沙箱运行（不触碰真实数据），末尾用 node:sqlite + node 版 LocalVault 开封 rust 宿主写入的 sealed_messages——证明 node<->rust 引擎切换时对话互读。
- 遇到的难题：无重大阻塞；一处 clippy 提示（new_without_default 与 unnecessary to_string）位置放错后修正。
- 处理方式：clippy::new_without_default 以注释说明 Default 语义不适用（构造依赖 HOME 状态目录）。
- 验证结果：cargo test 17 项全部通过（13 lib+2 vault+2 memory）；npm test 207 项全部通过（含 node 开封 rust 落盘的端到端互操作断言）；cargo build/clippy 零警告。真机引擎切换往返（node 写→rust 读、rust 写→node 读）属 P4 灰度验收，未验收。
- 遗留问题：P3 剩余本地 ASR/听写、语音提醒、Fish 合成模块；P4 灰度切换与回滚演练；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261111-003] rust host conversation persistence and cross-engine read`；最终哈希按 Change-ID 查询。

## SC-20261111-002 Rust 宿主 P3 金库模块对齐

- 北京时间：2026-11-11 12:05:10 +08:00（开发自 2026-11-11 上午开始）。
- 修改或新增：完成 Rust 引擎阶段三第二模块（PLAN P3 加密金库）。① 新增 rust-host/src/vault.rs：JRV1 格式与 src/assistant-vault.mjs 逐字段对齐（魔数+12 字节 IV+AES-256-GCM 密文+16 字节 Tag，AAD `jarvis/v1/{purpose}`）；master.key 打开/生成分支与权限语义同 node（0600/0700、拒符号链接、拒非本用户属主）；新增 with_key 供互操作测试。② 重构 moss-host 为 lib+bin（src/lib.rs 导出模块），使 cargo 集成测试可复用实现。③ 新增共享互操作向量 test/fixtures/vault-vectors.json（node 版 AES-256-GCM 加密的三条用例：JSON 消息、含换行与代码块的消息、legacy 字节流，测试专用固定密钥）；cargo 集成测试 vault_interop 验证「node 封→rust 开」、往返一致、purpose（AAD）绑定拒绝、密文篡改拒绝、魔数拒绝；node 测试新增向量守护用例。④ 新增依赖 aes-gcm 0.10、rand_core 0.6（均 RustCrypto 纯 Rust）；THIRD_PARTY_NOTICES.md 补录 Rust host crates 条目（serde/serde_json/libc/ureq/rustls/regex/aes-gcm/rand_core/getrandom，MIT/Apache-2.0 双许可）。
- 遇到的难题：① 向量生成首版把 JSON 文本与解析后对象混用（含换行消息校验失败），转义层混叠难读；② bin crate 无法被 cargo 集成测试导入；③ aes-gcm 0.10 API（Key::from_slice 所有权、OsRng 移动位置）与旧示例不符；④ 测试里含中文的字节串字面量不被 Rust 允许。
- 处理方式：① 向量改存 plain 对象（测试 JSON.stringify 比对）与 plainUtf8 双形态并自验证后才落盘；② 拆 lib.rs；③④ 按 0.10 当前 API 与 serde_json 构造载荷修正。
- 验证结果：cargo test 13 单元+2 互操作全部通过（含 node 封→rust 开）；npm test 207 项全部通过（新增 node 向量守护用例）；cargo build/clippy 零警告；project-docs 文档测试通过。真机金库读写（rust 宿主实际持久化对话）待聊天落盘接入后随 P4 灰度验收，未验收。
- 遗留问题：聊天模块尚未把会话写入金库（当前内存态）；P3 剩余本地 ASR/听写、语音提醒、Fish 合成模块；P4 灰度切换与回滚演练；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261111-002] rust host vault alignment`；最终哈希按 Change-ID 查询。

## SC-20261111-001 Rust 宿主 P3 聊天模块对齐

- 北京时间：2026-11-11 11:52:20 +08:00（开发自 2026-11-11 上午开始）。
- 修改或新增：完成 Rust 引擎阶段三第一模块（PLAN P3 聊天）。① 新增 rust-host/src/chat.rs：闲聊主路径与 src/assistant-service.mjs 逐事件对齐——忙时拒绝、休眠指令、Codex 派发拒绝（显式语句检测）、无云桥 Key 提示、system prompt 同文、memory 上下文（内存 16 条/12000 字预算，加密落盘留金库模块）、云桥 /responses 请求体同参、usage/message/state/speak 事件序列同序、speechText 口播转换、Fish 未实现时诚实降级系统声音；text 处理在独立线程执行，serve 主循环在 HTTP 期间保持可响应 cancel（generation+abort 双保险）；configure 快照与 cancel/clear/sleep 接线。② 新增依赖 ureq 2（rustls，纯 Rust）与 regex 1，零系统库依赖。③ 测试：rust-host.test.mjs 新增「serve chat speaks the relay protocol」——本地 mock 云桥（http server）覆盖主链七事件、sleep、codex 拒绝、busy 拒绝、cancel 打断后无幽灵回复，断言按事件内容匹配不依赖绝对行号。
- 遇到的难题：① 测试最初用绝对行号断言，事件多行交错时越界误报（单文件过、全量并发挂）；② heredoc 手动调试时 stdin 立即 EOF 会杀掉异步线程，产生「text 无响应」假象误导排查；③ mock server 漏写 req.on('data') 导致背压卡住响应，放大了 ① 的表象。
- 处理方式：① 重写为 waitEvent 按事件内容匹配并返回 [索引, 事件]（旧快照索引不再越界）；②③ 记录在案，调试脚本修正后确认 rust 侧行为本就正确。
- 验证结果：npm test 206 项全部通过（新增 1 项）；cargo build 与 cargo clippy 零警告；npm run build:mac:check 本批次未重跑（Rust 侧已由测试内 cargo build 覆盖，Swift 未改动）。真机以 rust 引擎聊天属 P4 灰度验证，未验收。
- 遗留问题：P3 剩余模块——金库加密落盘（对话持久化）、本地 ASR/听写、语音提醒、Fish 合成；Codex 派发路由；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261111-001] rust host chat module alignment`；最终哈希按 Change-ID 查询。

## SC-20261110-011 Rust 宿主 P2 stdio 协议子集与 runtime-engine 开关

- 北京时间：2026-11-10 21:09:41 +08:00。
- 修改或新增：继续功能主线，完成 Rust 引擎阶段二（PLAN P2）。① 新增 rust-host/src/serve.rs：moss-host serve 进入 stdio JSON 行循环，实现 tasks/configure/listen 最小子集，事件形状与 src/assistant-host.mjs 逐字段对齐（tasks 快照形状、configured 五字段回显、listen 按 node 关闭语义输出 state+capture）；UTC 时间戳用 civil_from_days 手写格式化（零新依赖）；未提供的能力以显式 error/capture=false 呈现并注明 P3 提供，不静默假装；② Swift：Settings 新增 runtimeEngine 容错字段（旧配置缺字段解码为 nil）、startHost 按 runtimeEngine==rust 切换 spawn moss-host serve，默认与旧行为完全一致；③ build.py：client-settings.json 写入 runtimeEngine，仅 MOSS_RUNTIME_ENGINE 构建参数可切换且白名单 node/rust（bundle 签名完整性不受影响，P4 灰度用）；④ 测试：rust-host.test.mjs 新增 serve 协议六事件断言与 bundle/源码断言两用例。
- 遇到的难题：listen 在 P2 无采集与 ASR 能力，直接对齐 node 的 enabled=true 行为会静默假装成功误导用户；configure 若做 defaults 合并会提前做 P3 的事。
- 处理方式：listen 诚实输出未启用+错误状态（注明 P3）；configured 仅透传请求 settings，完整 defaults 合并留 P3 能力对齐阶段，均已写入代码注释。
- 验证结果：npm test 205 项全部通过（新增两用例）；npm run build:mac:check 通过（Rust release 构建成功 RUST_HOST_READY + Swift 编译成功 APP_BUILT）。真机以 rust 引擎运行属 P4 灰度验证，未验收。
- 遗留问题：P3 宿主能力逐模块对齐（聊天/本地 ASR/听写/语音提醒/金库读取）；P4 灰度切换与回滚演练；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-011] rust host serve protocol subset and engine switch`；最终哈希按 Change-ID 查询。

## SC-20261110-010 听写许可核对与第三方声明补录

- 北京时间：2026-11-10 21:03:45 +08:00。
- 修改或新增：完成 PLAN 阶段 5「核对上游采用范围与许可」文档项：核查听写全系列 Swift 文件（DictationPaste/Panel/Controller/Hotkey/Audio/Recorder）仅 import 系统框架，无第三方运行时依赖；参考实现 SpeakMore 许可与 THIRD_PARTY_NOTICES.md 条目此前已登记。同时补录 SC-20261110-007 遗漏：THIRD_PARTY_NOTICES.md 新增 thinking-orbs（引擎子集，MIT，licenses/thinking-orbs-MIT.txt）。PLAN 阶段 5 许可项勾选。
- 遇到的难题：PLAN 底部纪律条款要求「不因模拟成功勾选完成」，故其余模拟测试已过的听写实现项（热键/粘贴/悬浮条）保持未勾，等待阶段 8 真机验收，不以测试代替。
- 处理方式：仅勾选纯文档/代码核对类条目，真机项保留。
- 验证结果：npm test 203 项全部通过（含 project-docs 文档一致性检查）。
- 遗留问题：听写阶段 8 真机验收清单（PLAN 137-142）待用户配合；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261110-010] dictation license audit and notices backfill`；最终哈希按 Change-ID 查询。

## SC-20261110-009 听写 120 秒封顶自动交付（build 38 未含，仅节点服务层）

- 北京时间：2026-11-10 19:56:10 +08:00。
- 修改或新增：继续听写主线（PLAN 下一步任务）。排查发现 PLAN 列的显式开始/结束/取消、热键、粘贴回填、悬浮条、睡眠锁屏清理均已有实现（DictationService、DictationHotkey、DictationController、DictationPaste），但存在一个行为缺口：超 120 秒时直接报错丢弃全部已识别文本。本批次改为封顶自动交付：丢弃超限新块，已有可识别文本则发「已达 120 秒上限，正在交付已识别内容」提示并自动结束交付；无可用文本（如全程静音）维持原报错。Swift 端 dictationNotice/result 已有展示与粘贴路径，无需原生改动。
- 遇到的难题：新测试首跑失败——测试假 ASR 把巨大 base64 音频串进返回文本超 16000 字上限被判无用文本，导致封顶分支走了无文本报错路径。
- 处理方式：修正测试桩为固定短文本；行 66 对应项勾选，其余听写 PLAN 项待真机验收后再勾。
- 验证结果：npm test 203 项全部通过（新增封顶自动交付、静音封顶报错两用例，重写超限旧断言）。服务层行为变更随下次构建进入安装包，真机封顶交付未验收。
- 遗留问题：真机验收封顶自动交付（需单轮录超 120 秒）；听写真机验收清单（PLAN 137-142）待用户配合；远端积压待推送。
- 构建与安装（2026-11-10 20:14:04 +08:00）：版本 0.9.13 / build 39（含 SC-009 封顶交付与 0.9.12 光球修复），npm test 203 项全过，签名通过；用户退出后实装成功，Plist 读回 0.9.13/39，应用启动稳定（PID 63812）。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-009] dictation 120s cap auto delivery`；最终哈希按 Change-ID 查询。

## SC-20261110-008 思考光球可见性修复与增强（build 38）

- 北京时间：2026-11-10 16:25:30 +08:00。
- 修改或新增：用户真机反馈光球「不是很明显」。排查发现根因：明暗判定用 body 背景色解析，而 HUD 背景是 radial-gradient 字符串，正则抓到的第一个数字是渐变坐标 78，被误判为暗色底，光球全程使用暗底淡墨 #C9A3AD 绘制在亮色界面上，导致几乎不可见。修复：明暗改按根元素 color-scheme 判定；同时增强——主光球 64→96px 并加灰玫光晕（drop-shadow）、迷你球 20→32px、动画提速 1.35 倍、暗底墨色提亮为 #E2C3CC。版本 0.9.12 / build 38。
- 遇到的难题：① 明暗判定 bug 的根因隐蔽（getComputedStyle 返回完整渐变字符串，坐标数字被当成 RGB）；② build --no-install 首跑因 PATH 漏 nvm node 而失败（Node 22.16+ 提示），补全 PATH 后正常。
- 处理方式：① 改用根元素 color-scheme 判定，彻底避开解析背景字符串；② 全量 npm test 后再提交。
- 验证结果：npm test 201 项全部通过；构建签名通过，Plist 读回 0.9.12/38。
- 遗留问题：build 38 待用户退出沐言后安装复核；UI 点阵风格批次 A（背景装饰、卡片质感）待光球确认后进行；远端积压待推送。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261110-008] orb visibility color scheme fix and boost`；最终哈希按 Change-ID 查询。

## SC-20261110-007 接入 Thinking Orbs 思考光球（build 37）

- 北京时间：2026-11-10 15:40:12 +08:00。
- 修改或新增：用户确认整体视觉向 libraries.dev 的 Thinking Orbs（点阵球体科技感）靠拢。① 新增依赖 thinking-orbs@0.3.2（MIT，© Jakub Antalik，许可文件 licenses/thinking-orbs-MIT.txt），仅用其独立导出的纯几何引擎层（无 React 运行时）；② 新增 client/scene/thinking-orb.mjs 封装：assistant-state 映射为九种光球动画（思考=轨道粒子、合成语音=彩带起伏、执行=色带咬合、聆听=纬线波形、空闲=呼吸），灰玫双色 tint（亮底 #A07882 / 暗底 #C9A3AD），明暗自适应，「减少动态效果」时光球静置；③ HUD：字幕上方新增 64px 主光球（思考/合成/执行/识别时显示），状态行 3px 圆点升级为 20px 迷你光球；设置页新增「思考光球」开关，默认开启；④ esbuild 本地打包（--global-name=MuYanOrbEngine）产物 14.2KB 无远程引用，满足 CSP；⑤ 版本 0.9.11 / build 37。
- 遇到的难题：① 测试假 DOM 无 classList.contains，applyThinkingOrb 过早调用导致六个既有测试崩；② npm 安装写入 ^0.3.2 与测试期望字面值不一致；③ 光球创建后未启动绘制循环，canvas 首帧空白。
- 处理方式：① classList 读取移到实例空检查之后并用可选链；② 测试改断言 ^0.3.2；③ 封装尾部 ensureLoop() 初始进入绘制循环。
- 验证结果：npm test 201 项全部通过（含新增 thinking-orb.test.mjs 六项）；构建签名通过，Plist 读回沐言/0.9.11/37；产物已入 Resources/hud。浏览器静态目视未单独验证，随真机验收。
- 遗留问题：build 37 待用户退出沐言后安装——真机验收光球动画、状态切换、开关行为；UI 向点阵球体风格进一步靠拢（背景装饰、卡片质感）未在本批次，待光球验收后再迭代；远端积压待推送。
- 安装与真机状态（2026-11-10 16:13:00 +08:00 更新）：用户退出后实装 build 37 成功，签名校验通过，Plist 读回沐言/0.9.11/37；应用启动稳定（PID 46573）。待用户确认：思考光球动画、状态行迷你球、开关行为。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-007] thinking orbs integration for state animation`；最终哈希按 Change-ID 查询。

## SC-20261110-006 图标按规范重制为矢量简洁版 + 应用名全面中文化（build 36）

- 北京时间：2026-11-10 13:56:54 +08:00。
- 修改或新增：用户提供苹果 HIG 与谷歌 Play 图标规范，要求图标简单明了、应用名显示处一律中文（仅技术必须处保留英文）。① 图标 v7：放弃 AI 生成质感路线，改为 PIL 矢量绘制「声波对话气泡」单一主体——雾灰玫瑰纯净渐变底（#EFE5E7→#DCC9CE）、白色圆角气泡带平滑小尾巴、三根灰玫圆头声波条（中间略高），无文字、无玻璃质感细节，Big Sur 824-in-1024 构图；48px 小尺寸模拟清晰可辨；icns 与资产目录 10 尺寸同步；② 应用名：用户可见文案「在 Finder 中显示当前 MuYan」→「在 Finder 中显示沐言」；技术标识（包路径 MuYan.app、进程名 CodexWeixin、bundle ID、LaunchAgent 标签）按必须原则保留英文；③ 版本 0.9.10 / build 36。
- 遇到的难题：① 重生成脚本一处笔误（对 Path 对象调 resize）致 xcassets 与版本号首次未更新，重跑修复；② v7 期间测试断言内转义正则未被字面替换覆盖，靠全量测试验证确认后统一替换。
- 处理方式：矢量绘制参数化（圆角比例 0.2237、主体占比约 55%、对比靠白气泡/灰玫底双层次）；每步后跑全量测试。
- 验证结果：npm test 195 项全部通过；构建签名通过，Plist 读回沐言/0.9.10/36；图标角透明/中心实校验与 48px 小尺寸目视通过。应用运行中仅 --no-install，未安装。
- 遗留问题：build 36 待用户退出沐言后安装验收（新图标、全面中文名、整体观感）；液态玻璃开关真机验收仍在待办；远端积压待推送。
- 安装与真机状态（2026-11-10 14:09:18 +08:00 更新）：用户退出后实装 build 36 成功，签名校验通过，Plist 读回沐言/0.9.10/36；killall Dock 刷新图标后应用启动稳定（PID 8653）。待用户确认：Dock 新矢量图标、全面中文名、整体观感。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-006] vector icon redesign per hig and full chinese naming`；最终哈希按 Change-ID 查询。

## SC-20261110-005 雾灰玫瑰 C 方案落地：图标 v6 + 全套 UI/场景降饱和（build 35）

- 北京时间：2026-11-10 12:26:06 +08:00。
- 修改或新增：用户选定 C 方案后一次性落地。① 图标：候选 C 经 Big Sur 管线（bbox 裁剪→角部泛洪透明→824-in-1024 构图）制为 AppIcon-v6，icns 与资产目录 10 个尺寸全部重生成，build.py 图标源 v5→v6；② UI 色板：暖带（325°–355°）饱和度 ×0.42 降为莫兰迪灰玫（含上两轮遗漏的 8 位 hex 发光/阴影色二次清洗 290 处，冷青残留 #72d7ff/#3fc5fb 等同步转灰玫）；主 accent 统一 #A07882（glass/moss），发送按钮/声波/光晕对应柔化；thinking 饱和滤镜 1.2→0.95；横幅高光灰玫化；③ 功能语义色保护：错误红 #b32e40、警示粉 #f099ac、运行徽章玫红 #981d37 恢复原值（降饱和曾误伤 permission 状态红，由 dictation-settings 测试抓出并修复）；正文/强调色用中降饱和（×0.65）保留玫瑰感；品牌控件（checkbox、焦点环）统一 #A07882；④ 3D 场景：材质常量灰玫化（rose=0xcc9ba6），四张运行时纹理二次降饱和（25%/7%/7%/25% 像素），bundle 缩至 5.9MB；⑤ 版本：package 0.9.9、CFBundleShortVersionString 0.9.9（顺带修正此前一直未同步的 0.9.7）、CFBundleVersion 35。
- 遇到的难题：① 降饱和带处理会误伤功能语义色（色相 348 错误红与品牌色同带），dictation-settings 测试抓到 permission 状态红变灰，已按语义色白名单恢复；② 角色色覆写被前一步带处理改值导致两次落空，改为「先带处理、后查现值、再覆写」顺序；③ 测试正则未含大写 hex 导致 accent 断言空匹配。
- 处理方式：分层降饱和（功能语义原值、品牌统一、正文中降、装饰强降）；每步后 grep 现值再覆写。
- 验证结果：npm test 195 项全部通过（新增 C 方案 accent 统一与艳玫/冷青清零断言）；构建签名通过，Plist 读回 CFBundleName=沐言、ShortVersion=0.9.9、Build=35；图标角透明/中心实/色相灰玫域校验通过；图标与场景目视拼图确认效果。应用运行中仅 --no-install，未安装。
- 遗留问题：build 35 待用户退出沐言后安装验收（图标、菜单栏中文名、整体灰玫观感、文字对比度）；真机验收后回填。
- 安装与真机状态（2026-11-10 13:32:58 +08:00 更新）：用户退出后实装 build 35 成功，签名校验通过，CFBundleName=沐言、CFBundleVersion=35；killall Dock 刷新图标后应用启动稳定（PID 74214）。真机验收项：菜单栏中文名、新图标、灰玫观感、文字对比度、液态玻璃开关，待用户确认。
- 后续修正（2026-11-10 13:52 前后，同一 Change-ID）：① PLAN 完成项证据由独立行改为同行内联（project-docs 测试要求 `- [x]` 同行带证据）；② 图标色相采样改用 pngjs（加入 devDependencies），不再依赖 homebrew PIL 的 python3，裸环境 npm test 可复现；两问题均由全量测试抓出后修复。对应提交：PLAN/测试修复 `fix: [SC-20261110-005] plan evidence inline and pngjs-based icon sampling`（本 Change-ID 下第二笔）。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-005] morandi grey-rose theme and icon v6`；最终哈希按 Change-ID 查询。

## SC-20261110-004 应用名改中文沐言 + 降饱和图标配色候选（待用户选定）

- 北京时间：2026-11-10 11:30:06 +08:00。
- 修改或新增：用户反馈界面仍太艳，要求推荐降饱和方案、重新设计图标、应用名改中文。① CFBundleName MuYan→沐言（菜单栏应用名显示中文；CFBundleDisplayName 本已是沐言；包名与安装路径 MuYan.app 保持 ASCII 避免脚本/权限风险）；② 生成三套低饱和图标候选并入库 client/assets/icon-candidates/：A 裸粉奶油（米白→淡尘粉，波纹 #D8A0A8，UI accent 建议 #B87880）、B 燕麦杏（燕麦奶→柔杏，波纹陶土 #C99B72，UI accent 建议 #B08054）、C 雾灰玫瑰（灰白→灰玫，波纹 #B58A94，UI accent 建议 #A07882，莫兰迪最克制）；三套均保持同一液态玻璃声波气泡构图。
- 遇到的难题：配色方向未定（粉/杏/灰玫气质不同），不宜替用户选定后一次性重刷全部界面；故本轮只落地无争议的中文名，配色与图标待选定后在下一 Change-ID 一次性实施。
- 处理方式：图标用图像生成服务按「极低饱和、同构图」提示词产出三候选；测试临时失败（operatelog 缺条目）在补条目后恢复。
- 验证结果：npm test 194 项全部通过（补条目后）；构建签名通过，Plist 读回 CFBundleName=沐言、CFBundleDisplayName=沐言；应用运行中仅 --no-install 构建，未安装。
- 遗留问题：待用户从 A/B/C 中选定图标与配色（或要求再调），选定后一次性重制图标资产并重刷 UI 色板（降饱和重映射），再统一安装验收；远端持续积压待推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-004] chinese app name and muted icon candidates`；最终哈希按 Change-ID 查询。

## SC-20261110-003 中央 3D 形象与场景纹理转向暖色（并入 build 34）

- 北京时间：2026-11-10 11:08:13 +08:00。
- 修改或新增：用户确认「3D 形象也提成暖色」。① 运行时纹理四张像素级色相重映射（SceneReference-v3、environment-v4/v5、jarvis-scene-v3，冷色像素 54%/32%/34%/60% 转暖，色相带 170°–265° 压缩映射到 325°–15°，保明度层次，目视拼图确认星环装置已成玫粉珊瑚色）；② 场景源码共享常量 cyan→rose（0xee7993 玩粉），pale 同步暖化，prototype/mechanical-core 同步；其余冷色 0x 字面量按同规则映射（core/projected-scene/world/renderer 共 18 处），场景底色 0x020a10→暖黑；③ 重新打包 scene-3d.js（6.6MB，比已装旧版 8.0MB 更小）；④ 修正昨天 SC-001 的不一致：liquid-glass.js 是构建生成件，补进 .gitignore 并 git rm --cached，与 scene-3d 同约定；liquid-glass 测试断言同步改为忽略约定。
- 遇到的难题：① 常量改名脚本先值转换后字符串替换，静默未命中导致 cyan 名残留，两个场景测试（mechanical-study/world-motion）抓到，修复 materials.mjs 与 prototype 引用后恢复；② 追加测试的 Python 内嵌 JS 模板串语法错误一次未遂，重写后成功；③ 首次打包后 bundle 涨到 6.8MB，PNG optimize 重存后 6.6MB，仍优于已装版本。
- 处理方式：先像素层（纹理）后材质层（源码常量与字面量）分层转暖，共享常量改名与值转换分两步复核，生成件入库约定同步校正。
- 验证结果：npm test 194 项全部通过（含新增 3D 场景断言：六源文件旧冷色清零、rose 常量、bundle 同检；上轮失败的两个场景测试恢复）；纹理转暖比例手工核验，冷色目视检查通过；构建签名通过。
- 遗留问题：纹理冷像素占比未写成自动化断言（依赖手工核验），已在测试中以源码/bundle 冷色字符串断言代替；build 34 真机验收继续待用户；应用运行中安装被守卫拦住。
- 安装与真机状态（2026-11-10 11:16:01 +08:00 更新）：用户退出旧实例后实装 build 34 成功，签名校验通过，CFBundleVersion=34，Resources 内新图标 icns/Assets.car、暖化 scene-3d.js（6.6MB，旧版 8.0MB）与 liquid-glass.js（120KB）就位；killall Dock 刷新图标后应用启动稳定（PID 19486）。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-003] warm-tint 3d scene and textures`；最终哈希按 Change-ID 查询。

## SC-20261110-002 应用图标与主题色向用户图标靠拢（并入 build 34）

- 北京时间：2026-11-10 10:50:32 +08:00。
- 修改或新增：启用用户生成的沐言声波气泡图标（橙粉渐变玻璃质感）：从剪贴板取得原图（371×380 无 alpha），PIL 流水线定位圆角方、四角白底 flood-fill 透明化、按 macOS Big Sur 规范 1024 画布 824 内容居中合成 AppIcon-v5.png，iconset（16–1024）与 actool 资产目录（Contents.json 全部 10 个尺寸）同步替换，build.py 图标源 AppIcon-v3→v5，CFBundleVersion 33→34（33 从未安装）。HUD 全部 CSS（moss/glass/companion/controls/panels/style/reference-layout）按色相系统性转换：冷青蓝灰（hue 170°–260°）→ 图标同源暖玫粉（hue ≈347°），保持明度/饱和度层级；绿色语义、红色透镜、中性灰不动；极浅玻璃底降饱和防腻；提醒横幅 Swift 光泽同步暖化。CHANGELOG 0.9.8 节并入 build 34。
- 遇到的难题：① 剪贴板取图首次用 «class PNGF»（大写）失败，实际类型是 «class PNGf»；② 图标原图无 alpha、圆角外是白底，直接做图标会带白角，用四角 flood-fill 白色转透明解决（不会误伤气泡内白色，因连通性限制）；③ 色值替换正则初版把残缺 4/7 位十六进制也吞了导致崩溃，改为精确 3/6/8 位；④ 第一轮转换崩溃前已写入 companion/controls/glass，第二轮补齐其余四文件，旧青色 grep 复检归零；⑤ project-docs 一致性测试拦住 CHANGELOG 未提 build 34 的不一致。
- 处理方式：图标用 flood-fill 而非全局换色（保住气泡内部白色）；主题色用 HSL 色相带映射而非手工映射（300+ 离散值可系统性覆盖）；验证从图标 1024 源对角采样色相断言与界面 accent 同域。
- 验证结果：npm test 193 项全部通过（新增 3 项：图标资产齐全与构建引用、旧冷色清零与横幅光泽暖化、图标采样色相与界面 accent 同域）；构建成功签名通过，Resources 内 StarCoreAppIcon.icns/Assets.car 已更新；图标成品四角 alpha=0、中心 255，目视检查通过。
- 遗留问题：build 34 真机验收待用户（Dock 图标、界面暖色观感、文字对比度、横幅配色）；中央 3D 形象（three.js 场景）仍是冷青材质，与暖色主题的协调待用户看实机后再定；应用运行中安装被守卫拦住，待退出后安装。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-002] adopt muyan bubble icon and warm glass theme`；最终哈希按 Change-ID 查询。

## SC-20261110-001 苹果液态玻璃折射效果（build 33，默认关闭）

- 北京时间：2026-11-10 10:22:49 +08:00。
- 评估结论：用户指定开源库 https://github.com/Oliverrr2424/webgl-apple-liquid-glass（npm: apple-liquid-glass-webgl 2.6.0）。可用——MIT 协议、零依赖、Safari/WebGL2 支持且回退 backdrop-filter、帧循环在页面静止时休眠不耗电；机制是库自行重绘玻璃背后的 DOM（浏览器不允许 WebGL 读页面像素）再折射，正好适配我们 three.js 动态场景+渐变背景的页面。原生面板（提醒横幅、听写浮条）是 Swift 自绘，不在本库作用范围。
- 修改或新增：依赖 package.json +apple-liquid-glass-webgl（源码 2.8MB，打包后 120KB 本地脚本，满足 CSP script-src 'self'）；新增 client/scene/liquid-glass.mjs 入口（探测支持/批量挂载/销毁/重新测量，回退模式即销毁保持原外观）；设置页新增「液态玻璃折射效果」开关（liquidGlass 默认 false，assistant-core 布尔校验）；app.js 配置到达时接线（开启且未开减少动态效果且环境支持才启用）；glass.css 新增 data-liquid-glass=webgl 覆盖（原 CSS 玻璃退场避免叠加）；玻璃表面：设置面板、控制条、右侧辅助卡片；build.py 新增 esbuild 打包步骤，CFBundleVersion 32→33；CHANGELOG/PLAN/README 同步。
- 遇到的难题：① 设置面板的真玻璃元素是 #settings-overlay 本体而非内层 .settings（后者 background:none），首版选择器选错已修正；② 字幕条无背景无圆角，玻璃形状不可控，从首列表移除；③ CSP 仅允许本地脚本，库必须打包不能走 CDN（沿用 scene-3d 的 esbuild IIFE 模式）。
- 处理方式：表面选择器按最终布局核对；降级路径明确——设置关/减少动态效果/无 WebGL2 任一命中即销毁实例回到 glass.css 原观感；开启时设置面板从 hidden 转可见，点击打开设置触发 refreshAll 重新测量。
- 验证结果：npm test 190 项全部通过（新增 5 项：默认关闭与布尔校验、开关与本地脚本加载、降级逻辑、CSS 覆盖、构建产物存在且非空）；cargo test 不受影响；`--no-install` 构建成功，dist/MuYan.app 签名校验通过，CFBundleVersion 33。
- 遗留问题：build 33 真机视觉验收待用户——三类玻璃表面折射观感、文字可读性、关闭开关后的回退、长时间开着聊天页的性能与发热。应用正在运行，安装被运行守卫拦住，待用户退出后安装。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261110-001] add apple liquid glass refraction toggle`；最终哈希按 Change-ID 查询。

## SC-20261109-015 产品定名沐言（MuYan）：应用更名与身份迁移（build 32）

- 北京时间：2026-11-10 00:15:37 +08:00。
- 修改或新增：用户确定产品名「沐言」（英文/包名 MuYan）。应用层：CFBundleName=MuYan、CFBundleDisplayName=沐言，构建产物与安装目标改为 MuYan.app；运行守卫同时覆盖新名 MuYan.app 与旧名 MOSS.app（任一运行即拒装，文案改「沐言正在运行」），安装成功后自动移除未运行的旧版 ~/Applications/MOSS.app（在运行则提示手动清理）。身份层：内置助理名字与唤醒词默认 MOSS→沐言，迁移链 贾维斯→MOSS→沐言（只迁移内置名，用户自定义名与唤醒词不动）。文案层：窗口/菜单/状态栏/错误弹窗/语音提醒横幅/听写浮条/桌面宠物/权限指引/设置页与 HUD 页（标题、品牌标识、示例句、aria-label）全部更名。README 补定名说明。bundle ID、可执行名、LaunchAgent 标签、状态目录、runtime 引擎均不变，用户配置与权限数据保留。
- 遇到的难题：① 助理默认名即唤醒词（用户未自定义过，配置文件不存在），应用名与助理名若分裂会造成 UI 不自洽，需一并迁移；② 测试初版按旧字面量断言新守卫结构失败（守卫改为模式列表后同步断言）；③ ReminderBanner 一处 tooltip 漏改，二轮扫尾补齐。
- 处理方式：身份迁移沿用既有内置名迁移机制（assistant-core validateSettings），迁移链指向沐言；唤醒匹配为 NFKC 归一化比较，纯中文唤醒词无兼容问题；文案替换用精确字符串对全量扫描（含未命中即报错），残留用 grep 复检归零。
- 验证结果：npm test 185 项全部通过（含迁移链断言、自定义名保护断言、双模式守卫断言、夹具标题断言同步）；cargo test 13 项不受影响全部通过；真机安装：退出旧 MOSS.app → 构建安装 → OLD_APP_REMOVED 与 APP_READY 输出核对，签名校验通过，Info.plist 读回 MuYan/沐言/local.codex-weixin.client/32，二进制 grep 沐言文案存在，~/Applications 仅剩 MuYan.app，应用已启动并稳定运行（PID 24247）。
- 遗留问题：build 32 真机验收待用户确认——新名应用各界面显示沐言、唤醒词沐言实测、麦克风与输入监授权限读回（ad-hoc 签名随构建变化，若输入监控失效需在系统设置重新添加 MuYan）；旧 MOSS.app 已移除，如需回退需重建。rust 宿主 P2（stdio 协议 + runtime-engine 开关）待推进。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-015] rename product to MuYan with builtin identity migration`；最终哈希按 Change-ID 查询。

## SC-20261109-014 Rust 宿主阶段一 P1：start/stop 对齐与构建集成（build 32）

- 北京时间：2026-11-09 23:51:57 +08:00。
- 修改或新增：rust-host 新增 control.rs，`moss-host start/stop` 与 node 版 client-control 逐调用对齐——start 按 plist 的 Disabled 标记跳过（绝不复活用户停用的微信代理）、已注册跳过、否则 bootstrap（失败吞掉）；stop 倒序 bootout（与 node 版一致硬编码 /bin/launchctl，不走注入）；start/stop 同样输出 status 快照（与 node 版流程一致）。main.rs 接入 start/stop 分发。client/build.py 新增 Rust 宿主编译步骤：cargo 存在则 `cargo build --release` 并校验二进制存在（失败中止构建），cargo 缺失则警告并跳过（不阻塞，默认引擎仍 node，二进制不入包）；CFBundleVersion 31→32，CHANGELOG 同步。
- 遇到的难题：闭包返回引用生命周期报错（改用具名 fn）；Rust 无测试跳过属性，plutil 相关单测用 target_os 守门。
- 处理方式：control.rs 函数全部显式收参（launchctl/plutil/目录/domain 可注入），生产入口 run() 才读真实环境，单测用假 launchctl 脚本（chmod 755）驱动。
- 验证结果：cargo test 13 项全部通过（新增 5 项控制命令单测：Disabled 不引导/启用引导/已注册跳过/stop 倒序/损坏与缺失 plist 视为未停用）；test/rust-host.test.mjs 增至 4 项——start 场景双二进制 stdout 字节级一致且 launchctl 调用序列日志完全一致（Disabled 与启用两种夹具）、stop 输出一致；npm test 185 项全部通过；build.py 实测两个分支：cargo 在 PATH 时输出 RUST_HOST_READY 且 release 二进制 608KB/arm64 生成，cargo 不在 PATH 时构建照常完成（警告跳过）；`python3 client/build.py --no-install` 构建与签名校验通过。未安装新包（应用正在运行 build 31，安装守卫拦截符合预期，也未打断用户真机验收）；应用运行时行为不变（引擎仍 node）。
- 遗留问题：build 32 未安装，待用户退出应用后安装（内容相对 build 31 仅增加构建步骤，应用行为无变化）；P2（stdio 协议子集 + Swift runtime-engine 开关）待推进；用户命名体系（沐声）的应用展示名变更将作为独立 Change-ID 在 P1/P2 之间一次性改齐（涉及 build.py 守卫 pgrep 模式、安装路径、UI 文案与权限标识联动）。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-014] align rust host start-stop and compile in build`；最终哈希按 Change-ID 查询。

## SC-20261109-013 Rust 宿主引擎阶段一启动：工具链 + moss-host status 只读对齐

- 北京时间：2026-11-09 23:15:03 +08:00。
- 修改或新增：用户批准用 Rust 替换 node 宿主层（阶段一方案：Swift 壳与原生功能不动，灰度共存默认 node）。已立项写入 PLAN（P0–P5 六阶段）。本次交付 P0：安装 rustup stable 工具链（cargo/rustc 1.99.1，minimal profile，位于 ~/.rustup 与 ~/.cargo，不动系统目录）；新建 rust-host/ Cargo 工程（serde/serde_json/libc 三个依赖，Cargo.lock 已提交）；实现 `moss-host status` 只读快照命令与 `--version`，与 node 版 client-control 逐字段对齐（delivery/serviceRunning/watching/bound/ready/paused/sent/pending/uncertain/remoteEnabled/remoteProject/remoteThreadId/remoteStatus/latest），包括事件目录过滤（64 位小写十六进制名、损坏 JSON 跳过、cancelled 排除、按 time 排序）、远程请求状态链、wechatDelivery/enabled 缺省语义、toISOString 固定形状解析（Hinnant days_from_civil）、目录 0700 权限；`rust-host/target/` 加入 .gitignore。
- 遇到的难题：① 本机无 Rust 工具链，crates.io 网页 403 但索引与 static.rust-lang.org 可达，确认可安装；② rustup 安装两次被 600 秒命令超时打断，产生半安装损坏（rustc 组件声明已装但二进制缺失，“not applicable to toolchain”错误），改用 nohup 后台安装 + 轮询解决；③ 闭包返回引用生命周期报错改用具名 fn；④ node 测试断言未计入末尾换行符。
- 处理方式：后台任务+轮询避让超时；对齐差异点（宽松 ISO 解析、缺 time 字段排序抛错）在 status.rs 头部注释明确为“比 node 更稳健且不影响正常数据”的已知可容忍差异。
- 验证结果：cargo test 8 项单元测试全部通过；新增 test/rust-host.test.mjs 两项——同沙箱下 rust 与 node 两版 status 输出字节级全等（含 18 事件/3 请求/坏名/损坏 JSON 的完整夹具）与 --version/未知命令行为；npm test 183 项全部通过（新增 2 项）；真实环境（~/.codex-weixin-notifier，只读）手动对比两版输出亦字节级一致。未接入应用、未改 build.py、默认引擎仍为 node，符合 P0 范围。
- 遗留问题：P1（start/stop 对齐含 Disabled 跳过 + build.py 编译不接线）、P2（stdio 协议子集 + Swift runtime-engine 开关）、P3（聊天/ASR/听写/提醒/金库对齐）、P4（灰度切换与回滚演练）、P5（移除 node_modules 分发）待推进；SC-20261109-012 的 build 31 真机验收仍待用户确认。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-013] bootstrap rust host engine with byte-identical status`；最终哈希按 Change-ID 查询。

## SC-20261109-012 修复「无法读取后台服务」弹窗与开始监听失效（build 31）

- 北京时间：2026-11-09 21:06:37 +08:00。
- 修改或新增：用户安装新版后首屏弹「MOSS 无法读取后台服务」并卡住。根因（确定性）：SC-20261109-008 将微信 bot 与桌面监视两个 LaunchAgent plist 置为 Disabled 后，`client-control start` 中 `launchctl bootstrap` 对 Disabled 标签必然失败，且该调用未包 try/catch → client-control 护出、空 stdout 退出 → Swift JSONDecoder 抛错 → 弹窗；0.9.6 因 plist 未停用从未触发。
- 修改：src/client-control.mjs —— start 命令读取 plist 的 Disabled 标记（plutil 转 JSON）并跳过用户停用的代理（绝不复活微信代理）；bootstrap 包 try/catch；launchctl/plutil 路径支持测试环境变量覆盖；snapshot 新增 `delivery` 字段（读 runtime-settings.json）。client/App.swift —— runControl 改为 3 次重试（间隔 0.4s）并在错误文案携带真实错误详情；Snapshot 新增 `delivery: Bool?` 容错字段；render 在停用态如实显示「微信显示已停用」与恢复方式。构建号 30→31。
- 遇到的难题：测试初版断言假设日志含「bootstrap + 标签」相邻字符串（实际是 bootstrap + domain + plist 路径）；假 launchctl 脚本未 chmod 可执行，EACCES 被新加的容错捕获，恰好验证了恢复路径。
- 处理方式：修正断言匹配 plist 路径；测试用临时 HOME + CODEX_WEIXIN_STATE_DIR + 假 launchctl 全链路验证 start/status。
- 验证结果：npm test 181 项全部通过（含新增 client-control 功能测试：Disabled 不引导、启用态正常引导、status 带 delivery 字段）；安装时运行中保护守卫首次实战拦截（旧实例未退出时拒绝覆盖安装，退出后正常安装）；重装 0.9.7/build 31 签名校验通过并已启动（PID 66668）；真实环境手动执行 start 返回 exit 0 且 delivery:false、serviceRunning:false，微信代理未被复活；runtime 目录已同步新代码。
- 遗留问题：build 31 真机验收（首屏不再弹窗、开始监听按钮行为、面板显示「微信显示已停用」、监听启停、页面自愈）待用户确认；开始监听在停用态的实际语义（仅跳过引导）已在面板文案说明，如需「开启 Codex 完成监听但不开微信」需另立范围。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261109-012] skip disabled agents on start and surface delivery state`；最终哈希按 Change-ID 查询。

## SC-20261109-011 页面自愈看门狗与 build 30

- 北京时间：2026-11-09 20:45:06 +08:00。
- 修改或新增：用户确认卡死发生在新版实例上（非仅热替换旧实例），且症状为页面死亡后语音监听无法停止。实现页面自愈：新增 client/AssistantWatchdog.swift（纯逻辑：陈旧阈值 15s、冷却 30s、最多 5 次恢复、arm/beat/recoveryDue/exhausted）；AssistantBridge 新增心跳定时器（每 5s evaluateJavaScript("1+1"））、`webViewWebContentProcessDidTerminate` 钩子与 `recoverPage`（停麦克风/停播放/复位监听状态/通知宿主与页面/顶部横幅告知/刷新页面）；App.swift 启动看门狗；构建号 29→30。
- 遇到的难题：Swift 顶层表达式仅限 main.swift（夹具改用 @main 结构）；`guard let lastBeat` 遮蔽属性导致赋值报错（改绑定名）；BSD grep 不支持 `\|` 导致误判二进制缺代码（改用 `grep -a` 实证 `startWatchdog` 与横幅文案已入包）；project-docs 版本一致性测试拦截了 CHANGELOG 未同步构建号的问题（已同步 build 30）。
- 处理方式：复用设备变化处理的停监听模板作为恢复路径；恢复上限防止无法自愈的页面陷入刷新死循环。
- 验证结果：watchdog 原生夹具实编译运行通过；`npm test` 178 项全部通过；`npm run build:mac` 重装 0.9.7/build 30，签名严格校验通过，二进制 grep 实证新代码在包内。
- 遗留问题：页面自愈的真机验收（听写启停、刷新后状态一致、横幅告知）待用户重启验证，标注未验收；WebContent 挂起时 evaluateJavaScript 恢复路径依赖主线程存活，主线程自身挂起的场景本轮不覆盖（如实标注）。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-011] self-heal unresponsive HUD page via watchdog`；最终哈希按 Change-ID 查询。

## SC-20261109-010 排查全局点击卡死：听写快捷键 tap 加固与 build 29

- 北京时间：2026-11-09 20:29:29 +08:00。
- 修改或新增：用户补充症状——监听停不了、停止按钮与右侧项目点击无反应、点击其他应用也无反应、只能强退。排查确认主窗口为普通带标题窗口不具备全屏遮罩能力；唯一具备全局鼠标事件拦截能力的组件是 DictationHotkey：其 `.defaultTap` 会话级 tap 同时覆盖鼠标按下与滚轮。本次将其拆分为两个 tap：键盘仍用可拦截 tap（Esc/F8 需吞掉），鼠标与滚轮改用纯观察 `.listenOnly` tap（系统保证不会因它拖住全局事件投递）；超时重启用逻辑改为对两个 tap 幂等重启用。
- 修改：client/DictationHotkey.swift 拆分 keyTap/pointerTap 与对应 runloop source，stop() 成对失效；test/dictation-native.test.mjs 新增源级断言（拦截 tap 永不含鼠标/滚轮事件，指针 tap 必须为 listenOnly）；client/build.py 构建号 28→29。
- 遇到的难题：Swift 回调首参为 CGEventTapProxy 而非 CFMachPort，无法直接重启用对应 tap；源级断言首版切片边界错误（pointerMask 声明先于 tapCreate）。
- 处理方式：改为对存储的两个 tap 幂等重启用；断言改按 tapCreate 语句块切片。另修正测试导入（readFileSync 属 node:fs）。
- 验证结果：npm test 176 项全部通过（含原生夹具 swiftc 实编译运行）；npm run build:mac 重装 0.9.7/build 29 到 ~/Applications/MOSS.app，签名严格校验通过；安装守卫在应用未运行时正常放行。真机行为（听写快捷键、全局点击不再卡死）待用户重启验证，标注未验收。
- 遗留问题：此次卡死事故的直接触发源（0.9.6 实例热替换后网络进程崩溃）与全局点击不可用的完整因果链（tap 风暴 or 系统级降级）未能完全定位——应用已强退无法采样堆栈；已通过消除唯一的全局指针拦截面把同类风险归零。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261109-010] observe pointer events via listen-only tap`；最终哈希按 Change-ID 查询。

## SC-20261109-009 排查页面卡死并加运行中禁止覆盖安装保护

- 北京时间：2026-11-09 20:09:01 +08:00。
- 修改或新增：用户反馈“应用把页面卡死”。排查证据链：16:26 启动的 0.9.6 实例（PID 35829）在 19:52 被 0.9.7 覆盖安装（运行中替换 bundle）；20:02:42 系统日志实锤 `NetworkProcessProxy::didClose (Network Process 0 crash)` + `XPC_ERROR_CONNECTION_INTERRUPTED`，页面请求全部失效即卡死；随后进程退出。结论：运行中覆盖安装导致旧实例 helper 版本错配，非 0.9.7 代码缺陷。
- 修改：client/build.py 在安装步骤前增加运行实例检测（`pgrep -f 'MOSS.app/Contents/MacOS/CodexWeixin'`），命中即中止安装并提示先退出应用；测试补充对应源检查。
- 遇到的难题：应用无自建崩溃日志，且早期 `pgrep` 大小写/路径匹配漏掉实例，后经 `log show` 定位到 PID 与崩溃时间点。
- 处理方式：按证据链确认根因；保护逻辑落在构建脚本而非文档约定，防止复发。
- 验证结果：install-settings 测试 3 项通过，build.py 语法解析通过；`npm test` 全量在 SC-20261109-008 时为 174 项全部通过，本条仅新增源检查（同文件内 3 项通过）。另观察到宿主 Moos 渲染进程（非本项目）约 30% CPU，与本应用无关，如实记录。
- 遗留问题：恢复路径（wechatDelivery=true）仍未真机演练；远端待推。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261109-009] refuse installing over a running MOSS instance`；最终哈希按 Change-ID 查询。

## SC-20261109-008 微信显示停用、积压清理与 0.9.7 构建安装

- 北京时间：2026-11-09 19:58:45 +08:00。
- 修改或新增：用户确认真机播报验收通过（“可以了”）；同时要求不再在微信显示、清掉 900+ 条积压、以后不再存储。① install.py 新增 `wechatDelivery` 开关（默认 false，显式 true 保留）：关闭时微信 bot（`local.codex-weixin-notifier`）与桌面监视（`local.codex-weixin-desktop-watch`）代理仍注册但 `Disabled: true` 并立即 `launchctl bootout`，安装输出明示停用。② 语音提醒成为事件唯一消费方：到达即读入内存并删除文件，播报/丢弃/跳过/无效一律清理，删除失败不影响播报也不重播，非 64-hex 命名文件不碰。③ 版本 0.9.7 / build 28，CHANGELOG/README 同步。
- 遇到的难题：install.py 每次构建都会无条件重写两个 LaunchAgent，仅改 plist 会在下次登录复活微信 bot，必须在构建脚本层面落开关；事件文件是语音提醒的数据源，不能停写，只能改为消费即删。清理过程中有 7 条新事件正在到达（0.9.6 运行中已播报），留待新版构造基线作为历史清理。
- 处理方式：实删历史事件 946 条（其中 `pending` 913 条，19:56 执行）；修正两处编码笔误（install.py 误写 JS 花括号、测试断言误要求删除非事件命名空间文件）。
- 验证结果：`npm test` 174 项全部通过（reminder 18 项含新增消费/清理/删除失败用例，install-settings 2 项源检查）；`npm run build:mac` 输出 `APP_READY` 与「微信提醒已停用」，安装后核对 0.9.7 / 28、签名 deep/strict 通过、runtime 0.9.7、`runtime-settings.json` `{"codex": null, "wechatDelivery": false}`、两 plist `Disabled=true`、launchctl 无微信代理；`git diff --check` 干净。PLAN 与验收记录已回填（真机验收以用户口头确认为证据）。
- 遗留问题：微信显示恢复路径未真机演练（无此需求）；远端仍缺提交，按用户此前指示未推送。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-008] disable WeChat display and consume completion events`；最终哈希按 Change-ID 查询。

## SC-20261109-006 原生验证、夹具修正与打包安装

- 北京时间：2026-11-09 16:27:48 +08:00。
- 修改或新增：执行环境解锁 Swift 工具链后完成原生验证与打包。修正横幅夹具断言（原假设测试环境不真实显示窗口，真实会话中运行失败——恰好证明横幅真实显示；改为“显示后可见、点击后隐藏并回调、顶部居中定位”）；用真实证据回填 PLAN 与验收记录。
- 遇到的难题：环境 PATH 被重置（只剩系统路径，node/python3 不可见），需手动拼接 nvm node v22.22.0 与系统路径；夹具首次真实运行即暴露了此前无法编译时写下的错误假设。
- 处理方式：以真实 GUI 会话行为为准修正断言；构建用 `npm run build:mac`（含 install.py 自动备份 Codex 通知配置、esbuild 场景包、全量 Swift 编译、ad-hoc 签名与安装）。
- 验证结果：本机实际执行：横幅夹具 2 项通过（真实编译 + 真实显示/点击/无焦点/置顶定位/截断/空消息忽略）；`npm test` 全量 **171 项全部通过**（含全部原生夹具，0 失败 0 跳过）；`npm run build:mac` 输出 `APP_READY`，安装至 `~/Applications/MOSS.app`，Info.plist 核对 0.9.6 / build 27，签名 `codesign --verify --deep --strict` 通过，安装二进制含「Codex 本轮已结束」文案。真机播报场景待用户重启 MOSS 后验收，PLAN 相应项保持未勾选。
- 遗留问题：真机自动播报、后台通知横幅、听写互斥与旧链路回归待批次 B；远端仍缺 6 个提交，按用户指示未推送。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261109-006] verify native banner in real session and package 0.9.6`；最终哈希按 Change-ID 查询。

## SC-20261109-005 记录本机打包尝试受阻

- 北京时间：2026-11-09 13:05:57 +08:00。
- 修改或新增：仅操作日志。用户要求直接打包（`npm run build:mac`，含 install.py 配置备份、Swift 编译、dist/MOSS.app 签名与安装到 `~/Applications/MOSS.app`）。
- 遇到的难题：本执行沙箱系统性拦截所有 Swift 编译器进程：Xcode 与 CommandLineTools 的 swiftc 启动即被击杀（Trace/BPT trap 5，`libxcrun.dylib` 等库加载被拒）；提权执行 swiftc 夹具编译、node 原生夹具测试、`python3 client/build.py` 完整打包三次均未获授权；系统无 Homebrew Swift 替代工具链。Python 侧 `/opt/homebrew/bin/python3`（3.14.0）可用，但编译步骤无法绕过。
- 处理方式：如实记录，不虚报打包结果，不把本地提交写成已打包安装；恢复步骤为用户在本机终端执行：① `git push origin feat/global-dictation`（4 个待推提交）② `npm test`（预期 171 项全过，含原生夹具）③ `npm run build:mac`（输出 APP_READY 即安装完成）④ 重启 MOSS 核对关于页 0.9.6 / build 27，再做批次 B 真机播报验收。
- 验证结果：本条为日志记录，无代码改动；`dist/` 当前无 MOSS.app，安装目标 `~/Applications/MOSS.app` 未被本会话修改。
- 遗留问题：原生夹具编译、构建安装、真机验收全部待用户终端执行；完成后按证据回填 PLAN 勾选项。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261109-005] record blocked local packaging attempt`；最终哈希按 Change-ID 查询。

## SC-20261109-004 听写互斥与开关中途关闭补强

- 北京时间：2026-11-09 13:00:40 +08:00。
- 修改或新增：继续按用户「先做功能」推进。修复功能缺口：全局听写回合进行中时完成提醒会立即播报，TTS 声音会被听写麦克风录入、混进用户转写文字；现在 host 把 `dictation.active` 作为额外忙碌条件传入提醒（构造参数 `isBusy`），听写回合内等待，结束后释放。另补：等待空闲期间用户关闭开关，静默丢弃待播提醒（不播报、不报错）。`CompletionVoiceReminder` 新增 `isBusy` 参数与 `busy()` 统一判定；更新 PLAN/CHANGELOG/README/验收记录。
- 遇到的难题：提醒原忙碌门控只覆盖助理服务状态（busy/asrBusy/playing），听写是独立的原生录音链路，助理状态看不到它。
- 处理方式：复用 `AssistantDictationHost.active`（`session !== null` 覆盖录音+识别全程）作为提醒的额外忙碌源，不改听写模块本身；开关中途关闭的丢弃不产生错误提示，因为事件已标记 seen，重新开启也不会补播。
- 验证结果：本机实际执行 `node --test test/reminder.test.mjs` 16 项全部通过（新增听写挂起/释放、静默丢弃、host 接线源码检查）；`npm test` 全量 171 项：165 通过、6 失败（仍全部为沙箱拦截 swiftc 的编译类失败，与本批无关）；`git diff --check` 干净。真机听写与提醒互斥表现待批次 B 验收。
- 遗留问题：原生编译、构建安装、真机验收仍待后续；按用户指示暂不推送，本地提交保留。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261109-004] hold completion reminders during dictation`；最终哈希按 Change-ID 查询。

## SC-20261109-003 界面 toast 升级为屏幕顶部系统级横幅

- 北京时间：2026-11-09 12:52:06 +08:00。
- 修改或新增：应用户「界面 toast 要展示到最上面、最上层可见，目前只在当前项目窗口内显示」的要求，泛化顶部横幅：新增通用 `showNotice`/`show(title:summary:accessibilityLabel:)`，无障碍标签改为通用「MOSS 提醒」，修正 `clear()` 曾把标签填上默认文案而非真正清空的问题；`AssistantBridge` 把 host 的 `notice` 与 `error` 消息同时路由到系统级横幅并保留窗口内 toast；空消息不显示，超长截断 80 字，点击回 MOSS，不抢焦点。同步更新原生夹具断言、PLAN、CHANGELOG、README 与验收记录。
- 遇到的难题：原 `clear()` 走 `apply(project:summary:)` 会写入「未命名项目」与免责文案，夹具「标签初始为空」的断言若真编译会失败（本机未能编译，本次修正语义后消除隐患）；通用通知若沿用完成提醒的空摘要免责默认会把「回合结束不代表代码或测试已通过」错误地附加到普通通知上。
- 处理方式：内容层改为直写标题/摘要，默认文案上移到调用方（完成提醒专用）；通用通知空消息直接不显示；桥接在 notice/error 分支先显横幅再 `emit`，窗口内 toast 行为不变，避免回归。
- 验证结果：本机实际执行 `node --test test/reminder-banner.test.mjs`：桥接源码接线检查通过；`npm test` 全量 168 项：162 通过、6 失败，失败仍全部为 Swift 编译类夹具（沙箱拦截 swiftc/libxcrun），与本批无关；`git diff --check` 干净。提权编译再次未获授权，原生夹具仍未编译。
- 遗留问题：横幅真实编译与真机上「MOSS 后台时收到通知/错误、顶部横幅可见、点击回 MOSS」待 CI 与真机验收；远端仍缺 SC-20261109-001/002/003 三个提交，待用户在有凭据的终端执行 `git push origin feat/global-dictation`。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261109-003] surface assistant notices on the system banner`；最终哈希按 Change-ID 查询。

## SC-20261109-002 记录 SC-20261109-001 哈希与推送受阻

- 北京时间：2026-11-09 12:47:09 +08:00。
- 修改或新增：仅操作日志。回填 SC-20261109-001 实际提交哈希 `b63f7ed`（分支 `feat/global-dictation`，含 21 个文件：提醒服务、横幅与桥接、设置接线、版本 0.9.6/build 27、测试与文档）。
- 遇到的难题：本执行环境无法推送远端。HTTPS 路径：osxkeychain 无 github.com 凭据、`gh` 未登录（`gh auth status` 显示未登录）、终端密码提示不可用（Device not configured）；SSH 路径：密钥认证为 `xuguopeng`，对 `xumuyan/starcore-assistant.git` 无写权限（Permission denied）。
- 处理方式：按规则保留本地提交，不强制推送，不把本地提交写成线上已更新；恢复步骤为用户在有凭据的终端执行普通 `git push origin feat/global-dictation`（同批包含 `b63f7ed` 与本条提交），推送后核对远端并回看 CI（Mac 构建编译原生夹具）。
- 验证结果：本条为日志记录，无代码改动；`git status` 确认待推送提交与工作区状态一致。
- 遗留问题：远端尚未收到 `b63f7ed`；原生夹具编译、`npm run build:mac:check`、安装与真机播报验收全部待后续完成，PLAN 对应项保持未勾选。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261109-002] log SC-20261109-001 hash and blocked push`；最终哈希按 Change-ID 查询。

## SC-20261109-001 Codex 完成语音提醒 服务与顶部横幅实现

- 北京时间：2026-11-09 12:44:24 +08:00（实施开始后本批记录；计划登记于 2026-11-04 提交 `e70650c`，用户批准时间以会话口述为准，未单独存档）。
- 修改或新增：实施 SC-20261104-001。新增 `src/assistant-reminder.mjs` 只读轮询完成事件目录：事件 ID 去重、构造时建立基线不补播历史、开关关闭到达的事件永不补播、忙碌时等待空闲（上限 120 秒）后放弃并提示、同间隔只播最新一轮；`assistant-service` 新增 `codexVoiceReminder` 独立开关（默认关闭）与 `codexReminder`/播报通道（`ignoreSpeakSwitch` 绕过朗读回复开关、不进聊天记录、Fish 失败回退系统声音不重试）；host 每秒同 tick；`AssistantBridge` 新增顶部悬浮横幅 `ReminderBanner`（非激活面板、`.floating` 置顶、不抢焦点、自动隐藏、点击回主窗）；设置页新增「Codex 完成后语音提醒（默认关闭）」复选框；版本升至 0.9.6/build 27；更新 README、CHANGELOG、PLAN 与验收记录。
- 遇到的难题：基线扫描最初放在首次 tick，事件目录尚不存在时历史会误判为新事件；提醒播报若走原 speak 开关会被「朗读助理回复」关闭拦截；屏幕顶部横幅在 MOSS 非前台时无法点击且会抢焦点；本机执行沙箱拦截 Xcode 工具链（`libxcrun.dylib` 无法加载），Swift 夹具与 `build:mac:check` 无法在本会话编译，提权编译也被拒绝。
- 处理方式：基线移到构造时（应用打开瞬间的历史不补播，语义更准）；播报携带 `ignoreSpeakSwitch` 专属放行而不改变原 speak 语义；横幅沿用 `DictationNonactivatingPanel` 模式并加覆盖全幅隐形按钮，`orderFrontRegardless` + `canJoinAllSpaces`，`hidesOnDeactivate=false`；提醒的语音走既有 `speak`/`play` 通道复用 `playbackEnded` 恢复拾音协议；原生验证改为推送后以 GitHub Mac CI 编译结果为准，未验证项如实留空。
- 验证结果：截至 2026-11-09 12:44 +08:00，本机实际执行 `node --test test/reminder.test.mjs` 14 项通过、moss-ui/assistant/project-docs 新增断言通过；`npm test` 全量 167 项：161 通过、6 失败，失败全部为 Swift 编译类夹具且原因相同（沙箱拦截 swiftc/libxcrun），其中 5 项为本批之前就存在的 dictation/pet 旧测试，与本批代码无关；`git diff --check` 干净。原生夹具、`npm run build:mac:check`、安装与真机播报均未执行，PLAN 相应项保持未勾选，详见 docs/verification/2026-11-09-reminder.md。
- 遗留问题：横幅原生夹具与签名构建待 CI/本机构建核对；真机自动播报、旧唤醒/听写/微信回归待批次 B；小爱音箱不纳入本步。解除条件：CI 编译通过后勾选横幅与构建项，备份安装 0.9.6/build 27 并真机验证后才能勾选整项完成。
- 对应 Git 提交：`b63f7ed` — `feat: [SC-20261109-001] announce Codex turn completion with voice and banner`；推送状态见 SC-20261109-002。

## SC-20261101-005 安装读回与权限验收交接

- 北京时间：2026-11-01 20:25:29 +08:00（本批核对与记录时间，不代替每个 UI 操作的精确时刻）。
- 修改或新增：更新实际客户端与 Node 运行源码至 0.7.0/build17，补充安装/回退记录、计划状态和包/原生版本一致性测试。新听写与独立润色默认关闭。
- 遇到的难题：只更新 app 会遗漏新 host 协议；全量安装器会改动现有通知配置。临时签名更新后，真实界面显示麦克风、输入监控和辅助功能均需重新授权。
- 处理方式：确认旧 app 空闲并备份后，仅替换客户端与对应运行源码；严格签名与逐文件哈希读回，原偏好在内存中比较、私有密钥文件只比较哈希，不记录原值。系统权限交给用户在正常设置流程开启；用户已选择自行开启，未确认完成。
- 验证结果：安装版本/build、签名、运行源码匹配；所有原偏好相等、master.key/credentials.bin 未变。真实设置页读回新开关与待授权状态，旧目标、历史、声音保持。集成批次远端与测试/Mac CI 成功；本批新增版本检查，完整 121 项测试已通过（0 失败、0 跳过），diff 检查通过。未调用付费校对或发送业务测试消息。
- 遗留问题：真实系统权限、真人短/长口述、全局触发、目标变化/剪贴板实际写入、重开后的新配置与原语音链路仍待验收；解除条件详见 PLAN 阶段 8。代码/构建/安装通过不等于整个功能已经验收。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261101-005] record installation and pending permissions`；最终哈希按 Change-ID 查询。

## SC-20261101-004 听写控制器 悬浮条与主进程接线

- 北京时间：2026-11-01 19:52:16 +08:00（本批开始记录；不从前批时间推算持续工时）。
- 修改或新增：新增主进程听写路由与原生控制器、悬浮条，接入独立设置与权限状态；继续保留原唤醒、对话和输入协议，默认关闭新增听写。
- 遇到的难题：原生录音、模型识别与异步粘贴要共享同一轮身份；手动取消、设置变更、设备/睡眠变化时都要清理，且只能恢复原来开启的唤醒采集。
- 处理方式：新增可测试的宿主/控制器边界和代次约束，原采集器仅在一轮听写内暂停，按原状态恢复；后台路由在听写期间阻止晚到的旧音频进入共用模型。原协议同步判定，避免无条件 await 引入资源竞态；悬浮条提供有界预览和完整结果复制。质量复核又复现原操作报错后的陈旧忙碌锁、120 秒不规则静音分段尾部填零超限，分别用终止错误状态释放和尾段边界前移修复，并补上回归。
- 验证结果：截至 2026-11-01 20:13:43 +08:00，宿主路由、控制器、悬浮条和设置夹具通过，完整回归 120 项通过，独立场景和原生应用构建通过；arm64 / macOS 13 / 0.7.0 build17 严格签名通过。规格复核发现的同批资源竞争与手动结果缺少预览均已用先失败后通过的回归修复；独立规格复核与质量复核均通过，最后修复后再次完整回归 120 项、原生构建通过（2026-11-01 20:20:28 +08:00 核对）。证据见 docs/verification/2026-11-01-dictation-integration.md。旧版已备份，尚未安装新程序或声明真实人声通过。
- 遗留问题：真实系统权限、真人语音、输入框焦点保持及安装后配置保持，需要按阶段 8 单独验收。
- 对应 Git 提交：`0f8c3c5` — `feat: [SC-20261101-004] integrate global dictation controls`，已推送；[对应 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41306056815) 已成功，结果于本批补记。

## SC-20261101-003 原生录音 热键与输入策略基础

- 北京时间：2026-11-01 18:00:13 +08:00（本批记录时间；不代表全部组件完成）。
- 修改或新增：新增独立原生录音、音频缓冲分段、热键状态机及输入目标/剪贴板适配；新增不操作真实麦克风和业务输入框的 Swift 测试夹具。保留 SpeakMore MIT 说明并随包复制，Mac CI 增加原生回归步骤。保留原有 Microphone 与助理行为，具体接线留到下一批。
- 遇到的难题：120 秒口述要适配 18 秒片段；右 Option 必须区别单按与组合；输入焦点变化和用户新复制的内容不能被异步粘贴覆盖。
- 处理方式：原生组件与旧模块隔离，采用可测试的缓冲/按键/输入策略；粘贴前核对目标和代次，剪贴板恢复核对 changeCount，终端和密码框走手动复制。评审发现并修复只读 AX 角色误判及过期粘贴占用未释放，新增真实私有剪贴板/注入调度回归；热键刷新保持监听状态，耗时回调移出事件 tap。
- 验证结果：原生夹具先因模块缺失失败；过期插入门控回归在修复前失败、修复后通过。2 项 macOS 原生夹具通过，完整 Node 回归 109 项通过，原生构建/签名通过；独立规格与质量复核通过。夹具只使用合成 PCM、纯按键事件及私有剪贴板，不声明真实麦克风、系统热键或实际业务粘贴已经验收。详细证据见 docs/verification/2026-11-01-dictation-native.md。
- 遗留问题：原生模块还需控制器、host 和设置接线；真实权限、人声、TextEdit/浏览器焦点与安装仍按阶段 8 验收。
- 对应 Git 提交：`f25096f` — `feat: [SC-20261101-003] add native dictation primitives`，已推送功能分支；[对应 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41303679258) 已成功，结果于本批补记。

## SC-20261101-002 独立听写服务与兼容配置

- 北京时间：2026-11-01 17:39:11 +08:00（收到完整方案确认后开始本批记录；结束以实际提交为准）。
- 修改或新增：用户确认完整按键语音输入方案；更新设计与阶段 1 状态，在现有 checkout 创建 feat/global-dictation 分支；实现独立 Node 听写服务、兼容设置及专项测试，后续批次再接入原生输入界面。
- 遇到的难题：原助理与听写共用 ASR，取消后的旧推理可能晚到；多段录音需要保持顺序，润色必须与日常聊天隔离。
- 处理方式：独立请求 ID/代次、顺序校验和串行准备/识别；开始时冻结设置，默认关闭新功能和听写润色；不经过普通聊天、TTS、Codex 或聊天历史入口。评审发现的空 envelope、迟到模型加载、润色超时和长文本截断均已补回归并修复；原助理润色默认参数保持原样。按 subagent-driven-development 要求分开实现与复核，最终提交由主代理统一整理。
- 验证结果：本批开始前 61 项完整基线通过；新增听写专项 45 项、相关检查 66 项、完整 Node 回归 107 项通过，diff 检查通过。按要求完成规格复核和代码质量复核；本机实际 Qwen 对合成中文样本识别正确，全程无云端调用。首次失败与修复过程及边界见 docs/verification/2026-11-01-dictation-service.md。根目录规则批次的远端与 CI 成功结果已回填于 SC-20261101-001。
- 遗留问题：原生录音、系统热键、目标粘贴、设置接线及真实人声尚待后续批次。现有应用未安装新模块，原功能继续使用既有运行副本。
- 对应 Git 提交：`d26b9be` — `feat: [SC-20261101-002] add isolated dictation service`，已推送 origin/feat/global-dictation；[对应 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41295284987) 已成功，结果于本批补记。

## SC-20261101-001 仓库规则与全局语音输入计划

- 北京时间：2026-11-01 15:20:14 +08:00（本批次开始记录时间；完成时间以实际提交为准）。
- 修改或新增：建立根目录 AGENTS.md、operatelog.md、PLAN.md；将用户要求的五条规则写入规则文件；补充全局语音输入设计、文档契约测试与 README 导航。已有产品源码与功能行为不变。
- 遇到的难题：用户要求每次改动都关联提交、测试、日志和阶段验收；当前日志不能预先嵌入包含自身的最终 Git 哈希。另一个问题是现有采集按静音分句、ASR 单段最多 24 秒，不能直接等同于全局按键听写。
- 处理方式：使用唯一 Change-ID 关联提交主题，已知历史提交写真实短哈希；计划区分模拟测试、构建、实际验收和远端状态。新听写采用独立状态机、手动结束、多段识别和焦点核验，复用原模型而不改变旧对话路径。
- 验证结果：2026-11-01 15:25:56 +08:00 已确认 4 项文档专项检查及 61 项完整 Node 回归通过。人工核对五条规则、历史 Git 时间、既有版本和新功能未实现状态，检查本地文档链接与提交范围。听写功能尚未实现、未安装、未真机验收；本批不需要重建原生应用，未调用付费服务或改变当前运行程序。最终提交前复跑测试和 `git diff --check`，只有结果通过才提交；远端与 CI 在推送后另行核对。
- 遗留问题：完整书面设计待用户复核；系统热键、输入监控/辅助功能、长口述、粘贴与原有功能回归均待后续实现和验收。解除条件和依赖见 PLAN.md，不把待验收项记为已完成。
- 对应 Git 提交：`b53ccb4` — `docs: [SC-20261101-001] establish project rules and dictation plan`。远端提交已核对；[对应 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41284911713) 的测试和 Mac 构建均通过（结果于本次更新补记，未补造历史完成时刻）。

## SC-20261101-H002 Changelog 历史补齐

- 北京时间：2026-11-01 15:05:17 +08:00（Git 提交时间；具体编辑开始和结束时间未单独核实，本条于 2026-11-01 补记）。
- 修改或新增：CHANGELOG.md 补齐 0.3.0 至 0.6.6 的 11 个已确认版本，以及早期提醒、原聊天续写和各阶段验证说明。
- 遇到的难题：部分旧构建没有明确发布日期，初次 GitHub 提交也没有逐版 Git 历史；独立样片与正式客户端版本需要分开。
- 处理方式：依据已有验收文档和可核验构建元数据整理，缺少日期的只写 build；保留原 0.6.6 条目，不编造缺失版本号或发布时间。
- 验证结果：版本顺序、唯一标题、本地链接、原条目保留与 `git diff --check` 检查通过；远端 main 已核对到该提交。仅文档改动，没有重跑产品语音或付费服务验收。
- 遗留问题：早期逐版代码没有单独 Git 提交，不能据此声称能逐版代码回滚；未确认历史时间继续保留未确认状态。
- 对应 Git 提交：`29c9d1e` — `docs: complete historical changelog entries`。

## SC-20261101-H001 首次 GitHub 源码提交

- 北京时间：2026-11-01 14:43:30 +08:00（Git 提交时间；授权与远端推送晚于本地提交，精确完成时间未单独记入文件，本条于 2026-11-01 补记）。
- 修改或新增：首次上传 Starcore Assistant 源码、公开 README、开发过程文章、CHANGELOG、第三方说明与 GitHub Actions；完善忽略规则和公开文档匿名化。
- 遇到的难题：样片引用被排除的本机验收图片；Node 最低版本过宽；Swift 构建目标与元数据不一致；最初 GitHub 凭据没有目标仓库写入权限。
- 处理方式：样片复用仓库内相同参考图，Node 要求收紧到 22.16.0，Swift 显式部署目标为 macOS 13；经用户确认完成仓库所有者的 GitHub CLI 授权，仅在此仓库配置 Git 凭据助手，未更改其他仓库的系统 Git 凭据。
- 验证结果：干净副本安装依赖、57 项 Node 测试、独立场景和 Mac 构建通过，arm64/部署目标/签名核验通过；远端 main 提交一致，GitHub 的 test 与 mac-build 任务均成功。证据：[首次 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41282920886)。
- 遗留问题：当前为源码预览，不是通用安装包；旧系统实际兼容、真人语音完整体验、微信会话条件及 Codex 升级兼容需分别验收。iPhone 和小爱音箱未实现。
- 对应 Git 提交：`aa672e6` — `feat: initial Starcore Assistant source snapshot`。

## 更早阶段的记录范围

早期开发内容已整理在 [开发过程文章](docs/blog/星核助理从想法到实现的完整记录.md) 和 [CHANGELOG](CHANGELOG.md)。有文档明确记载的阶段日期为 2026-10-30 等；具体北京时间、逐步操作时间与独立 Git 提交并不齐全，未在本日志补造。后续改动从本次开始按 Change-ID 逐批记录。

## SC-20261102-001 MOSS 改版范围与实施计划

- 北京时间：2026-11-02 13:54:56 +08:00。
- 修改或新增：归档用户确认的 MOSS 中间站设计，新增任务/聊天/设置、运行状态、语音明确投递与桌面宠物实施计划；规则同步用户已批准替换旧全屏默认界面。
- 遇到的难题：现有监听重点为结束通知，不能当成完整实时任务状态；新增 UI 与旧回归要求冲突需要按用户最新批准界定。
- 处理方式：保留旧能力和场景资源，新增只读状态源；明确普通聊天、语音执行与听写三个边界；按模块测试、提交和验收。
- 验证结果：文档契约与 121 项完整回归通过，新增 MOSS 设计纳入链接/隐私检查；未声称新功能已实现或安装。
- 遗留问题：MOSS 各模块及真实系统权限/人声验收继续执行；不包含 iPhone 或音响控制。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261102-001] define MOSS implementation scope`。

## SC-20261102-002 MOSS 工作台 状态与宠物集成

- 北京时间：2026-11-02 14:13:57 +08:00（本批核对时间，不冒充每项操作的精确时刻）。
- 修改或新增：新增只读主聊天任务状态源、固定目标的语音明确投递与讨论上下文核验；默认名迁移 MOSS、0.8.0/build18，任务/聊天/设置液态玻璃界面，独立桌面宠物与共享轻量聊天入口。保留听写、微信、原聊天接口和私有存储。
- 遇到的难题：内嵌 Codex 与独立 App 进程不同，长回合开始事件不在短尾窗；旧开始记录不能因重连误报运行；语音疑问不能误投，未选择目标不能隐式跟随最近提醒。
- 处理方式：进程路径/启动时间与可靠事件联合判断，初次有界扫描、后续增量缓存；疑问表达拦截、明确目标固定、引用讨论保守核验。宠物复用现有后端与快照，不创建第二个存储，未知保持未确认，首次不播报历史。
- 验证结果：新增专项与完整 135 项检查通过；原生/场景构建及严格签名通过，规格/质量复核问题均修复。真实只读来源读取 51 主聊天、2 有当前运行依据；未改 Codex 数据或投递业务任务。详细证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：安装后真实窗口、宠物焦点与配置迁移正在验收；麦克风/听写权限、人声与真实微信送达仍单独记录，不能用模拟检查代替。旧版已备份，无关系统配置未改。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-002] build MOSS task and chat workspace`。

## SC-20261102-003 MOSS 安装验收与轻量聊天入口

- 北京时间：2026-11-02 14:26:25 +08:00。
- 修改或新增：完成 MOSS.app 安装、运行源码更新、名称/加密配置核对；增加轻量聊天键盘/菜单入口、宠物窗口可访问名称、关闭清理及默认窗口标题整理，补充原生回归和验收记录。
- 遇到的难题：非激活宠物不能依赖主窗口焦点；交互聊天需要在用户明确打开时才能激活。代码测试、真实菜单打开与权限依赖功能要分开记。
- 处理方式：保留默认关闭和惰性窗口，以统一 openChat 接口连接宠物与键盘入口；启用/重开/展开在真实窗口验收，结束后恢复宠物关闭。不向业务聊天投递测试消息，不调用付费服务。
- 验证结果：135 项完整检查通过、原生构建/签名通过，独立复核通过。真实主界面与轻量聊天/展开、原目标/历史/配置保持已核对；任务状态实际随另一回合结束从 2 运行更新为 1。私有密钥文件哈希一致，原偏好除预期名字/唤醒词/schema 变化外保持。ec06fd3 对应远端测试与 Mac CI 成功；详细证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：真人语音、权限、跨应用听写、微信送达及宠物日常鼠标/多屏反馈仍未实测；系统显示待授权/等待会话，用户完成正常授权后继续。实现/构建/安装不等于这些验收通过。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261102-003] validate MOSS installation and quick chat`。

## SC-20261102-004 聊天首页与原生玻璃材质

- 北京时间：2026-11-02 15:12:16 +08:00。
- 修改或新增：默认进入聊天、菜单聊天优先，聊天顶部增加共享任务状态入口；新增 glass.css 材质层和原生 NSVisualEffectView 透明背景，版本更新 0.8.1/build19，保留任务/设置和原有能力。
- 遇到的难题：原版背景与卡片明度接近，半透明效果难以辨认；单纯提高 CSS 模糊值不能透出窗口外桌面。首页直接列任务也弱化了聊天入口。
- 处理方式：静态色彩/光带拉开层次，浮动侧栏与输入框使用透明填充、高光边缘和投影，原生 behindWindow 提供桌面毛玻璃；正文保持深色，降低透明度偏好可回退。状态按钮仅展示可靠运行信息，不改投递逻辑。
- 验证结果：导航/任务状态专项先失败后通过，完整 135 项回归、原生构建和签名通过；实际安装后首次聊天可见、任务按钮切换及返回通过，原生截图核对材质与正文可读。安装前后偏好完全相等，旧 app 已备份，未发送测试消息或调用付费服务。证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：玻璃视觉是否符合用户偏好仍需反馈；既有真人语音、系统权限、微信送达和宠物多屏项未由本批替代验收。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-004] prioritize chat and enrich glass materials`。

## SC-20261102-005 页面与操作体验修正

- 北京时间：2026-11-02 15:34:45 +08:00。
- 修改或新增：0.8.2/build20，聊天气泡/输入/发送反馈、按需历史检索及回到最新、任务搜索/状态筛选、空结果与稳定轮询卡片；保留原后端和功能边界。
- 遇到的难题：旧版发送即清空导致失败丢草稿；重复点击可能重复提交；轮询持续重建卡片影响操作；新消息总滚到底部打断旧记录阅读，历史搜索占据主聊天区域。
- 处理方式：只在本机接收记录匹配且原稿未继续编辑时清空；错误/超时保留并不重试，缺少目标先阻止；按可见任务签名复用卡片、加入搜索筛选；历史工具按需显示，近底部才自动跟随。
- 验证结果：新增 6 项回归、完整 141 项测试与原生构建/签名通过；已备份安装，真实窗口核对聊天布局、任务搜索空结果和运行中筛选（2/51），临时筛选已清理。发送异常用模拟事件验证，没有向业务聊天投递要求。偏好仅 target 在验收期间变化，未回写覆盖当前用户选择。详细证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：用户对样式的偏好仍需反馈；真实语音、系统权限、微信送达与远端投递的原验收边界不由本批替代。本机接收记录不代表远端确认。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261102-005] polish MOSS chat and task interactions`。

## SC-20261102-006 恢复以聊天为主的形象与语音字幕界面

- 北京时间：2026-11-02 16:15:01 +08:00。
- 修改或新增：0.9.0/build21，移除工作台侧栏与常驻聊天列表，中心 MOSS 形象/实时字幕、下方语音与输入；任务动态/Codex/听写/微信/宠物改为右侧玻璃卡片，记录/任务详情/设置按需展开。
- 遇到的难题：前几轮只把聊天设为首页，仍然保留工作台的信息架构，与用户“助理陪伴聊天、其他能力辅助”的预期不符。恢复形象时也要保留已有历史、设置、任务及草稿保护。
- 处理方式：以用户本轮明确结构覆盖旧导航，复用原桥接和真实事件；新增单页样式和状态卡片，字幕只用纯文本，电平来自真实音频事件，取消详情只关闭面板，不误取消对话。
- 验证结果：完整 142 项检查与原生构建/签名通过；旧版备份后安装，真实窗口核对形象/字幕/语音与辅助卡片，任务详情打开和 Esc 返回通过。电脑操作工具曾超时，恢复状态后重验，没有据此虚报成功。未发送任务、消息或调用付费接口；证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：用户对形象及布局的主观偏好待反馈，既有真人语音/权限/微信送达项仍未由本批替代验收；未扩展产品功能范围。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-006] restore MOSS voice companion home`。

## SC-20261102-007 右 Ctrl 听写 弹框与滚动条优化

- 北京时间：2026-11-02 16:33:15 +08:00。
- 修改或新增：0.9.1/build22，增加右 Ctrl 全局听写预设及设置/校验贯通；统一任务/历史/设置面板的遮罩、居中玻璃、固定标题、关闭和键盘焦点；统一 WebKit 细圆角滚动条与原生聊天覆盖式滚动条。
- 遇到的难题：需明确右 Ctrl 属于听写而非 MOSS 唤醒聊天；左右 Ctrl 与组合键必须区分，滚动长设置时标题和关闭不能丢失，也不能修改系统全局偏好。
- 处理方式：先确认用户意图，再复用独立听写 matcher，以 SDK 物理侧位匹配右 Ctrl；保留原名字唤醒。面板独立遮罩/焦点循环，Esc 关闭面板不取消聊天；滚动条只作用于本应用。
- 验证结果：144 项完整检查与原生构建/签名通过；旧版备份安装，实际选择保存右 Ctrl，偏好仅听写键变化，其他原值保持；截图核对面板和滚动条，Esc 返回通过。详细证据见 docs/verification/2026-11-02-moss.md。
- 遗留问题：听写开关仍关闭，三项系统权限待授权；真实物理键/麦克风与人声尚未验收，未代授权限或自动开启录音。既有语音/微信验收边界保持。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-007] add right Ctrl dictation and refine panels`。

## SC-20261102-008 Ctrl 鼠标组合防误触

- 北京时间：2026-11-02 16:37:21 +08:00。
- 修改或新增：补充 Ctrl＋点击/滚轮取消单按候选的原生事件贯通和夹具，保持 0.9.1/build22，本批为交付前边界修正。
- 遇到的难题：macOS 中 Control＋点击也是组合操作，仅监听键盘会使松开 Ctrl 时误触听写。
- 处理方式：tap 增加鼠标按下/滚轮事件类型，使已有 matcher 取消单按；不读取坐标、不存载荷、不监听指针移动，原操作继续传递。
- 验证结果：144 项完整检查、原生构建和签名通过；客户端已停止后保留前包、安装最终修正并打开。右 Ctrl 设置及名字唤醒边界不变；模拟组合事件通过不代表实际录音权限已验收。
- 遗留问题：真实物理按键/麦克风仍等待正常系统权限与用户开启听写；不代授权限。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261102-008] ignore Ctrl pointer combinations`。


## SC-20261102-009 听写浮条与竖向权限反馈

- 北京时间：2026-11-02 17:08:14 +08:00。
- 修改或新增：0.9.2/build23，三项权限独立竖向卡片、绿/红及文字标识，返回应用刷新；新增查看听写浮条、当前应用 Finder 定位与输入监控缺项说明，原生浮条改真实电平历史波形并增加结束按钮。保留用户已开启的听写、右 Ctrl、校对和原有配置。
- 遇到的难题：权限缺失时 tap 不启动，用户看不到录音反馈；系统列表未列 MOSS 的确切原因无法独立确定。截图工具只显示主窗口，不能据此判断独立浮条。验收过程中应用被移到系统应用目录，旧路径失效。
- 处理方式：复用原浮条，提供不录音、不授权、不捕获设置输入框的可视入口；显示未录音而非模拟录音动画。三权限逐项用系统 API 状态渲染，增加系统＋手动添加说明与 Bundle.main.bundleURL 定位；用户确认浮窗可见后记录证据，移动后以实际运行安装为准，未修改系统权限数据库。
- 验证结果：相关5项及完整145项检查、原生构建/签名/arm64核对通过。旧版、加密偏好和凭据已备份，安装前后配置与凭据字节一致；0.9.2/build23实际窗口确认三行权限，用户启用输入监控后由红变绿，麦克风绿、辅助功能红。用户明确回复看到了待授权未录音浮窗；Finder 定位选中当前应用通过。详见 docs/verification/2026-11-02-moss.md。远端推送/CI结果提交后独立核对，不预填成功。
- 遗留问题：辅助功能待用户正常授权，真实右 Ctrl、人声、识别粘贴及旧唤醒恢复未验收；显示浮条与自动化通过均不替代。未发送聊天/任务/微信测试消息或调用付费服务。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261102-009] show dictation feedback and permission guidance`；前批 SC-20261102-008 已知提交为56fdbfa。


## SC-20261102-010 排查并恢复旧签名辅助功能授权

- 北京时间：2026-11-02 17:19:43 +08:00。
- 修改或新增：新增 macOS 已开启但未授权的排查/恢复说明，纳入文档隐私和链接测试；更新计划与真机验证记录。当前安装仍为0.9.2/build23，未改二进制或签名。
- 遇到的难题：用户截图和现场系统开关都显示允许，但程序读回辅助功能未允许。正常退出重开也未改善，不能归因于用户未开启或仅刷新缓存。预览包使用 ad-hoc 签名，构建更新时可能与旧授权身份失配。
- 处理方式：只读检查当前安装、进程及当前 bundle 的系统权限记录和签名要求，证实输入监控匹配、辅助功能要求不匹配；没有写权限数据库、自动重置或读取其他应用条目。用户本人在正常系统界面移除旧项，重新添加当前安装并开启；本批不重建安装，避免再次改变身份。
- 验证结果：现场读回三项权限均允许、全局按键已就绪；代码要求重新校验均匹配。用户按右 Ctrl 进行真实口述后明确反馈“浮条出现，文字也写入了”，基本链路恢复。文档与完整145项回归通过、0失败/跳过，见 docs/verification/2026-11-02-moss.md；真实口述沿用现有配置，未核对可选校对用量，未另发聊天或投递开发任务。
- 遗留问题：不同应用/焦点变化保护与旧唤醒恢复的扩展验收仍待完成。后续预览构建仍需检查权限，稳定 Developer ID 签名未配置，本机无有效签名身份；未以弱化签名来规避重授权。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261102-010] record permission identity recovery`；SC-20261102-009 已推送提交8b96807，远端CI 41418483877成功。


## SC-20261102-011 全局听写小浮条与直接呈现

- 北京时间：2026-11-02 17:32:59 +08:00。
- 修改或新增：0.9.3/build24，将全局听写188高的大面板缩为208×44主体、含顶部提示78高的小胶囊，左取消/橙色真实电平/右完成；复制回退才展开文字。按键启动先显示准备状态并主动刷新，再做AX捕获与模型准备；预览标记不录音且无需点击。名字唤醒、MOSS对话语音和首页聊天控制未改。
- 遇到的难题：原面板占屏且看起来像需要额外点击；同步输入框查询早于显示会延迟反馈。小尺寸仍需保留复制回退和取消安全边界，不能用假波形表示模型准备完成。原生代码更新改变临时签名，已恢复的旧权限可能失配。
- 处理方式：复用原控制器与非激活浮窗，小尺寸手动布局、圆形控制和单行提示；只在真实录音态显示电平，准备/识别显示短状态，识别回退仍提供复制。新增显示早于AX查询的回归，离屏渲染核对用户截图。备份安装后不再替换固定包，读回权限并让用户通过正常系统流程授权，不绕过权限。
- 验证结果：完整145项回归、构建、arm64与签名核对通过；原生组件渲染核对小胶囊和点击区域，安装前后偏好/凭据保持。安装后最初新签名下三权限均读回未允许；用户随后正常重授权，明确反馈右 Ctrl直接弹出小浮条，实际主界面卡片显示快捷键已就绪。最终145项完整回归与文档检查通过，见 docs/verification/2026-11-02-moss.md。
- 遗留问题：新包重授权与右 Ctrl直接弹出已确认；新包完成/取消点击及重新识别输入尚无单独现场反馈，上一版真实口述不替代该扩展项。稳定Apple签名身份仍未配置。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261102-011] compact global dictation capsule and show immediately`；上批权限恢复记录提交5f80890已推送。


## SC-20261102-012 实现选定方案3的玻璃听写浮窗

- 北京时间：2026-11-02 18:05:55 +08:00。
- 修改或新增：0.9.4/build25，按用户选择的第3张概念改为单块浅色玻璃双行浮窗；上排状态/计时/取消，下排蓝绿真实电平/完成，复制回退与未录音状态保留。新增设计来源、同尺度组件对照、渲染夹具与设计QA，相关文档测试扩展到视觉证据链接。
- 遇到的难题：旧版上下独立深色气泡和橙色大圆按钮不符合用户偏好；原生玻璃受桌面与系统合成影响，不能把生成图直接铺成界面。首轮原生离屏渲染偏灰、字重过大、输出密度不统一。原生包更新也会使临时签名旧权限失配。
- 处理方式：按用户明确选择后才写组件，用原生popover材质、浅色叠层、系统字体与SF Symbols，真实电平仍为数据绘图；调整字重与密度后重新合并比较。只改DictationPanel，不改对话语音、快捷键匹配/控制器、录音或粘贴。测试确认按钮action仍接到旧回调；备份安装后固定包，用户按正常系统流程重授权。
- 验证结果：145项完整回归、面板/控制器专项、原生构建/arm64/签名校验通过；同生产组件渲染和选定图对照通过，设计QA记录环境差异，不代替麦克风验收。当前安装0.9.4/build25核对通过，原加密配置与凭据字节保持。新包三权限最初均读回未允许，已请求用户正常授权及新外观反馈；证据见 docs/verification/2026-11-02-moss.md 和 design-qa.md。
- 遗留问题：当前包真实系统授权与新外观/右Ctrl直接显示、完成/取消仍待用户确认；真实跨应用识别写入扩展项未由渲染或前版反馈替代。稳定Apple代码签名身份仍未配置。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-012] apply selected glass dictation design`；前批SC-20261102-011提交为2f0b4cf。


## SC-20261102-013 补录方案3真机验收

- 北京时间：2026-11-02 18:30:25 +08:00。
- 修改或新增：根据用户对0.9.4/build25的实际反馈补齐计划、验证与设计QA中的授权/外观/右Ctrl直接显示结论；加强计划已完成项的证据非空检查，不改应用源码或安装包。
- 遇到的难题：上一批提交时，新签名权限未生效，不能把组件渲染和前版反馈当作当前包的真机验收；继续替换包又可能使刚完成的授权失效。
- 处理方式：收到用户明确确认后，仅只读核对当前版本和听写就绪卡片，保留原应用与签名；逐项完成有证据的外观/直接显示，保留扩展操作尚无独立反馈的边界。
- 验证结果：用户明确回复“已授权，新外观和直接弹出正常”；当前0.9.4/build25及“快捷键已就绪”核对通过，上一批远端CI 41426283543成功。本批145项完整回归通过（0失败/跳过），文档检查与git diff --check通过，详细记录见 docs/verification/2026-11-02-moss.md。
- 遗留问题：当前版本完成/取消点击、识别粘贴、复制回退与跨应用/焦点保护仍未单独现场验收；不能从本次反馈推断全部已通过。稳定Apple签名身份仍未配置。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261102-013] record selected dictation acceptance`；实现批SC-20261102-012已推送提交01a2495。


## SC-20261102-014 统一设置下拉与滚动条

- 北京时间：2026-11-02 18:58:07 +08:00。
- 修改或新增：0.9.5/build26，新增controls.js/css对设置三个原生select作渐进增强，统一玻璃选单、当前项/活动项/勾选/箭头，支持原键盘与保存；滚动条仅实际滚动时显示，800ms停动后隐藏并保留布局稳定。新增5项专项检查。
- 遇到的难题：系统原生下拉展开不能沿用页面玻璃样式；直接替换字段会影响原值/保存/选项联动。滚动事件不冒泡、不同容器需要独立隐藏计时，菜单还要避免裁剪和旧scroll事件误关闭。加密偏好启动后密文改变，不能仅凭文件字节判定设置丢失。
- 处理方式：保留原select与事件，仅增强外观；combobox/listbox与视口固定浮层、键盘确认与焦点恢复，configured更新后微任务同步，选项用纯文本。capture/passive监听scroll，WeakMap分容器防陈旧计时，锚点实际移动才关闭菜单。安装前备份，启动后在内存比较偏好语义，确认内容一致且未输出明文；凭据字节保持。
- 验证结果：150项完整回归、构建/arm64/签名及当前0.9.5/build26安装核对通过。独立预览验证菜单/键盘/Fish联动、滚动active与idle计算样式、控制台无JS error；真实客户端玻璃选单展开、Esc只关闭选单和静止滚动条隐藏通过。偏好内容及凭据保持，临时页面/服务关闭；见 docs/verification/2026-11-02-moss.md。
- 遗留问题：新签名下语音三权限读回待授权，已请求用户正常重授权；当前包语音回归不能由本批样式测试替代。稳定签名身份仍未配置。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261102-014] unify settings selects and transient scrollbars`；前批验收记录df90ac1已推送。

## SC-20261104-001 登记下一步 Codex 完成语音提醒

- 北京时间：2026-11-04 09:02:06 +08:00。
- 修改或新增：根据用户要求，将 Codex 完成后由 MOSS 自动调用语音播报登记为下一步计划；更新计划日期，新增文档检查约束其暂不实施和未验收状态。
- 遇到的难题：必须区分需求登记与实际开发，不能因已规划就启用播报、改变当前语音流程或标记功能完成。
- 处理方式：所有实施任务保持未勾选，明确等待用户后续开始；计划优先复用现有完成监听、语音服务与音色，包含去重、独立开关及真实播报验收；仅修改文档与文档测试，不重新构建、安装或变更权限和配置。
- 验证结果：人工核对计划与用户本轮范围一致；完整151项回归通过，0失败、0跳过；新增检查确认下一步保持待实施，文档链接/日志字段及git diff --check通过。功能未开发，未进行真实语音播报验收。
- 遗留问题：播报文案、忙碌时处理及失败提示留待后续实施前确认；自动语音提醒尚未实现。既有权限与扩展真机验收状态不由本次计划记录改变。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261104-001] plan Codex completion voice reminders`；上批设置样式提交cc5371d已推送。

## 2026-11-13 12:47:57 +08:00 · SC-20261113-001 · T0 壳改无边框菜单式弹层并接入 beUI motion 控件

- 修改内容：desktop/src-tauri/src/main.rs 全部窗口（含诊断）decorations(false)+transparent(true)+always_on_top(true)+shadow(false)，诊断参数仅保留标题 `diagnostic` 后缀、Regular 激活策略与自动显示 chooser（删除 40px 标题栏补偿）；chooser 缩为 170×54。新增托盘左键锚定：`TrayIconEvent::Click` 事件矩形物理像素解析（兼容 Position/Size 双变体）→ `available_monitors()` 物理匹配显示器 → `anchored_window_origin` 纯函数（居中+工作区钳制+间隙按缩放）→ `set_position(PhysicalPosition)`；点击“历史记录/设置”先隐藏入口条再开页；chooser/history/settings 失焦 `Focused(false)` 自动收起；CloseRequested 仅隐藏。前端新增 desktop/frontend/beui.jsx+beui.css（本地适配 beUI motion Button/Switch/Input，MIT，© 2026 Saurabh Chauhan，来源 https://beui.dev/components/motion ，仓库 starc007/ui-components；Tailwind 类改本地 CSS，未逐像素复制）；probe.jsx 入口条仅两个 beUI 小按钮、设置/历史页换 beUI 控件并移除 BorderBeam 外框；build-frontend.mjs probe 附带 motion 运行时声明；许可归档 licenses/beui-motion-MIT.txt 并更新 THIRD_PARTY_NOTICES.md；卸载未用 clsx/tailwind-merge。
- 测试：新增 Rust `chooser_anchors_below_tray_and_stays_inside_the_work_area` 与改写诊断模式用例；test/desktop-probe.test.mjs 新增托盘锚定/无边框/beUI 归档/依赖锁定用例；test/project-docs.test.mjs 更新下一步引用与 beUI 归档断言；手工验收单 D01/P01 按新弹层行为更新。
- 验证：cargo fmt --check、cargo test --locked 7/7、cargo clippy -D warnings 通过；npm run build:desktop:probe 与 build:desktop:check 构建通过；node desktop/check-native.mjs 九检查点 T0_SELF_CHECK PASS；npm test 280/280；git diff --check 干净。以上均为构建与模拟验证，非真机交互验收。
- 难题与处理：tauri `TrayIconEvent::Click.rect` 为 Position/Size 枚举（物理/逻辑双变体）、`Monitor::scale_factor()` 返回 f64 非 Result，且 `monitor_from_point` 在 macOS 基于 CGDisplayBounds 逻辑点、与物理托盘矩形单位不一致；改为遍历 available_monitors 按物理像素匹配显示器并全程物理坐标定位，逻辑换算仅用于间隙缩放。工具受保护点击此前被焦点校验阻止，本批未注入输入、未绕过。
- 遗留问题：入口条真实位置/外观、失焦收起、点击按钮开页、beUI 动效手感、多屏/全屏/Spaces/睡眠属 D01～D02、P01～P08 手测且全部未测；诊断模式成功不能替代默认透明置顶模式验收。T0 仍未验收，T1 未接入业务。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-001] anchor frameless tray popover with beUI controls`；上批交接提交 6cbf7529e8080c102b98cf22d5c21b323d9b2a95 已推送。

## 2026-11-13 12:55:20 +08:00 · SC-20261113-002 · 记录无边框面板对桌面工具枚举不可用的根因观察

- 修改内容：仅文档——docs/verification/2026-11-12-tauri-t0.md 增补"部署后即时观察"，PLAN.md 当前下一步更新为"不再重试工具点击，直接手测"；无代码改动。
- 验证：新 debug 二进制与构建产物 cmp 一致后覆盖临时 bundle，--diagnostic-controls 启动；screencapture 截屏确认菜单栏为 MOSS T0 Probe 前台（Regular 激活策略生效）、入口条为无边框两枚胶囊按钮；桌面工具两次事务共三次窗口枚举均不含该面板（含其处于前台时），确认此前点击被"目标窗口或输入焦点无法确认"阻止的根因是工具枚举局限（无边框透明置顶面板不在枚举结果），非焦点竞态。按保护纪律未发送点击/键盘、未绕过校验。含私人窗口内容的整屏截图已删除，不入库不作证据。
- 难题与处理：osascript 辅助访问未授权（按规则不新申请权限），改用 screencapture 借用既有录屏授权链路完成视觉核对；桌面事务内 scope=display 截图不可用、仅支持 scope=window，而窗口枚举缺失使该路径终止。
- 遗留问题：托盘左键重开入口条、点击按钮开页、失焦收起、beUI 动效、外部焦点/穿透、多屏/全屏/Spaces 等仍属 D01～D02、P01～P08 手测且全部未测；T0 仍未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261113-002] record frameless panel tool-enumeration finding`；上批 SC-20261113-001 提交 05b6c65824f613bcb6cba666f40e94a70f7b47d8 已推送。

## 2026-11-13 13:26:51 +08:00 · SC-20261113-003 · 诊断自动显示锚定托盘图标

- 修改内容：desktop/src-tauri/src/main.rs 新增 `physical_tray_rect` 助手（物理/逻辑双变体解析，混合变体返回 None），托盘点击与启动自动显示共用；`--diagnostic-controls`/`--show-chooser` 自动显示入口条优先以 `TrayIcon::rect()` 锚定托盘图标正下方，rect 未知时回退居中；新增 Rust 单测与守护测试断言；desktop/README.md 同步说明。
- 测试：cargo fmt --check、cargo test --locked 8/8、cargo clippy -D warnings 通过；npm test 280/280；git diff --check 干净。
- 难题与处理：`.build(app)?` 未绑定导致 `tray` 不在作用域、测试模块 import 缺失，两处修正后通过；无其他难题。
- 遗留问题：锚定自动显示的真机效果与 D01～P08 手测仍全部未测；T0 仍未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-003] anchor diagnostic auto-show under tray icon`；上批 SC-20261113-002 提交 a45050e658d38f1a81fc523b3b3a86da2ec6f400 已推送。

## 2026-11-13 13:36:00 +08:00 · SC-20261113-004 · 修复托盘图标未持久化

- 修改内容：desktop/src-tauri/src/main.rs 新增 `TrayKeepAlive` 状态（TrayIcon 引用计数，最后一个句柄丢弃即移除图标；SC-006 起返回值被丢弃导致托盘图标从未存在），setup 末尾 `app.manage()` 保活；test/desktop-probe.test.mjs 增加 `TrayKeepAlive` 守护断言；docs/verification/2026-11-12-tauri-t0.md 记录发现与修复。
- 验证：cargo fmt --check、Rust 8/8、clippy -D warnings 通过；npm test 首跑 279/1（失败明细未留存），复跑两次 280/280；git diff --check 干净。
- 难题与处理：部署观察发现入口条未出现且托盘图标不存在，读 tauri-2.12.5 源码定位到丢弃返回值即移除状态项，属真缺陷而非观察误差；按引用计数语义用 managed state 保活。
- 遗留问题：托盘图标修复效果与入口条锚定、失焦收起的真机复测未做；D01～P08 全部未测；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261113-004] keep tray icon alive for app lifetime`；上批 SC-20261113-003 提交 d51af09cad64c63cc651247118bab57371ec1194 已推送。

## 2026-11-13 13:40:43 +08:00 · SC-20261113-005 · SC-004 二进制部署复测（只读观察）

- 修改内容：仅文档（docs/verification/2026-11-12-tauri-t0.md、PLAN.md）。复测使用 cmp 校验一致的部署二进制重新启动诊断模式；新增只读 Swift CGWindowList 枚举辅助定位（工具已删除，不入库）。
- 验证结果：诊断自动显示入口条居中可见（tray.rect 未就绪按设计回退）；托盘图标在菜单栏应用菜单右侧真实出现（SC-004 修复生效，且确认旧版图标从未存在）；激活 Finder 后 probe 在屏窗口数为 0，失焦自动收起真机通过。上述均为观察记录，不替代手工验收单。
- 难题与处理：初查时入口条未入截图裁剪区、CGWindowList 不单独列出状态项造成“图标缺失”误判风险，均以区域截图+窗口枚举交叉核实；含私密内容的全屏截图即时删除，未入库未上报。
- 遗留问题：托盘点击重开锚定、页面切换、控件交互、Esc、外部焦点、热键、多屏/全屏等仍待用户按手工验收单反馈；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261113-005] record tray-icon fix retest observations`；上批 SC-20261113-004 提交 08e600e6b904ee02be818c4c418ee26aaae16499 已推送。

## 2026-11-13 13:47:30 +08:00 · SC-20261113-006 · SIGUSR1 诊断钩子复放托盘点击路径

- 修改内容：desktop/src-tauri/src/main.rs 抽取 `toggle_chooser_from_tray` 共享函数，托盘事件与诊断 SIGUSR1 钩子共用；Cargo.toml/lock 新增 signal-hook 0.3；desktop/README.md 记录钩子用法与边界；test/desktop-probe.test.mjs 增加 `fn toggle_chooser_from_tray`、`SIGUSR1` 守护断言；test/project-docs.test.mjs 接受 SC-20261113-005 下一步标记。
- 测试：cargo fmt --check、Rust 8/8、clippy -D warnings 通过；原生自检 9 检查点 PASS；npm run build:mac:check OK；npm test 280/280；git diff --check 干净。
- 难题与处理：闭包 move 与 run_on_main_thread 借用冲突（E0505），克隆 AppHandle 解决；--locked 因新增依赖失败，重新生成 lock 后通过。
- 遗留问题：SIGUSR1 复放的锚定效果待部署复测；真实 CGEvent 托盘点击及 D01～P08 手测仍待反馈；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-006] replay tray-click toggle via diagnostic SIGUSR1`；上批 SC-20261113-005 提交 146882f63ea8b1648a17b5442c8244b233aece0e 已推送。

## 2026-11-13 14:53:49 +08:00 · SC-20261113-007 · SIGUSR1 锚定重开真机验证通过并归档部署陷阱

- 修改内容：仅文档与测试正则（PLAN.md 下一步推进为 SC-20261113-007、docs/verification 增补复测数据、desktop/README.md 增加部署陷阱说明、test/project-docs.test.mjs 接受新标记）；代码侧保留诊断模式 stderr 追踪 USR1_HOOK_REGISTERED/USR1_RECEIVED（SC-20261113-006 已含，本批补记录）。
- 验证结果：显式 cargo build 后，SIGUSR1 复放生产托盘切换路径真机通过——锚定弹出 (693,38)/(675,38) 两次均居中于图标下方且重读实时 rect、收起后 on-screen 窗口为 0、进程存活；npm test 280/280、cargo fmt --check、clippy -D warnings、Rust 8/8、git diff --check 通过。
- 难题与处理：USR1 曾直接杀死进程且无崩溃报告，先用最小 Rust 二进制隔离证明 signal-hook 正常，再定位到部署产物过期（cargo test/clippy/check-native 均不刷新 target/debug 二进制），显式 cargo build 后解决；错误结论（钩子无效）已被正确结论取代并写入 README。
- 遗留问题：真实 CGEvent 托盘点击投递、按钮→页、控件交互、Esc、外部焦点/点击穿透、热键、多屏/全屏仍需人工按验收单反馈；探针保持入口条锚定打开待手测；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261113-007] record SIGUSR1 anchored-reopen verification`；上批 SC-20261113-006 提交 3219b191e095ba3d956db46c04c30808539e1840 已推送。

## 2026-11-13 15:40:56 +08:00 · SC-20261113-008 · 探针应用图标与菜单栏模板字形接入

- 修改内容：新增 desktop/src-tauri/icons/icon.png、icon.icns（1024 squircle + iconset）与 desktop/src-tauri/assets/tray-moss.rgba（36×36 模板字形原始 RGBA）及生成脚本 generate-icons.swift；main.rs 用 include_bytes! 替换旧 20×20 斜线方块并传 36,36；tauri.conf.json bundle.icon 声明；README/验证文档/PLAN/守护测试同步。
- 难题与处理：AI 生图服务 429 月度额度耗尽，改用仓库已有 2026-11-10 设计稿程序化产出；tray-icon 源码确认 macOS 强制 18pt 渲染，36px 位图实现 2x 清晰；首版字形实拍过小（消去法像素差分定位状态项在 (749,758)），放大占比后重拍确认清晰。
- 验证结果：cargo fmt --check、Rust 8/8、clippy -D warnings、npm test 280/280、git diff --check 通过；真机截图确认 Dock 粉色玻璃气泡图标与菜单栏白色三竖条模板字形正常，SIGUSR1 锚定/开关不回归；iconutil 产物非提交脚本自动生成步骤已在 README 注明。
- 遗留问题：AI 原图重绘可待额度恢复后按用户意愿替换；真实 CGEvent 托盘点击与 D01～D02/P01～P08 手工验收仍待反馈；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-008] add app icon and tray template glyph`；上批 SC-20261113-007 提交 4732a59103839801e5d52697d5561b80e3c10c21 已推送。

## 2026-11-13 16:07:32 +08:00 · SC-20261113-009 · 修复并行测试竞争导致的 rust-host spawn 偶发 ENOENT

- 修改内容：新增 test-helpers/rust-host-bin.mjs（ensureHostBinary：二进制缺失时最长等 90 秒）；rust-chat-lifecycle/fish/reminder/state 四个测试文件 spawn moss-host 前先等待，解决 node --test 并行跑多个文件时各自 `cargo build` 重链接窗口期撞 ENOENT 的问题（本日 16:0x 首次 279/1 复现并与 SC-20261113-004 当日现象同因；另因 rust-state 缺 delay 导入曾把 import 漏插，已补齐并单独核对该文件 1.0s 全过）。
- 验证结果：npm test 连续两次 280/280；lifecycle 单文件 HEAD 版与修补版均为 25 pass；计数确认 281→280 的回落是 node --test 把 test/ 目录下空助手文件计为 1 个 pass，助手移至 test-helpers/ 后恢复准确计数。
- 遗留问题：无；对应 Git 提交见本条所在提交，主题 `test: [SC-20261113-009] await rust-host binary to deflake parallel spawns`；上批 SC-20261113-008 提交 f51e703e39e48fa18fdd77eb57eef1a22049ce4d 已推送。

## 2026-11-13 16:47:25 +08:00 · SC-20261113-010 · 诊断 --show-page 标志与页面真机视觉验证

- 修改内容：ControlMode 增加 show_page 解析（严格两段式）；main.rs 抽取生产函数 open_page 供 IPC 命令与诊断标志共用，setup 跳过入口条自动显示后直接开页；--self-check 互斥纳入；desktop-probe 守护断言新增 --show-page/open_page 签名/is_some 与 model 解析用例正则；README、验证文档、PLAN 下一步同步。
- 验证结果：cargo fmt --check、Rust 9/9、clippy -D warnings、npm test 280/280、git diff --check 通过；真机 --show-page history/settings 渲染核对通过（截图含私有内容已即删）；动效时序未机证需人工。
- 难题与处理：首次全量测试超时两小时级——定位为 rust-state 漏插 import 导致 ensureHostBinary 未定义挂起（SC-20261113-009 已修）并以 stash 对照法逐文件排除；页面截图含用户私有窗口内容，按规则立即删除不留证。
- 遗留问题：beUI hover/按压与入场动效需人工目验；真实 CGEvent 托盘点击与 D01～D02/P01～P08 仍待反馈；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-010] add --show-page diagnostic flag`；上批 SC-20261113-009 提交 a8425a0 待随本批一同推送。

## SC-20261113-011 libraries.dev 主语音视觉优先与完整流程预览

- 北京时间：2026-11-13 18:04:56 +08:00。
- 修改或新增：按用户再次明确的方向，将重点从托盘/设置诊断转回 libraries.dev 主语音视觉。effects.jsx 修正原版 240px 环容器、beam/voice 的直接圆角子节点、112px 长文限高，独立 transcript 分词模块保留增量前缀 key、识别/回复分开入场；preview 加默认不播放的完整合成收音→识别→思考→回复→隐藏序列与 timer 清理。同步 PLAN、设计、README、验证记录及相关测试。
- 遇到的难题：原规则会拉宽环形直接子 div；voice 包裹 beam 时无法直接读取内容圆角；长文使浮层内容超出固定高度；参考 voice processing 示例仍与开源包不一致。更新计划时移除了原手工单链接，文档守护复跑为 281/282。
- 处理方式：保持上游原版组件/配色/运动参数，修正宿主布局；分词 offset+word key 与回复独立 key，文本始终 React 转义；本地合成流程只接受静态样例，Esc/隐藏/重播/卸载清 timer；未复制 Pro 代码。恢复手工单链接，新增主视觉优先级文档测试。不动真实麦克风/服务/配置/历史/已安装应用，也未重新部署临时 probe。
- 验证结果：效果专项 5/5；完整回归先 282/282，文档更新后失败一次并修复，最终 283/283（0 fail/skip）；preview/probe 离线构建、Tauri debug 构建、npm run build:mac:check（不安装）通过；隔离 Chromium 两轮实测原版 DOM/Canvas、中文、环 240×240、长文限高、合成识别/思考/回复、Esc 后不重现、听写 orbs、零外部请求/控制台错误。git diff --check 通过。本地预览 HTTP 200，地址 http://127.0.0.1:8765 。详见 docs/verification/2026-11-13-reference-scene.md。
- 遗留问题：未完成上游逐帧时序/性能对比、WKWebView 本批新布局真机目验、真实语音驱动与业务接线；长文滚动能力不由限高检查代替。T0 人工项继续待反馈，但不阻塞隔离主视觉开发；T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-011] prioritize libraries.dev voice scene and flow rehearsal`；前批 51092f248fae5f2d350a61a89bf64e2a0471e912 已核对远端一致。

## SC-20261113-012 修复按键听写预览不可见

- 北京时间：2026-11-13 18:13:54 +08:00。
- 修改或新增：用户反馈唤醒对话可见、按键对话不可见；修复 browser preview 播放按钮强制切回 conversation，新增 dictation 合成序列、按 mode 选序列、切换模式立即 listening/0.4 电平/清空文本、听写隐藏回复阶段选项，增加模式说明。更新效果测试、PLAN、README 与主视觉验证记录。
- 遇到的难题：此前完整播放只支持唤醒；选择听写仍继承 hidden 状态，导致用户看不到长条。需区分浏览器视觉按钮与真实右 Ctrl，不能把预览修复冒充物理热键接线。
- 处理方式：播放不再改 mode；按键听写独立 listening→processing/orbs→hidden，不引入回复播报；沿用 timer 清理与 Esc。未动已安装应用、原生键位、配置或数据。
- 验证结果：效果专项 6/6；npm test 284/284（0 fail/skip）；preview/probe 构建通过；隔离 Chromium 实际验证隐藏态切换立即可见、播放仍保持 dictation、分段文字/orbs canvas、结束隐藏、Esc 后不重现及切回 conversation，零外部请求/控制台错误；临时合成截图确认长条/orbs 显示。git diff --check 通过。本批仅前端和文档，无原生改动，未重跑 Mac 构建。预览服务复用 http://127.0.0.1:8765 。
- 遗留问题：用户仍需刷新后确认可见；若用户所指是真实右 Ctrl 而非网页预览，需另按真实运行链路定位，本批不声称修复真实热键。T0 未验收，T1 未启动。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261113-012] show and rehearse selected dictation mode`；前批 c2406b10386bf631fc125fb4aba7ec2ae55203aa 已推送。

## SC-20261113-013 主语音状态衔接与长文字跟随

- 北京时间：2026-11-13 18:25:13 +08:00。
- 修改或新增：按用户“继续”推进主视觉，不扩展托盘诊断。新增共享 TranscriptViewport 与尾部判断函数：新文字跟随到底部、上翻保位、回到底部恢复；听写固定 orbs 槽位与独立长文字限高；两种浮层本地轻量入场及 reduce 兼容；新增可复现隔离浏览器检查脚本。同步 PLAN、README、验证记录和测试，记录用户已确认按键合成预览可见。
- 遇到的难题：长回复虽限高但新文字不自动露出，直接强制滚动又会打断上翻阅读；听写仅 processing 挂载 64px orbs，导致短文本长条状态切换变高。既有浏览器验证位于 /tmp，无法随代码重跑。
- 处理方式：根据滚动事件在 24px 末尾容差内恢复跟随，只在 text 变更且处于跟随时 layout commit 滚到底部；固定槽位预留空间，orbs 仍仅 processing 挂载；新增仓库脚本仅本地合成页面测试，不安装/下载 Playwright、不进行系统输入注入。reduce 仅保证本地 CSS 动画关闭，不扩大到上游 Canvas；Esc 仍立即卸载。
- 验证结果：效果专项 7/7；npm test 285/285（0 fail/skip）；preview/probe 离线构建通过；新仓库浏览器脚本实际 Chromium 通过尾部跟随/上翻保位/恢复、圆环尺寸、听写槽位稳定与限高、前缀节点保留、reduce、模式播放、Esc 后无重现、零外部请求和控制台错误。git diff --check 通过。无原生修改，本批未重跑 Mac 原生构建。
- 遗留问题：用户确认仅覆盖按键合成预览可见；本批新衔接手感仍需用户目验。WKWebView 本批布局、真实右 Ctrl/录音/输入、上游逐帧对照仍未验收；T0 未验收，T1 未启动；预览继续使用 http://127.0.0.1:8765 。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-013] stabilize voice transitions and streaming text`；前批 6d8df45ed0cddfb67be26630d390c44f1f444a60 已推送。

## SC-20261113-014 对话状态对照与圆环位置稳定

- 北京时间：2026-11-13 19:08:37 +08:00。
- 修改或新增：按用户继续要求核对 libraries.dev voice-ring/voice 公开示例与本地类型，固定 112px 字幕槽位使对话无文字/首段/长文/思考/回复时圆环位置不跳动；补空文字思考/回复提示，processing 显式零电平；扩展仓库浏览器检查和 SSR/源码测试。同步 PLAN、README、验证记录。按用户要求本次及后续交付附具体下一步。
- 遇到的难题：总高度随文字出现变化，grid 居中把圆环上推；空文字 processing/speaking 原无提示。voice processing 上游网页与当前开源包仍不一致，不能擅加 Pro 能力。
- 处理方式：字幕占位常驻但收音无文字仍不挂载文字光效；状态提示只在空文字思考/回复显示，回复字幕单独入场、圆环 Canvas 保持；上游配色/速度参数不改，未复制 Pro 代码或连接麦克风。
- 验证结果：效果专项 8/8；npm test 286/286（0 fail/skip）；preview/probe 构建通过；隔离 Chromium 实测圆环 y 坐标跨各状态稳定、Canvas 身份保留、回复组重挂载、空文字提示，以及之前跟随/上翻/听写/reduce/Esc/零外部请求与控制台错误全部通过。git diff --check 通过。无原生修改，本批未重跑 Mac 构建或更新临时 probe。
- 遗留问题：非参考站逐帧/性能验收，WKWebView 本批布局、真实语音/按键/输入仍未验收；T0 未验收，T1 未启动。下一步检查目标浮层/窄屏尺寸边界和长文容纳，整理真实服务事件到视图状态的映射，尚不接真实服务。用户可刷新 http://127.0.0.1:8765 查看，本批不要求操作。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261113-014] anchor voice ring across conversation phases`；前批 bf66273147c969c5cba33f8403f25043bbcc1eba 已推送。

## SC-20261113-015 目标画布与窄屏边界验证

- 北京时间：2026-11-13 19:18:34 +08:00。
- 修改或新增：浏览器预览默认 620×440 画布/24px 内边距，新增 320×440 窄屏选项和仅预览的虚线边界；扩展可复现浏览器矩阵，复用生产 probe.css 在 620/390/320×440、16/32px 字体、各对话/听写状态、空文字/无空格长文检查效果/圆环/卡片容器边界和横向溢出。同步 PLAN、README、验证记录与单元测试。
- 遇到的难题：此前宽屏预览不能直观看目标浮层边界；实际尺寸矩阵未发现需要修改共享组件的裁切问题。浏览器矩阵初次 40s 超时；扩展长文确认后一次打印 PASS 但结束阶段超时。
- 处理方式：给预览显式目标画布，不为未复现问题改组件/原生尺寸；矩阵单条长文减少重复量，原有约 2000 字滚动测试保留；HTTP 清理增加 closeAllConnections，最终脚本完整正常退出。只检查合成页面，不操作系统桌面。
- 验证结果：npm test 287/287（0 fail/skip；效果专项 9 项包含其中）；preview/probe 构建通过；最终 Chromium 脚本实际正常退出通过预览尺寸切换、边界矩阵及此前全部检查，零外部请求/控制台错误；git diff --check 通过。无原生改动，本批未重跑 Mac 原生构建或安装。
- 遗留问题：几何包含不代表每个辉光像素无裁切，WKWebView/真实多屏全屏/真实语音输入仍未验收，T0 未验收，T1 未启动。下一步梳理服务输出到视图状态映射与取消/迟到规则，先用合成事件验证；本批未完成该映射，不声称已接真实服务。用户可刷新 http://127.0.0.1:8765 切换画布查看，暂不要求操作。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261113-015] verify overlay bounds and expose target canvas`；前批 ae18812e056bbb860b42af53ba539e528cf93268 已推送。

## SC-20261113-016 隔离语音视图事件与迟到结果防护

- 北京时间：2026-11-13 19:47:27 +08:00。
- 修改或新增：读取 assistant-service、assistant-dictation、dictation-host 与 Swift DictationController，记录当前事件和接线缺口。新增默认隐藏的纯视图 reducer（统一 run/seq 水位、合法阶段、电平源、8000 字符视图限制），新增显式“测试取消与迟到事件（合成）”按钮/固定轨迹；对话取消后迟到回复不能重现、旧回合不能覆盖新听写、busy 不抢占不排队，Esc/重播清理。同步 PLAN、README、验证记录与专项测试。
- 遇到的难题：旧对话对外事件没有统一回合 ID，assistant message 先于实际播放且可能关闭朗读，不能直接映射成播放；听写服务没有增量文字事件，视图互斥也不能证明服务单消费者。全量初跑 293/294，既有 rust-host serve chat 测试在第252行读取不存在响应 type；原因未确定，不猜测为已修复。
- 处理方式：建立仅浏览器隔离使用的拟议协议，不改旧业务/宿主/权限/配置，不在收到旧回调时套当前 ID；文档明确串行投递序号、异步代次、实际取消/插入/播放职责和后续缺口。失败项单独重跑 rust-host 8/8，随后两次完整回归均通过，保留首次失败记录而不无关修改代码。最终日志检查发现“对应 Git 提交”字段缺空格，已修正并重新回归。
- 验证结果：视图 reducer 专项7/7（含100轮旧回合水位及固定轨迹），与效果专项合计16项；完整 npm test 最终两次294/294（0 fail/skip）。preview/probe构建通过；隔离 Chromium 实际检查取消后无 Canvas、新听写文字未被覆盖、忙时 begin 拒绝、结束隐藏、重播及Esc清定时器，原布局/长文/电平外观/零外部请求与控制台错误检查继续通过；git diff --check 通过。无原生改动，未重跑Mac构建、未安装/替换应用。
- 遗留问题：没有业务IPC/真实取消/播放/插入验收，旧对话回合关联与单消费者仍待T1；本批reply仅合成回复外观，不能声称真实音频开始。T0未验收，T1未启动。下一步区分文本就绪、TTS准备、实际播放、静音回复及连续收音的状态契约并做合成验证，真实接线保留门槛。用户暂不需要操作，可刷新预览查看新按钮。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-016] guard synthetic voice view runs and late events`；前批74f0ccab133a3508356a8d4491cd607c57d05d23已推送。

## SC-20261113-017 回复就绪与播放生命周期分离

- 北京时间：2026-11-13 20:33:12 +08:00。
- 修改或新增：纯视图 reducer 新增 activity，区分 ready/synthesizing/playing/completed/muted/playback-failed；reply 只表示文字就绪，只有 playback-started 进入 speaking。回复卡增加状态提示且字幕组跨播放阶段保持；新增四分支合成选择（正常播放后恢复收音、关闭朗读、播放失败、生成中取消），继续收音须结束旧 run 后显式新 begin。同步 PLAN、README、协议/验证记录、单元与浏览器检查。
- 遇到的难题：旧合成 reply 直接进入说话外观，会混淆文字与音频；上游仅有限几种视觉状态，零电平 listening 外观不能被解释为真实录音；取消/失败后的迟到播放器回调必须拒绝。一次文档更新脚本因 stdin 编码 SyntaxError 未执行，未将该次视为文档已更新。
- 处理方式：用 activity 守卫业务语义、phase 仅选择上游原版外观，不改上游配色/速度；ready/TTS/静音/失败/完成均不吃输入电平，output 仅 playing；失败保留文字且不自动重试，取消清空并关闭。文档脚本显式 UTF-8 后重新更新与检查。未改旧服务/Swift/Rust/权限/配置，不替代既有声音回退。
- 验证结果：视图专项12/12，效果专项9/9；完整 npm test 最终299/299（0 fail/skip）；此前添加末条测试前298/298。preview/probe 离线构建通过；Chromium 实际 DOM/Canvas 四分支的 activity/phase/提示/电平、保留回复与字幕组、完成清零、新 run 收音、取消迟到回调与Esc清定时器通过，原长文/边界矩阵/离线检查继续通过。git diff --check 通过。无原生改动，本批未重跑 Mac 原生构建，未安装/替换应用。
- 遗留问题：仍是合成播放器/输入确认，不证明真实音频开始、停止、错误或恢复录音；T0 未验收、T1 未启动。既有“播放完整语音流程”仍直接驱动外观，下一步统一到事件状态层并保留手动外观检查，避免两套合成流程语义分歧；真实接线继续遵守 T0/T1。用户暂不需要操作，可刷新 http://127.0.0.1:8765 选播放分支查看。
- 对应 Git 提交：本条所在提交，主题 `feat: [SC-20261113-017] separate reply readiness from playback lifecycle`；前批 0dc9c74d436fd7bfaec8b79dfc8e2cd819abffc1 已推送。


## SC-20261113-018 透明语音画布

- 北京时间：2026-11-13 21:12:25 +08:00。
- 修改或新增：按用户要求去掉预览画布深色底板与虚线，html/body/root 显式透明；保留原版圆环/文字卡片/听写条自身表面和浏览器控制栏。更新相关测试、浏览器透明检查及 PLAN/README/主视觉验证记录。
- 遇到的难题：原生浮层已配置透明，但预览样例另加 #111 背景造成黑色矩形；普通浏览器默认底色不等于桌面透底。首次及日志更新后全回归均为 299/300（中间一次 300/300），既有 rust host serve chat speaks the relay protocol 在 test/rust-host.test.mjs:252 读取 undefined.type 失败，与 SC-016 同类现象，原因未确定。一次日志写入命令因参数误含 null 被工具拒绝，未执行。
- 处理方式：仅移除预览画布背景/边界并显式根透明，不改上游组件配色、原生代码或用户配置；读取计算样式并在内存透明截图中检测四角 alpha，避免仅凭 CSS 声称透明。Rust 相关文件独立重跑 8/8，随后完整回归通过，未将该偶发失败声称为已修复。日志改用无 null 的 Python 写入。
- 验证结果：相关 effects/probe 测试 15/15；preview/probe 构建通过；Chromium 隐藏/对话 listening/听写 processing 的根及画布计算背景透明、画布四角 alpha=0、圆环 Canvas 角点 alpha=0，既有布局/状态/取消/离线检查通过；完整 npm test 曾重跑 300/300，随后同一既有 Rust 用例再次失败 299/300，最终完整重跑再次 300/300（并不代表偶发问题已修复）；相关 effects/probe/docs 最终 33/33。git diff --check 通过。本批未修改原生代码，未重跑 Mac 原生构建，未安装或替换应用。
- 遗留问题：浏览器透明网页不穿透浏览器本身显示桌面，原生 WKWebView 桌面透底与多屏等仍待 T0 实测；文字卡片保留原版深色表面，不意味着卡片也完全无背景。T0 未验收、T1 未启动，真实服务未接线。下一步统一完整合成流程到事件层；用户可刷新预览确认视觉，无需配置权限。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261113-018] make voice preview background transparent`；前批 7e6ef17a921b5f9f53a3ff397f6221531489d474 已推送。


## SC-20261113-019 主完整合成流程统一事件层

- 北京时间：2026-11-13 21:30:27 +08:00。
- 修改或新增：将 reference-sequence 从直接 phase 帧改为不可变事件轨迹；主完整流程按当前模式进入 EventRehearsal，与取消/四分支共享 reducer 及计时器所有者，删除 preview 重复计时流程。对话完整演示文字就绪→TTS→播放确认→完成保留文字→结束旧 run→新 run 收音→隐藏；听写保持文字/orbs/隐藏，无播放或插入确认。新增返回手动外观检查按钮，保留透明背景；同步 PLAN、README、两份验证记录与测试。
- 遇到的难题：旧主流程直接写 speaking，绕过 SC-017 生命周期；重播/跨演练切换可能遗留旧定时器；统一后隐藏演练仍在挂载，需要明确返回手动而不能把手动外观等同真实服务状态。
- 处理方式：所有主流程事件经既有 reducer 状态守卫，回复增量仅在 ready 阶段，播放/输入确认仍为 fixture；重播或切换以 key 卸载旧实例清理所有定时器，结束保留隐藏状态供观察，显式返回或 Esc 恢复手动控件。run 从 1 起仅限隔离实例，不宣称生产全局关联；不接服务/原生 IPC，不动配置或上游组件配色。
- 验证结果：effects/state 专项23/23，连同文档41/41；preview/probe 离线构建通过。Chromium 检查主对话全过程 activity/level、新 run 清文字、主听写增量/orbs/结束、重播重置、切到取消实验后旧恢复计时不重现、返回手动解锁并可用；透明 alpha、长文/几何矩阵、四分支/取消/离线检查继续通过。完整 npm test 301/301，git diff --check 通过。无原生代码修改，本批未重跑 Mac 原生构建，未安装/替换应用。
- 遗留问题：本批全部合成，不证明录音/播放确认或输入写入；任意阶段取消（特别播放中）及活动中返回手动的完整浏览器矩阵待下一批。真实服务/原生桌面透底等仍未验收，T0 未验收、T1 未启动；既有 Rust 偶发协议测试问题未改，本批首次全回归未复现。下一步补上述取消矩阵；用户暂不需要操作，可刷新预览看完整流程与透明画布。
- 对应 Git 提交：本条所在提交，主题 `refactor: [SC-20261113-019] route full voice rehearsal through event state`；前批 6554124233e85912737c5104470a7a224b54218d 已推送。


## SC-20261113-020 隐藏文字区滚动条

- 北京时间：2026-11-13 22:56:49 +08:00。
- 修改或新增：按用户截图反馈隐藏 voice-content/dictation-text 滚动条，使用 scrollbar-width:none 与 WebKit scrollbar display:none/零尺寸；仍保留 112px 限高及 overflow-y:auto，透明画布和原版卡片配色不变。更新专项测试、浏览器滚轮检查、PLAN/README/验证记录。
- 遇到的难题：直接禁用 overflow 会丢失长文阅读/尾部跟随；首次 Chromium 检查在既有四分支断言得到 completed 而不是 playing，原脚本时钟 install 后未暂停，可能受实耗时影响，不能将该次写为通过。
- 处理方式：只隐藏两种文字区的滚动条，不影响设置/历史页与网页本身；增加计算样式及真实浏览器滚轮 scrollTop 验证。测试时钟在 install 后显式 pauseAt，确保各 runFor 间不混入渲染实耗时，再重跑完整浏览器脚本通过；不修改业务状态逻辑或原生鼠标穿透。
- 验证结果：effects 专项11/11，含文档29/29；preview/probe 离线构建通过；Chromium 两文字区的标准/WebKit 隐藏样式、滚轮上翻、增量文字上翻保位及回尾跟随通过，透明 alpha/长文/布局矩阵/全流程与离线检查继续通过。npm test 302/302，git diff --check 通过。无原生代码改动，本批未重跑 Mac 原生构建，未部署/替换应用。
- 遗留问题：WKWebView 真机隐藏滚动条观感未验收；原生 overlay 仍鼠标穿透，不声称本批实现原生交互滚动。真实录音/播放未连接，T0 未验收、T1 未启动。下一步继续主流程各阶段取消及活动中返回手动的无迟到重现矩阵；用户可刷新预览看变化，暂不需要授权或其他操作。
- 对应 Git 提交：本条所在提交，主题 `fix: [SC-20261113-020] hide transcript scrollbars while retaining scrolling`；前批 fcb4ed2a07788b928e0f5d3f0f4322e29a906522 已推送。


## SC-20261114-001 主流程阶段取消与手动返回验收

- 北京时间：2026-11-14 09:20:15 +08:00。
- 修改或新增：用户明确不换框架、候选仅了解，继续 Tauri 主语音工作。本批只扩展测试：对话 7 阶段/听写 2 阶段 × Esc/隐藏/返回手动共 27 组浏览器矩阵；检查立即卸载、手动控件解锁清空、越过旧期限不重现及后续手动模式/文字不被覆盖。reducer 对完整流程每个活动前缀取消并验证同 run 后续拒绝/新 run 显式开启。同步 PLAN/README/两份验证文档及文档测试。
- 遇到的难题：首次矩阵逐次 runFor 执行大量上游 Canvas 动画帧，180 秒工具超时，未记录为通过；不能以模拟退出声称音频或全局 Esc 已验收。
- 处理方式：保留既有逐段 runFor 全流程断言，仅新增期限矩阵改用暂停时钟 fastForward，检查一次性事件和卸载后的旧期限，不作逐帧动画证明；生产视图、状态协议与事件计时器无修改。
- 验证结果：effects/state 25/25，连同文档 44/44；preview/probe 离线构建通过；修改快进策略后完整 Chromium 检查通过，27 组全部断言且零外部请求/控制台错误，原透明/文字滚动/几何及生命周期检查继续通过。npm test 304/304，git diff --check 通过。无原生代码修改，本批不重跑 Mac 原生构建，未安装或替换应用。
- 遗留问题：物理 Esc/真机录音与播放停止、WKWebView 透明/滚动条/多屏行为未验收；T0 未验收、T1 未启动。既有 Rust 偶发协议测试问题未修改，本次全回归未复现。下一步整理服务接线前适配器契约及缺口清单，暂不订阅真实服务；当前无需用户授权或操作。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-001] cover full-flow cancellation and manual return`；前批 ceca3e6aec48b83c828b84cb75ba69822d2c0834 已推送。


## SC-20261114-002 真实服务接线前契约与缺口核对

- 北京时间：2026-11-14 09:44:47 +08:00。
- 修改或新增：核对 Node assistant-service/host、听写服务与门闩、Swift AssistantBridge/AssistantPlayback/DictationController、Rust chat/serve；新增接线前契约文档与 4 项离线测试，覆盖现有播放身份差异、原始事件不可直接驱动视图、最终 ASR 晚到与文本上限。整理 epoch/run/origin/operationId、UUID/attempt、串行 seq、真实播放确认、逐资源取消、写入/复制边界及 G1～G6 未完成项；同步 PLAN/README/事件记录和文档检查。
- 遇到的难题：旧文档仅概述缺少对外身份，易忽略 Swift 已有对象守卫与 Rust playbackId；现有结束回调把完成/失败/取消合并，系统 speaking 在真正开播前发出。最终听写结果晚于 process，当前 reducer 不接受 transcript；视图 8000 与业务 16000 也不同。首轮相关测试 36/37，新增检查把表格“聊天/润色/TTS transport”误匹配为行首 transport，断言失败。首次追加日志的 Python stdin 因 Non-UTF-8 SyntaxError 未执行，其后测试虽 308/308，但当时没有写入本条日志。
- 处理方式：按各链路分别列事实与拟议职责，不改旧代码或冒称没有任何播放回调；记录不可直接映射、失败回退 attempt、晚到最终 ASR 和资源释放的缺口，不擅自放宽 reducer。修正测试表格行标题后重跑通过。日志改用 UTF-8 文本文件追加再验证。契约测试明确 reducer 不认证 origin，未来需协调器/受限 IPC 前置验证，不用视图隐藏替代停止确认。
- 验证结果：相关契约/state/docs 37/37，npm test 308/308（0 fail/skip），git diff --check 通过。实际完成源码核对、离线契约与链接/隐私检查；本批仅文档与测试，无前端运行代码或原生修改，未重跑 preview/probe 构建、Chromium 或 Mac 原生构建，未安装/替换应用。
- 遗留问题：契约不是适配器实现，G1～G6 全部未验收；没有真实订阅、录音/播放/写入或资源取消确认。T0 未验收、T1 未启动。既有 Rust 偶发协议测试未修改，本次全回归未复现，不能声称已修复。下一步建立默认关闭、无服务依赖的纯合成协调器契约模型，验证身份/seq/资源门闩；不接硬件、不迁移框架或安装 NSH，当前无需用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `docs: [SC-20261114-002] define voice adapter contracts and integration gaps`；前批 fd8a514b819f4035dc37059c02b1ebc7aa484107 已推送。


## SC-20261114-003 离线语音协调器契约模型

- 北京时间：2026-11-14 10:07:09 +08:00。
- 修改或新增：新增 test-helpers/voice-coordinator-model.mjs，仅测试显式启用，不接应用/预览。原始不可变 session/ticket 模拟可信入口，跨模式单槽位、epoch/run/UUID/attempt 身份、统一 seq、准备期隐藏、capture 释放才 process、取消先失效回调并隐藏、各资源停止确认齐全才接新 run；耗尽不回绕，drained 后才新 epoch。新增 19 项专项测试，含 24 种释放顺序、Promise 迟到结果、播放中取消、旧 epoch 相同播放 ID、准备/活动期 end/fail/cancel 及生产路径未导入检查。同步契约进展、独立验证文档、PLAN/README 和文档测试。
- 遇到的难题：不能把模型对象身份当成跨进程认证，或把合成 stopped=true 视作设备已经停止；取消需立即隐藏但不可放开仍被 ASR/transport/player/writer 占用的资源，计数耗尽也必须给终结事件保留安全序号。现有最终 ASR 在 process 后无法展示的缺口不能借模型擅自改协议。
- 处理方式：将模型放测试辅助目录，无业务依赖、计时器、网络、OS 或配置改动；用原对象 lease 拒绝字段复制/外部/旧实例回调，原 operationId 在 epoch 内不复用。投递按来源白名单，只取 view 数据，忽略调用方 run/seq；保留末序号给 close。release 必须原 lease 且严格 stopped=true，失败/缺失确认持续受阻；文档明确无真实队列、采样合并、IPC、安全认证、停止/abort 或粘贴撤回实现，G1～G6 未验收。
- 验证结果：最初 14 项模型专项通过，补齐边界后 19/19；相关 model/contract/state/docs 56/56，最终 npm test 327/327（0 fail/skip），此前增补末条前完整 326/326；git diff --check 通过。本批实际验收仅离线模型、合成异步轨迹及文档/链接/隐私检查，无前端运行或原生代码修改，未重跑 preview/probe 构建、Chromium 或 Mac 原生构建，未部署/替换应用。
- 遗留问题：模型不是生产协调器、硬件单消费者或真实取消证据；T0 未验收、T1 未启动，G1～G6 保持未完成。既有 Rust 偶发协议测试未修改，本批全回归未复现，不声称修复。下一步补正常完成/静音/失败后 drain→输入恢复→新 run 与断连迟到确认组合轨迹；仍不接真实服务/麦克风/播放器，不迁移框架或安装 NSH，当前无需用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-003] model voice ownership sequencing and resource drain`；前批 5f3e6550f467f97b39528f3c1171ba912c158c64 已推送。


## SC-20261114-004 完整恢复轨迹与断连门闩

- 北京时间：2026-11-14 11:44:40 +08:00。
- 修改或新增：离线 VoiceCoordinatorModel 增加 connected 快照及 disconnect(epoch)，仅当前 epoch 断连可关闭视图/阻止新预约；所有资源 drain 后仍保持离线，仅完全 drained 后显式新 epoch restart 才重新接收任务。新增恢复测试文件 19 项：四种结果（完成/静音/播放失败/合成失败）的全部释放排列/end 插入位置，跨两种下一轮模式共 112 条恢复轨迹；10 个断连阶段、空闲断连、Promise 延后停止确认、缺确认持续受阻、听写 ASR/writer 门闩及证据文档检查。同步 PLAN、README、模型记录和文档测试。
- 遇到的难题：先前模型只有 close/restart，资源 drain 后无法表示“仍断连不可接新任务”。断连下迟到停止确认必须区分保留的本地资源 owner 与来自断开传输的业务事件，不能匿名放行，也不能用 timeout/restart 绕过 ASR 占用。首轮模型/恢复专项 33/35，两项测试把现有 activity playback-failed 误写为 failed。
- 处理方式：先标记 disconnected，再 fail 关闭旧回合；release 继续只认原本地 ticket 与严格 stopped=true，缺确认不释放，旧 epoch 的 disconnect 不作用于新实例。测试穷举 end 前/后释放竞争，断言结果保留文字/零电平、drain 不等于 end、reservation/acquire 不等于录音，必须新 capture inputReady 才 begin；修正测试活动名，不改 reducer。文档明确无真实断连/重连、订阅清理、停止执行或设备确认。
- 验证结果：补齐合成失败断连和听写后模型/恢复专项 37/37；新增证据检查后相关 model/recovery/contract/state/docs 75/75，npm test 346/346（0 fail/skip），git diff --check 通过。实际验收仅离线模型、合成异步/矩阵轨迹与文档检查。无应用/前端/原生运行代码改动，未重跑 preview/probe 构建、Chromium 或 Mac 原生构建，未部署或替换应用。
- 遗留问题：T0 未验收、T1 未启动、G1～G6 保持未验收；资源 stopped 与 inputReady 均为测试调用，不证明物理停止/输入恢复，不能自动撤回系统粘贴。既有 Rust 偶发协议测试本批未复现、未修复。下一步交叉验证断连与计数耗尽，并明确 meter 合并不吞终结事件的离线调度契约；不连接服务或设备，不新增授权，不迁移框架，当前无需用户操作。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-004] verify voice recovery and disconnected resource gates`；前批 834f5ebbb2357168d70e157f69f5804821f87bad 已推送。


## SC-20261114-005 离线电平合并与断连耗尽交叉验证

- 北京时间：2026-11-14 11:52:09 +08:00。
- 修改或新增：仅测试协调器新增默认 false 的 coalesceMeters 与手工 flushMeter，采样接受不分配 seq/不改变视图，一槽保留当前来源最新有效采样；文字/生命周期直接投递成功后清槽，cancel/end/fail/disconnect 直接越过采样，释放只清自己的采样。合并模式保留最后普通序号及终结序号；原默认路径不变。新增 scheduling 测试 21 项，含一万次采样、异步文字/非法来源/字段复制/捕获值不可变、输出结束/失败、四种关闭、缩小上限 2/3/4/7 共 16 个位置的耗尽→断连→释放→新 epoch，以及 run 耗尽和采样边界的播放结束。同步 PLAN、README、验证记录与文档测试。
- 遇到的难题：缓冲接受不能冒称已交付；旧采样不得在文字/阶段变化或取消后重新出现；高频电平不能消耗最后普通序号阻塞播放结果，更不能占用 close 的安全终结序号。首轮 model/recovery/scheduling 56/57：历史 recovery 文档测试硬绑定“当前下一步 SC-20261114-004”，更新计划标记后失败，非模型行为失败。
- 处理方式：不新增自动计时器/队列线程或真实订阅，用显式 flush 验证顺序；缓冲只复制允许字段，输入仍由原 ticket/阶段/数值校验，投递才分配序号。成功控制事件作为采样边界，终结直接清槽，末普通序号禁止采样占用。历史文档断言改检查计划中保留的 SC-004 矩阵证据，而不是将其误当永远的当前阶段；其余设备未验收检查保留。
- 验证结果：新增 21/21；相关 model/recovery/scheduling/contract/state/docs 96/96，npm test 367/367（0 fail/skip），git diff --check 通过。实际验收仅离线调度/有界计数合成轨迹与文档检查，不证明设备取消延迟、UI 帧率或生产 IPC 安全。无应用/前端/原生运行代码修改，未重跑 preview/probe 构建、Chromium 或 Mac 原生构建，未安装/替换应用。
- 遗留问题：手工模型不是生产队列，普通事件耗尽后仍需显式关闭/重建，保留序号并非无限容量保证。真实采样调度、全部资源停止、最终 ASR、播放器回退、T0/T1、G1～G6 继续未验收。既有 Rust 偶发测试本批未复现、未修复。下一步逐段对照现有主流程合成夹具与协调器确认边界，列明假设/缺口，不接真实服务或设备，不安装 NSH、不替换应用；当前无需用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-005] model coalesced meters and terminal counter safety`；前批 b7acdf80f396059b009fc1003d197b8015c0b989 已推送。


## SC-20261114-006 主语音夹具与协调器逐帧边界对照

- 北京时间：2026-11-14 12:08:45 +08:00。
- 修改或新增：新增仅测试导入的 voice-coordinator-reference.test.mjs，读取实际 referenceSequence/dictationSequence/playbackRehearsal 六个夹具，以默认即时电平和手工合并两模式共 12 条完整轨迹逐帧比较视图/身份/接受到达 seq。另有七组缺确认反例与一项文档证据检查，共 20 项测试；独立核对预约/inputReady、capture 停止、chat/TTS/player 原 owner、playback-ended/end 后资源 drain、新输入确认、最终 ASR/writer 与未知 run。新增验证文档逐项列合成假设；同步 PLAN、README、模型记录及文档 marker。
- 遇到的难题：现有视图夹具仅有 begin/process/end 等事件，不能把它们当成设备确认或资源回收。播放取消分支包含已忽略帧与新 run 后不归零的夹具 seq，不能误把固定 fixture 序号作为协调器业务编号。首次专项 19/20，唯一失败是计划尚未加入新证据链接，非运行行为缺陷。
- 处理方式：测试内路由只查预留的原 owner，未知 run 不借当前会话；单独的 prepareFrame 准备脚本明确注入已知夹具的合成 inputConfirmed/lease/stop 假设，配缺确认反例，不作为适配器或从时间戳推断实际状态。每帧按 acceptedCounts 检查协调器序号，主完整对话/听写还核对固定 fixture seq；原始 fixture、reducer、模型与服务不修改。加入缺失链接并重跑。
- 验证结果：专项 20/20，相关 reference/model/recovery/scheduling/contract/state/docs 两次 116/116。完整回归依次 387/387 → 386/387（既有 rust host serve chat speaks the relay protocol，test/rust-host.test.mjs:252:39，Cannot read properties of undefined (reading 'type')）→ Rust 单文件重跑 7/8（同一错误）→ 完整回归重跑 387/387（0 fail/skip）。git diff --check 通过。实际完成离线逐帧/缺确认验证及文档检查，无动画逐帧或设备验收。未改前端/原生运行代码，未重跑 preview/probe 构建、Chromium 或 Mac 构建；未接服务/设备/剪贴板，不安装或替换应用。
- 遗留问题：所有 input/stop/playback/writer 确认仍为合成调用；实际听写无增量来源，processing 后最终 ASR 仍被拒绝，writer 释放不是插入/复制结果。T0 未验收、T1 未启动、G1～G6 全部未验收。既有 Rust 偶发测试本批两次复现，最后完整重跑通过不代表已修复；源码可见等待 user 后立即读取下一行快照，但本批不改该历史测试，需独立核对事件等待边界。下一步先独立修正/验证这个回归等待边界，再推进最终 ASR 展示契约与视图截取/业务原文分离、取消/迟到与 writer 边界；不连接真实服务或设备，当前无需用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-006] cross-check reference flows against coordinator ownership`；前批 c443109595a0a4be41f81b052f8c61cfa8da66ce 已推送。


## SC-20261114-007 Rust 协议测试相邻事件等待修正

- 北京时间：2026-11-14 12:36:26 +08:00。
- 修改或新增：新增仅测试使用的 waitForEventAt 辅助函数；Rust relay 测试在 user 已出现后等待原相邻下一条事件实际存在，再保留 type=state/name=thinking 的严格断言。新增八项测试（七项行为/源码使用检查及一项文档边界），覆盖拆分 stdout、半条 JSON、旧快照确定性 TypeError、已到事件、错误中间事件不跳过、缺行超时、解析错误和无效参数；同步 PLAN/README/验证记录/文档测试。
- 遇到的难题：SC-006 两次失败并非 user 没到，而是 user 与 thinking 可分属不同 stdout data 回调；原 parseAll 新快照也无法保证下一行存在，直接读 .type 会偶发 undefined。不能用延长 sleep 或“寻找后续任意 thinking”掩盖协议乱序。
- 处理方式：只等确切位置 userAt+1，10 秒有界等待、25ms 轮询，单调时钟计算期限；相邻错误事件原样返回使断言失败，解析异常直接抛出，超时错误仅含位置/数量不含载荷。测试先喂 user、再喂半行和末尾换行，确定性证明旧写法失败和新写法等待完整行。未改 Rust/Swift/Node 产品代码或协议，不修改服务器时间/播放/取消行为。
- 验证结果：初始专项含真实 Rust 单文件 15/15；真实 Rust relay 目标连续五次独立筛选运行各 1/1（筛选不代表全量）；补文档测试后相关 event-at/rust-host/project-docs 35/35，完整 npm test 395/395（0 fail/skip），git diff --check 通过。真实 Rust 测试使用本机编译二进制、回环合成 HTTP 与临时 HOME，金库互读与其他协议断言保留；不是外部服务/设备验收。无原生代码修改，未重跑 Mac 构建、Chromium 或新壳设备验收，不安装/替换应用。
- 遗留问题：已识别的测试快照竞态有确定性复现与修正验证，但不能保证全部历史偶发风险或宿主生命周期问题消失。T0 未验收、T1 未启动、G1～G6 保持未验收；下一步继续离线最终 ASR 展示契约及视图/业务原文分离、取消/迟到和 writer 边界，真实接线仍受 T0/T1 门槛约束。当前不需要用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-007] await adjacent Rust relay events without snapshot races`；前批 85a47f2be64ae0eea32d5a208d863b92b6738d6b 已推送。


## SC-20261114-008 processing 后最终识别独立投影契约

- 北京时间：2026-11-14 12:55:05 +08:00。
- 修改或新增：新增默认关闭、仅测试导入的 FinalAsrProjection 提案与 28 项测试。processing/thinking 的当前 dictation 原 ASR ticket 可一次性接受最终业务结果；与旧 transcript/reducer 分开，投影不分配 seq。不修改协调器、旧夹具或 React。展示 ≤8000 UTF-16 按 grapheme 边界截取且独立 truncated 标记；完整最终业务正文 ≤16000 UTF-16 单独保留，原 receipt/当前 writer 才可只读取得。新增契约说明，同步 PLAN/README/适配器文档/文档测试。
- 遇到的难题：旧听写服务没有增量来源，dictationResult 在等待 ASR tail 和可选润色后才发，不能把最终业务值说成原始 ASR 分块；Node text.length 与 Swift text.count 也不是同一单位。宽松把 final 转 transcript 会伪装恢复收音；直接截取 UTF-16 可切坏 surrogate/组合字符；展示值交 writer 会丢失正文。取消后不能以 receipt 继续获取正文，也不能把回收 writer 当成功。
- 处理方式：保持旧 reducer processing 后 transcript 拒绝；独立测试投影只接受当前 connected/非 closing 的 dictation thinking 与原 ASR，非法值不占一次性槽。遵守 Node 16000 UTF-16 cap，显式拒绝 malformed Unicode；Intl.Segmenter grapheme 截展示，不 trim/normalize/加省略号到正文。opaque receipt 不含文本；writerText 检查当前原 session/receipt/writer，仅返回候选正文，不调用 paste/copy。每次访问复查关闭/断连/换 run/epoch，惰性清引用，不伪装即时安全擦除或真实取消；已取出的字符串不可撤回，生产主动清理和最终写入守卫仍需实现。
- 验证结果：初始专项 25/25；补超长首 grapheme/耗尽 seq/源码长度单位检查后 28/28。相关 final/reference/model/recovery/scheduling/adapter/state/docs 144/144，完整 npm test 423/423（0 fail/skip），git diff --check 通过。覆盖 7999/8000/8001/16000/16001、emoji/ZWJ/旗帜/组合音标、超长单字素空前缀但正文保留、复制/外部 handles、非法/重复结果、调用者修改、ASR 停止顺序、四种关闭仍待 drain、Promise 迟到跨 run、新 epoch 复用编号及生产无导入。仅离线契约验证，无前端/原生运行代码修改，未重跑 preview/probe/Chromium/Mac 构建，未接设备/服务/剪贴板或安装应用。
- 遗留问题：真实 final-ready UI、统一投递/seq、IPC 身份、主动清理和 writer 结果通道均未接入；惰性本地清理不是安全擦除或撤回已发粘贴。T0 未验收、T1 未启动、G1～G6 仍未验收。SC-007 已修正的 Rust 相邻快照测试本批未再复现，不代表所有偶发风险消失。下一步离线定义写入结果与取消后显式复制候选保留规则，区分已发出粘贴/目标应用接受/失败，不自动补发或发送回车；当前无需用户操作或授权。
- 对应 Git 提交：本条所在提交，主题 `test: [SC-20261114-008] define isolated final ASR display and business-text boundaries`；前批 e6824a06612c0d0efb5ab91ffec30d286402be11 已推送。
