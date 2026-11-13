import test from 'node:test';
import assert from 'node:assert/strict';
import { initialVoiceView as idle, reduceVoiceView as reduce } from '../desktop/frontend/voice-view-state.mjs';
const begin = (mode = 'conversation', run = 1) => reduce(idle, { type: 'begin', mode, run, seq: 0 });
const event = (type, seq, extra = {}) => ({ type, run: 1, seq, ...extra });

test('view is default hidden; only explicit fresh begin can open it', () => {
  assert.equal(idle.phase, 'hidden');
  for (const value of [null, {}, event('reply', 1, { text: 'late' }), event('meter', 1, { source: 'input', level: 1 }),
    { type: 'begin', mode: 'conversation', run: 0, seq: 0 },
    { type: 'begin', mode: 'other', run: 1, seq: 0 }]) assert.equal(reduce(idle, value), idle);
  assert.equal(begin().phase, 'listening');
  assert.ok(Object.isFrozen(begin()));
});

test('conversation snapshots, processing, reply and correct input/output levels', () => {
  let state = begin();
  state = reduce(state, event('meter', 1, { source: 'input', level: 8 }));
  assert.equal(state.level, 1);
  state = reduce(state, event('transcript', 2, { text: '合成提问' }));
  state = reduce(state, event('process', 3));
  assert.equal(state.phase, 'processing'); assert.equal(state.level, 0); assert.equal(state.text, '合成提问');
  assert.equal(reduce(state, event('meter', 4, { source: 'input', level: .7 })), state);
  state = reduce(state, event('reply', 5, { text: '合成回答' }));
  assert.equal(state.phase, 'speaking'); assert.equal(state.text, '合成回答');
  assert.equal(reduce(state, event('transcript', 6, { text: 'late ASR' })), state);
  assert.equal(reduce(state, event('meter', 6, { source: 'input', level: .9 })), state);
  state = reduce(state, event('meter', 7, { source: 'output', level: -.5 }));
  assert.equal(state.level, 0);
  assert.equal(reduce(state, event('process', 8)), state);
});

test('dictation and conversation refuse each other while active, without queuing', () => {
  for (const mode of ['conversation', 'dictation']) {
    let state = begin(mode);
    assert.equal(reduce(state, { type: 'begin', mode: mode === 'dictation' ? 'conversation' : 'dictation', run: 2, seq: 0 }), state);
    assert.equal(reduce(state, { type: 'begin', mode, run: 1, seq: 0 }), state);
    state = reduce(state, event('process', 1));
    if (mode === 'dictation') assert.equal(reduce(state, event('reply', 2, { text: 'not playback' })), state);
    state = reduce(state, event('end', 3));
    assert.equal(state.phase, 'hidden'); assert.equal(state.active, false);
  }
});

test('cancel/end/fail close the run permanently and newer runs reject old callbacks', () => {
  for (const terminal of ['cancel', 'end', 'fail']) {
    const state = reduce(begin(), event(terminal, 3));
    assert.equal(state.text, ''); assert.equal(state.level, 0);
    for (const late of [event('transcript', 4, { text: 'late' }), event('reply', 5, { text: 'late' }),
      event('process', 6), { type: 'begin', mode: 'conversation', run: 1, seq: 0 }]) assert.equal(reduce(state, late), state);
    const newer = reduce(state, { type: 'begin', mode: 'dictation', run: 2, seq: 0 });
    assert.equal(newer.phase, 'listening'); assert.equal(newer.text, '');
    assert.equal(reduce(newer, event('cancel', 99)), newer);
    assert.equal(reduce(newer, event('reply', 100, { text: 'old' })), newer);
  }
});

test('duplicate/out of order, malformed and oversized payloads are no-ops', () => {
  let state = reduce(begin(), event('transcript', 2, { text: '<b>合成文字</b>' }));
  assert.equal(state.text, '<b>合成文字</b>'); // React remains responsible for escaping.
  for (const bad of [event('transcript', 1, { text: 'older' }), event('transcript', 2, { text: 'duplicate' }),
    event('transcript', 3, { text: 'x'.repeat(8001) }), event('transcript', 3, { text: {} }),
    event('meter', 3, { source: 'input', level: NaN }), event('meter', 3, { source: 'input', level: Infinity }),
    event('meter', 3, { source: 'output', level: .5 }), event('unknown', 3),
    event('cancel', -1), event('cancel', 3, { run: '1' }), event('cancel', Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(reduce(state, bad), state);
  }
  state = reduce(state, event('transcript', 3, { text: '' }));
  assert.equal(state.text, '');
});

test('repeated runs never retain previous text or allow any closed run to reopen', () => {
  let state = idle;
  for (let run = 1; run <= 100; run++) {
    state = reduce(state, { type: 'begin', mode: run % 2 ? 'conversation' : 'dictation', run, seq: 0 });
    assert.equal(state.text, '');
    state = reduce(state, { type: 'transcript', run, seq: 1, text: 'synthetic' });
    state = reduce(state, { type: 'cancel', run, seq: 2 });
    for (let old = 1; old <= run; old++) {
      assert.equal(reduce(state, { type: 'reply', run: old, seq: 999, text: 'late' }), state);
    }
  }
});

test('synthetic rehearsal actually rejects cancelled, stale and competing runs', async () => {
  const { voiceViewRehearsal } = await import('../desktop/frontend/voice-view-rehearsal.mjs');
  let state = idle;
  const rejected = [];
  for (const frame of voiceViewRehearsal) {
    const next = reduce(state, frame);
    if (next === state) rejected.push([frame.type, frame.run]);
    assert.ok(!next.text.includes('不应'));
    state = next;
  }
  assert.deepEqual(rejected, [['reply', 1], ['reply', 1], ['begin', 3], ['reply', 1]]);
  assert.equal(state.run, 2); assert.equal(state.phase, 'hidden');
});
