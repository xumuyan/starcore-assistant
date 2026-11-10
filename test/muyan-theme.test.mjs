import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs'; import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

test('应用图标使用沐言声波气泡设计，全尺寸资产一致', () => {
  assert.equal(existsSync(join(root, 'client', 'assets', 'AppIcon-v5.png')), true, '图标源文件已入库');
  const assets = join(root, 'client', 'assets', 'StarCore.xcassets', 'StarCoreAppIcon.appiconset');
  const spec = JSON.parse(readFileSync(join(assets, 'Contents.json'), 'utf8'));
  for (const img of spec.images) {
    if (!img.filename) continue;
    assert.equal(existsSync(join(assets, img.filename)), true, `${img.filename} 存在`);
    const head = readFileSync(join(assets, img.filename)).subarray(8, 24).indexOf('IHDR');
    assert.notEqual(head, -1, `${img.filename} 是 PNG`);
  }
  const build = read('client', 'build.py');
  assert.match(build, /AppIcon-v5\.png/, '构建引用新图标源');
  assert.doesNotMatch(build, /AppIcon-v3\.png/, '不再引用旧图标源');
});

test('HUD 主题色向图标暖色靠拢：无残留冷青蓝主色', () => {
  const stale = ['#146c82', '#1c758a', '#276f83', '#28788b', '#22667a', '#176c83', '#205f70', '#1a627a', '#26708f', '#6dc9da', '#8bdfff', '#e6edf4', '#d4e9eb'];
  const files = ['moss.css', 'glass.css', 'companion.css', 'controls.css', 'panels.css', 'style.css'];
  for (const file of files) {
    const css = read('client', 'hud', file);
    for (const color of stale) assert.ok(!css.includes(color), `${file} 残留旧冷色 ${color}`);
  }
  const accent = read('client', 'hud', 'glass.css').match(/--accent:(#[0-9a-f]{6})/)[1];
  const r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
  assert.ok(r > g && r > b, `accent 转为暖色主导（R>G>B），当前 ${accent}`);
  const banner = read('client', 'ReminderBanner.swift');
  assert.match(banner, /srgbRed: 0\.98, green: 0\.93, blue: 0\.95/, '横幅光泽转暖粉');
  assert.doesNotMatch(banner, /srgbRed: 0\.87, green: 0\.96, blue: 0\.98/, '横幅不再用冷白蓝光泽');
});

test('图标主色与界面 accent 同属暖玫色域（色相一致）', () => {
  // 从图标 1024 源取渐变两端样本，确认色相落在玫粉橙带（330°–30°）
  const out = execFileSync('python3', ['-c', `
from PIL import Image
import colorsys
im = Image.open(${JSON.stringify(join(root, 'client', 'assets', 'AppIcon-v5.png'))}).convert('RGB')
w, h = im.size
for x, y in ((int(w*0.12), int(h*0.12)), (int(w*0.88), int(h*0.88))):
    r, g, b = im.getpixel((x, y))
    print(round(colorsys.rgb_to_hls(r/255, g/255, b/255)[0]*360))
`], { encoding: 'utf8' }).trim().split('\n').map(Number);
  for (const hue of out) assert.ok(hue >= 330 || hue <= 30, `图标采样色相 ${hue}° 应在暖玫橙带`);
  const css = read('client', 'hud', 'style.css');
  const glow = css.match(/#e8476a|#f29aad/);
  assert.ok(glow, '界面波形发光使用同域玫粉');
});
