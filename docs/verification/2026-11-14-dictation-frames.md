# 听写一致采样/展示投递模型 · SC-20261114-012

## 范围

仅测试启用的 DictationFrameModel，组合既有 coordinator/final/outcome 与只读 selector，默认关闭。原模型/reducer/夹具/React/产品源不改，无真实订阅、IPC 通道或渲染器。不操作剪贴板、系统输入、录音/播放、真实服务、权限或安装应用；保留 Tauri 2 + Rust + React。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 采样与投递

- `sample()` 同步从绑定的原模型采样，不接受调用者拼装/重标 session 的历史值。无 await、定时器或异步回调；原模型是受信的同步无重入实现，当前不声称跨线程事务/有 getter 副作用的任意对象安全。
- 只持有**最新一个**待提交 record `{revision,presentation}` 与其内部签名，record/展示冻结，不含 session/lease/正文全文/复制 handle。每次 sample 都分配递增安全 revision，旧 sample 被替代，不无限保留历史。
- `commit(record)` 只接受该实例最新原 record，一次性；复制 record、外实例、重复/旧 revision 拒绝，不能把旧 revision 改大绕过原对象校验。
- commit 前再次读取原模型，检查 session 原对象、epoch/connected/closing、原 view 对象、queued meter、原 pending tickets、原 final 投影对象、outcome 状态/disposition/copy flags、dismiss marker。任何可观察变化使旧 record 失效，不按 reducer seq 相等就判新鲜（final/outcome 不改 seq）。拒绝旧 record 不会清除已经正确提交的新展示。
- `snapshot()` 同样复查签名：若已提交展示与最新可观察状态不符，返回 revision=0、hidden，必须重新 sample/commit 才能显示新状态。方法读取造成的惰性原模型清理沿用原契约；不写业务正文、不发副作用。
- hidden 也可作为正常 record 提交，具有正 revision；revision=0 表示尚无有效已提交 record 或失效，不是原 reducer seq。独立计数器不冒充原业务投递序号。

close/cancel/fail/disconnect 后，即使没有新 sample，下一次 commit/snapshot 都读取最新生命周期并清空旧展示；已返回调用方的旧对象不会自己改变。**不是主动订阅**、不是自动 DOM 卸载、不是立即安全擦除。真实 UI 仍需由可信生命周期通知主动触发更新；本批没有前端接线，因此不声称真实取消后的画面已验收。

## dismissal 生命周期

`dismiss(originalSession)` 只接受当前连接、非 closing、active 的原 dictation session，保存本轮 marker，失效 pending/已显示 record；幂等且没有 reopen 方法。后续 sample 只能 hidden，直到原 coordinator.session 改变；不能用旧 session 关闭新 run。session 改变清 marker/待提交/已显示记录，revision 不重置；新 epoch 重用 run/请求/操作 ID 仍不能借旧 token。

此方法只关闭展示，**不调用 outcome.dismiss、不删 final 正文、不 close、不释放 lease、不撤回已发粘贴**。业务执行若继续会被隐藏，生产 UX 必须另定关闭按钮究竟只是隐藏、还是连同原资源一起取消。本批不偷换这两种语义。若只调用原 outcome.dismiss（特别是 preparing→hidden/unattempted）而没有 frame.dismiss，仍可能选 final-ready；已用反例记录，未来唯一入口需要同时按明确语义处理。

## revision 边界与已知限制

maxRevision 默认 MAX_SAFE_INTEGER，测试可缩小且必须安全正整数。用尽后下次 sample 立即隐藏并拒绝旧 pending，不回绕，不在新 epoch 重置；dismiss/原 coordinator close 不依赖分配 revision。需要全新投递实例才能恢复，其 token 身份不接受旧实例 record，生产实例重建协议未实现。

此模型的 revision 仅是**采样顺序**，不是每次业务改变的 revision。对**ABA**（可观察值 A→B→A 且中间没有 frame 方法调用），如果全部签名值相同，仍可能接受旧 sample；测试固定 copy-available→copying→复制失败→copy-available 的反例。当前该反例返回同一安全展示提示、没有复制权限，但不能据此宣称逐事件新鲜度或跨 IPC anti-replay 已解决。生产应由唯一消费入口给每次状态转换分配统一 revision，或拒绝跨异步间隔保留待提交帧，不能把临时签名当完整历史证明。

默认关闭时所有方法不采样，sample=null/commit=false/dismiss=false，snapshot=hidden。selector 输出 canCopy 仍只是显示提示，不可用 frame record 请求业务复制或粘贴。pending 队列是单槽，调用方若无限持有旧 record 仍可保留历史展示字符串，本模型不能撤回。

## 验证与后续

`node --test test/dictation-frame-model.test.mjs` 覆盖默认关闭/严格开关、最新原 token/同 session 无 seq 变化、四种关闭、五个阶段 dismiss、旧 marker/新 run/新 epoch 编号复用、复制状态与 lease-stop、缩小 revision 上限、Promise 迟到提交、ABA/原 outcome.dismiss 限制、只读冻结及生产无导入。实际相关与完整回归结果见 operatelog；无新增浏览器/原生构建/真机验收。

下一步离线定义**唯一转换入口/逐转换 revision**，在所有原 owner 的成功转换后采样，明确拒绝回调缺身份、跨异步旧 revision 与 ABA；先验证，不接生产服务，不放宽旧 reducer。当前无需用户操作或授权，真实接线仍受 T0/T1 门槛。
