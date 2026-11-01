# 原设计图动态样片 v3 QA

## 比较目标与范围

Source visual truth: `docs/qa/reference-target-v6.png`，1672 × 941。
Implementation: `http://127.0.0.1:59533/study.html`；本轮是独立视觉样片，未替换 Mac 客户端。
Implementation screenshot: `docs/qa/reference-projection-v3-final.jpg`。
Full-view comparison: `docs/qa/reference-projection-v3-comparison.jpg`。
Focused comparisons: `docs/qa/reference-projection-v3-core-comparison.jpg`、`docs/qa/reference-projection-v3-type-comparison.jpg`、`docs/qa/reference-projection-v3-dock-comparison.jpg`。

源图 1672 × 941，浏览器 CSS viewport 1280 × 720，截图输出 1280 × 720 JPEG。参考图也通过相同视口的 cover 投影捕获为 `reference-projection-v3-target.jpg`，再并排比较相同大小；不将截图压缩、密度和浏览器视口裁切差异误判为字体问题。首帧状态由 `?still=1` 固定为 time=0、14:48、默认欢迎内容、模拟聆听。动态状态另用实录及状态数据验收。

## 修正历史

- [P1, resolved] v2 程序材质导致空心球、稀疏细环和摄影式参考显著不同。改用选定截图的主体像素作为 14 个独立曲面网格的投影材质；原图 UI 区域由既有清理素材填补，再由真实 HTML 显示。保留原始细节和颜色。
- [P1, resolved] 首次投影旋转把球体底部像素卷入底盘，形成大块亮色碎片。增加源球体区域遮除、限制角度并在网格交界混合固定投影；平台保持其倾斜平面。动态实录重新录制。
- [P2, resolved] 球壳片段接缝和中心光丝出现过强扭曲。边界混合、低幅独立相位、缩小核心 UV 位移与偏转，保持图中完整轮廓。
- [P1, resolved] 样片原先是调试页，缺少原图的品牌、正文、项目、近期对话和控制条。恢复原图页面结构，调试控件移入设置。
- [P2, resolved] 1280 视口控制条过宽、正文偏下。宽度由 345 调至 330px（参考约 329px），高度 52px（参考约 52px）；正文上移并校准字体。
- [P1, resolved] 新图标资源路径改变后没有应用颜色滤镜，图标呈黑色。修正选择器；最终截图再次复核。采用带许可证的 Lucide 官方 SVG。
- [P2, resolved] 对照图关闭设置后缺乏返回入口。加入可见“返回动态页面”与 Esc 返回，并验证。

## 必查表面

- Fonts / typography：真实 HTML 文本。正文 Songti SC / STSong、桌面 32px 附近，1280 视口约 24.6px，1.5 行高；标题系统中文字体，22px / 紧凑 17px；副标题字距与灰蓝颜色按参考校准。生成图没有字体源文件，极细的字形差异保留为 P3。
- Spacing / layout：主场景按 1672 × 941 原图投影；字幕在 69.1% 高度附近，控制条位于下方中央；项目和历史固定两侧。1000px 以下收起两侧示例信息，避免窄窗遮挡主要控件。窄窗 cover 裁切为响应式行为，不据此判断与宽屏设计的保真度。
- Colors / tokens：机械壳、核心、底盘、星球直接取参考图原色，不使用 ACES 重调。被擦除 UI 的背景使用既有无字素材并校准底部明暗。白蓝文字、低对比灰蓝辅助文案、蓝色麦克风光晕沿用参考。
- Image quality / assets：原图主体按参考 UV 映射，初始帧几何投影由测试确认；没有使用整页截图充当可点击控件。相机和整体 scale 恒定，物体网格分别变化；不能据此声称完整背面和任意视角建模。图标来自官方 Lucide，品牌 PNG 复用既有资产。
- Copy / content：欢迎语、称呼、项目和近期示例文案按参考。正式预览显示真实时间；静态 QA 固定 14:48。聆听、文字输入、名称与唤醒词均为视觉预览交互，设置中明确说明不采集语音、不连接模型、不读取真实聊天。

## 交互、代码与动态证据

代码完整测试 47 项通过；最终数值校准后 3 项投影模型测试再通过。新增测试验证 14 层源 UV 与参考像素对齐、真实表面点移动至少 5 个参考像素、主体 scale 恒定、相机不变、平台仍在原倾斜平面、暂停冻结与线框继续更新。

浏览器检查记录：`docs/qa/reference-projection-v3-observed.json`。moving / cameraLocked / pausedFrozen / wireframeRuns 均为 true，layers=14，结果 PASSED；控制台未见 warn / error。实际打开设置、文字输入和对照模式，测试返回按钮。十秒场景实录：`docs/qa/jarvis-reference-v3.mp4`；录像仅包含场景画布，未把静态设计图对照层录成动画。动态截图：`docs/qa/reference-projection-v3-moving-final.jpg`。

## Follow-up / P3

- 生成图的中文细微字形、图标轮廓和光栅抗锯齿不能承诺逐像素相等。
- 这套方案使用单视图照片投影，能保持指定视角外观和局部真实网格运动；并非完整可任意环绕的三维重建。
- 预览中的名字和唤醒词只在当前页面演示，不覆盖正式客户端的加密配置。正式客户端仍为 0.6.0 / build 10，语音、模型、微信和聊天存储均未改动。

## Checklist

- [x] 原图与浏览器实现以相同尺寸比较。
- [x] 整页与核心、文字、控制条局部复核。
- [x] 修复底盘卷入球体和分层边界扭曲。
- [x] 主要控件可打开、关闭、返回。
- [x] 固定相机、暂停和线框验收。
- [x] 留存实际场景录像与日志。

final result: passed

最终并排整页与核心、正文、控制条局部均已打开复核；未留下 P0/P1/P2 视觉或交互问题。保留以上 P3 差异和单视图投影限制。最终浏览器结果 PASSED，日志为空；MP4 时长 9.93 秒。
