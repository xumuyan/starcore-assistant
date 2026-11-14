import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';
import { referenceSequence, dictationSequence } from '../desktop/frontend/reference-sequence.mjs';
import { playbackRehearsal } from '../desktop/frontend/voice-view-rehearsal.mjs';
import { initialVoiceView, reduceVoiceView } from '../desktop/frontend/voice-view-state.mjs';

// Test-only routing of already trusted SYNTHETIC fixtures. Never infer readiness,
// stop, leases or insertion from a view event. All those assumptions are separate
// explicit test calls below, not a legacy service adapter or a timing scheduler.
function harness(coalesceMeters = false) {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'reference-epoch', coalesceMeters });
  const owners = new Map();
  const reserve = (run, mode) => {
    const session = model.reserve(mode === 'dictation'
      ? { origin: 'right-control', mode, requestId: `12345678-1234-1234-1234-${String(run).padStart(12, '0')}` }
      : { origin: 'wake', mode, requestId: `reference-${run}` });
    if (!session) return null;
    assert.equal(session.run, run);
    const owner = { session, tickets: {}, inputConfirmed: false }; owners.set(run, owner); return owner;
  };
  const acquire = (run, role) => {
    const owner = owners.get(run);
    const ticket = model.acquire(owner.session, role, `${run}-${role}`);
    assert.ok(ticket, `explicit fixture lease: ${run}/${role}`); owner.tickets[role] = ticket;
    return ticket;
  };
  const stopped = (run, role) => {
    const owner = owners.get(run);
    assert.equal(model.released(owner.tickets[role], { stopped: true }), true);
  };
  const route = event => {
    const owner = owners.get(event.run); if (!owner) return false;
    const { session, tickets } = owner;
    switch (event.type) {
      case 'begin': return owner.inputConfirmed ? model.inputReady(session, tickets.capture) : false;
      case 'process': return model.process(session);
      case 'end': case 'cancel': case 'fail': return model.close(session, event.type);
      default: {
        const role = event.type === 'meter' ? (event.source === 'input' ? 'capture' : 'player')
          : { transcript: 'asr', reply: 'chat', 'reply-muted': 'chat', 'synthesis-started': 'tts',
            'playback-started': 'player', 'playback-ended': 'player', 'playback-failed': 'tts' }[event.type];
        if (!role) return false;
        const accepted = model.deliver(tickets[role], event);
        return accepted && event.type === 'meter' && coalesceMeters ? model.flushMeter(session) : accepted;
      }
    }
  };
  return { model, owners, reserve, acquire, stopped, route };
}

// Explicit confirmation schedule for these known fixtures only. A future service
// cannot derive ANY of these confirmations from a frame, timestamp or state name.
function prepareFrame(h, event) {
  const owner = h.owners.get(event.run);
  if (event.type === 'begin') {
    assert.ok(h.reserve(event.run, event.mode));
    h.acquire(event.run, 'capture'); h.acquire(event.run, 'asr');
    h.owners.get(event.run).inputConfirmed = true; // Synthetic physical-input assumption.
  }
  if (event.type === 'process') {
    h.stopped(event.run, 'capture'); // Synthetic capture stop, NOT implied by process.
    if (owner.session.mode === 'dictation') h.acquire(event.run, 'writer');
    else h.acquire(event.run, 'chat');
  }
  if (event.type === 'synthesis-started') h.acquire(event.run, 'tts');
  if (event.type === 'playback-started' && !h.model.snapshot().closing) h.acquire(event.run, 'player');
}
function drain(h, run) {
  // Explicit synthetic all-owner stop confirmations, separate from end/cancel.
  for (const ticket of h.model.snapshot().pending) {
    assert.equal(ticket.run, run); h.stopped(run, ticket.resource);
  }
}

const flows = [
  ['conversation', referenceSequence], ['dictation', dictationSequence],
  ...['played', 'muted', 'failed', 'cancelled'].map(outcome => [outcome, playbackRehearsal(outcome)]),
];
for (const coalesce of [false, true]) for (const [name, frames] of flows) {
  test(`${name}: every fixture frame matches coordinated view with explicit proofs (coalesce=${coalesce})`, () => {
    const h = harness(coalesce); let expected = initialVoiceView;
    const acceptedCounts = new Map();
    for (const event of frames) {
      // cancelled playback fixture deliberately sends a late start and later end.
      const rejected = !expected.active && event.type !== 'begin';
      if (!rejected) prepareFrame(h, event);
      const next = reduceVoiceView(expected, event);
      assert.equal(h.route(event), next !== expected, `${event.at}: ${event.type}`);
      if (next !== expected) acceptedCounts.set(event.run, (acceptedCounts.get(event.run) ?? 0) + 1);
      expected = next;
      // Cancelled fixture skips seq values for ignored frames; coordinated seq is
      // accepted-arrival based, so compare visual/identity fields independently.
      const { seq: fixtureSeq, ...fixtureView } = expected;
      const { seq: assignedSeq, ...coordinatedView } = h.model.snapshot().view;
      assert.deepEqual(coordinatedView, fixtureView, `${event.at}: ${event.type}`);
      assert.equal(assignedSeq, acceptedCounts.get(expected.run) - 1, 'one seq per accepted arrival in every branch');
      if (name === 'conversation' || name === 'dictation') assert.equal(assignedSeq, fixtureSeq);
      if (event.type === 'end' || event.type === 'cancel') drain(h, event.run);
    }
    // Some playback branches intentionally finish listening in a fresh run.
    if (h.model.snapshot().view.active) h.model.close(h.model.snapshot().session);
    drain(h, h.model.snapshot().session?.run);
    assert.equal(h.model.snapshot().session, null);
  });
}

function prepared() {
  const h = harness(); h.reserve(1, 'conversation'); h.acquire(1, 'capture'); h.acquire(1, 'asr'); return h;
}
function upTo(type) {
  const h = harness();
  for (const event of referenceSequence) {
    if (event.type === type) return { h, event };
    prepareFrame(h, event); assert.equal(h.route(event), true);
  }
  throw new Error(`missing fixture frame: ${type}`);
}

test('begin frame is not input proof; reservation and capture allocation remain hidden', () => {
  const h = prepared(); const event = referenceSequence[0];
  const before = h.model.snapshot().view;
  assert.equal(h.route(event), false); assert.strictEqual(h.model.snapshot().view, before);
  h.owners.get(1).inputConfirmed = true;
  assert.equal(h.route(event), true);
});

test('process cannot invent capture stop; missing stop rejects without consuming seq', () => {
  const { h, event } = upTo('process'); const before = h.model.snapshot().view;
  assert.equal(h.route(event), false); assert.strictEqual(h.model.snapshot().view, before);
  h.stopped(1, 'capture'); assert.equal(h.route(event), true);
});

test('text frame does not allocate chat ownership and synthesis frame does not allocate TTS', () => {
  const { h, event } = upTo('reply'); h.stopped(1, 'chat');
  const before = h.model.snapshot().view;
  assert.equal(h.route(event), false); assert.strictEqual(h.model.snapshot().view, before);
  // Use a fresh operation, not a reused stopped operationId.
  const owner = h.owners.get(1);
  owner.tickets.chat = h.model.acquire(owner.session, 'chat', 'replacement-chat');
  assert.equal(h.route(event), true);
  const synthesis = referenceSequence.find(frame => frame.type === 'synthesis-started');
  assert.equal(h.route(synthesis), false); assert.equal(h.model.snapshot().view.activity, 'ready');
});

test('TTS ready and allocated player do not speak; started requires original player owner', () => {
  const { h, event } = upTo('playback-started'); const before = h.model.snapshot().view;
  assert.equal(h.route(event), false); assert.strictEqual(h.model.snapshot().view, before);
  const player = h.acquire(1, 'player');
  assert.equal(h.model.snapshot().view.activity, 'synthesizing');
  assert.equal(h.model.deliver({ ...player }, event), false);
  assert.equal(h.route(event), true); assert.equal(h.model.snapshot().view.activity, 'playing');
});

test('playback-ended does not release player; view end cannot authorize the next fixture begin', () => {
  const { h, event } = upTo('playback-ended'); assert.equal(h.route(event), true);
  assert.ok(h.model.snapshot().pending.some(ticket => ticket.resource === 'player'));
  const end = referenceSequence.find(frame => frame.type === 'end'); assert.equal(h.route(end), true);
  assert.equal(h.model.snapshot().view.phase, 'hidden');
  assert.equal(h.reserve(2, 'conversation'), null);
  h.stopped(1, 'player'); assert.equal(h.reserve(2, 'conversation'), null, 'other resources still held');
  drain(h, 1); assert.ok(h.reserve(2, 'conversation'));
  h.acquire(2, 'capture'); h.acquire(2, 'asr');
  const begin = referenceSequence.find(frame => frame.run === 2 && frame.type === 'begin');
  assert.equal(h.route(begin), false, 'fresh input confirmation is still missing');
  h.owners.get(2).inputConfirmed = true; assert.equal(h.route(begin), true);
});

test('dictation fixture incremental text is synthetic; final ASR after process remains rejected', () => {
  const h = harness();
  for (const event of dictationSequence) {
    if (event.type === 'end') break;
    prepareFrame(h, event); assert.equal(h.route(event), true);
  }
  const before = h.model.snapshot().view;
  assert.equal(h.route({ type: 'transcript', run: 1, seq: 999, text: '合成最终识别' }), false);
  assert.strictEqual(h.model.snapshot().view, before);
  const writer = h.owners.get(1).tickets.writer;
  assert.equal(h.model.deliver(writer, { type: 'transcript', text: '不能通过 writer 展示' }), false);
  assert.equal(h.route(dictationSequence.at(-1)), true);
  h.stopped(1, 'asr'); assert.equal(h.reserve(2, 'conversation'), null);
  h.stopped(1, 'writer'); assert.equal(h.model.snapshot().session, null);
  assert.equal(h.model.snapshot().view.text, '', 'writer release is not insertion/copy outcome');
});

test('an unmapped old fixture run never borrows current ownership even with copied fields', () => {
  const h = prepared(); h.owners.get(1).inputConfirmed = true; h.route(referenceSequence[0]);
  const before = h.model.snapshot().view;
  assert.equal(h.route({ type: 'transcript', run: 999, seq: 2, text: '合成外部结果' }), false);
  assert.strictEqual(h.model.snapshot().view, before);
  const capture = h.owners.get(1).tickets.capture;
  assert.equal(h.model.deliver({ ...capture }, { type: 'meter', source: 'input', level: .8 }), false);
});

test('reference verification documents assumptions, omitted-proof tests and unaccepted gates', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-voice-reference-coordination.md');
  for (const requirement of [/SC-20261114-006/, /测试内路由/, /不是适配器/, /不使用时间戳推断/,
    /inputConfirmed/, /最终 ASR/, /不等于插入成功/, /G1～G6 仍未验收/, /T0 未验收、T1 未启动/]) assert.match(doc, requirement);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-voice-coordinator-model.md']) {
    assert.ok(read(path).includes('2026-11-14-voice-reference-coordination.md'), `${path}: evidence link`);
  }
});
