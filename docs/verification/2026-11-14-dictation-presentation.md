# 听写单一只读展示选择契约 · SC-20261114-011

## 范围

新增仅测试导入的纯函数 `selectDictationPresentation`，默认 enabled=false，输入一次本地同步采样帧，返回唯一冻结展示对象。不修改前三个模型、reducer、React、夹具或产品源，不新增生产事件/IPC 通道；不操作剪贴板、不发系统输入、不连接真实服务/录音/播放、不安装或替换应用。保持 Tauri 2 + Rust + React。T0 未验收、T1 未启动，G1～G6 仍未验收。

本批落实的是**候选展示选择规则**，不是运行中界面的修复。没有新浏览器、原生构建、设备或动画验收，前端仍未使用本函数。conversation 返回 hidden 仅表示不归本听写选择器处理，不能拿它替换或隐藏原对话 UI。

## 输入与输出

输入 `{ enabled, coordinator, final: { session, value }, outcome: { session, value }, dismissedSession }`。coordinator 来自原模型 snapshot，两个包封由可信本地调用方在同一个同步步骤从相同原 session 的原模型采样后组装，**不能把迟到值补贴当前 session**。processing 阶段两个包封 session 必须与 coordinator.session 原对象一致，epoch/run/view/mode/phase 也要匹配；不满足时 hidden，不能回退到“处理中”掩盖混合帧。

session 包封不认证 IPC，更不证明当前**同 session 旧快照**是否已经过时；调用方把历史值重标身份时，纯函数无法识别。冻结快照不会自动更新，也没有统一 revision/seq，本函数不能替代生产受限投递、主动取消、订阅清理与一致性保证。

输出仅 `{ status, text, truncated, level, showOrbs, canCopy }`：不输出原 session、receipt、candidate/copy/writer handle 或业务全文。text 只能来自 ≤8000 UTF-16 且 well-formed 的既有展示投影，不再次截取、不 trim/normalize；不解析 HTML，未来仍须 React 文本转义。不输出可执行动作，canCopy 只作显示提示，**不授予复制权限**；必须另取原 candidate 经真实显式动作校验。

## 单一状态优先级

从上到下选择一个状态；除了 listening，其余 level=0，只有 thinking 的 showOrbs=true。

| 条件 | status | 正文 / 操作 |
| --- | --- | --- |
| 默认关闭、未 connected、closing、无 session、未 active、非 dictation/身份不符、当前 session 已显式 dismiss | hidden | 空，无 orbs/复制 |
| 有效 listening | listening | 仅 reducer 的收音快照与 input level；不读取 final/outcome，非真实录音证明 |
| 有效 thinking，原 final 隐藏，原 outcome hidden/unattempted | thinking | 空正文，orbs；不沿用之前 listening 文字 |
| 同上但 final-ready | final-ready | 最终展示正文与 truncated；撤去 orbs |
| outcome preparing + final-ready | preparing | 最终展示正文与 truncated，无 orbs、不可复制 |
| outcome paste-issued + final-ready | paste-issued | 空正文，仅语义状态；不报告目标接受 |
| outcome paste-uncertain + final-ready | paste-uncertain | 空正文，仅语义状态；不自动回退 |
| outcome copy-available + final-ready | copy-available | 展示最终正文，可提示显式复制 |
| outcome copying + final-ready | copying | 展示最终正文，不允许重复提示复制 |
| outcome copied + final-ready | copied | 空正文，仅语义状态；不报告粘贴接受 |
| 不合法/不一致的 final/outcome 值或 writer 分支却无 final | hidden | fail closed，不补造 final |

终局状态即使 reducer 仍 thinking，也不同时显示“处理中”。展示正文可为空但 truncated=true（首 grapheme 超长），此时仍选择 final-ready/相应 writer 状态，不误当无结果回退 orbs。issued/unknown/copied 的空正文只是**本输出不展示**，不是删除 FinalAsrProjection 的完整正文，也不是撤回已取得的字符串。

本批只定义语义枚举，不规定最终中文标题、动画、卡片布局或可点击原生按钮；copy-available/copying 缺误配的 canCopy/copying/disposition 会隐藏，其他未知结果如 inserted/accepted 不被接受。

## dismiss 与 close

原 outcome.dismiss 后 hidden/unattempted 可能与“从未 begin”完全一样，尤其 preparing 阶段；单纯读取三个旧 snapshot 无法还原该历史。为避免引入猜测和隐藏的新历史，调用方需保留原 session 的 **dismissedSession**，表示本轮展示已被用户关闭。纯函数不拥有它、不改变模型，不把 dismiss 自动当 end 或 stop。该标记贯穿本轮不能悄悄清除，下一轮原 session 变化后自然不匹配；生产主动管理尚未实现。

若 outcome hidden 但 pasteDisposition 非 unattempted（终局后 dismiss），即使调用方遗漏 marker，也返回 hidden，不复活 final。preparing dismiss 若漏 marker 则仍会选 final-ready，测试明确固定此限制，而不是声称本模型自行阻止全部复活。复制对象的 marker 不等于原 session，不能作为可信取消证明。

close/cancel/fail/disconnect 优先于所有保留值，访问当前 coordinator 后立即选 hidden；缺 stop 时资源门闩仍维持。dismiss 只改可见选择，既不删除正文、不释放资源，也不开放下一轮；真实生命周期仍要显式 close 与 drain。所有输入若整体都是旧快照，函数也无法得知后来发生 close，生产调用方必须先取最新可信生命周期。

## 验证与下一步

`node --test test/dictation-presentation.test.mjs`：真实三个模型合成状态串联，默认隐藏/listening/thinking/final/preparing/三结果/复制失败重试/完成；空截取、dismiss marker 与遗漏反例；四种关闭、新 epoch 和旧包封、畸形组合/非法 Unicode、只读稳定与无业务 handle、生产无导入及文档链接。相关与完整回归实际结果见 operatelog。

下一步离线交叉验证**一致帧采样和 dismissal 生命周期**：调用者在原 owner 回调后采样、关闭优先、跨 run 清 marker，明确如何拒绝同 session 旧 revision，避免仅包封相等就误判新鲜。仍不新增生产通道或改变旧 reducer；真实接线继续受 T0/T1 门槛约束，当前无需用户操作或授权。


## SC-20261114-012 一致采样与投递

[一致帧模型](2026-11-14-dictation-frames.md)新增测试内单槽原 token、采样 revision、commit/snapshot 复查原状态与本轮 dismissal marker 生命周期；不改变本 selector 或三个旧模型。关闭后下次方法访问隐藏，但不是主动订阅/立即 DOM 卸载；同值 ABA 没有逐转换 revision 仍可能接受，不冒称所有同 session 历史重放已解决。下一步唯一转换入口/逐转换 revision，真实服务/前端接线仍未启用。
