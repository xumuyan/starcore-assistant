# processing 后最终识别展示契约 · SC-20261114-008

## 状态与选择

本批仅离线定义契约并用默认关闭的 `test-helpers/final-asr-projection.mjs` 验证。采用**独立投影**：不把 processing 后结果重新标成 listening transcript，不修改 `voice-view-state.mjs`、协调器模型、React 或原夹具。旧 reducer 在 process 后拒绝 transcript 的断言继续通过；真实最终识别展示仍未实现。

T0 未验收、T1 未启动，G1～G6 仍未验收。本批不订阅服务、不启动录音/播放、不修改真实数据、不申请权限、不安装/替换应用；保持 Tauri 2 + Rust + React，当前不需要用户操作或授权。

## 来源与结果语义

现有 `src/assistant-dictation.mjs` 在 finish 等待串行 ASR tail，拼接文本，并可完成润色或回退原文之后才发 dictationResult；没有增量 ASR。`client/DictationController.swift` 仅 processing 接受结果后进入 inserting，把同一完整字符串交给 writer。**本契约的 final 是一次最终业务结果（可能已润色），不是原始声学 ASR 的单个分块，也不虚构增量来源**。原始识别块、润色中间值与最终业务值的多版本展示不在本批范围。

现有 Node `usable` 使用上限 16000 UTF-16 code units 和字母/数字、排除 none 检查；Swift 的 `text.count <= 16000` 则是扩展字素数量，不应称为同一长度单位。本提案遵守 Node 更早的 16000 UTF-16 边界（不修改任一旧实现），额外显式拒绝不成对 surrogate；是否在受限业务 IPC 统一该校验待后续实现。

## 拟议边界与规则

| 边界 | 必须满足 / 禁止推断 |
| --- | --- |
| 入口 | 测试显式 enabled=true；模型 connected、当前 dictation session、view active/thinking、非 closing；capture 停止与 process 仍由原协调器单独确认 |
| final 接受 | 原当前、仍持有的 ASR ticket；不可用复制对象、writer、未知/旧 run 补贴当前身份；payload 的 run/seq/mode 不作为身份 |
| 一次性 | 同一 session 只接受一个有效 final；重复或修订拒绝，非法结果不占接受槽；不声称支持增量/多版本润色 |
| 字符串校验 | 完整业务结果必须是 well-formed Unicode、≤16000 UTF-16、有字母或数字且 trim 后非 none；空/标点纯表情/超长均拒绝，不静默截成业务有效值 |
| 展示投影 | `activity=final-ready`、`text`、`truncated` 冻结值；上限 8000 UTF-16，按 Intl.Segmenter grapheme 边界截取，不切开 emoji、ZWJ 家庭、旗帜、组合音标；单个 grapheme 超过剩余额度则不包含它，不在后面跳选更短字符 |
| 截取提示 | truncated 独立布尔值；展示字符串不拼省略号，不把提示混入正文。空前缀亦可能是合法超长单字素结果的展示，不可因此丢弃业务正文 |
| 业务分离 | 内部保存完整最终业务字符串，不 trim/normalize，不读取可变调用者对象；opaque receipt 无文本。writerText 需要原 receipt 和当前原 writer ticket，只返回完整正文，不读展示截取值 |
| writer 边界 | 取得正文不等于写入成功、复制成功或写入授权；没有 insert/paste/copy 调用，没有自动回车/补发。真正 writer 仍需 requestID、目标/focus、时序及显式复制守卫 |
| 资源边界 | 接受 final 不释放 ASR；ASR 的 stopped 若先于 final 则旧 ticket 不可再投递。先接受再释放不抹掉本轮已接受结果，但仍需原 writer。ASR/writer 停止确认继续由原协调器处理；结果/receipt 不作为资源 drain 证据 |
| 关闭 | cancel/end/fail/disconnect 后任意 snapshot/accept/writerText 都先重新检查原 session 状态，拒绝迟到结果/正文访问并返回 hidden；缺停止证明仍不能 restart |
| 新轮/实例 | session 原对象变化即清旧投影/receipt/正文；即便 run/operationId 数字或字符串复用，也不能复用旧 receipt 或 ticket |

### 明确尚未实现的部分

这是测试内候选状态，不分配 seq、不修改 reducer 的 thinking、不会引发 speaking/录音恢复。旧 meter 规则与 cancel 水位不变。投影快照不含完整长正文，错误与验证附件也不记录载荷。

此对象不订阅模型，关闭后的内部旧引用只在下一次方法调用进行**惰性清理**；不是即时清内存/安全擦除、后台订阅或真实取消，也无法撤回调用者已取得的字符串。生产接入必须在取消/断连入口主动清投影、失效写入授权与订阅；所有异步 writer 还需在发出粘贴前再次检查原 requestID 和 focus。复制回退不能用已失效的活动 receipt 偷渡，必须另定显式用户动作、候选结果保留/清理与安全边界。

对象身份仅模拟本地可信来源，不能序列化为 IPC 认证。`final-ready` 尚无 React 布局、提示文案或统一投递序号；协调器 counter 耗尽也不会因投影绕过而恢复容量。未来受限 final 投递通道、UI 状态与取消顺序必须一并设计并验证，不能把本模型当成已经修复 G4/G5。

## 验证

`node --test test/final-asr-projection.test.mjs`

仅合成字符串、原模型 handles、Promise 与临时测试对象：默认关闭；preparing/listening/conversation/错误角色拒绝；processing final 独立于 seq/reducer；7999/8000/8001/16000 边界、16001 拒绝；grapheme 安全截取、原文保留；一次性与可变 payload；原 writer/receipt；四种关闭方式均保持资源门闩；ASR 先/后停止；Promise 迟到跨 run；新 epoch 复用编号；生产目录无导入；文档/计划证据链接。

实际专项、相关和全回归结果见操作日志。未改前端/原生运行代码，未做新浏览器、原生构建或设备验收，不以历史 UI 截图代替此契约的实际显示验收。

## 下一步

先离线定义 final-ready → 准备写入 → 已发出粘贴/可显式复制/失败/取消的独立结果契约及取消后的复制候选保留规则，尤其区分“已发出”与目标应用实际接受。再决定怎样接回单一视图投递和独立展示槽，避免新增第二套计时器或直接转发旧事件。真实接线仍遵守 T0/T1，当前无需用户操作或授权。


## SC-20261114-009 后续写入结果提案

[默认关闭的写入结果/显式复制模型](2026-11-14-dictation-outcomes.md)已离线定义：原 receipt/writer/attempt，issued 不等于目标接受，仅确定 not-issued 创建本 run 内复制候选；cancel/end/disconnect 清候选，不借旧 receipt 跨会话复制。结果/复制不释放 lease，不修改本 final 模型或旧产品。下一步交叉生命周期矩阵，G1～G6 仍未验收。
