# Rust 协议测试相邻事件等待 · SC-20261114-007

## 问题与范围

历史 `rust host serve chat speaks the relay protocol` 在 `test/rust-host.test.mjs:252:39` 多次报 `Cannot read properties of undefined (reading 'type')`；SC-006 完整与单文件均复现。源码等待 user 消息出现后立即读取 `parseAll()[userAt + 1]`，但 stdout 不保证相邻 JSON 行在同一个 data 回调到达。user 已到并不证明 thinking 已到；重新取得快照也无法让下一行提前到达。

仅修正测试等待边界：新增 `test-helpers/event-at.mjs` 的 `waitForEventAt`，按原相邻位置等待事件存在，默认 deadline 10 秒、poll 25ms；采用单调时间，解析异常直接向上传播，缺行按时超时，错误仅含位置与数量、不含原始载荷。Rust 测试仍断言紧邻下一条的 type=state、name=thinking，**不跳过错误中间事件**，不放宽顺序、不增加睡眠猜时延、不自动重试业务。

没有修改 Rust/Swift/Node 产品源代码、stdout 协议、真实配置、服务订阅或应用包；不请求权限、不连接真实音频或云端。测试中的 Rust HTTP 请求仅访问回环合成服务和临时 HOME，原金库互读/取消/播报协议断言继续保留。T0 未验收、T1 未启动，G1～G6 仍未验收，测试修正不代表真实聊天/播放已验收。

## 可复现与验证

`node --test test/event-at.test.mjs test/rust-host.test.mjs`

新增七项检查：

1. 分开发送 user 行、半条 thinking JSON、剩余 JSON 与换行。旧快照读取确定性抛 TypeError；新等待在完整下一行到达前不完成，之后返回正确 state。
2. 已到达的相邻行立即取得，不依赖额外回调。
3. 若相邻行为 notice，则直接返回 notice 供原断言失败，即便更后面有 thinking 也不能跳过。
4. 下一行永不到达时超时，错误不带载荷。
5. 解析错误不吞掉。
6. 非法 index/deadline/poll 选项拒绝。
7. Rust 测试确实调用相邻等待且保留 type/name 断言。

真实 Rust 单文件八项加最初七项共 15 项通过，新增文档边界检查后相关共 35/35（含 docs）；目标协议测试连续五次独立运行通过（筛选运行仅用于该目标，不冒充全量）。完整 npm 回归实际结果见操作日志。此处能确认修正已识别的测试快照竞态，不能据此声称所有历史 Rust 偶发问题或传输风险均已消失。无原生源代码修改，未重跑 Mac 构建/浏览器/设备验收。

## 下一步

继续离线定义 processing 后最终 ASR 的展示契约与视图/业务原文分离，覆盖取消、迟到、writer 边界。真实服务接线仍受 T0/T1 门槛约束；当前不需要用户操作或授权。
