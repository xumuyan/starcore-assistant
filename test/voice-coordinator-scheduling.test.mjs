import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';

const request = n => ({ origin: 'wake', mode: 'conversation', requestId: `synthetic-${n}` });
const meter = (level, source = 'input') => ({ type: 'meter', source, level });
const model = options => new VoiceCoordinatorModel({ enabled: true, epoch: 'epoch-1', coalesceMeters: true, ...options });
function begin(m, n = 1) {
  const session = m.reserve(request(n)); assert.ok(session);
  const capture = m.acquire(session, 'capture', `capture-${n}`); assert.ok(capture);
  assert.equal(m.inputReady(session, capture), true);
  return { session, capture };
}
const stop = (m, ticket) => assert.equal(m.released(ticket, { stopped: true }), true);
function playing(m) {
  const { session, capture } = begin(m);
  stop(m, capture); assert.equal(m.process(session), true);
  const chat = m.acquire(session, 'chat', 'chat');
  assert.equal(m.deliver(chat, { type: 'reply', text: '合成回复' }), true);
  const player = m.acquire(session, 'player', 'player');
  assert.equal(m.deliver(player, { type: 'playback-started' }), true);
  return { session, chat, player };
}
function hidden(m) {
  assert.equal(m.snapshot().view.phase, 'hidden');
  assert.equal(m.snapshot().view.level, 0); assert.equal(m.snapshot().view.text, '');
  assert.equal(m.snapshot().queuedMeters, 0);
}

test('coalescing is opt-in; default mode retains immediate delivery behavior', () => {
  const m = model({ coalesceMeters: false }); const { capture } = begin(m);
  assert.equal(m.deliver(capture, meter(.4)), true);
  assert.equal(m.snapshot().view.seq, 1); assert.equal(m.snapshot().view.level, .4);
  assert.equal(m.snapshot().queuedMeters, 0);
});

test('ten thousand samples occupy one slot and consume seq only at explicit flush', () => {
  const m = model(); const { session, capture } = begin(m);
  for (let i = 0; i < 10000; i++) assert.equal(m.deliver(capture, meter(i / 10000)), true);
  assert.equal(m.snapshot().queuedMeters, 1);
  assert.equal(m.snapshot().view.seq, 0); assert.equal(m.snapshot().view.level, 0);
  assert.equal(m.flushMeter(session), true);
  assert.equal(m.snapshot().view.seq, 1); assert.equal(m.snapshot().view.level, .9999);
  assert.equal(m.snapshot().queuedMeters, 0); assert.equal(m.flushMeter(session), false);
});

test('invalid, foreign and wrong-source samples cannot replace the valid buffered value', () => {
  const m = model(); const { session, capture } = begin(m);
  m.deliver(capture, meter(.3));
  const foreign = model(); const other = begin(foreign);
  for (const ticket of [{ ...capture }, other.capture, null]) assert.equal(m.deliver(ticket, meter(.9)), false);
  for (const event of [meter(NaN), meter(Infinity), meter('0.9'), meter(.9, 'output')]) assert.equal(m.deliver(capture, event), false);
  assert.equal(m.flushMeter({ ...session }), false);
  assert.equal(m.snapshot().queuedMeters, 1);
  assert.equal(m.flushMeter(session), true); assert.equal(m.snapshot().view.level, .3);
});

test('text is an immediate barrier, not queued behind samples; deferred text gets its arrival seq', async () => {
  const m = model(); const { session, capture } = begin(m);
  const asr = m.acquire(session, 'asr', 'asr');
  let resolve;
  const pending = new Promise(done => { resolve = done; }).then(() => m.deliver(asr, { type: 'transcript', text: '合成异步文字' }));
  m.deliver(capture, meter(.2)); assert.equal(m.flushMeter(session), true);
  m.deliver(capture, meter(.9)); resolve(); assert.equal(await pending, true);
  assert.equal(m.snapshot().view.seq, 2); assert.equal(m.snapshot().view.text, '合成异步文字');
  assert.equal(m.snapshot().queuedMeters, 0); assert.equal(m.flushMeter(session), false);
  assert.equal(m.deliver(capture, meter(.6)), true); assert.equal(m.flushMeter(session), true);
  assert.equal(m.snapshot().view.seq, 3);
});

test('rejected text consumes no seq and does not discard a valid buffered sample', () => {
  const m = model(); const { session, capture } = begin(m);
  const asr = m.acquire(session, 'asr', 'asr');
  m.deliver(capture, meter(.2));
  assert.equal(m.deliver(asr, { type: 'transcript', text: '字'.repeat(8001) }), false);
  assert.equal(m.snapshot().view.seq, 0); assert.equal(m.snapshot().queuedMeters, 1);
  assert.equal(m.flushMeter(session), true);
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) {
  test(`${terminal} bypasses buffered meters, hides immediately and still requires resource drain`, () => {
    const m = model(); const { session, capture } = begin(m);
    m.deliver(capture, meter(.8));
    assert.equal(terminal === 'disconnect' ? m.disconnect(session.epoch) : m.close(session, terminal), true);
    hidden(m); assert.equal(m.snapshot().view.seq, 1);
    assert.equal(m.flushMeter(session), false); assert.equal(m.deliver(capture, meter(.9)), false);
    assert.equal(m.reserve(request(2)), null); assert.equal(m.restart('epoch-2'), false);
    stop(m, capture);
    if (terminal === 'disconnect') {
      assert.equal(m.reserve(request(2)), null); assert.equal(m.restart('epoch-2'), true);
    }
    const next = begin(m, 2); const fresh = m.snapshot().view;
    assert.equal(m.flushMeter(session), false); assert.equal(m.released(capture, { stopped: true }), false);
    assert.strictEqual(m.snapshot().view, fresh);
    assert.equal(m.deliver(next.capture, meter(.1)), true); assert.equal(m.flushMeter(next.session), true);
  });
}

for (const type of ['playback-ended', 'playback-failed']) {
  test(`${type} is delivered ahead of sampling and cannot be overwritten by an old output meter`, () => {
    const m = model(); const { session, player } = playing(m);
    const seq = m.snapshot().view.seq;
    assert.equal(m.deliver(player, meter(.8, 'output')), true);
    assert.equal(m.deliver(player, { type }), true);
    assert.equal(m.snapshot().view.seq, seq + 1); assert.equal(m.snapshot().view.level, 0);
    assert.equal(m.snapshot().view.activity, type === 'playback-ended' ? 'completed' : 'playback-failed');
    assert.equal(m.snapshot().view.text, '合成回复'); assert.equal(m.snapshot().queuedMeters, 0);
    assert.equal(m.flushMeter(session), false); assert.equal(m.deliver(player, meter(.9, 'output')), false);
    assert.equal(m.reserve(request(2)), null);
  });
}

test('release discards only its own pending sample; replacement player cannot inherit it', () => {
  const m = model(); const { session, player, chat } = playing(m);
  m.deliver(player, meter(.7, 'output'));
  stop(m, chat); assert.equal(m.snapshot().queuedMeters, 1);
  stop(m, player); assert.equal(m.snapshot().queuedMeters, 0);
  const replacement = m.acquire(session, 'player', 'replacement'); assert.ok(replacement);
  assert.equal(m.flushMeter(session), false);
  assert.equal(m.deliver(player, meter(.9, 'output')), false);
});

// Exhaustion is deliberately tiny; every position is checked without pretending
// that a test loops through Number.MAX_SAFE_INTEGER or changes real protocol bounds.
for (const limit of [2, 3, 4, 7]) {
  test(`limit ${limit}: coalesced meters preserve lifecycle+terminal seq through disconnect at every position`, () => {
    for (let position = 0; position < limit; position++) {
      const m = model({ maxCounter: limit }); const { session, capture } = begin(m);
      const asr = m.acquire(session, 'asr', 'asr');
      for (let seq = 1; seq <= position; seq++) {
        assert.equal(m.deliver(asr, { type: 'transcript', text: `合成-${seq}` }), true);
      }
      const accepted = m.deliver(capture, meter(.5));
      assert.equal(accepted, position < limit - 2);
      if (position < limit - 2) {
        assert.equal(m.flushMeter(session), true);
        for (let seq = position + 2; seq <= limit - 2; seq++) {
          m.deliver(capture, meter(.4)); assert.equal(m.flushMeter(session), true);
        }
      }
      if (m.snapshot().view.seq < limit - 1) {
        assert.equal(m.deliver(capture, meter(.6)), false, 'sampling cannot consume last ordinary seq');
        assert.equal(m.deliver(asr, { type: 'transcript', text: '合成末次文字' }), true);
      }
      assert.equal(m.snapshot().view.seq, limit - 1);
      assert.equal(m.deliver(asr, { type: 'transcript', text: '不能回绕' }), false);
      assert.equal(m.disconnect(session.epoch), true); hidden(m);
      assert.equal(m.snapshot().view.seq, limit);
      assert.equal(m.disconnect(session.epoch), true); assert.equal(m.snapshot().view.seq, limit);
      assert.equal(m.restart('epoch-2'), false); stop(m, capture);
      assert.equal(m.restart('epoch-2'), false); stop(m, asr);
      assert.equal(m.reserve(request(2)), null); assert.equal(m.restart('epoch-2'), true);
      const next = begin(m); assert.equal(next.session.run, 1); assert.equal(m.snapshot().view.seq, 0);
      assert.equal(m.disconnect(session.epoch), false); assert.equal(m.flushMeter(session), false);
    }
  });
}

test('run exhaustion plus idle disconnect still needs a new epoch, never wraps within one', () => {
  const m = model({ maxCounter: 2 });
  for (let run = 1; run <= 2; run++) {
    const { session, capture } = begin(m, run);
    assert.equal(session.run, run); m.close(session); stop(m, capture);
  }
  assert.equal(m.reserve(request(3)), null); assert.equal(m.disconnect('epoch-1'), true);
  assert.equal(m.reserve(request(3)), null); assert.equal(m.restart('epoch-1'), false);
  assert.equal(m.restart('epoch-2'), true); assert.equal(begin(m, 3).session.run, 1);
});

test('playback completion retains the final ordinary seq when output meters hit the sampling bound', () => {
  const m = model({ maxCounter: 5 }); const { session, player } = playing(m); // seq 3
  assert.equal(m.deliver(player, meter(.8, 'output')), false);
  assert.equal(m.deliver(player, { type: 'playback-ended' }), true); // seq 4
  assert.equal(m.snapshot().view.seq, 4);
  assert.equal(m.disconnect(session.epoch), true); hidden(m); assert.equal(m.snapshot().view.seq, 5);
});

test('offline scheduling documentation does not claim timers, IPC or physical cancellation', () => {
  const doc = readFileSync(new URL('../docs/verification/2026-11-14-voice-coordinator-model.md', import.meta.url), 'utf8');
  const section = doc.split('## SC-20261114-005 电平合并与耗尽交叉验证')[1];
  assert.ok(section);
  for (const requirement of [/coalesceMeters/, /flushMeter/, /不分配 seq/, /不是生产队列/,
    /最后一个普通序号/, /手工 flush/, /G1～G6 仍未验收/, /T0 未验收、T1 未启动/]) assert.match(section, requirement);
});


test('buffer copies level at arrival, clamps at flush, and cannot be filled before inputReady', () => {
  const m = model(); const session = m.reserve(request(1));
  const capture = m.acquire(session, 'capture', 'capture');
  assert.equal(m.deliver(capture, meter(.9)), false);
  assert.equal(m.snapshot().queuedMeters, 0);
  assert.equal(m.inputReady(session, capture), true);
  const event = meter(2); assert.equal(m.deliver(capture, event), true);
  event.level = -.8; assert.equal(m.flushMeter(session), true);
  assert.equal(m.snapshot().view.level, 1);
  assert.equal(m.deliver(capture, meter(-1)), true); assert.equal(m.flushMeter(session), true);
  assert.equal(m.snapshot().view.level, 0);
});

test('stopping capture clears its pending input sample before process, without consuming seq', () => {
  const m = model(); const { session, capture } = begin(m);
  m.deliver(capture, meter(.9));
  assert.equal(m.process(session), false); assert.equal(m.snapshot().queuedMeters, 1);
  assert.equal(m.close({ ...session }), false); assert.equal(m.snapshot().queuedMeters, 1);
  stop(m, capture); assert.equal(m.snapshot().queuedMeters, 0);
  assert.equal(m.process(session), true); assert.equal(m.snapshot().view.seq, 1);
  assert.equal(m.snapshot().view.activity, 'thinking'); assert.equal(m.flushMeter(session), false);
});
