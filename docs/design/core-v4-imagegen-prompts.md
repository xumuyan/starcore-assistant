# 三维核心素材生成记录

使用内置 imagegen。环境图片保留参考图的地面与空间，球面图片只作为真实三维球面的材质，不含外轨道。外轨道、刻度和光丝由 WebGL 几何实现。

输出素材：

- `client/hud/environment-v4.png`
- `client/assets/PlasmaSurface-v4.png`

## 环境图编辑提示词

Edit this image into an EMPTY ENVIRONMENT PLATE for a real-time 3D JARVIS-style app. Remove the ENTIRE large central energy sphere, its bright central light, ALL large rings and orbits attached to that sphere, all central filaments, all glowing geometry hanging above the floor. There must be NO large sphere, NO central orb, NO central halo, NO large vertical circles left in the upper central 65% of the image. That whole area must become a dark deep navy softly illuminated empty volume with distant sparse stars. Preserve the exact existing surrounding deep-space environment, small distant planets at the far left and right, fine spatial rays, ambient blue and tiny amber points, and reflective floor/platform with thin HORIZONTAL floor rings at the same height. Preserve the 16:9 composition and original palette. Keep the lower third very dark and clear for readable real application text. The missing hero sphere will be rendered in actual WebGL over this plate. No text, symbols, UI, labels, logos, controls or new hero object. Clean seamless removal, high fidelity to the original environment.

## 球面纹理提示词

Generate a transparent-background texture asset for a real 3D holographic energy sphere, using the attached image only as a visual style reference. Show ONLY the inner spherical plasma body at the center of the reference: a glowing deep blue transparent volumetric sphere densely threaded with delicate cyan electrical filaments, bright center, tiny amber sparks and luminous micro-particles. NO large external orbit rings, NO big gimbals, NO pedestal or floor, NO space backdrop or planets, NO typography or user interface. Orthographic front view, perfectly centered sphere, sphere diameter about 85% of the square frame, no crop, fine photographic sci-fi lighting, luminous detailed surface rather than latitude/longitude wireframe. Bright icy cyan center with intricate blue-white filament swirls and darker rich blue outer layers. Crisp emissive details, real transparent alpha outside the circular sphere. This image will be projected as an emissive texture on an actual 3D sphere with separate animated WebGL orbit geometry; do not draw any outer hoops.
