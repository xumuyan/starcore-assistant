# 全局事件接收版本与截止优先 · SC-20261114-016

## 范围与前提

新增默认关闭、仅测试导入的 DictationEventOrderModel，私有拥有原 lifetime 模型；原 lifetime/transitions/三个内部模型/selector/frame/reducer/夹具/产品代码完全不改。无 OS 监听、生产 timer、网络/IPC、剪贴板/输入、声音、权限、配置或安装变更。T0 未验收、T1 未启动，G1～G6 仍未验收。

测试保留原 lifetime 反例：同 epoch 先 unlock 后 lock，再迟到旧 unlock，原模型只按调用顺序处理，drain 后可重新 reserve。新模型只在明确的可信、独占、同步本地事件源前提下提出接收规则，**不是生成序号分配器**、身份认证、生产唯一消费者或系统状态查询。

## 接收规则

- 初始系统状态未知：内部先 lock + disable，须分别收到允许工作的 lock/settings 两通道状态快照才可 reserve，不把没收到事件当已解锁/启用。
- receiveAt(now,{epoch,channel,version,value})，channel 为 lock/settings，value 严格 boolean；lock true 表示锁定，settings true 表示启用。源须**在事实生成时**为各通道分配安全正整数 version；不能在到达时补号后声称历史新鲜。每通道高水位独立，拒绝 <= 已接受版本的旧值、重复和同版本矛盾值，拒绝未知通道/错 epoch/非法字段。允许版本跳跃，表示完整最新状态快照，不是增量事件重放。原句柄身份与 epoch 仍仅是本地信任假设。
- 版本跨 run/协调器 epoch 不重置，因为它属于独占事件源而不是 voice run。安全整数达到最大时，接受该版本但强制该通道禁止工作（即使 payload 允许），高水位饱和、不回绕。重建全新源/模型及 drain/快照握手协议未实现，不能用 restart 逃逸。门闩下原 close/released 清理不受影响。
- 有效 receiveAt、dispatchAt、copyTextAt 和原 session 作用域合法的 replaceAt 在操作前先推进逻辑时钟，>= deadline 先过期关闭，再尝试回调/事件。因此到期时 copied 无论排在 tick 前后均拒绝，不依赖先手动 tick；99 时完成仍允许，100 时完成拒绝，不把被拒绝的回调当 OS 未写入证明。
- 无效/重复 envelope、错误 epoch 或旧/复制 session 在推进时钟前拒绝，不消费版本或使待提交展示失效。对合法时间的 dispatchAt，即使未知命令/业务 owner 拒绝，也已经推进时间，可能因真实逻辑截止关闭；不可再套用“所有拒绝均不改变状态”的下层契约。时钟倒退则不接收操作、不消费版本。推进是显式传参，不读取 Date/performance，不是自动 timer。
- 不暴露原 event/dispatch 免时钟路径；advance 可独立 tick，sample/commit/snapshot/candidate 仍不推进时间，copyTextAt 先检查截止。没有新外层 revision：新鲜的 permissive 状态快照可只改变 source version、保持展示 revision 与待提交 frame。旧 snapshot 不撤回，也不可用展示 revision 代替事件/设置版本。

## 验证与限制

新增 21 项 node:test（矩阵计数以实际执行为准）：其中 **96 条**复制回调/tick/lock/disable 全排列（24×written真假×逻辑时刻99/100），逐前缀用独立 closed/copied 变量推导回调接受及资源门闩；原 lease 均保留，解锁/启用仍须分别复位且 drain，下一轮确认独立 inputReady。另有两通道各 24 条四版本状态快照乱序轨迹（共 48 条），独立最大已观察版本推导门闩值，验证已关闭 run 不因后续允许值而复活。其他检查含原反例、新初始化双快照、双通道重复/矛盾/错源、最大版本四组合、epoch 复用、entry replacement、四截止入口、Promise 迟到与生产无导入。相关/全量实际结果见 operatelog。

**不能推断未到达的事实**：接收 version2 unlock 时无法知道 version3 lock 已生成但未到达；测试明确允许这段窗口，并在 version3 到达时关闭。高水位也不能证明生产事件源真实性、生成顺序、传输丢失/断连、当前系统状态；必须有真实 authoritative 状态握手、通知断连 fail closed 和副作用前复查，未实现。不同通道没有可比较的总生成顺序；逻辑 now 是接收时间，不得用旧 payload 时间倒退时钟。延迟 copied/stop 等仍靠原对象与严格结果验证，不把 source version 泛化为业务授权。

只有观察入口才发现时间流逝，无主动 DOM 更新或资源停止，也无恶意 getter/Proxy/重入/异常恢复保证。全局事件认证、真实 clipboard unknown/issued、取消/stop、已返回正文不可撤回等原边界全部保留。模拟不替代硬件验收，未新增浏览器/前端/原生构建/真机测试。

下一步离线定义事件源断连/重新同步的 fail-closed 握手，防止“最后值是允许、通知源却已失联”继续工作；需与资源 drain 和 fresh snapshot 分开验证，不接实际系统。当前无需用户操作或授权，生产接线仍受 T0/T1 门槛。


## 后续 SC-20261114-017

[通知源失联/重新同步握手](2026-11-14-dictation-source-sync.md)另建默认关闭测试模型，原 event-order 不改；显式失联撤销原 query，源新快照与原 lease drain 独立，仍不检测静默失联。下一步逻辑活性期限/副作用前复查。
