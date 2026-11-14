# 听写唯一转换入口与逐接受操作版本 · SC-20261114-013

## 范围与所有权

新增默认关闭、仅测试使用的 DictationTransitionModel。内部自行创建原 coordinator/final/outcome，私有字段且不接收外部模型，不暴露可变源；返回的 session/ticket/view/snapshot 原对象均冻结。唯一入口 `dispatch` 是同步白名单命令，不接收函数、任意方法名或异步任务；原三个模型/selector/旧 frame 模型/reducer/夹具/产品源均不改。旧 SC-012 ABA 反例保留，它的采样版本仍不能当转换版本。

不操作剪贴板、不注入系统输入、不录音/播放、不接真实服务/IPC/React，不安装或改权限；保持 Tauri 2 + Rust + React。T0 未验收、T1 未启动，G1～G6 仍未验收。本批不是生产唯一消费者或 IPC 身份认证，也无新增浏览器/原生构建/真机验收。

## 统一版本与展示

- 白名单：reserve/acquire/inputReady/deliver/flushMeter/process/released/close/disconnect/restart，final，begin/result/requestCopy/copied/dismiss，以及只隐藏展示的 hide。各原 owner、阶段、角色、原 attempt/receipt/candidate/copy 和严格布尔校验仍交给原模型，拒绝无身份/复制身份/非法结果。
- 每个**成功接受的操作**完成后，同步失效待提交 record 和已展示内容，revision +1。不依赖 reducer seq、最终文本/状态是否与操作前相同。幂等 close/disconnect/hide 等成功也保守递增，不声称只给实际值变化计数；拒绝/null/false 操作不分配版本，不破坏已有有效帧。
- `sample()` 不分配版本，直接从独占源同步选展示，返回冻结 `{revision,presentation}`，只保留最新一个原 record；相同版本重复 sample 仍只接受最新原 record。`commit` 校验原 record/当前 revision，一次性；原对象身份是本地模型假设，不是 IPC anti-replay。
- 模型不持有跨异步工作，不发 timer/通知。成功转换在本模型内立即使 shown=hidden；必须重新 sample/commit 才显示新状态，真实 DOM 不会自动卸载，调用者保留的旧对象仍不能撤回。
- 输出可通过 snapshot 检查 coordinator 资源门闩，但没有底层模型实例或可调用源。candidate/copyText 只读方法保留原显式复制契约，不给 frame 复制权限。copyText 返回完整业务候选而非展示正文，没有剪贴板副作用，不是防泄密接口。

## ABA 与 dismissal

copy-available→requestCopy→copying→copied(false)→copy-available 即使中途从未 sample，两次成功操作各递增版本；最终可见值完全相同，旧 record 仍拒绝。手工合并 meter 覆盖已有队列、seq/queue length 不变时也推进版本。测试以此对照旧 frame 模型的限制，不修改历史测试粉饰已解决范围。

hide(originalSession) 只隐藏当前原 dictation run 的展示，不取消业务；dismiss 则调用原 outcome.dismiss，成功时同时保留本轮展示 marker，解决 preparing→hidden/unattempted 无法仅从公开快照识别的问题。关闭/断连会失效展示，未 stop 的原 lease 继续阻止下一轮。新 session 自动清 marker、版本跨 epoch 不重置，旧回调不得补贴新 session；但隐藏并不等于取消，生产按钮语义和真正资源停止仍待接线验收。

## 耗尽与信任限制

maxRevision 为安全正整数，可缩小测试。最后一次普通操作可执行并到达上限，同时隐藏/作废所有展示；到达上限后 sample=null、commit=false，普通业务与 copyText 禁止。原 close/disconnect/released/hide 清理入口仍可调用，不递增/回绕、不自动成功、不自动释放；已知原 stop 仍须明确提交。restart 不能重置版本绕过限制，需要全新模型及旧资源先 drain 的生产重建协议，尚未实现。

本模型仅对内部同步、可信原实现的所有调用统一计数；未开放外部引用，是当前实验能讨论 ABA 的前提。没有补生产网络、线程、原生 owner、用户动作认证、统一 IPC seq 或并发锁。传入带恶意 getter/Proxy/函数重入的任意对象不在合成输入保证内，未来生产必须先从受限数据协议验证/复制原始字段，不能把 JS API 当不可信 IPC 入口。异常不转成业务成功，模型没有通用异常恢复/传输重连实现；已发粘贴与已返回字符串不可撤回。

## 验证与下一步

`node --test test/dictation-transition-model.test.mjs`：每类原操作接受/拒绝、ABA、无 seq 变化的队列覆盖、四关闭、dismiss/hide、跨 run/epoch、计数耗尽及可清理性、Promise 迟到、原/复制/外模型 records、只读输出/无生产导入。相关与全量实际结果见 operatelog。

下一步离线组合**转换入口与完整听写轨迹**，逐前缀检查展示、所有 owner 的接受/拒绝与 drain，特别是终止/复制/耗尽交叉排列；不新增生产通道。真实 UI/服务接线仍受 T0/T1 门槛，当前无需用户操作或授权。


## SC-20261114-014 完整轨迹交叉验证

[转换入口生命周期矩阵](2026-11-14-dictation-transition-lifecycle.md)新增 144+720+192 条轨迹，逐前缀验证原 owner/版本/唯一展示/资源 drain/耗尽清理，原模型不修改。仍非真实 UI/IPC/系统操作验收；下一步离线候选有界寿命与主动失效契约。
