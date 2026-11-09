import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const darwinOnly = { skip: process.platform !== 'darwin' ? 'plutil/launchctl semantics required' : false };

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'client-control-home-'));
  const state = join(home, '.codex-weixin-notifier');
  mkdirSync(join(state, 'events'), { recursive: true });
  mkdirSync(join(home, 'Library/LaunchAgents'), { recursive: true });
  writeFileSync(join(state, 'runtime-settings.json'), JSON.stringify({ codex: null, wechatDelivery: false }));
  return home;
}

function plist(label, disabled) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  ${disabled ? '<key>Disabled</key><true/>' : '<key>RunAtLoad</key><true/>'}
</dict></plist>
`;
}

function fakeLaunchctl(log) {
  const script = join(mkdtempSync(join(tmpdir(), 'client-control-bin-')), 'fake-launchctl.sh');
  writeFileSync(script, `#!/bin/bash
echo "$*" >> "${log}"
if [ "$1" = "print" ]; then exit 1; fi
exit 0
`);
  chmodSync(script, 0o755);
  return script;
}

function runControl(home, launchctl, command) {
  return execFileSync(process.execPath, [join(root, 'src/client-control.mjs'), command], {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      HOME: home,
      CODEX_WEIXIN_STATE_DIR: join(home, '.codex-weixin-notifier'),
      MOSS_LAUNCHCTL: launchctl,
      MOSS_PLUTIL: '/usr/bin/plutil',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  });
}

test('start never bootstraps user-disabled agents and still answers with a snapshot', darwinOnly, () => {
  const home = makeHome();
  const log = join(home, 'launchctl.log');
  try {
    writeFileSync(join(home, 'Library/LaunchAgents/local.codex-weixin-notifier.plist'), plist('local.codex-weixin-notifier', true));
    writeFileSync(join(home, 'Library/LaunchAgents/local.codex-weixin-desktop-watch.plist'), plist('local.codex-weixin-desktop-watch', true));
    writeFileSync(log, '');
    const snapshot = JSON.parse(runControl(home, fakeLaunchctl(log), 'start'));
    assert.equal(snapshot.delivery, false, 'disabled delivery is reported');
    assert.equal(snapshot.serviceRunning, false, 'agents stay off');
    const invocations = readFileSync(log, 'utf8');
    assert.doesNotMatch(invocations, /bootstrap/, 'disabled agents are never bootstrapped');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('start bootstraps enabled agents and status keeps working', darwinOnly, () => {
  const home = makeHome();
  const log = join(home, 'launchctl.log');
  try {
    writeFileSync(join(home, '.codex-weixin-notifier/runtime-settings.json'), JSON.stringify({ codex: null, wechatDelivery: true }));
    writeFileSync(join(home, 'Library/LaunchAgents/local.codex-weixin-notifier.plist'), plist('local.codex-weixin-notifier', false));
    writeFileSync(join(home, 'Library/LaunchAgents/local.codex-weixin-desktop-watch.plist'), plist('local.codex-weixin-desktop-watch', false));
    writeFileSync(log, '');
    const launchctl = fakeLaunchctl(log);
    const snapshot = JSON.parse(runControl(home, launchctl, 'start'));
    assert.equal(snapshot.delivery, true, 'enabled delivery is reported');
    const invocations = readFileSync(log, 'utf8');
    assert.match(invocations, /bootstrap .*local\.codex-weixin-notifier\.plist/, 'enabled agent is bootstrapped');
    assert.match(invocations, /bootstrap .*local\.codex-weixin-desktop-watch\.plist/, 'watcher is bootstrapped');
    const status = JSON.parse(runControl(home, launchctl, 'status'));
    assert.equal(typeof status.delivery, 'boolean', 'status carries the delivery flag');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('the app retries transient failures and renders the disabled state honestly', () => {
  const app = readFileSync(join(root, 'client', 'App.swift'), 'utf8');
  const runControl = app.slice(app.indexOf('func runControl'), app.indexOf('func render('));
  assert.match(runControl, /for attempt in 0..<3/, 'control commands retry before failing');
  assert.match(runControl, /localizedDescription/, 'the dialog carries the real error');
  assert.match(app, /let delivery: Bool\?/, 'snapshot tolerates the delivery flag');
  assert.match(app, /微信显示已停用/, 'the panel states the disabled delivery honestly');
});
