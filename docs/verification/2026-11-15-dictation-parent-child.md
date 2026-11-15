# SC-20261115-009 主进程控制与子进程展示准备

## 本批完成范围

用户要求由一个主进程主控、调用子进程并测试，连续完成。本批完成当前离线投递链路：默认关闭的 `DictationPresentationController` 私有持有原 `DictationCopyFrameModel`，主进程独占会话、原始frame/check/job及最终commit。固定Node子进程只验证有限展示值，返回不含正文的准备ACK。测试含实际fork；不创建第二个前端麦克风，不接真实剪贴板/输入/音频、不改已安装应用。SC021 整批仍未验收、T0 未验收、T1 未启动，G1～G6 仍未验收。

## 主控与消费者

- 十个状态入口先失效本地原帧，并同步向本地consumer发hidden，再进入原业务；finally采样当前帧，原异常不替换。新状态要等子进程ACK且主进程原frame commit成功才交付consumer。
- consumer收到hidden先于可能抛错的业务调用。只读snapshot/candidate/diagnostic不触发自动timer。consumer抛错或重入写入口会锁存deliveryFailed、清空展示、结束自己创建的子进程；后续不继续调用失败consumer。
- 一槽in-flight加一槽最新queued。写入口把in-flight的frame引用清空，但保留其id直到ACK或故障，避免无限并发；queued只保留最新帧。迟到ACK只释放旧槽，不可恢复旧展示，再处理最新帧。
- 原frame/check/job仅存在主进程；IPC发送 `{type:'prepare',id,presentation}`，子进程不接收业务完整writerText、原始句柄或副作用方法。展示正文可能与短业务正文相同，不声称展示内容匿名或零正文传输。
- 本地consumer是同步测试消费者，不是React/DOM或另一进程；冻结旧值仍可被外部持有，hidden通知不能撤销字符串或强制卸载真实UI。

## 固定子进程及生命周期

- 默认关闭不fork、不通知consumer。启用只fork固定仓库worker，execArgv为空，环境仅PATH；stdin/stdout/stderr管道加Node IPC，输出只排空不记录。无shell、文件/剪贴板/输入设备写入、凭据或真实数据夹具。
- 子进程接受ready/prepare/prepared/shutdown固定协议。展示字段集合固定、text≤8000 UTF-16且well-formed、status白名单、level有限0～1、布尔字段严格；拒绝额外字段、业务结果方法及超限正文。验证只证明结构，不认证语义、OS状态或权限。
- id为每任务新UUID，主进程严格核对当前ACK类型、字段、id；陌生/重复ACK、重复ready、协议错误、发送失败、error/disconnect/close均fail-closed，不自动重启、重试或推断复制成功。
- ready和每个处理中任务有5000ms默认watchdog（允许1～30000ms配置；测试用短期限触发故障而非放宽回归）。故障立即hidden，限制新工作但仍允许原advance/report/stop及close/disconnect/released/hide清理。
- close立即hidden，只向自己创建的子进程SIGTERM，1000ms未close再SIGKILL；不操作其他PID。close Promise只在实际close事件后完成；signal已发送不等于进程退出。这个关闭只关展示worker，不制造复制执行器的stop证明。正常固定worker也支持shutdown后断开退出，协议测试实际覆盖。

## 实际验证

- 单文件首次35/35通过；增加144条父子ACK前缀排列及隐藏/失联/期限/真实退出后，与原组合帧/组合/结果/执行器/恢复专项199/199通过。再补自有进程升级终止、业务revision耗尽及payload白名单检查，最终controller51/51、相关202/202、加文档230/230通过。
- 144条独立轨迹 = 24种finish/report/stop/ack顺序 × 3种结果 × 2种meter模式；每前缀检查hidden与busy，最终仅当前候选可复制，不从实际返回值倒推预期。
- 实际fork测试：完整复制结果投递/stop/关闭、固定worker非法消息与文本边界/有效ACK/正常shutdown、自己的worker意外退出。全部使用合成文本，不接真实clipboard。可控假child覆盖发送错误、挂起/watchdog、异常/断连、重复/外来消息、close等待及SIGTERM→SIGKILL。
- consumer抛错/重入、业务抛错原异常、十入口拒绝、100次meter只保留最新、默认关闭、旧ACK与旧结果不跨新轮、耗尽仍可原stop均有测试。
- 完整 `RUSTUP_TOOLCHAIN=1.100.0 npm test` 877/877，0 fail/cancelled/skipped；最终controller与文档79/79、`git diff --check`通过；本批无原生源码修改，未新增Mac/Tauri构建、浏览器或真机验收。

## 仍未交付的生产能力

该批完成的是离线主控/子进程/本地消费者测试链路。Node子进程不是沙箱或认证边界，workerFactory是可信测试替身。consumer事件回调不证明真实DOM卸载，消费者失败后无法保证外部已显示内容消失；不解决恶意getter/Proxy重入、跨进程认证、系统TOCTOU、未送达源事件、休眠唤醒、真实timer、ended-result槽与安全耗尽替换。展示worker没有调用原复制执行器，更不能用其close代替资源drain。

本批不等于整个产品迁移或SC021整批验收；T0/T1实际操作与G1～G6生产门槛继续保留。默认stable/fmt/clippy、设备延迟根因及历史stop测试影响无新结论。
