import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationCopyResultModel } from '../test-helpers/dictation-copy-result-model.mjs';

function setup(options = {}) {
  const m = new DictationCopyResultModel({ enabled: true, epoch: 'composition', sourceTtl: 100, ...options });
  const call = (command, ...args) => m.dispatchAt(0, command, ...args);
  const coord = () => m.snapshot().state.state.state.lifetime.state.coordinator;
  const token = m.beginAt(0);
  for (const channel of ['lock', 'settings']) assert.ok(m.receiveAt(0, token, { epoch: 'composition', channel, version: 1, value: channel === 'settings', kind: 'snapshot', observedAt: 0 }));
  const listen = n => {
    const s = call('reserve', { origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` }); assert.ok(s);
    const capture = call('acquire', s, 'capture', `capture-${n}`); const asr = call('acquire', s, 'asr', `asr-${n}`);
    assert.ok(call('inputReady', s, capture)); return { s, capture, asr, n };
  };
  const finish = run => {
    assert.ok(call('released', run.capture, { stopped: true })); assert.ok(call('process', run.s));
    run.writer = call('acquire', run.s, 'writer', `writer-${run.n}`);
    const receipt = call('final', run.asr, { text: `第${run.n}轮合成正文` });
    const attempt = call('begin', receipt, run.writer); assert.ok(call('result', attempt, run.writer, 'not-issued')); return run;
  };
  const prepare = run => {
    const copy = call('requestCopy', m.candidate(), { userInitiated: true }); assert.ok(copy);
    const check = m.prepareAt(0, run.s, copy); assert.ok(check); return check;
  };
  const handoff = check => { assert.ok(m.checkedAt(0, check, { observedAt: 0, allowed: true })); const job = m.handoffAt(0, check); assert.ok(job); return job; };
  const close = run => { assert.ok(call('close', run.s)); for (const ticket of coord().pending) assert.ok(call('released', ticket, { stopped: true })); };
  const expect = (status, { canCopy = false, awaitingStop = false, executorWaiting = false, showOrbs = false, text = '', level = 0 } = {}) => {
    const view = m.samplePresentation();
    assert.deepEqual(view, { status, text, truncated: false, level, showOrbs, canCopy, awaitingStop, executorWaiting });
    assert.ok(Object.isFrozen(view)); return view;
  };
  return { m, token, call, coord, listen, finish, prepare, handoff, close, expect };
}

test('composition defaults off and exposes no frame token, identity or authority', () => {
  for (const enabled of [undefined, false, 'true']) assert.equal(new DictationCopyResultModel({ enabled, epoch: 'off' }).samplePresentation(), null);
  const h = setup(); h.expect('hidden');
  const run = h.finish(h.listen(1));
  const view = h.expect('copy-available', { canCopy: true, text: '第1轮合成正文' });
  assert.equal(h.m.commit(view), false); assert.equal(h.m.copyTextAt, undefined);
  const before = h.m.snapshot(); for (let i = 0; i < 20; i++) h.m.samplePresentation(); assert.deepEqual(h.m.snapshot(), before);
  h.close(run);
});

for (const outcome of ['written', 'not-written', 'unknown']) test(`current result ${outcome} replaces copying without claiming executor stop`, () => {
  const h = setup(); const run = h.finish(h.listen(1)); const check = h.prepare(run);
  h.expect('checking', { text: '第1轮合成正文' });
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: true })); h.expect('checked', { text: '第1轮合成正文' });
  const job = h.m.handoffAt(0, check); h.expect('copy-unknown', { awaitingStop: true, text: '第1轮合成正文' });
  assert.ok(h.m.reportAt(0, job, outcome));
  h.expect(`copy-${outcome}`, { awaitingStop: true, text: outcome === 'written' ? '' : '第1轮合成正文' });
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true }));
  h.expect(`copy-${outcome}`, { canCopy: outcome === 'not-written', text: outcome === 'written' ? '' : '第1轮合成正文' });
  if (outcome === 'not-written') { assert.ok(h.call('requestCopy', h.m.candidate(), { userInitiated: true })); h.expect('copying', { text: '第1轮合成正文' }); }
  h.close(run);
});

for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) test(`new run waits for old executor without old success: ${outcome}, meters=${coalesceMeters}`, () => {
  const h = setup({ coalesceMeters }); const old = h.finish(h.listen(1)); const job = h.handoff(h.prepare(old)); h.close(old);
  h.expect('hidden'); assert.equal(h.m.snapshot().busy, true);
  const next = h.listen(2); h.expect('listening');
  assert.ok(h.call('deliver', next.capture, { type: 'meter', source: 'input', level: 0.5 }));
  if (coalesceMeters) assert.ok(h.call('flushMeter', next.s));
  h.expect('listening', { level: 0.5 });
  assert.ok(h.m.reportAt(0, job, outcome)); h.expect('listening', { level: 0.5 }); assert.equal(h.m.snapshot().applied, false);
  h.finish(next); const retained = h.expect('copy-waiting', { executorWaiting: true, text: '第2轮合成正文' });
  for (let i = 0; i < 20; i++) assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null);
  assert.equal(h.m.stoppedAt(0, { ...job }, { stopped: true }), false); h.expect('copy-waiting', { executorWaiting: true, text: '第2轮合成正文' });
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.expect('copy-available', { canCopy: true, text: '第2轮合成正文' });
  assert.equal(retained.status, 'copy-waiting', 'retained samples do not self-update');
  const current = h.handoff(h.prepare(next)); assert.equal(h.m.reportAt(0, job, 'written'), false);
  h.expect('copy-unknown', { awaitingStop: true, text: '第2轮合成正文' }); h.close(next); h.m.stoppedAt(0, current, { stopped: true });
});

const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) test(`6 independent-prefix finish/report/stop orders: ${outcome}, meters=${coalesceMeters}`, () => {
  let count = 0;
  for (const order of permutations(['finish', 'report', 'stop'])) {
    const h = setup({ coalesceMeters }); const old = h.finish(h.listen(1)); const job = h.handoff(h.prepare(old)); h.close(old);
    const next = h.listen(2); const seen = new Set();
    for (const event of order) {
      if (event === 'finish') h.finish(next);
      if (event === 'report') assert.equal(h.m.reportAt(0, job, outcome), !seen.has('stop'));
      if (event === 'stop') assert.ok(h.m.stoppedAt(0, job, { stopped: true }));
      seen.add(event);
      assert.equal(h.m.snapshot().busy, !seen.has('stop'));
      assert.equal(h.m.snapshot().applied, false);
      if (!seen.has('finish')) h.expect('listening');
      else h.expect(seen.has('stop') ? 'copy-available' : 'copy-waiting', { text: '第2轮合成正文', canCopy: seen.has('stop'), executorWaiting: !seen.has('stop') });
    }
    h.close(next); count++;
  }
  assert.equal(count, 6);
});

test('denied preflight is not-issued and allows only a fresh explicit retry', () => {
  const h = setup(); const run = h.finish(h.listen(1)); const check = h.prepare(run);
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: false })); h.expect('not-issued', { canCopy: true, text: '第1轮合成正文' });
  assert.equal(h.m.handoffAt(0, check), null); const retry = h.prepare(run); assert.notEqual(check, retry); h.expect('checking', { text: '第1轮合成正文' }); h.close(run);
});

for (const command of ['hide', 'dismiss']) test(`${command} keeps combined display hidden through late report and stop`, () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.handoff(h.prepare(run));
  assert.ok(h.call(command, ...(command === 'hide' ? [run.s] : []))); h.expect('hidden');
  assert.ok(h.m.reportAt(0, job, 'not-written')); h.expect('hidden'); assert.equal(h.m.snapshot().busy, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.expect('hidden'); h.close(run);
});

test('source expiry and revision exhaustion fail closed without fabricating executor stop', () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.handoff(h.prepare(run));
  assert.ok(h.m.advance(100)); h.expect('hidden'); assert.equal(h.m.snapshot().busy, true); h.m.stoppedAt(100, job, { stopped: true });
  const limited = setup({ maxRevision: 1 }); assert.ok(limited.call('reserve', { origin: 'right-control', mode: 'dictation', requestId: '12345678-1234-1234-1234-000000000001' }));
  assert.equal(limited.m.samplePresentation(), null);
});

test('stop before report preserves uncertainty and never enables retry', () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.handoff(h.prepare(run));
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); assert.equal(h.m.reportAt(0, job, 'not-written'), false);
  h.expect('copy-unknown', { text: '第1轮合成正文' });
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null); h.close(run);
});

for (const event of ['loss', 'disconnect']) test(`${event} hides combined result but does not stop executor`, () => {
  const h = setup(); const run = h.finish(h.listen(1)); const job = h.handoff(h.prepare(run));
  if (event === 'loss') assert.ok(h.m.lostAt(0, h.token));
  else assert.ok(h.call('disconnect', 'composition'));
  h.expect('hidden'); assert.ok(h.m.reportAt(0, job, 'written')); h.expect('hidden');
  assert.equal(h.m.snapshot().busy, true); assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.expect('hidden');
});

test('old busy executor never replaces current thinking or final readiness', () => {
  const h = setup(); const old = h.finish(h.listen(1)); const job = h.handoff(h.prepare(old)); h.close(old);
  const run = h.listen(2); assert.ok(h.call('released', run.capture, { stopped: true })); assert.ok(h.call('process', run.s));
  h.expect('thinking', { showOrbs: true });
  const writer = h.call('acquire', run.s, 'writer', 'writer-2');
  const receipt = h.call('final', run.asr, { text: '当前合成终稿' }); h.expect('final-ready', { text: '当前合成终稿' });
  assert.ok(h.call('begin', receipt, writer)); h.expect('preparing', { text: '当前合成终稿' });
  assert.ok(h.m.reportAt(0, job, 'written')); h.expect('preparing', { text: '当前合成终稿' });
  h.close(run); assert.ok(h.m.stoppedAt(0, job, { stopped: true }));
});

test('waiting candidate expiry hides display without releasing old executor', () => {
  const h = setup({ candidateTtl: 3 }); const old = h.finish(h.listen(1)); const job = h.handoff(h.prepare(old)); h.close(old);
  h.finish(h.listen(2)); h.expect('copy-waiting', { text: '第2轮合成正文', executorWaiting: true });
  assert.ok(h.m.advance(3)); h.expect('hidden'); assert.equal(h.m.snapshot().busy, true);
  assert.ok(h.m.stoppedAt(3, job, { stopped: true })); h.expect('hidden');
});

test('combined sampling supersedes pending business frame and cannot commit itself', () => {
  const h = setup(); h.finish(h.listen(1)); const pending = h.m.sample(); const view = h.m.samplePresentation();
  assert.equal(h.m.commit(pending), false); assert.equal(h.m.commit(view), false);
  const fresh = h.m.sample(); assert.ok(h.m.commit(fresh));
});

test('offline combined proposal remains unimported by product', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|js|jsx|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-copy-result-model|samplePresentation/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
});
