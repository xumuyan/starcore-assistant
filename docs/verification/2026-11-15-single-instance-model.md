# SC-20261115-020 单实例与数据安全离线接线准备模型

## 范围与方式

按 `PLAN.md` T1 差距（单实例/单消费者/数据安全），新增**默认关闭**的离线模型 `test-helpers/dictation-single-instance-model.mjs` 与专项测试 `test/dictation-single-instance-model.test.mjs`。口径对齐 `test-helpers/dictation-renderer-ack-protocol.mjs`（默认关闭 no-op、onFail 回调、fail-closed 锁存、统计快照）与 [SC-20261115-019 记录](2026-11-15-wiring-recheck-timing-models.md)（离线源码断言、不可推断事实）。

不接真实文件系统、剪贴板、输入注入、系统监听、进程、timer 或生产接线；不改任何生产源码与默认关闭行为。本模型不覆盖真实文件锁（flock/lockfile 原子性）与磁盘加密实现——那是生产差距。

## 一、已验证边界（离线模型，默认关闭）

1. **单实例互斥认领**：同一时刻至多一个 live claim；非持有者 release 被拒且不影响持有；自愿 release 后槽位可被新实例再认领。
2. **重复启动 fail-closed**：持有期间第二次 claim 记为一次 duplicate-startup，立即永久锁存（`latched`）、状态置 `contended`、触发 onFail；锁存后所有入口（含原持有者的 claim/release/retire/beginWrite）一律拒绝，无重试、无重置。
3. **实例退役不可逆**：retire 后状态永久 `retired`，任何实例（含原 ID）永远不能再认领；不存在 unretire；非持有者 retire 被拒且不改变状态。
4. **数据白名单**：写请求只是 `(path, kind)` 对——API 不含任何内容参数，明文无法经由本模型进入。仅 `kind='encrypted-record'` 且 path **精确匹配**构造时给定的既有加密记录路径白名单才接受；前缀匹配、新后缀路径、未知路径一律拒绝（不建新文件、不建新目录）；`kind='plaintext'` 在白名单路径上也拒绝。
5. **退役/锁存后的写拒绝可区分**：`retired`、`latched`、`unknown-path`、`plaintext-or-invalid`、`disabled` 是不同 verdict，不互相冒充。

## 二、生产差距（未实现、未验收）

1. 真实单实例机制（flock/lockfile 原子性、崩溃后陈旧锁回收、多用户场景）未实现；模型 claim 是纯逻辑，不是进程间互斥证明。
2. 真实加密记录存储路径与现有加密数据实现的对接未实现；白名单由调用方构造时提供，模型不验证磁盘上文件真实存在或确为加密内容。
3. 崩溃恢复、锁存重置策略、与真实启动流程的集成未设计验收。

## 三、不可推断事实与反例

1. **不能从 claim 通过推断系统级单实例成立**：两个真实进程可同时构造两个 enabled 模型各自 claim 成功；互斥只在单模型实例内成立。
2. **不能从白名单接受推断磁盘写入安全**：模型只检查 (path, kind)，不执行任何 IO。
3. **不能从 API 无内容参数推断明文不会落盘**：调用方仍可能用其他 API 写明文；本模型只保证自身入口不携带内容。
4. **不能从 retire 推断真实进程已退出**：退役是逻辑状态，进程回收属 OS。
5. **不能从 7 项专项通过推断 T1 数据安全验收完成**：SC021 整批、T0、T1、G1～G6 仍未验收。

## 验证

专项 `node --test test/dictation-single-instance-model.test.mjs`：**7/7 通过**（0 fail）。开发过程中一次测试自身失败：`writesRefused` 预期计数漏算前缀路径拒绝一条（模型行为正确，改测试预期 4→5）。含离线源码断言（模型源码零 NSPasteboard/pbcopy/CGEvent/child_process/spawn/exec/setTimeout/setInterval/Date.now/fs/launchctl/osascript 等）。完整回归与 git 检查结果见 operatelog SC-20261115-020。本批仅离线验证，不含真机或生产验收。
