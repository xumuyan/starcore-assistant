import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs'; import { join } from 'node:path';
import { validateSettings } from '../src/assistant-core.mjs';

const root = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

test('液态玻璃效果默认关闭，开关按布尔设置校验', () => {
  assert.equal(validateSettings().liquidGlass, false, '新功能默认关闭，直到用户开启');
  assert.equal(validateSettings({ liquidGlass: true }).liquidGlass, true, '显式开启生效');
  assert.equal(validateSettings({ liquidGlass: 'yes' }).liquidGlass, false, '非布尔值不采纳');
  assert.equal(validateSettings({ reducedMotion: true, liquidGlass: true }).reducedMotion, true, '原有布尔设置不受影响');
});

test('设置页提供液态玻璃开关，页面按 CSP 以本地脚本加载库', () => {
  const html = read('client', 'hud', 'index.html');
  assert.match(html, /id="set-liquidGlass"/, '设置表单有开关');
  assert.match(html, /<script src="liquid-glass.js"><\/script>/, '库以本地脚本加载（CSP script-src 自身）');
  assert.doesNotMatch(html, /script src="https?:\/\//, '不引入外部脚本');
});

test('折射入口只在设置开启、未开减少动态效果且环境支持时启用', () => {
  const app = read('client', 'hud', 'app.js');
  assert.match(app, /applyLiquidGlass\(config\.liquidGlass\)/, '配置到达时应用开关');
  assert.match(app, /contains\('reduce-motion'\)/, '减少动态效果时保持原外观');
  assert.match(app, /glassSupported\(\)/, '无 WebGL2 时保持原外观');
  assert.match(app, /glass\.disableGlass\(\)/, '关闭时销毁实例');
  const entry = read('client', 'scene', 'liquid-glass.mjs');
  assert.match(entry, /isSupported\(\)/, '入口先探测支持');
  assert.match(entry, /glass\.destroy\(\)/, '回退模式销毁实例，继续用原有 CSS 外观');
  assert.match(entry, /refreshAll/, '设置面板从隐藏转可见时重新测量');
});

test('折射激活时原 CSS 玻璃材质退场，避免双重渲染', () => {
  const css = read('client', 'hud', 'glass.css');
  assert.match(css, /\[data-liquid-glass="webgl"\][^{]*\{[^}]*backdrop-filter:none/, '原 backdrop-filter 关闭');
  assert.match(css, /#settings-overlay\[data-liquid-glass="webgl"\]/, '设置面板覆盖');
  assert.match(css, /\.control-strip\[data-liquid-glass="webgl"\]/, '控制条覆盖');
  assert.match(css, /\.side-card\[data-liquid-glass="webgl"\]/, '侧卡片覆盖');
});

test('构建打包液态玻璃入口，产物与源文件同时入库', () => {
  const build = read('client', 'build.py');
  assert.match(build, /liquid-glass\.mjs'.*--outfile=.*liquid-glass\.js/s, '构建步骤包含打包命令');
  assert.equal(existsSync(join(root, 'client', 'hud', 'liquid-glass.js')), true, '打包产物已生成');
  assert.ok(statSync(join(root, 'client', 'hud', 'liquid-glass.js')).size > 50000, '产物包含库本体而非空文件');
});
