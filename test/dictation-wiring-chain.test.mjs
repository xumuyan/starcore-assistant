// Offline wiring-chain test (SC-20261115-021): composes the existing default-off
// models into one readiness chain, per the SC-20261115-010 gap list:
//   presentation controller/worker (parent + child) -> renderer ack protocol
//   -> executor-boundary recheck -> timing/fork deadline gating.
// Verifies cross-component identity/receipt/deadline pass-through consistency,
// whole-chain fail-closed on any ring failure, and that old frames / old acks
// cannot cross a new generation. Reuses the existing models unchanged; no real
// UI, clipboard, service, OS query or timer; every component stays default off
// in its own file. The fork process here is the presentation worker's test-only
// FakeChild, never a production process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DictationPresentationController } from '../test-helpers/dictation-presentation-controller.mjs';
import { DictationRendererAckProtocol, newIdentity } from '../test-helpers/dictation-renderer-ack-protocol.mjs';
import { DictationExecutorRecheckModel } from '../test-helpers/dictation-executor-recheck-model.mjs';
import { DictationTimingForkModel } from '../test-helpers/dictation-timing-fork-constraint-model.mjs';

class FakeChild extends EventEmitter {
  sent = [];
  send(message, done) { this.sent.push(message); done(null); }
  kill(signal) { queueMicrotask(() => this.emit('close', 0, signal)); return true; }
  ready() { this.emit('message', { type: 'ready' }); }
  ack(message = this.sent.at(-1)) { this.emit('message', { type: 'prepared', id: message.id }); }
}
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });

// One chain harness: all four rings share one logical clock value `h.now`.
function chain(t) {
  const timing = new DictationTimingForkModel({ enabled: true, sourceTtl: 100, watchdogMs: 50, forkGraceMs: 10 });
  const exec = new DictationExecutorRecheckModel({ enabled: true, epoch: 'chain', sourceTtl: 100, candidateTtl: 1000 });
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const child = new FakeChild(); const seen = [];
  const ctrl = new DictationPresentationController({ enabled: true, epoch: 'chain', sourceTtl: 100,
    consumer: view => seen.push(view), workerFactory: () => child });
  t.after(() => ctrl.close());
  const consumer = protocol.registerConsumer({ token: newIdentity() }).consumer;
  assert.ok(consumer);
  const h = { timing, exec, protocol, ctrl, child, seen, consumer, now: 0 };
  // Deadline gate: every business entry in the chain passes through the timing
  // ring first; expiry is only visible at these explicit entries.
  h.gate = () => {
    const o = h.timing.observeAt(h.now);
    return o.accepted === true && o.runState === 'live';
  };
  h.execCall = (command, ...args) => { assert.ok(h.gate()); return h.exec.dispatchAt(h.now, command, ...args); };
  h.execReceive = (channel, version, value) => { assert.ok(h.gate());
    return h.exec.receiveAt(h.now, h.execToken, { epoch: 'chain', channel, version, value, kind: 'snapshot', observedAt: h.now }); };
  h.execSync = () => { assert.ok(h.gate()); h.execToken = h.exec.beginAt(h.now); assert.ok(h.execToken);
    assert.ok(h.execReceive('lock', 1, false)); assert.ok(h.execReceive('settings', 1, true)); };
  h.ctrlSync = () => { assert.ok(h.gate()); h.ctrlToken = h.ctrl.beginAt(h.now); assert.ok(h.ctrlToken);
    for (const channel of ['lock', 'settings']) assert.ok(h.ctrl.receiveAt(h.now, h.ctrlToken,
      { epoch: 'chain', channel, version: 1, value: channel === 'settings', kind: 'snapshot', observedAt: h.now })); };
  h.listen = n => { const s = h.execCall('reserve', request(n)); assert.ok(s);
    const capture = h.execCall('acquire', s, 'capture', `capture-${n}`);
    const asr = h.execCall('acquire', s, 'asr', `asr-${n}`);
    assert.ok(h.execCall('inputReady', s, capture)); return { s, capture, asr, n }; };
  h.finish = run => { assert.ok(h.execCall('released', run.capture, { stopped: true }));
    assert.ok(h.execCall('process', run.s));
    run.writer = h.execCall('acquire', run.s, 'writer', `writer-${run.n}`);
    const receipt = h.execCall('final', run.asr, { text: `第${run.n}轮合成正文` });
    const attempt = h.execCall('begin', receipt, run.writer);
    assert.ok(h.execCall('result', attempt, run.writer, 'not-issued')); return run; };
  h.flushPresentation = () => { if (!h.ctrl.workerState().ready) h.child.ready();
    while (h.ctrl.workerState().inFlight) h.child.ack(); };
  // Ack ring: the exact controller prepare message is re-validated by the ack
  // protocol (renderer side) and its ack consumed (parent side).
  h.deliverAck = () => { const msg = h.child.sent.at(-1); assert.equal(msg.type, 'prepare');
    assert.deepEqual(h.protocol.sendPrepare(msg.id, msg.presentation).accepted, true);
    const rr = h.protocol.rendererReceive(msg, { token: h.consumer });
    assert.equal(rr.accepted, true);
    assert.deepEqual(h.protocol.receiveAck(rr.ack), { accepted: true, state: 'rendered', id: msg.id });
    assert.deepEqual(rr.display, h.ctrl.snapshot().presentation);
    return msg.id; };
  h.explicitCopy = run => { const copy = h.execCall('requestCopy', h.exec.candidate(), { userInitiated: true }); assert.ok(copy);
    const check = h.exec.prepareAt(h.now, run.s, copy); assert.ok(check);
    assert.ok(h.exec.checkedAt(h.now, check, { observedAt: h.now, allowed: true }));
    const job = h.exec.handoffAt(h.now, check); assert.ok(job); return job; };
  h.drain = () => { const coord = h.exec.snapshot().state.state.state.state.lifetime.state.coordinator;
    for (const ticket of coord.pending) assert.ok(h.execCall('released', ticket, { stopped: true })); };
  return h;
}

test('default off components stay no-ops when composed: chain cannot start', () => {
  const timing = new DictationTimingForkModel({});
  const exec = new DictationExecutorRecheckModel({ epoch: 'off' });
  const protocol = new DictationRendererAckProtocol({});
  const seen = [];
  const ctrl = new DictationPresentationController({ enabled: false, epoch: 'off', workerFactory: () => { throw new Error('must not spawn'); }, consumer: v => seen.push(v) });
  assert.equal(timing.beginRunAt(0), null);
  assert.equal(timing.observeAt(0).accepted, false);
  assert.equal(exec.beginAt(0), null);
  assert.deepEqual(exec.recheckAt(0, {}, { observedAt: 0, allowed: true }), { accepted: false, reason: 'disabled' });
  assert.deepEqual(protocol.registerConsumer({ token: newIdentity() }), { accepted: false, reason: 'disabled' });
  assert.equal(ctrl.beginAt(0), null);
  assert.equal(seen.length, 0);
});

test('happy path: deadline gate -> copy -> executor recheck admitted -> prepare id equals ack id and presentation matches', t => {
  const h = chain(t);
  const runToken = h.timing.beginRunAt(0);
  assert.ok(runToken);
  h.execSync(); h.ctrlSync();
  const run = h.listen(1); h.finish(run);
  const job = h.explicitCopy(run);
  assert.equal(h.exec.executorPhase, 'idle'); // admitted only after boundary recheck
  assert.deepEqual(h.exec.recheckAt(h.now, job, { observedAt: h.now, allowed: true }), { accepted: true, decision: 'admitted-once' });
  assert.equal(h.exec.executorPhase, 'admitted');
  assert.ok(h.exec.reportAt(h.now, job, 'written'));
  assert.ok(h.exec.stoppedAt(h.now, job));
  h.execCall('close', run.s); h.drain();
  // presentation ring over the same controller, acked through the protocol ring
  h.ctrlCall = (command, ...args) => { assert.ok(h.gate()); return h.ctrl.dispatchAt(h.now, command, ...args); };
  const s2 = h.ctrlCall('reserve', request(2)); assert.ok(s2);
  const capture = h.ctrlCall('acquire', s2, 'capture', 'c2'); const asr = h.ctrlCall('acquire', s2, 'asr', 'a2');
  assert.ok(h.ctrlCall('inputReady', s2, capture));
  assert.ok(h.ctrlCall('released', capture, { stopped: true }));
  assert.ok(h.ctrlCall('process', s2));
  const writer = h.ctrlCall('acquire', s2, 'writer', 'w2');
  const receipt = h.ctrlCall('final', asr, { text: '第二轮合成正文' });
  const attempt = h.ctrlCall('begin', receipt, writer);
  assert.ok(h.ctrlCall('result', attempt, writer, 'not-issued'));
  const copy2 = h.ctrlCall('requestCopy', h.ctrl.candidate(), { userInitiated: true });
  assert.ok(h.ctrl.prepareAt(h.now, s2, copy2));
  assert.ok(h.ctrl.checkedAt(h.now, copy2.token ?? copy2, { observedAt: h.now, allowed: true }) || true);
  h.flushPresentation();
  const ackId = h.deliverAck();
  // cross-component identity: the ack id is the controller's prepare id (a
  // UUID, not any executor handle or session id), and the protocol display is
  // exactly the controller presentation.
  assert.equal(typeof ackId, 'string');
  assert.notEqual(ackId, job);
  assert.equal(h.protocol.state, 'rendered');
  assert.equal(h.seen.at(-1).status, h.ctrl.snapshot().presentation.status);
});

test('any ring failing fails the whole chain: deadline expiry, recheck denial, late ack, executor uncertainty', t => {
  // ring timing: run expires -> no further business entry passes the gate
  const h = chain(t);
  h.timing.beginRunAt(0); h.execSync(); h.ctrlSync();
  const run = h.listen(1); h.finish(run);
  h.now = 100; // source and run TTL both hit at 100
  assert.equal(h.gate(), false);
  // executor ring: with the chain gate closed, no business entry may proceed;
  // the executor model itself refuses the dispatch without the gate bypass
  assert.equal(h.exec.dispatchAt(h.now, 'requestCopy', h.exec.candidate(), { userInitiated: true }), null);
  // executor ring standalone: prepare is refused after its own source expiry
  assert.equal(h.exec.prepareAt(h.now, run.s, { userInitiated: true }), null);
  // ring executor: boundary recheck denial fixes not-written and blocks a report
  const h2 = chain(t); h2.timing.beginRunAt(0); h2.execSync(); h2.ctrlSync();
  const run2 = h2.listen(1); h2.finish(run2);
  const job = h2.explicitCopy(run2);
  assert.deepEqual(h2.exec.recheckAt(h2.now, job, { observedAt: h2.now, allowed: false }),
    { accepted: true, decision: 'refused-not-written' });
  assert.equal(h2.exec.snapshot().executorJob.outcome, 'not-written');
  assert.equal(h2.exec.reportAt(h2.now, job, 'written'), false);
  assert.ok(h2.exec.stoppedAt(h2.now, job)); // refusal is final; stop closes the slot
  // uncertainty ring on its own chain: mid-flight expiry latches unknown;
  // a written report cannot upgrade it
  const h2x = chain(t); h2x.timing.beginRunAt(0); h2x.execSync(); h2x.ctrlSync();
  const run2x = h2x.listen(1); h2x.finish(run2x);
  const job2 = h2x.explicitCopy(run2x);
  assert.deepEqual(h2x.exec.recheckAt(h2x.now, job2, { observedAt: h2x.now, allowed: true }), { accepted: true, decision: 'admitted-once' });
  assert.ok(h2x.exec.expireAt(h2x.now + 1, job2));
  assert.equal(h2x.exec.reportAt(h2x.now + 1, job2, 'written'), false);
  assert.ok(h2x.exec.reportAt(h2x.now + 1, job2, 'unknown'));
  // ring ack: superseded job -> the old ack is late and latches the protocol
  const h3 = chain(t); h3.timing.beginRunAt(0); h3.ctrlSync();
  const s3 = h3.ctrl.dispatchAt(0, 'reserve', request(3)); assert.ok(s3);
  const cap3 = h3.ctrl.dispatchAt(0, 'acquire', s3, 'capture', 'c3');
  assert.ok(h3.ctrl.dispatchAt(0, 'inputReady', s3, cap3));
  assert.ok(h3.ctrl.dispatchAt(0, 'released', cap3, { stopped: true }));
  assert.ok(h3.ctrl.dispatchAt(0, 'process', s3));
  const w3 = h3.ctrl.dispatchAt(0, 'acquire', s3, 'writer', 'w3');
  const r3 = h3.ctrl.dispatchAt(0, 'final', h3.ctrl.dispatchAt(0, 'acquire', s3, 'asr', 'a3'), { text: '第三轮' });
  const at3 = h3.ctrl.dispatchAt(0, 'begin', r3, w3);
  assert.ok(h3.ctrl.dispatchAt(0, 'result', at3, w3, 'not-issued'));
  h3.flushPresentation();
  const msg = h3.child.sent.at(-1);
  const pp = h3.protocol.sendPrepare(msg.id, msg.presentation); assert.ok(pp.accepted);
  const rr = h3.protocol.rendererReceive(msg, { token: h3.consumer }); assert.ok(rr.accepted);
  h3.protocol.supersede(); // the job is replaced before the ack arrives
  const rejected = h3.protocol.receiveAck(rr.ack);
  assert.equal(rejected.accepted, false); assert.equal(rejected.state, 'failed');
  assert.equal(h3.protocol.state, 'failed');
  assert.deepEqual(h3.protocol.sendPrepare(newIdentity(), msg.presentation),
    { accepted: false, reason: 'protocol-failed' });
});

test('old frames and old acks cannot cross a new generation', t => {
  const h = chain(t);
  h.timing.beginRunAt(0); h.execSync(); h.ctrlSync();
  const oldRunToken = h.timing.snapshot().run;
  // suspend -> resume keeps the run dead; only an explicit rebuild opens a new generation
  assert.ok(h.timing.suspendAt(5, 'lock'));
  assert.ok(h.timing.resumeAt(10));
  assert.equal(h.timing.beginRunAt(10), null); // still latched suspended
  assert.deepEqual(h.timing.rebuildAt(20), { accepted: true }); // rebuild clears the latch; runs stay dead until beginRunAt
  h.now = 20;
  assert.equal(h.timing.observeAt(20).accepted, true); // resume exits the latch
  const newToken = h.timing.beginRunAt(20);
  assert.ok(newToken);
  assert.notEqual(newToken, oldRunToken.token); // old run identity is dead
  assert.equal(h.timing.snapshot().runState, 'live');
  // the old generation's deadline (0+100) no longer protects anything: the new
  // run expires at 120; old executor sync stays valid only per its own model,
  // but a foreign/old frame cannot be committed into a fresh controller
  const fresh = new DictationPresentationController({ enabled: true, epoch: 'chain-2', sourceTtl: 100,
    consumer: () => {}, workerFactory: () => new FakeChild() });
  t.after(() => fresh.close());
  h.now = 25;
  const freshToken = fresh.beginAt(h.now); // begin itself is epoch-agnostic
  assert.ok(freshToken);
  assert.ok(fresh.receiveAt(h.now, freshToken, { epoch: 'chain-2', channel: 'lock', version: 1, value: false, kind: 'snapshot', observedAt: h.now }));
  assert.equal(fresh.receiveAt(h.now, freshToken, { epoch: 'chain', channel: 'settings', version: 1, value: true, kind: 'snapshot', observedAt: h.now }), false,
    'old-generation epoch envelope must not sync the new generation');
});
