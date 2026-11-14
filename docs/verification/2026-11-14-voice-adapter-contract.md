# 真实服务接线前契约与缺口 · SC-20261114-002

## 状态与边界

这是源码核对后的**拟议适配器契约**，不是已经实现的适配器、生产 wire format 或设备验收。保持 Tauri 2 + Rust + React；T0 未验收、T1 未启动。本批只改文档和测试，不订阅服务、不启动录音或播放、不请求权限、不安装 NSH、不替换已安装应用，不触碰真实配置、加密历史或凭据。新增接线将保持默认关闭。

[合成视图协议与历史证据](2026-11-13-voice-view-events.md)继续有效，以 SC-017 的 activity 规则为准。`phase=listening` 只是外观，不能推断麦克风正在录音。现有纯 reducer 不负责授权、单消费者、业务取消或写入，也不能替宿主认证事件来源。

## 1. 当前来源核对：不能直接订阅后翻译

| 来源（仓库文件与符号） | 已核实的现有行为 | 缺口 / 禁止推断 |
| --- | --- | --- |
| `src/assistant-service.mjs`：`audio/text/answer/speak/cancel` | 内部 generation 拒绝部分过期异步结果；voice 来源参与历史分类。answer 先发 assistant message 和 listening/idle，再调用 speak；speak 可因朗读关闭直接返回；Node 的 speak/play 无 playbackId | 对外 message/state 未携带统一 run/origin。文本、提醒、声音试听等共用发声路径，不能收到事件就套当前 run；listening 不等于录音恢复；内部 playing=true 不是播放确认 |
| `src/assistant-host.mjs`：playbackEnded 分支 | 无 ID 校验地清 playing、激活 wake、发 listening/idle | 不能据此认定某个新视图 run 正常播完；宿主输入并非整条请求串行，不能为了视图 seq 把取消阻塞在长任务后面 |
| `client/AssistantBridge.swift`：speak/play/finishedAudio/stopAudio | 系统朗读在 synthesizer.speak 调用前发 speaking；AVAudioPlayer 在 play() 返回 true 后发 speaking。停止前先使对象失效；outputLevel 无 run/playbackId。播放完成、解码错误、系统 didCancel 均走 finishedAudio，successfully flag 未用于区分结果 | 已有本地回调，不是完全没有播放生命周期，但缺少统一 started 与成功/失败/取消原因。speaking/outputLevel 不可直接当作新协议确认 |
| `client/AssistantPlayback.swift`：begin/finish/stop | 保留当前播放对象，以对象身份拒绝旧回调；可回传可选 playbackId 的 playbackEnded；Node 旧事件仍无标签 | 对象隔离已有保护，不能写成所有旧回调都会穿透；缺的是跨层 run/attempt/结果语义 |
| `rust-host/src/chat.rs`：speak/playback_ended；`rust-host/src/serve.rs` | Rust speak/play 带 playbackId，playback_ended 通过 end_playback 校验缺失/过期/重复 ID，接受后发 idle | Rust 已有 ID 防护，不应退化成 Node 无标签契约；仍无统一 view run、真实 started、区分失败/取消的结果。占用播放槽位不等于声音已开始 |
| `src/assistant-dictation.mjs`：begin/append/finish/cancel | UUID 会话、串行 ASR tail、current(session) 结果守卫；模型就绪就先发 recording 再 Ready；Result 是完整最终文字，原上限 16000；取消使会话失效并 abort，已进入的底层识别仍可能跑完 | recording/Ready 是服务准备好，不是麦克风已启动；无增量 ASR 事件。ASR 串行尾链不能因视图隐藏而丢弃，否则可能并行消费同一模型 |
| `client/DictationController.swift`：handle/finishRecording/endSession | Ready 后 recorder.begin 成功才 recording；recorder.finish 后才 processing；Result 仅 processing 可进入 inserting；writer 回调受 requestID 守卫；复制是用户显式点击 | Result 不等于插入成功。posted 只显示“已发出粘贴”，不是目标应用已持久接受。cancel 调 recorder/writer 并发 dictationCancel，不是统一停止确认 |
| `src/assistant-dictation-host.mjs`：handle/isBlocked | busy/asrBusy/playing 拒绝听写；听写 active 时吞旧 audio、拒绝 text/activate/previewVoice | 现有门闩必须保留。reducer 拒绝第二 begin 不会替宿主锁住硬件；未来 Rust ASR 接入也要加入同一个所有权模型 |

## 2. 身份、投递和信任边界（拟议，未接线）

1. **一个协调器拥有一个活动槽位**，跨 conversation/dictation。只接受宿主确认的语音入口；history、historyPage、configured、targets、usage、普通 text/chat、Codex 交接/完成提醒、previewVoice、notice/error 均不隐式打开浮层。普通文字/提醒的既有业务功能不删除；其显示路径与语音浮层分开。全局 error 无归属时不得终结当前语音 run。
2. 协调器在异步任务启动前捕获不可变 `{epoch, run, origin, mode, operationId}`；听写 UUID → run，播放器 playbackId/attemptId → run。**迟到回调不得补贴当前 run**。缺失/未知身份直接丢弃，不按时间邻近、文案、state 名称猜关联。旧 Node 无标签输出需要在生产者入口贯穿身份，不能仅靠一个全局 emit 包装器补标签。
3. epoch 是协调器/受管进程实例身份；view run 是同一实例内从 1 起的安全整数。重连/重启必须关闭旧订阅、失效旧 epoch 并重建视图实例后才可重置 run；若保留 reducer 则水位继续递增。不能把 UUID 截短、hash 成 run 或超过 MAX_SAFE_INTEGER 后回绕；耗尽时停止并显式重建隔离实例。实例内重播 run1 仅是实验，不是生产策略。
4. 先检查 epoch/run/operationId、真实来源、模式与取消水位，再在**统一串行视图投递队列**分配递增 seq。seq 是视图投递次序，不是各 worker 独立计数或异步启动顺序；input/output meter 若合并，只能合并同身份同 source 的待发采样。不要预留一个低 seq 给尚未完成的文本，再被高频电平抢先越过。
5. `begin` 只在输入资源真正就绪、归属确认且槽位空闲时投递，seq=0；准备/权限/模型加载使用宿主独立状态，不假装收音。录音停止确认之后才投递 process；ASR 最终文字如果晚于 process，**不能硬塞 transcript**（reducer 仅 listening 接受）。未来要定义最终识别展示事件/独立状态，或诚实保留无文字思考；本批不放宽 reducer。
6. 投递前验证尺寸、字段、来源和合法阶段。视图文本上限 8000 UTF-16 code units 不等于听写业务上限 16000。后续展示可按 Unicode 安全边界截取并提示，原始完整结果仍交原 writer/复制链路；不能从截断后的视图文字执行写入，也不把原文载荷记进诊断日志。
7. 当前 reducer 只是最后一层状态守卫，**不认证** origin/epoch/operationId。未来 IPC 需显式白名单和验证，不能把当前 `probe_demo` 或 `core:event:allow-listen` 扩展成任意服务转发；诊断/合成事件与生产通道必须隔离。

## 3. 文本、TTS 与播放确认

以下均为未来协调器投递条件，而不是已接入的回调。

| 视图事件 | 必要证据 / 禁止替代 |
| --- | --- |
| reply | 当前 conversation 的最终/ready 阶段完整回复快照。无 thinking 路径的本地直答需显式建模，不伪造“云端思考”。不把 assistant message 自动视作 voice 回复 |
| synthesis-started | 同 run 的 TTS 任务已开始；系统朗读可从 ready 等真实开播，不能伪造 Fish TTS |
| playback-started | 同 run + playbackId/attemptId 的播放器真实开始确认；系统朗读需 start delegate，文件播放需有清晰的启动成功定义及设备验收。emit speak/play、playing=true、创建对象/占槽均不算 |
| playback-ended | 当前 playing attempt 正常结束确认；didCancel、解码错误、失败 flag 不得翻译为 completed |
| playback-failed | 当前 ready/synthesizing/playing 的终局失败，保留文字。现有 Fish→系统声音回退必须保留，但视图进入 failed 后不允许原 run 再 started；未来先完成回退决策再判终局，attempt 相关状态需单独设计，不能假称本 reducer 已支持重试 |
| reply-muted | 本回合确认为关闭朗读且不会发声；不是等不到回调或超时。提醒强制朗读等原策略与主语音 run 分开 |
| meter | input 仅来自当前录音会话且 activity=listening；output 仅当前 playing attempt。不得拿原无标签 outputLevel 或 ready 的 listening 外观当合法来源 |

TTS 开始后本模型不再接受 reply；真实流式文本/分块音频必须另定 segment/attempt 协议。播放完成、静音、失败均不自动收音：先结束旧 run，待输入恢复确认再显式新 begin。旧 finishedAudio 恢复 microphone 的行为属于旧链路，不能作为新壳恢复输入已经验收的证据。

## 4. 取消职责与确认矩阵

取消分为“用户视图立即关闭”与“后台资源已释放”两个独立结果。协调器应先标记该 run 已取消、失效任务/播放身份、清待投递事件，再发视图 cancel 并通知各业务拥有者；不能等长任务结束才响应 Esc。**视图隐藏不等于停止确认**，未收到确认不得把资源槽位让给新任务。重复取消须幂等；超时保持受阻/错误，不静默重试或假装完成。

| 资源拥有者 | 取消职责 | 后续所需确认（当前无统一协议） |
| --- | --- | --- |
| recorder / 平台输入层 | 停录、断开 input meter/音频回调、丢弃未提交块 | 当前 captureId 已停止；失败/超时明确报错，不能仅看 transcribing |
| ASR / 模型消费者 | 失效该 session 的结果，取消可中断工作；不可中断推理需等串行 tail 退出 | 结果不可投递与底层消费者释放分别确认；丢弃结果不代表推理停止 |
| 聊天/润色/TTS transport | abort、失效 operationId、移除回调/队列，处理不服从 abort 的返回 | 迟到响应不交付；业务结束与底层请求可能继续的边界明示，不承诺网络已物理停止 |
| player / 平台输出层 | 先失效播放对象和 attempt，再停止、清 output meter/delegate | 对应 attempt 已停止或失败；旧 didFinish/didCancel 不能完成新 attempt；stopAudio 命令不是确认 |
| writer / 平台写入层 | 撤销未发粘贴、取消延迟操作、检查 requestID 与目标/focus 守卫 | 区分未写入、已发出粘贴、失败/可复制；已发出系统粘贴不能承诺撤回，不自动补发或发送回车 |
| 协调器 | 记录各资源确认，卸载订阅、清计时器，按原规则恢复 wake | 仅所有必需资源释放后可接新入口；恢复唤醒/录音另需确认，取消后不得凭旧 listening 自动打开 |

复制回退由用户显式触发，剪贴板写入结果与目标应用接受文字仍分开。writer 结果/取消确认是独立业务通道，不新增为 speaking 或用 view end 伪造成功。断连/宿主退出也要走资源释放；仅卸载 React 没有业务取消能力。

## 5. 接线缺口与解除条件（全部未验收）

- [ ] G1 身份与来源：入口贯穿 epoch/run/origin/operationId、UUID/播放 attempt 映射；旧无标签事件拒绝。先有纯契约测试，再做受限 IPC；未完成。
- [ ] G2 有序投递：单协调器与异步结果/seq 分层、meter 合并、重启/断连/计数耗尽策略；取消不被长任务阻塞；未完成。
- [ ] G3 播放语义：started/normal-ended/failed/cancelled、系统声音回退和 attempt 切换；现有 Node/Rust/Swift 差异不能直接照搬；未完成。
- [ ] G4 输入与最终识别：准备/真实录音开始/停止确认、最终 ASR 晚于 process 的状态、无增量来源诚实展示；未完成。
- [ ] G5 取消与写入：逐资源确认、不可中断 ASR 门闩、粘贴不可撤回边界、复制回退和唤醒恢复；未完成。
- [ ] G6 集成入口：T0 默认透明/焦点/物理热键等手工验收通过并记录后，进入 T1 受管 sidecar、单实例/单消费者、受限业务 IPC 和数据安全验证；两阶段未完成前不订阅真实服务。随后再做真人录音/播放/取消/输入验收。

本批验收仅为文档契约完整性和源码事实检查、原始旧事件不能直接驱动 reducer 的离线测试；不是适配器已经具备 G1～G6。没有新增原生或前端运行代码，因此不以旧构建/旧 Chromium 结果冒充本批真机验证。

## 下一步

先为 G1/G2 编写默认关闭、无服务依赖的协调器契约模型与纯合成测试，验证 epoch/UUID/attempt 关联、统一 seq 和资源释放门闩；仍不创建真实订阅或连接硬件。T0 手测另行按[既有清单](2026-11-12-tauri-t0-manual.md)推进，不用合成检查替代。当前契约准备不需要用户操作或授权。


## SC-20261114-003 离线契约模型进展

[仅测试导入的协调器模型](2026-11-14-voice-coordinator-model.md)已建立：默认关闭，原 session/资源 ticket 模拟可信归属；epoch/UUID/attempt、统一 seq、24 种取消后释放顺序和计数耗尽均有合成测试。它没有真实队列/IPC/认证或资源停止实现，G1～G6 全部继续未验收。下一步补正常完成/静音/失败后的 drain→输入恢复→新 run、断连迟到确认组合轨迹；不订阅真实服务，T0 未验收、T1 未启动。
