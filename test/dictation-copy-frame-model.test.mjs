import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationCopyFrameModel } from '../test-helpers/dictation-copy-frame-model.mjs';

const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(options = {}) {
  const m = new DictationCopyFrameModel({ enabled: true, epoch: 'frame', sourceTtl: 100, ...options });
  const h = { m, now: 0 };
  h.call = (command, ...args) => m.dispatchAt(h.now, command, ...args);
  h.coord = () => m.diagnostic().state.state.state.lifetime.state.coordinator;
  h.token = m.beginAt(0);
  for (const channel of ['lock', 'settings']) assert.ok(m.receiveAt(0, h.token, { epoch: 'frame', channel, version: 1, value: channel === 'settings', kind: 'snapshot', observedAt: 0 }));
  h.listen = n => {
    const s = h.call('reserve', request(n)); assert.ok(s);
    const capture = h.call('acquire', s, 'capture', `capture-${n}`); const asr = h.call('acquire', s, 'asr', `asr-${n}`);
    assert.ok(h.call('inputReady', s, capture)); return { s, capture, asr, n };
  };
  h.finish = run => {
    assert.ok(h.call('released', run.capture, { stopped: true })); assert.ok(h.call('process', run.s));
    run.writer = h.call('acquire', run.s, 'writer', `writer-${run.n}`);
    const receipt = h.call('final', run.asr, { text: `第${run.n}轮合成正文` });
    const attempt = h.call('begin', receipt, run.writer); assert.ok(h.call('result', attempt, run.writer, 'not-issued')); return run;
  };
  h.prepare = run => { const copy = h.call('requestCopy', m.candidate(), { userInitiated: true }); assert.ok(copy); const check = m.prepareAt(h.now, run.s, copy); assert.ok(check); return check; };
  h.job = run => { const check = h.prepare(run); assert.ok(m.checkedAt(h.now, check, { observedAt: h.now, allowed: true })); const job = m.handoffAt(h.now, check); assert.ok(job); return job; };
  h.close = run => { assert.ok(h.call('close', run.s)); for (const ticket of h.coord().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.show = status => { const frame = m.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status); assert.ok(Object.isFrozen(frame)); assert.ok(Object.isFrozen(frame.presentation)); assert.ok(m.commit(frame)); assert.equal(m.snapshot().presentation, frame.presentation); return frame; };
  h.hidden = () => assert.deepEqual(m.snapshot(), { presentation: { status: 'hidden', text: '', truncated: false, level: 0, showOrbs: false, canCopy: false, awaitingStop: false, executorWaiting: false } });
  return h;
}

test('strict default off; no escape to underlying owner or raw business commit', () => {
  for (const enabled of [undefined, false, 'true']) {
    const m = new DictationCopyFrameModel({ enabled, epoch: 'off' });
    assert.equal(m.sample(), null); assert.equal(m.commit({}), false); assert.equal(m.beginAt(0), null);
    assert.equal(m.model, undefined); assert.equal(m.copyTextAt, undefined); assert.equal(m.samplePresentation, undefined);
  }
});

test('latest original one-shot frame only; forged commit cannot consume latest', () => {
  const h = setup(); h.finish(h.listen(1)); const first = h.m.sample(); const latest = h.m.sample();
  assert.notEqual(first, latest); assert.equal(h.m.commit(first), false);
  assert.equal(h.m.commit({ ...latest }), false); assert.equal(h.m.commit(latest.presentation), false);
  assert.ok(h.m.commit(latest)); assert.equal(h.m.commit(latest), false);
  assert.equal(h.m.snapshot().presentation, latest.presentation);
  const foreign = setup().m.sample(); assert.equal(h.m.commit(foreign), false);
});

test('sampling preserves shown value until a new commit; failed commits never overwrite it', () => {
  const h = setup(); h.finish(h.listen(1)); const shown = h.show('copy-available'); const pending = h.m.sample();
  assert.equal(h.m.snapshot().presentation, shown.presentation);
  assert.equal(h.m.commit({ ...pending }), false); assert.equal(h.m.snapshot().presentation, shown.presentation);
  assert.ok(h.m.commit(pending)); assert.equal(h.m.snapshot().presentation, pending.presentation);
});

for (const name of ['advance', 'beginAt', 'receiveAt', 'lostAt', 'dispatchAt', 'prepareAt', 'checkedAt', 'handoffAt', 'reportAt', 'stoppedAt']) test(`even rejected ${name} invalidates pending and shown`, () => {
  const h = setup(); h.finish(h.listen(1)); h.show('copy-available'); const pending = h.m.sample();
  const args = { advance: [-1], beginAt: [-1], receiveAt: [0, {}, {}], lostAt: [0, {}], dispatchAt: [0, 'unknown-command'],
    prepareAt: [0, {}, {}], checkedAt: [0, {}, {}], handoffAt: [0, {}], reportAt: [0, {}, 'written'], stoppedAt: [0, {}, { stopped: true }] };
  h.m[name](...args[name]); h.hidden(); assert.equal(h.m.commit(pending), false); h.show('copy-available');
});

test('throwing ingress clears delivery before delegating; original error propagates', () => {
  const h = setup(); h.finish(h.listen(1)); h.show('copy-available'); const pending = h.m.sample(); const error = new Error('synthetic');
  assert.throws(() => h.m.receiveAt(0, h.token, { get kind() { throw error; } }), value => value === error);
  h.hidden(); assert.equal(h.m.commit(pending), false); h.show('copy-available');
});

for (const outcome of ['written', 'not-written', 'unknown']) test(`report ${outcome} and original stop invalidate frames without business revision changes being required`, () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.job(run); h.show('copy-unknown'); const pending = h.m.sample();
  assert.ok(h.m.reportAt(0, job, outcome)); h.hidden(); assert.equal(h.m.commit(pending), false);
  const result = h.show(`copy-${outcome}`); assert.equal(result.presentation.awaitingStop, true);
  const beforeStop = h.m.sample(); assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.hidden(); assert.equal(h.m.commit(beforeStop), false);
  const settled = h.show(`copy-${outcome}`); assert.equal(settled.presentation.awaitingStop, false);
  assert.equal(settled.presentation.canCopy, outcome === 'not-written'); h.close(run);
});

for (const coalesceMeters of [false, true]) test(`meter ABA rejects original equal-value frame: meters=${coalesceMeters}`, () => {
  const h = setup({ coalesceMeters }); const run = h.listen(1);
  const meter = level => { assert.ok(h.call('deliver', run.capture, { type: 'meter', source: 'input', level })); if (coalesceMeters) assert.ok(h.call('flushMeter', run.s)); };
  meter(0.2); h.show('listening'); const old = h.m.sample();
  meter(0.8); meter(0.2); h.hidden(); const fresh = h.m.sample();
  assert.deepEqual(fresh.presentation, old.presentation); assert.equal(h.m.commit(old), false); assert.ok(h.m.commit(fresh)); h.close(run);
});

test('same-value source snapshot invalidates delivery even without a changed projection', () => {
  const h = setup(); h.finish(h.listen(1)); h.show('copy-available'); const old = h.m.sample();
  assert.ok(h.m.receiveAt(0, h.token, { epoch: 'frame', channel: 'lock', version: 2, value: false, kind: 'snapshot', observedAt: 0 }));
  h.hidden(); const fresh = h.m.sample(); assert.deepEqual(fresh.presentation, old.presentation);
  assert.equal(h.m.commit(old), false); assert.ok(h.m.commit(fresh));
});

test('failed request can still observe expiry, so rejection must invalidate old frame', () => {
  const h = setup({ candidateTtl: 3 }); h.finish(h.listen(1)); h.show('copy-available'); const old = h.m.sample();
  assert.equal(h.m.dispatchAt(3, 'requestCopy', h.m.candidate(), { userInitiated: true }), null);
  h.hidden(); assert.equal(h.m.commit(old), false); h.show('hidden');
});

for (const command of ['hide', 'dismiss', 'close', 'disconnect']) test(`${command} invalidates result and late report cannot resurrect it`, () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.job(run); h.show('copy-unknown'); const old = h.m.sample();
  assert.ok(h.call(command, ...(command === 'disconnect' ? ['frame'] : command === 'dismiss' ? [] : [run.s])));
  h.hidden(); assert.equal(h.m.commit(old), false); h.show('hidden');
  assert.ok(h.m.reportAt(0, job, 'written')); h.hidden(); h.show('hidden'); assert.equal(h.m.diagnostic().busy, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.show('hidden');
});

for (const event of ['source-expiry', 'candidate-expiry', 'loss']) test(`${event} invalidates display without claiming original executor stopped`, () => {
  const h = setup({ candidateTtl: 3 }); const run = h.finish(h.listen(1)); const job = h.job(run); h.show('copy-unknown'); const pending = h.m.sample();
  if (event === 'loss') assert.ok(h.m.lostAt(0, h.token));
  else { h.now = event === 'source-expiry' ? 100 : 3; assert.ok(h.m.advance(h.now)); }
  h.hidden(); assert.equal(h.m.commit(pending), false); h.show('hidden'); assert.equal(h.m.diagnostic().busy, true);
  assert.ok(h.m.stoppedAt(h.now, job, { stopped: true }));
});

test('readonly diagnostics, candidates, repeated samples and snapshots do not advance logical time', () => {
  const h = setup(); h.finish(h.listen(1)); const shown = h.show('copy-available'); const pending = h.m.sample(); const before = h.m.diagnostic();
  for (let i = 0; i < 50; i++) { h.m.snapshot(); h.m.diagnostic(); h.m.candidate(); }
  assert.deepEqual(h.m.diagnostic(), before); assert.ok(h.m.commit(pending));
  assert.equal(h.m.snapshot().presentation.status, shown.presentation.status);
  h.m.advance(100); h.hidden(); assert.equal(shown.presentation.canCopy, true, 'retained external value is not revoked');
});

test('business revision exhaustion returns null yet original resource cleanup remains possible', () => {
  const h = setup({ maxRevision: 1 }); const frame = h.m.sample(); const run = h.call('reserve', request(1)); assert.ok(run);
  assert.equal(h.m.commit(frame), false); assert.equal(h.m.sample(), null); h.hidden(); assert.ok(h.call('close', run));
});

const permutations = values => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [v, ...rest])) : [[]];
for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) test(`24 prefix delivery trajectories: ${outcome}, meters=${coalesceMeters}`, () => {
  let count = 0;
  for (const order of permutations(['finish', 'report', 'stop', 'deliver'])) {
    const h = setup({ coalesceMeters }); const old = h.finish(h.listen(1)); const job = h.job(old); h.close(old); const next = h.listen(2);
    const initial = h.m.sample(); let mutation = false; const seen = new Set();
    for (const event of order) {
      if (event === 'deliver') assert.equal(h.m.commit(initial), !mutation);
      else {
        if (event === 'finish') h.finish(next);
        if (event === 'report') assert.equal(h.m.reportAt(0, job, outcome), !seen.has('stop'));
        if (event === 'stop') assert.ok(h.m.stoppedAt(0, job, { stopped: true }));
        mutation = true; h.hidden();
      }
      seen.add(event);
      const expected = !seen.has('finish') ? 'listening' : seen.has('stop') ? 'copy-available' : 'copy-waiting';
      // Do not replace the pending initial before its scheduled delivery.
      if (seen.has('deliver')) {
        const frame = h.show(expected); assert.equal(frame.presentation.canCopy, seen.has('finish') && seen.has('stop'));
        assert.equal(frame.presentation.executorWaiting, seen.has('finish') && !seen.has('stop'));
      }
      assert.equal(h.m.diagnostic().busy, !seen.has('stop')); assert.equal(h.m.diagnostic().applied, false);
    }
    h.close(next); count++;
  }
  assert.equal(count, 24);
});

test('exhaustion during result application hides frames but does not block original executor stop', () => {
  const baseline = setup(); const old = baseline.finish(baseline.listen(1)); baseline.job(old);
  const maxRevision = baseline.m.diagnostic().state.state.state.lifetime.state.revision + 1;
  const h = setup({ maxRevision }); const run = h.finish(h.listen(1)); const job = h.job(run); h.show('copy-unknown'); const pending = h.m.sample();
  assert.ok(h.m.reportAt(0, job, 'written')); h.hidden(); assert.equal(h.m.commit(pending), false); assert.equal(h.m.sample(), null);
  assert.equal(h.m.diagnostic().busy, true); assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.close(run); h.hidden();
});

test('frame sampling and committing never allocate business revision or complete executor work', () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.job(run); const before = h.m.diagnostic();
  for (let i = 0; i < 50; i++) h.show('copy-unknown');
  assert.deepEqual(h.m.diagnostic(), before); assert.equal(h.m.diagnostic().busy, true);
  h.close(run); h.m.stoppedAt(0, job, { stopped: true });
});

test('late asynchronous delivery cannot overwrite next original frame', async () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.job(run); const old = h.m.sample(); let resolve;
  const delivery = new Promise(r => { resolve = r; }).then(() => h.m.commit(old));
  assert.ok(h.m.reportAt(0, job, 'written')); h.show('copy-written'); resolve(); assert.equal(await delivery, false);
  assert.equal(h.m.snapshot().presentation.status, 'copy-written');
});

test('frame experiment is not imported by production', () => {
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|js|jsx|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(readFileSync(new URL(`../${child}`, import.meta.url), 'utf8'), /dictation-copy-frame-model|DictationCopyFrameModel/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
});
