# 设计图方向样片 v2

日期：2026-10-30。根据用户要求继续朝选定设计图靠拢，本轮仍修改独立样片，没有覆盖已安装 Mac 客户端。

## 本轮变化

- 由稀疏细环改为七层主壳与两条纤细轨道，共九组独立运动；增加宽面、台阶、透明护片、曲面分片和细密表面网络。
- 以原图轮廓修正横向轨道的倾斜方向及压平程度，调整竖环的高度和中心位置。
- 核心增加随时间变化的三维发光体积，使用 28 步射线积分；原有光丝仍为三维曲线。中心降低白色热斑、增强蓝色体积层次。
- 新机械材质映射到实际环形网格，纹理随各环运动。内置 imagegen 的最终素材及提示词见 `docs/design/mechanical-material-v2.md`。
- 底盘加入低强度实时反射；反射使用虚拟镜像相机，主观察相机保持固定。
- 页面提供“对照设计图”开关，明确切换原设计场景与实际三维渲染。录制自动关闭参考层。

## 验证与证据

46 项代码测试通过；最终几何参数微调后，相关 2 项模型测试再通过。浏览器最终结果为 PASSED：moving=true、cameraLocked=true、pausedFrozen=true、wireframeRuns=true、rings=9。日志未见警告或错误。默认相机位置、FOV、zoom 和主体整体 scale 未改变，运动由模型各层实现。

实际画面：`docs/qa/design-direction-v2.jpg`；同视口参考：`docs/qa/design-direction-reference.jpg`；并排比较：`docs/qa/design-direction-compare.html`；实录：`docs/qa/jarvis-design-direction.mp4`（十秒实际渲染）。

预览：http://127.0.0.1:59533/study.html，勾选“对照设计图”可切换。并排页面：http://127.0.0.1:59533/design-compare.html。

这是向设计图方向收拢的一轮模型和材质迭代，不代表原生成图的完整三维复建。透明层、摄影式照明和机械细节仍存在外观差异。仍未合入 Mac 客户端；其版本保持 0.6.0 / build 10。没有修改语音、模型 API、密钥、聊天记录、Codex 投递或微信服务。
