import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const installSource = readFileSync(join(root, 'install.py'), 'utf8');

test('install keeps a wechatDelivery switch and defaults it to off', () => {
  assert.match(installSource, /wechatDelivery/, 'the switch key exists');
  assert.match(installSource, /bool\(previous\.get\('wechatDelivery'\)\)/, 'an explicit previous true is preserved');
  assert.match(installSource, /'wechatDelivery': delivery/, 'the switch is written back into runtime-settings.json');
});

test('with the switch off the WeChat agents stay registered but Disabled and unload now', () => {
  assert.match(installSource, /'Disabled': True/, 'disabled flag prepared');
  assert.match(installSource, /if not delivery:\n\s+value\.update\(disabled\)/, 'bot plist gets Disabled');
  assert.match(installSource, /if not delivery:\n\s+watcher\.update\(disabled\)/, 'watcher plist gets Disabled');
  assert.match(installSource, /launchctl', 'bootout'/, 'loaded instances are unloaded immediately');
  assert.match(installSource, /不再在微信显示/, 'the install output states the WeChat display is off');
});

test('build refuses to install over a running MOSS instance', () => {
  const buildSource = readFileSync(join(root, 'client', 'build.py'), 'utf8');
  assert.match(buildSource, /pgrep', '-f', 'MOSS\.app\/Contents\/MacOS\/CodexWeixin/, 'the running instance is detected');
  assert.match(buildSource, /运行中覆盖会导致页面卡死/, 'the error explains why the install aborts');
  assert.match(buildSource, /raise SystemExit\('MOSS 正在运行/, 'install aborts with a clear message');
});
