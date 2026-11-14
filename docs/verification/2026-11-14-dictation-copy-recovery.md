# 显式复制执行器与源/语音组合恢复矩阵 · SC-20261114-020

## 范围

只新增 dictation-copy-recovery 测试与文档，不修改原 DictationCopyEffectModel 或任何下层模型、夹具、reducer、前端/原生/服务产品源码。默认关闭提案仍只在测试显式启用，使用合成正文与原对象句柄；无真实执行器、系统通知、剪贴板/输入、音频、权限、用户配置或安装改动。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 两组独立恢复轨迹

1. **4320 条源失联恢复**：lock snapshot/settings snapshot/原 ASR stopped/原 writer stopped/executor report/executor stopped 六事件 720 全排列 × written/not-written/unknown × 即时/合并 meter。先从已 handoff 的旧任务触发原 source lost，建新 query；每前缀按独立 seen 集合推导双路 freshness、旧资源剩余、report 与 stop 谁先、executor busy 和局部结果，不从实际返回值倒推预期。只有 fresh + 两个原 voice stop 才进入新 reserve；reserve 后仍 hidden，原 capture inputReady 才 listening。新回合可以早于旧 executor stop 进入输入/最终正文处理，但新的显式 copy 必须额外等旧 executor stop，结果回报不能替代它。
2. **288 条 voice 断连/epoch 重建**：两快照/两原 stop 的 24 排列 × executor stop 在重建前/后 × 三结果 × 两 meter。即使源 fresh + 资源 drained，也不能自动重连 voice；满足门槛后显式 restart 新 epoch 会撤销源 query，必须新 token 与高于保留高水位的两快照。部分新快照不放行，旧 epoch/query 与版本不因 restart 获得新鲜度。进入新回合后仍独立确认原 executor stopped，再完成新 copy → 明确 not-written → 新用户动作 retry → written → executor stop。

共 **4608 条完整轨迹**，不是 4608 项 node:test。原 capture stop 与 process 分离、准备态不能借伪造 capture inputReady、两类 meter 均经过真实模型入口；测试中显式停止/查询/输入事实都是合成可信本地假设，非硬件证据。

## 反例与结果所有权

- 旧 report 在 loss 后仅本地记录，applied=false；stop 先到则旧 report 拒绝、unknown 不变。旧 executor 的结果不因新轮复制可用而应用到新 run。新 job 创建后旧 job 的 report/stop/Promise 回调均不能完成或释放新 job。
- 明确 report 仍不是 stop：缺原 executor stop 即使源恢复、新 inputReady/最终正文均完成，也阻止 50 次 copy 请求；复制 handle 或 stopped:'true' 不补证据。反过来 executor 已 stopped + 源 ready 不能代替缺原 ASR stop，50 次 reserve/restart 仍阻止。原 stop 是逐资源 ownership，不借克隆 ticket。
- fresh restrictive 快照只证明活性，不授予 permission；锁与设置分别解除。新源 inclusive 截止优先于已检查 token 的交接，关闭但仍保留两个原 voice leases。旧任务 report/stop 不续新源预算，也不自动提交新复制。
- 耗尽后原资源及 executor 仍可清理，但新 reserve/restart 不绕开业务 revision 上限。旧 candidate/receipt/attempt/copy/check/query 不复用，完整正文不作为验证附件。

## 未解决与下一步

本批是原模型组合验证，不是生产调度器/资源管理器。源 query、观测、guard allowed、written/not-written、stopped 都不是 IPC/OS 认证；无自动 timer、真实取消/执行边界原子性或崩溃恢复。**TOCTOU** 仍存在；source budget 不能证明未到达的锁屏，executor stop 也不能撤销已发生写入。没有新原生/浏览器/真机证据，已有 service.test 超时根因仍未定位，不因本批回归通过而称修复。

原 snapshot.outcome 是局部最近执行记录，可能在新回合仍保留旧 job 的真实结果；它不是当前 session 的统一 UI 状态，不应直接绑定前端。下一步离线明确执行结果展示的原 session/job 归属及新回合隔离规则，避免把旧局部结果当作新回合成功；不新增真实权限或生产接线。无需用户操作或授权。


## 后续 SC-20261114-021

[原回合结果徽标提案](2026-11-14-dictation-copy-result.md)新增独立默认关闭 wrapper，不改本批模型与旧诊断反例。隔离当前 session 的徽标和旧局部真实结果；不是前端接线或执行权限。
