import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';

const wake = n => ({ origin: 'wake', mode: 'conversation', requestId: `synthetic-${n}` });
const dictation = n => ({ origin: 'right-control', mode: 'dictation', requestId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
const model = () => new VoiceCoordinatorModel({ enabled: true, epoch: 'epoch-1' });
const permutations = values => values.length ? values.flatMap((v, i) =>
  permutations(values.filter((_, j) => j !== i)).map(tail => [v, ...tail])) : [[]];
const stop = (m, ticket) => assert.equal(m.released(ticket, { stopped: true }), true);

function fixture(m, stage) {
  const session = m.reserve(wake(1));
  const capture = m.acquire(session, 'capture', 'capture-1');
  const asr = m.acquire(session, 'asr', 'asr-1');
  let pending = [capture, asr];
  if (stage === 'preparing') return { session, pending };
  assert.equal(m.inputReady(session, capture), true);
  if (stage === 'listening') return { session, pending };
  stop(m, capture); stop(m, asr);
  assert.equal(m.process(session), true);
  const chat = m.acquire(session, 'chat', 'chat-1'); pending = [chat];
  if (stage === 'thinking') return { session, pending };
  assert.equal(m.deliver(chat, { type: 'reply', text: '仅供测试的合成回复' }), true);
  if (stage === 'ready') return { session, pending };
  if (stage === 'muted') {
    assert.equal(m.deliver(chat, { type: 'reply-muted' }), true);
    return { session, pending };
  }
  const tts = m.acquire(session, 'tts', 'tts-1'); pending.push(tts);
  assert.equal(m.deliver(tts, { type: 'synthesis-started' }), true);
  if (stage === 'synthesizing') return { session, pending };
  if (stage === 'synthesis-failed') {
    assert.equal(m.deliver(tts, { type: 'playback-failed' }), true);
    return { session, pending };
  }
  const player = m.acquire(session, 'player', 'player-1'); pending.push(player);
  assert.equal(m.deliver(player, { type: 'playback-started' }), true);
  assert.equal(m.deliver(player, { type: 'meter', source: 'output', level: .6 }), true);
  if (stage === 'playing') return { session, pending };
  assert.equal(m.deliver(player, { type: stage === 'completed' ? 'playback-ended' : 'playback-failed' }), true);
  return { session, pending };
}

function assertHidden(m) {
  const { view } = m.snapshot();
  assert.equal(view.active, false); assert.equal(view.phase, 'hidden');
  assert.equal(view.level, 0); assert.equal(view.text, '');
}
function openFreshInput(m, request, expectedRun) {
  const session = m.reserve(request);
  assert.ok(session); assert.equal(session.run, expectedRun);
  assertHidden(m);
  assert.equal(m.inputReady(session, null), false);
  const capture = m.acquire(session, 'capture', `capture-${session.epoch}-${session.run}`);
  assert.ok(capture); assertHidden(m);
  assert.equal(m.inputReady(session, capture), true);
  assert.equal(m.snapshot().view.activity, 'listening');
  assert.equal(m.snapshot().view.level, 0); assert.equal(m.snapshot().view.text, '');
  return { session, capture };
}

// End may race with release confirmations at any position. Test all permutations,
// both next modes, and every terminal outcome, not just the happy-path order.
for (const outcome of ['completed', 'muted', 'failed', 'synthesis-failed']) {
  test(`${outcome}: every drain/end ordering requires explicit fresh input for either next mode`, () => {
    const resources = outcome === 'muted' ? ['chat'] : outcome === 'synthesis-failed' ? ['chat', 'tts'] : ['chat', 'tts', 'player'];
    let trajectories = 0;
    for (const order of permutations(resources)) for (let endAt = 0; endAt <= order.length; endAt++) {
      for (const nextRequest of [wake(2), dictation(2)]) {
        const m = model(); const { session, pending } = fixture(m, outcome);
        const tickets = new Map(pending.map(ticket => [ticket.resource, ticket]));
        const terminal = m.snapshot().view;
        assert.equal(terminal.activity, outcome.endsWith('failed') ? 'playback-failed' : outcome);
        assert.equal(terminal.text, '仅供测试的合成回复'); assert.equal(terminal.level, 0);
        assert.equal(m.acquire(session, 'capture', 'premature-resume'), null);
        for (let i = 0; i <= order.length; i++) {
          if (i === endAt) { assert.equal(m.close(session, 'end'), true); assertHidden(m); }
          if (i === order.length) break;
          assert.equal(m.reserve(nextRequest), null);
          stop(m, tickets.get(order[i]));
          if (i < endAt) {
            assert.strictEqual(m.snapshot().view, terminal, 'release does not advance view or resume input');
            assert.equal(m.reserve(nextRequest), null, 'even a fully drained run still needs end');
          }
        }
        assert.equal(m.snapshot().pending.length, 0); assert.equal(m.snapshot().session, null);
        const next = openFreshInput(m, nextRequest, 2);
        const fresh = m.snapshot().view;
        assert.equal(m.inputReady(session, next.capture), false);
        for (const old of pending) {
          assert.equal(m.released(old, { stopped: true }), false);
          for (const type of ['reply', 'playback-started', 'playback-ended', 'playback-failed']) {
            assert.equal(m.deliver(old, { type, text: '迟到合成数据' }), false);
          }
        }
        assert.strictEqual(m.snapshot().view, fresh);
        m.close(next.session); stop(m, next.capture);
        trajectories++;
      }
    }
    assert.equal(trajectories, outcome === 'muted' ? 4 : outcome === 'synthesis-failed' ? 12 : 48);
  });
}

for (const stage of ['preparing', 'listening', 'thinking', 'ready', 'synthesizing', 'playing', 'completed', 'muted', 'failed', 'synthesis-failed']) {
  test(`disconnect at ${stage}: drain cannot reconnect or silently reset epoch`, () => {
    const m = model(); const { session, pending } = fixture(m, stage);
    const before = m.snapshot().view;
    assert.equal(m.disconnect('unknown-epoch'), false);
    assert.strictEqual(m.snapshot().view, before);
    assert.equal(m.snapshot().connected, true);
    assert.equal(m.disconnect(session.epoch), true); assertHidden(m);
    const hidden = m.snapshot().view;
    assert.equal(m.disconnect(session.epoch), true);
    assert.strictEqual(m.snapshot().view, hidden, 'repeat disconnect is idempotent');
    assert.equal(m.snapshot().connected, false);
    assert.equal(m.acquire(session, 'capture', 'after-disconnect'), null);
    assert.equal(m.process(session), false);
    assert.equal(m.inputReady(session, pending[0]), false);
    for (const ticket of [...pending].reverse()) {
      assert.equal(m.restart('epoch-2'), false);
      assert.equal(m.reserve(wake(2)), null);
      assert.equal(m.deliver(ticket, { type: 'reply', text: '迟到合成数据' }), false);
      assert.equal(m.released(ticket, { stopped: false }), false);
      stop(m, ticket);
    }
    assert.equal(m.snapshot().session, null); assert.equal(m.snapshot().connected, false);
    assert.equal(m.reserve(wake(2)), null, 'drain is not reconnection');
    assert.equal(m.restart(session.epoch), false);
    assert.equal(m.restart('epoch-2'), true);
    openFreshInput(m, wake(1), 1);
    const fresh = m.snapshot().view;
    assert.equal(m.disconnect(session.epoch), false, 'old disconnect cannot close rebuilt view');
    for (const ticket of pending) assert.equal(m.released(ticket, { stopped: true }), false);
    assert.strictEqual(m.snapshot().view, fresh);
  });
}

test('idle disconnect also blocks reservation until an explicit fresh epoch rebuild', () => {
  const m = model(); assert.equal(m.disconnect('epoch-1'), true);
  assert.equal(m.reserve(wake(1)), null); assertHidden(m);
  assert.equal(m.restart('epoch-1'), false); assert.equal(m.restart('epoch-2'), true);
  openFreshInput(m, dictation(1), 1);
});

test('deferred local stop acknowledgement drains after disconnect without reviving old delivery', async () => {
  const m = model(); const { session, pending } = fixture(m, 'playing');
  const player = pending.find(ticket => ticket.resource === 'player');
  let acknowledge;
  const release = new Promise(resolve => { acknowledge = resolve; }).then(() => m.released(player, { stopped: true }));
  m.disconnect(session.epoch);
  for (const ticket of pending.filter(ticket => ticket !== player)) stop(m, ticket);
  assert.equal(m.restart('epoch-2'), false);
  assert.equal(m.snapshot().closing, true);
  acknowledge(); assert.equal(await release, true);
  assert.equal(m.snapshot().connected, false); assert.equal(m.reserve(wake(2)), null);
  assert.equal(m.restart('epoch-2'), true);
  openFreshInput(m, wake(1), 1);
  assert.equal(m.deliver(player, { type: 'playback-ended' }), false);
  assert.equal(m.released(player, { stopped: true }), false);
});

test('lost stop confirmation stays blocked across repeated disconnect and restart attempts', () => {
  const m = model(); const { session, pending } = fixture(m, 'preparing');
  m.disconnect(session.epoch); stop(m, pending[0]); // ASR never confirms release.
  for (let n = 0; n < 100; n++) {
    assert.equal(m.disconnect(session.epoch), true);
    assert.equal(m.restart(`epoch-${n + 2}`), false);
    assert.equal(m.reserve(wake(n + 2)), null);
  }
  assertHidden(m); assert.equal(m.snapshot().pending.length, 1);
  assert.equal(m.snapshot().closing, true); assert.equal(m.snapshot().connected, false);
});


test('dictation processing disconnect waits for both ASR and writer without claiming insertion', () => {
  const m = model(); const session = m.reserve(dictation(1));
  const capture = m.acquire(session, 'capture', 'dictation-capture');
  const asr = m.acquire(session, 'asr', 'dictation-asr');
  assert.equal(m.inputReady(session, capture), true); stop(m, capture);
  assert.equal(m.process(session), true);
  const writer = m.acquire(session, 'writer', 'dictation-writer');
  assert.ok(writer);
  assert.equal(m.disconnect(session.epoch), true); assertHidden(m);
  assert.equal(m.deliver(writer, { type: 'inserted' }), false);
  stop(m, writer);
  assert.equal(m.reserve(wake(2)), null); assert.equal(m.restart('epoch-2'), false);
  assert.equal(m.deliver(asr, { type: 'transcript', text: '晚到合成结果' }), false);
  stop(m, asr);
  assert.equal(m.reserve(wake(2)), null);
  assert.equal(m.restart('epoch-2'), true);
  openFreshInput(m, wake(1), 1);
  assert.equal(m.released(writer, { stopped: true }), false);
});


test('recovery evidence keeps local acknowledgements separate from transport and device acceptance', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const section = read('docs/verification/2026-11-14-voice-coordinator-model.md').split('## SC-20261114-004 恢复矩阵与断连门闩')[1];
  assert.ok(section);
  for (const requirement of [/112 条恢复轨迹/, /10 个断连阶段/, /19 项测试/,
    /不是从断开的传输通道接收匿名确认/, /不把超时当作成功/, /只有新的 capture inputReady 才 begin/,
    /未做设备验收/, /G1～G6 仍未验收/, /T0 未验收、T1 未启动/]) assert.match(section, requirement);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261114-004）/);
  assert.match(read('desktop/README.md'), /恢复与断连合成矩阵 · SC-20261114-004/);
});
