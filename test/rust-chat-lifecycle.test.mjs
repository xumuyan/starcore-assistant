import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ensureHostBinary } from '../test-helpers/rust-host-bin.mjs';
import { DatabaseSync } from 'node:sqlite';
import { LocalVault } from '../src/assistant-vault.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = join(homedir(), '.cargo/bin/cargo');
// The same tests can exercise a built release binary without touching the installed app.
const host = process.env.MOSS_LIFECYCLE_TEST_HOST || join(root, 'rust-host/target/debug/moss-host');
const skip = !existsSync(cargo) ? 'cargo 未安装' : false;
before(() => { if (!skip && !process.env.MOSS_LIFECYCLE_TEST_HOST) execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 }); });

async function waitFor(predicate, label, ms = 5000) {
  const deadline = Date.now() + ms;
  do {
    const value = predicate();
    if (value) return value;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail(`等待超时：${label}`);
}

async function harness(t) {
  const home = mkdtempSync(join(tmpdir(), 'moss-lifecycle-'));
  const state = join(home, 'state');
  const requests = [], events = [];
  // Requests are consumed, but responses are released by each test, including split bodies.
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => requests.push({ res, body: JSON.parse(body) }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  await ensureHostBinary(host);
  const proc = spawn(host, ['serve'], { env: { HOME: home, CODEX_WEIXIN_STATE_DIR: state, MOSS_CHAT_TIMEOUT_MS: '3000' } });
  let buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1);
    }
  });
  t.after(async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      const exit = once(proc, 'exit'); proc.kill(); await exit;
    }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    rmSync(home, { recursive: true, force: true });
  });
  const send = (...commands) => proc.stdin.write(commands.map(c => JSON.stringify(c)).join('\n') + '\n');
  const event = (predicate, start = 0) => waitFor(() => events.slice(start).find(predicate), '协议事件');
  const request = index => waitFor(() => requests[index], `HTTP 请求 ${index}`);
  const configure = (settings = {}) => ({ type: 'configure', settings: { chatBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, speak: true, ...settings }, keys: { yunqiao: 'synthetic-test-key' } });
  send(configure()); await event(e => e.type === 'configured');
  const memory = () => {
    const dir = join(state, 'assistant');
    const db = new DatabaseSync(join(dir, 'conversations.sqlite'), { readOnly: true });
    try {
      const vault = new LocalVault(dir);
      return db.prepare('SELECT id,data FROM sealed_messages ORDER BY id').all().map(row => JSON.parse(vault.open(row.data, `message/${row.id}`)));
    } finally { db.close(); }
  };
  const database = action => {
    const db = new DatabaseSync(join(state, 'assistant/conversations.sqlite'));
    try { return action(db); } finally { db.close(); }
  };
  return { send, event, request, configure, memory, database, events, requests };
}
const question = text => ({ type: 'text', text });
function reply(request, text, status = 200) {
  request.res.writeHead(status, { 'Content-Type': 'application/json' });
  request.res.end(JSON.stringify({ output_text: text, usage: { input_tokens: 11, output_tokens: 7 } }));
}
const replyEffects = events => events.filter(e => ['usage', 'speak', 'play', 'error'].includes(e.type) || (e.type === 'message' && e.role === 'assistant') || e.type === 'state');

for (const kind of ['success', 'http-error', 'timeout']) {
  test(`cancel then immediate text: stale ${kind} cannot release the new busy owner`, { skip }, async t => {
    const h = await harness(t);
    h.send(question('旧请求')); const old = await h.request(0);
    // For timeout, leave enough of a gap that the replacement remains in flight.
    if (kind === 'timeout') await delay(1100);
    const start = h.events.length;
    h.send({ type: 'cancel' }, question('新请求'));
    const current = await h.request(1);
    await h.event(e => e.type === 'state' && e.name === 'thinking', start);
    const afterStart = h.events.length;
    if (kind === 'timeout') await delay(2100);
    else { reply(old, '不应出现的旧回复', kind === 'http-error' ? 500 : 200); await delay(200); }
    h.send(question('忙时不应接纳'));
    await h.event(e => e.type === 'error' && /正在回复/.test(e.message), afterStart);
    assert.deepEqual(replyEffects(h.events.slice(afterStart)).map(e => e.type), ['error'], '旧请求不得发 usage/message/speak/state/error');
    assert.equal(h.events[start].type, 'stopAudio', '打断先停止原生播放');
    assert.equal(h.requests.length, 2);
    reply(current, '唯一的新回复');
    await h.event(e => e.type === 'speak' && e.text === '唯一的新回复', afterStart);
    assert.deepEqual(h.memory().map(m => m.content), ['旧请求', '新请求', '唯一的新回复']);
  });
}

for (const command of ['cancel', 'clear', 'sleep', 'configure', 'listen']) {
  test(`${command} during response body suppresses every stale effect and preserves new requests`, { skip }, async t => {
    const h = await harness(t);
    h.send(question('等待慢响应体'));
    const old = await h.request(0);
    old.res.writeHead(200, { 'Content-Type': 'application/json' });
    old.res.write('{"output_text":"'); // Headers arrive while JSON body is still incomplete.
    await delay(120);
    const start = h.events.length;
    h.send(command === 'configure' ? h.configure({ speak: false }) : { type: command, ...(command === 'listen' ? { enabled: false } : {}) }, { type: 'tasks' });
    await h.event(e => e.type === 'tasks', start); // stdin barrier: control command fully processed
    if (command === 'clear') {
      assert.ok(h.events.slice(start).some(e => e.type === 'history' && e.messages.length === 0));
      assert.deepEqual(h.memory(), []);
    }
    const afterControl = h.events.length;
    old.res.end('旧结果","usage":{"input_tokens":91,"output_tokens":92}}');
    await delay(200);
    assert.deepEqual(replyEffects(h.events.slice(afterControl)), [], '完整读取 body 后也必须再次校验请求所有权');
    assert.equal(h.events[start].type, 'stopAudio');
    assert.deepEqual(h.memory().map(m => m.content), command === 'clear' ? [] : ['等待慢响应体']);
    h.send(question('控制后的新请求')); const next = await h.request(1);
    reply(next, '新的有效结果');
    await h.event(e => e.type === 'state' && e.detail === '回复已就绪', afterControl);
    if (command === 'configure') {
      await delay(50);
      assert.equal(h.events.slice(afterControl).some(e => e.type === 'speak'), false, '仅新请求采用新配置');
    } else await h.event(e => e.type === 'speak', afterControl);
  });
}

test('same-input batch preserves text/cancel/clear ordering before the HTTP worker starts', { skip }, async t => {
  const h = await harness(t);
  for (let i = 0; i < 12; i++) {
    const start = h.events.length;
    h.send(question(`合成批次 ${i}`), { type: 'cancel' }, { type: 'clear' }, { type: 'tasks' });
    await h.event(e => e.type === 'tasks', start);
    const events = h.events.slice(start);
    const userAt = events.findIndex(e => e.type === 'message' && e.role === 'user');
    assert.ok(userAt >= 0 && userAt < events.findIndex(e => e.type === 'tasks'));
    assert.ok(events.some(e => e.type === 'history' && e.messages.length === 0));
    assert.deepEqual(h.memory(), [], 'clear 之后不能由尚未启动的旧 worker 重新写入 user');
  }
  const start = h.events.length;
  for (const req of h.requests) reply(req, '迟到的批次结果');
  await delay(200);
  assert.deepEqual(replyEffects(h.events.slice(start)), []);
  assert.deepEqual(h.memory(), []);
});

test('rapid duplicate text has one owner; idle cancel still stops completed speech', { skip }, async t => {
  const h = await harness(t);
  const start = h.events.length;
  h.send(question('首条'), question('应拒绝一'), question('应拒绝二'));
  const req = await h.request(0);
  await waitFor(() => h.events.slice(start).filter(e => e.type === 'error' && /正在回复/.test(e.message)).length === 2, '两次 busy 拒绝');
  assert.equal(h.requests.length, 1);
  assert.equal(h.events[start].type, 'stopAudio');
  reply(req, '正在播放的结果');
  await h.event(e => e.type === 'speak', start);
  const after = h.events.length;
  h.send({ type: 'cancel' }, { type: 'tasks' });
  await h.event(e => e.type === 'tasks', after);
  assert.equal(h.events[after].type, 'stopAudio');
  assert.deepEqual(h.memory().map(m => m.content), ['首条', '正在播放的结果']);
});

test('clear failure never announces an empty history or successful deletion', { skip }, async t => {
  const h = await harness(t);
  h.send(question('保留的合成消息')); const pending = await h.request(0);
  reply(pending, '已保存的合成回复');
  await h.event(e => e.type === 'speak');
  // Reject DELETE without removing or corrupting the test database.
  h.database(db => db.exec("CREATE TRIGGER reject_clear BEFORE DELETE ON sealed_messages BEGIN SELECT RAISE(ABORT, 'synthetic clear failure'); END"));
  const start = h.events.length;
  h.send({ type: 'clear' }, { type: 'tasks' });
  await h.event(e => e.type === 'tasks', start);
  const events = h.events.slice(start);
  assert.equal(events[0].type, 'stopAudio');
  assert.ok(events.some(e => e.type === 'error' && /清空失败/.test(e.message)));
  assert.equal(events.some(e => e.type === 'history' || e.detail === '对话已清空'), false);
  assert.deepEqual(h.memory().map(m => m.content), ['保留的合成消息', '已保存的合成回复']);
});

for (const invalid of ['malformed-json', 'http-error', 'api-error', 'missing-text', 'timeout']) {
  test(`current ${invalid} releases only its own request and permits retry`, { skip }, async t => {
    const h = await harness(t);
    const start = h.events.length;
    h.send(question('会失败的合成请求')); const req = await h.request(0);
    if (invalid === 'malformed-json') req.res.end('{"output_text":');
    else if (invalid === 'http-error') reply(req, '不能作为回复展示', 500);
    else if (invalid !== 'timeout') req.res.end(JSON.stringify(invalid === 'api-error' ? { error: { message: 'synthetic' } } : {}));
    await h.event(e => e.type === 'state' && e.name === 'error', start);
    assert.equal(h.events.slice(start).filter(e => e.type === 'error').length, 1);
    assert.equal(h.events.slice(start).some(e => e.type === 'speak' || e.role === 'assistant'), false);
    h.send(question('失败后的重试')); reply(await h.request(1), '重试成功');
    await h.event(e => e.type === 'speak' && e.text === '重试成功', start);
    assert.deepEqual(h.memory().map(m => m.content), ['会失败的合成请求', '失败后的重试', '重试成功']);
  });
}

const dictationID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function barrier(h, ...commands) {
  const start = h.events.length;
  h.send(...commands, { type: 'tasks' });
  await h.event(e => e.type === 'tasks', start);
  return h.events.slice(start).filter(e => e.type !== 'tasks');
}
async function enableDictation(h, settings = {}) {
  await barrier(h, h.configure({ dictationEnabled: true, ...settings }));
}
function assertDictationRejected(events, pattern) {
  const failure = events.find(e => e.type === 'dictationError');
  assert.ok(failure, '原生听写面板必须收到带 ID 的失败事件，不等到超时');
  assert.equal(failure.id, dictationID);
  assert.match(failure.message, pattern);
  assert.equal(events.some(e => ['dictationReady', 'dictationResult', 'speak', 'play'].includes(e.type)), false);
}

test('playback IDs hold the audio gate until a matching completion, never a missing or wrong ID', { skip }, async t => {
  const h = await harness(t); await enableDictation(h);
  h.send(question('合成播放请求')); const pending = await h.request(0);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /正在工作/);
  reply(pending, '合成播放内容');
  const speech = await h.event(e => e.type === 'speak');
  assert.equal(typeof speech.playbackId, 'string'); assert.ok(speech.playbackId.length > 0);
  for (const ended of [{}, { playbackId: 'unknown' }, { playbackId: 42 }]) {
    assert.deepEqual(await barrier(h, { type: 'playbackEnded', ...ended }), []);
    assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /正在工作/);
  }
  assert.deepEqual(await barrier(h, { type: 'playbackEnded', playbackId: speech.playbackId }), [
    { type: 'state', name: 'idle', detail: '播放结束' },
  ]);
  assert.deepEqual(await barrier(h, { type: 'playbackEnded', playbackId: speech.playbackId }), []);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /暂不支持.*听写/);
});

test('old playback completion cannot reset a newer chat or its replacement speech', { skip }, async t => {
  const h = await harness(t); await enableDictation(h);
  h.send(question('第一轮')); reply(await h.request(0), '第一段声音');
  const first = await h.event(e => e.type === 'speak');
  const start = h.events.length;
  h.send(question('第二轮')); const pending = await h.request(1);
  assert.equal(h.events[start].type, 'stopAudio');
  assert.deepEqual(await barrier(h, { type: 'playbackEnded', playbackId: first.playbackId }), []);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /正在工作/);
  reply(pending, '第二段声音');
  const second = await h.event(e => e.type === 'speak', start);
  assert.notEqual(first.playbackId, second.playbackId);
  assert.deepEqual(await barrier(h, { type: 'playbackEnded', playbackId: first.playbackId }), []);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /正在工作/);
  await barrier(h, { type: 'playbackEnded', playbackId: second.playbackId });
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /暂不支持.*听写/);
});

for (const control of ['cancel', 'clear', 'sleep', 'configure', 'listen']) {
  test(`${control} resets playback ownership and ignores its late completion`, { skip }, async t => {
    const h = await harness(t); await enableDictation(h);
    h.send(question('待停止的播放')); reply(await h.request(0), '将被打断');
    const speech = await h.event(e => e.type === 'speak');
    const command = control === 'configure' ? h.configure({ dictationEnabled: true }) : { type: control, enabled: false };
    const stopped = await barrier(h, command);
    assert.equal(stopped[0].type, 'stopAudio');
    assert.deepEqual(await barrier(h, { type: 'playbackEnded', playbackId: speech.playbackId }), []);
    assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /暂不支持.*听写/);
  });
}

test('silent replies do not claim playback, while Fish fallback holds the same audio gate', { skip }, async t => {
  const h = await harness(t); await enableDictation(h, { speak: false });
  h.send(question('无声回复')); reply(await h.request(0), '只显示');
  await h.event(e => e.detail === '回复已就绪');
  assert.equal(h.events.some(e => e.type === 'speak'), false);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /暂不支持.*听写/);
  await enableDictation(h, { voice: 'fish' });
  const start = h.events.length;
  h.send(question('降级回复')); reply(await h.request(1), '用系统声音');
  const speech = await h.event(e => e.type === 'speak', start);
  assert.equal(typeof speech.playbackId, 'string');
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /正在工作/);
  await barrier(h, { type: 'playbackEnded', playbackId: speech.playbackId });
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /暂不支持.*听写/);
});

test('unsupported Rust dictation fails promptly by ID without capture, cloud calls or fake readiness', { skip }, async t => {
  const h = await harness(t);
  assertDictationRejected(await barrier(h, { type: 'dictationPrepare', id: dictationID }), /请先启用/);
  await enableDictation(h);
  for (const type of ['dictationPrepare', 'dictationChunk', 'dictationFinish']) {
    assertDictationRejected(await barrier(h, { type, id: dictationID, audio: 'synthetic-invalid-audio' }), /暂不支持.*听写/);
  }
  assert.deepEqual(await barrier(h, { type: 'dictationCancel', id: dictationID }), []);
  for (const id of [undefined, null, 42, 'bad-id', 'x'.repeat(1000)]) {
    assert.deepEqual(await barrier(h, { type: 'dictationPrepare', id }), []);
  }
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.memory(), []);
  assert.equal(h.events.some(e => ['dictationReady', 'dictationResult', 'speak', 'play', 'capture'].includes(e.type)), false);
});
