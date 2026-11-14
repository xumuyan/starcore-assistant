# 听写写入结果与显式复制契约 · SC-20261114-009

## 范围与旧实现事实

新增默认关闭、仅测试导入的 `DictationOutcomeModel`，组合已有协调器和最终识别投影，不修改旧服务、原生代码、reducer 或前端。保持 Tauri 2 + Rust + React，T0 未验收、T1 未启动，G1～G6 仍未验收。不调用剪贴板、不发系统输入、不申请权限、不接真实服务/设备、不替换应用。当前无需用户操作或授权。

源码核对：实际 writer 在 `client/DictationPaste.swift`，不是 DictationWriter.swift（首次读取该不存在路径失败后通过符号定位纠正）。它在等待触发键释放后，多次检查 isCurrent/targetStillMatches，临时写剪贴板并发 Cmd+V，随后 restoreIfUnchanged；postPaste 成功只是发出系统事件，不等于目标应用接受。`client/DictationController.swift` 用 requestID 守卫结果，posted 显示“已发出粘贴”，否则 endSession 后保留 copyText 供按钮显式复制；cancel/endSession 清 copyText。当前 copyResult 调 setString 但未区分返回值，不能据此声称已具备本提案的明确 clipboard completion 结果协议。

旧 posted=false 含多种原因。未来不能把缺失、超时或失联直接翻译成“确定未发出”；需要原 writer 给出区分。旧功能保持原样，本模型不是对旧 Bool 的直接映射器。

## 拟议状态与身份

1. begin 仅当前 connected、非 closing、dictation thinking 的原 writer 和 FinalAsrProjection 原 receipt 可用。单轮最多一次写入 attempt，取得完整业务正文而非 8000 截取值；receipt/attempt/candidate/copy 均 opaque、冻结且不含文本。begin 只是准备，不授权实际发粘贴，不改 seq，不代表目标/focus 正确。
2. result 需原 attempt、原仍有效 writer，且只接受 preparing 的一次结果：
   - `issued` → paste-issued，清本模型正文，不提供复制，**不等于目标应用接受**，也不报告 inserted/accepted。
   - `not-issued` → copy-available，只有原 writer 明确确认未发出才创建候选；不自动复制。
   - `unknown` → paste-uncertain，清本模型正文，不提供可能造成重复输入的自动回退。超时/缺确认不自动触发此方法、不算停止证明；若真实传输需要发 unknown，仍须原 owner 证明归属。
   - 已发出/未知/可复制均不允许重新 begin 或修改终局结果，不补发、不自动发送回车。
3. requestCopy 要原 candidate，且测试显式 userInitiated=true；这是合成用户动作假设，不是可从 IPC 信任的授权字段。一次只允许一个 copy attempt；copyText 仅对原当前 copy handle 返回完整正文，不实际改剪贴板。
4. copied 需原 copy handle 和严格布尔 written：true → copied 并清本模型候选/正文；false → copy-available，但必须重新显式动作才重试，旧回调失效。clipboard 写成功也不等于粘贴或目标应用接受。无剪贴板返回/错误不得猜成功。

## 保留、取消与资源

- **不保留跨取消候选**：cancel/end/fail/disconnect/dismiss（含未来显式 expiry）后所有访问先复查身份，清候选、copy handle 与本模型正文；迟到 writer/copy 回调拒绝。已取得的字符串或已发出的粘贴无法撤回。pasteDisposition 保留已知 issued/not-issued/unknown 事实，不谎称取消已撤回粘贴；preparing/unattempted 仅表示模型未确认副作用，不证明 OS 未发生副作用。
- 模型无订阅，以上是方法调用时的**惰性清理**，不是即时安全擦除/真实取消。生产必须在取消、断连、锁屏、配置禁用和新入口处主动清候选、失效 UI 授权，且复制动作在写板前再次检查原身份。此批没有增加锁屏/系统观察器、定时器或后台保存。
- copy-available 的安全结果可以在原 session 内、ASR/writer 都已 stopped 后保留，等待显式用户动作；它不是资源 lease，但活动 run 仍占单槽。用户 dismiss/复制完成后需协调器显式 close/end，并等全部资源 drain 才接下一轮，不能凭复制完成自动放行。模型不自动结束会话；生产需定义有界候选寿命和主动过期 UX，不能无限挂起忙碌。
- 候选不跨 end 保留，这是提案的保守选择，不修改旧产品 endSession 后按钮回退；未来接线前必须显式适配并验收该差异。若要支持结束后候选，需要独立有界安全结果槽、明确清理/新入口/锁屏规则，不能复用已失效 final receipt。
- writer result/copy result/dismiss 都不释放任何资源，也不停止 ASR；writer 必须先给出业务结果再发 stopped，若 stopped 先到则旧业务回调拒绝。断连后停止证明仍通过原本地 owner。缺证明持续阻塞 restart，结果不替代 drain。
- 新 session/epoch（即便编号复用）清旧 attempt/candidate，旧 handle 不能复制新结果。一个 writer/copy attempt，不支持重试粘贴、并发剪贴板或跨设备队列。

## 验证与限制

`node --test test/dictation-outcome-model.test.mjs`

测试仅合成正文/本地 handles/Promise：默认关闭、原 receipt/writer、结果三分支与非法/未知结果、严格相邻阶段、一次性不补发、原 candidate/显式动作、完整非截取复制正文、失败后手动重试、四种关闭 × preparing/candidate/copying 共 12 个失效点、issued 后取消不撤回、stopped 顺序与原 run 保留、dismiss、跨 epoch 迟到、新结果不借旧 handle、旧 Swift 守卫事实、生产无导入与文档链接。实际测试与完整回归结果见 operatelog。

没有调用 insert/paste/NSPasteboard；userInitiated/written/issued 只是测试提供的假设，不是 IPC 身份或设备确认。未新增前端/原生运行代码，未重跑浏览器/Mac 构建或真实输入验收。仍未有统一最终状态投递 seq、主动清理、受限业务 IPC、系统副作用确认和锁屏/新入口生命周期实现。

## 下一步

离线合并验证 final-ready → preparing → issued/not-issued/unknown → 复制/关闭 → 全资源 drain → 新 run 的交叉轨迹，检查候选清理、停止确认顺序和统一单槽生命周期，而不是继续新增生产通道。随后再设计接入既有单一视图投递的方式；真实接线仍受 T0/T1 门槛约束，当前无需用户操作或授权。


## SC-20261114-010 组合验证

[听写生命周期矩阵](2026-11-14-dictation-lifecycle.md)已在不修改原模型的前提下交叉验证 144 条完整轨迹与 720 条乱序，包含资源先停/业务结果先到、两种 meter 模式和下一轮两模式。特别保留 outcome dismiss/issued 后 final-ready 独立投影仍活跃的事实：本模型只清自己的候选，不是全局字幕清理/写入授权器。下一步只读展示选择契约，真实接线和 T0/T1/G1～G6 验收状态不变。
