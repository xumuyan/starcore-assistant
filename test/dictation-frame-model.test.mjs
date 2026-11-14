import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';
import { FinalAsrProjection } from '../test-helpers/final-asr-projection.mjs';
import { DictationOutcomeModel } from '../test-helpers/dictation-outcome-model.mjs';
import { DictationFrameModel } from '../test-helpers/dictation-frame-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(options = { enabled: true }) {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'frames' });
  const projection = new FinalAsrProjection(model, { enabled: true });
  const outcome = new DictationOutcomeModel(model, projection, { enabled: true });
  const frames = new DictationFrameModel(model, projection, outcome, options);
  const h = { model, projection, outcome, frames };
  h.start = n => {
    h.session = model.reserve(request(n)); assert.ok(h.session);
    h.capture = model.acquire(h.session, 'capture', `capture-${n}`);
    h.asr = model.acquire(h.session, 'asr', `asr-${n}`); assert.ok(model.inputReady(h.session, h.capture));
  };
  h.process = () => { model.released(h.capture, { stopped: true }); model.process(h.session); };
  h.prepare = () => {
    h.receipt = projection.accept(h.asr, { text: '合成最终文字' });
    h.writer = model.acquire(h.session, 'writer', `writer-${h.session.run}`);
    h.attempt = outcome.begin(h.receipt, h.writer); assert.ok(h.attempt);
  };
  h.close = () => {
    model.close(h.session); model.released(h.capture, { stopped: true });
    model.released(h.asr, { stopped: true }); if (h.writer) model.released(h.writer, { stopped: true });
  };
  h.show = status => {
    const frame = frames.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status);
    assert.ok(frames.commit(frame)); assert.equal(frames.snapshot().presentation.status, status); return frame;
  };
  return h;
}
const hidden = h => { assert.equal(h.frames.snapshot().presentation.status, 'hidden'); assert.equal(h.frames.snapshot().revision, 0); };

test('default off and strict boolean enable; malformed revision limits rejected', () => {
  for (const options of [{}, { enabled: 'true' }, { enabled: false }]) {
    const h = setup(options); h.start(1); assert.equal(h.frames.sample(), null);
    assert.equal(h.frames.commit({}), false); assert.equal(h.frames.dismiss(h.session), false); hidden(h);
  }
  for (const maxRevision of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setup({ enabled: true, maxRevision }), /invalid frame options/);
  }
});

test('same-session final/outcome changes invalidate old frames despite unchanged reducer seq', () => {
  const h = setup(); h.start(1); h.process(); const thinking = h.show('thinking');
  const seq = h.model.snapshot().view.seq; const pending = h.frames.sample();
  h.prepare(); assert.equal(h.model.snapshot().view.seq, seq);
  assert.equal(h.frames.commit(pending), false); hidden(h);
  const preparing = h.show('preparing'); assert.ok(preparing.revision > thinking.revision);
  const old = h.frames.sample(); h.outcome.result(h.attempt, h.writer, 'not-issued');
  assert.equal(h.frames.commit(old), false); hidden(h); h.show('copy-available');
  h.close();
});

test('latest issued frame only: copies, foreign samplers, duplicate and old revision cannot commit', () => {
  const h = setup(); h.start(1); const first = h.frames.sample(); const latest = h.frames.sample();
  assert.equal(h.frames.commit(first), false); assert.equal(h.frames.commit({ ...latest }), false);
  const foreign = new DictationFrameModel(h.model, h.projection, h.outcome, { enabled: true });
  assert.equal(h.frames.commit(foreign.sample()), false); assert.ok(h.frames.commit(latest));
  assert.equal(h.frames.commit(latest), false); assert.equal(h.frames.snapshot().revision, latest.revision);
  h.close();
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) test(`${terminal} checked at commit and snapshot rejects old content without a replacement frame`, () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); h.show('preparing'); const pending = h.frames.sample();
  if (terminal === 'disconnect') h.model.disconnect('frames'); else h.model.close(h.session, terminal);
  hidden(h); assert.equal(h.frames.commit(pending), false);
  assert.equal(h.model.reserve(request(2)), null, 'frame hide never releases leases');
  h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true }); hidden(h);
});

for (const stage of ['listening', 'thinking', 'preparing', 'copy-available', 'copying']) test(`dismiss ${stage} sticks in current run; rejects copied session, does not cancel or erase`, () => {
  const h = setup(); h.start(1);
  if (stage !== 'listening') h.process();
  if (['preparing', 'copy-available', 'copying'].includes(stage)) h.prepare();
  if (['copy-available', 'copying'].includes(stage)) h.outcome.result(h.attempt, h.writer, 'not-issued');
  if (stage === 'copying') h.copy = h.outcome.requestCopy(h.outcome.candidate(), { userInitiated: true });
  h.show(stage); const old = h.frames.sample(); const before = h.model.snapshot(); const outcome = h.outcome.snapshot();
  assert.equal(h.frames.dismiss({ ...h.session }), false); assert.ok(h.frames.dismiss(h.session));
  assert.equal(h.frames.commit(old), false); hidden(h); h.show('hidden');
  assert.deepEqual(h.model.snapshot(), before); assert.deepEqual(h.outcome.snapshot(), outcome);
  if (stage === 'preparing') h.outcome.result(h.attempt, h.writer, 'issued');
  if (stage === 'copying') h.outcome.copied(h.copy, { written: false });
  h.show('hidden'); h.close();
});

test('outcome preparing dismiss alone is not observable; frame-layer dismissal explicitly resolves ambiguity', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); h.outcome.dismiss();
  h.show('final-ready'); assert.ok(h.frames.dismiss(h.session)); h.show('hidden');
  assert.equal(h.projection.writerText(h.receipt, h.writer), '合成最终文字'); h.close();
});

test('same epoch next run clears marker and old tokens cannot blank or replace new presentation', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); const oldSession = h.session;
  h.frames.dismiss(h.session); const old = h.frames.sample(); h.close(); h.start(2);
  h.show('listening'); const before = h.frames.snapshot();
  assert.equal(h.frames.dismiss(oldSession), false); assert.equal(h.frames.commit(old), false);
  assert.deepEqual(h.frames.snapshot(), before); h.close();
});

test('new epoch may reuse run/request/op IDs but revision never resets and old session remains invalid', () => {
  const h = setup(); h.start(1); const first = h.show('listening'); const oldSession = h.session;
  h.frames.dismiss(h.session); const old = h.frames.sample(); h.close(); h.model.restart('new-epoch'); h.start(1);
  const next = h.show('listening'); assert.equal(h.session.run, 1); assert.ok(next.revision > first.revision);
  assert.equal(h.frames.commit(old), false); assert.equal(h.frames.dismiss(oldSession), false); h.close();
});

test('copy lifecycle snapshots invalidate old affordances without granting clipboard access', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); h.outcome.result(h.attempt, h.writer, 'not-issued');
  h.show('copy-available'); const available = h.frames.sample();
  const copy = h.outcome.requestCopy(h.outcome.candidate(), { userInitiated: true });
  assert.equal(h.frames.commit(available), false); hidden(h); const copying = h.show('copying');
  h.outcome.copied(copy, { written: true }); hidden(h); assert.equal(h.frames.commit(copying), false);
  const done = h.show('copied'); assert.equal(h.outcome.requestCopy(done, { userInitiated: true }), null); h.close();
});

test('stop lease proof invalidates sampled signature without pretending outcome is complete', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); const old = h.frames.sample();
  const seq = h.model.snapshot().view.seq; h.model.released(h.writer, { stopped: true });
  assert.equal(h.frames.commit(old), false); assert.equal(h.model.snapshot().view.seq, seq);
  h.show('preparing'); h.close();
});

test('safe revision exhaustion hides and invalidates previous tokens; close/dismiss remain available', () => {
  const h = setup({ enabled: true, maxRevision: 2 }); h.start(1);
  const first = h.frames.sample(); const last = h.frames.sample(); assert.equal(last.revision, 2);
  assert.equal(h.frames.sample(), null); hidden(h);
  assert.equal(h.frames.commit(first), false); assert.equal(h.frames.commit(last), false);
  assert.ok(h.frames.dismiss(h.session)); h.close(); h.model.restart('fresh'); h.start(1);
  assert.equal(h.frames.sample(), null, 'no wrap/reset across epochs'); hidden(h); h.close();
});

test('delayed old frame commit cannot resurrect after close and fresh preparation', async () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); const old = h.frames.sample();
  let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => h.frames.commit(old));
  h.close(); h.start(2); h.show('listening'); finish(); assert.equal(await pending, false);
  assert.equal(h.frames.snapshot().presentation.status, 'listening'); h.close();
});

test('unobserved ABA with identical public values is explicitly not a full history/freshness proof', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); h.outcome.result(h.attempt, h.writer, 'not-issued');
  const available = h.frames.sample(); const copy = h.outcome.requestCopy(h.outcome.candidate(), { userInitiated: true });
  h.outcome.copied(copy, { written: false }); // No frame-layer method observed intermediate copying.
  assert.equal(h.frames.commit(available), true, 'same candidate presentation values, no underlying revision');
  assert.equal(h.frames.snapshot().presentation.status, 'copy-available'); h.close();
});

test('frame records are frozen display-only, one-shot, and do not alter business models or view seq', () => {
  const h = setup(); h.start(1); h.process(); h.prepare(); const before = h.model.snapshot();
  const final = h.projection.snapshot(); const outcome = h.outcome.snapshot(); const frame = h.frames.sample();
  assert.ok(Object.isFrozen(frame)); assert.ok(Object.isFrozen(frame.presentation));
  assert.deepEqual(Object.keys(frame), ['revision', 'presentation']); assert.ok(h.frames.commit(frame));
  assert.deepEqual(h.model.snapshot(), before); assert.strictEqual(h.projection.snapshot(), final);
  assert.deepEqual(h.outcome.snapshot(), outcome); h.close();
});

test('frames remain test-only; evidence distinguishes sampled values from active subscriptions', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-frame-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-frames.md');
  for (const regex of [/SC-20261114-012/, /ABA/, /不是主动订阅/, /不操作剪贴板/,
    /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, regex);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-presentation.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-frames.md'));
  }
});
