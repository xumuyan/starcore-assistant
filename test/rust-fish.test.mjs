// Rust Fish synthesis sandbox: mirrors src/assistant-service.mjs speak() — endpoint
// headers/body, 45s timeout, 20 MiB cap, exact fallback strings, and playback
// ownership during synthesis. HOME and state dir are isolated; the Fish/relay
// mocks are local HTTP servers; no real Fish API or paid endpoint is contacted.
// JSON events only: nothing here proves real AVFoundation playback on a device.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { enqueue, prepare } from '../src/store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = join(homedir(), '.cargo/bin/cargo');
const host = process.env.MOSS_FISH_TEST_HOST || join(root, 'rust-host/target/debug/moss-host');
const skip = !existsSync(cargo) ? 'cargo 未安装' : false;
before(() => { if (!skip && !process.env.MOSS_FISH_TEST_HOST) execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 }); });

const AUDIO = Buffer.from('synthetic-fish-audio');
const REPLY = '**好的**，见[文档](https://x.y)。\n```js\nx=1\n```';
// speechText: code block → 代码已显示在屏幕上。, link → 文档, marks stripped.
const SPOKEN = '好的，见文档。\n代码已显示在屏幕上。';

async function waitFor(fn, label, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = fn(); if (result) return result; await delay(20); }
  assert.fail(`等待超时：${label}`);
}

async function harness(t, { settings = {}, keys = {}, chat = null, fish = null, fishTimeout = '45000', chatTimeout = '15000' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'moss-fish-'));
  const dir = join(home, 'state');
  prepare(dir);
  const handlers = { chat: chat ?? ((rq, res) => res.end(JSON.stringify({ output_text: REPLY }))), fish: fish ?? ((rq, res) => res.end(AUDIO)) };
  const chatRequests = [], fishRequests = [], held = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const hit = { url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
      if (req.url === '/v1/responses') { chatRequests.push(hit); handlers.chat(hit, res, held); }
      else { fishRequests.push(hit); handlers.fish(hit, res, held); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const proc = spawn(host, ['serve'], {
    env: {
      HOME: home, CODEX_WEIXIN_STATE_DIR: dir,
      MOSS_CHAT_TIMEOUT_MS: chatTimeout, MOSS_FISH_URL: `${base}/fish`, MOSS_FISH_TIMEOUT_MS: fishTimeout,
    },
  });
  const events = [];
  let buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) { events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
  });
  t.after(async () => {
    if (proc.exitCode === null && proc.signalCode === null) { const exited = once(proc, 'exit'); proc.kill(); await exited; }
    for (const res of held) res.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(home, { recursive: true, force: true });
  });
  const send = (...messages) => proc.stdin.write(messages.map(m => JSON.stringify(m)).join('\n') + '\n');
  const event = (fn, from = 0) => waitFor(() => events.slice(from).find(fn), '宿主事件');
  const from = events.length;
  send({ type: 'configure', settings: { speak: true, voice: 'fish', chatBaseUrl: `${base}/v1`, ...settings }, keys: { yunqiao: 'synthetic-key', fish: 'synthetic-fish-key', ...keys } });
  await event(e => e.type === 'configured', from);
  const count = type => events.filter(e => e.type === type).length;
  return { home, dir, proc, send, events, event, count, chatRequests, fishRequests, held, handlers };
}

const writeReminder = (dir, turn, project) => enqueue({
  type: 'agent-turn-complete', 'thread-id': 'synthetic-thread', 'turn-id': turn,
  cwd: `/synthetic/${project}`, 'last-assistant-message': '合成摘要，不代表测试通过',
}, dir);

test('Fish synthesis plays base64 audio and releases only on its own acknowledgement', { skip }, async t => {
  const h = await harness(t);
  const at = h.events.length;
  h.send({ type: 'text', text: '合成问题' });
  const play = await h.event(e => e.type === 'play');
  assert.equal(play.audio, AUDIO.toString('base64'));
  assert.equal(typeof play.playbackId, 'string');
  assert.equal(h.count('speak'), 0, '成功路径不再降级系统声音');
  assert.equal(h.count('error'), 0);
  assert.deepEqual(
    h.events.slice(at).filter(e => e.type === 'state').map(e => [e.name, e.detail]),
    [['thinking', '云桥聊天正在回复'], ['idle', '回复已就绪'], ['synthesizing', '正在生成 Fish Audio 语音']],
  );
  const fish = h.fishRequests[0];
  assert.equal(fish.headers.authorization, 'Bearer synthetic-fish-key');
  assert.equal(fish.headers['content-type'], 'application/json');
  assert.equal(fish.headers.model, 's2.1-pro-free', '与 node 默认 fishModel 一致');
  assert.deepEqual(fish.body, { text: SPOKEN, format: 'mp3' });
  assert.deepEqual(h.chatRequests[0].body.model, 'gpt-6-astra');
  const from = h.events.length;
  h.send({ type: 'playbackEnded', playbackId: play.playbackId });
  await h.event(e => e.type === 'state' && e.detail === '播放结束', from);
  assert.equal(h.events[from].type, 'state', '结束事件紧跟确认，无其他输出');
  assert.equal(h.count('codexReminder'), 0);
  assert.equal(h.fishRequests.length, 1);
});

test('Fish request carries configured fishModel and voiceId reference', { skip }, async t => {
  const h = await harness(t, { settings: { fishModel: 's2-pro', voiceId: 'synth_voice' } });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'play');
  assert.equal(h.fishRequests[0].headers.model, 's2-pro');
  assert.deepEqual(h.fishRequests[0].body, { text: SPOKEN, format: 'mp3', reference_id: 'synth_voice' });
});

test('Fish HTTP failure and malformed payloads fall back to system voice with exact strings', { skip }, async t => {
  for (const [label, handler, message] of [
    ['HTTP 500', (rq, res) => { res.statusCode = 500; res.end('boom'); }, 'Fish Audio 请求失败（HTTP 500），本次使用系统声音'],
    ['空响应', (rq, res) => res.end(), '语音响应大小异常，本次使用系统声音'],
    ['超过 20MiB', (rq, res) => res.end(Buffer.alloc(20 * 1024 * 1024 + 1)), '语音响应大小异常，本次使用系统声音'],
  ]) {
    const h = await harness(t, { fish: (rq, res, held) => handler(rq, res, held) });
    h.send({ type: 'text', text: '合成问题' });
    await h.event(e => e.type === 'error' && e.message === message);
    const speech = await h.event(e => e.type === 'speak');
    assert.equal(speech.text, SPOKEN, `${label}：降级播报口语文本`);
    assert.equal(typeof speech.playbackId, 'string');
    assert.equal(h.count('play'), 0, `${label}：失败后不得播放半成品音频`);
    const from = h.events.length;
    h.send({ type: 'playbackEnded', playbackId: speech.playbackId });
    await h.event(e => e.detail === '播放结束', from);
    assert.equal(h.chatRequests.length, 1, `${label}：聊天本体不受语音失败影响`);
  }
});

test('missing Fish key keeps the honest fallback without contacting Fish', { skip }, async t => {
  const h = await harness(t, { keys: { fish: '' } });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'error' && e.message === 'Fish API Key 未配置，本次使用系统声音');
  const speech = await h.event(e => e.type === 'speak');
  assert.equal(speech.text, SPOKEN);
  assert.equal(h.fishRequests.length, 0, '未配置密钥不得发起 Fish 请求');
});

test('cancel during synthesis drops the result silently and frees the assistant', { skip }, async t => {
  const h = await harness(t, { fish: (rq, res, held) => held.push(res) });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'state' && e.name === 'synthesizing');
  const at = h.events.length;
  h.send({ type: 'cancel' });
  await h.event(e => e.type === 'state' && e.detail === '已打断', at);
  assert.equal(h.events[at].type, 'stopAudio');
  while (h.held.length) h.held.pop().end(AUDIO);
  await delay(1000);
  assert.equal(h.count('play'), 0, '取消后的合成结果不得播放');
  assert.equal(h.count('speak'), 0, '取消路径与 node AbortError 一样静默');
  assert.equal(h.count('error'), 0);
  const stale = h.events.length;
  h.send({ type: 'playbackEnded', playbackId: 'rust-1' });
  await delay(300);
  assert.equal(h.events.slice(stale).some(e => e.detail === '播放结束'), false);
  h.handlers.fish = (rq, res) => res.end(AUDIO);
  h.send({ type: 'text', text: '再次提问' });
  const retry = await h.event(e => e.type === 'play');
  assert.notEqual(retry.playbackId, 'rust-1');
  assert.equal(h.fishRequests.length, 2);
});

test('a new text during Fish synthesis is rejected like node busy, then proceeds after 打断', { skip }, async t => {
  const h = await harness(t, { fish: (rq, res, held) => held.push(res) });
  h.send({ type: 'text', text: '第一条' });
  await h.event(e => e.type === 'state' && e.name === 'synthesizing');
  h.send({ type: 'text', text: '第二条' });
  await h.event(e => e.type === 'error' && e.message === '正在回复，可先点击「打断」再提交');
  assert.equal(h.count('speak'), 0);
  assert.equal(h.chatRequests.length, 1, '合成期间不并发第二个聊天请求');
  h.send({ type: 'cancel' });
  await h.event(e => e.type === 'state' && e.detail === '已打断');
  while (h.held.length) h.held.pop().end(AUDIO);
  await delay(800);
  assert.equal(h.count('play'), 0, '被打断会话的合成结果不得复活');
  h.handlers.fish = (rq, res) => res.end(AUDIO);
  h.send({ type: 'text', text: '第三条' });
  await h.event(e => e.type === 'play');
  assert.equal(h.count('error'), 1);
});

test('completion reminder waits through Fish synthesis then announces with its own playback', { skip }, async t => {
  const h = await harness(t, { settings: { codexVoiceReminder: true }, fish: (rq, res, held) => held.push(res) });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'state' && e.name === 'synthesizing');
  const reminder = writeReminder(h.dir, 'turn-a', '提醒项目');
  await waitFor(() => !existsSync(join(h.dir, 'events', `${reminder.id}.json`)), '提醒事件被消费');
  await delay(1200);
  assert.equal(h.count('codexReminder'), 0, '合成/播放占用期间提醒不得插播');
  const chat = await (() => { const res = h.held.shift(); const done = h.event(e => e.type === 'play'); res.end(AUDIO); return done; })();
  h.send({ type: 'playbackEnded', playbackId: chat.playbackId });
  h.handlers.fish = (rq, res) => res.end(AUDIO);
  await h.event(e => e.type === 'codexReminder');
  const second = await h.event(e => e.type === 'state' && e.name === 'synthesizing' && h.events.indexOf(e) > h.events.findIndex(x => x.type === 'codexReminder'));
  assert.ok(second);
  const reminderPlay = await h.event(e => e.type === 'play' && e.playbackId !== chat.playbackId);
  assert.notEqual(reminderPlay.playbackId, chat.playbackId);
  assert.equal(h.count('speak'), 0, '提醒同样走 Fish 合成而非系统声音');
  assert.equal(h.fishRequests.length, 2);
  assert.equal(h.fishRequests[1].body.text, '提醒项目的 Codex 本轮已结束');
});

test('Fish synthesis timeout falls back to system voice and releases the gate', { skip }, async t => {
  const h = await harness(t, { fishTimeout: '500', fish: () => {} });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'state' && e.name === 'synthesizing');
  const failure = await h.event(e => e.type === 'error', 0);
  assert.match(failure.message, /，本次使用系统声音$/);
  assert.doesNotMatch(failure.message, /HTTP \d/);
  const speech = await h.event(e => e.type === 'speak');
  assert.equal(speech.text, SPOKEN);
  assert.equal(h.count('play'), 0);
  const from = h.events.length;
  h.send({ type: 'playbackEnded', playbackId: speech.playbackId });
  await h.event(e => e.detail === '播放结束', from);
  h.send({ type: 'text', text: '再次提问' });
  const retry = await h.event(e => e.type === 'speak' && h.events.indexOf(e) > from);
  assert.notEqual(retry.playbackId, speech.playbackId, '每次播报使用新的编号');
});

test('dictation stays rejected while Fish synthesis owns the audio gate', { skip }, async t => {
  const h = await harness(t, { settings: { dictationEnabled: true }, fish: (rq, res, held) => held.push(res) });
  h.send({ type: 'text', text: '合成问题' });
  await h.event(e => e.type === 'state' && e.name === 'synthesizing');
  const id = randomUUID();
  h.send({ type: 'dictationPrepare', id });
  const error = await h.event(e => e.type === 'dictationError');
  assert.equal(error.id, id);
  assert.equal(error.message, '助手正在工作，请稍后听写');
  assert.equal(h.count('speak'), 0);
  assert.equal(h.count('play'), 0);
  while (h.held.length) h.held.pop().end(AUDIO);
});
