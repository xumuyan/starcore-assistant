import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
