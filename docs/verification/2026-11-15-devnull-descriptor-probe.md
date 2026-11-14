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


## SC-20261115-004 独立打开与已有描述符对照（环境阻塞检查点）

本批只补证据/计划/文档检查，不增加探针或更改产品。临时 Python 脚本只进行 O_RDONLY open/dup/close：保持同一个 /dev/null 原描述符，再交错按路径重新打开、dup 原描述符、通过 /dev/fd/原fd 打开、/dev/zero 打开与普通临时文件 dup。设备均不读取/写入载荷，不改权限，不注入输入。

- 初次 /dev/null open 15502.646ms；随后四次按 /dev/null 路径独立 open：22517.115/63.495/17.882/41.146ms，对应 close：558.133/192.918/0.379/89.677ms；原描述符最后 close 115.003ms。
- 已有 null 描述符 dup：0.014/0.005/0.002/0.006ms，对应 close：0.003/0.002/0.001/0.003ms。
- /dev/fd/原fd open：0.113/0.044/0.031/0.064ms，对应 close：0.001/0.001/0.001/0.001ms。
- /dev/zero open：0.042/0.014/0.013/0.015ms，对应 close：0.005/0.002/0.001/0.002ms；普通文件 dup/close 各0.005ms以内。

顺序采样不是同瞬间对照；/dev/fd 路径有不同的设备打开语义，不是证明“换路径即修好”，更不是生产替代方案。可确认独立 /dev/null open/close 在无业务 Python 中反复延迟，已有描述符复制未同样延迟；设备独立打开/关闭路径是重点，系统根因仍未知。不修改 libuv、不替换 /dev/null 或回归 stdio。

另通过 libproc 两次只读聚合统计（约3.02秒）可读进程1116→1137；记录已存在于两次采样的固定分类总量，不记录进程参数、文件路径、用户应用正文或PID附件。node 分类302个匹配进程的 user/system时间增量约0.006/0.007s，SkyComputerUseClient 分类267个约0.002/0.003s；这种计数与 runnable 状态不等于它们在烧CPU，也不能排除采样时间粒度、等待或内核开销。此前高load与大量runnable不能作为归责或结束进程的依据。没有采样这些未知进程的堆栈或结束它们。

原控制/Rust状态/service四文件复测：18项13 pass/5 fail，client enabled-start、Rust status/start仍超时；Rust状态path与key用例分别status=null而期望0/1。service本次通过，历史20秒超时仍未证实修复。时限/断言/并行设置均未改。

本地项目改动不能据此安全修复系统设备延迟。暂停继续堆叠诊断代码与新功能；下一步需要在设备open/close正常的执行环境复核原完整测试，或由系统/执行环境维护者在获得同意后定位延迟来源。不能自动重启系统、停进程、授予权限或清空配置；用户不必为测试重新授权。若考虑重启/重启执行环境，必须先保存工作、由用户或维护者决定，且重启不是已验证修复。完整回归与SC021验收继续受阻，T0 未验收、T1 未启动、G1～G6 仍未验收。

SC004 文档检查加入后完整回归 `RUSTUP_TOOLCHAIN=1.100.0 npm test`：750项747 pass/3 fail/0 cancelled/skipped；client enabled-start、Rust start/stop的Node同步子进程ETIMEDOUT，原timeout=30000ms，elapsed分别67744/58825/58123ms。Rust状态与service本次通过，不视作修复其历史异常。文档/既有探针/诊断检查33/33，git diff --check通过。未新增构建/真机验收。


## SC-20261115-005 只读资源环境检查（未归责）

本检查没有仓库探针或产品改动。只读 `vm_stat`、`uptime`、`sysctl` 与单次设备对照均能启动；`top`（45秒总工具限制）与 `/bin/ps -A ... | sort ...`（25秒工具限制）未完成，因此没有可靠的进程排行或归责证据。

- 8核环境本轮 load average：571.85/571.00/559.16；此前约582/572/559。load只表示系统排队/调度压力的观察值，不证明哪个进程或设备路径是根因。
- 本轮 `/dev/null` open/close：863.45/6387.724ms；`/dev/zero`：0.049/0.002ms。仍是独立只读打开/关闭，不读写设备、不改变权限。
- `vm_stat` 返回页统计；没有据此解释内核或内存因果。资源查询返回 `kern.maxproc=4000`、`kern.maxprocperuid=2666`；另 `kern.num_tasks=4096`、`kern.num_taskthreads=4096` 的口径未核实，不将它们当作实际进程计数或已达上限证据。不能由上限值推导具体阻塞。

这轮没有识别可安全停止的目标，也没有执行终止、重启、权限修改、设备替换、配置清理或系统维护。结论仍为执行环境异常待维护，不能修改项目代码假装修复。应在资源/设备操作恢复正常后复核原完整回归；SC021、T0/T1、G1～G6均保持未验收。

SC005 文档检查24/24（初次22/24，历史当前标记断言与新证据措辞不匹配；将历史检查绑定SC004保留条目并修正措辞，当前标记SC005仍单独严格检查）。最终完整回归751项747 pass/4 fail/0 cancelled/skipped：client enabled-start、Rust status/start/stop对照仍ETIMEDOUT，原timeout=30000ms，elapsed30081/45559/90281/34879ms；最后一条同时status=0、signal=null，不抹去ETIMEDOUT、不视作成功，也不能据此判定所有退出码异常同因。无产品/原生修改，未新增构建或真机验收。
