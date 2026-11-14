# 原回合复制结果徽标提案 · SC-20261114-021

## 范围与归属

新增默认关闭、仅测试启用的 DictationCopyResultModel，私有拥有原 copy-effect；原模型与历史反例不改，无前端/原生/服务接线。T0 未验收、T1 未启动，G1～G6 仍未验收。没有真实剪贴板、输入、系统通知、音频、权限或安装操作。

只有成功 prepareAt 返回原检查 token 才绑定原 session。外来/失败的 prepare 不重绑；原模型内部 check/job 的严格一次性验证负责任务归属，本层不接外部拼装的 snapshot/job envelope，不重复发明可伪造 job ID。成功 requestCopy 先撤销上次展示归属：新动作在成功 prepare 前不继承旧 not-written/not-issued；旧 report/stop 仍由原 job 验证，不能给新 job 贴成功标签。constructor 严格 enabled===true，未启用一律隐藏。

result() 只返回冻结 `{status, awaitingStop}`，不带正文、session、job、copy、epoch、候选或执行权限。当前原 session、connected、非 closing、dictation 的 processing/thinking 视图与 run/epoch 一致才可显示；准备/listening、其它回合、终止、失联/显式期限关闭、业务版本耗尽均 hidden。旧结果仍保留在原 snapshot.outcome 作诊断，本层不把它绑定新回合。

## 语义

- checking/checked：原复查阶段，不表示发出或写入。
- not-issued：交接前确定终止，不等于执行器报失败。
- copy-unknown：handoff 后无明确结果，或 executor stop 先到、明确 unknown。不能自动重试。
- copy-written / copy-not-written：原执行器首次可信回报的真实结果；前者不是粘贴或目标接受，后者不是 timeout/取消/stop 推断。
- awaitingStop 只显示**当前归属任务**尚未 stopped，不代表结果真假；written 也可能仍等 stop。hidden 的 awaitingStop=false 不说明全局空闲，旧 job 可能仍 busy 并阻止新 copy，调度必须使用原 owner gate，不能使用徽标许可。
- 原 hide/dismiss 成功后按当前原 session 保留隐藏 marker，不因迟到 report、stop 或同轮重试恢复；新 session 才解除。hide/dismiss 不产生 executor stop，不删除真实结果，不关闭 voice。原业务 sample/commit 展示继续独立，不与此徽标合并，避免冒称统一 UI。

## 证据

144 条 close/report/stop/next 全排列（24 × written/not-written/unknown × 两 meter），每前缀以独立 closed/reported/stopped 状态验证原回合结果和等待停止；新回合从准备/监听/最终结果均隐藏旧徽标，自己的新 check/job 才显示。另覆盖原句柄、失败准备、重试动作清旧状态、同轮 sticky hide/dismiss、源失联/expiry/voice disconnect/epoch 恢复、stop-before-report、耗尽、Promise 迟到、读不推进时间和生产无导入。

result() 是按需同步读取，不读 wall clock、不分配业务 revision。返回的旧冻结对象不会自行隐藏，未发生显式 timed ingress 时无法检测真实流逝；无订阅/DOM 投递。保留原 snapshot 的旧 written 与新 listening 共存反例，但在 result() 隔离。这里的 session 等同是可信串行本地所有权，不是 IPC 认证；不涵盖恶意 getter/Proxy/重入或崩溃恢复。**TOCTOU** 与真实执行边界复查仍未解决。

下一步离线组合徽标与原语义展示，定义旧执行器 busy 对新回合复制提示的影响，避免徽标 hidden 被误解为可复制；不接生产，无需用户操作或授权。

## 本批验证阻塞

新增专项 26 项、144 条排列与相关回归通过；完整 npm test 实际为 684 pass / 52 fail / 0 cancelled/skip（共 736），不能记为整批验收通过。Rust 测试构建触发 stable 工具链同步，出现下载 partial rename ENOENT、cargo 300 秒超时及 static.rust-lang.org DNS 失败；当次观察本机 ~/.rustup/toolchains 为空。正常与提升网络权限的 rustup toolchain install stable --profile minimal 恢复均因 DNS 失败，未改系统默认工具链配置、未删除缓存、未跳过测试。解除条件：可解析并访问官方 Rust 分发源，正常恢复 stable 后重新运行完整 npm test 并记录通过；当前仅提交保存可回滚提案，不声称整批验收完成。

后续 SC-20261115-001 已[恢复独立 1.100.0 工具链](2026-11-15-rust-toolchain-recovery.md)，不是修好默认 stable：完整回归 729 pass/6 fail/1 cancelled，仍未验收；以新检查点为当前阻塞，原失败历史保留。
