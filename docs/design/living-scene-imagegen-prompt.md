# 动态场景背景素材

使用内置 imagegen，精确移除原背景上的固定底盘、星球和亮星点；这些物体改由实时三维绘制。未使用 API/CLI 回退。

输入：client/hud/environment-v4.png

最终项目素材：client/hud/environment-v5.png

## 完整提示词

Use case: precise-object-edit. Edit target: the supplied existing JARVIS empty environment plate. Create a clean base plate for REAL-TIME 3D objects to be composited over it. REMOVE the entire circular landing platform / concentric glowing floor rings in the center lower half and their circular reflections, replacing that area with seamless very dark glossy flat navy floor. REMOVE ALL visible spherical planets at both left and right edges, and remove ALL bright pinpoint stars, sparkles, glowing dots and tiny light streaks throughout the sky. Those objects will be animated in WebGL. PRESERVE the surrounding architecture, fine long perspective space lines, distant blue haze/nebula, very subtle wall streaks, deep navy and cyan palette, hints of amber, and original 16:9 composition. Keep a spacious dark EMPTY center above an unmarked smooth reflective floor. Floor horizon and vanishing point must remain exactly at their current height. Preserve photographic sci-fi depth and detail, make floor center subtly cyan-lit but no glowing disc, no circles, no circular structures, no spheres, no dots/stars, no text or UI. This is an object removal edit, NOT a new scene design. Keep lower 30% dark to support readable application subtitles.
