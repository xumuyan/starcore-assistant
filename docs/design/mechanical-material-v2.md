# 机械材质 v2

执行方式：内置 imagegen；没有 CLI/API 回退。参考为用户选定的贾维斯设计图。

最终项目文件：`client/assets/MechanicalBands-v2.png`。

这张图只作为真实三维环的材质，绕环 UV 映射后随各环独立运动。不是完整球体照片或整张场景贴图。核心体积光、光丝、机械结构与底盘反射仍由实时三维渲染。

## 完整提示词

Use case: stylized-concept. Create a production PBR base-color / emissive-detail texture atlas for actual animated 3D mechanical rings. The input is ONLY a style reference. Output a flat rectangular panoramic 4:1 strip texture, no perspective, no sphere, no rendered ring, no UI and no text. Across the whole width, depict layered translucent deep navy / icy-blue technical glass and brushed blue-silver alloy: many extremely fine parallel rails running horizontally, intricately etched circuit lines, tiny intermittent white-cyan indicator marks, recessed dark panels, a few small warm amber illuminated rectangles. Most of the texture is dark blue reflective-looking material, with sparse luminous hairline cyan details and clean silver edging. Match the photographic optical sophistication of the attached JARVIS mockup, avoiding chunky blocks, cartoon outlines, bright opaque neon fills or giant white highlights. The left and right edges should be seamless for wrapping around a circular band; avoid any recognizable text, numbers or symbols. This texture will wrap a real mesh annulus, so do not draw any object silhouette, background environment or fake camera bloom. High resolution crisp micro-detail, 2048x512 composition.
