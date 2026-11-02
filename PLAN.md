# 星核助理实施计划

更新日期：2026-11-01（北京时间）。本计划区分已有基线、本期新增功能和后续范围。未勾选项均未验收完成。

## 当前目标与边界

在保留现有全部功能行为的基础上，新增 SpeakMore 式全局语音输入：快捷键开始/结束录音，本地识别，可选润色，写入当前输入框，不自动发送。

当前已安装 0.7.0 / build 17，原配置核对保持；集成代码、自动检查与构建通过，工作分支为 `feat/global-dictation`。真实权限/人声验收等待用户按正常系统流程授权，未验证的条目保持未勾选。详细行为见 [全局语音输入设计](docs/superpowers/specs/2026-11-01-global-dictation-design.md)。

## 完成与证据规则

依赖顺序：阶段 0 → 阶段 1 → 阶段 2～6 → 阶段 7 → 阶段 8。阶段 2～6 内部按下列前置关系推进。

完成项使用 `- [x]` 并在同一行写明“证据：”及对应日志或验收记录。代码完成、模拟测试、原生构建和真人实际验收分别登记；缺任意必要证据，不勾选整个阶段。受阻项写明原因与解除条件。

## 已有基线

- 已知提交：`aa672e6` 为首次 GitHub 源码，`29c9d1e` 为 Changelog 补齐。
- 首次源码对应的 57 项检查及 GitHub 测试、Mac 构建已通过；证据：[已有 CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41282920886)。这不是新听写功能的验收。
- 保留范围：唤醒/连续对话、云桥聊天、DeepSeek 原有校对、Fish/系统声音、全屏动态、项目选择/当前项目查询、加密记录、原 Codex 聊天交接、微信通知/续写。
- 既有能力的历史局限继续有效；不能因为本次文档建立而把旧的未验收项改写为通过。

## 阶段 0 仓库规则与可追踪记录

- [x] 建立根目录 AGENTS.md，写入五条规则与功能保持要求。证据：[本批日志](operatelog.md#sc-20261101-001-仓库规则与全局语音输入计划)，规则专项检查通过。
- [x] 建立根目录 operatelog.md，按北京时间记录本次批次与已知历史提交。证据：[本批日志](operatelog.md#sc-20261101-001-仓库规则与全局语音输入计划)，历史提交时间已读取 Git 元数据核对。
- [x] 建立本 PLAN.md 和独立设计文档，说明范围、依赖、测试、实际验收与解除条件。证据：[设计](docs/superpowers/specs/2026-11-01-global-dictation-design.md)与[本批日志](operatelog.md#sc-20261101-001-仓库规则与全局语音输入计划)，已人工核对范围与未实现状态。
- [x] 新增 `test/project-docs.test.mjs`，检查规则、日志字段、计划证据约束和文档链接。证据：[测试源码](test/project-docs.test.mjs)，4 项专项检查通过。
- [x] 执行文档检查、`git diff --check` 与 `npm test`，人工核对历史时间、版本和未实现状态。证据：[本批日志](operatelog.md#sc-20261101-001-仓库规则与全局语音输入计划)，61 项完整回归通过；本阶段实际验收对象是文档，不是尚未实现的听写功能。

本阶段改动以 `SC-20261101-001` 关联提交及推送；对应提交查询方式见 AGENTS.md。远端与 CI 在实际推送后核对，交付时报告结果，后续批次再将已知结果补入历史日志。

## 阶段 1 完整设计复核

前置：阶段 0 的文档与检查就绪。

- [x] 用户确认完整设计：右侧 Option 默认键、F8/F9 预设、默认关闭、120 秒上限、焦点变化后手动复制。证据：[SC-20261101-002 日志](operatelog.md#sc-20261101-002-独立听写服务与兼容配置)，用户明确选择按此方案继续开发。
- [x] 根据确认结果更新设计、PLAN 和日志，确定最小实现批次。证据：[SC-20261101-002 日志](operatelog.md#sc-20261101-002-独立听写服务与兼容配置)，服务、原生采集/热键、输入适配和集成验收分批处理。

用户已确认完整方案。当前没有已知实现阻塞；真实系统权限与人声验收保留在阶段 8，未经实际验证不勾选完成。

## 阶段 2 独立识别服务与兼容配置

前置：阶段 1。

涉及：新增 `src/assistant-dictation.mjs`、`test/dictation.test.mjs`；必要修改 `src/assistant-core.mjs`、`src/assistant-host.mjs`，复用 `src/assistant-asr.mjs` 和 `src/assistant-chat.mjs`。

- [x] 先添加测试：旧配置默认禁用听写、预设校验、独立润色默认关闭、缺少云端密钥仍可本地识别。证据：[服务验收](docs/verification/2026-11-01-dictation-service.md)及配置/听写专项测试。
- [x] 实现独立服务的准备、按序音频、完成与取消接口及带请求 ID 的事件，不经过普通聊天、TTS 和 Codex 路由。证据：[服务验收](docs/verification/2026-11-01-dictation-service.md)，本机 Qwen 合成样本识别通过。
- [x] 将新增协议接入 host，验证路由与原助理互斥及同批消息竞争。证据：[集成验证](docs/verification/2026-11-01-dictation-integration.md)，7 项宿主夹具通过；实际麦克风互斥留在阶段 8。
- [x] 测试空音频、非法 PCM、纯静音结果、乱序片段、取消后旧结果抑制及串行 ASR 复用。证据：[服务专项](test/dictation.test.mjs)与[验收](docs/verification/2026-11-01-dictation-service.md)。
- [x] 可选润色只接收本轮文本；失败、超时、截断或明显缩短时保留原文，不重试、不请求云桥和 Fish。证据：[服务专项](test/dictation.test.mjs)；真实付费润色未调用，不算真人付费验收。
- [x] 运行相关测试和完整 `npm test`，更新日志/计划。证据：[服务验收](docs/verification/2026-11-01-dictation-service.md)，66 项相关、107 项完整检查通过；提交由 SC-20261101-002 关联。

验收标准：模拟 fetch 断言本地模式零云调用；口述“让 Codex”不会触发投递；旧配置/消息回归全部通过。

## 阶段 3 手动录音与资源协调

前置：阶段 2 的消息协议稳定。

涉及：新增 `client/DictationAudio.swift`、`client/DictationRecorder.swift`、`client/DictationController.swift`；必要修改 `client/AssistantBridge.swift`。保留 `Microphone.swift` 原实现，通过独立采集器减少对旧功能的影响；新增原生状态/分段测试。

- [ ] 保留旧自动分句 API，为听写新增显式开始、结束、取消和尾段刷新。
- [x] 按静音边界切分不超过 18 秒的片段；测试长于 24 秒的口述不会触发现有单段限制。证据：[原生缓冲夹具](test/fixtures/dictation-native.swift)和[本批验收](docs/verification/2026-11-01-dictation-native.md)，合成 37 秒/120 秒及短尾段通过。
- [ ] 单轮 120 秒封顶，达到上限提示并处理已有音频；不落盘原始录音。
- [ ] 原唤醒采集与听写互斥，结束/取消恢复原先监听状态；原先关闭时保持关闭。
- [ ] 原助理忙碌或播报时不启动听写；覆盖准备中取消、睡眠、锁屏、设备切换和退出清理。
- [x] 原生合成音频测试、Node 回归及 `npm run build:mac:check` 通过，更新记录。证据：[本批验收](docs/verification/2026-11-01-dictation-native.md)，109 项检查和 Mac 构建通过；真实录音互斥仍待接线验收。

验收标准：长音频按顺序交付、末尾不丢失、取消不出结果；旧唤醒与播报资源状态保持原行为。

已实现独立采集器 API 与原生纯状态基础；实际捕获、资源协调与设备变化验收保持未完成。

## 阶段 4 全局热键与权限

前置：阶段 3。

涉及：新增 `client/DictationHotkey.swift`、热键状态机测试；必要修改应用生命周期和设置桥接。

- [ ] 默认右侧 Option，提供 F8/F9 预设；启用前不注册新的全局监听。
- [ ] 按一下开始、再按结束；只在单独右 Option 动作时触发，正常组合键不误触。
- [ ] 忽略按键自动重复；处理中不堆积新录音；Esc 取消当前代次。
- [ ] 增加麦克风、输入监控、辅助功能状态检测与正常设置入口，不自动代授系统权限。
- [ ] 模型加载中不显示已录音；快捷键失效或权限不足有明确状态，保留已有助理功能。
- [ ] 在真实 Mac 验证全局触发和退出后释放；完成相关测试与构建，记录证据并提交/推送。

验收标准：不依赖星核窗口前台、不抢输入焦点；正常修饰键组合与原有快捷键仍可用。权限受阻时记录用户需开启的项目和恢复路径。

## 阶段 5 目标检查与文字写入

前置：阶段 3 的结果协议、阶段 4 的热键状态。

涉及：新增 `client/DictationPaste.swift` 与粘贴测试；必要时新增 SpeakMore 许可证文件并更新 `THIRD_PARTY_NOTICES.md`。

- [ ] 开始前记录前台应用和聚焦元素，不采集输入框正文；结束后核对相同目标。
- [ ] 覆盖目标变化、无编辑框、密码框、权限不足、终端目标和过期请求，采用手动复制路径。
- [ ] 粘贴只发一次，不按回车；区别“已发出粘贴”和“目标确认接收”。
- [ ] 备份多格式剪贴板；恢复前核对 changeCount，避免覆盖用户新复制的内容。
- [ ] 剪贴板操作串行化，测试连续请求、取消和恢复时机。
- [ ] 核对上游采用范围与许可，完成测试/隔离输入验收后记录并提交/推送。

验收标准：文本不进入错误窗口，不因输入模式调用 Codex/微信发送；剪贴板并发测试通过，无原始正文或录音日志。

基础证据：[输入策略/剪贴板夹具](test/fixtures/dictation-paste.swift)和[本批验收](docs/verification/2026-11-01-dictation-native.md)已通过；上列跨应用实际输入项目仍待控制器接线与真机验证。

## 阶段 6 悬浮条与设置接线

前置：阶段 2～5 的状态与接口稳定。

涉及：新增 `client/DictationPanel.swift`；必要修改 `client/hud/index.html`、`client/hud/app.js`、设置样式与桥接。

- [ ] 增加不抢焦点的原生悬浮条，显示真实电平、录音时间、处理中、取消与复制结果。
- [ ] 增加独立启用开关、热键预设、独立润色开关与权限状态；配置加密保存，旧设置保持。
- [ ] 输入结果不加入助理聊天记录，不触发朗读，不改变主场景布局和原有交互。
- [ ] 失败文本仅在当前会话内保留，取消/清除/退出后释放；不新增录音历史文件。
- [ ] 检查设置读写、重开、焦点、减少动态与原功能回归，更新记录并提交/推送。

集成代码与夹具现已覆盖阶段 3～6 的主要状态流；测试明细见 [SC-20261101-004 验证](docs/verification/2026-11-01-dictation-integration.md)。以上包含真实权限、全局事件或跨应用输入的整项任务仍待阶段 8，不因模拟成功勾选完成。

## 阶段 7 完整回归与构建

前置：阶段 2～6。

- [x] 运行所有新增专项测试和完整 `npm test`，保留结果摘要。证据：[集成验证](docs/verification/2026-11-01-dictation-integration.md)，121 项通过（含安装记录的版本一致性检查）。
- [x] 运行 `npm run build:scene`，确认既有场景可构建。证据：[集成验证](docs/verification/2026-11-01-dictation-integration.md)，独立场景实际构建成功。
- [x] 运行 `npm run build:mac:check`，检查架构、最低部署目标、版本/build 与严格签名。证据：[集成验证](docs/verification/2026-11-01-dictation-integration.md)，arm64 / macOS 13 / 0.7.0 build17，严格签名通过。
- [x] 人工核对无真实凭据、原始录音、聊天正文、验收截图泄漏到提交。证据：[安装记录](docs/verification/2026-11-01-dictation-integration.md)，仅公开源码/合成夹具/验证摘要；私有备份在忽略目录。
- [x] 准备旧应用与实际运行文件备份，安装前确认应用空闲；不使用安装器覆盖无关配置。证据：[集成验证](docs/verification/2026-11-01-dictation-integration.md)，旧 0.6.6 app 与 runtime/src 已备份；客户端实际显示语音监听关闭且空闲。
- [x] 更新 README、CHANGELOG、依赖许可、日志和计划，提交并推送；核对对应 CI。证据：集成提交 `0f8c3c5` 已推送；[测试及 Mac CI](https://github.com/xumuyan/starcore-assistant/actions/runs/41306056815) 成功；安装记录本批同步维护。

## 阶段 8 真机验收与交付

前置：阶段 7、用户按正常流程完成必要权限授权。

- [x] 更新实际 Node 运行副本与原生客户端，仅重开星核；未重装或重新绑定 Codex 和微信服务。证据：[安装记录](docs/verification/2026-11-01-dictation-integration.md)，app 版本/签名和 runtime/src 哈希一致、原配置保持；没有将这项安装核对当成真实通知链路回归。
- [ ] 在临时 TextEdit 文档测试真实快捷键和人声：开始/结束、标点、停顿、重复按键、Esc、短音频、较长口述。
- [ ] 在浏览器临时输入框复测单次写入与不自动发送，不使用真实业务聊天作为测试目标。
- [ ] 验证切换窗口或光标后走手动复制路径、密码框与终端不自动写入、剪贴板新内容不被恢复逻辑覆盖。
- [ ] 不启用润色时验证不调用聊天、DeepSeek 或 Fish；真人付费润色仅在用户选择启用后验收，未调用则单独标注。
- [ ] 重开后听写开关与热键保持；原目标、名字、唤醒词、声音、加密记录保持，旧唤醒对话与微信/Codex 工作流回归。
- [ ] 汇总测试、构建、安装、真实验收和未完成项，各自记录证据；满足全部本期必需项后再勾选整项完成并提交/推送。

当前受阻项：全局事件、真实录音和输入框写入尚未验收。原因是新版系统权限显示待授权，用户已选择自行开启，尚未确认完成。解除条件：输入监控、辅助功能、麦克风显示允许，再在临时文档按真实人声和快捷键完成上列项目；不自动代授、不把等待写成完成。

## 后续范围

任意快捷键组合录制、翻译/划词翻译、词典、录音历史、多云端 ASR、iPhone 和小爱音箱单独立项，不作为本期完成条件，也不自动开始实施。

## 实施接口与执行约定

采用 writing-plans 的任务拆分方式，在本会话按服务 → 原生组件 → 接线 → 回归/真机推进；复用当前 checkout，不额外创建 worktree。每批独立 commit/push，原应用继续使用旧运行副本直到验证后安装。

Node 独立服务接口为 `DictationService({emit, asr, getSettings, getKeys, isBlocked, prepareASR, fetchRequest})`：`begin(id)` 准备，`append({id,index,audio})` 按序输入不超过 18 秒的 PCM，`finish({id,count})` 完成本轮，`cancel(id)` 使旧结果失效。通过 `active` 协调资源。

宿主新增消息 `dictationPrepare`、`dictationChunk`、`dictationFinish`、`dictationCancel`；返回 `dictationReady`、`dictationState`、`dictationResult`、`dictationError` 和 `dictationNotice`，全部携带请求 ID。旧消息类型保留。

新设置为 `dictationEnabled=false`、`dictationHotkey=right-option`、`dictationPolish=false`，与现有 autoListen/polishEnabled 分开。设置校验只接受 right-option/f8/f9；不会因启用听写而自动开启付费润色。

每批验证命令：`node --test test/dictation.test.mjs`（服务）、原生纯状态与音频分段夹具、`npm test`（全量）；涉及 Swift 或桥接时再运行 `npm run build:mac:check`。UI 验证使用临时文档与输入框，所有系统 UI 操作通过电脑操作工具，禁止用自动化输入向真实业务聊天发送测试文字。

## MOSS 改版 · 2026-11-02

用户已批准实施，详见 [MOSS 设计](docs/superpowers/specs/2026-11-02-moss-design.md)。本节取代旧默认全屏入口的界面要求；旧听写未完成的真实权限/人声验收仍有效。

执行方式：按已有 subagent-driven-development 工作流逐模块实现，复用当前功能分支，根协调者提交推送；不重新请求已批准方案。顺序：计划 → 状态与执行路由 → 玻璃工作台 → 桌面宠物与名称 → 构建/安装。

- [x] M1 归档确认设计、边界与测试计划；同步规则对新界面范围的口径。证据：SC-20261102-001 日志、设计链接/隐私检查及 121 项回归通过。
- [x] M2 新增 src/codex-task-status.mjs，只读 SQLite/JSONL 汇总主聊天状态；test/codex-task-status.test.mjs 覆盖运行/结束/异常/未知/子代理排除、部分行与读取失败；host 新增 tasks 协议，禁止写 Codex 数据。证据：[MOSS 验证](docs/verification/2026-11-02-moss.md)，状态夹具和真实只读来源核对通过。
- [x] M3 固定当前目标与明确语音执行表达式，复用上下文投递；测试普通聊天不执行、缺少目标不自动跟随、明确执行只投递一次、听写不投递。证据：[MOSS 验证](docs/verification/2026-11-02-moss.md)，路由模拟/原听写回归通过；真人语音留在 M8。
- [ ] M4 改造 client/hud 的任务/聊天/设置布局及玻璃 CSS；保留原桥接 ID 和设置，新增任务纯文本渲染，覆盖导航/聊天/权限设置及无脚本注入测试。
- [ ] M5 AppKit 桌面宠物及轻量聊天入口，默认关闭可启用，不抢焦点、状态共源；原生夹具覆盖关闭、更新、轻量聊天/展开行为。
- [ ] M6 当前产品名/默认名迁移 MOSS，保留自定义值、bundle ID、数据路径；测试旧默认迁移、自定义保持、版本一致。
- [ ] M7 全量 npm test、scene/native build、签名与架构核对；更新文档日志，各批 commit/push 并核对远端 CI。
- [ ] M8 备份安装、真实任务状态与玻璃界面/宠物检查；真实语音/权限/微信送达单独登记，缺少证据不勾选完成。

每个模块先补相关失败测试，再实现并复核；实际验收证据写入 operatelog 与专用 verification 文档，不仅凭代码完成勾选。
