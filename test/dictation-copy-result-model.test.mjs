import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationCopyResultModel } from '../test-helpers/dictation-copy-result-model.mjs';
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function setup(options = {}) {
  const m = new DictationCopyResultModel({ enabled: true, epoch: 'result', sourceTtl: 100, ...options });
  const h = { m, now: 0, version: 0 };
  h.call = (command, ...args) => m.dispatchAt(h.now, command, ...args);
  h.coordinator = () => m.snapshot().state.state.state.lifetime.state.coordinator;
  h.sync = () => {
    h.token = m.beginAt(h.now); assert.ok(h.token); h.version++;
    for (const channel of ['lock', 'settings']) assert.ok(m.receiveAt(h.now, h.token, { epoch: h.coordinator().epoch, channel, version: h.version, value: channel === 'settings', kind: 'snapshot', observedAt: h.now }));
  };
  h.badge = (status, awaitingStop = false) => { const badge = m.result(); assert.deepEqual(badge, { status, awaitingStop }); assert.ok(Object.isFrozen(badge)); };
  h.business = n => {
    const s = h.call('reserve', { origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` }); assert.ok(s); h.badge('hidden');
    const capture = h.call('acquire', s, 'capture', `capture-${n}`); const asr = h.call('acquire', s, 'asr', `asr-${n}`);
    assert.ok(h.call('inputReady', s, capture)); h.badge('hidden');
    assert.ok(h.call('released', capture, { stopped: true })); assert.ok(h.call('process', s)); h.badge('hidden');
    const writer = h.call('acquire', s, 'writer', `writer-${n}`); const receipt = h.call('final', asr, { text: `第${n}轮合成正文` });
    const attempt = h.call('begin', receipt, writer); assert.ok(h.call('result', attempt, writer, 'not-issued')); h.badge('hidden');
    return { s, asr, writer };
  };
  h.copy = run => { const copy = h.call('requestCopy', m.candidate(), { userInitiated: true }); assert.ok(copy); h.badge('hidden'); return copy; };
  h.prepare = (run, copy) => { const check = m.prepareAt(h.now, run.s, copy); assert.ok(check); h.badge('checking'); return check; };
  h.job = run => {
    const copy = h.copy(run); const check = h.prepare(run, copy);
    assert.ok(m.checkedAt(h.now, check, { observedAt: h.now, allowed: true })); h.badge('checked');
    const job = m.handoffAt(h.now, check); assert.ok(job); h.badge('copy-unknown', true); return { job, check, copy };
  };
  h.close = run => { assert.ok(h.call('close', run.s)); h.badge('hidden'); for (const ticket of h.coordinator().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  return h;
}

test('strict default off; badge contains no business text, identity or authority', () => {
  for (const enabled of [undefined, false, 'true']) {
    const m = new DictationCopyResultModel({ epoch: 'off', enabled });
    assert.deepEqual(m.result(), { status: 'hidden', awaitingStop: false }); assert.equal(m.beginAt(0), null);
    assert.equal(m.prepareAt(0, {}, {}), null); assert.equal(m.copyTextAt, undefined); assert.equal(m.model, undefined);
  }
});
for (const outcome of ['written', 'not-written', 'unknown']) test(`current original job displays ${outcome} independently from stop`, () => {
  const h = setup(); h.sync(); const run = h.business(1); const { job } = h.job(run);
  assert.ok(h.m.reportAt(0, job, outcome)); h.badge(`copy-${outcome}`, true);
  assert.equal(h.m.reportAt(0, job, 'written'), false); h.badge(`copy-${outcome}`, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.badge(`copy-${outcome}`);
  assert.equal(h.m.reportAt(0, job, 'written'), false); h.close(run);
});

test('pre-handoff denial is not-issued, not an executor failure; retry clears prior badge', () => {
  const h = setup(); h.sync(); const run = h.business(1); const copy = h.copy(run); const check = h.prepare(run, copy);
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: false })); h.badge('not-issued');
  const retry = h.copy(run); assert.notEqual(copy, retry); assert.equal(h.m.prepareAt(0, {}, retry), null); h.badge('hidden');
  const next = h.prepare(run, retry); assert.ok(h.m.checkedAt(0, next, { observedAt: 0, allowed: true })); h.close(run);
});

test('successful retry request hides previous not-written until its own original preparation', () => {
  const h = setup(); h.sync(); const run = h.business(1); const first = h.job(run);
  h.m.reportAt(0, first.job, 'not-written'); h.m.stoppedAt(0, first.job, { stopped: true }); h.badge('copy-not-written');
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: false }), null); h.badge('copy-not-written');
  const copy = h.copy(run); const check = h.prepare(run, copy); assert.equal(h.m.prepareAt(0, run.s, first.copy), null); h.badge('checking');
  assert.equal(h.m.checkedAt(0, first.check, { observedAt: 0, allowed: false }), false); h.badge('checking');
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: false })); h.close(run);
});

for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) {
  test(`24 close/report/stop/new-run orders: ${outcome}, meters=${coalesceMeters}`, () => {
    let count = 0;
    for (const order of permutations(['close', 'report', 'stop', 'next'])) {
      const h = setup({ coalesceMeters }); h.sync(); const old = h.business(1); const { job } = h.job(old);
      let closed = false, reported = false, stopped = false, next = null;
      for (const event of order) {
        if (event === 'close') { h.close(old); closed = true; }
        if (event === 'report') { assert.equal(h.m.reportAt(0, job, outcome), !stopped); if (!stopped) reported = true; }
        if (event === 'stop') { assert.ok(h.m.stoppedAt(0, job, { stopped: true })); stopped = true; }
        if (event === 'next') {
          if (closed) next = h.business(2);
          else assert.equal(h.call('reserve', { origin: 'right-control', mode: 'dictation', requestId: '12345678-1234-1234-1234-000000000002' }), null);
        }
        h.badge(closed ? 'hidden' : `copy-${reported ? outcome : 'unknown'}`, closed ? false : !stopped);
        assert.equal(h.m.snapshot().busy, !stopped);
      }
      if (!next) next = h.business(2); h.badge('hidden');
      const current = h.job(next);
      assert.equal(h.m.reportAt(0, job, 'written'), false); assert.equal(h.m.stoppedAt(0, job, { stopped: true }), false); h.badge('copy-unknown', true);
      assert.ok(h.m.reportAt(0, current.job, 'written')); h.badge('copy-written', true);
      h.m.stoppedAt(0, current.job, { stopped: true }); h.close(next); count++;
    }
    assert.equal(count, 24);
  });
}

for (const command of ['hide', 'dismiss']) test(`${command} is sticky for current run, without fabricating executor stop`, () => {
  const h = setup(); h.sync(); const run = h.business(1); const { job } = h.job(run);
  assert.ok(h.call(command, ...(command === 'hide' ? [run.s] : []))); h.badge('hidden');
  assert.ok(h.m.reportAt(0, job, 'written')); h.badge('hidden'); assert.equal(h.m.snapshot().busy, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.badge('hidden'); h.close(run);
  const next = h.business(2); const current = h.job(next); h.close(next); h.m.stoppedAt(0, current.job, { stopped: true });
});

for (const event of ['loss', 'expiry', 'disconnect']) test(`${event} hides badge before late truth; recovery keeps old result diagnostic-only`, () => {
  const h = setup(); h.sync(); const old = h.business(1); const { job } = h.job(old);
  if (event === 'loss') assert.ok(h.m.lostAt(0, h.token));
  if (event === 'expiry') { h.now = 100; assert.ok(h.m.advance(100)); }
  if (event === 'disconnect') assert.ok(h.call('disconnect', 'result'));
  h.badge('hidden'); assert.ok(h.m.reportAt(h.now, job, 'written')); h.badge('hidden');
  assert.equal(h.m.snapshot().outcome, 'written'); assert.equal(h.m.snapshot().applied, false);
  for (const ticket of h.coordinator().pending) h.call('released', ticket, { stopped: true });
  if (event === 'disconnect') assert.ok(h.call('restart', 'new-epoch'));
  h.sync(); const next = h.business(2); h.badge('hidden');
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null); h.badge('hidden');
  h.m.stoppedAt(h.now, job, { stopped: true }); const current = h.job(next); h.close(next); h.m.stoppedAt(h.now, current.job, { stopped: true });
});

test('rejected foreign preparation/report/hide cannot rebind owner or dismiss badge', () => {
  const h = setup(); h.sync(); const run = h.business(1); const current = h.job(run);
  assert.equal(h.m.prepareAt(0, { ...run.s }, current.copy), null); assert.equal(h.m.reportAt(0, { ...current.job }, 'written'), false);
  assert.equal(h.call('hide', { ...run.s }), false); h.badge('copy-unknown', true);
  assert.equal(h.m.stoppedAt(0, current.job, { stopped: 'true' }), false); h.badge('copy-unknown', true);
  h.close(run); h.m.stoppedAt(0, current.job, { stopped: true });
});

test('retained badge does not self-hide and reads do not advance time or allocate business revision', () => {
  const h = setup(); h.sync(); const run = h.business(1); const { job } = h.job(run); const retained = h.m.result();
  const before = h.m.snapshot(); for (let i = 0; i < 50; i++) h.badge('copy-unknown', true);
  assert.deepEqual(h.m.snapshot(), before); h.m.advance(100); h.badge('hidden');
  assert.deepEqual(retained, { status: 'copy-unknown', awaitingStop: true }); h.now = 100; h.close(run); h.m.stoppedAt(100, job, { stopped: true });
});

test('stop before report remains unknown, never a not-written badge or retry permission', () => {
  const h = setup(); h.sync(); const run = h.business(1); const { job } = h.job(run);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.badge('copy-unknown');
  assert.equal(h.m.reportAt(0, job, 'not-written'), false);
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null); h.badge('copy-unknown'); h.close(run);
});

test('business exhaustion hides result without losing original executor stop cleanup', () => {
  const baseline = setup(); baseline.sync(); const run = baseline.business(1); baseline.job(run);
  const maxRevision = baseline.m.snapshot().state.state.state.lifetime.state.revision + 1;
  const h = setup({ maxRevision }); h.sync(); const limited = h.business(1); const current = h.job(limited);
  assert.ok(h.m.reportAt(0, current.job, 'written')); h.badge('hidden');
  assert.ok(h.m.stoppedAt(0, current.job, { stopped: true })); h.close(limited);
});

test('late Promise from old job cannot label new job written', async () => {
  const h = setup(); h.sync(); const old = h.business(1); const first = h.job(old); let resolve;
  const pending = new Promise(r => { resolve = r; }).then(() => h.m.reportAt(0, first.job, 'written'));
  h.close(old); h.m.stoppedAt(0, first.job, { stopped: true }); const next = h.business(2); const current = h.job(next);
  resolve(); assert.equal(await pending, false); h.badge('copy-unknown', true); h.close(next); h.m.stoppedAt(0, current.job, { stopped: true });
});

test('same-value fresh source update invalidates preflight into not-issued without fabricating write', () => {
  const h = setup(); h.sync(); const run = h.business(1); const copy = h.copy(run); const check = h.prepare(run, copy);
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: true }));
  assert.ok(h.m.receiveAt(0, h.token, { epoch: 'result', channel: 'lock', version: 2, value: false, kind: 'snapshot', observedAt: 0 }));
  h.badge('not-issued'); assert.equal(h.m.handoffAt(0, check), null); assert.equal(h.m.snapshot().busy, false);
  const retry = h.copy(run); assert.ok(h.prepare(run, retry)); h.close(run);
});

test('sticky hide survives a successful same-run retry and new preparation', () => {
  const h = setup(); h.sync(); const run = h.business(1); const first = h.job(run);
  assert.ok(h.call('hide', run.s)); h.m.reportAt(0, first.job, 'not-written'); h.m.stoppedAt(0, first.job, { stopped: true });
  const copy = h.call('requestCopy', h.m.candidate(), { userInitiated: true }); assert.ok(copy); h.badge('hidden');
  const check = h.m.prepareAt(0, run.s, copy); assert.ok(check); h.badge('hidden');
  assert.ok(h.m.checkedAt(0, check, { observedAt: 0, allowed: true })); const job = h.m.handoffAt(0, check); assert.ok(job);
  h.m.reportAt(0, job, 'written'); h.badge('hidden'); h.m.stoppedAt(0, job, { stopped: true }); h.close(run);
});

test('cross-time handoff aborts to not-issued; candidate expiry hides instead', () => {
  const h = setup({ candidateTtl: 3 }); h.sync(); const run = h.business(1); const copy = h.copy(run); const check = h.prepare(run, copy);
  h.m.checkedAt(0, check, { observedAt: 0, allowed: true }); assert.equal(h.m.handoffAt(1, check), null); h.badge('not-issued');
  h.now = 3; assert.ok(h.m.advance(3)); h.badge('hidden'); h.close(run);
});

test('proposal is unimported by product and documents its non-authoritative display scope', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-dictation-copy-result.md');
  for (const pattern of [/SC-20261114-021/, /144/, /TOCTOU/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/, /awaitingStop/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-copy-recovery.md']) assert.ok(read(path).includes('2026-11-14-dictation-copy-result.md'));
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|js|jsx|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-copy-result-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
});
