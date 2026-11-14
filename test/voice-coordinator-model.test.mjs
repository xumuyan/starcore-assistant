import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';

const request = (n = 1) => ({ origin: 'wake', mode: 'conversation', requestId: `synthetic-${n}` });
const dictation = (n = '1') => ({ origin: 'right-control', mode: 'dictation', requestId: `00000000-0000-4000-8000-${n.padStart(12, '0')}` });
const model = options => new VoiceCoordinatorModel({ enabled: true, epoch: 'synthetic-epoch-1', ...options });
function listening(m, input = request()) {
  const session = m.reserve(input);
  const capture = m.acquire(session, 'capture', `capture-${session.run}`);
  assert.equal(m.inputReady(session, capture), true);
  return { session, capture };
}
function thinking(m) {
  const { session, capture } = listening(m);
  assert.equal(m.process(session), false, 'stop acknowledgement required');
  assert.equal(m.released(capture, { stopped: true }), true);
  assert.equal(m.process(session), true);
  const chat = m.acquire(session, 'chat', 'chat-1');
  assert.equal(m.deliver(chat, { type: 'reply', text: '合成回复' }), true);
  return { session, chat };
}

test('model is opt-in and excludes nonvoice origins, malformed IDs and competing modes', () => {
  assert.equal(new VoiceCoordinatorModel({ epoch: 'off' }).reserve(request()), null);
  const m = model();
  for (const origin of ['text', 'chat', 'history', 'previewVoice', 'codexReminder', 'error', undefined]) {
    assert.equal(m.reserve({ ...request(), origin }), null);
  }
  assert.equal(m.reserve({ ...dictation(), requestId: 'not-uuid' }), null);
  assert.equal(m.reserve({ ...request(), mode: 'dictation' }), null);
  const s = m.reserve(request());
  assert.ok(s); assert.ok(Object.isFrozen(s));
  assert.equal(m.reserve(dictation()), null);
  assert.equal(m.snapshot().view.active, false, 'reservation is not recording');
});

test('input ready requires the original captured ownership, not a copied or foreign handle', () => {
  const a = model(), b = model();
  const s = a.reserve(request()), other = b.reserve(request());
  const capture = a.acquire(s, 'capture', 'capture');
  const foreign = b.acquire(other, 'capture', 'capture');
  for (const invalid of [null, {}, { ...capture }, foreign]) assert.equal(a.inputReady(s, invalid), false);
  assert.equal(a.acquire({ ...s }, 'asr', 'asr'), null);
  assert.equal(a.acquire(s, 'player', 'player'), null);
  assert.equal(a.inputReady(s, capture), true);
  assert.equal(a.inputReady(s, capture), false);
  assert.equal(a.snapshot().view.seq, 0);
});

test('UUID mapping is one run per reservation; finished IDs cannot be reused in an epoch', () => {
  const m = model(); const s = m.reserve(dictation('a'));
  assert.equal(s.run, 1); assert.equal(s.requestId, dictation('a').requestId);
  assert.equal(m.close(s), true);
  assert.equal(m.reserve(dictation('A')), null, 'case-normalized duplicate UUID');
  const next = m.reserve(dictation('b'));
  assert.equal(next.run, 2);
  assert.equal(m.close(s), false);
});

test('single serialized delivery assigns seq on accepted arrivals, never worker start or caller seq', () => {
  const m = model(); const { session, capture } = listening(m);
  const asr = m.acquire(session, 'asr', 'slow-asr');
  assert.equal(m.deliver(capture, { type: 'meter', source: 'output', level: .8 }), false);
  assert.equal(m.deliver(capture, { type: 'reply', text: 'wrong source' }), false);
  assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: .4, run: 999, seq: 999 }), true);
  assert.equal(m.snapshot().view.seq, 1); assert.equal(m.snapshot().view.run, 1);
  assert.equal(m.deliver(asr, { type: 'transcript', text: '合成最终文字', seq: 0 }), true);
  assert.equal(m.snapshot().view.seq, 2);
  assert.equal(m.deliver(asr, { type: 'transcript', text: '字'.repeat(8001) }), false);
  assert.equal(m.snapshot().view.seq, 2, 'rejection consumes no delivery sequence');
});

test('explicit microtask completion order keeps late text after high-frequency meters', async () => {
  const m = model(); const { session, capture } = listening(m);
  const asr = m.acquire(session, 'asr', 'pending-asr');
  let resolve;
  const pending = new Promise(done => { resolve = done; }).then(() => m.deliver(asr, { type: 'transcript', text: '合成异步文字' }));
  for (let i = 0; i < 50; i++) assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: .2 }), true);
  resolve(); assert.equal(await pending, true);
  assert.equal(m.snapshot().view.seq, 51);
  assert.equal(m.snapshot().view.text, '合成异步文字');
});

test('process waits for capture release; late final ASR remains rejected by unchanged view protocol', () => {
  const m = model(); const { session, capture } = listening(m, dictation());
  const asr = m.acquire(session, 'asr', 'asr');
  assert.equal(m.process(session), false);
  assert.equal(m.released(capture, { stopped: false }), false);
  assert.equal(m.process(session), false);
  assert.equal(m.released(capture, { stopped: true }), true);
  assert.equal(m.process(session), true);
  assert.equal(m.acquire(session, 'capture', 'restart-capture'), null);
  assert.equal(m.deliver(asr, { type: 'transcript', text: '晚到最终合成文字' }), false);
  for (const role of ['chat', 'tts', 'player']) assert.equal(m.acquire(session, role, role), null);
  const writer = m.acquire(session, 'writer', 'writer');
  assert.equal(m.deliver(writer, { type: 'reply', text: 'not insertion evidence' }), false);
});

test('player attempts reject replaced, copied and stale callbacks; only explicit start speaks', () => {
  const m = model(); const { session } = thinking(m);
  const tts = m.acquire(session, 'tts', 'tts');
  assert.equal(m.deliver(tts, { type: 'synthesis-started' }), true);
  const old = m.acquire(session, 'player', 'attempt-1');
  assert.equal(m.snapshot().view.activity, 'synthesizing');
  assert.equal(m.deliver(tts, { type: 'playback-started' }), false);
  assert.equal(m.released(old, { stopped: true }), true);
  const current = m.acquire(session, 'player', 'attempt-2');
  for (const ticket of [old, { ...current }, null]) assert.equal(m.deliver(ticket, { type: 'playback-started' }), false);
  assert.equal(m.deliver(current, { type: 'playback-started' }), true);
  assert.equal(m.snapshot().view.activity, 'playing');
  assert.equal(m.deliver(current, { type: 'meter', source: 'output', level: .7 }), true);
  assert.equal(m.deliver(old, { type: 'playback-ended' }), false);
  assert.equal(m.deliver(current, { type: 'playback-ended' }), true);
  assert.equal(m.snapshot().view.activity, 'completed');
  assert.equal(m.snapshot().view.text, '合成回复');
  assert.equal(m.reserve(request(2)), null, 'completion does not release resources or start input');
});

test('muted and terminal playback failure retain text, never auto-resume or retry', () => {
  for (const type of ['reply-muted', 'playback-failed']) {
    const m = model(); const { session, chat } = thinking(m);
    const owner = type === 'reply-muted' ? chat : m.acquire(session, 'player', 'attempt');
    assert.equal(m.deliver(owner, { type }), true);
    assert.equal(m.snapshot().view.text, '合成回复');
    assert.equal(m.snapshot().view.level, 0);
    assert.equal(m.deliver(owner, { type: 'playback-started' }), false);
    assert.equal(m.reserve(request(2)), null);
  }
});

test('cancel immediately hides while all resource acknowledgements retain the gate in any order', () => {
  const permutations = values => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(tail => [v, ...tail])) : [[]];
  // 24 release orders, including an uninterruptible ASR lease, transport and writer.
  for (const order of permutations(['capture', 'asr', 'chat', 'writer'])) {
    const m = model(); const { session, capture } = listening(m);
    const tickets = { capture };
    for (const role of ['asr', 'chat', 'writer']) tickets[role] = m.acquire(session, role, role);
    const before = m.snapshot().view.seq;
    assert.equal(m.close(session), true);
    assert.equal(m.snapshot().view.active, false); assert.equal(m.snapshot().view.text, '');
    assert.equal(m.snapshot().view.level, 0); assert.equal(m.snapshot().closing, true);
    assert.equal(m.snapshot().view.seq, before + 1);
    assert.equal(m.close(session), true); assert.equal(m.snapshot().view.seq, before + 1);
    assert.equal(m.acquire(session, 'player', 'late-attempt'), null);
    assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: 1 }), false);
    for (const [index, role] of order.entries()) {
      assert.equal(m.reserve(request(2)), null);
      assert.equal(m.released(tickets[role]), false, 'no implicit stop confirmation');
      assert.equal(m.released({ ...tickets[role] }, { stopped: true }), false);
      assert.equal(m.released(tickets[role], { stopped: true }), true);
      assert.equal(m.released(tickets[role], { stopped: true }), false);
      if (index < order.length - 1) assert.equal(m.snapshot().closing, true);
    }
    assert.equal(m.snapshot().session, null);
    const next = listening(m, request(2)); assert.equal(next.session.run, 2);
    assert.equal(m.released(tickets.asr, { stopped: true }), false);
    assert.equal(m.deliver(tickets.asr, { type: 'transcript', text: 'stale' }), false);
  }
});

test('pending asynchronous callbacks captured before cancellation cannot adopt the next run', async () => {
  const m = model(); const { session, capture } = listening(m);
  const asr = m.acquire(session, 'asr', 'old-job');
  let done;
  const pending = new Promise(resolve => { done = resolve; }).then(() => m.deliver(asr, { type: 'transcript', text: '旧合成回调' }));
  m.close(session);
  m.released(capture, { stopped: true }); m.released(asr, { stopped: true });
  const next = listening(m, request(2));
  done(); assert.equal(await pending, false);
  assert.equal(m.snapshot().view.run, next.session.run); assert.equal(m.snapshot().view.text, '');
});

test('normal end, failure and preparing cancellation all require drain; missing ack stays blocked', () => {
  for (const type of ['end', 'fail', 'cancel']) {
    const m = model(); const s = m.reserve(request());
    const asr = m.acquire(s, 'asr', 'preparing-model');
    assert.equal(m.close(s, type), true);
    assert.equal(m.snapshot().view.phase, 'hidden');
    for (let i = 0; i < 100; i++) assert.equal(m.reserve(request(i + 2)), null);
    assert.equal(m.restart('epoch-2'), false);
    assert.equal(m.released(asr, { stopped: true }), true);
    assert.ok(m.reserve(request(2)));
  }
});

test('drained restart resets view only under a fresh epoch and rejects all old handles', () => {
  const m = model(); const { session, capture } = listening(m);
  assert.equal(m.restart('epoch-2'), false);
  m.close(session); m.released(capture, { stopped: true });
  assert.equal(m.restart('synthetic-epoch-1'), false);
  assert.equal(m.restart('epoch-2'), true);
  assert.equal(m.snapshot().view.run, 0);
  const next = listening(m);
  assert.equal(next.session.run, 1); assert.equal(next.session.epoch, 'epoch-2');
  assert.equal(m.close(session), false);
  assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: 1 }), false);
  assert.equal(m.released(capture, { stopped: true }), false);
});

test('bounded counters do not wrap and reserve terminal seq for cancellation', () => {
  const m = model({ maxCounter: 2 });
  for (let n = 1; n <= 2; n++) {
    const { session, capture } = listening(m, request(n));
    assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: .4 }), true);
    assert.equal(m.deliver(capture, { type: 'meter', source: 'input', level: .5 }), false);
    assert.equal(m.close(session), true); assert.equal(m.snapshot().view.seq, 2);
    m.released(capture, { stopped: true });
  }
  assert.equal(m.reserve(request(3)), null);
  assert.equal(m.restart('epoch-2'), true);
  assert.ok(m.reserve(request(3)));
});

test('model snapshots are immutable and operation identifiers cannot be reused within an epoch', () => {
  const m = model(); const { session, capture } = listening(m);
  const snapshot = m.snapshot();
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.pending));
  assert.ok(Object.isFrozen(snapshot.pending[0]));
  assert.equal(m.acquire(session, 'capture', 'competing'), null);
  assert.equal(m.acquire(session, 'shell', 'unknown'), null);
  assert.equal(m.acquire(session, 'asr', ''), null);
  m.released(capture, { stopped: true });
  assert.equal(m.acquire(session, 'capture', capture.operationId), null);
});


test('invalid or unsolicited callbacks cannot consume seq or acknowledge a resource', () => {
  const m = model(); const { session, capture } = listening(m);
  const asr = m.acquire(session, 'asr', 'asr-1');
  for (const event of [null, {}, { type: 'state', name: 'speaking' }, { type: 'cancel' },
    { type: 'transcript', text: 'not capture-owned' }, { type: 'meter', source: 'input', level: NaN }]) {
    assert.equal(m.deliver(capture, event), false);
  }
  assert.equal(m.snapshot().view.seq, 0);
  assert.equal(m.released(asr, { stopped: 'yes' }), false);
  assert.equal(m.released(asr, { stopped: 1 }), false);
  assert.equal(m.snapshot().pending.length, 2);
});

test('cancelling during playback immediately invalidates player delivery but waits for stop acknowledgement', () => {
  const m = model(); const { session, chat } = thinking(m);
  const player = m.acquire(session, 'player', 'playing-attempt');
  m.deliver(player, { type: 'playback-started' });
  assert.equal(m.snapshot().view.activity, 'playing');
  m.close(session);
  for (const type of ['playback-ended', 'playback-started', 'playback-failed']) assert.equal(m.deliver(player, { type }), false);
  m.released(chat, { stopped: true });
  assert.equal(m.reserve(request(2)), null);
  m.released(player, { stopped: true });
  assert.ok(m.reserve(request(2)));
});

test('the original player handle from a previous epoch cannot affect a replacement with the same IDs', () => {
  const m = model(); const first = thinking(m);
  const old = m.acquire(first.session, 'player', 'same-attempt');
  m.close(first.session);
  m.released(first.chat, { stopped: true }); m.released(old, { stopped: true });
  assert.equal(m.restart('epoch-2'), true);
  const second = thinking(m);
  const current = m.acquire(second.session, 'player', 'same-attempt');
  assert.equal(m.deliver(old, { type: 'playback-started' }), false);
  assert.equal(m.released(old, { stopped: true }), false);
  assert.equal(m.deliver(current, { type: 'playback-started' }), true);
  assert.equal(m.snapshot().view.activity, 'playing');
});


test('offline model remains test-only and documentation keeps device/integration acceptance pending', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-voice-coordinator-model.md');
  for (const requirement of [/仅测试导入/, /模型默认关闭/, /24 种释放顺序/, /不是可序列化 IPC 认证/,
    /模型没有真实事件队列/, /非实现资源取消/, /G1～G6 仍未验收/, /T0 未验收、T1 未启动/,
    /当前不需要用户操作或授权/]) assert.match(doc, requirement);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-voice-adapter-contract.md']) {
    assert.ok(read(path).includes('2026-11-14-voice-coordinator-model.md'));
  }
  for (const dir of ['desktop/frontend', 'src', 'rust-host/src', 'client']) {
    for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) {
        const source = readFileSync(`${entry.parentPath}/${entry.name}`, 'utf8');
        assert.doesNotMatch(source, /voice-coordinator-model|VoiceCoordinatorModel/, `${dir}/${entry.name}: test model must not enter production`);
      }
    }
  }
});


test('active end/fail/cancel all hide immediately but remain busy until the exact resource drains', () => {
  for (const type of ['end', 'fail', 'cancel']) {
    const m = model(); const { session, capture } = listening(m);
    m.deliver(capture, { type: 'meter', source: 'input', level: .9 });
    assert.equal(m.close(session, type), true);
    assert.equal(m.snapshot().view.phase, 'hidden');
    assert.equal(m.snapshot().view.level, 0);
    assert.equal(m.reserve(request(2)), null);
    assert.equal(m.released(capture, { stopped: true }), true);
    const next = m.reserve(request(2));
    assert.equal(next.run, 2);
    assert.equal(m.snapshot().view.active, false, 'new reservation still needs fresh input readiness');
  }
});
