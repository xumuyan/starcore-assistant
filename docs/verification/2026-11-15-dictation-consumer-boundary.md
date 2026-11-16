# SC-20261115-010 组合帧主动消费者投递边界与生产差距审查

## 审查范围与方式

按 PLAN SC-20261115-009 指定的下一步，本批只做离线审查文档：对 SC-20261115-008（`docs/verification/2026-11-15-dictation-copy-frames.md`，`test-helpers/dictation-copy-frame-model.mjs` + `test/dictation-copy-frame-model.test.mjs`）与 SC-20261115-009（`docs/verification/2026-11-15-dictation-parent-child.md`，`test-helpers/dictation-presentation-controller.mjs` + `test/dictation-presentation-controller.test.mjs`）的已验证结论做只读引用与逐条整理，不新增模型代码、不接真实 UI/输入/剪贴板、不修改默认关闭行为。文中所有“已验证”仅指离线模型测试通过，均不是生产接线验收。

## 一、主动消费者投递/失效的已验证边界（复用 008/009 证据）

1. **原 owner 私有化**：组合帧模型（008）私有持有原业务模型，只暴露显式入口；controller（009）私有持有原 frame model，业务 revision/check/job 与最终 commit 只存在于主进程。外部无法绕过入口写状态（008 专项含拒绝/抛错入口覆盖）。
2. **写入口同步失效**：008 的十个状态入口（含被拒绝与抛错的调用）在进入业务前使 pending/shown 失效；不使用字段相等判新鲜，同刻同值/ABA 场景仍失效（已用合法 meter 往返验证 ABA）。
3. **主动 hidden 先行**：009 controller 的每个状态入口先同步向本地 consumer 发 hidden，再进入业务；finally 采样当前帧提交，业务原异常不替换采样。consumer 先于可能抛错的业务调用收到 hidden。
4. **一次 commit 的最新帧**：仅最新原帧一次 commit；组合采样（007）读取会替换 pending frame，故 009 只在 controller 内 finally 提交，consumer 不直接采样。
5. **一槽 in-flight + 一槽最新 queued**：consumer 交付须子进程 ACK 且主进程原 frame commit 成功；写入口清 in-flight 引用但保留 id 到 ACK 或故障；queued 只留最新，历史不排队；迟到 ACK 只释放旧槽不可恢复旧展示。
6. **consumer 失败 fail-closed**：consumer 抛错或重入写入口锁存 deliveryFailed、清空展示、结束自己创建的子进程，后续不再调用失败 consumer；不自动重试/重启。
7. **子进程边界（有限展示值）**：IPC 只发 `{type:'prepare',id,presentation}`，展示字段集合固定、text≤8000 UTF-16、status 白名单、level 有限、拒绝额外字段；id 每任务新 UUID，主进程严格核对 ACK 类型/字段/id，陌生/重复 ACK、协议错误、发送失败、error/disconnect/close 均 fail-closed。
8. **watchdog 与关闭**：ready 与每个处理中任务 5000ms 默认 watchdog（1～30000ms 可配，测试用短期限而非放宽回归）；close 立即 hidden，SIGTERM→1000ms 后 SIGKILL，仅对自建子进程；close Promise 只在实际 close 事件后完成。
9. **默认关闭**：`enabled` 非真时不 fork、不通知 consumer；watchdog 配置越界在构造时拒绝。
10. **失效不等于资源停止**：hidden/展示失效与原 report/stop/drain 分离；展示 worker 的 close 不制造复制执行器 stop 证明。

## 二、与生产接线的差距清单

以下每条均为**未实现、未验收**，不能由 008/009 离线结论推断：

1. **DOM/IPC 事务**：008/009 只保证可信同步本地调用的一致性，不是 DOM 更新与 IPC 发送组成的原子事务；真实 renderer 的 prepare→DOM 卸载/更新→确认回执无回执协议与事务性。
2. **真实输入与 clipboard**：无任何真实输入设备写入或剪贴板调用；`checkedAt/handoffAt` 是测试模型，真实复制执行器、TOCTOU 复查、handoff 即 unknown 均未接线（见 2026-11-14-dictation-copy-effect.md）。
3. **单消费者认证**：本地 consumer 是同步测试回调，不是 React/DOM 或另一进程；无身份认证、无第二消费者抢占/冒充防护；Node worker 不是沙箱或认证边界，workerFactory 是可信测试替身。
4. **真实 timer 与源监听**：sourceTtl/逻辑时钟是注入值；无系统锁屏/设置监听、无真实 TTL timer、无休眠唤醒恢复处理。
5. **真实 fork 差距**：测试 fork 覆盖固定仓库 worker 的正常/协议失败/意外退出，但生产路径的 fork 时机、环境、权限、崩溃恢复（按设计不重启）在真实宿主未验证。
6. **展示正文跨进程**：展示正文可能与短业务正文相同，跨 IPC 不保留对象身份；真实链路的正文最小化、隐私与截断策略未定义。
7. **ended-result 槽与安全耗尽替换**：未实现；耗尽隐藏后旧引用仍可被外部持有，hidden 通知不能撤销字符串或强制卸载真实 UI。
8. **Tauri/Rust 宿主接线**：T0 未验收、T1 未启动，无生产 IPC 通道；G1～G6 生产门槛全部保留。
9. **消费者失败后的外部状态**：deliveryFailed 只停止后续调用，不能保证外部已显示内容消失；恶意 getter/Proxy 重入不在可信同步范围。

## 三、不可推断事实与反例

1. **不能从 ACK 推断展示已消失**：ACK 只证明子进程结构校验通过，反例：子进程收到 prepare 后立即返回 ACK，但真实 renderer 尚未卸载旧内容。
2. **不能从 hidden 调用返回推断不可见**：consumer 抛错前可能已渲染；反例（009 已覆盖）：consumer 收到 hidden 后抛错，外部引用的旧文本仍存在。
3. **不能从 close/signal 推断进程已退出**：close Promise 等实际 close 事件；反例：SIGTERM 已发送但进程挂起，需 SIGKILL 且仍可能残留至 OS 回收。
4. **不能从 watchdog 超时推断失败原因**：超时只触发 fail-closed；可能是子进程挂起、调度延迟或消息丢失，模型不区分。
5. **不能从 drained/资源释放推断重连可用**（复用 2026-11-14-voice-coordinator-model.md disconnected 门闩结论）：drain 后需新 epoch 显式重建。
6. **不能从同步失效推断跨进程一致**：反例（008 记录）：同刻同值写与 ABA 在同步模型中失效，但异步 IPC 下旧帧可能在新帧前到达消费者。
7. **不能从“最新 queued”推断无事件丢失**：只保留最新帧是设计选择，中间帧被有意丢弃；反例：连续 100 次 meter 只保留最后一条（009 已测）。
8. **不能从测试 fork 通过推断真实权限环境可用**：无 macOS 辅助功能/输入监控授权流程验证；需要系统权限时须走用户正常授权，不自动授予。
9. **不能从离线回归通过推断 SC021 整批/T0/T1/G1～G6 验收**：本轮不改变这些未验收状态。

## 验证

本批仅文档与只读引用：未修改任何源码、模型或默认关闭行为；新增文档检查（`test/project-docs.test.mjs`）覆盖本文件关键结论与 PLAN/README 引用；完整回归与检查结果见 operatelog SC-20261115-010。
