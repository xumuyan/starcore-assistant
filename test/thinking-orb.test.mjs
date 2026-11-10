import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

test('thinking-orbs 依赖与许可登记', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies?.['thinking-orbs'], '^0.3.2');
  assert.ok(existsSync(path.join(root, 'licenses/thinking-orbs-MIT.txt')), '缺少 MIT 许可文件');
  assert.ok(existsSync(path.join(root, 'node_modules/thinking-orbs')), '依赖未安装');
});

test('引擎为本地打包产物且无远程引用（CSP）', () => {
  assert.ok(existsSync(path.join(root, 'client/hud/thinking-orb.js')), '打包产物缺失，请先运行构建');
  const bundle = read('client/hud/thinking-orb.js');
  assert.ok(!/https?:\/\//.test(bundle), '打包产物不得包含远程引用');
  assert.ok(bundle.length > 8000, '打包产物过小，疑似未含引擎');
});

test('HUD 接线：容器、迷你球、开关与脚本', () => {
  const html = read('client/hud/index.html');
  for (const frag of ['id="orb-stage"', 'id="orb-main"', 'id="orb-mini"', 'id="set-thinkingOrb"', '<script src="thinking-orb.js">']) {
    assert.ok(html.includes(frag), `index.html 缺少 ${frag}`);
  }
});

test('app.js 状态转发与开关逻辑', () => {
  const app = read('client/hud/app.js');
  for (const frag of ['initThinkingOrb', 'applyThinkingOrb', 'MuYanOrbEngine', "assistant-state", 'set-thinkingOrb' === 'x' ? '' : 'ORB_BUSY']) {
    if (frag) assert.ok(app.includes(frag), `app.js 缺少 ${frag}`);
  }
  assert.ok(/thinkingOrb !== false/.test(app), '思考光球开关读取缺失');
});

test('assistant-core 默认开启且参与布尔校验', () => {
  const core = read('src/assistant-core.mjs');
  assert.ok(core.includes('thinkingOrb: true,'), '默认值缺失');
  assert.ok(/'liquidGlass', 'thinkingOrb'/.test(core), '布尔校验列表未含 thinkingOrb');
});

test('build.py 打包步骤与 .gitignore 约定', () => {
  const build = read('client/build.py');
  assert.ok(/thinking-orb\.mjs'/.test(build), 'build.py 缺少思考光球打包');
  assert.match(build, /AppIcon-v7\.png/);
  const ignore = read('.gitignore');
  assert.ok(ignore.includes('/client/hud/thinking-orb.js'), '生成产物应忽略');
});
