# 图标白边适配 · v4

源图：`client/assets/AppIcon-v4-fullbleed.png`。
原生资源：`client/assets/StarCore.xcassets/StarCoreAppIcon.appiconset`。
生成方式：内置 image_gen 编辑 v3 图标；没有使用用户 API Key。

旧 PNG/ICNS 没有实际白色外框，但带有透明留边和预制圆角。新图使用完整不透明深蓝背景，交给系统遮罩；actool 编译 Assets.car，并合并输出的 CFBundleIconName / CFBundleIconFile。旧图保留。

用户已明确同意 Icon Composer 的 Apple 许可。界面控制持续超时，无法确认点击结果，因此未声称已完成许可接受；实际打包使用 Xcode 的 actool 资源编译器。

规范依据：[Apple App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)。工具参数依据本机 `man actool`。

## 最终提示词

Use case: precise-object-edit. Edit the supplied existing app icon for correct modern macOS icon packaging. Preserve the central luminous blue energy sphere, both asymmetric mechanical orbital rings, all three blue connection nodes, their exact relative arrangement, scale, colors and design. Change ONLY the icon background/container treatment. Remove the rounded-square tile boundary, its bevel, outer rim, drop shadow and all transparent padding. Extend a continuous opaque deep midnight navy background to ALL FOUR edges and ALL FOUR CORNERS of a perfectly square image. This is a FULL-BLEED UNMASKED source layer for Apple's system to mask later, NOT a finished rounded-square icon mockup. Background must be dark blue right up to the outermost pixels, no white, no gray frame, no inset outline, no border, no margin, no alpha transparency, no rounded corners. Keep the sphere and rings centered with the same generous safety margin around the foreground subject so the macOS corner mask cannot crop any node. Do not enlarge the foreground to fill the entire canvas. No text, no logo additions, no new objects. Output a single flat 1024x1024 square source artwork with opaque edge-to-edge navy color.

## 构建与系统实测

版本 0.6.6 / build 16，安装到 `~/Applications/星核助理.app`，严格签名校验通过。actool 生成 Assets.car、StarCoreAppIcon.icns 与图标元数据，CFBundleIconName=StarCoreAppIcon。原始满版 PNG 为 1254×1254 RGB，全部尺寸经 sips 转换为原生 asset catalog 输入。

在 Finder 简介的系统预览中实际观察：旧版有明显浅灰色外底板，新版只显示深蓝外沿，白边消失。证据为 `docs/qa/icon-system-before.png`、`icon-system-after.png`，局部并排 `icon-system-comparison.png`。图片对照只裁剪原生系统截图，没有把生成图冒充系统渲染。旧版备份 `dist/backups/星核助理-0.6.5-15.app`。未修改聊天、声音、目标和密钥配置。
