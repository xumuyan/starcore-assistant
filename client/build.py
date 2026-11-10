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
# 液态玻璃折射入口（SC-20261110-001）：MIT 依赖 apple-liquid-glass-webgl，打包为本地脚本满足 CSP script-src 'self'。
subprocess.run([str(root / 'node_modules/.bin/esbuild'), str(root / 'client/scene/liquid-glass.mjs'), '--bundle', '--format=iife', '--target=safari16', '--minify', '--outfile=' + str(root / 'client/hud/liquid-glass.js')], check=True)
# 思考光球入口（SC-20261110-007）：MIT 依赖 thinking-orbs（仅引擎层，纯几何+canvas），本地打包满足 CSP。
subprocess.run([str(root / 'node_modules/.bin/esbuild'), str(root / 'client/scene/thinking-orb.mjs'), '--bundle', '--format=iife', '--global-name=MuYanOrbEngine', '--target=safari16', '--minify', '--outfile=' + str(root / 'client/hud/thinking-orb.js')], check=True)
app = root / 'dist' / 'MuYan.app'
contents = app / 'Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
(contents / 'Resources').mkdir(exist_ok=True)
info = {
    'CFBundleExecutable': 'CodexWeixin',
    'CFBundleIdentifier': 'local.codex-weixin.client',
    'CFBundleName': '沐言',
    'CFBundleDisplayName': '沐言',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.9.12',
    'CFBundleVersion': '38',
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
        subprocess.run(['sips', '-z', str(pixels), str(pixels), str(root / 'client/assets/AppIcon-v7.png'), '--out', str(iconset / name)], check=True, capture_output=True)
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
# Rust 宿主（阶段一，SC-20261109-014）：随构建编译但不接线，应用运行时仍用 node 引擎。
# cargo 缺失时跳过并提示（不阻塞构建）；编译失败则中止。二进制不入包，仅作为后续阶段的产物。
cargo = shutil.which('cargo')
if cargo:
    subprocess.run([cargo, 'build', '--release', '--quiet'], cwd=str(root / 'rust-host'), check=True)
    rust_binary = root / 'rust-host' / 'target' / 'release' / 'moss-host'
    if not rust_binary.exists():
        raise SystemExit('Rust 宿主编译后未找到二进制：' + str(rust_binary))
    print('RUST_HOST_READY ' + str(rust_binary))
else:
    print('[警告] 未找到 cargo，跳过 Rust 宿主编译（默认引擎仍为 node，不影响本构建）')
if '--no-install' in sys.argv:
    print('APP_BUILT ' + str(app))
    sys.exit(0)
# Never overwrite the bundle under a running instance: on 2026-11-09 a hot-swap
# made the old process spawn mismatched WKWebView helpers and its page froze
# (Network Process crash in system log). Quit the app before installing.
# 2026-11-09 产品定名沐言：旧安装名 MOSS.app 与新名 MuYan.app 都在守卫范围内。
running_patterns = ['MuYan.app/Contents/MacOS/CodexWeixin', 'MOSS.app/Contents/MacOS/CodexWeixin']
for pattern in running_patterns:
    running = subprocess.run(['pgrep', '-f', pattern], capture_output=True)
    if running.returncode == 0:
        raise SystemExit('沐言正在运行，请先退出应用再安装（运行中覆盖会导致页面卡死）；退出后重跑本命令。')
target = Path.home() / 'Applications' / app.name
legacy = Path.home() / 'Applications' / 'MOSS.app'
if target.exists():
    existing = plistlib.loads((target / 'Contents/Info.plist').read_bytes())
    if existing.get('CFBundleIdentifier') != info['CFBundleIdentifier']:
        raise SystemExit('Refusing to overwrite a different app')
target.parent.mkdir(exist_ok=True)
shutil.copytree(app, target, dirs_exist_ok=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(target)], check=True)
# 旧名应用是我们自己生成的构建产物：未运行则移除避免双图标混淆；在运行则提示用户手动处理。
if legacy.exists():
    legacy_running = subprocess.run(['pgrep', '-f', 'MOSS.app/Contents/MacOS/CodexWeixin'], capture_output=True)
    if legacy_running.returncode == 0:
        print('[提示] 旧版 MOSS.app 正在运行，未自动清理；退出后可手动删除 ~/Applications/MOSS.app')
    else:
        shutil.rmtree(legacy)
        print('OLD_APP_REMOVED ' + str(legacy))
print('APP_READY ' + str(target))
