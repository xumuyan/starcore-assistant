# 显式复制副作用前复查与执行器边界 · SC-20261114-019

## 范围

新增默认关闭、仅测试导入的 DictationCopyEffectModel，私有拥有原 source-lease；原模型/夹具/产品源码全部不改。仅覆盖原 definite not-issued 后的用户显式复制，不模拟自动粘贴/目标接受，不接真实执行器、剪贴板、系统输入、通知、音频、权限或安装。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 检查与交接

- prepareAt(now, originalSession, originalCopy) 先推进原候选/源期限，仅接受当前原 session + 当前 copying 的原 copy。生成冻结无正文的 check token；一个 copy 最多 prepare 一次，重复/复制 token 不可冒充。仅一个 check 或 executor job，不建隐式队列。检查/交接本身不分配业务 revision，不表示已写入。
- checkedAt(now, originalToken, {observedAt: now, allowed: strictBoolean}) 是可信本地复查假设：必须在本次接收的显式逻辑时刻完成观测，且原 token 只接受一次。allowed=false 清检查并确定 not-issued；若原 copy 仍有效，以 copied(false) 回到 copy-available，须新用户动作。时间/版本/原 ownership 不合法不能借旧检查再试。
- 记录原业务 revision 与两通道 source 高水位。任何已观察到的成功版本更新（即使允许值相同）或业务转换、原期限关闭使检查无效；失效后尚未交接可确定 not-issued。拒绝的旧源 envelope/伪造 stop 不影响合法检查。检查通过后 handoffAt 必须仍在相同显式逻辑 now、相同 signature 且原 copy 可读；跨时刻直接终止本次检查，不能沿用复查证明。
- handoffAt 只一次，返回冻结原 executor handle，包含完整 business text（不是 8000 UTF-16 展示前缀）。这是**把执行责任交给执行器的保守未知边界**，不是已经调用 OS 或已经写入。进入 in-flight/outcome=unknown，结果未回报/失联/取消/期限到达均不能降格成 not-written，不能自动再复制。原 job/body 一旦交出不可撤回，不能声称安全擦除。
- 外层不暴露 copyTextAt，拦截原 copied 命令，完成只收原执行器 reportAt。存在检查或原执行器尚未 stopped 时阻止另一个 requestCopy。并不声称下层原测试模型无其它读法，也不修改其历史反例。停止语音与新输入的协调器门槛保持原样，额外 executor 是独立占用，不伪造 capture/asr/writer stopped。

## 真实结果与停止分离

reportAt(now, originalJob, written|not-written|unknown) 仅第一次且先推进原期限。written 表示可信执行器实际完成剪贴板写入，**不是粘贴发出或目标接收**；not-written 必须明确确认没有写入，不能把取消、超时、异常或缺 callback 解释成它。unknown 不触发 copied(false)，原候选不允许重试。

当前原 copy/session 仍有效时，written/not-written 分别投递 copied(true/false)，snapshot.applied 只说明原业务模型接收；否则仅本地记真实结果，applied=false，不复活旧视图/候选，也不投递到新 run。结果回报不等于 worker 已退出：保留 busy，直到 stoppedAt 原 job 严格 stopped:true。stop 先于 report 则最终维持 unknown 并拒绝迟到 report，停止不是“没写入”证明。缺停止证明可以永久阻止新 copy，无超时成功。语音可 drain/重开，但未 stopped 的旧 executor 不能与新 copy 并发。

snapshot 是无正文、无 handles 的局部执行状态，非统一 UI 选择器；不会清除独立 final 投影。sample/commit/candidate 不推进逻辑时间，不提供 OS 权限或自动取消。trusted synchronous owner 范围不含恶意 getter/Proxy/重入、异常恢复、原生 IPC 身份认证、多执行器序列化实现或进程崩溃恢复。

## 证据与未解决事项

专项含 **480 条**五事件重排：check/handoff/loss/report/stop 的 120 全排列 × written/not-written × 即时/合并 meter。每前缀用独立 invalid/checked/issued/reported/stopped 布尔推导期望结果及 executor busy，保留两个原语音 lease。矩阵是轨迹数，不是 node:test 数；另覆盖八失效点×交接前/后、严格原句柄/一次性/校验时间、完整 Unicode、迟到 Promise/新 run、inclusive 源截止、拒绝旁路及生产无导入。实际运行数字见 operatelog。

**TOCTOU 仍存在**：同一逻辑 now、source 高水位、原 token 和 allowed=true 都不证明 OS 检查与执行原子；未到达锁屏/权限变化也推不出来。真实 native executor 必须在自身执行边界复查当前系统状态/权限/原 ownership；自动粘贴还必须复查原 target/focus/selection/security/trigger release（不属于显式复制适配范围）。这里没有调用实际复查、更没有系统授权 bypass。逻辑失效只能停止未交接的本地模拟，无法撤销已交接/已经发生的写入。未新增浏览器、前端/原生构建或真机证据。

下一步离线组合验证原 executor stop 与源重新同步、语音资源 drain/epoch 重建及下一次显式复制，避免局部结果记录误当全局资源恢复；仍不接生产。无需用户操作或授权。
