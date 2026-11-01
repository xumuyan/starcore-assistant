# 原图投影资产

- 视觉基准：`docs/qa/reference-target-v6.png`，1672 × 941。
- 场景材质：直接使用 `docs/qa/reference-target-v6.png` 中不含 UI 的主体像素，分配到五层曲面球壳、一个核心、四层倾斜底盘和四个星球网格，保留原图颜色。
- 清理素材：复用既有 `client/hud/jarvis-scene-v3.png`，1672 × 941；只填补参考截图原有文字和控件区域的背景。截图中的 UI 均被遮除，再由真实 HTML 显示。
- 空环境：复用 `client/hud/environment-v5.png`，填充分层对象移开后的背景区域。
- 品牌图标：复用 `client/hud/jarvis-mark-v6.png`。
- UI 图标：官方 Lucide 仓库 `https://github.com/lucide-icons/lucide/tree/main/icons` 中的 mic、keyboard、settings、clock、file-text、cloud、chevron-right。下载到 `client/scene/prototype/icons/`，保留 `LUCIDE-LICENSE.txt`。仅覆盖样片输出的 `reference-icons/`，不改生产 HUD 图标。

这一轮没有生成替代的整幅概念图，没有将参考截图的 UI 文字光栅化成应用控件。正文、时间、名称、状态和控件仍为 HTML。单视图投影依赖原图已经画好的光影，不能用于任意视角查看；这与完整建模、重新打光的三维场景有明确区别。
