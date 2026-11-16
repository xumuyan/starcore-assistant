// Offline tests for the timer / lock-screen / fork timing constraint
// wiring-readiness model (SC-20261115-019, gap items 4 and 5). Logical clock
// only; no real timers, listeners, processes or signals; default off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DictationTimingForkModel, forkStates, runStates } from '../test-helpers/dictation-timing-fork-constraint-model.mjs';

const setup = (options = {}) => new DictationTimingForkModel({ enabled: true, sourceTtl: 100, watchdogMs: 50, forkGraceMs: 10, ...options });

test('default off and fixed state vocabularies; constructor validates ranges', () => {
  assert.deepEqual([...runStates].sort(), ['expired', 'live', 'no-run', 'resumed-dead', 'suspended'].sort());
  assert.deepEqual([...forkStates].sort(), ['closed', 'failed', 'in-flight', 'kill-requested', 'off', 'ready', 'terminating'].sort());
  for (const enabled of [undefined, false, 'yes']) {
    const m = new DictationTimingForkModel({ enabled });
    assert.equal(m.enabled, false);
    assert.deepEqual(m.beginRunAt(0), null);
    assert.deepEqual(m.forkAt(0), { accepted: false, reason: 'disabled' });
    assert.deepEqual(m.watchdogAt(0), { accepted: false, reason: 'disabled' });
    assert.equal(m.snapshot().runState, 'no-run');
    assert.equal(m.snapshot().forkState, 'off');
    assert.equal(m.latched, false);
  }
  for (const bad of [{ sourceTtl: 0 }, { sourceTtl: 'x' }, { watchdogMs: 0 }, { watchdogMs: 30001 }, { forkGraceMs: 0 }]) {
    assert.throws(() => new DictationTimingForkModel({ enabled: true, ...bad }), TypeError);
  }
  assert.equal(new DictationTimingForkModel({ enabled: true, watchdogMs: 30000 }).enabled, true);
});

test('one live run, deadline-first expiry only at explicit entry, no background timer', () => {
  const m = setup();
  const token = m.beginRunAt(0);
  assert.ok(token);
  assert.equal(m.snapshot().run.deadline, 100);
  assert.equal(m.beginRunAt(0), null); // one live run
  assert.deepEqual(m.observeAt(50), { accepted: true, runState: 'live' });
  assert.deepEqual(m.observeAt(99), { accepted: true, runState: 'live' });
  assert.deepEqual(m.observeAt(100), { accepted: true, runState: 'expired' });
  assert.equal(m.stats.runsExpired, 1);
  // expiry without an entry point is invisible until the next explicit entry
  const token2 = m.beginRunAt(1000);
  assert.ok(token2);
  assert.notEqual(token2, token);
  assert.deepEqual(m.observeAt(1099), { accepted: true, runState: 'live' });
  assert.deepEqual(m.observeAt(1100), { accepted: true, runState: 'expired' });
});

test('non-monotonic clock fail-closes a permanent latch; only an explicit rebuild with greater now revives', () => {
  const m = setup();
  assert.ok(m.beginRunAt(100));
  assert.equal(m.snapshot().runState, 'live');
  assert.deepEqual(m.observeAt(90), { accepted: false, reason: 'clock-rewound' });
  assert.equal(m.latched, true);
  assert.equal(m.stats.rewindRefused, 1);
  // every entry refused while latched, even forward-looking nows
  assert.deepEqual(m.beginRunAt(200), null);
  assert.deepEqual(m.forkAt(200), { accepted: false, reason: 'clock-rewound' });
  assert.equal(m.snapshot().runState, 'live'); // stale snapshot, not a revive
  // rebuild with a rewound now is still refused; strictly greater clears
  assert.deepEqual(m.rebuildAt(90), { accepted: false, reason: 'clock-rewound' });
  assert.deepEqual(m.rebuildAt(101), { accepted: true });
  assert.equal(m.latched, false);
  assert.equal(m.snapshot().runState, 'no-run'); // old run not auto-revived
  assert.ok(m.beginRunAt(101));
});

test('suspend/resume invalidates the run; no auto-revive, explicit rebuild starts a new one', () => {
  const m = setup();
  assert.ok(m.beginRunAt(0));
  assert.equal(m.suspendAt(10, 'lock'), true);
  assert.equal(m.snapshot().runState, 'suspended');
  assert.equal(m.snapshot().suspend.kind, 'lock');
  assert.equal(m.latched, true);
  assert.equal(m.beginRunAt(20), null); // suspended gate blocks new runs
  assert.equal(m.resumeAt(10), false); // resume must be strictly after suspend
  assert.equal(m.resumeAt(30), true);
  assert.equal(m.snapshot().runState, 'resumed-dead');
  assert.deepEqual(m.rebuildAt(31), { accepted: true });
  assert.equal(m.snapshot().runState, 'no-run');
  assert.ok(m.beginRunAt(31));
  assert.equal(m.suspendAt(40, 'hibernate'), false); // kind whitelist
  const m2 = setup();
  assert.ok(m2.beginRunAt(0));
  assert.equal(m2.suspendAt(50, 'sleep'), true); // expiry by suspend even before TTL
  assert.equal(m2.snapshot().runState, 'suspended');
});

test('fork gate: default-off, one slot, refused while a run is live or fork in flight, never queued', () => {
  const m = setup();
  assert.ok(m.beginRunAt(0));
  assert.deepEqual(m.forkAt(1), { accepted: false, reason: 'run-live' });
  assert.deepEqual(m.observeAt(100), { accepted: true, runState: 'expired' });
  const f1 = m.forkAt(100);
  assert.equal(f1.accepted, true);
  assert.equal(m.snapshot().fork.deadline, 150);
  assert.deepEqual(m.forkAt(101), { accepted: false, reason: 'fork-in-flight' });
  assert.equal(m.stats.forkAttempts, 1);
});

test('watchdog escalation: term at deadline, kill only after grace, close only after kill', () => {
  const m = setup();
  const { jobId } = m.forkAt(0);
  assert.ok(jobId !== undefined);
  assert.deepEqual(m.watchdogAt(49), { accepted: true, fired: false });
  assert.equal(m.snapshot().forkState, 'in-flight');
  assert.deepEqual(m.watchdogAt(50), { accepted: true, fired: true, state: 'terminating' });
  assert.equal(m.snapshot().fork.termAt, 50);
  assert.equal(m.forceKillAt(50).reason, 'grace-not-elapsed');
  assert.equal(m.forceKillAt(59).reason, 'grace-not-elapsed');
  assert.equal(m.closedAt(59), false); // close-before-kill rejected
  assert.deepEqual(m.forceKillAt(60), { accepted: true, state: 'kill-requested' });
  assert.equal(m.snapshot().fork.killAt, 60);
  assert.equal(m.forceKillAt(61).reason, 'not-terminating');
  assert.equal(m.closedAt(61), true);
  assert.equal(m.snapshot().forkState, 'closed');
  assert.equal(m.closedAt(61), false); // one close per fork
  assert.notEqual(m.forkAt(61).accepted, false); // slot freed
});

test('watchdog before deadline does not fire; failed fork is terminal; rewind latches fork entries too', () => {
  const m = setup();
  m.forkAt(0);
  assert.equal(m.failForkAt(1), true);
  assert.equal(m.snapshot().forkState, 'failed');
  assert.equal(m.failForkAt(2), false);
  assert.equal(m.watchdogAt(2).accepted, false);
  assert.deepEqual(m.observeAt(1), { accepted: false, reason: 'clock-rewound' });
  const m2 = setup();
  m2.forkAt(0);
  assert.deepEqual(m2.watchdogAt(20), { accepted: true, fired: false });
});

test('source files stay offline: no real timers, listeners, processes or signals', () => {
  const source = readFileSync('test-helpers/dictation-timing-fork-constraint-model.mjs', 'utf8');
  for (const banned of [/child_process/, /setTimeout|setInterval/, /Date\.now/, /performance\.now/, /process\.kill/, /SIGTERM"\s*\)|SIGKILL/, /require\(/, /addGlobalMonitor|NSEvent/]) {
    assert.doesNotMatch(source, banned);
  }
});
