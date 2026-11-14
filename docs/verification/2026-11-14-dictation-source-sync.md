# 通知源失联与重新同步握手 · SC-20261114-017

## 范围

新增默认关闭、仅测试导入的 DictationSourceSyncModel，私有持有原 event-order 模型；原 event-order/lifetime/transitions/内部模型/selector/frame/reducer/夹具/全部产品代码不修改。无系统通知、网络、心跳/定时器、服务、剪贴板/输入、音频、权限、配置或安装变更。T0 未验收、T1 未启动，G1～G6 仍未验收。

## 显式状态与本地所有权

- 初始 offline，未报告活跃源即阻止普通工作。beginAt(now) 仅在 offline 接受，推进原逻辑时钟后生成当前原冻结 query token，进入 syncing。它只模拟这次连接/状态查询的所有权，**不是系统认证**、transport connection 或真实查询证明，不包含业务正文。
- receiveAt(now,token,{kind,epoch,channel,version,value}) 只接受当前原 token。kind=snapshot 才标记对应通道 fresh，kind=update 仍交原模型做版本验证和状态限制，但不替代本次查询快照。必须 lock/settings 两路均成功接受 snapshot 才进入 ready；ready 仅代表观察了两路，不等于已解锁/启用、语音在线、版本有容量、资源已 drain 或输入设备已准备。
- 继续使用原每通道严格递增的生成版本：重新同步快照也须 > 已观察高水位，不清零、不同 token 不绕过，最大版本饱和仍阻止工作。源需在真实一致性查询时生成新的完整快照版本（不能仅转发缓存、随意打 snapshot 标签）；握手是可信本地合成前提，测试不证明查询线性化或实际系统当前值。若新 update 先到，较低 snapshot 被拒绝，必须再取更新版本，不能用旧快照强行完成。
- lostAt(now,currentToken) 在合法时间先检查原截止，随后立即撤销 token/fresh、变 offline，并 close(cancel) 当前 run。它不调用 voice disconnect，不捏造 capture/ASR/writer stopped，不重置原 source 高水位/逻辑时间或业务版本；语音服务仍可能 connected，外层离线门闩独立阻止 reserve。
- offline/syncing 仅开放 close/disconnect/released/hide/dismiss 清理，原 handle/严格 stopped 校验保持；begin/快照不等待 drain，允许查询与资源停止并行。但普通业务必须 ready + 两路允许 + 原服务 connected + 原会话已 close/drain；下一 run reserve 仍隐藏，须独立 inputReady。copyText/candidate 在非 ready 不返回旧候选；旧 copied/receipt/attempt/frame 不借新 run。
- lostAt 的旧/复制 token、receive 的旧/复制 token/错 epoch/kind/旧版本拒绝，不推进逻辑时间或消费源版本。重复失联回调不误伤新连接。beginAt syncing/ready 不隐式轮换 token；要先显式 lost，避免无效新连接吞掉当前所有权。第二次失联使部分 fresh 失效；再连接必须再次获取两路新快照，即使原值仍为允许。
- 成功 voice restart 改变 epoch 后撤销 query token，必须重新同步两路。restart 是普通工作，offline/syncing 阻止它：若通知源和 voice 都失联，先恢复源快照得到 ready，再在 drained 后 restart voice，再为新 epoch 同步。不同源/voice 状态不以彼此成功代替。
- 不新增外层统一 revision。连接 phase/fresh/token 的变化不等于展示 revision；lost 中 close 才由原入口使帧失效。所有时间仍显式传入，sample/commit/snapshot 不前进时间，不是主动 DOM 更新/安全内存清零。

## 验证

新增专项检查默认关闭、初始/单快照/updates 不放行、保留原模型无失联 API 的反例、六阶段失联（reserved/listening/preparing/candidate/copying/copied）、旧/伪造 token/重复失联/错误 epoch、更新先于旧查询、部分握手再断开、版本耗尽及原 lease 清理、复制迟到 Promise、voice disconnect/restart/新 epoch、source 饱和不复位、生产无导入。

其中 **48 条**轨迹：即时/合并 meter 配置 × lock snapshot/settings snapshot/原 ASR stopped/原 writer stopped 的 24 排列。逐前缀以四个独立布尔推导 phase 与原 session drain，缺任一条件不放行；双快照不释放资源、stop 不生成 fresh，最终 reserve 仍隐藏且不假冒 inputReady。相关与全量实际结果见 operatelog，模拟不是硬件证明。

## 明确未解决

**静默失联**且没有 lostAt 就不可知，测试保留“ready 仍可工作”的反例；本模型没有 liveness detector、可信系统查询、超时心跳、丢包恢复、IPC/源身份认证、传输顺序或副作用前原生复查。token 只防旧本地 query/callback 混入，并不证明 snapshot 在 begin 以后实际获取，不证明恶意 getter/Proxy/重入/异常恢复安全。源未到达的新锁屏依然不可推断。

关闭不是实际停止/撤销；复制在途时 OS 可能已经写入，后来拒绝 completion 不是没复制的证明。已返回正文不可撤回，原模型仍为后续方法重查清理，非全局删除。跨结束回退 UX、真实权限/热键/录音/播放/焦点/输入仍未验收，本批不做新浏览器/前端/原生构建或真机测试。

下一步离线明确通知源的逻辑活性期限（无自动 timer）与真实副作用前状态复查的契约，先检验丢通知时如何从 ready 失效、续期是否有可信新证据，不直接接系统服务。当前无需用户操作或授权，生产接线仍受 T0/T1 门槛。
