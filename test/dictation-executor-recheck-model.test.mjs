// Offline tests for the executor-boundary TOCTOU recheck and one-slot executor
// wait wiring-readiness model (SC-20261115-019, gap item 2 of the consumer
// boundary audit). No real input, clipboard, timer or OS query; default off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DictationExecutorRecheckModel, executorPhases, executorOutcomes } from '../test-helpers/dictation-executor-recheck-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(options = {}) {
  const model = new DictationExecutorRecheckModel({ enabled: true, epoch: 'recheck', sourceTtl: 100, candidateTtl: 1000, ...options });
  const h = { model, now: 0, epoch: 'recheck' };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.receive = (channel, version, value, kind = 'snapshot') => model.receiveAt(h.now, h.token, { epoch: h.epoch, channel, version, value, kind, observedAt: h.now });
  h.sync = version => { h.token = model.beginAt(h.now); assert.ok(h.token); assert.ok(h.receive('lock', version, false)); assert.ok(h.receive('settings', version, true)); };
  h.coordinator = () => model.snapshot().state.state.state.state.lifetime.state.coordinator;
  h.drain = () => { for (const ticket of h.coordinator().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.copying = (text = '合成完整正文') => {
    h.session = h.call('reserve', request(1)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', 'capture-1'); h.asr = h.call('acquire', h.session, 'asr', 'asr-1');
    assert.ok(h.call('inputReady', h.session, h.capture));
    h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', 'writer'); h.receipt = h.call('final', h.asr, { text });
    h.attempt = h.call('begin', h.receipt, h.writer); assert.ok(h.call('result', h.attempt, h.writer, 'not-issued'));
    h.copy = h.call('requestCopy', model.candidate(), { userInitiated: true }); assert.ok(h.copy);
  };
  h.handoff = () => {
    h.check = model.prepareAt(h.now, h.session, h.copy); assert.ok(h.check);
    assert.ok(model.checkedAt(h.now, h.check, { observedAt: h.now, allowed: true }));
    h.job = model.handoffAt(h.now, h.check); assert.ok(h.job);
  };
  h.cleanup = () => { h.call('close', h.session); h.drain(); if (model.snapshot().state.busy) assert.ok(model.stoppedAt(h.now, h.job, { stopped: true })); };
  return h;
}

test('default off: every entry is a rejected no-op and executorPhases/outcomes are fixed', () => {
  assert.deepEqual([...executorPhases].sort(), ['admitted', 'done', 'idle', 'refused', 'uncertain', 'waiting'].sort());
  assert.deepEqual([...executorOutcomes].sort(), ['not-written', 'unknown', 'written'].sort());
  for (const enabled of [undefined, false, 'true']) {
    const m = new DictationExecutorRecheckModel({ epoch: 'off', enabled });
    assert.equal(m.enabled, false);
    assert.equal(m.advance(0), false); assert.equal(m.beginAt(0), null);
    assert.equal(m.prepareAt(0, {}, {}), null); assert.equal(m.handoffAt(0, {}), null);
    assert.deepEqual(m.recheckAt(0, {}, { observedAt: 0, allowed: true }), { accepted: false, reason: 'disabled' });
    assert.equal(m.expireAt(0, {}), false); assert.equal(m.reportAt(0, {}, 'written'), false);
    assert.equal(m.stoppedAt(0, {}), false); assert.equal(m.snapshot().executorPhase, 'idle');
    assert.equal(m.snapshot().executorJob, null);
  }
});

test('happy path: handoff -> boundary recheck admitted once -> report written -> stop releases', () => {
  const h = setup(); h.sync(1); h.copying(); h.handoff();
  assert.equal(h.model.executorPhase, 'idle'); // admitted only after recheck
  const first = h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true });
  assert.deepEqual(first, { accepted: true, decision: 'admitted-once' });
  assert.equal(h.model.executorPhase, 'admitted');
  assert.deepEqual(h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true }), { accepted: false, reason: 'no-job-at-boundary' });
  assert.ok(h.model.reportAt(h.now, h.job, 'written'));
  assert.equal(h.model.snapshot().executorJob.outcome, 'written');
  assert.equal(h.model.snapshot().state.busy, true); // stop still required
  assert.ok(h.model.stoppedAt(h.now, h.job, { stopped: true }));
  assert.equal(h.model.executorPhase, 'done');
  h.cleanup();
});

test('boundary recheck refuses stale or non-matching evidence and denied guard fixes not-written', () => {
  const h = setup(); h.sync(1); h.copying(); h.handoff();
  for (const bad of [{ allowed: true }, { observedAt: h.now + 1, allowed: true }, { observedAt: h.now, allowed: 'yes' }, {}]) {
    const r = h.model.recheckAt(h.now, h.job, bad);
    assert.equal(r.accepted, false); assert.equal(r.reason, 'invalid-evidence');
    assert.equal(h.model.executorPhase, 'idle');
  }
  assert.equal(h.model.stats.admissionRefused, 4);
  const denied = h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: false });
  assert.deepEqual(denied, { accepted: true, decision: 'refused-not-written' });
  assert.equal(h.model.executorPhase, 'refused');
  assert.equal(h.model.snapshot().executorJob.outcome, 'not-written');
  // refusal already fixed the outcome; a later report or re-admission is rejected
  assert.equal(h.model.reportAt(h.now, h.job, 'written'), false);
  assert.equal(h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true }).accepted, false);
  assert.ok(h.model.stoppedAt(h.now, h.job, { stopped: true }));
  h.cleanup();
});

test('executor slot: a second handoff while in flight is a recorded wait, never queued', () => {
  const h = setup(); h.sync(1); h.copying(); h.handoff();
  const waitsBefore = h.model.stats.waitsRecorded;
  assert.equal(h.model.handoffAt(h.now, h.check), null);
  assert.equal(h.model.executorPhase, 'waiting');
  assert.equal(h.model.stats.waitsRecorded, waitsBefore + 1);
  assert.equal(h.model.snapshot().executorJob.phase, 'waiting');
  // wait does not consume the in-flight job; recheck still works
  assert.deepEqual(h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true }), { accepted: true, decision: 'admitted-once' });
  assert.equal(h.model.executorPhase, 'admitted');
  assert.ok(h.model.stoppedAt(h.now, h.job, { stopped: true }));
  assert.equal(h.model.executorPhase, 'done');
  h.cleanup();
});

test('mid-flight expiry/loss is uncertain: report cannot upgrade unknown to written', () => {
  const h = setup(); h.sync(1); h.copying(); h.handoff();
  assert.ok(h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true }));
  h.now = 100; assert.ok(h.model.advance(100)); // source TTL expiry path
  assert.ok(h.model.expireAt(h.now, h.job));
  assert.equal(h.model.snapshot().executorJob.outcome, 'unknown');
  assert.equal(h.model.reportAt(h.now, h.job, 'written'), false);
  assert.ok(h.model.reportAt(h.now, h.job, 'unknown'));
  assert.equal(h.model.reportAt(h.now, h.job, 'unknown'), false); // single report
  assert.ok(h.model.stoppedAt(h.now, h.job, { stopped: true }));
  h.cleanup();
});

test('reports are one-shot, handle-bound and whitelisted; stop alone leaves unknown', () => {
  const h = setup(); h.sync(1); h.copying(); h.handoff();
  assert.ok(h.model.recheckAt(h.now, h.job, { observedAt: h.now, allowed: true }));
  for (const bad of ['issued', '', null, 'WRITTEN']) assert.equal(h.model.reportAt(h.now, h.job, bad), false);
  assert.equal(h.model.reportAt(h.now, { ...h.job }, 'written'), false);
  assert.equal(h.model.stoppedAt(h.now, { ...h.job }), false);
  assert.ok(h.model.stoppedAt(h.now, h.job, { stopped: true }));
  assert.equal(h.model.snapshot().executorJob.outcome, 'unknown'); // stop alone leaves unknown
  assert.equal(h.model.executorPhase, 'done');
  h.cleanup();
});

test('source file stays offline: no OS/clipboard/input/timer imports or effects', () => {
  const source = readFileSync('test-helpers/dictation-executor-recheck-model.mjs', 'utf8');
  for (const banned of [/NSPasteboard/, /pbcopy/, /CGEvent/, /child_process/, /setTimeout|setInterval/, /Date\.now/, /performance\.now/, /execSync|spawnSync/, /process\.kill/]) {
    assert.doesNotMatch(source, banned);
  }
});
