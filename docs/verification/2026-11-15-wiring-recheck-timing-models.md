# SC-20261115-019 执行器边界 TOCTOU 复查与 timer/锁屏/fork 时机约束离线模型

## 范围与方式

按 [消费者边界审查](2026-11-15-dictation-consumer-boundary.md) 差距清单第 2 条（真实输入/clipboard 与 TOCTOU 复查）与第 4/5 条（真实 timer/源监听与真实 fork），以及 SC-20261115-013 两份接线准备评估（[输入/clipboard TOCTOU](2026-11-15-wiring-input-clipboard-readiness.md)、[timer/锁屏/fork 策略](2026-11-15-wiring-timer-fork-readiness.md)）的差距清单，本批新增两个**默认关闭**的离线接线准备模型与专项测试：

- `test-helpers/dictation-executor-recheck-model.mjs` + `test/dictation-executor-recheck-model.test.mjs`：在显式复制复查/执行器边界（[复制复查/执行器边界提案](2026-11-14-dictation-copy-effect.md)，只读组合）之上增加执行器侧 TOCTOU 边界复查与一槽执行器等待（等待不排队）。
- `test-helpers/dictation-timing-fork-constraint-model.mjs` + `test/dictation-timing-fork-constraint-model.test.mjs`：timer/锁屏/休眠唤醒与 fork 时机的约束模型：单调逻辑时钟守卫、期限先于工作的入口检查、显式挂起/恢复不自动复活、fork 准入门控与 term→grace→kill→显式 close 的逻辑升级序列。

不接真实 UI、输入设备、剪贴板、系统监听、权限或生产 fork；不注册任何真实 timer；不改任何生产源码与默认关闭行为。权限一律走 macOS 用户正常授权流程，不自动授予。文中“已验证”仅指离线模型测试通过；SC021 整批、T0、T1、G1～G6 保持未验收。

## 一、已验证边界（离线模型，默认关闭）

1. **执行器边界 TOCTOU 复查**：handoff 冻结 handle 后，执行器必须在自身执行边界用与执行同一逻辑时刻的显式证据（`observedAt === now`、布尔 `allowed`）做一次复查；复查前 outcome 停留 unknown。复查拒绝时**未发出任何写入**，因此可以确定为 not-written（与 mid-flight 失败的 unknown 严格区分）；每 job 恰好一次复查，第二次复查被拒。
2. **一槽等待不排队**：执行器槽被占用时第二个 handoff 被拒并记为一次 wait（`waitsRecorded`），不排队、不自动重试；等待标记不消耗原 job，原 job 仍可在边界补做复查。
3. **不确定不可升级**：mid-flight 过期/丢失锁存 uncertain/unknown 后，`written` 报告被拒，只有 `unknown` 报告可被接受；报告一次性、句柄绑定、白名单校验；仅 stop 不产生 written 证据。
4. **单调时钟守卫**：任何入口的 now 回退立即 fail-closed 永久锁存（`clock-rewound`）；锁存期间所有入口被拒且高水位冻结；唯一出路是显式 `rebuildAt`（严格更大 now 的新一代，旧 run/fork 不自动复活）。
5. **期限先于工作**：run 的 TTL 期限（`observedAt`+ttl 逻辑单位）在每次显式入口先于任何工作检查；到期只在入口可见，无后台自动 timer。
6. **挂起/恢复不自动复活**：显式 lock/sleep 事件立即失效当前 run 并锁存；恢复后 run 保持 resumed-dead，须显式 rebuild 才能开始新 run。
7. **fork 时序约束**：fork 默认关闭（`enabled` 非真不 fork）；单槽 in-flight、不排队；live run 期间拒绝 fork；watchdog 只在显式入口到期触发；升级序列强制 term → 严格大于 grace 窗口后 kill → kill 之后才接受 close 事件（close-before-kill 拒绝、每 fork 一次 close）；failed 终态不可再驱动。
8. **配置边界校验**：`sourceTtl ≥ 1`、`watchdogMs ∈ [1, 30000]`、`forkGraceMs ≥ 1` 在构造时校验，越界抛 TypeError；5000ms 默认值仍是逻辑默认，不是已标定的生产值。

## 二、生产差距（未实现、未验收）

1. 真实剪贴板写入与输入注入（`NSPasteboard`/`pbcopy`、CGEvent 或宿主等价物）未接线；模型的复查证据是可信本地假设，不是 OS 权限或锁屏证据。
2. 执行器边界的真实 TOCTOU 二次复查（锁屏/权限/目标焦点在同一执行边界）无生产代码路径；TOCTOU 窗口只能缩小、不能声明消除。
3. 真实单调时钟、锁屏/设置/休眠唤醒监听、真实 fork 时机与环境（runtimeEngine bundle 路径）未接线；watchdog 生产值未在真实负载下标定。
4. 权限检测与未授权 fail-closed 未实现；授权须由用户通过 macOS 正常授权流程完成，模型不替代验收。

## 三、不可推断事实与反例

1. **不能从边界复查通过推断写入成功**：反例——复查同刻允许，执行器启动即崩溃，outcome 停留 unknown 直到真实报告。
2. **不能从复查拒绝推断剪贴板已被污染**：拒绝只证明本执行器未发出写入，不证明目标状态。
3. **不能从等待记录推断请求被排队**：被拒 handoff 不会自动重试；用户必须显式再次发起。
4. **不能从 rebuild 通过推断旧状态已恢复**：rebuild 只开新一代，旧 run/fork 全部保持死亡。
5. **不能从恢复事件推断休眠期间无变化**：恢复后 run 已死，真实执行仍须新的边界复查。
6. **不能从 term/kill 逻辑序列推断进程已退出**：close 只在实际 close 事件入口被记录；SIGKILL 后仍有不可消除的 OS 回收窗口。
7. **不能从离线 15 项专项通过推断真实 timer/监听/fork 验收**：全部为逻辑轨迹，SC021 整批、T0、T1、G1～G6 仍未验收。

## 验证

专项测试 `node --test test/dictation-executor-recheck-model.test.mjs test/dictation-timing-fork-constraint-model.test.mjs`：15/15 通过（0 fail）。开发过程中实际出现并修复三类失败：执行器模型 waiting 阶段拒绝边界复查（改为 waiting 仅是标记、原 job 仍可复查）、timing 模型 `rebuildAt`/`resumeAt` 被自身锁存拦死（增设锁存唯一出口并冻结高水位）、一处测试自身在 kill 后用更小 now 调 close 构成时间回退（按单调守卫改为 61）。含源码离线性断言（无 NSPasteboard/CGEvent/child_process/timer/Date.now 等）。完整回归与 git 检查结果见 operatelog SC-20261115-019。本批仅离线验证，不含真机或生产验收。
