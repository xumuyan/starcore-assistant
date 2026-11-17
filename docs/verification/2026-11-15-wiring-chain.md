# SC-20261115-021 接线准备链路组合离线测试

## 范围与方式

按 SC-20261115-010 差距清单，新增 `test/dictation-wiring-chain.test.mjs`：把既有**默认关闭**组件组合为一条完整离线接线准备链路——presentation-controller/worker（主控+测试内 FakeChild 子进程）→ renderer-ack-protocol 回执 → executor-recheck 边界复查 → timing-fork-constraint 期限门控。口径对齐 [SC-20261115-019 记录](2026-11-15-wiring-recheck-timing-models.md) 与 SC-20261115-020 单实例模型；复用现有模型**不改其行为**，不接真实 UI、剪贴板、服务、OS 查询或真实 timer；四个组件各自的默认关闭行为不变，组合关闭时整链不能启动。

## 一、已验证边界（离线组合，默认关闭组件）

1. **跨组件一致性**：整链共享单一逻辑时钟 `h.now`；每个业务入口先过期限门控（`observeAt` live）。ack 协议的 job id 即控制器 prepare 的 UUID（不是 executor 句柄或 session id）；协议 display 与控制器快照 presentation 一致；executor 边界复查证据 `observedAt` 与门控同刻。
2. **任一环失效整链 fail-closed**：
   - 期限环：run/source TTL 到期，门控关闭，executor `dispatchAt` 被拒、`prepareAt` 拒绝。
   - 执行环：边界复查拒绝定 not-written（终态），后续 written 报告被拒、同任务 stop 后本回合不再发新复制。
   - 不确定环：mid-flight `expireAt` 锁 unknown，written 不可升级，仅 unknown 报告可接受。
   - 回执环：supersede 后旧回执为 late，`receiveAck` 拒绝并锁死协议（failed），后续 `sendPrepare` 以 `protocol-failed` 拒绝。
3. **旧帧/旧回执不穿越新一代**：suspend→resume 不复活 run（须显式 `rebuildAt`）；新一代 token 与旧代不同；旧 epoch envelope 不能同步新代控制器；新鲜控制器只接受自己 epoch 的快照。

## 二、生产差距（未实现、未验收）

1. 真实 IPC 通道与回执传输未接线；FakeChild 证明的是控制器协议逻辑，不是真实子进程通信验收（真实 fork 生命周期已由 SC-20261115-009 独立覆盖）。
2. 链路组装器（测试内 harness 的 gate/deliverAck 逻辑）不是生产代码；生产调度、错误传播与重启策略未设计。
3. 真实期限源（时钟、锁屏监听）与真实执行器边界复查未实现。

## 三、不可推断事实与反例

1. **不能从组合测试通过推断生产链路成立**：四个模型各自默认关闭且互不知晓；组合逻辑只存在于测试内。
2. **不能从 ack id 一致推断回执认证安全**：协议内的单消费者 token 是测试内注册的本地假设。
3. **不能从门控拒绝推断业务组件自身有同样守卫**：executor 模型独立有自己的 TTL；门控是测试内叠加的链路规则。
4. **不能从 4 项专项通过推断 T1 接线验收完成**：SC021 整批、T0、T1、G1～G6 仍未验收。

## 验证

专项 `node --test test/dictation-wiring-chain.test.mjs`：**4/4 通过**（0 fail）。开发过程 4 次失败均为测试自身问题、模型零改动：① 过期后误经 gate 断言路径调用业务；② 误断言 `rebuildAt` 返回 null（实际 `{accepted:true}`）；③ `expireAt` 用于已 refused job 被正确拒绝（uncertainty 用例拆独立链路）；④ 合成非 UUID id 被 `validJobId` 正确拒绝（改用 `newIdentity`）。完整回归与 git 检查见 operatelog SC-20261115-021。本批仅离线组合测试与文档，不含真机或生产验收。
