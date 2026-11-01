# 固定镜头动态样片验收

日期：2026-10-30。用户已同意先验证没有缩放的动态主体，本轮只做独立样片，不安装进现有 Mac 客户端。

## 实现

源代码位于 `client/scene/prototype/`。机械核心采用有厚度的 LatheGeometry 倒角金属带、ExtrudeGeometry 面板、实例化刻度、灯条及玻璃式发光边轨。五组环的转速、方向和轴向各不相同，并具有小幅轴向进动。

核心由 48 条真实三维 TubeGeometry 光丝组成；亮度脉冲沿曲线流动，同时独立转动。另有三维细网及 1600 个体积光点。没有使用原始主体照片、球体照片、主体平面或整图 UV 扭曲。粗糙度、光点材质为程序材质。

底盘、扫光、星球及星点复用已有真实三维环境模块。静态房间来自 environment-v5.png，其中没有画死的中心核心、圆形底盘或星球。照明、环境反射及有限 bloom 为实时渲染。

## 验证

- 相机 position=(0,0,6.1)、rotation=(0,0,0)、FOV=42、zoom=1，主体整体 scale=(1,1,1)。没有鼠标跟随、滚轮缩放、CSS 呼吸缩放和音量缩放。
- 浏览器最终自检：PASSED，moving=true、cameraLocked=true、pausedFrozen=true、wireframeRuns=true、rings=5。
- 关闭机械环后，核心光丝、底盘与星球仍可单独显示。线框模式使用独立调试材质，移除光晕、禁用 bloom，直接显示真实网格。
- 线框初检发现替换材质后光丝 uniform 更新中断的问题；已将光流时钟与显示材质分离，增加线框期间 update/diagnostics 测试并复测。最终浏览器日志没有警告或错误。
- 全部 46 项 Node 测试通过；上述修正后相关 2 项模型测试再次通过。测试验证固定相机下标记点投影确实变化、金属带具有轴向厚度、五组角速度不同、整体比例不变、暂停所有层冻结，以及线框/分层保留同一组模型。
- 实录为 `docs/qa/jarvis-fixed-camera.mp4`，另有 WebM。时长约十秒，录制标签直接读取实际 camera.position.z、camera.zoom 和模型 scale，录制过程没有移动镜头。

## 复现与证据

构建：`python3 client/scene/prototype/build.py`，仅生成 `dist/fixed-camera-study`。可用本机 HTTP 服务打开 `study.html`。当前预览：http://127.0.0.1:59533/study.html。

正常画面：`docs/qa/fixed-camera-study.jpg`；实际结构：`docs/qa/fixed-camera-wireframe.jpg`；关闭机械环的分层画面：`docs/qa/fixed-camera-plasma-only.jpg`。

本轮未修改生产渲染入口或已安装应用；Mac 客户端仍为 0.6.0 / build 10。没有调用模型、麦克风或 Fish，不读取或改变用户密钥、聊天记录、微信服务和 Codex 任务。

这是运动验证样片，精细模型、体积光、反射与参考图的摄影质感仍有差异；尚未将此样片合入客户端，也未声称已完成参考图同精度的最终美术制作。
