import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ensureHostBinary } from '../test-helpers/rust-host-bin.mjs';
import { DatabaseSync } from 'node:sqlite';
import { enqueue, prepare } from '../src/store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = join(homedir(), '.cargo/bin/cargo');
const host = process.env.MOSS_REMINDER_TEST_HOST || join(root, 'rust-host/target/debug/moss-host');
const skip = !existsSync(cargo) ? 'cargo 未安装' : false;
before(() => { if (!skip && !process.env.MOSS_REMINDER_TEST_HOST) execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 }); });
async function waitFor(fn, label, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = fn(); if (result) return result; await delay(20); }
  assert.fail(`等待超时：${label}`);
}
async function harness(t, { initial = {}, setup = () => {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'moss-reminder-')), dir = join(home, 'state');
  prepare(dir);
  const write = (turn, project = '合成项目', time) => {
    const event = enqueue({ type: 'agent-turn-complete', 'thread-id': 'synthetic-thread', 'turn-id': turn, cwd: `/synthetic/${project}`, 'last-assistant-message': '合成摘要，不代表测试通过' }, dir);
    if (time) { event.time = time; writeFileSync(join(dir, 'events', `${event.id}.json`), JSON.stringify(event)); }
    return event;
  };
  setup({ home, dir, write });
  const requests = [], events = [];
  const server = createServer((req, res) => { req.resume(); req.on('end', () => requests.push(res)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  await ensureHostBinary(host);
  const proc = spawn(host, ['serve'], { env: { HOME: home, CODEX_WEIXIN_STATE_DIR: dir, MOSS_CHAT_TIMEOUT_MS: '15000' } });
  let buffer = '';
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', chunk => {
    buffer += chunk; let end;
    while ((end = buffer.indexOf('\n')) !== -1) { events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
  });
  t.after(async () => {
    if (proc.exitCode === null && proc.signalCode === null) { const exited = once(proc, 'exit'); proc.kill(); await exited; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    rmSync(home, { recursive: true, force: true });
  });
  const send = (...messages) => proc.stdin.write(messages.map(m => JSON.stringify(m)).join('\n') + '\n');
  const event = (fn, from = 0) => waitFor(() => events.slice(from).find(fn), '宿主事件');
  const configure = async settings => {
    const from = events.length;
    send({ type: 'configure', settings: { speak: false, chatBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, ...settings }, keys: { yunqiao: 'synthetic-key' } });
    await event(e => e.type === 'configured', from);
  };
  await configure(initial);
  const consumed = item => waitFor(() => !existsSync(join(dir, 'events', `${item.id}.json`)), '事件被消费');
  const count = type => events.filter(e => e.type === type).length;
  return { home, dir, proc, write, events, requests, send, event, configure, consumed, count };
}

test('Rust consumes history/default-off arrivals without replay; explicit reminder opt-in ignores chat speak switch', { skip }, async t => {
  let old;
  const h = await harness(t, { setup: ({ write }) => { old = write('history'); } });
  await h.consumed(old);
  const disabled = h.write('disabled'); await h.consumed(disabled);
  assert.equal(h.count('speak'), 0);
  await h.configure({ codexVoiceReminder: true });
  const fresh = h.write('fresh', '合成项目A'); await h.consumed(fresh);
  const speech = await h.event(e => e.type === 'speak');
  assert.equal(speech.text, '合成项目A的 Codex 本轮已结束');
  assert.equal(typeof speech.playbackId, 'string');
  assert.deepEqual(h.events.find(e => e.type === 'codexReminder'), { type: 'codexReminder', project: '合成项目A', threadId: fresh.threadId, summary: fresh.summary });
  assert.equal(h.count('message'), 0); assert.equal(h.requests.length, 0);
  const db = new DatabaseSync(join(h.dir, 'assistant/conversations.sqlite'), { readOnly: true });
  try { assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sealed_messages').get().n, 0); } finally { db.close(); }
  // Producer can recreate a consumed filename: in-process seen IDs still must not replay.
  h.write('fresh', '重复合成项目');
  await delay(1200); assert.equal(h.count('speak'), 1);
  h.proc.stdin.end();
  await waitFor(() => h.proc.exitCode !== null, 'EOF 结束宿主');
  assert.equal(h.proc.exitCode, 0, 'EOF stops the timer instead of keeping serve alive');
  // A new process treats the recreated event as startup history, not a new turn.
  await ensureHostBinary(host);
  const restarted = spawn(host, ['serve'], { env: { HOME: h.home, CODEX_WEIXIN_STATE_DIR: h.dir } });
  const lines = []; restarted.stdout.on('data', chunk => lines.push(chunk.toString()));
  try {
    restarted.stdin.write(JSON.stringify({ type: 'configure', settings: { codexVoiceReminder: true } }) + '\n');
    await waitFor(() => lines.join('').includes('"type":"configured"'), '重启后的配置回执');
    await h.consumed(fresh); await delay(1100);
    assert.equal(restarted.exitCode, null);
    assert.equal(lines.join('').includes('"type":"speak"'), false);
    assert.equal(lines.join('').includes('"type":"codexReminder"'), false);
  } finally {
    if (restarted.exitCode === null && restarted.signalCode === null) { const exited = once(restarted, 'exit'); restarted.kill(); await exited; }
  }
});

test('Rust reminder waits for chat AND playback, coalesces newest turns, and uses distinct playback IDs', { skip }, async t => {
  const h = await harness(t, { initial: { codexVoiceReminder: true, speak: true } });
  h.send({ type: 'text', text: '合成聊天请求' });
  const response = await waitFor(() => h.requests[0], '本地聊天请求');
  const a = h.write('a', '较新项目', '2026-01-02T00:00:00.000Z');
  const b = h.write('b', '较旧项目', '2026-01-01T00:00:00.000Z');
  await h.consumed(a); await h.consumed(b);
  assert.equal(h.count('codexReminder'), 0);
  const c = h.write('c', '最新项目', '2026-01-03T00:00:00.000Z'); await h.consumed(c);
  response.end(JSON.stringify({ output_text: '合成聊天回复' }));
  const chat = await h.event(e => e.type === 'speak');
  await delay(1100); assert.equal(h.count('codexReminder'), 0, 'chat HTTP completion is not playback completion');
  h.send({ type: 'playbackEnded', playbackId: chat.playbackId });
  const reminder = await h.event(e => e.type === 'speak' && e.text === '最新项目的 Codex 本轮已结束');
  assert.notEqual(reminder.playbackId, chat.playbackId);
  assert.equal(h.count('codexReminder'), 1);
  const d = h.write('d', '下一项目'); await h.consumed(d);
  h.send({ type: 'playbackEnded', playbackId: chat.playbackId });
  await delay(1100); assert.equal(h.count('codexReminder'), 1, 'old acknowledgement cannot release reminder audio');
  h.send({ type: 'playbackEnded', playbackId: reminder.playbackId });
  const next = await h.event(e => e.type === 'speak' && e.text === '下一项目的 Codex 本轮已结束');
  assert.notEqual(next.playbackId, reminder.playbackId);
  assert.equal(h.requests.length, 1, 'reminder never calls chat/Codex');
  const start = h.events.length;
  h.send({ type: 'cancel' }, { type: 'playbackEnded', playbackId: next.playbackId }, { type: 'tasks' });
  await h.event(e => e.type === 'tasks', start);
  assert.equal(h.events[start].type, 'stopAudio');
  assert.equal(h.events.slice(start).some(e => e.detail === '播放结束'), false);
  await delay(1100); assert.equal(h.count('codexReminder'), 2, 'cancelled reminder is never restarted');
});

test('disabling a pending reminder is permanent even if re-enabled before the next poll', { skip }, async t => {
  const h = await harness(t, { initial: { codexVoiceReminder: true } });
  const first = h.write('first'); await h.consumed(first); await h.event(e => e.type === 'speak');
  const pending = h.write('pending'); await h.consumed(pending);
  await h.configure({ codexVoiceReminder: false }); await h.configure({ codexVoiceReminder: true });
  await delay(1200); assert.equal(h.count('speak'), 1);
  const last = h.write('last', '新到达项目'); await h.consumed(last);
  await h.event(e => e.type === 'speak' && e.text === '新到达项目的 Codex 本轮已结束');
  assert.equal(h.count('speak'), 2);
});

test('invalid events, oversized files, symlinks and FIFO never speak or block stdin; unrelated files survive', { skip }, async t => {
  const h = await harness(t, { initial: { codexVoiceReminder: true } });
  const at = letter => join(h.dir, 'events', `${letter.repeat(64)}.json`);
  writeFileSync(at('a'), '{'); writeFileSync(at('b'), JSON.stringify({ id: 'mismatch' }));
  writeFileSync(at('c'), ' '.repeat(65537));
  const outside = join(h.home, 'outside.json'); writeFileSync(outside, JSON.stringify({ id: 'd'.repeat(64), project: '不应读取' }));
  symlinkSync(outside, at('d')); execFileSync('mkfifo', [at('e')]);
  mkdirSync(at('f')); writeFileSync(join(at('f'), 'keep'), 'keep');
  writeFileSync(join(h.dir, 'events', 'unrelated.json'), '{}');
  await waitFor(() => !existsSync(at('a')) && !existsSync(at('e')), '非法事件清理');
  const from = h.events.length; h.send({ type: 'tasks' }); await h.event(e => e.type === 'tasks', from);
  assert.equal(h.count('speak'), 0);
  assert.equal(JSON.parse(readFileSync(outside)).project, '不应读取');
  assert.equal(readFileSync(join(at('f'), 'keep'), 'utf8'), 'keep');
  assert.ok(existsSync(join(h.dir, 'events', 'unrelated.json')));
});

test('a symlinked events directory is never consumed or followed', { skip }, async t => {
  let outside;
  const h = await harness(t, { initial: { codexVoiceReminder: true }, setup: ({ home, dir }) => {
    outside = join(home, 'outside'); mkdirSync(outside);
    writeFileSync(join(outside, `${'a'.repeat(64)}.json`), JSON.stringify({ id: 'a'.repeat(64), project: '保留' }));
    rmSync(join(dir, 'events'), { recursive: true }); symlinkSync(outside, join(dir, 'events'));
  } });
  await delay(1200);
  assert.ok(existsSync(join(outside, `${'a'.repeat(64)}.json`)));
  assert.equal(h.count('codexReminder'), 0);
});

test('reminder requires boolean opt-in and explicitly falls back from unimplemented Fish without network', { skip }, async t => {
  const h = await harness(t, { initial: { codexVoiceReminder: 'true', voice: 'fish' } });
  const skipped = h.write('not-boolean'); await h.consumed(skipped);
  assert.equal(h.count('speak'), 0);
  await h.configure({ codexVoiceReminder: true, voice: 'fish' });
  const fresh = h.write('fish'); await h.consumed(fresh);
  await h.event(e => e.type === 'speak');
  assert.ok(h.events.some(e => e.type === 'error' && /Fish.*系统声音/.test(e.message)));
  assert.equal(h.requests.length, 0); assert.equal(h.count('play'), 0);
});
