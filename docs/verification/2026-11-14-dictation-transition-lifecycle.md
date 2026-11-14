# 听写转换入口的完整生命周期矩阵 · SC-20261114-014

## 范围

仅增加测试和证据，DictationTransitionModel、三个内部原模型、selector/frame/reducer、夹具和所有产品源均保持不变。模型仍默认关闭；本矩阵显式启用，无新增运行入口。保留 Tauri 2 + Rust + React，不操作剪贴板、系统输入、录音/播放、服务、权限、配置或安装应用。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 矩阵及独立判断

新增 `test/dictation-transition-lifecycle.test.mjs`，共 21 项 node:test，覆盖 **1056 条轨迹**，不是 1056 个独立 test 用例：

1. **144 条**完整轨迹：即时/手工合并 meter × issued/unknown/候选等待/复制成功/失败后显式重试成功/dismiss 六分支 × close、ASR stopped、writer stopped 六排列 × 下一轮听写/对话。每条经过 reserve 隐藏、独立 capture inputReady、meter、拒绝未停止 capture 的 process、capture stopped、thinking、final-ready、preparing、唯一结果状态；完整长 Unicode 正文用于 copyText，展示仅截取前缀。原 lease 停止不消耗活跃候选，结果/复制/dismiss 不替代 close。新轮保留原听写/对话分域，旧 receipt/attempt/candidate/copy/frame/session 不能影响新轮，下一轮 inputReady 仍须独立确认。
2. **720 条**重排轨迹：即时/合并 × 三种 disposition × final、result、ASR stopped、writer stopped、close 全 120 排列。独立布尔 closed/asrStopped/writerStopped、按事件顺序推导的 hasFinal/hasAttempt/hasResult 决定接受与展示预期，不用实际返回值决定应否接受。早 result 不缓冲重播；writer 先 stopped 允许 final 但不能 begin，ASR 先 stopped 禁止新 final。关闭覆盖所有保留业务值；资源 drain 和 run close 必须同时满足才可 reserve。
3. **192 条**耗尽轨迹：即时/合并 × 1～16 的版本上限（分别截在 reserve、资源分配、inputReady、双 meter、capture stopped、process、writer、final、begin、结果、复制、失败/重试/完成的每个前缀）× 六种 close/ASR/writer 清理排列。原 capture 若仍在则独立 stop；只有实际分配的 lease 才确认。复制 ticket 停止拒绝且原 ticket 仍 pending；耗尽不等于 drain，close 前或仍缺 stop 均占用 session。清理后版本保持上限、普通工作/重建禁止，无回绕。

每个执行步骤由测试预先指定 expected acceptance；检查成功恰好推进一版（上限清理例外饱和）、失效旧待提交帧并 hidden。拒绝步骤不分配版本，原待提交 record 仍能提交；不是一遇拒绝就把合法展示清空。每个可展示前缀重新 sample/commit 校验单一状态，终局不假装 thinking，dismiss 不复活 final。所有已保留会话最终显式关闭/清理。

## 证据边界与遗留

本矩阵中的 capture-ready、停止确认、issued/not-issued/unknown、显式复制与 written 布尔仍由测试输入，**不是硬件证明**、焦点验证、实际剪贴板写入或目标接受。issued 不是插入成功，copied 不是粘贴成功；展示 hidden 不是全文全局删除、OS 撤回或真实 DOM 卸载。复制失败后仍要新动作，不自动重试。合并 meter 没有自动调度，不代表帧率/延迟。

未修改原独占同步信任假设，不证明不可信 getter/Proxy 重入、生产异常恢复、并发锁/IPC 认证；候选有界寿命/主动取消/真实 UI 与 stop 证明仍缺。原最终正文在独立投影内的保留不变，不以唯一展示冒充全局写入授权。

专项与相关/全量执行结果见 operatelog；本批未执行新浏览器、前端/原生构建或真机验收。下一步离线明确候选有界寿命与主动失效事件契约（锁屏/设置关闭/新入口），使用注入逻辑时钟与显式事件，先验证隐藏、业务句柄失效与 lease drain 分离，不启生产定时器或系统订阅。当前无需用户操作或授权，真实接线仍受 T0/T1 门槛。


## 后续 SC-20261114-015

[候选有界寿命/显式失效策略](2026-11-14-dictation-lifetime.md)已建立默认关闭的逻辑时钟测试提案，原模型与本批矩阵不变，不是系统事件订阅或生产超时。下一步验证同刻截止/回调排列及全局事件陈旧性。
