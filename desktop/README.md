# 隔离桌面视觉层（SC-20261112-005）

这是未来 Tauri 2 壳可复用的 React 原组件预览，**不是可用的新客户端**。不修改旧 Swift/Node 构建入口、已安装应用、权限、运行配置或加密历史；无麦克风/聊天/文件/IPC/网络访问。默认所有效果隐藏，仅用户在预览控件中显式切换时显示。Esc 只是本地页面隐藏，不是已接入全局听写取消。

## 当前重点：libraries.dev 主语音界面（SC-20261113-011）

重构重点是 voice-ring / beam / voice / orbs 的主流程，不是托盘与设置诊断。预览页默认隐藏；点击 **播放完整语音流程（合成）** 可查看收音环 → 分段识别 → 思考 → 分段回复 → 回到收音 → 隐藏。SC-20261113-012：播放按钮按当前所选模式运行，不再强制切回唤醒；切换模式立即显示收音外观。选择“按键听写”再播放可查看 voice 长条收音 → orbs 思考 → 隐藏，无回复播报阶段，未绑定右 Ctrl 或写入输入框。播放期间手动控件禁用，隐藏按钮或任意页面焦点下 Esc 可停止并清除全部待执行帧。所有文字、电平均为合成，不启动麦克风、服务或原生热键。

原版环容器保持 240×240，去掉把全部直接子 div 拉宽的规则；beam/voice 直接子内容保持圆角，长文本在 112px 内容区滚动。React 分词 key 保留增量前缀；回复与识别分离入场。原版环/光谱参数不变，文字入场/流程编排仍为本地补充，不能宣称逐帧还原。构建产物中的完整脚本供浏览器预览与 Tauri 壳共享（播放控件仅浏览器预览）；本批未替换正在运行的临时 probe。验证见 [主视觉记录](../docs/verification/2026-11-13-reference-scene.md)。

## 构建和预览

```sh
npm ci
npm run build:desktop:preview
# 用本地静态服务器打开 dist/desktop-preview/index.html；不要使用外部 CDN。
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist/desktop-preview
```

**部署原生探针到 /tmp bundle 前必须先 `cargo build`**：`cargo test`、`cargo clippy` 与 `check-native.mjs`（其自身声明不构建）都不会刷新 `target/debug/moss-desktop-probe` 产物；SC-20261113-007 曾因复制过期产物误判 SIGUSR1 钩子无效。诊断钩子会在 stderr 打印 `USR1_HOOK_REGISTERED` / `USR1_RECEIVED`，可用于确认二进制确实是新版。

在浏览器访问 `http://127.0.0.1:8765`。所有电平/文字均为手动样例；不连接后台。输出含完整运行时 `THIRD_PARTY_LICENSES.txt`，构建产物不提交。CSP 禁止连接外部服务；组件需要动态 inline 样式，因此仅样式允许 unsafe-inline，脚本不允许。

## 上游核查与直接集成

核查来源：四个参考页、npm 包 README/类型声明/LICENSE 与 package-lock.json；共同源码仓库为 https://github.com/Jakubantalik/Libraries.dev 。

| 页面 | npm 原组件 | 本批引用 | 许可证 |
| --- | --- | --- | --- |
| https://libraries.dev/voice-ring | voice-ring 0.2.0 / VoiceRing | listening / processing / speaking，240px；保持原版配色和运动参数 | MIT, Jakub Antalik |
| https://libraries.dev/beam | border-beam 1.4.1 / BorderBeam | 原版默认 md 边框；包裹文本卡片 | MIT, Jakub Antalik |
| https://libraries.dev/voice | voice-glow 0.3.0 / VoiceBeam | 对话文字卡片及听写长条底部声音光效，手动电平 | MIT, Jakub Antalik |
| https://libraries.dev/orbs | thinking-orbs 0.3.2 / ThinkingOrb | 听写处理态 working / 64px | MIT, Jakub Antalik |

React / React DOM 19.2.0 与 scheduler 为 MIT，许可证一并保留。thinking-orbs 继续使用仓库既有锁定版本，旧 HUD 的非 React engine 子集入口未改变。未下载或加入情绪/位置模型及 Pro 资源。

### 已知差异，不能宣称完全还原

- 参考页面示例带 `processing={thinking}`，但安装的 **voice-glow 0.3.0 类型声明和实现没有此属性**。README 的 Motion 一节将 `useVoiceProcessing(thinking)` 扫动处理态明确列为 Libraries Pro。不得把该属性传给 DOM，也未复制 Pro hook。听写思考按需求使用开源 orbs；如后续必须同样扫动，需另核实合法资源与集成条件。
- voice 是声音驱动底部光效，**不是文字逐词浮现组件**。本地 TextReveal 用 Intl.Segmenter 中文分词、React 转义和 CSS 淡入补充文字入场；不代表参考站逐词时序已还原，也不包含实时转写 Pro 能力。无分词接口时回退 Unicode 字符。
- 当前卡片尺寸、留白与控制面板为预览布局，不是最终浮层位置/交互。没有逐帧视觉对照、WKWebView/WebView2 比对、帧率或无障碍全面验收。

## 验证边界

`node --test test/desktop-effects.test.mjs`：离线 bundle 确实引用四个上游实现、运行时许可齐全、默认隐藏/非法状态/电平钳制、全部状态 SSR、文本转义、无录音或服务调用。

本批另以隔离临时 Chromium 执行本地页面冒烟检查：状态切换、中文显示、原组件 DOM、Esc 卸载、零外部请求和零控制台错误；合成截图只保存在临时目录，未提交。此检查不等于原生 WebView 或真机语音验收。

后续依赖顺序不变：T0 验证 Tauri 透明置顶/非激活/托盘/热键，T1 实现受限 IPC 和宿主适配，再接业务。不要将当前预览误作为产品入口发布。

## T0 隔离 Tauri 验证壳（SC-20261112-006）

上文无 IPC 的承诺适用于 **browser preview**。新增 probe 是独立入口，仅接本地合成 IPC，**仍不是可用的新助理**。

```sh
# 使用现有依赖；首次全新检出才需要 npm ci。需要 Rust >=1.90 / Xcode。
npm run desktop:probe          # 常规启动隐藏，只显示临时菜单栏图标
# 如工具无法点菜单栏，可显式展示按钮组（不代表托盘已验收）：
npm run desktop:probe -- -- --show-chooser
npm run build:desktop:check    # debug 可执行文件，不打包、不安装
# 仅检查 probe 前端离线构建：
npm run build:desktop:probe
# macOS 直接运行 Cargo 测试需传平台配置（CLI 构建会自动合并）：
cd desktop/src-tauri
TAURI_CONFIG='{"app":{"macOSPrivateApi":true}}' cargo test --locked
```

CLI/API、Rust crates 精确版本见两个 lock 文件。Rust 2.12.5 与 JS 2.12.4 属同一 Tauri 2 系列，不采用搜索结果中的 3 alpha。前端构建 API MIT 通知一起复制；完整原生分发许可审计、Windows 构建与签名/公证尚未完成。`macos-private-api` 是透明窗口所需特性，当前不承诺 App Store 发布。

- 历史页面仅有未接入说明，不是读取失败或清空真实历史。
- 设置页只有效果演示、临时测试热键、输入验证框和退出，无真实产品配置。
- Cmd/Ctrl+Shift+F8 必须手动启用，状态仅内存保存；退出自动释放。不注册右 Ctrl，不启动第二个麦克风，不启动新旧业务宿主。
- 全局 Esc 仅效果可见期间尝试注册，隐藏时注销；注册失败显示错误，不声称可用。非激活/鼠标穿透为窗口配置，必须实测确认。
- 正常启动所有窗口隐藏；`--show-chooser` 仅是开发入口。图标点击后按钮组暂居中，不是最终菜单栏锚点定位。

本机 debug 构建与区域截图观察到原生按钮组，但桌面工具不能确认该窗口/焦点，已停止自动输入。焦点、热键、Esc、菜单栏点击、多屏/全屏和最终精确视觉仍未验收。见 [T0 验证记录](../docs/verification/2026-11-12-tauri-t0.md)。


### 图标资产（SC-20261113-008）

- `icons/icon.png`（1024 squircle）与 `icons/icon.icns`：来自 `images/20261110032644-macOS-app-icon-design-ro.png` 设计稿（柔粉液态玻璃语音气泡），用 `assets/generate-icons.swift` 裁切遮罩生成；iconset 需手动 `iconutil -c icns /tmp/moss.iconset -o desktop/src-tauri/icons/icon.icns`。
- `assets/tray-moss.rgba`：菜单栏模板字形（36×36 原始 RGBA，黑色三竖条声波 + alpha），同一脚本生成，`main.rs` `include_bytes!` 内嵌；tauri tray-icon 在 macOS 强制 18pt 高渲染，36px 位图即 2x 清晰度，`icon_as_template(true)` 自动适配深浅色菜单栏。
- 运行时不访问外部图像资源；bundle 声明在 `tauri.conf.json` `bundle.icon`，临时 /tmp bundle 的 Dock 图标经 Info.plist `CFBundleIconFile` 指向同源 icns。

### 显式普通控制窗口诊断模式（SC-20261112-007）

开发辅助标志：`--show-chooser`（启动后锚定显示入口条）、`--show-page <history|settings>`（跳过入口条直接以生产路径 `open_page` 打开页面，用于只读视觉核对）；两者与 `--diagnostic-controls` 可叠加，`--show-page` 时入口条不自动显示，且均与 `--self-check` 互斥。

```sh
npm run desktop:probe -- -- --diagnostic-controls
```

仅该参数启用时，macOS 应用改为 Regular 激活策略、自动显示 chooser、窗口标题追加 `diagnostic` 后缀，并安装 **SIGUSR1 诊断钩子（SC-20261113-006）**：向进程发 `kill -USR1 <pid>` 会重放与真实托盘点击完全相同的生产切换路径 `toggle_chooser_from_tray`（隐藏/锚定/显示/聚焦），用于无注入验证锚定与开关行为；普通运行永不安装该钩子。SC-20261113-001 起**所有窗口（含诊断）一律无边框、透明、置顶、无系统标题栏**，不再有带标题栏的普通窗口或 40px 补偿。模式不持久化，下次普通启动恢复隐藏的 accessory 壳；不改变产品默认入口。**overlay 始终保持原有透明、置顶、不可聚焦和鼠标穿透配置**，不会为绕过焦点保护而使浮层可输入。

## 菜单栏入口与页面（SC-20261113-001）

- 左键点击托盘图标：在**托盘图标正下方**弹出无边框入口条，仅两个小按钮“历史记录 / 设置”。位置由 `TrayIconEvent::Click` 事件矩形的物理像素加显示器工作区计算（`anchored_window_origin` 纯函数：居中、工作区钳制、按缩放乘间隙），不做逐平台单位换算。
- 点击任一按钮：先隐藏入口条，再打开对应无边框玻璃页（设置页为 beUI Switch/Button/Input 控件）；入口条与页面在失去焦点时自动收起（macOS 真机行为待验收）。Esc 只关浮层；CloseRequested 仅隐藏；退出仅经设置页“退出验证壳”。诊断/`--show-chooser` 自动显示也优先锚定托盘图标正下方（`TrayIcon::rect()` 可用时），否则保持居中回退。
- beUI motion 组件为本地适配（MIT，© 2026 Saurabh Chauhan；来源 https://beui.dev/components/motion ，仓库 starc007/ui-components）：Tailwind 类替换为本地 CSS（`desktop/frontend/beui.jsx`/`beui.css`），未逐像素复制，许可文本见 `licenses/beui-motion-MIT.txt` 与 `THIRD_PARTY_NOTICES.md`；运行时不访问 beui.dev，`motion@14.12.0` 精确锁定。BorderBeam 外框仅保留在浮层内部动效中，chooser 与页面不再使用。

只读 CoreGraphics 检查发现默认 chooser 确实在屏、共享可见、浮动层 layer 5，但工具列表不识别；普通诊断模式能列出窗口、单窗截图和观察 Tab 焦点。后续受控输入仍因焦点变化中止，未验收 IPC、页面切换/输入或热键。不能断言 layer 5 是工具故障的唯一原因。停止重复输入；手工步骤见 [T0 验证记录](../docs/verification/2026-11-12-tauri-t0.md#sc-20261112-007-诊断控制窗口与手工验收)。普通诊断页不是目标透明置顶页的视觉/行为验收，T0 仍未完成。


### 显式原生合成自检（SC-20261112-008）

```sh
npm run build:desktop:check
npm run check:desktop:native
```

先构建隔离 debug 可执行文件，再单独运行自检；`npm test` 不会自行启动原生窗口。runner 传 `--self-check`，只接受九个有序检查点及 `T0_SELF_CHECK PASS`、进程退出码 0；缺失、超时或失败均返回非零。原生 watchdog 为 20 秒，runner 上限 30 秒。不可与 `--diagnostic-controls` 或 `--show-chooser` 混用，避免将普通诊断页当作目标透明页面。

**此命令会短暂显示合成历史/设置页及四种效果，并在浮层可见期间注册 Esc；请勿在正在输入或处理重要操作时运行。** 临时 Cmd/Ctrl+Shift+F8 始终关闭，不注册右 Ctrl，不注入键盘/鼠标或操作其他应用输入框，不触发权限申请，不访问真实数据/麦克风/服务。模式不持久化，正常启动没有自检参数，四个新增自检命令会被后端拒绝。

已在本机实际 WKWebView 验证：四窗初始化/默认隐藏、非法枚举及错误调用窗口拒绝、历史/设置命令显隐、四种合成状态事件→React DOM/Canvas 确认、隐藏卸载及 Esc 注册表释放、进程结束和重复启动自检。新增命令仍为有限枚举/布尔参数，按 Tauri 注入的真实窗口身份校验；不是通用执行接口。结果是**原生合成 IPC 工程证据**，不是物理热键、真实点击、外部焦点、鼠标穿透或动画精确视觉验收。T0 仍未验收，T1 真实服务未接入；详见 [验证记录](../docs/verification/2026-11-12-tauri-t0.md#sc-20261112-008-原生合成-ipc-自检)。


### 当前下一步：真实交互手工验收（SC-20261112-009）

最新受保护桌面尝试在首次单窗截图阶段即因焦点变化中止，没有发送点击或键盘输入，临时进程已清理。不要反复抢焦点或改用其他输入注入方式。请按 [一页手工验收单](../docs/verification/2026-11-12-tauri-t0-manual.md) 分开填写诊断/默认模式 D01～D02、P01～P08；含命令、风险提示、退出开发进程步骤及一次回复模板。结果均待反馈，T0 仍未验收，T1 未启动；有失败先修复，必要门槛与精确视觉有证据后才接真实服务。


### 主视觉状态衔接 · SC-20261113-013

用户已确认按键合成预览可见；不代表真实右 Ctrl 通过。两种效果的长文字自动跟随末尾，读者上翻时暂停跟随，回到底部恢复。听写为 orbs 预留 64px 槽位，长文限高 112px；避免从收音切换思考时短文本长条突然变高。浮层入场为本地 220ms 淡入，系统减少动态效果时禁用本地入场/文字动画；不声称关闭上游 Canvas 动画。隐藏保持立即卸载，避免 Esc 后延迟隐藏或空闲 Canvas 消耗。

可复现的隔离浏览器验收（需要本机可用 Chromium 与 Playwright；不加入默认 npm test，不下载依赖）：

```sh
npm run build:desktop:preview
# 如本项目未安装 playwright，显式指向既有安装的模块入口
MOSS_PLAYWRIGHT_PATH=/absolute/path/to/playwright/index.mjs node desktop/check-effects-browser.mjs
```

覆盖跟随/上翻保位、orbs 槽位高度、长文字限高、分词节点保留、减少动态效果、听写播放/Esc/零外部请求与控制台错误。只打开本地合成页面，不向系统桌面注入输入，不能代替 WKWebView/物理热键验收。


### 圆环位置与空文字状态 · SC-20261113-014

再次核对 libraries.dev 公开 voice-ring/voice 示例：listening 和 speaking 驱动实时电平，processing 使用原版状态，文字框不添加本地包不支持的 Pro processing。对话始终预留 112px 字幕空间；收音无文字时只显示圆环，文字到达、变长、切换思考/回复时圆环保持原位。无文字的思考/回复分别显示状态提示，避免空白；processing 显式置零声学电平。圆环 Canvas 保持挂载，回复字幕独立重新入场。

本地浏览器检查新增圆环 y 坐标跨空文字/首段/长文/思考/回复一致、Canvas 身份保留、空文字提示与回复组重新挂载检查。尚未进行参考站逐帧对比或 WKWebView 本批目验。


### 目标画布尺寸与边界 · SC-20261113-015

浏览器预览默认使用与原生 overlay 一致的 **620×440 CSS px** 画布，24px 内边距；可在“画布尺寸”切换 **320×440** 窄屏。SC-20261113-018 按用户要求移除样例画布虚线与深色底板，画布/根节点均透明，不改原生窗口尺寸；页面可滚动到画布，不能把浏览器页高误认为浮层高度。

仓库浏览器脚本复用生产 probe.css 在 620/390/320×440 视口检查对话与听写全部支持状态、空文字及无空格长文、16px/32px 字体。实际检查容器/圆环/卡片矩形包含于视口且无页面横向溢出；之前 2000 字级长文滚动检查保留。容器边界通过不代表发光每个像素、原生全屏/多屏或 Windows 已验收。


### 取消/迟到事件演练 · SC-20261113-016

新增默认关闭、显式点击的“测试取消与迟到事件（合成）”：对话取消后收到旧回复不重现，新听写不被旧回合覆盖，忙时对话开始被拒绝而不抢占，结束后保持隐藏。重放与 Esc 卸载会清理演练定时器。原手动控制和完整视觉流程保留，两种演练不并行。

`voice-view-state.mjs` 是无副作用的拟议视图协议（run/seq/模式/电平源/文本上限），仅用于隔离实验，不是现有服务 wire format。真实服务缺口及取消职责见 [事件映射准备](../docs/verification/2026-11-13-voice-view-events.md)。尤其不能把 assistant message 当成音频已播放，或把视图隐藏当成录音/插入已取消；这些后续仍需宿主接线与验收。

### 回复与播放分离 · SC-20261113-017

新增“播放分支”及“测试回复与播放状态（合成）”按钮：正常播放后恢复收音 / 关闭朗读 / 播放失败 / 生成中取消。所有音频确认均为合成事件，没有声音输出。文字到达显示“回复文字已就绪”，TTS 显示“正在生成语音”，仅播放开始确认进入说话光效；失败/静音/完成保留文字并清零电平。提示与字幕在同一限高滚动卡片内，回复组不会因播放开始/结束重复入场。

`activity` 表示语义，`phase` 仅选用原版上游外观。ready/muted/failed/completed 复用 listening 零电平外观，**不代表正在录音**；只在 activity=listening 接受输入电平。继续收音需先结束旧回合，再显式新 begin（未来须宿主输入就绪确认），取消分支不恢复。既有完整流程按钮仍为原直接外观合成序列，下一批统一到事件层。未接真实服务，不能声称真实播放/录音已验收。


### 透明背景 · SC-20261113-018

主语音画布无矩形底板或边界线，html/body/root 与画布透明；原版圆环和文字/听写卡片保留自身配色及深色可读表面，控制栏仍为浏览器测试工具而非浮层内容。浏览器检查计算样式与透明截图四角 alpha=0，并验证圆环 Canvas 角点透明。普通浏览器的默认页面底色不代表 Tauri 背景；透明网页不会穿过浏览器窗口显示桌面。原生现有 `.transparent(true)` 与 probe 透明根背景未改，本批未部署或验收真实桌面透底，T0/T1 状态不变。


### 完整流程统一事件层 · SC-20261113-019

“播放完整语音流程（合成）”按当前模式进入 EventRehearsal，与取消演练/播放四分支共用 reduceVoiceView 和唯一计时器所有者，不再直接写 phase。对话：输入→增量提问→思考→增量回复就绪→TTS→播放开始确认→输出电平→播放结束保留文字→旧 run 结束→新 run 收音→隐藏。增量回复只在 ready 阶段，未扩展 TTS/播放期间流式分块。听写：输入→增量文字→orbs→结束隐藏，无 TTS 或插入确认。

结束后保留隐藏的演练状态，可点击“返回手动外观检查”解锁模式/阶段/文字/电平；演练开始会清空手动样例，返回后不恢复旧文字。Esc/隐藏、重播和切换到其他演练均卸载旧实例并清理计时器。手动阶段仅检查外观，不代表服务语义。四分支按钮继续使用自身固定对话样例，主流程不受“播放分支”选择影响。背景透明不变，未连接麦克风/声音/原生 IPC，默认不播放。所有 input/player 确认均为合成，不代表硬件行为。


### 隐藏文字滚动条 · SC-20261113-020

对话文字卡片和听写文字区不再显示滚动条（scrollbar-width:none + WebKit scrollbar 隐藏），仍保留 112px 限高和 overflow-y:auto。浏览器可用滚轮/触控板阅读长文字，原有尾部跟随、上翻保位逻辑未改。规则仅作用于两个文字区，不隐藏设置/历史页或整个网页的滚动条。实际原生 overlay 仍保持鼠标穿透，本批不改变事件接收方式或声称原生可交互滚动。透明背景不变，WKWebView 真机观感待验收。


### 主流程取消矩阵 · SC-20261114-001

浏览器已覆盖对话 7 阶段及听写 2 阶段 × Esc/隐藏/返回手动，共 27 组：立即卸载、越过旧期限不重现、后续手动模式/文字不被覆盖；纯 reducer 对每个活动前缀取消并拒绝同回合后续事件。测试矩阵用快进时钟检查一次性事件，不代表动画逐帧、物理全局 Esc 或真实音频取消。详见 [验证记录](../docs/verification/2026-11-13-reference-scene.md)。T0 未验收、T1 未启动，框架仍为 Tauri，未安装 NSH。


### 接线前契约与缺口 · SC-20261114-002

已核对 Node 无标签播放结束、Rust playbackId 和 Swift 播放对象守卫之间的差异；已有结束回调不等于已具备真实 started/正常结束/失败/取消语义。详见[适配器契约与 G1～G6 缺口](../docs/verification/2026-11-14-voice-adapter-contract.md)，包括 epoch/run/UUID/attempt、串行 seq、录音/播放确认、逐资源取消、最终 ASR 晚到与写入/复制边界。仅文档与离线契约测试，未新增适配器或订阅。T0 未验收、T1 未启动。下一步建立纯合成协调器契约模型；不接硬件、不改已安装应用，当前无需用户操作。


### 纯合成协调器契约模型 · SC-20261114-003

新增[离线模型与验证边界](../docs/verification/2026-11-14-voice-coordinator-model.md)：模型只放在 test-helpers，仅测试显式启用，不被应用/预览导入。验证 epoch/UUID/attempt、统一 seq、24 种资源释放顺序、取消立即隐藏但保持门闩、旧回调不能影响新 run/epoch。模型对象身份不等于 IPC 认证，停止确认只是合成调用；G1～G6 与 T0/T1 仍未验收。下一步补完整恢复/断连组合轨迹，不接服务/硬件，当前无需用户操作。


### 恢复与断连合成矩阵 · SC-20261114-004

[离线协调器记录](../docs/verification/2026-11-14-voice-coordinator-model.md)新增 112 条完成/静音/播放或合成失败→end/drain→下一模式输入确认轨迹，以及 10 个断连阶段。仅模型增加 disconnected 门闩，drain 后仍不自动恢复，需新 epoch 显式重建；迟到确认来自保留的本地 owner ticket，不是断开通道的业务事件。停止确认、输入恢复均为测试调用，不是硬件验收；T0/T1、G1～G6 未验收。下一步交叉验证耗尽/断连与离线 meter 合并契约，不接服务，当前无需用户操作。


### 离线采样调度与耗尽边界 · SC-20261114-005

[模型验证记录](../docs/verification/2026-11-14-voice-coordinator-model.md)补充显式 coalesceMeters 实验：默认关闭，手工 flush，一万条电平只留一槽，缓冲不分配 seq；文字/播放结果优先，取消/结束/断连直接清槽，不等 flush。合并采样保留最后普通序号和终结序号；缩小计数上限交叉检查断连与缺失资源确认。没有自动计时器/生产队列、真实订阅或设备验证；G1～G6、T0/T1 仍未验收。下一步对照主流程夹具的合成确认边界，当前无需用户操作。


### 主语音夹具与协调器边界 · SC-20261114-006

[主流程协调器对照](../docs/verification/2026-11-14-voice-reference-coordination.md)在测试内导入现有完整对话/听写及四种播放分支，逐帧与协调器比较；即时/手工合并共 12 条轨迹。另用七组缺确认反例核对输入就绪、capture stop、chat/TTS/player 原 owner、结束后的 drain/新输入和最终 ASR/writer 边界。仅合成假设，不是适配器，不接真实服务；T0/T1、G1～G6 未验收。下一步定义 processing 后最终 ASR 展示契约，当前无需用户操作。


### Rust 协议测试等待修正 · SC-20261114-007

[验证记录](../docs/verification/2026-11-14-rust-relay-event-wait.md)：用户消息与后续 thinking 状态可能分 stdout 回调到达。测试改为等待原相邻位置存在，再严格断言 type/name，不跳过中间错误事件。七项确定性测试覆盖拆行/半行、超时、顺序与解析错误；没有产品协议或服务行为修改，T0/T1、G1～G6 未验收。


### processing 后最终识别展示契约 · SC-20261114-008

[最终 ASR 独立投影提案](../docs/verification/2026-11-14-final-asr-contract.md)仅由测试启用：最终业务结果（可能已润色）与 listening 增量转写分开，不修改 reducer；展示 ≤8000 UTF-16 且不切 grapheme，完整业务正文 ≤16000 UTF-16 独立保留。原 ASR 身份、一次性结果、原 writer/receipt、取消/断连/跨 run 迟到均有离线验证；没有 React 接线、粘贴或复制，不代表真实最终文字已可见。T0/T1 与 G1～G6 仍未验收；下一步定义写入结果/显式复制候选规则，当前无需用户操作。


### 写入结果与显式复制契约 · SC-20261114-009

[写入结果提案](../docs/verification/2026-11-14-dictation-outcomes.md)仅测试启用：区分 issued/not-issued/unknown，已发出不代表目标接受；只有确认未发出才创建显式复制候选，复制失败需新用户动作，不补发粘贴。取消/end/断连清候选，旧 handle 不可复制新结果，业务结果不替代资源停止证明。没有剪贴板/真实输入或 UI 接线，旧产品回退行为未改；T0/T1、G1～G6 未验收。下一步交叉验证单槽结果/关闭/drain 生命周期，当前无需用户操作。


### 听写组合生命周期 · SC-20261114-010

[组合矩阵证据](../docs/verification/2026-11-14-dictation-lifecycle.md)：原三个模型不变，144 条完整分支/close-stop-next-mode 轨迹，720 条 final/result/stop/close 乱序；旧回调不能覆盖新回合，缺停止证明不放行。明确 outcome dismiss/issued 不会清除独立 final 投影，尚非统一展示仲裁或全局写入授权。仅合成测试，不操作剪贴板/真实设备；T0/T1、G1～G6 未验收。下一步定义单一只读展示选择契约，当前无需用户操作。


### 听写单一展示选择 · SC-20261114-011

[只读选择契约](../docs/verification/2026-11-14-dictation-presentation.md)与默认关闭的纯测试函数：单一状态优先级，只有 thinking 显示 orbs，final/writer/复制终局不伪装收音，终局不展示正文；当前原 session dismiss marker 可隐藏本轮但不释放资源。canCopy 只是提示，原候选与显式动作仍必需；同 session 旧快照新鲜度与主动 marker 生命周期尚未实现。没有 React/服务接线或真实验收，T0/T1、G1～G6 未验收；下一步一致帧采样/dismissal 离线验证，当前无需用户操作。


### 听写一致帧采样/投递 · SC-20261114-012

[一致帧模型](../docs/verification/2026-11-14-dictation-frames.md)默认关闭、仅测试导入：单槽最新原 record/安全递增采样 revision，commit/snapshot 重读原模型，原 session dismissal 不跨新轮，关闭后方法访问即隐藏。不是主动订阅/渲染器，采样 revision 不是业务转换 revision，未观察 ABA 仍可能接受同值旧帧；没有真实 UI/IPC 接线或资源释放，T0/T1/G1～G6 未验收。下一步唯一转换入口/逐转换 revision 离线验证，当前无需用户操作。


### 听写逐接受操作版本 · SC-20261114-013

[唯一转换入口实验](../docs/verification/2026-11-14-dictation-transitions.md)默认关闭、仅测试：内部私有持有原模型，成功操作统一递增版本，即使 ABA 返回同值也拒绝旧 record；失败不消耗版本，dismiss 记录本轮 marker，耗尽隐藏但 close/disconnect/原 stop 清理仍可用。未实现生产唯一消费者、身份认证、异常恢复或主动 DOM 更新。T0/T1/G1～G6 仍未验收；下一步完整轨迹/终止/复制/耗尽交叉验证，当前无需用户操作。


### 转换入口完整轨迹 · SC-20261114-014

[生命周期矩阵](../docs/verification/2026-11-14-dictation-transition-lifecycle.md)仅新增离线测试：144 条完整分支/下一模式、720 条 final/result/停止/close 重排、192 条逐前缀耗尽/清理轨迹，逐接受/拒绝校验 revision 与展示，原模型和产品代码不改。不是硬件/目标接受证明；T0/T1/G1～G6 仍未验收。下一步候选有界寿命与主动失效契约，当前无需用户操作。


### 候选寿命/失效提案 · SC-20261114-015

[默认关闭的离线策略](../docs/verification/2026-11-14-dictation-lifetime.md)使用显式逻辑时钟：not-issued 候选绝对截止，复制失败/重试不续命；锁屏/设置关闭门闩独立恢复，旧资源仍需停止确认。没有生产 timer/系统监听/剪贴板操作，原代码与旧跨结束复制回退不改，T0/T1/G1～G6 未验收。下一步验证同刻回调/截止/全局事件排列与陈旧事件契约，无需用户操作。


### 全局事件版本与截止优先 · SC-20261114-016

[仅测试接收提案](../docs/verification/2026-11-14-dictation-event-order.md)初始 lock/settings 均未知阻止工作，逐通道拒绝旧/重复生成版本，操作入口先检查逻辑截止；96 条复制/tick/lock/disable 排列验证原 lease 保留。未到达的锁屏事实仍不可推断，非系统源认证/生产定时器。下一步通知源断连/重新同步握手；T0/T1/G1～G6 未验收，无需用户操作。


### 通知源失联/重新同步 · SC-20261114-017

[离线握手提案](../docs/verification/2026-11-14-dictation-source-sync.md)新增默认关闭模型：显式源失联关闭 run、旧 query token 撤销，两路新快照和原资源 stop/drain 分别确认；48 条排列逐前缀验证。无真实通知/心跳/系统查询，静默失联不能自动发现；T0/T1/G1～G6 未验收。下一步逻辑活性期限及副作用前复查契约，无需用户操作。


### 通知源逻辑活性期限 · SC-20261114-018

[仅测试期限提案](../docs/verification/2026-11-14-dictation-source-lease.md)默认关闭，lock/settings 独立预算，可信 observedAt 完整快照才续对应通道，普通活动与 update 不续命；96 条续期/截止/复制排列。显式逻辑时间，不是自动 timer/原生授权，TOCTOU 未解决；T0/T1/G1～G6 未验收。下一步副作用前复查/发出边界，无需用户操作。


### 显式复制复查/执行器边界 · SC-20261114-019

[默认关闭离线提案](../docs/verification/2026-11-14-dictation-copy-effect.md)：原 session/copy 一次性 check，交接前失效为 not-issued，handoff 起为 unknown；真实 written/not-written/unknown 回报与 executor stopped 独立，480 条重排。不是实际 OS 复查或自动粘贴协议，TOCTOU 未解决；T0/T1/G1～G6 未验收。下一步 executor/源/语音恢复组合验证，无需用户操作。


### 显式复制组合恢复 · SC-20261114-020

[离线恢复矩阵](../docs/verification/2026-11-14-dictation-copy-recovery.md)只加测试，不改原模型：4320 条源/voice/executor 重排与 288 条 epoch 重建路径，fresh、原 stop/drain、inputReady、executor stopped 分开。缺停止证明不超时成功；未接真实 OS、未解决 TOCTOU，T0/T1/G1～G6 未验收。下一步明确局部执行结果的展示归属，无需用户操作。


### 原回合复制结果徽标 · SC-20261114-021

[默认关闭离线提案](../docs/verification/2026-11-14-dictation-copy-result.md)私有持有原 copy-effect，成功 prepare 绑定当前原 session，只有原 job 回报影响本任务徽标；新轮/重试不借旧成功。144 条排列与失联/epoch/隐藏/耗尽反例；hidden 不代表全局空闲，也不授权复制。未接前端，TOCTOU 与 T0/T1/G1～G6 未验收。下一步展示与等待提示组合，无需用户操作。


### 工具链恢复检查点 · SC-20261115-001

[官方源站恢复与回归证据](../docs/verification/2026-11-15-rust-toolchain-recovery.md)：独立 Rust 1.100.0 已可运行，默认 stable 中断状态保留；完整回归仍 729 pass/6 fail/1 cancelled，缩小复测 10 pass/3 fail。先定位控制子进程阻塞，不以工具可用代替 SC021 验收，不叠加等待提示功能。


### 控制子进程诊断 · SC-20261115-002

[仅测试诊断增强](../docs/verification/2026-11-15-control-subprocess-diagnostics.md)保留原异常与时限，不记录参数/业务正文。无业务同步子进程也观测到秒级延迟；完整回归 739 pass/4 fail，根因未定位，非功能修复或 SC021 验收。
