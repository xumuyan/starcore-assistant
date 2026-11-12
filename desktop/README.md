# 隔离桌面视觉层（SC-20261112-005）

这是未来 Tauri 2 壳可复用的 React 原组件预览，**不是可用的新客户端**。不修改旧 Swift/Node 构建入口、已安装应用、权限、运行配置或加密历史；无麦克风/聊天/文件/IPC/网络访问。默认所有效果隐藏，仅用户在预览控件中显式切换时显示。Esc 只是本地页面隐藏，不是已接入全局听写取消。

## 构建和预览

```sh
npm ci
npm run build:desktop:preview
# 用本地静态服务器打开 dist/desktop-preview/index.html；不要使用外部 CDN。
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist/desktop-preview
```

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


### 显式普通控制窗口诊断模式（SC-20261112-007）

```sh
npm run desktop:probe -- -- --diagnostic-controls
```

仅该参数启用时，chooser/history/settings 改为带标题栏、不透明、非置顶的普通窗口；macOS 应用改为 Regular 激活策略，自动显示 chooser。标题含 `diagnostic`，额外 40px 留给诊断标题栏。模式不持久化，下次普通启动恢复隐藏的 accessory 壳；不改变产品默认入口。**overlay 始终保持原有透明、置顶、不可聚焦和鼠标穿透配置**，不会为绕过焦点保护而使浮层可输入。

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
