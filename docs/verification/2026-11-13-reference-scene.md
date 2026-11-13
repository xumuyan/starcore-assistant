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


## SC-20261113-013 状态衔接与长文字

- 用户在 SC-012 后回复“可以”，本批记录为按键合成预览可见；不扩大为真实右 Ctrl、录音或输入验证。SC-012 的“用户仍需刷新确认”在此得到该有限范围确认。
- 新增共享 TranscriptViewport：layout commit 后跟随尾部，上翻超过 24px 暂停跟随，回到尾部恢复；保留 transcript 分词节点及 React 转义。
- 听写预留固定 64px orbs 槽位，文字独立限高 112px；短文本收音/思考高度保持一致，长文不挤出浮层。
- 两种效果加本地 220ms 入场，reduce 时取消本地 CSS 动画。上游 Canvas 动效保留，不声称所有动效关闭；隐藏立即卸载，无淡出等待。
- 新增可复现 `desktop/check-effects-browser.mjs`，使用显式外部 Playwright 路径或已有 playwright 安装，本地临时 HTTP 服务，finally 关闭浏览器/服务；不加入默认回归、不联网安装。实际 Chromium 通过尾部跟随→上翻保位→回到底部恢复、原版圆环尺寸、orbs 高度不跳变/Canvas、听写长文字容器≤140px、增量前缀节点保留、reduce 下本地入场关闭、听写播放与 Esc 后不重现、零外部请求和控制台错误。
- 相关单元、离线构建和完整回归结果见操作日志；WKWebView 新布局、真实麦克风、外部应用焦点、物理按键仍未验收。T0/T1 状态保持。


## SC-20261113-014 对话状态对照与圆环锚定

- 本批 curl 实际读取 https://libraries.dev/voice-ring 和 https://libraries.dev/voice 公开 HTML，并对照已安装包 README/类型定义；上游示例明确 listening/speaking/processing 与 0–1 电平，voice processing 的开源包限制保持。没有复制网站动画脚本或 Pro 代码。
- 发现原先居中布局的总高度随字幕变化，无文字→首段/长文会使圆环上跳。新增固定 112px 字幕槽位，收音无文字不挂载 beam/voice；思考/回复无文字时显示对应 role=status 提示。processing 圆环显式零电平，避免残留输入电平影响状态意图，上游运动参数不改。
- 浏览器脚本实际验证圆环 y 坐标在无文字、首段、长文、空思考/回复一致；跨状态保留同一圆环 Canvas；进入回复时新建字幕组；无文字提示正确；原有长文跟随/上翻、听写 orbs、reduce/Esc/离线检查继续通过。非逐帧还原验收。
- 效果专项 8/8、preview/probe 离线构建通过；完整回归结果见操作日志。无原生改动，不重新部署/安装应用，WKWebView 与物理键仍未验收。
- 下一步：核查目标浮层尺寸、窄屏边界与长文容纳，整理真实服务事件到视图状态的映射；T0 未验收，T1 未启动，映射准备不等于已连接真实服务。


## SC-20261113-015 浮层与窄屏边界

- 读取 main.rs 确认原生 overlay 为 620×440，probe-overlay padding 24px。未修改原生代码。
- 预览由宽屏 460px min-height 改为默认 620×440/24px padding 的可见虚线画布；新增 320×440 窄屏选项，宽度不超过所在页面。
- 扩展隔离浏览器脚本：加载仓库生产 probe.css、将测试舞台替换为 probe-overlay，不通过新增测试专用生产入口。620/390/320×440 ×16/32px 字体×对话/听写各支持状态×空文/无空格长文；断言文本实际到达 DOM、效果/圆环/卡片几何矩形不越界且页面无横向溢出。验证预览默认 620×440 与切换 320px 生效。既有长文跟随、圆环锚定、Esc、offline 检查继续通过。
- 初始脚本一次 40s 超时；增加输入内容确认后，较重长文多组测试另一次打印 PASS 后关闭阶段超时，不能记录整次运行通过。减少矩阵单条重复长度（既有 2000 字级测试保留）、清理 HTTP 连接后完整执行正常退出并通过。矩形检查不证明所有辉光像素无裁切；没有必要为未复现问题改生产组件布局。
- 构建/单元/完整回归见操作日志。非真实 WKWebView 多屏/全屏/点击穿透验收；T0 未验收、T1 未启动。
- 下一步：梳理现有服务输出与视图状态映射、取消/迟到事件规则，先做隔离合成验证；不直接接入麦克风/输入或更换已安装应用。

## SC-20261113-016 合成事件驱动准备

新增独立显式事件演练与纯视图 reducer，取消后迟到回复、新回合隔离、忙时模式互斥、结束/重播/Esc 定时器清理均已通过 Chromium DOM/Canvas 检查。原手动/完整视觉流程及边界矩阵保留；不引入真实服务订阅。事件与旧服务差异、尚缺播放生命周期及验收边界见 [事件映射准备](2026-11-13-voice-view-events.md)。T0 未验收、T1 未启动。

## SC-20261113-017 回复文字与播放生命周期

隔离视图增加 activity 语义，只有播放开始确认才进入 speaking，文字就绪/TTS/静音/失败/完成使用明确提示及零电平原版外观。浏览器新增四分支实际 DOM 检查，回复组在准备→播放→结束保持、失败/静音保留文字、取消后迟到播放无效、恢复收音使用新 run。全部为合成事件，无声音或麦克风；原生未验收。协议与检查细节见 [事件映射准备](2026-11-13-voice-view-events.md) 的 SC-017 更新。


## SC-20261113-018 透明语音画布

用户要求透明背景。移除预览画布 #111 底板及虚线，根 html/body/root 显式透明；保留原版 beam/听写卡片深色表面与控制栏。Chromium 实际检查计算背景透明，在隐藏、对话圆环、听写 processing 时用 omitBackground 截图检测画布四角 alpha=0，另读取圆环 Canvas 角点 alpha=0；截图仅在内存，不保存桌面内容。现有布局/离线/状态分支检查通过。原生 `.transparent(true)` 与 probe 透明根 CSS 已存在且未改；普通浏览器页面透明不能透出桌面，不以浏览器截图代替原生 WKWebView 透明/全屏/多屏验收。T0 未验收、T1 未启动。


## SC-20261113-019 主完整流程统一事件层

原 reference-sequence 改为不可变的事件轨迹；主按钮与其他实验共用 EventRehearsal/reducer，不再保留直接 phase 计时流程。对话回复在 ready 时增量，TTS 之前不进入 speaking；播放完成保留文字清零，旧 run 结束后才显式新 run 收音；听写无 reply/playback，end 不等于插入成功。

Chromium 实际检查主按钮的 thinking→ready→synthesizing→playing（输出电平）→completed→新 run→closed、听写增量/orbs/closed、重播重置与切换实验清旧计时器、返回手动解锁及可用性。透明 alpha、此前长文/布局矩阵/播放分支/离线检查保持通过。主流程结束仍留隐藏演练状态，用户显式返回手动或 Esc 后再手动选择外观；不是自动恢复真实录音。构建、相关单元和完整回归结果见操作日志。原生未部署，真实录音/播放未验收，T0 未验收、T1 未启动。
