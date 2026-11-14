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
  assert.equal(state.phase, 'listening'); assert.equal(state.activity, 'ready'); assert.equal(state.text, '合成回答');
  assert.equal(reduce(state, event('meter', 6, { source: 'output', level: .9 })), state);
  state = reduce(state, event('playback-started', 6));
  assert.equal(state.phase, 'speaking');
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

test('text readiness and TTS never imply playback or accept audio input/output levels', () => {
  let state = reduce(begin(), event('process', 1));
  assert.equal(reduce(state, event('playback-started', 2)), state);
  assert.equal(reduce(state, event('reply', 2, { text: '  ' })), state);
  state = reduce(state, event('reply', 2, { text: '合成回复' }));
  assert.equal(state.activity, 'ready'); assert.notEqual(state.phase, 'speaking');
  for (const source of ['input', 'output']) assert.equal(reduce(state, event('meter', 3, { source, level: 1 })), state);
  state = reduce(state, event('synthesis-started', 3));
  assert.equal(state.activity, 'synthesizing'); assert.equal(state.phase, 'processing'); assert.equal(state.level, 0);
  for (const source of ['input', 'output']) assert.equal(reduce(state, event('meter', 4, { source, level: 1 })), state);
  state = reduce(state, event('playback-started', 4));
  state = reduce(state, event('meter', 5, { source: 'output', level: .7 }));
  assert.equal(state.level, .7);
  state = reduce(state, event('playback-ended', 6));
  assert.equal(state.activity, 'completed'); assert.equal(state.text, '合成回复'); assert.equal(state.level, 0);
  for (const type of ['transcript', 'playback-started', 'reply-muted', 'process'])
    assert.equal(reduce(state, event(type, 7, { text: 'late' })), state);
});

test('muted/failed replies retain text without pretending to record; new input needs fresh run', () => {
  for (const terminal of ['reply-muted', 'playback-failed']) {
    let state = reduce(begin(), event('process', 1));
    state = reduce(state, event('reply', 2, { text: '保留合成文字' }));
    state = reduce(state, event(terminal, 3));
    assert.equal(state.activity, terminal === 'reply-muted' ? 'muted' : 'playback-failed');
    assert.equal(state.text, '保留合成文字'); assert.notEqual(state.phase, 'speaking');
    for (const type of ['transcript', 'meter', 'playback-started'])
      assert.equal(reduce(state, event(type, 4, { text: 'late', source: 'input', level: 1 })), state);
    assert.equal(reduce(state, { type: 'begin', run: 2, seq: 0, mode: 'conversation' }), state);
    state = reduce(state, event('end', 4));
    state = reduce(state, { type: 'begin', run: 2, seq: 0, mode: 'conversation' });
    assert.equal(state.activity, 'listening'); assert.equal(state.text, '');
    assert.equal(reduce(state, event('playback-started', 99)), state);
  }
});

test('cancel while ready, synthesizing or playing rejects all late playback callbacks', () => {
  for (const stage of ['ready', 'synthesizing', 'playing']) {
    let state = reduce(reduce(begin(), event('process', 1)), event('reply', 2, { text: '合成回复' }));
    if (stage === 'synthesizing') state = reduce(state, event('synthesis-started', 3));
    if (stage === 'playing') state = reduce(state, event('playback-started', 4));
    state = reduce(state, event('cancel', 5));
    for (const type of ['synthesis-started', 'playback-started', 'playback-ended', 'playback-failed', 'reply-muted'])
      assert.equal(reduce(state, event(type, 99)), state);
    assert.equal(state.phase, 'hidden'); assert.equal(state.text, '');
  }
});

test('all playback scenarios separate readiness from play and dictation refuses playback lifecycle', async () => {
  const { playbackRehearsal } = await import('../desktop/frontend/voice-view-rehearsal.mjs');
  for (const branch of ['played', 'muted', 'failed', 'cancelled']) {
    let state = idle;
    const activities = [];
    for (const frame of playbackRehearsal(branch)) {
      state = reduce(state, frame); activities.push(state.activity);
      if (['ready', 'synthesizing', 'muted', 'playback-failed'].includes(state.activity)) {
        assert.notEqual(state.phase, 'speaking'); assert.equal(state.level, 0);
      }
    }
    assert.ok(activities.includes('ready'));
    assert.equal(activities.includes('playing'), branch === 'played');
    assert.equal(state.activity, branch === 'cancelled' ? 'closed' : 'listening');
  }
  const state = reduce(begin('dictation'), event('process', 1));
  for (const type of ['reply', 'synthesis-started', 'playback-started', 'playback-ended', 'playback-failed', 'reply-muted'])
    assert.equal(reduce(state, event(type, 2, { text: 'no reply' })), state);
});

test('failure during synthesis or playback preserves text and rejects late player acknowledgements', () => {
  for (const source of ['synthesis-started', 'playback-started']) {
    let state = reduce(reduce(begin(), event('process', 1)), event('reply', 2, { text: '保留回复' }));
    state = reduce(state, event(source, 3));
    state = reduce(state, event('playback-failed', 4));
    assert.equal(state.activity, 'playback-failed'); assert.equal(state.text, '保留回复'); assert.equal(state.level, 0);
    for (const type of ['synthesis-started', 'playback-started', 'playback-ended', 'reply'])
      assert.equal(reduce(state, event(type, 5, { text: 'late' })), state);
  }
});

test('full conversation and dictation fixtures deliver legal events through one reducer', async () => {
  const { referenceSequence, dictationSequence } = await import('../desktop/frontend/reference-sequence.mjs');
  for (const frames of [referenceSequence, dictationSequence]) {
    let state = idle;
    const states = [];
    for (const frame of frames) {
      const next = reduce(state, frame);
      assert.notEqual(next, state, `${frame.type} at ${frame.at} must be accepted`);
      assert.ok(Object.isFrozen(frame));
      assert.equal('phase' in frame, false, 'fixtures cannot bypass the reducer with visual phases');
      state = next; states.push(state);
    }
    assert.equal(state.activity, 'closed'); assert.equal(state.text, ''); assert.equal(state.level, 0);
    assert.ok(states.some(s => s.activity === 'thinking'));
    if (frames === referenceSequence) {
      assert.ok(states.some(s => s.activity === 'ready' && s.text));
      const playback = frames.findIndex(f => f.type === 'playback-started');
      assert.ok(states.slice(0, playback).every(s => s.phase !== 'speaking'));
      assert.ok(states.some(s => s.activity === 'completed' && s.text && s.level === 0));
      const resumed = states.find(s => s.run === 2);
      assert.equal(resumed.activity, 'listening'); assert.equal(resumed.text, '');
      assert.equal(reduce(resumed, { type: 'playback-started', run: 1, seq: 999 }), resumed);
    } else {
      assert.ok(states.every(s => s.mode === 'dictation' && s.phase !== 'speaking'));
    }
  }
});


test('every active full-flow prefix can cancel and rejects the rest of that run', async () => {
  const { referenceSequence, dictationSequence } = await import('../desktop/frontend/reference-sequence.mjs');
  for (const frames of [referenceSequence, dictationSequence]) {
    let state = idle;
    for (let index = 0; index < frames.length; index++) {
      state = reduce(state, frames[index]);
      if (!state.active) continue;
      const context = `${state.mode}/${state.activity}/${state.run}/${state.seq}`;
      const cancelled = reduce(state, { type: 'cancel', run: state.run, seq: state.seq + 1 });
      assert.equal(cancelled.active, false, context);
      assert.equal(cancelled.phase, 'hidden', context);
      assert.equal(cancelled.activity, 'closed', context);
      assert.equal(cancelled.level, 0, context);
      assert.equal(cancelled.text, '', context);
      assert.equal(cancelled.run, state.run, context);
      for (const callback of frames.slice(index + 1).filter(frame => frame.run === state.run))
        assert.equal(reduce(cancelled, callback), cancelled, `${context}: late ${callback.type}`);
      // Reusing an old identity cannot reopen it; explicit newer begin is allowed.
      assert.equal(reduce(cancelled, { type: 'begin', run: state.run, seq: 0, mode: state.mode }), cancelled);
      const fresh = reduce(cancelled, { type: 'begin', run: state.run + 1, seq: 0, mode: state.mode });
      assert.equal(fresh.activity, 'listening', context);
      assert.equal(fresh.text, '', context);
      assert.equal(fresh.level, 0, context);
      assert.equal(reduce(fresh, { type: 'playback-started', run: state.run, seq: 999 }), fresh);
    }
  }
});
