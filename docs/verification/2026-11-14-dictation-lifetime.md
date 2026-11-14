# 听写候选有界寿命与显式失效提案 · SC-20261114-015

## 范围

新增默认关闭、仅测试导入的 `DictationLifetimeModel`，私有创建原 `DictationTransitionModel`；原转换入口/内部三个模型/selector/frame/reducer/夹具/产品代码不改。使用显式逻辑时钟与事件，不注入 clock callback、外部可变源或系统订阅，不操作剪贴板、系统输入、服务、录音/播放、配置、权限和安装应用。不是自动定时器，也不是生产锁屏监听或用户设置实现；T0 未验收、T1 未启动，G1～G6 仍未验收。

## 本地策略

- 仅接 right-control/dictation 预留；对话不属于此策略范围，不指示现有对话隐藏。模型严格 `enabled === true` 才开放。`candidateTtl` 是安全正整数逻辑时间单位，实验默认 30000，不是已决定的产品秒数或配置设置。
- `advance(now)` 显式推进安全非负整数逻辑时钟：初始 0，允许相等，拒绝倒退/小数/NaN/Infinity/不安全整数，不读取 Date/performance，不建 timer。逻辑时间跨 run/epoch 不重置。未调用 advance 就无法发现真实时间流逝；无即时 DOM/截止期限保证。调用顺序即模型的全序；同一时刻先 copy 完成再 advance 与先 advance 再回调可有不同结果，生产需确定接收/期限规则而不能直接搬用此接口。
- 原 `result(..., 'not-issued')` **成功后**设置一次绝对 deadline = now + ttl。未知/issued/拒绝结果不建候选期限。候选读取、sample/commit、requestCopy、copyText 和 copied(false) 的新显式重试均不续命。候选在 copying 中仍受原 deadline，等于 deadline 即过期。
- copied(true)/dismiss/close/disconnect/session 变化撤销 deadline；presentation-only hide 不撤销候选期限，不冒充业务关闭。复制完成不是粘贴/目标接受；issued/unknown 原语义不变。此提案只限制 not-issued 候选，不给 preparing/ASR 推断加超时，也不覆盖其他阶段的超时策略。
- 到期调用原 close(cancel)，隐藏且使原业务句柄在内部原模型的后续读取/回调中失效，原 ASR/writer/capture lease **不自动 released**。deadline 加法超出安全整数范围时同样关闭，reason=clock-exhausted，不四舍五入、不无期限延长。原结果已经接受可返回 true，紧接策略关闭；一次外层 dispatch 可能对应原 result + close 两次 revision，外层不是一操作一版承诺。
- 事件 `event(type, epoch, session?)`：lock/disable 是当前 epoch 的全局合成事件，分别设持久 locked/settingsEnabled 门闩并关闭当前 run；unlock/enable 只复位相应门闩，不重开原 run/候选、不代表重连。两门闩必须独立复位，且旧资源 drain 完毕才能新 reserve。事件适用于 listening/preparing/candidate/copying/copied 等任意当前听写阶段，并非只清候选。门闩期间只允许 close/disconnect/released/hide/dismiss 清理命令，不允许 restart 绕过门闩；没有当前 session 也能锁定/禁用未来工作。
- entry-replaced 必须给当前原 session 和 epoch，仅关闭/失效该 run，不持久阻止未来入口；未清完原资源就拒绝新 reserve，不隐式预留或抢占。旧/复制 session、错误 epoch、未知事件拒绝且不改变合法待提交帧。global lock/disable 不需要 session，因为它们表达当前 epoch 全局状态；原对象/epoch 校验只是本地信任模型，不是系统/IPC 认证与事件顺序/防重放证明。
- 无新外层 revision：时钟推进/门闩复位不改内部展示版本，触发 close 才由原入口失效帧；不可把原 revision 当外层时钟/设置快照版本。原 revision 耗尽仍可 close/released，解锁不能清零/重建版本。原 sources 不暴露；snapshot 冻结但已返回对象/正文不可撤回。

## 验证与限制

专项覆盖默认/非法参数、截止前/等于截止、绝对期限不续命、copying 过期/迟到 Promise、ASR/writer 已停止仍需 close、三 disposition、copied/dismiss/close/disconnect、hide、三失效事件×五阶段共 15 点、两门闩组合/恢复、新 epoch 旧 ID/事件/句柄、时钟倒退/安全边界/版本耗尽与 drain。生产路径扫描确认无导入，相关与全量结果见 operatelog。

关闭只让原协调器失效 run，原 projection/outcome 局部缓存仍依赖方法重查（lazy cleanup）；不是安全内存清零，不撤回已返回的长业务正文、已发粘贴或已发生剪贴板副作用。expiration 中的复制若 OS 写入已发生但回调后来被拒绝，不能由此推断“没复制”；生产必须保留诚实 unknown/issued 记录及取消/完成协议。测试的 written/stopped/userInitiated/lock 都是合成输入，不是硬件证明、授权或目标接受。没有自动停止 worker、主动 DOM 更新、恶意 getter/Proxy 重入或异常恢复保证。

原产品 endSession 后的复制回退行为不改；本提案过期/锁屏会 close 当前 run、禁止跨 run 候选，不能直接替换旧产品。需要跨结束回退时仍需独立有界结果槽及数据/焦点/权限设计。

本批不执行新浏览器、前端/原生构建或真机验收。下一步离线交叉验证期限/全局事件/复制回调同一逻辑时刻的排列与 stale-event 接收契约，特别是 unlock/enable 的延迟/重复事件不能冒充新事实；当前同步模型不证明生产全局事件新鲜度。无需用户操作，真实接线仍受 T0/T1 门槛。


## SC-20261114-016 事件接收后续

[源版本与截止优先提案](2026-11-14-dictation-event-order.md)保留本模型的迟到 unlock 反例，另建默认关闭测试模型拒绝已观察高水位以前的事件；不声称能发现未到达锁屏。原 lifetime 不修改。下一步事件源断连/重新同步握手。
