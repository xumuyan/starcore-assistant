# 通知源逻辑活性期限 · SC-20261114-018

## 范围

新增默认关闭、仅测试导入的 DictationSourceLeaseModel，私有持有原 source-sync 模型；原 source-sync/event-order/lifetime/transitions/内部模型/selector/frame/reducer/夹具/产品源码不修改。无系统通知、网络、自动 timer/心跳、剪贴板/输入、音频、权限、配置或安装变更。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 逻辑期限契约

- sourceTtl 正安全整数，默认 10000 **逻辑单位**，不是已决定的产品毫秒/配置。显式逻辑 now 与原模型共享；无 Date/performance/调度器。beginAt 为两通道各建立 now+ttl 查询期限，防止 syncing 缺一路无限等待。
- lock/settings 期限互相独立，任一到期即 lostAt 原 token，撤销全部 query/fresh/期限并关闭当前 run，reason=source-expired；deadline 包含等号。先检查候选原截止，再检查源期限，然后才执行有效入口业务，不能用到期同刻的 snapshot/复制回调抢在 tick 之前复活。资源仍需原 stopped，失效不是 ASR/clipboard 的真实停止或副作用撤销。
- receiveAt 新增可信 observation 时间 observedAt。只接受当前原 token、当前 epoch、严格递增的通道版本、合法 kind/value。snapshot 的 observedAt 须为安全整数、不早于本次 begin、不晚于接收 now、同通道不倒退；在同步前提中它表示真实查询完成的观测时刻，不是到达时补号/缓存刷新。期限由 observedAt+ttl 计算，不由 arrival now 计算，相同观测时间的新版本可接受但不增加寿命。未来/缺失/负数/倒退时间或旧 token/envelope 拒绝，不推进 clock/版本。query token 与 observedAt 是可信本地假设，不是源认证或真实系统状态证明。
- 只有原模型成功接收的完整 snapshot 更新该通道观测/期限；update 可以限制/改变原状态，但不能续命，心跳、版本增长、普通读取、meter/业务推进、copy request/失败重试/完成均不续命。一通道连续更新不证明另一通道活跃。允许同值 snapshot 的可信新观测续期，不允许以消费活动代替源证据。
- beginAt 时安全加法溢出拒绝并维持 offline；活跃 query 的新 snapshot 加法溢出立即失联关闭，reason=clock-exhausted，不四舍五入/无界期限。新 token 不清 source 高水位/逻辑时钟/业务耗尽；voice restart 原模型转 offline 时同步撤销外层期限，须重新 begin + 两路新快照。
- advance/dispatchAt/copyTextAt 以及合法 receive/lost/begin 检查期限。sample/commit/candidate/snapshot 仍为无时钟读取，不能声称等待真实时间后会主动隐藏。无效源 envelope 在推进前拒绝；合法业务入口即使业务拒绝仍可推进时间并过期，故不是“任何拒绝均不改变状态”。lostAt 若其 now 已过期可返回 false（原 token 已撤销）但已执行期限关闭。

## 验证与限制

专项覆盖原 source-sync 反例（advance 很久仍 ready）、默认关闭/选项校验、inclusive 截止/在途复制/旧帧、初始半握手、通道独立、update 不续期、延迟观测不借到达时间、无效观测/旧句柄、资源释放/新轮 readiness、候选与源不同 TTL、溢出、业务版本耗尽、重启/Promise 迟到/生产无导入。**96 条**轨迹：lock snapshot/settings snapshot/tick/copied 的 24 全排列 × written 真/假 × 99/100 时刻；逐前缀独立推导到期 closing/phase 与原 pending 保留。矩阵不是 96 项 node:test，实际结果见 operatelog。

**没有自动活性检测**：仅在显式传入逻辑时间的入口识别静默超期，事件循环长阻塞/无入口不触发；它也不是可信原生的副作用前复查。期限内也可能已锁屏但通知没到，TOCTOU（检查与执行之间状态变化）仍存在。业务/UI frame/canCopy/字符串都不是 OS 写入许可；真实实现需在执行边界校验原 session/target/权限/当前状态，正确区分 issued/unknown/未发出，不能用有期限的缓存代替真实授权，也不能把 completion 拒绝当没发生复制。

snapshot 标签/观测时间来自可信测试调用者，不验证 OS 查询、IPC 身份/时间域、原子线性化、系统 suspend/resume、恶意 getter/Proxy/重入/异常恢复、实际 worker cancellation/stop 或 DOM 自动投递。已返回正文不可撤回，原局部清理不等于安全擦除；旧产品跨结束复制回退不改。未新增浏览器/前端/原生构建/硬件验收。

下一步离线用一次性副作用前复查的所有权/结果模型区分“通过检查”与“发出操作”，明确检查后失联/过期/取消时的 unknown/未发出边界；不接真实剪贴板或系统输入。当前无需用户操作或授权，生产接线仍受 T0/T1 门槛。


## 后续 SC-20261114-019

[显式复制复查/执行器边界](2026-11-14-dictation-copy-effect.md)另建默认关闭测试模型，原 source-lease 不改。handoff 起结果未知，未交接失效才可本地确定 not-issued；执行结果/实际停止分开，不冒充系统复查或 TOCTOU 已解决。
