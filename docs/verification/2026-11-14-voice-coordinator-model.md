# 离线协调器契约模型 · SC-20261114-003

## 范围与证据口径

保持 Tauri 2 + Rust + React。T0 未验收、T1 未启动。本批创建 `test-helpers/voice-coordinator-model.mjs` 和 Node 合成测试；**仅测试导入**，不接入 preview/probe 或现有业务，不订阅服务、不启用麦克风、不播放声音、不请求权限、不安装 NSH、不替换已安装应用。模型默认关闭，测试需显式 enabled:true；无计时器、网络、文件读写、OS 调用或新增配置。

它是[接线前契约](2026-11-14-voice-adapter-contract.md)的可执行实验，不是生产适配器、IPC 身份认证或全套资源管理器。G1～G6 仍未验收。现有 reducer、视图、上游动效、原生壳与旧服务均不修改。

## 模型约定

- `reserve`：仅合成 wake/conversation 和 right-control/dictation 入口；后者校验 UUID。跨模式共用一个槽位，拒绝竞争，不排队、不抢占。保留 epoch 内已用 requestId，UUID 大小写统一；每次新预约分配递增 run。预约只表示 preparing，视图仍隐藏。
- `acquire`：在异步工作之前捕获不可变 session/资源 ticket；资源仅 capture/asr/chat/tts/player/writer，operationId 在 epoch 内不可复用，每类同时一份 lease。准备期只允许 capture/asr；听写禁止 chat/tts/player。此为粗粒度实验，不覆盖并行 TTS 分段、回退状态或生产内存有界淘汰。
- `inputReady`：须传原 session 与 capture ticket，确认输入准备好后才 begin；**所有确认均由测试调用，不是硬件证据**。session/ticket 的对象身份模拟可信本地拥有者；复制相同字段、缺失、外部模型或旧 epoch 的对象均拒绝。这不是可序列化 IPC 认证；未来跨进程需受限通道映射及生产者身份贯穿，不得把对象机制直接暴露为业务 wire format。
- `deliver`：按资源白名单接收合成结果，capture 仅 input meter、ASR 仅 transcript，player 仅播放结果/output meter；统一同步投递，接受后才递增 seq，不使用调用方 run/seq/phase。未知/非法/错来源/迟到事件不消费 seq；暂停中的异步结果到达时才分配序号，不被先到电平的较高序号覆盖。模型没有真实事件队列、meter 合并、跨线程锁或订阅器，不能声称生产调度已经完成。
- `process`：当前 capture lease 必须先确认停止并释放；旧协议在 thinking 后拒绝最终 transcript 的缺口保留，不伪造流式 ASR，也不截断原始结果用于插入。reply 由 chat 结果驱动；只有 player started 确认才 speaking。正常结束/静音/终局失败保留文字，均不自动重试或录音。
- `close(cancel/end/fail)`：先使投递失效，再立即隐藏/清空视图，不等待 pending 任务；重复 close 不多发终结事件。所有剩余 lease 保留到 `released(ticket, {stopped:true})` 明确确认；缺确认、失败或超时状态都不放行。模型不调 stop/abort/writer，也不会撤回系统粘贴；这里只验证门闩，非实现资源取消。
- `released`：只接受原 lease、严格 true；同角色新 lease 不受旧/复制/重复确认影响。只回收资源，不推进视图，也不代表文字已写入。所有 lease 清空且 run 已 close 才释放槽位；即使 player ended 也不能直接开下一轮。
- `restart`：仅完全 drained 后允许新 epoch，重建 reducer 并从 run1 开始；旧 epoch 不可复用。模型不会关真实旧订阅、回收挂死进程或证明跨进程单消费者。缺少释放确认时拒绝重启，而非通过换 epoch 绕过占用。
- 计数保持安全整数，预留最后一个 seq 给 terminal close。测试可缩小 maxCounter 复现耗尽：不回绕、不继续普通投递，close 仍可执行；run 耗尽须先 drained 再显式新 epoch。真实安全整数耗尽测试不执行数万亿次循环。

## 离线验证

`node --test test/voice-coordinator-model.test.mjs` 检查：

1. 默认关闭、非语音入口/错误模式/无效 UUID 拒绝，准备期不显示收音。
2. 原始 session/ticket、UUID/run 和 epoch 映射，字段复制/竞争/旧实例/复用 request/operation 身份拒绝。
3. 统一 seq、错误来源/无效字段不消耗序号，50 次电平先到后异步 ASR 仍可交付；晚于 process 的最终 ASR 继续被拒绝。
4. 文字就绪/TTS 不能假装开播，替换 attempt 的旧确认无效；只有当前 player started 才 playing，completed/muted/failed 保留文字但不恢复录音。
5. 4 资源 **24 种释放顺序**：取消立即隐藏、清电平文字、幂等关闭、迟到回调无效，所有确认齐备才放行；包括不可中断 ASR 的模拟 lease、transport 和 writer。
6. Promise 捕获旧 ticket 后取消并开启新 run，迟到完成不补贴新 run；播放中取消仍等 player 停止确认，旧 epoch 相同播放 ID 不影响新播放器。
7. preparing/active 的 cancel/end/fail，缺失停止确认保持受阻；有界计数耗尽和 drained restart。
8. 模型与文档边界、默认关闭和生产路径未导入检查；完整回归见操作日志。不是浏览器动效或真机录音/播放/插入验收。

## 遗留与下一步

实际来源认证、进程生命周期、受限 IPC、队列/采样合并、全部资源确认和不可中断 ASR 退出、播放器回退、最终 ASR 展示、writer/剪贴板结果仍未实现。模型只验证 G1/G2/G5 的部分契约，不能勾选整项完成。

SC-20261114-004 已补上述恢复与断连合成轨迹，见下节。下一步把断连与已有 seq/run 耗尽边界交叉验证，并明确 meter 合并不吞掉终结事件的离线调度契约；不扩大到真实订阅。真实接线继续依赖 [T0 手工验收](2026-11-12-tauri-t0-manual.md)和 T1；当前不需要用户操作或授权。


## SC-20261114-004 恢复矩阵与断连门闩

模型增加 `connected` 快照和 `disconnect(epoch)`：仅当前 epoch 可使模型断连；先阻止新预约，再 fail 关闭旧视图。重复断连幂等，旧 epoch 的迟到断连无效。即使全部 lease 已释放也保持 disconnected，只有 drained 后显式 `restart` 使用从未用过的新 epoch 才恢复预约；不会通过重连绕过缺失资源确认。

断连后 `released` 仍接收原始本地 owner ticket 的严格停止确认。它**不是从断开的传输通道接收匿名确认**，也不证明真实服务退出。模型不建立或恢复网络/IPC，不自动销毁订阅；真实 owner 若拿不到停止证据必须继续受阻，不把超时当作成功。先前模型仅有 close/restart，不能表达“drain 后仍离线”；本批增加此显式状态，其余应用/视图协议不变。

新增 `test/voice-coordinator-recovery.test.mjs`，19 项测试（含证据边界检查）：

- 正常完成、静音、播放失败和合成失败四种结果，穷举所有资源释放排列及 end 的插入位置，再跨 conversation/dictation 下一轮，共 **112 条恢复轨迹**。结果保留文字/零电平；仅 drain 不等于 end，仅 end 不等于 drain，缺任何一项均忙；新的 reservation/acquire 仍隐藏，只有新的 capture inputReady 才 begin。旧 run 的回调和释放确认不能改变新视图。
- preparing/listening/thinking/ready/synthesizing/playing/completed/muted/播放失败/合成失败 **10 个断连阶段**。即时隐藏，旧事件与输入确认无效；确认全部释放前不能 restart，释放后也不能自动恢复预约。新 epoch 从新输入确认开始，旧 epoch disconnect 不影响它。
- 空闲断连；Promise 延后本地停止确认；丢失 ASR 确认后重复 100 次 restart 仍受阻；听写 processing 断连时 ASR/writer 均须释放，不把 writer 回收当作插入成功。

首轮模型与恢复专项 33/35：两项把 reducer 的既有 `playback-failed` activity 误写为 `failed`，修正测试期望，不改 reducer；补齐合成失败断连与听写轨迹后 37/37。相关与完整回归以操作日志实际结果为准。未运行浏览器或原生构建，未做设备验收。G1～G6 仍未验收，T0 未验收、T1 未启动；当前不需要用户操作或授权。
