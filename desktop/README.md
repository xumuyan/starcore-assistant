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
