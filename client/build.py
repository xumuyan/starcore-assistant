from pathlib import Path
import json
import plistlib
import platform
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
if '--ui-only' not in sys.argv:
    subprocess.run([sys.executable, str(root / 'install.py')], check=True)
subprocess.run([str(root / 'node_modules/.bin/esbuild'), str(root / 'client/scene/renderer.mjs'), '--bundle', '--format=iife', '--target=safari16', '--minify', '--loader:.png=dataurl', '--outfile=' + str(root / 'client/hud/scene-3d.js')], check=True)
app = root / 'dist' / 'MOSS.app'
contents = app / 'Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
(contents / 'Resources').mkdir(exist_ok=True)
info = {
    'CFBundleExecutable': 'CodexWeixin',
    'CFBundleIdentifier': 'local.codex-weixin.client',
    'CFBundleName': 'MOSS',
    'CFBundleDisplayName': 'MOSS',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.9.4',
    'CFBundleVersion': '25',
    'CFBundleIconFile': 'StarCoreIcon-v3',
    'LSMinimumSystemVersion': '13.0',
    'NSHighResolutionCapable': True,
    'NSPrincipalClass': 'NSApplication',
    'NSMicrophoneUsageDescription': '用于本地识别唤醒词、语音指令与按键听写。听写录音不保存；仅在主动启用校对时将本轮文字发送至 DeepSeek。',
    'LSApplicationCategoryType': 'public.app-category.utilities',
    'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
}
(contents / 'Info.plist').write_bytes(plistlib.dumps(info))
settings = {'node': shutil.which('node'), 'runtime': str(Path.home() / '.codex-weixin-notifier/runtime')}
(contents / 'Resources/client-settings.json').write_text(json.dumps(settings, ensure_ascii=False))
shutil.copy2(root / 'client/assets/SceneReference-v3.png', root / 'client/hud/reference-target.png')
shutil.copytree(root / 'client/hud', contents / 'Resources/hud', dirs_exist_ok=True)
shutil.copy2(root / 'node_modules/three/LICENSE', contents / 'Resources/THREE-LICENSE.txt')
shutil.copy2(root / 'licenses/SpeakMore-MIT.txt', contents / 'Resources/SPEAKMORE-LICENSE.txt')
iconset = root / 'dist/AppIcon.iconset'
iconset.mkdir(parents=True, exist_ok=True)
for points in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        pixels = points * scale
        name = f'icon_{points}x{points}' + ('@2x' if scale == 2 else '') + '.png'
        subprocess.run(['sips', '-z', str(pixels), str(pixels), str(root / 'client/assets/AppIcon-v3.png'), '--out', str(iconset / name)], check=True, capture_output=True)
subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(contents / 'Resources/StarCoreIcon-v3.icns')], check=True)
# A native asset catalog supplies opaque, unmasked artwork to the system icon
# renderer. A transparent, pre-rounded ICNS alone can receive a visible tray.
icon_info = root / 'dist/starcore-icon-info.plist'
subprocess.run(['xcrun', 'actool', '--compile', str(contents / 'Resources'),
                '--app-icon', 'StarCoreAppIcon', '--platform', 'macosx',
                '--minimum-deployment-target', '13.0', '--target-device', 'mac',
                '--output-partial-info-plist', str(icon_info),
                '--output-format', 'human-readable-text', '--warnings', '--errors',
                str(root / 'client/assets/StarCore.xcassets')], check=True)
info.update(plistlib.loads(icon_info.read_bytes()))
(contents / 'Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['swiftc', '-swift-version', '5', '-O', '-target', platform.machine() + '-apple-macosx13.0', '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'AVFoundation', '-framework', 'Security', *map(str, sorted((root / 'client').glob('*.swift'))), '-o', str(contents / 'MacOS/CodexWeixin')], check=True)
subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
if '--no-install' in sys.argv:
    print('APP_BUILT ' + str(app))
    sys.exit(0)
target = Path.home() / 'Applications' / app.name
if target.exists():
    existing = plistlib.loads((target / 'Contents/Info.plist').read_bytes())
    if existing.get('CFBundleIdentifier') != info['CFBundleIdentifier']:
        raise SystemExit('Refusing to overwrite a different app')
target.parent.mkdir(exist_ok=True)
shutil.copytree(app, target, dirs_exist_ok=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(target)], check=True)
print('APP_READY ' + str(target))
