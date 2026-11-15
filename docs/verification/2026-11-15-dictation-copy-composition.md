# SC-20261115-007 离线复制结果与执行器等待组合

## 范围

仅在默认关闭、未被产品导入的 `DictationCopyResultModel` 新增 `samplePresentation()`，复用私有原始 effect/业务所有者。没有修改生产前端、IPC、音频或真实剪贴板，不接入服务。SC021 整批仍未验收、T0 未验收、T1 未启动，G1～G6 仍未验收。

## 组合规则

- 原业务展示 hidden 保持隐藏，不能因为执行器 busy 或诊断 written 复活旧回合。
- 原回合有效徽标优先于业务 copying/copy-available/copied；输出 checking、checked、not-issued、copy-written、copy-not-written、copy-unknown。`awaitingStop` 仅说明当前原结果的执行器仍未停止，不是新回合的成功。
- 无当前徽标且业务为 copy-available、原执行器仍 busy 时输出 `copy-waiting`、`executorWaiting:true`、`canCopy:false`。这不是新作业已排队；原 requestCopy 依旧拒绝，不自动重试。
- 新回合 listening 保持 listening 和当前输入电平；旧 written/not-written/unknown 一律不替换它。新候选可以等待旧执行器，不阻止语音独立恢复。
- 原 stop 后可恢复 copy-available；同轮 copy-not-written 或前置 not-issued 可同时显示 `canCopy:true`，但只有新的显式 requestCopy 才能开始重试。stop-first 的 unknown 保持未知，不凭停止推断未写入。
- 文本、截断、电平仍来自原业务投影，不读取完整 handoff 文本。当前 written 业务不显示正文；新候选等待时显示新轮正文。结果和等待不显示 thinking orbs。

## API 与一致性边界

`samplePresentation()` 返回冻结的 `{status,text,truncated,level,showOrbs,canCopy,awaitingStop,executorWaiting}`；关闭或 revision 耗尽返回 null。隐藏输出各布尔量为 false，不表示全局空闲。`canCopy` 只是展示信息，不是副作用权限。

这是可信同步本地所有者的一次组合采样，不是可提交帧、IPC认证或生产渲染器。内部业务 sample 会替换其 pending frame，所以旧业务 frame 不能再提交；组合返回值本身也不能 commit。该 API 不修改业务 revision、时钟、候选、执行器结果或资源状态，但并非对 pending frame 无影响。新业务 sample 仍可走原 commit。

保留的投影不会自动刷新、自隐藏或撤销文字；调用方必须重采样。尚无包含 effect/徽标修订的原子 sample→commit 协议，不能用原业务 commit 声称组合展示新鲜。没有主动订阅、真实 timer、ended-result 槽、安全耗尽替换、认证 UI 手势或系统 TOCTOU 解决方案。

## 验证

- 新增27项组合测试，覆盖默认关闭、当前三结果、拒绝前置检查、显式重试、隐藏/关闭、失联/断连/期限/revision耗尽、外来stop拒绝、stop-first未知、采样非提交/覆盖旧帧及产品不导入。
- 36条独立前缀轨迹：6种 finish/report/stop 顺序 × 3种结果 × 2种 meter 模式。预期由 seen 历史决定，不从实际返回值倒推。
- 组合/结果/恢复/执行器专项初次109/109、补充thinking/final-ready/preparing及候选到期后111/111通过。初次组合14/16：关闭夹具漏epoch，及同轮not-written被误标executorWaiting；补epoch并明确当前结果优先。随后67/68为失联测试误用ready状态的beginAt返回值，改用原query token，未改原模型验证规则。
- 完整 `RUSTUP_TOOLCHAIN=1.100.0 npm test`：784/784，0 fail/cancelled/skipped；文档与组合最终53/53，`git diff --check`通过；无原生源码改动，本批未新增Mac/Tauri构建、浏览器或真机验收。

本批不是 SC021 整批或 T0/T1/G1～G6 的验收。设备延迟与历史测试隔离影响仍无新结论；独立 Rust 1.100.0 仅进程级使用。
