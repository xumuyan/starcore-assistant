# /dev/null 描述符路径诊断 · SC-20261115-003

## 边界

延续 SC-20261115-002，仅新增显式手动 stdio 对照探针、四项注入式测试及证据。不修订产品或回归测试调用、超时、输出断言、并行设置，不用普通文件替换原控制链路。没有修复结论：SC021 仍未整批验收，T0 未验收、T1 未启动、G1～G6 仍未验收。

## 自建空进程采样

仅对自己通过 Python 创建、只执行 `/usr/bin/true` 的 Node 进程运行 macOS `sample` 3 秒，不采样用户应用，不申请新权限，不提交原始 sample。六次默认 spawnSync 用时约 897/5652/429/35/56/108ms，均 status=0。

采样中同一 SyncProcessRunner 分支 2207 次观察，2033 次位于：

`SyncProcessRunner::Run → CloseHandlesAndDeleteLoop → CheckedUvLoopClose → uv_loop_close → uv__loop_close → uv__close → __close_nocancel`

另 172 次位于 `ParseStdioOption → AddStdioPipe → uv_pipe_init → uv__stream_init → uv__open_cloexec → open`。这是抽样分布，不是精确函数耗时或某个 fd 的身份确认；仅说明主要延迟不在 start 业务逻辑，也不应把整个现象叫作子进程启动慢。

## 脱离 Node 的设备对照

Python 直接 open/close 设备，不读写载荷、不更改权限或设备：

- 第一轮六次 kqueue open/close 均四舍五入 0ms；/dev/null 合计 30/617/523ms。
- 第二轮 /dev/null 五次 open_ms/close_ms：23723/76、21/205、10/80、100/950、106/40。
- 同轮 /dev/zero 五次以及普通临时文件 dup/close 四次均四舍五入 0ms。
- stat：两者均字符设备、mode 0666；/dev/null major/minor=3/2，/dev/zero=3/3。没有显示被普通文件替换，但不能由 stat 推断内核/第三方组件状态。

由此可复现 Python 也在 /dev/null 操作出现秒级延迟，不是 Node 专属。但顺序对照不是同瞬间受控基准，不能断言所有超时均由此造成，不能归责某个进程、内核组件或系统版本。

## 上游源码联系

固定 Node v22.22.0 官方源码：

- [stream.c](https://github.com/nodejs/node/blob/v22.22.0/deps/uv/src/unix/stream.c)，Git blob `18763b4744c30a93f067a911b8059984bf36eb86`：uv__stream_init 在 loop->emfile_fd==-1 时以 O_RDONLY 打开 /dev/null，成功后保存备用 fd。
- [loop.c](https://github.com/nodejs/node/blob/v22.22.0/deps/uv/src/unix/loop.c)，Git blob `5d3f0c7a348b334e5651bf8682fe29b355ec0cb9`：uv__loop_close 关闭 emfile_fd，随后还有 backend fd 等。

这些说明默认管道调用为何可能涉及该设备；sample 的 close 未识别具体 fd，不能直接证明那次 close 就是 emfile_fd。未修改上游依赖或设备路径。

## 显式手动对照探针

`node test-helpers/subprocess-stdio-probe.mjs --run`

只在显式 --run 时创建自己的临时普通文件并启动 /usr/bin/true；默认三组交错 default-pipes/regular-file-fds。两种模式都是空命令，后者三路 stdio 指向同一私有临时文件，不是原控制测试。每次保留 15000ms 的 spawnSync timeout，但这个超时本身不能约束描述符初始化/清理总时长，不能声称整套探针有严格墙钟截止。可用外层受控工具限制任务时长；仅清理自己创建的资源，不终止未知进程。

只输出冻结的 mode/index/elapsedMs/status/受限code/failed，既不读输出也不记录环境/参数正文。导入不自动运行，iterations 1～5，失败不重试、不自动调整模式，任何失败使 CLI 非零退出；同一 fd 只对应空命令，不能推广至有输入输出的产品协议。

- 临时五组原型 default-pipes 194/1009/135/29/20ms，对应普通 fd 4/4/3/4/4ms。
- 保存后的手动三组 default-pipes 24745/139/390ms，普通 fd 4/5/12ms；全部 status=0。第一项虽大于15000ms，仍成功返回，符合上面“timeout≠总墙钟期限”的边界，不可据此冒称修复。
- 四项确定性注入测试 4/4：固定命令/参数/原时限和模式、原失败不吞不重试、有限迭代与 fd 校验、冻结结果/未知元数据不输出。

## 回归与解除条件

新增探针前原完整回归：744 项，740 pass/4 fail/0 cancelled/skipped。enabled client-control start、rust-host start/stop 超时；rust-state missing/invalid/mismatched keys 期望 status=1 实际 null。与上批损坏数据库用例不同，不证明数据损坏；原断言保留。service 本次通过仍不算历史超时已修复。

继续定位系统设备操作延迟的来源，需要可归责证据后再决定是否需用户或环境维护者处理；不自动改权限/设备、重启系统、停未知进程或用替代 stdio 隐藏真实回归。完整回归未恢复前不继续徽标/等待提示，也不将诊断工具当作功能验收。默认 stable 仍中断，Rust 1.100.0 仅进程级使用。无产品/原生源码变化，未新增浏览器、原生构建、真机或代理安装验收。

加入四项探针测试与一项文档检查后的完整回归：749 项，743 pass/5 fail/1 cancelled/0 skipped。两项 client-control start、Rust status/start 超时，rust-state old rows authentication 期望1实际null，service 原20秒超时再次取消；失败位置变化且历史问题仍在，不能宣称设备对照已修复任何一项。相关探针/诊断/文档检查32/32。
