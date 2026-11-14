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

## SC-20261113-017：回复与播放生命周期（替代上文 SC-016 reply 规则）

SC-016 的 reply→speaking 仅为上一批合成外观规则，本批已替换；不是两个协议同时生效。新增 `activity` 表示语义，`phase` 仅选择上游原版外观，初始 closed。

| 事件 | 接受条件（均须当前 run/递增 seq） | 新 activity / 外观 |
| --- | --- | --- |
| reply(text) | conversation thinking/ready，非空白完整文本，≤8000 UTF-16 code units | ready / listening 零电平；文字到达不代表音频开始 |
| synthesis-started | ready | synthesizing / processing 零电平 |
| playback-started | ready/synthesizing；未来必须是播放器真实开始确认，不能只看 speak/play 命令 | playing / speaking；系统朗读可直接 ready→playing |
| playback-ended | playing | completed / listening 零电平，保留回复 |
| reply-muted | ready | muted / listening 零电平，保留回复 |
| playback-failed | ready/synthesizing/playing | playback-failed / listening 零电平，保留回复 |

- listening **外观不代表录音开启**。只有 activity=listening 接受 transcript/input meter，只有 playing 接受 output meter；ready/TTS/muted/failed/completed 不接受任何电平或旧 ASR。process 仅 listening/thinking 接受。
- 回复字幕组在 ready→TTS→播放→完成之间保持，状态提示在同一限高滚动卡片内。完成/静音/失败不自动开始录音，不自动重试或声称备用声音可用；未来宿主先 end 旧回合，再在输入就绪确认后发新 begin。
- TTS 开始后不再接受 reply 覆盖；音频分块/流式回复需要独立分段与播放 ID 协议，不能直接套用本模型。旧服务声音回退不变，本批视图失败不替代业务回退。
- 四种显式合成分支：正常播放、关闭朗读、播放失败、生成中取消；页面不生成或播放音频，只模拟确认。取消分支无新 begin，迟到 playback-started 被拒绝。
- Node 检查 ready/TTS 不吃电平、只有播放确认才能 speaking、结束清零保留回复、静音/失败不自动录音、各阶段取消、听写拒绝全部播放事件。
- Chromium 实际 DOM/Canvas 检查四分支 activity/phase/电平、提示、回复文字与字幕组保留，结束后新 run 才清文字、取消不恢复；Esc 清后续帧。原取消/迟到、长文、布局矩阵与离线检查继续通过。
- 非真实声卡/播放器/麦克风或 WKWebView 验收，未接服务。T0 未验收、T1 未启动。完整回归见操作日志。

### 下一步（SC-017 更新）

将“播放完整语音流程（合成）”统一到已验证的事件状态层，使主流程也覆盖文字就绪与播放确认；保留手动外观检查。真实接线继续受 T0/T1 门槛约束。


## SC-20261113-019 主流程消费者统一

主完整演练不再绕过 reducer 直接设 phase，与四分支/取消实验共用 EventRehearsal。reference-sequence 中的事件全部经过既有状态守卫，合法性及最终隐藏由单元测试逐帧验证；对话/听写所有事件必须被接受，禁止夹带 phase 字段。新回合拒绝上一回合迟到播放确认。事件 run 仅在实验实例内从 1 起，重播卸载并销毁整实例，不能作为未来跨服务全局 run 分配方案。该纯协议未变，不是生产 wire 格式；真实播放器/录音确认、TTS 后流式分段和输入插入仍未实现。


## SC-20261114-001 主流程取消矩阵

保持 Tauri 2 + Rust + React，未迁移到 NSH。本批仅补测试，不改动效、状态协议或服务行为。

- Chromium 27 组：对话收音/思考/文字就绪/TTS/播放/播放完成/新回合收音，以及听写收音/orbs 思考，共 9 个检查点 × Esc、隐藏按钮、返回手动按钮。
- 每组先核对 activity、run 与 Canvas 存在，再退出；立即检查演练/Canvas/状态提示卸载、手动控件解锁、文字与电平清空。越过全部旧期限后仍隐藏；切换另一手动模式并输入合成文字，再越过期限，模式/阶段/文字保持，旧事件不重现或覆盖。
- 使用暂停的浏览器时钟：矩阵用 fastForward 执行一次性事件期限，避免逐个执行上游动画帧；既有 runFor 全流程检查保留。首次新增矩阵使用 runFor，180 秒工具超时，未记通过；改后完整浏览器检查通过。不是动画逐帧或真实时间精度验收。
- Node reducer 对完整流程每个活动事件前缀取消，检查隐藏/清零/水位、同 run 后续事件全部拒绝、旧 begin 不重开，显式新 run 可开启且拒绝旧播放确认。
- 全部为合成事件；浏览器键盘事件不是物理全局 Esc 验收，视图卸载不证明录音/TTS/播放器/写入已经取消。未接服务、未修改原生代码、未替换安装应用；T0 未验收、T1 未启动。
- 下一步：整理接线前适配器契约和缺口，不绕过 T0/T1。当前无需用户授权或操作。
