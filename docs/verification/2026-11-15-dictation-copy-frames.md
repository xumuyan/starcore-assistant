# SC-20261115-008 组合展示帧离线投递实验

## 范围与依赖

在 `test-helpers/dictation-copy-frame-model.mjs` 新增默认关闭的 `DictationCopyFrameModel`。私有持有 SC007 原组合模型，不接受外部 owner 注入，也不改变该模型及已有业务规则。没有产品导入、DOM交付、真实剪贴板、输入、音频或IPC。SC021 整批仍未验收、T0 未验收、T1 未启动，G1～G6 仍未验收。

## 帧规则

- `sample()` 返回冻结 `{presentation}`，presentation沿用原组合字段；只有最新原始对象可 `commit(frame)`，仅一次。克隆、另一实例、旧帧和重复提交均拒绝，拒绝commit不消耗最新帧或覆盖已展示内容。
- `snapshot()` 返回冻结 `{presentation}`，初始/失效为全字段隐藏。sample替换pending但保留shown，commit才切换shown。底层sample为null（关闭或业务revision耗尽）则清除shown。
- 十个写入口 advance/beginAt/receiveAt/lostAt/dispatchAt/prepareAt/checkedAt/handoffAt/reportAt/stoppedAt 一律先清除pending与shown，再调用原模型；即便拒绝、同刻同值或抛错也失效。原异常原样传播，不自动重试。
- 保守失效不是“只在接受转换时递增revision”：失败请求可能推进逻辑时间/触发期限，报告与stop也不一定分配业务revision，不能只靠业务seq或对比字段判断。此封装对所有写入口先失效，因此即使presentation发生ABA返回相同值，旧原对象也不能提交。
- 新封装没有新增数字generation，不回绕计数；原业务revision耗尽仍fail-closed。保留单个pending及shown，旧帧不会在模型历史中累积。外部持有的帧不能被撤销或安全擦除。
- `candidate()`、`diagnostic()`、`snapshot()`不使帧失效；sample/commit不推进逻辑时钟、不分配业务revision、不续期、不制造执行器结果或停止证明。diagnostic是原状态诊断，不是展示或权限。
- 未暴露底层model、samplePresentation、copyTextAt或原业务commit旁路；所有写操作必须通过同一个私有同步owner。

## 原子性限制

这里的“原子”仅指可信同步本地调用中：sample→任何写入口→commit旧帧必拒绝。没有跨线程/IPC事务或在DOM中执行的提交。没有主动timer/源监听，未到达的事实仍不可知；snapshot读取不观察墙钟，只有显式写入口会失效。

提交后，若调用方保留presentation引用，它不会自行消失；本模型清除shown不等于真实UI已卸载。消费者主动投递、消失通知、执行完结槽、安全耗尽替换、UI认证及系统TOCTOU均未实现。`canCopy`是展示提示，不授权副作用；隐藏不代表执行器空闲。拒绝入口也隐藏可能引起闪烁，不承诺生产可用性或恶意Proxy/getter重入安全。

SC007的独立samplePresentation仍是不可提交采样，会替换原业务pending frame；本批是新私有封装，不修改其旧API契约。

## 实际验证

- 新增40项确定性测试，包括默认关闭/最新原对象一次提交/跨实例与克隆拒绝/只读/保留值、全部十入口拒绝及抛错的预先失效、report/stop/隐藏/失联/断连/期限/原业务耗尽与清理。
- 144条独立前缀轨迹：24种 finish/report/stop/deliver顺序 × 3种结果 × 2种meter模式；deliver预期由其之前是否出现写入口决定，stop-first迟到report仍拒绝且仍使帧失效，新轮等待及可复制独立计算。
- meter ABA、同值源快照、失败请求触发到期、旧Promise投递不覆盖新原结果均覆盖。
- 首次新测试33/34通过；失败因假定checked句柄可以重复接受，原模型只允许checking阶段一次checked。改用合法meter 0.2→0.8→0.2往返，不修改原业务规则；补充源同值/到期/耗尽测试后专项150/150，再补sample保留shown测试。
- 最终专项151/151，加文档178/178；进程级 `RUSTUP_TOOLCHAIN=1.100.0 npm test` 825/825，0 fail/cancelled/skipped；最终帧与文档67/67、`git diff --check`通过。无原生源码改动，本批未执行Mac/Tauri构建、浏览器或真机验收。

本批不接受 SC021/T0/T1/G1～G6；设备延迟根因、历史stop测试影响及默认stable/fmt/clippy健康均无新结论。
