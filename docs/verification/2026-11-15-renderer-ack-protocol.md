# SC-20261115-012 renderer/IPC 回执协议与单消费者认证设计

## 范围与方式

按 `docs/verification/2026-11-15-dictation-consumer-boundary.md` 差距清单第 1 条（DOM/IPC 事务：真实 renderer 的 prepare→展示更新→确认回执无回执协议）与第 3 条（单消费者认证：无身份认证、无第二消费者抢占/冒充防护），本批新增离线默认关闭的协议模型 `test-helpers/dictation-renderer-ack-protocol.mjs` 与专项测试 `test/dictation-renderer-ack-protocol.test.mjs`。任务指定的 Change-ID SC-20261115-011 已被前一批守护测试占用，本批改用 SC-20261115-012。不接真实 UI、输入、剪贴板或任何服务；不修改 SC-20261115-008/009 既有模型；`enabled` 非真时所有入口返回 `{accepted:false, reason:'disabled'}`，默认关闭行为不变。文中所有"已验证"仅指离线模型测试通过，均不是生产接线验收；SC021 整批、T0、T1、G1～G6 保持未验收。

## 一、prepare→展示更新→确认回执协议（差距第 1 条）

1. **消息形状固定**：父→renderer 仅两类：`{type:'prepare', id, presentation}`（精确三键）与 `{type:'prepare-hide', id}`（精确两键）；`id` 为每任务新 UUIDv4，`presentation` 复用 009 worker 的有限展示值校验（固定字段集合、text≤8000 UTF-16 且 well-formed、status 白名单、level∈[0,1]、布尔字段严格类型、拒绝额外字段）。
2. **回执形状固定**：renderer→父回执精确三键 `{type, id, consumer}`；`type` 白名单仅 `rendered` 与 `hidden-ack`；回执无文本，展示正文只存在于 prepare，原帧仍归父进程所有。
3. **事务顺序**：renderer 必须先完成展示更新（模型中对应"display"交付），再发 `rendered`；父进程仅在验证回执后置状态 `rendered`。协议状态机为 `idle → pending → rendered|hidden`，任一回执拒绝即锁存 `failed`。
4. **一槽 in-flight**：同一时刻至多一个 pending 任务；并发 prepare 拒绝（`job-in-flight`），显式 `supersede()` 丢弃旧任务后其旧回执成为迟到回执被拒。
5. **fail-closed 回执处理**：迟到回执（id 与当前任务不符，`stray-ack`）、重复回执（对已 settled 任务重放，`duplicate-ack`）、陌生回执（无任务在途，`stray-ack`）、未知类型/多余或缺字段/坏 id/坏身份（`malformed-ack`）、类型与任务种类不匹配（`ack-kind-mismatch`）、未认证消费者（`unauthenticated-consumer`）一律拒绝并锁存 `failed`；`failed` 后任何 prepare/回执均被拒（`protocol-failed`），不重试、不重置、不自动重启。`onFail` 回调记录每次锁存原因。

## 二、单消费者身份认证（差距第 3 条）

1. **唯一身份绑定**：消费者注册时持有随机 UUIDv4 身份令牌；全生命周期只允许绑定一次，第二次注册返回 `consumer-already-bound`（含退役后再绑）。
2. **退役不可逆**：仅已绑定令牌可触发 `retireConsumer`；退役后认证清除、协议立即 fail-closed，且身份槽永久关闭（`consumer-already-bound`），不允许可信接管。
3. **回执认证**：每条回执必须携带 `consumer` 字段且等于唯一已绑定令牌；不等于（第二消费者或冒充）返回 `unauthenticated-consumer` 并锁存 `failed`，真实令牌随后也无法恢复。
4. **renderer 侧对称校验**：renderer 模型入口同样校验调用方令牌，未认证声明返回 `unauthenticated`，不回显展示值、不产生回执。
5. **令牌即身份，非机密边界**：模型内令牌是同步可信环境中的身份标识；不是加密凭据，不防御能读取进程内存的攻击者（见反例）。

## 三、不可推断事实与反例

1. **不能从 `rendered` 回执推断真实 DOM 已更新或旧内容已消失**：模型回执只证明结构/身份/id 校验通过；反例：真实 renderer 收到 prepare 后立即回 ack，实际渲染尚未完成或旧节点仍挂载。
2. **不能从回执认证推断通信保密**：令牌校验不加密 IPC 内容；反例：同宿主其他进程若能读取管道，可同时看到正文（正文跨进程最小化策略仍未定义，差距第 6 条保持）。
3. **不能从身份槽关闭推断无冒充可能**：冒充防护依赖令牌不泄露；反例：第二进程若读到令牌即可伪装回执，模型按 fail-closed 锁存，但不提供泄露检测。
4. **不能从 supersede 推断旧 prepare 未到达**：supersede 只丢弃父侧槽位；反例：旧 prepare 已在 IPC 管道中，renderer 仍可能展示旧帧（异步乱序保持差距第 1 条的跨进程一致性未验证）。
5. **不能从 `hidden-ack` 推断外部引用消失**：与 [组合帧审查](2026-11-15-dictation-consumer-boundary.md)差距第 7 条一致，hidden 通知不能撤销已被外部持有的字符串。
6. **不能从离线模型测试推断真实 renderer/IPC 事务性**：真实 DOM 时序、React 批处理、Tauri/Rust 宿主 IPC 通道（T0/T1）全部未接线、未验收。

## 验证

专项测试 `test/dictation-renderer-ack-protocol.test.mjs` 12/12 通过（默认关闭、协议面、单消费者绑定/退役、happy path、hide 路径、迟到/重复/陌生/畸形回执 fail-closed、第二消费者与冒充拒绝、renderer 侧畸形 prepare 拒绝、单槽 in-flight、onFail 原因记录）。完整回归与检查结果见 operatelog SC-20261115-012。生产接线（真实 DOM/IPC/Tauri 宿主）未实现、未验收。
