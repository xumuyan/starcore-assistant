# 控制子进程失败诊断 · SC-20261115-002

## 范围

仅测试新增 measured-exec-file helper，client-control 与 rust-host 测试以相同调用签名使用；所有原参数、输入、环境、断言、超时、并行设置及产品代码不变。无重试/skip、无真实代理启动或安装，不接系统输入、剪贴板或音频。T0 未验收、T1 未启动，G1～G6 仍未验收；SC021 仍未整批验收。

## 只读隔离诊断

临时目录中的合成 HOME/plist/state/fake-launchctl，使用仅本次 Node 进程的 execFileSync trace；参数/输出不作为附件提交，诊断后只清理自己创建的目录/进程组，不停止未知进程或用户应用。

- client-control start 完成耗时 25.22 秒。内部两次 plutil 分别约 12852ms/2688ms，fake-launchctl 两次 print 分别约 5330ms/2873ms。
- Python 同一隔离目录直接启动 plutil 与 fake-launchctl 各约 0.01 秒。
- Node 同步启动 /usr/bin/true 四次约 11603/1724/34/580ms；异步启动约 8ms；Python 直接启动四次约 8/6/7/5ms。

这些是顺序采样，不是受控性能基准；并非相同瞬间或调度条件，不证明 Node 缺陷、系统负载或某个产品函数是根因。但无业务的 true 也可慢，不能把全部现象归咎于 start 逻辑。读取进程计数的 ps/sysctl 诊断命令也未在 25 秒工具时限内完成，未取得可归责的进程清单，不据此杀进程。期间 uptime load averages 约 500/529/591，仅观察，不证明因果。

未改动前再测 client-control/rust-host 两文件：11 项，8 pass/3 fail，enabled start、Rust start、Rust stop 超时；与先前失败位置不同，不代表重试修复。

## 测试诊断 helper

createMeasuredExecFileSync 的默认实现仍调用原 execFileSync，成功返回原对象，失败原值重抛，不替换 code/status/signal/cause。失败额外加入冻结 executionDiagnostic 与可读错误消息/stack 行：

- 单调时钟 elapsedMs、原 timeoutMs；两者不同只描述返回延迟，不证明子进程实际执行时长或时限失效根因。
- 可执行名仅 node/cargo/moss-host 白名单，其余为 subprocess；受限 code、整数 status 与标准 signal。
- 不读取或新增记录 args/env/input/stdout/stderr，不增加完整路径、业务文本或凭据。原异常原本自带的路径/输出不由本 helper 清除，不能宣称全日志已脱敏；提交证据不包含这些载荷。
- 冻结/只读异常或诊断自身错误时仍抛原异常；只读消息可能不加完整说明，不影响原失败。

六项确定性测试注入 execute/clock 验证成功原返回与选项引用、一次调用、原异常身份与属性、冻结元数据、载荷 getter 不读取、未知字段收敛、非 Error/frozen/read-only message 不替换失败。无计时器或放宽超时。

## 实际回归

- helper 首次 5/5；补只读消息后共 6 项。
- helper+client-control+rust-host：17 项，13 pass/4 fail；新增诊断显示 Node 同步失败 elapsedMs 35251/42309/30498/69795，原 timeoutMs 均 30000，ETIMEDOUT/SIGTERM/status=null。这些测量不是修复。
- `RUSTUP_TOOLCHAIN=1.100.0 npm test`：743 项，739 pass/4 fail/0 cancelled/skipped。两项 client-control start、一项 rust-host start 仍超时（诊断 50174/30353/41916ms，原 30000ms）；另 rust-state 的 corrupt SQLite/legacy plaintext 测试期望 status=1 实际 null，原因未定位，不能推断损坏或测试超时。service 本次通过不算已修复其历史超时。

无前端/原生源码变化，未新增浏览器、原生构建或真机验收；安装的独立 Rust 1.100.0 仅进程级指定，默认 stable 中断状态未修复。

## 后续

完整回归仍受阻，先用无业务最小子进程与控制路径逐步定位调度/启动延迟，另保留 rust-state 异常状态问题。不以复跑偶然通过、延长时限、串行替代原完整命令、改业务 async 或终止未知进程作修复。恢复完整回归并记录阶段证据前不叠加徽标/等待提示，不要求用户授予额外权限。
