import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = join(homedir(), '.cargo/bin/cargo');
const mossHost = join(root, 'rust-host/target/debug/moss-host');

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'moss-host-parity-'));
  const state = join(home, '.codex-weixin-notifier');
  mkdirSync(join(state, 'events'), { recursive: true });
  mkdirSync(join(state, 'remote-requests'), { recursive: true });
  mkdirSync(join(state, 'weixin/openclaw-weixin'), { recursive: true });
  writeFileSync(join(state, 'runtime-settings.json'), JSON.stringify({ codex: null, wechatDelivery: false }));
  writeFileSync(join(state, 'remote-settings.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(state, 'status.json'), JSON.stringify({ ready: true, paused: false }));
  writeFileSync(join(state, 'desktop-status.json'), JSON.stringify({ running: true, checkedAt: new Date().toISOString() }));
  writeFileSync(join(state, 'weixin/openclaw-weixin/accounts.json'), JSON.stringify([{ session: 'fixture' }]));
  const event = (id, time, status, threadId) => writeFileSync(join(state, `events/${id}.json`), JSON.stringify({ id, threadId, turnId: 't1', project: 'wzqCmsNew', summary: '构建完成，待人工验收。', time, status }));
  event('a'.repeat(64), '2026-11-09T10:00:00.000Z', 'sent', '12345678-1234-4123-8123-123456789abc');
  event('b'.repeat(64), '2026-11-09T11:00:00.000Z', 'pending', null);
  event('c'.repeat(64), '2026-11-09T12:00:00.000Z', 'pending', null);
  event('d'.repeat(64), '2026-11-09T13:00:00.000Z', 'cancelled', null);
  event('e'.repeat(64), '2026-11-09T14:00:00.000Z', 'sending', null);
  writeFileSync(join(state, `events/${'f'.repeat(64)}.json`), 'not-json');
  writeFileSync(join(state, 'events/deadbeef.json'), '{}');
  const request = (id, receivedAt, status) => writeFileSync(join(state, `remote-requests/${id}.json`), JSON.stringify({ id, receivedAt, status, threadId: '12345678-1234-4123-8123-123456789abc' }));
  request('1'.repeat(64), '2026-11-09T10:05:00.000Z', 'completed');
  request('2'.repeat(64), '2026-11-09T10:10:00.000Z', 'running');
  request('3'.repeat(64), '2026-11-09T10:15:00.000Z', 'pending');
  return home;
}

function run(home, executable, args) {
  return execFileSync(executable, args, {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      HOME: home,
      CODEX_WEIXIN_STATE_DIR: join(home, '.codex-weixin-notifier'),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  });
}

test('rust host status matches the node control byte for byte', { skip: !existsSync(cargo) ? 'cargo 未安装，跳过 Rust 宿主测试' : false }, () => {
  execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 });
  assert.ok(existsSync(mossHost), '构建产物存在');
  const home = sandbox();
  try {
    const nodeOut = run(home, process.execPath, [join(root, 'src/client-control.mjs'), 'status']);
    const rustOut = run(home, mossHost, ['status']);
    assert.equal(rustOut, nodeOut, '两版 status 输出完全一致');
    const snapshot = JSON.parse(rustOut);
    assert.equal(snapshot.delivery, false);
    assert.equal(snapshot.bound, true);
    assert.equal(snapshot.sent, 1);
    assert.equal(snapshot.pending, 2);
    assert.equal(snapshot.uncertain, 1);
    assert.equal(snapshot.remoteStatus, '执行中');
    assert.equal(snapshot.remoteProject, 'wzqCmsNew');
    assert.equal(snapshot.latest.project, 'wzqCmsNew');
    assert.equal(snapshot.latest.status, 'sending', 'latest 取排序后最后一条（cancelled 已排除）');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('moss-host reports version and rejects unknown commands', { skip: !existsSync(cargo) ? 'cargo 未安装，跳过 Rust 宿主测试' : false }, () => {
  execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 });
  assert.match(run(mkdtempSync(join(tmpdir(), 'moss-host-ver-')), mossHost, ['--version']).trim(), /^moss-host \d+\.\d+\.\d+$/);
  assert.throws(() => run(mkdtempSync(join(tmpdir(), 'moss-host-x-')), mossHost, ['bogus']), /Unsupported command/);
});

function fakeLaunchctl(log) {
  const bin = mkdtempSync(join(tmpdir(), 'moss-host-bin-'));
  const script = join(bin, 'fake-launchctl.sh');
  writeFileSync(script, `#!/bin/bash
echo "$*" >> "${log}"
if [ "$1" = "print" ]; then exit 1; fi
exit 0
`);
  chmodSync(script, 0o755);
  return script;
}

function runWithLaunchctl(home, launchctl, executable, args) {
  return execFileSync(executable, args, {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      HOME: home,
      CODEX_WEIXIN_STATE_DIR: join(home, '.codex-weixin-notifier'),
      MOSS_LAUNCHCTL: launchctl,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  });
}

function agentPlist(home, label, disabled) {
  const agents = join(home, 'Library/LaunchAgents');
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, `${label}.plist`), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>${disabled ? '<key>Disabled</key><true/>' : '<key>RunAtLoad</key><true/>'}</dict></plist>
`);
}

const darwinSkip = process.platform !== 'darwin' ? 'plutil/launchctl 语义仅限 macOS' : false;

test('rust host start matches node control invocation for invocation', { skip: !existsSync(cargo) ? 'cargo 未安装' : darwinSkip }, () => {
  execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 });
  const scenario = (disabled) => {
    const home = sandbox();
    agentPlist(home, 'local.codex-weixin-notifier', disabled);
    agentPlist(home, 'local.codex-weixin-desktop-watch', disabled);
    const logNode = join(home, 'log-node');
    const logRust = join(home, 'log-rust');
    writeFileSync(logNode, '');
    writeFileSync(logRust, '');
    try {
      const nodeOut = runWithLaunchctl(home, fakeLaunchctl(logNode), process.execPath, [join(root, 'src/client-control.mjs'), 'start']);
      const rustOut = runWithLaunchctl(home, fakeLaunchctl(logRust), mossHost, ['start']);
      assert.equal(rustOut, nodeOut, 'start 输出字节级一致');
      const a = readFileSync(logNode, 'utf8');
      const b = readFileSync(logRust, 'utf8');
      assert.equal(b, a, 'launchctl 调用序列完全一致');
      return a;
    } finally { rmSync(home, { recursive: true, force: true }); }
  };
  const disabledLog = scenario(true);
  assert.doesNotMatch(disabledLog, /bootstrap/, 'Disabled 代理绝不引导（双方一致）');
  const enabledLog = scenario(false);
  assert.match(enabledLog, /bootstrap .*local\.codex-weixin-notifier\.plist/);
  assert.match(enabledLog, /bootstrap .*local\.codex-weixin-desktop-watch\.plist/);
  assert.match(enabledLog, /print gui\/\d+\/local\.codex-weixin-notifier/, '快照阶段同样查询服务状态');
});

test('rust host stop matches node control output', { skip: !existsSync(cargo) ? 'cargo 未安装' : darwinSkip }, () => {
  execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 });
  const home = sandbox();
  try {
    const nodeOut = run(home, process.execPath, [join(root, 'src/client-control.mjs'), 'stop']);
    const rustOut = run(home, mossHost, ['stop']);
    assert.equal(rustOut, nodeOut, 'stop 输出字节级一致（对未注册代理双方均为安全空操作）');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('rust host serve speaks the minimal stdio protocol subset', { skip: !existsSync(cargo) ? 'cargo 未安装，跳过 Rust 宿主测试' : false }, async () => {
  execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 });
  const { spawn } = await import('node:child_process');
  const proc = spawn(mossHost, ['serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buffer = '';
  proc.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) { lines.push(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
  });
  proc.stdin.write(JSON.stringify({ type: 'tasks' }) + '\n');
  proc.stdin.write(JSON.stringify({ type: 'configure', settings: { name: '沐言', wakeWord: '沐言' }, keys: { yunqiao: 'k1', deepseek: 'k2', fish: '' } }) + '\n');
  proc.stdin.write(JSON.stringify({ type: 'listen', enabled: true }) + '\n');
  proc.stdin.write(JSON.stringify({ type: 'text', text: 'hi' }) + '\n');
  proc.stdin.write('not-json\n');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('serve 无响应')), 10000);
    const poll = setInterval(() => { if (lines.length >= 6) { clearInterval(poll); clearTimeout(timer); resolve(); } }, 50);
  });
  proc.stdin.end();
  proc.kill();
  const events = lines.map(line => JSON.parse(line));
  const tasks = events[0];
  assert.equal(tasks.type, 'tasks');
  assert.equal(tasks.available, false);
  assert.deepEqual(tasks.tasks, []);
  assert.match(tasks.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(tasks.error, /P3/);
  const configured = events[1];
  assert.equal(configured.type, 'configured');
  assert.equal(configured.settings.name, '沐言');
  assert.equal(configured.hasGateway, true);
  assert.equal(configured.hasDeepSeek, true);
  assert.equal(configured.hasFish, false);
  const state = events[2];
  assert.equal(state.type, 'state');
  assert.equal(state.name, 'error');
  assert.match(state.detail, /P3/);
  const capture = events[3];
  assert.equal(capture.type, 'capture');
  assert.equal(capture.enabled, false);
  assert.equal(events[4].type, 'error');
  assert.match(events[4].message, /不支持的类型/);
  assert.equal(events[5].type, 'error');
  assert.match(events[5].message, /无法解析/);
});

test('bundle client-settings keeps the runtime-engine switch defaulting to node', () => {
  const build = readFileSync(join(root, 'client/build.py'), 'utf8');
  assert.match(build, /MOSS_RUNTIME_ENGINE/);
  assert.match(build, /'runtimeEngine': engine/);
  assert.match(build, /if engine not in \('node', 'rust'\)/, '引擎值必须白名单校验');
  const bridge = readFileSync(join(root, 'client/AssistantBridge.swift'), 'utf8');
  assert.match(bridge, /settings\.runtimeEngine == "rust"/);
  assert.match(bridge, /moss-host"/);
  const app = readFileSync(join(root, 'client/App.swift'), 'utf8');
  assert.match(app, /let runtimeEngine: String\?/, '旧配置缺字段时容错解码');
});
