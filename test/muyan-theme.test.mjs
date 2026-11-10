import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as pngjs from 'pngjs'; import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

test('应用图标使用沐言声波气泡设计，全尺寸资产一致', () => {
  assert.equal(existsSync(join(root, 'client', 'assets', 'AppIcon-v6.png')), true, '图标源文件已入库');
  const assets = join(root, 'client', 'assets', 'StarCore.xcassets', 'StarCoreAppIcon.appiconset');
  const spec = JSON.parse(readFileSync(join(assets, 'Contents.json'), 'utf8'));
  for (const img of spec.images) {
    if (!img.filename) continue;
    assert.equal(existsSync(join(assets, img.filename)), true, `${img.filename} 存在`);
    const head = readFileSync(join(assets, img.filename)).subarray(8, 24).indexOf('IHDR');
    assert.notEqual(head, -1, `${img.filename} 是 PNG`);
  }
  const build = read('client', 'build.py');
  assert.match(build, /AppIcon-v6\.png/, '构建引用新图标源');
  assert.doesNotMatch(build, /AppIcon-v3\.png/, '不再引用旧图标源');
});

test('HUD 主题色向图标暖色靠拢：无残留冷青蓝主色', () => {
  const stale = ['#146c82', '#1c758a', '#276f83', '#28788b', '#22667a', '#176c83', '#205f70', '#1a627a', '#26708f', '#6dc9da', '#8bdfff', '#e6edf4', '#d4e9eb'];
  const files = ['moss.css', 'glass.css', 'companion.css', 'controls.css', 'panels.css', 'style.css'];
  for (const file of files) {
    const css = read('client', 'hud', file);
    for (const color of stale) assert.ok(!css.includes(color), `${file} 残留旧冷色 ${color}`);
  }
  const accent = read('client', 'hud', 'glass.css').match(/--accent:(#[0-9a-fA-F]{6})/)[1];
  const r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
  assert.ok(r > g && r > b, `accent 转为暖色主导（R>G>B），当前 ${accent}`);
  const banner = read('client', 'ReminderBanner.swift');
  assert.match(banner, /srgbRed: 0\.91, green: 0\.85, blue: 0\.88/, '横幅光泽雾灰玫瑰');
  assert.doesNotMatch(banner, /srgbRed: 0\.87, green: 0\.96, blue: 0\.98/, '横幅不再用冷白蓝光泽');
});

test('图标主色与界面 accent 同属暖玫色域（色相一致）', () => {
  const { PNG } = pngjs;
  const png = PNG.sync.read(readFileSync(join(root, 'client', 'assets', 'AppIcon-v6.png')));
  const hues = [];
  for (const [fx, fy] of [[0.12, 0.12], [0.88, 0.88]]) {
    const idx = (Math.floor(fx * png.width) * png.height + Math.floor(fy * png.height)) << 2;
    const r = png.data[idx] / 255, g = png.data[idx + 1] / 255, b = png.data[idx + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : (l > .5 ? d / (2 - mx - mn) : d / (mx + mn));
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = ((h * 60) + 360) % 360;
    }
    hues.push([h, s]);
  }
  for (const [hue, s] of hues) assert.ok(s < 0.12 || hue >= 330 || hue <= 30, `图标采样色相 ${Math.round(hue)}° 应在暖玫橙带（低饱和中性豁免）`);
  const css = read('client', 'hud', 'style.css');
  const glow = css.match(/#C9A3AD|#B58A94/i);
  assert.ok(glow, '界面波形发光使用灰玫同域色');
});

test('3D 场景材质与纹理转向图标同域暖色', () => {
  const stale = ['0x69d5ff', '0x4ccfff', '0x1789ef', '0x59dfff', '0x73caff', '0x7ddaff', '0x37b9ff', '0xee7993', '0xf7c0cc'];
  for (const file of ['materials.mjs', 'core.mjs', 'world.mjs', 'projected-scene.mjs', 'renderer.mjs', 'prototype/mechanical-core.mjs']) {
    const src = read('client', 'scene', file);
    for (const color of stale) assert.ok(!src.includes(color), `scene/${file} 残留旧冷色 ${color}`);
  }
  const materials = read('client', 'scene', 'materials.mjs');
  assert.match(materials, /rose = 0xcc9ba6/, '共享主色常量为灰玫 rose 并降饱和');
  assert.doesNotMatch(materials, /\bcyan\b/, '常量名不再叫 cyan');
  const bundle = read('client', 'hud', 'scene-3d.js');
  for (const color of stale) assert.ok(!bundle.includes(color), `scene-3d bundle 残留旧冷色 ${color}`);
  assert.doesNotMatch(read('client', 'scene', 'renderer.mjs'), /0x020a10/, '场景底色不再用冷黑蓝');
});

test('雾灰玫瑰 C 方案：UI 主 accent 统一且艳玫清零', () => {
  for (const [file, accent] of [['glass.css', 'A07882'], ['moss.css', 'A07882']]) {
    assert.match(read('client', 'hud', file), new RegExp('--accent:#' + accent, 'i'), `${file} accent 为灰玫`);
  }
  const style = read('client', 'hud', 'style.css');
  for (const vivid of ['85102a', '94122e', '8b1f36', 'e8476a', 'f29aad', '72d7ff', '3fc5fb']) {
    assert.ok(!style.toLowerCase().includes(vivid), `style.css 残留旧色 ${vivid}`);
  }
  const bundle = read('client', 'hud', 'scene-3d.js');
  assert.ok(!bundle.toLowerCase().includes('ee7993'), 'bundle 残留艳玫 rose');
});
