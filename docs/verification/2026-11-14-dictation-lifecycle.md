# 听写组合生命周期验证 · SC-20261114-010

## 范围

仅新增 `test/dictation-lifecycle.test.mjs` 与证据/计划更新，组合原 VoiceCoordinatorModel、FinalAsrProjection、DictationOutcomeModel；三个模型、旧 reducer、夹具、React、Rust/Swift/Node 产品代码均不修改。保持默认关闭与 Tauri 2 + Rust + React 决策，不操作剪贴板、不注入系统输入、不启动录音/播放/真实服务、不申请权限或替换应用。

T0 未验收、T1 未启动，G1～G6 仍未验收。这是无计时器的合成事件排列，不是生产 adapter、IPC 认证或真实资源证明。没有新的浏览器、原生构建或设备验收，历史截图不能证明本批最终状态可见。

## 组合矩阵

### 完整业务分支：144 条

即时/手工合并 meter 两模式 × 六分支（issued、unknown、候选等待、复制完成、失败后显式再复制完成、dismiss）× close/ASR stopped/writer stopped 六排列 × 下一轮 conversation/dictation 两模式。

每条轨迹从隐藏准备、独立 inputReady、meter、capture 未停时 process 拒绝、原 capture stopped、process、最终文字接受及 writer 准备开始。合并 meter 在 capture 释放后清槽，无迟到采样。完整业务正文保留且展示 truncated；复制读完整正文，不读展示截取值。业务结果/复制/dismiss 都不等于 end，end 不等于 stopped，stopped 也不等于 next inputReady。

每个排列前缀检查：只要未 close 或尚有原 owner 未 stopped，reserve/restart 均拒绝。全部完成后下一轮先隐藏，再必须用新 capture 的 inputReady；旧 receipt/attempt/candidate/copy/lease 无法影响新回合。新 dictation 生成全新的最终结果与候选；新 conversation 不能借听写投影。所有测试轨迹均显式清理最后的原 leases。

### 业务/资源/关闭乱序：720 条

final、writer result、ASR stopped、writer stopped、close 的 120 种全排列 × 三种结果 issued/not-issued/unknown × 两种 meter 模式。

独立断言模型（布尔记录 closed、asrStopped、writerStopped、是否已取得原 attempt）推导接受条件，不由模型返回值反推期望：

- final 仅 close 前且 ASR 尚未 stopped 可接受；writer 已 stopped 时 final 可以存在，但 begin 不得创建有效写入 attempt。
- result 仅 close 前、原 writer 尚未 stopped、已取得原 attempt 时可接受；早到/无 owner/关闭后的结果不会复活。早到结果不排队、不自动重放。
- 只有明确接受的 not-issued 且未关闭有候选；资源 release 不消费该候选。close 后两投影访问均 hidden。
- final/result/stopped 不修改原 reducer 的对象或 seq；close 才分配 terminal seq。所有排列只有 close+两 stopped 后可 reserve 新轮，结果本身不能放行。

此矩阵刻意保留“stopped 先于 final/result 导致业务结果不可接受”的边界，不用乱序缓存伪造仍活跃的 owner。真实 adapter 必须定义同 owner 的业务结果→停止确认顺序；设备/传输是否保证尚未验收。

### 额外反例

- Promise copy completion 在同 epoch 的新 dictation 已准备后才执行，拒绝旧 handle，不能标新结果 copied。
- 断连后缺 ASR stop 连续 50 次 restart/旧 copy callback 均拒绝；补 stopped 后仍不能 reserve，必须显式新 epoch 才重连。
- **独立投影仍保留**：issued/unknown 或 outcome.dismiss 只清 outcome 的本地正文/候选，FinalAsrProjection 的 final-ready 与原 receipt→writerText 在本轮仍有效。原 outcome 不可再次 begin，但这不证明全系统所有正文、显示卡片或所有可能写入入口已失效。close 后两者才都失效。测试明确断言该事实，未偷偷修改旧模型来声称全局清理。

## 本批结论与缺口

原三个模型在这些组合轨迹符合各自契约；它们**不是统一展示仲裁器**。outcome 状态与 final-ready 同时存在，生产尚没有哪张卡片优先、何时撤去 orbs、dismiss 是否连同字幕一起隐藏的单一规则。原 final reader 也不等于写入权限；如果另建 outcome 实例或调用者保有正文，当前模型不能阻止其另行调用副作用。不能把本批一次性 attempt 误称为跨实例/跨 IPC 的系统全局禁止补发。

惰性访问清理不是主动订阅、即时取消、安全擦除或撤回已发粘贴。copy written/issued/stop 均是测试的显式输入假设，不能作为真实剪贴板/目标应用接受/硬件停止证据。候选寿命与主动过期、受限 IPC、统一投递 seq、单消费者/sidecar、真实资源取消仍缺失，G1～G6 保持未验收。

## 验证与下一步

`node --test test/dictation-lifecycle.test.mjs`；相关及完整回归实际结果记录在根 operatelog。矩阵计数是循环内轨迹数，不把 864 条排列写成 864 个独立 node:test。

下一步先设计**单一只读展示选择契约**：在 thinking/final-ready/preparing/paste-issued/paste-uncertain/copy-available/copying/copied/hidden 之间明确优先级与内容可见规则，区分 outcome dismiss 和整个 run close，避免同时展示“处理中”和终局结果。先文档与纯合成测试，不放宽旧 reducer、不新增生产事件通道、不连接服务；当前无需用户操作或授权，真实接线仍遵守 T0/T1。


## SC-20261114-011 展示选择提案

[单一只读选择契约](2026-11-14-dictation-presentation.md)在不修改原模型的前提下组合展示快照：writer 终局覆盖 final/thinking，只有 thinking 显示 orbs，dismissedSession 区分本轮视觉关闭与资源 close。输出不含业务 handles、不授予复制权限，不删除独立 final 正文，也不能识别同 session 旧快照重标身份。仅离线测试，前端与真实服务未接；下一步一致帧采样和 dismissal 生命周期。
