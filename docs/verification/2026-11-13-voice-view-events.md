# 隔离视图事件协议准备 · SC-20261113-016

## 范围

这是拟议的视图输入层，不是旧服务协议、Tauri IPC 或 T1 已完成。`voice-view-state.mjs` 是无副作用的纯 reducer，默认隐藏；仅浏览器显式“测试取消与迟到事件（合成）”使用。旧服务、Swift、Rust、录音/播放/插入、加密数据均未修改。页面不会订阅服务事件。

## 已读取的当前实现及接线缺口

| 当前来源 | 已核实行为 | 后续适配约束（尚未实现） |
| --- | --- | --- |
| `src/assistant-service.mjs` | `state` 有 loading/transcribing/listening/thinking/polishing/synthesizing/armed/idle/error；`message` 分 user/assistant；`speak/play/stopAudio` 单独发出，无统一对外回合 ID；内部有 generation 守卫 | 不能在收到事件时套用“当前回合”ID。由受管协调器在异步操作启动前捕获 run，并验证单消费者；普通历史/提醒/文字聊天不能误唤起语音浮层 |
| 同上 `answer()`/`speak()` | answer 发 assistant message 后即发 listening/idle；随后才可能 TTS/speak/play，也可关闭朗读 | 不能把 assistant message 直接当成已播放；需区分文本就绪、TTS 准备、实际播放开始/结束，静音回复与连续收音另需明确状态设计。本批 reply 仅为合成“回复外观”，不是播放确认 |
| `src/assistant-dictation.mjs` | dictationState(loading/recording/transcribing/polishing/cancelled)、Ready/Result/Error/Notice 带 UUID；Result 是最终完整文本，现无增量文字事件 | UUID 需要映射到协调器 run；Begin/录音真正开始、用户结束录音由宿主确认。不能因 transcribing 就假设物理录音停止；不可伪造真实增量 ASR |
| `client/DictationController.swift` | preparing/recording/processing/inserting；Ready 才启动录音；结束录音后 processing；Result 仅 processing 可插入；失败提供复制回退 | 写入/复制结果与视图隐藏必须独立确认，不能用 reducer 的 end 假装插入成功。保留取消、超时、输入目标守卫 |
| `src/assistant-dictation-host.mjs` | 忙时拒绝听写；听写占用期间禁止 audio/text/activate/previewVoice 竞争 | 视图互斥不等于硬件/服务互斥；未来宿主还需维持现有单消费者门闩 |

## 合成视图事件规则

- `begin {run, seq:0, mode}`：协调器递增安全整数 run（从 1 开始），只在 inactive 且比水位更新时接受；busy 时拒绝而非抢占或排队。两模式共用一个视图槽位。
- 其余事件必须属于当前 active run，seq 为递增安全整数；未知、重复、乱序、非法字段为同一 state 引用的 no-op。seq 是**统一有序的视图投递序号**，不是各异步任务完成序号；未来桥接必须先串行化，否则高频电平可让低序号文本失效。底层结果还需自己的异步代次校验。
- `transcript {text}`：仅 listening，完整快照、最大 8000 UTF-16 code units（仅视图限制，不更改听写原有 16000 上限）；保留 React 转义。无增量事件的服务不能宣称流式输出。
- `process`：listening→processing（重复允许），电平清零。
- `reply {text}`：只允许 conversation processing/speaking；不会让旧 ASR 覆盖回复；dictation 禁用 speaking。只是合成外观，真实文本与播放状态仍需后续拆分。
- `meter {source, level}`：listening 只接受 input，speaking 只接受 output；有限数值钳制 0–1，processing 不吃电平。
- `cancel/end/fail`：终结当前 run，隐藏并清空文本/电平，保留水位；任意迟到回调不能重新打开。继续对话需明确新 begin，不能复用已关闭 run。
- reducer 仅变更视图；Esc 真正取消 recorder/ASR/TTS/writer、恢复唤醒、权限/超时/错误提示与复制回退仍由未来宿主负责。不得把此纯函数当作取消业务工作的证据。

## 实际验证

- Node 单元检查默认隐藏、合法对话与电平、模式互斥、cancel/end/fail、旧回合/重复/乱序/非法/过长事件及 100 次回合水位；合成固定轨迹检查拒绝分支。
- Chromium 实际 DOM/Canvas：合成对话→取消→迟到 reply 不重现→新听写→旧 reply 不覆盖→忙时 begin 拒绝→processing→结束保持隐藏；重放及 Esc 卸载清理所有后续定时器，零外部请求/控制台错误。既有长文/布局矩阵检查继续通过。
- 非 WKWebView、真实服务接线或物理 Esc/热键验收。完整回归结果见操作日志；T0 未验收，T1 未启动。

## 下一步

补齐“文本就绪 / 合成语音 / 实际播放 / 静音回复 / 连续收音”的独立状态契约及合成测试，不能用 message 推断声音已经播放。真实接线继续受 T0/T1 门槛约束。
