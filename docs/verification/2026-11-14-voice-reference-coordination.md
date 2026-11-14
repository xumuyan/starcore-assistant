# 主语音夹具与协调器边界对照 · SC-20261114-006

## 范围

保持 Tauri 2 + Rust + React，T0 未验收、T1 未启动，G1～G6 仍未验收。仅新增 `test/voice-coordinator-reference.test.mjs` 与文档：导入实际 `referenceSequence`、`dictationSequence`、`playbackRehearsal`，逐帧对照离线协调器与视图 reducer。不修改生产服务、预览、原生代码或运行配置；不订阅服务、不启动输入/播放、不申请权限、不安装 NSH、不替换应用。当前无需用户操作或授权。

这是**测试内路由**，不是适配器。它只路由已知、可信的合成帧，不使用时间戳推断身份、录音就绪或资源停止，也没有真实调度器。`at` 只用作断言标签，既未等待这些时间，也未验证动画/设备延迟。fixture 的 run 仅在测试 Map 查找已预约 owner；缺映射不借当前会话，实际模型仍只接受原始 session/ticket。对象身份不等于 IPC 认证。

## 显式假设清单

测试通过 `prepareFrame` 明确注入下列**合成假设**，它是这几个固定夹具的准备脚本，绝不可移植为“收到 frame 就自动确认”的生产逻辑。每一假设均有独立缺确认反例；成功演练不能证明设备能提供这些证据。

| 夹具节点 | 测试额外注入的假设 | 缺少时的核对 / 真实缺口 |
| --- | --- | --- |
| begin | 预约原 session、分配 capture/asr，单独设置 `inputConfirmed` 后调 inputReady | 仅 begin 帧、预约、capture 分配均保持隐藏；真实录音成功确认仍缺 |
| transcript | 使用原 ASR ticket；当前夹具提供 listening 期间完整文字快照 | 当前听写服务没有增量 ASR，此处是合成文字而非已存在的流式来源；最终 ASR 晚于 process 仍被拒绝 |
| process | 原 capture 先 `released(stopped:true)`，再进入 processing；分配后续 chat 或 writer | 缺 stop 则拒绝且不占 seq，不从 transcribing/process 推断停止；真实不可中断 ASR 门闩继续保留 |
| reply | 测试预先分配原 chat lease | 缺原 owner 拒绝，不收到文字就自动分配身份；ready 不等于开始发声 |
| synthesis-started | 明确分配 TTS lease | 缺原 TTS 拒绝；现有系统声音不能伪造 Fish 合成 |
| playback-started / output meter | 分配原 player，夹具明确提供 started | 分配 player 不进入 speaking，缺失/复制 owner 拒绝；真实开始确认和 attempt 贯穿仍缺 |
| playback-ended | 夹具提供正常结束帧 | 保留文字/零电平，但 player lease 不自动释放；现有正常/失败/取消结果区分仍缺 |
| end / cancel | 仅关闭视图，测试另行逐项 drain | 缺 player 或其他任一停止确认不能接新 run；新的 begin 仍需新的 inputConfirmed |
| dictation end | 仅关闭视图，测试单独保留 ASR/writer lease 再释放 | 视图隐藏或 writer 回收不等于插入成功、不等于复制成功；未调用实际 writer，未修改剪贴板或发出粘贴 |

## 可执行对照

命令：`node --test test/voice-coordinator-reference.test.mjs`。

- 六个实际夹具：完整对话、完整听写，以及 played/muted/failed/cancelled 四个播放分支。分别在默认即时电平和显式合并模式运行，**12 条完整轨迹**；合并模式在每个 meter 后手工 flush，故不假装测到了 rAF 或批次采样效果（高频合并证据见 [SC-005](2026-11-14-voice-coordinator-model.md)）。
- 每帧对照 active/mode/phase/activity/level/text/run。完整对话/听写还逐帧比较 seq；其它分支的夹具 seq 含跨 run/被忽略帧的间隔，而模型按接受到达次序编号，不能要求两者绝对数字一致。取消后的迟到 start/end 仍不改变视图。
- 七组缺确认反例：缺 inputReady、缺 capture stop、缺 chat/TTS、缺原 player、playback-ended/end 后未 drain/未新输入确认、听写最终 ASR 与 writer 边界、未知 run/复制 handle 不借当前 ownership。
- 文档边界/证据链接检查一项；共 20 项测试。实际测试和完整回归结果记录于 operatelog，不以演练数量替代设备验收。

测试 Map/`inputConfirmed`/准备脚本只表达已知夹具的假设，没有序列化认证、服务事件映射、真实开始/停止、播放回退、最终识别展示或 writer 结果通道。模型本身未修改；旧的听写 ASR 缺口保持可见，不为通过演练而放宽 reducer。

## 下一步

本批既有 Rust 协议测试两次复现第 252 行快照读取失败，最后完整重跑通过不代表修复（详见操作日志）。SC-20261114-007 已独立[修正该测试的相邻事件等待](2026-11-14-rust-relay-event-wait.md)，不改产品协议；下一步继续离线准备最终 ASR 的展示契约：明确 processing 后结果、视图截取与业务原文分离、取消/迟到结果和 writer 边界；先定义并验证，不默认开启或连接真实服务。真实接线仍依赖 [T0 手测](2026-11-12-tauri-t0-manual.md)与 T1，G1～G6 全部未验收，当前无需用户操作或授权。
