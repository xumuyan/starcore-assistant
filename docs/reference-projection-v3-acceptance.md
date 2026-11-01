# 原图方向动态样片 v3 验收

本轮只修改 `client/scene/prototype/`、新增模型测试及相应设计/QA 证据，没有覆盖 Mac 原生客户端。

实现使用原设计图中不含 UI 的主体像素作为分层三维投影材质，既有无字素材只清理背景中的原 UI。五层曲面球壳、一个核心、四层倾斜底盘和四个星球分别运动，外部轨道光点与星辰另行更新；镜头、整体比例不随时间改变。名称、唤醒词、字幕与控件是真实 HTML。当前页面的语音与输入为状态预览，不请求麦克风或聊天 API。

完整测试 47 项通过；最终修改后投影模型 3 项测试再次通过。浏览器最终 PASSED，moving/cameraLocked/pausedFrozen/wireframeRuns 均为 true，layers=14，warn/error 日志为空。

- 同视口最终截图：`docs/qa/reference-projection-v3-final.jpg`。
- 原图/实现并排：`docs/qa/reference-projection-v3-comparison.jpg`。
- 动态截图：`docs/qa/reference-projection-v3-moving-final.jpg`。
- 十秒实际场景录像：`docs/qa/jarvis-reference-v3.mp4`（9.93 秒，仅场景画布）。
- 完整 QA：`design-qa.md`，结果 passed。
- 素材来源与许可：`docs/design/reference-projection-v3-assets.md`。

预览 `http://127.0.0.1:59533/study.html`；设置内可对照原图、暂停、查看线框并录制。`?still=1` 仅用于固定时间和首帧的截图比较。

这是一套指定视角的原图分层投影方案，保留摄影式外观，支持实际曲面网格运动；不等于拥有参考图完整三维模型或任意视角。生成图的字体字形与图标轮廓仍有细微差别。正式 Mac 客户端维持 0.6.0 / build 10，语音、模型密钥、微信、Codex 投递和聊天加密存储没有修改。
