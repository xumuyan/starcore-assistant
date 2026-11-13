# libraries.dev 主语音视觉 · SC-20261113-011

## 范围与结论

用户重新强调主任务为参考站实现的界面重构。本批仅推进共享 React 主视觉及浏览器合成流程，不增加诊断窗口、不接真实服务、不替换已安装应用、不修改配置/加密历史。T0 未验收，T1 未启动。上批提交 51092f248fae5f2d350a61a89bf64e2a0471e912 已核对远端一致。

## 参考核查

本批通过 curl 重新读取 https://libraries.dev/voice-ring 、https://libraries.dev/beam 、https://libraries.dev/voice 、https://libraries.dev/orbs 的公开 HTML 示例，核对使用 VoiceRing 240px、BorderBeam、VoiceBeam、ThinkingOrb；npm 使用原锁定组件，未更新依赖或复制网站脚本。Python urllib 请求遭 403，curl 可以获取。voice 页面 processing 属性与本地开源包不一致的限制继续保留，不下载 Pro 代码。

## 修改

- 独立 voice-ring-slot 固定 240×240，移除 conversation-effect 全部 div 被拉宽的规则。
- BorderBeam → 圆角 section → VoiceBeam → 圆角内容的嵌套，使两组件都能读取直接子节点圆角；保留上游光谱/动画参数与公开示例的 #1d1d1d 卡片底色。
- 中文分词与稳定 offset+word key 独立为纯函数；ASR/回复增量前缀保留节点，识别与回复分开 key，避免相同前缀阻止回复重新入场。本地短阶梯淡入非上游 Pro 功能。
- 内容区 max-height 112px 并滚动，避免长回复挤出 440px 浮层；完整滚动操作不在鼠标穿透浮层中验收，本批仅防止容器无限增高。
- 默认关闭的合成播放：收音 → 识别分段 → processing → speaking 分段 → 收音 → hidden；重播、Esc、隐藏、卸载清理所有 timer。不进行录音、网络、写入或声音播放。

## 实际执行结果

- `node --test test/desktop-effects.test.mjs`：5/5，通过上游离线打包、SSR、文本转义、分词前缀/Unicode/长度限制、布局与合成序列检查。
- `npm test`：282/282（0 fail / skip）；最终文档更新后复跑先因 PLAN 手工单链接遗漏为 281/282，恢复链接并增加优先级检查后 283/283。
- `npm run build:desktop:preview`、`npm run build:desktop:probe`、`npm run build:desktop:check`、`npm run build:mac:check`：通过；旧 Mac 仅构建不安装。
- 隔离 Chromium 实际运行两轮：240×240 ring bounding box；listening/processing/speaking 上游 DOM/Canvas；中文、长文本 scrollHeight > clientHeight、总高度 <400px；完整流程至识别/思考/回复；Esc 之后待执行帧不会重现；dictation orbs；外部请求为零、控制台错误为零。合成截图临时查看，不作为私人桌面截图提交。

## 未验收

参考站与本地逐帧/性能/动画时序对比、WKWebView 本批新布局真机目验、真实麦克风与聊天驱动、全屏/多屏/外部焦点/点击穿透、Windows、完整 B1～B8 均未验收。卡片限高不代表已完成长文历史查看；辅助历史/设置页本批不改。视觉开发继续推进，产品接线仍按 T0/T1 门槛。


## SC-20261113-012 按键模式看不到的预览修复

- 用户反馈唤醒对话可见、按键对话不可见；本批定位的是浏览器预览，不据此标记真实唤醒或物理热键通过。
- 根因：播放按钮硬编码 setMode('conversation')；模式选择只改 mode，原 phase=hidden 时仍为空白。
- 修复：播放按当前模式选择序列；切换模式重置为 listening，0.4 合成电平、清空文字；新增听写 listening→processing/orbs→hidden，听写阶段菜单不提供回复态。保持零麦克风、零物理右 Ctrl、零写入。
- 效果专项 6/6；preview/probe 构建通过。隔离 Chromium 实际验证从 hidden 切换听写立即可见、播放后仍为 dictation、合成分段文字与 processing canvas、结束隐藏、重新播放后 Esc 取消且后续帧不重现、切回对话可见；零外部请求/控制台错误。临时合成截图确认 orbs 与长条在屏，不入库。
- 完整回归结果见操作日志；原生窗口、真实物理键、真实语音与输入仍未验收。
