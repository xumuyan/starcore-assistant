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
