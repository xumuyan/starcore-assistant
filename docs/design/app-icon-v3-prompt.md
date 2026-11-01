# 应用图标 v3

生成方式：内置 image_gen；未使用 CLI 或用户 API Key。

最终素材：`client/assets/AppIcon-v3.png`。参考图仅用于风格，不复制界面文字。保留真实透明通道；ICNS 各尺寸由 macOS sips/iconutil 转换。

## 最终提示词

Use case: logo-brand.
Asset type: a single polished macOS application icon, square 1024 x 1024, real transparent pixels outside the icon tile.
Primary request: redesign the icon for a personal AI assistant app, inspired by the blue mechanical energy core in the supplied reference. The assistant connects voice, computer tasks and messaging, with future smart speaker support; express this as one coherent intelligent core, not a collage of app logos.
Input image: style reference ONLY. Ignore and do not reproduce its interface, typography, room, floor or screen layout.
Subject: one luminous electric-cyan spherical core, surrounded by TWO beautifully resolved asymmetric orbital rings of blue glass and dark polished metal. One near-vertical ring and one sweeping diagonal orbit. Three tiny light nodes along the orbits suggest connected devices. Keep the sphere and rings bold, visually simple and distinctive at 32-64 pixels. Suggest an intelligent voice companion through the core's subtle inner light filaments, no literal microphone necessary.
Scene/backdrop: a deep midnight-navy rounded-square macOS icon tile, softly beveled with restrained dimensional lighting. Tile occupies about 86% of the square canvas, centered with even transparent padding, gently rounded macOS-style corners and a soft close shadow. The tile itself is opaque navy; outside it must be genuinely transparent.
Style: premium restrained cinematic 3D app icon, crisp silhouette, clean sculptural geometry, luxurious optical glass highlights, luminous but controlled. Blue/cyan primary, a few tiny warm amber highlights. A bright defined center without a blown-out white blob. Sparse detail and broad legible forms rather than many tiny gears or wire meshes.
Composition: single centered frontal icon, no perspective mockup, no devices, no surrounding UI, no grid or alternate options.
Text: none. No letters, no app name, no word JARVIS, no badges, no numbers, no watermark. No Iron Man helmet, no copyrighted superhero emblems, no WeChat or other product logo.

## 打包与应用

图像实际尺寸 1254 × 1254，RGBA，alpha 范围 0–255。保留原始 PNG，sips 转为 macOS iconset 全部尺寸，iconutil 生成 ICNS；64px 图标已检查。构建版本 0.6.4 / build 14，严格签名校验通过，已安装并重新打开。安装包中的 ICNS 与构建结果 SHA-256 一致。旧版包备份位于 dist/backups/Codex 微信提醒-0.6.3-13.app；原 AppIcon-v2.png 未覆盖。
