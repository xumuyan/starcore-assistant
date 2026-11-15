import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationPresentationController } from '../test-helpers/dictation-presentation-controller.mjs';
import { validPresentation } from '../test-helpers/dictation-presentation-worker.mjs';

class FakeChild extends EventEmitter {
  sent = []; killed = []; failSend = false; autoClose = true;
  send(message, done) { this.sent.push(message); done(this.failSend ? new Error('synthetic') : null); }
  kill(signal) { this.killed.push(signal); if (this.autoClose) queueMicrotask(() => this.emit('close', 0, signal)); return true; }
  ready() { this.emit('message', { type: 'ready' }); }
  ack(message = this.sent.at(-1)) { this.emit('message', { type: 'prepared', id: message.id }); }
}
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(t, { real = false, ...options } = {}) {
  const child = new FakeChild(); const seen = [];
  const m = new DictationPresentationController({ enabled: true, epoch: 'controller', sourceTtl: 100,
    consumer: view => seen.push(view), ...(real ? {} : { workerFactory: () => child }), ...options });
  t.after(() => m.close());
  const h = { m, child, seen, now: 0 };
  h.call = (command, ...args) => m.dispatchAt(h.now, command, ...args);
  h.coord = () => m.diagnostic().state.state.state.lifetime.state.coordinator;
  h.sync = () => {
    h.token = m.beginAt(h.now); assert.ok(h.token);
    for (const channel of ['lock', 'settings']) assert.ok(m.receiveAt(h.now, h.token, { epoch: 'controller', channel, version: 1, value: channel === 'settings', kind: 'snapshot', observedAt: h.now }));
  };
  h.listen = n => { const s = h.call('reserve', request(n)); assert.ok(s); const capture = h.call('acquire', s, 'capture', `capture-${n}`); const asr = h.call('acquire', s, 'asr', `asr-${n}`); assert.ok(h.call('inputReady', s, capture)); return { s, capture, asr, n }; };
  h.finish = run => {
    assert.ok(h.call('released', run.capture, { stopped: true })); assert.ok(h.call('process', run.s));
    run.writer = h.call('acquire', run.s, 'writer', `writer-${run.n}`);
    const receipt = h.call('final', run.asr, { text: `第${run.n}轮合成正文` }); const attempt = h.call('begin', receipt, run.writer);
    assert.ok(h.call('result', attempt, run.writer, 'not-issued')); return run;
  };
  h.job = run => { const copy = h.call('requestCopy', m.candidate(), { userInitiated: true }); assert.ok(copy); const check = m.prepareAt(h.now, run.s, copy); assert.ok(check); assert.ok(m.checkedAt(h.now, check, { observedAt: h.now, allowed: true })); const job = m.handoffAt(h.now, check); assert.ok(job); return job; };
  h.closeRun = run => { assert.ok(h.call('close', run.s)); for (const ticket of h.coord().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.flush = () => { if (!m.workerState().ready) child.ready(); while (m.workerState().inFlight) child.ack(); };
  h.hidden = () => { assert.equal(m.snapshot().presentation.status, 'hidden'); assert.equal(seen.at(-1)?.status, 'hidden'); };
  return h;
}
const waitFor = async predicate => {
  const deadline = performance.now() + 5000;
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('synthetic child condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); }
};

test('default off does not spawn or notify; option bounds reject before fork', async () => {
  let spawns = 0, notifications = 0;
  for (const enabled of [undefined, false, 'true']) {
    const m = new DictationPresentationController({ enabled, epoch: 'off', workerFactory: () => { spawns++; }, consumer: () => notifications++ });
    assert.equal(m.beginAt(0), null); assert.equal(m.dispatchAt(0, 'reserve', request(1)), null); await m.close();
  }
  assert.equal(spawns, 0); assert.equal(notifications, 0);
  for (const workerTimeoutMs of [0, -1, 30001, 1.5, Infinity]) assert.throws(() => new DictationPresentationController({ workerTimeoutMs }), /invalid controller options/);
});

test('one in-flight and one replaceable latest slot; startup does not queue all history', t => {
  const h = setup(t); h.sync(); const run = h.listen(1); assert.equal(h.child.sent.length, 0);
  h.child.ready(); assert.equal(h.child.sent.length, 1); const old = h.child.sent[0];
  for (let i = 0; i < 100; i++) assert.ok(h.call('deliver', run.capture, { type: 'meter', source: 'input', level: i / 100 }));
  assert.equal(h.child.sent.length, 1); assert.equal(h.m.workerState().queued, true); h.hidden();
  h.child.ack(old); h.hidden(); assert.equal(h.child.sent.length, 2);
  h.child.ack(); assert.equal(h.m.snapshot().presentation.level, 0.99); assert.equal(h.seen.at(-1).level, 0.99);
  assert.equal(h.m.workerState().queued, false); assert.equal(h.m.workerState().inFlight, false);
});

for (const method of ['advance', 'beginAt', 'receiveAt', 'lostAt', 'dispatchAt', 'prepareAt', 'checkedAt', 'handoffAt', 'reportAt', 'stoppedAt']) test(`consumer immediately invalidated before rejected ${method}`, t => {
  const h = setup(t); h.sync(); h.finish(h.listen(1)); h.flush(); assert.equal(h.seen.at(-1).status, 'copy-available');
  const args = { advance: [-1], beginAt: [-1], receiveAt: [0, {}, {}], lostAt: [0, {}], dispatchAt: [0, 'invalid'], prepareAt: [0, {}, {}], checkedAt: [0, {}, {}], handoffAt: [0, {}], reportAt: [0, {}, 'written'], stoppedAt: [0, {}, { stopped: true }] };
  h.m[method](...args[method]); h.hidden(); h.flush(); assert.equal(h.seen.at(-1).status, 'copy-available');
});

test('throwing business ingress invalidates consumer and preserves original exception', t => {
  const h = setup(t); h.sync(); h.finish(h.listen(1)); h.flush(); const error = new Error('synthetic');
  assert.throws(() => h.m.receiveAt(0, h.token, { get kind() { h.hidden(); throw error; } }), value => value === error);
  h.hidden(); h.flush(); assert.equal(h.seen.at(-1).status, 'copy-available');
});

for (const event of ['error', 'disconnect', 'close', 'bad-id', 'extra-field', 'duplicate-ready', 'send-error']) test(`worker ${event} fails closed, no auto restart, cleanup still allowed`, async t => {
  const h = setup(t); h.sync(); const run = h.finish(h.listen(1)); const job = h.job(run); h.flush(); assert.equal(h.seen.at(-1).status, 'copy-unknown');
  if (event === 'error') h.child.emit('error', new Error('synthetic'));
  if (event === 'disconnect') h.child.emit('disconnect');
  if (event === 'close') h.child.emit('close', 1, null);
  if (event === 'bad-id') h.child.emit('message', { type: 'prepared', id: '00000000-0000-4000-8000-000000000000' });
  if (event === 'extra-field') h.child.emit('message', { type: 'ready', outcome: 'written' });
  if (event === 'duplicate-ready') h.child.ready();
  if (event === 'send-error') { h.child.failSend = true; h.m.advance(0); }
  h.hidden(); assert.equal(h.m.workerState().failed, true); assert.equal(h.m.diagnostic().busy, true);
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.m.handoffAt(0, {}), null);
  assert.ok(h.m.reportAt(0, job, 'unknown')); assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.closeRun(run);
  await h.m.close(); assert.equal(h.m.workerState().childClosed, true);
});

test('spawn throw leaves no child and fails closed', async () => {
  const m = new DictationPresentationController({ enabled: true, epoch: 'throw', workerFactory: () => { throw new Error('synthetic'); } });
  assert.equal(m.workerState().failed, true); assert.equal(m.beginAt(0), null); await m.close();
});

for (const phase of ['startup', 'job']) test(`worker ${phase} watchdog hides and retires only owned child`, async t => {
  const h = setup(t, { workerTimeoutMs: 20 }); h.sync(); h.listen(1); if (phase === 'job') h.child.ready();
  await waitFor(() => h.m.workerState().failed); h.hidden(); await h.m.close();
  assert.deepEqual(h.child.killed, ['SIGTERM']); assert.equal(h.m.workerState().childClosed, true);
});

test('consumer exception is latched without escaping into worker events; reentry rejected', async t => {
  let m; let calls = 0;
  const child = new FakeChild();
  m = new DictationPresentationController({ enabled: true, epoch: 'consumer', workerFactory: () => child, consumer: () => { calls++; m.advance(0); } });
  t.after(() => m.close());
  assert.equal(m.beginAt(0), null); assert.equal(m.workerState().deliveryFailed, true); assert.equal(m.workerState().failed, true);
  assert.equal(calls, 1); await m.close(); assert.equal(m.snapshot().presentation.status, 'hidden');
});

test('close waits for real close event; late ACK cannot revive shown data or create a stop proof', async t => {
  const h = setup(t); h.sync(); const run = h.finish(h.listen(1)); const job = h.job(run); h.child.ready(); const message = h.child.sent.at(-1);
  h.child.autoClose = false; let resolved = false; const closed = h.m.close().then(() => { resolved = true; });
  h.hidden(); h.child.ack(message); await new Promise(resolve => setImmediate(resolve)); assert.equal(resolved, false);
  assert.equal(h.m.diagnostic().busy, true); assert.equal(h.call('reserve', request(2)), null);
  h.child.emit('close', 0, null); await closed; assert.equal(resolved, true); assert.equal(h.m.workerState().childClosed, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.closeRun(run);
});

for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) test(`stale ACK, old result and old stop cannot label new run: ${outcome}, meters=${coalesceMeters}`, t => {
  const h = setup(t, { coalesceMeters }); h.sync(); const old = h.finish(h.listen(1)); const job = h.job(old); h.flush();
  h.closeRun(old); const stale = h.child.sent.at(-1); const next = h.listen(2);
  assert.ok(h.m.reportAt(0, job, outcome)); h.finish(next); h.hidden(); h.child.ack(stale); h.hidden();
  h.child.ack(); assert.equal(h.seen.at(-1).status, 'copy-waiting'); assert.equal(h.seen.at(-1).canCopy, false);
  assert.equal(h.call('requestCopy', h.m.candidate(), { userInitiated: true }), null);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.hidden(); h.flush();
  assert.equal(h.seen.at(-1).status, 'copy-available'); assert.equal(h.seen.at(-1).canCopy, true);
  assert.equal(h.m.diagnostic().applied, false); assert.equal(h.m.diagnostic().outcome, outcome); h.closeRun(next);
});

const permutations = values => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [v, ...rest])) : [[]];
for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written', 'unknown']) test(`24 parent/child ACK prefix orders: ${outcome}, meters=${coalesceMeters}`, async t => {
  let count = 0;
  for (const order of permutations(['finish', 'report', 'stop', 'ack'])) {
    const h = setup(t, { coalesceMeters }); h.sync(); const old = h.finish(h.listen(1)); const job = h.job(old); h.flush(); h.closeRun(old);
    const stale = h.child.sent.at(-1); const next = h.listen(2); const seen = new Set();
    for (const event of order) {
      if (event === 'finish') h.finish(next);
      if (event === 'report') assert.equal(h.m.reportAt(0, job, outcome), !seen.has('stop'));
      if (event === 'stop') assert.ok(h.m.stoppedAt(0, job, { stopped: true }));
      if (event === 'ack') h.child.ack(stale);
      seen.add(event); h.hidden();
      assert.equal(h.m.diagnostic().busy, !seen.has('stop')); assert.equal(h.m.diagnostic().applied, false);
    }
    h.flush(); const expected = h.seen.at(-1); assert.equal(expected.status, 'copy-available'); assert.equal(expected.canCopy, true); assert.equal(expected.awaitingStop, false);
    h.closeRun(next); await h.m.close(); count++;
  }
  assert.equal(count, 24);
});

for (const event of ['hide', 'dismiss', 'loss', 'candidate-expiry', 'source-expiry']) test(`${event} reaches consumer before late child ACK and never manufactures stop`, t => {
  const h = setup(t, { candidateTtl: 3 }); h.sync(); const run = h.finish(h.listen(1)); const job = h.job(run); h.flush();
  h.m.advance(0); const stale = h.child.sent.at(-1);
  if (event === 'hide') h.call('hide', run.s);
  if (event === 'dismiss') h.call('dismiss');
  if (event === 'loss') h.m.lostAt(0, h.token);
  if (event.endsWith('expiry')) { h.now = event === 'candidate-expiry' ? 3 : 100; h.m.advance(h.now); }
  h.hidden(); h.child.ack(stale); h.hidden(); h.flush(); h.hidden(); assert.equal(h.m.diagnostic().busy, true);
  assert.ok(h.m.reportAt(h.now, job, 'written')); h.flush(); h.hidden(); assert.ok(h.m.stoppedAt(h.now, job, { stopped: true }));
});

test('duplicate ACK fails closed rather than accepting a finished job again', t => {
  const h = setup(t); h.sync(); h.finish(h.listen(1)); h.flush(); const message = h.child.sent.at(-1); h.child.ack(message);
  h.hidden(); assert.equal(h.m.workerState().failed, true);
});

test('actual child crash hides current consumer and cannot be mistaken for clipboard stop', { timeout: 15000 }, async t => {
  let owned;
  const h = setup(t, { workerFactory: () => {
    owned = fork(fileURLToPath(new URL('../test-helpers/dictation-presentation-worker.mjs', import.meta.url)), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [], env: { PATH: process.env.PATH || '' } }); return owned;
  } });
  h.sync(); const run = h.finish(h.listen(1)); const job = h.job(run);
  await waitFor(() => h.seen.at(-1)?.status === 'copy-unknown'); owned.kill('SIGTERM');
  await waitFor(() => h.m.workerState().childClosed); h.hidden(); assert.equal(h.m.workerState().failed, true); assert.equal(h.m.diagnostic().busy, true);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.closeRun(run);
});

test('actual fork validates current display; lifecycle complete and child closed', { timeout: 15000 }, async t => {
  const h = setup(t, { real: true }); h.sync(); const run = h.finish(h.listen(1));
  await waitFor(() => h.seen.at(-1)?.status === 'copy-available');
  const job = h.job(run); await waitFor(() => h.seen.at(-1)?.status === 'copy-unknown');
  assert.ok(h.m.reportAt(0, job, 'not-written')); h.hidden();
  await waitFor(() => h.seen.at(-1)?.status === 'copy-not-written'); assert.equal(h.seen.at(-1).awaitingStop, true); assert.equal(h.seen.at(-1).canCopy, false);
  assert.ok(h.m.stoppedAt(0, job, { stopped: true })); await waitFor(() => h.seen.at(-1)?.canCopy === true);
  h.closeRun(run); await h.m.close(); h.hidden(); assert.equal(h.m.workerState().childClosed, true); assert.equal(h.m.workerState().failed, false);
});

test('owned unresponsive child receives bounded escalation but close still requires close event', { timeout: 5000 }, async t => {
  const h = setup(t); h.child.autoClose = false; h.sync();
  const closing = h.m.close(); await waitFor(() => h.child.killed.includes('SIGKILL'));
  assert.deepEqual(h.child.killed, ['SIGTERM', 'SIGKILL']); assert.equal(h.m.workerState().childClosed, false);
  h.child.emit('close', null, 'SIGKILL'); await closing; assert.equal(h.m.workerState().childClosed, true);
});

test('original revision exhaustion hides consumer and retains original executor cleanup', t => {
  const baseline = setup(t); baseline.sync(); const original = baseline.finish(baseline.listen(1)); baseline.job(original);
  const maxRevision = baseline.m.diagnostic().state.state.state.lifetime.state.revision + 1;
  const h = setup(t, { maxRevision }); h.sync(); const run = h.finish(h.listen(1)); const job = h.job(run); h.flush();
  assert.ok(h.m.reportAt(0, job, 'written')); h.hidden(); assert.equal(h.m.workerState().queued, false);
  assert.equal(h.m.diagnostic().busy, true); assert.ok(h.m.stoppedAt(0, job, { stopped: true })); h.closeRun(run);
});

test('subprocess payload is display-only while original handles and full writer text stay parent-owned', t => {
  const h = setup(t); h.sync(); const run = h.finish(h.listen(1)); h.child.ready(); const message = h.child.sent.at(-1);
  assert.deepEqual(Object.keys(message).sort(), ['id', 'presentation', 'type']); assert.ok(validPresentation(message.presentation));
  assert.deepEqual(Object.keys(message.presentation).sort(), ['awaitingStop','canCopy','executorWaiting','level','showOrbs','status','text','truncated']);
  assert.equal(JSON.stringify(message).includes(run.s.requestId), false); assert.equal(Object.isFrozen(message.presentation), true);
  h.child.ack(); assert.equal(h.m.model, undefined); assert.equal(h.m.copyTextAt, undefined); assert.equal(h.m.commit, undefined);
});

test('actual child rejects oversized, extra and effect-bearing requests with text-free replies', { timeout: 15000 }, async t => {
  const child = fork(fileURLToPath(new URL('../test-helpers/dictation-presentation-worker.mjs', import.meta.url)), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [], env: { PATH: process.env.PATH || '' } });
  child.stdout.resume(); child.stderr.resume(); const messages = []; child.on('message', message => messages.push(message));
  const closed = new Promise(resolve => child.once('close', resolve)); t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await closed; });
  await waitFor(() => messages.length === 1); assert.deepEqual(messages.shift(), { type: 'ready' });
  const presentation = { status: 'copy-unknown', text: '合成展示正文', truncated: false, level: 0, showOrbs: false, canCopy: false, awaitingStop: true, executorWaiting: false };
  assert.ok(validPresentation(presentation)); const id = '12345678-1234-4234-8234-123456789012';
  for (const message of [ { type: 'prepare', id, presentation: { ...presentation, text: 'x'.repeat(8001) } }, { type: 'prepare', id, presentation, outcome: 'written' }, { type: 'reportAt', id, presentation }, { type: 'prepare', id, presentation: { ...presentation, target: 'synthetic' } } ]) {
    child.send(message); await waitFor(() => messages.length === 1); assert.deepEqual(messages.shift(), { type: 'protocol-error' });
  }
  child.send({ type: 'prepare', id, presentation }); await waitFor(() => messages.length === 1); assert.deepEqual(messages.shift(), { type: 'prepared', id });
  child.send({ type: 'shutdown' }); await closed;
});

test('presentation worker validator bounds fields without claiming business authentication', () => {
  const base = { status: 'hidden', text: '', truncated: false, level: 0, showOrbs: false, canCopy: false, awaitingStop: false, executorWaiting: false };
  assert.ok(validPresentation(base));
  for (const value of [null, [], { ...base, status: 'written' }, { ...base, level: NaN }, { ...base, text: '\ud800' }, { ...base, canCopy: 'true' }]) assert.equal(validPresentation(value), false);
});

test('parent and child remain unimported by product', () => {
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|js|jsx|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(readFileSync(new URL(`../${child}`, import.meta.url), 'utf8'), /dictation-presentation-controller|dictation-presentation-worker|DictationPresentationController/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
});
