from pathlib import Path
import shutil
import subprocess
import hashlib

root = Path(__file__).resolve().parents[3]
source = root / 'client/scene/prototype'
output = root / 'dist/fixed-camera-study'
output.mkdir(parents=True, exist_ok=True)
subprocess.run([str(root / 'node_modules/.bin/esbuild'), str(source / 'study.mjs'), '--bundle', '--format=esm', '--target=safari16', '--minify', '--loader:.png=dataurl', '--outfile=' + str(output / 'study.js')], check=True)
for name in ('study.html', 'study.css'):
    shutil.copy2(source / name, output / name)
html = (output / 'study.html').read_text()
for name in ('study.js', 'study.css'):
    digest = hashlib.sha256((output / name).read_bytes()).hexdigest()[:12]
    html = html.replace('"' + name + '"', '"' + name + '?v=' + digest + '"')
(output / 'study.html').write_text(html)
shutil.copy2(root / 'client/hud/environment-v5.png', output / 'environment-v5.png')
shutil.copy2(root / 'client/hud/jarvis-scene-v3.png', output / 'jarvis-scene-v3.png')
shutil.copy2(root / 'client/hud/jarvis-mark-v6.png', output / 'jarvis-mark-v6.png')
shutil.copy2(root / 'client/assets/SceneReference-v3.png', output / 'reference-target.png')
shutil.copytree(root / 'client/hud/icons', output / 'icons', dirs_exist_ok=True)
shutil.copytree(source / 'icons', output / 'reference-icons', dirs_exist_ok=True)
html = (output / 'study.html').read_text().replace('src="icons/', 'src="reference-icons/')
(output / 'study.html').write_text(html)
shutil.copy2(root / 'node_modules/three/LICENSE', output / 'THREE-LICENSE.txt')
print('PROTOTYPE_READY ' + str(output))
