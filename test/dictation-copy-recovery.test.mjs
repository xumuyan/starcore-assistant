import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationCopyEffectModel } from '../test-helpers/dictation-copy-effect-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function harness(options = {}) {
  const model = new DictationCopyEffectModel({ enabled: true, epoch: 'recovery', sourceTtl: 100, candidateTtl: 1000, ...options });
  const h = { model, now: 0, epoch: 'recovery' };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.source = () => model.snapshot().state.state;
  h.transition = () => h.source().state.lifetime.state;
  h.coordinator = () => h.transition().coordinator;
  h.receive = (channel, version, value, token = h.token, epoch = h.epoch) => model.receiveAt(h.now, token, { epoch, channel, version, value, kind: 'snapshot', observedAt: h.now });
  h.query = () => { h.token = model.beginAt(h.now); assert.ok(h.token); };
  h.sync = version => { h.query(); assert.ok(h.receive('lock', version, false)); assert.ok(h.receive('settings', version, true)); };
  h.present = status => { const frame = model.sample(); assert.equal(frame.presentation.status, status); assert.ok(model.commit(frame)); return frame; };
  h.business = n => {
    const session = h.call('reserve', request(n)); assert.ok(session); h.present('hidden');
    const capture = h.call('acquire', session, 'capture', `capture-${n}`);
    const asr = h.call('acquire', session, 'asr', `asr-${n}`);
    assert.equal(h.call('inputReady', session, { ...capture }), false); h.present('hidden');
    assert.ok(h.call('inputReady', session, capture)); h.present('listening');
    assert.ok(h.call('deliver', capture, { type: 'meter', source: 'input', level: 0.5 }));
    assert.equal(h.call('process', session), false);
    assert.ok(h.call('released', capture, { stopped: true })); assert.ok(h.call('process', session)); h.present('thinking');
    const writer = h.call('acquire', session, 'writer', `writer-${n}`);
    const text = `第${n}轮合成正文`;
    const receipt = h.call('final', asr, { text }); assert.ok(receipt);
    const attempt = h.call('begin', receipt, writer); assert.ok(attempt);
    assert.ok(h.call('result', attempt, writer, 'not-issued')); h.present('copy-available');
    const candidate = model.candidate(); assert.ok(candidate);
    return { session, capture, asr, writer, receipt, attempt, candidate, text };
  };
  h.requestCopy = run => h.call('requestCopy', run.candidate, { userInitiated: true });
  h.handoff = (run, copy) => {
    const check = model.prepareAt(h.now, run.session, copy); assert.ok(check);
    assert.ok(model.checkedAt(h.now, check, { observedAt: h.now, allowed: true }));
    const job = model.handoffAt(h.now, check); assert.ok(job); assert.equal(job.text, run.text);
    return { check, job, copy };
  };
  h.initial = () => { h.sync(1); h.old = h.business(1); Object.assign(h.old, h.handoff(h.old, h.requestCopy(h.old))); h.oldToken = h.token; };
  h.drain = () => { for (const ticket of h.coordinator().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.cleanup = (run, job) => { assert.ok(h.call('close', run.session)); h.drain(); if (model.snapshot().busy) assert.ok(model.stoppedAt(h.now, job, { stopped: true })); };
  h.rejectOld = () => {
    const old = h.old;
    assert.equal(model.receiveAt(h.now, h.oldToken, { epoch: 'recovery', channel: 'lock', version: 99, value: true, kind: 'snapshot', observedAt: h.now }), false);
    assert.equal(model.lostAt(h.now, h.oldToken), false);
    assert.equal(h.call('released', old.asr, { stopped: true }), false);
    assert.equal(h.call('final', old.asr, { text: '迟到合成结果' }), null);
    assert.equal(h.call('begin', old.receipt, old.writer), null);
    assert.equal(h.call('result', old.attempt, old.writer, 'not-issued'), false);
    assert.equal(h.call('requestCopy', old.candidate, { userInitiated: true }), null);
    assert.equal(model.prepareAt(h.now, old.session, old.copy), null);
    assert.equal(model.handoffAt(h.now, old.check), null);
  };
  return h;
}

for (const coalesceMeters of [false, true]) for (const result of ['written', 'not-written', 'unknown']) {
  test(`720 source/voice/executor recovery trajectories: meters=${coalesceMeters}, result=${result}`, () => {
    let count = 0;
    for (const order of permutations(['lock', 'settings', 'asr', 'writer', 'report', 'stop'])) {
      const h = harness({ coalesceMeters }); h.initial(); assert.ok(h.model.lostAt(0, h.token)); h.query();
      const seen = new Set(); let next = null, copy = null;
      for (const event of order) {
        if (event === 'lock' || event === 'settings') assert.ok(h.receive(event, 2, event === 'settings'));
        if (event === 'asr' || event === 'writer') assert.ok(h.call('released', h.old[event], { stopped: true }));
        if (event === 'report') assert.equal(h.model.reportAt(0, h.old.job, result), !seen.has('stop'));
        if (event === 'stop') assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true }));
        seen.add(event);
        const fresh = seen.has('lock') && seen.has('settings');
        const drained = seen.has('asr') && seen.has('writer');
        const stopped = seen.has('stop');
        const reportWon = seen.has('report') && (!stopped || order.indexOf('report') < order.indexOf('stop'));
        assert.equal(h.source().phase, fresh ? 'ready' : 'syncing');
        assert.equal(h.model.snapshot().busy, !stopped);
        assert.equal(h.model.snapshot().outcome, reportWon ? result : 'unknown');
        assert.equal(h.model.snapshot().applied, false, 'loss revoked old copy before every report');
        const oldPending = h.coordinator().pending.filter(ticket => ticket === h.old.asr || ticket === h.old.writer);
        assert.deepEqual(oldPending, [h.old.asr, h.old.writer].filter(ticket => !seen.has(ticket.resource)));
        if (!next && fresh && drained) next = h.business(2); // Voice readiness never borrows executor stop.
        else if (!next) {
          assert.equal(h.call('reserve', request(2)), null); h.present('hidden');
          assert.equal(h.coordinator().session, drained ? null : h.old.session);
        }
        if (next && !copy) {
          assert.equal(h.call('requestCopy', next.candidate, { userInitiated: false }), null);
          const actual = h.requestCopy(next); assert.equal(actual !== null, stopped);
          if (actual) copy = actual;
        }
        if (next) {
          assert.equal(h.coordinator().session, next.session); h.present(copy ? 'copying' : 'copy-available');
          assert.deepEqual(h.coordinator().pending, [next.asr, next.writer]);
        }
      }
      assert.ok(next); assert.ok(copy); h.rejectOld();
      const current = h.handoff(next, copy);
      assert.equal(h.model.reportAt(0, h.old.job, 'written'), false);
      assert.equal(h.model.stoppedAt(0, h.old.job, { stopped: true }), false);
      assert.equal(h.model.snapshot().outcome, 'unknown'); assert.equal(h.model.snapshot().busy, true);
      assert.ok(h.model.reportAt(0, current.job, 'written')); assert.equal(h.model.snapshot().applied, true); h.present('copied');
      assert.ok(h.model.stoppedAt(0, current.job, { stopped: true })); h.cleanup(next, current.job); count++;
    }
    assert.equal(count, 720);
  });
}

for (const coalesceMeters of [false, true]) for (const result of ['written', 'not-written', 'unknown']) {
  test(`48 disconnected epoch-rebuild paths: meters=${coalesceMeters}, result=${result}`, () => {
    let count = 0;
    for (const order of permutations(['lock', 'settings', 'asr', 'writer'])) for (const stopBeforeRestart of [false, true]) {
      const h = harness({ coalesceMeters }); h.initial(); assert.ok(h.model.lostAt(0, h.token));
      assert.ok(h.call('disconnect', h.epoch)); h.query();
      if (stopBeforeRestart) { assert.ok(h.model.reportAt(0, h.old.job, result)); assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true })); }
      const seen = new Set();
      for (const event of order) {
        if (event === 'lock' || event === 'settings') assert.ok(h.receive(event, 2, event === 'settings'));
        else assert.ok(h.call('released', h.old[event], { stopped: true }));
        seen.add(event); assert.equal(h.call('reserve', request(2)), null, 'fresh/drained never reconnects voice');
        assert.equal(h.coordinator().connected, false);
        assert.equal(h.source().phase, seen.has('lock') && seen.has('settings') ? 'ready' : 'syncing');
        assert.deepEqual(h.coordinator().pending, [h.old.asr, h.old.writer].filter(ticket => !seen.has(ticket.resource)));
        assert.equal(h.model.snapshot().busy, !stopBeforeRestart);
        assert.equal(h.model.snapshot().outcome, stopBeforeRestart ? result : 'unknown');
        h.present('hidden');
        if (seen.size < 4) assert.equal(Boolean(h.call('restart', 'rebuilt')), false);
      }
      assert.ok(h.call('restart', 'rebuilt')); h.epoch = 'rebuilt';
      assert.equal(h.source().phase, 'offline'); assert.equal(h.model.snapshot().busy, !stopBeforeRestart);
      assert.equal(h.call('reserve', request(2)), null); h.present('hidden');
      const previous = h.token; h.query();
      assert.equal(h.receive('lock', 3, false, previous, 'recovery'), false);
      assert.equal(h.receive('lock', 2, false), false, 'epoch change cannot reset source high-water');
      assert.ok(h.receive('lock', 3, false)); assert.equal(h.call('reserve', request(2)), null);
      assert.ok(h.receive('settings', 3, true)); const next = h.business(2);
      if (!stopBeforeRestart) {
        assert.equal(h.requestCopy(next), null);
        assert.ok(h.model.reportAt(0, h.old.job, result)); assert.equal(h.model.snapshot().applied, false);
        assert.equal(h.requestCopy(next), null); assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true }));
      }
      h.rejectOld(); const copy = h.requestCopy(next); assert.ok(copy); const current = h.handoff(next, copy);
      assert.ok(h.model.reportAt(0, current.job, 'not-written')); assert.ok(h.model.stoppedAt(0, current.job, { stopped: true }));
      const retry = h.requestCopy(next); assert.ok(retry); assert.notEqual(retry, copy);
      const retried = h.handoff(next, retry); assert.ok(h.model.reportAt(0, retried.job, 'written'));
      assert.ok(h.model.stoppedAt(0, retried.job, { stopped: true })); h.cleanup(next, retried.job); count++;
    }
    assert.equal(count, 48);
  });
}

test('missing executor stop blocks 50 explicit copies despite source recovery and new input readiness', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain(); h.sync(2); const next = h.business(2);
  assert.ok(h.model.reportAt(0, h.old.job, 'not-written'));
  for (let i = 0; i < 50; i++) {
    assert.equal(h.requestCopy(next), null); assert.equal(h.model.stoppedAt(0, { ...h.old.job }, { stopped: true }), false);
    assert.equal(h.model.stoppedAt(0, h.old.job, { stopped: 'true' }), false); assert.equal(h.model.snapshot().busy, true);
  }
  h.cleanup(next, h.old.job);
});

test('executor stop plus fresh source cannot fake missing original ASR stop or voice reconnection', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.call('disconnect', h.epoch);
  h.call('released', h.old.writer, { stopped: true }); h.sync(2); assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true }));
  for (let i = 0; i < 50; i++) {
    assert.equal(h.call('reserve', request(2)), null); assert.equal(h.call('restart', 'rebuilt'), false);
    assert.equal(h.call('released', { ...h.old.asr }, { stopped: true }), false); assert.deepEqual(h.coordinator().pending, [h.old.asr]);
  }
  assert.equal(h.model.snapshot().outcome, 'unknown'); h.cleanup(h.old, h.old.job);
});

test('ready restrictive source and fully drained executors do not grant permission or reset freshness', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain(); h.model.stoppedAt(0, h.old.job, { stopped: true }); h.query();
  assert.ok(h.receive('lock', 2, true)); assert.ok(h.receive('settings', 2, false)); assert.equal(h.source().phase, 'ready');
  assert.equal(h.call('reserve', request(2)), null); assert.ok(h.receive('lock', 3, false)); assert.equal(h.call('reserve', request(2)), null);
  assert.ok(h.receive('settings', 3, true)); const next = h.business(2); const copy = h.requestCopy(next); assert.ok(copy);
  const current = h.handoff(next, copy); h.cleanup(next, current.job);
});

test('new-source inclusive expiry after executor drain cannot reuse old query or new checked token', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain(); h.model.stoppedAt(0, h.old.job, { stopped: true }); h.sync(2);
  const next = h.business(2); const copy = h.requestCopy(next); const check = h.model.prepareAt(0, next.session, copy);
  assert.ok(h.model.checkedAt(0, check, { observedAt: 0, allowed: true })); h.now = 100;
  assert.equal(h.model.handoffAt(100, check), null); assert.equal(h.model.snapshot().outcome, 'not-issued');
  assert.equal(h.model.snapshot().busy, false); assert.equal(h.source().phase, 'offline'); assert.equal(h.coordinator().pending.length, 2);
  assert.equal(h.receive('lock', 3, false), false); h.cleanup(next, null);
});

test('deferred old callbacks cannot settle or complete the new in-flight executor', async () => {
  const h = harness(); h.initial(); const old = h.old; let resolve;
  const deferred = new Promise(r => { resolve = r; }).then(() => {
    assert.equal(h.model.reportAt(h.now, old.job, 'written'), false);
    assert.equal(h.model.stoppedAt(h.now, old.job, { stopped: true }), false);
  });
  h.model.lostAt(0, h.token); h.drain(); h.model.stoppedAt(0, old.job, { stopped: true }); h.sync(2);
  const next = h.business(2); const current = h.handoff(next, h.requestCopy(next)); const frame = h.present('copying');
  resolve(); await deferred;
  assert.equal(h.model.snapshot().busy, true); assert.equal(h.model.snapshot().outcome, 'unknown');
  assert.equal(h.transition().presentation, frame.presentation); assert.equal(h.model.reportAt(0, current.job, 'written'), true);
  h.present('copied'); h.cleanup(next, current.job);
});

test('business revision exhaustion permits original stops, not a new run or escape through epoch rebuild', () => {
  const baseline = harness(); baseline.initial(); const maxRevision = baseline.transition().revision + 1; baseline.cleanup(baseline.old, baseline.old.job);
  const h = harness({ maxRevision }); h.initial(); assert.ok(h.model.lostAt(0, h.token)); assert.equal(h.transition().exhausted, true);
  h.drain(); h.sync(2); assert.ok(h.model.reportAt(0, h.old.job, 'written')); assert.equal(h.model.snapshot().applied, false);
  assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true }));
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.call('restart', 'rebuilt'), null); assert.equal(h.model.sample(), null);
});

test('executor result/stop cannot renew source budget or trigger an automatic new copy', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain(); h.sync(2); const next = h.business(2);
  h.now = 99; assert.ok(h.model.reportAt(99, h.old.job, 'unknown')); assert.ok(h.model.stoppedAt(99, h.old.job, { stopped: true }));
  assert.deepEqual(h.model.snapshot().state.deadlines, { lock: 100, settings: 100 }); h.present('copy-available');
  assert.equal(h.model.snapshot().busy, false); h.now = 100; assert.equal(h.requestCopy(next), null); assert.equal(h.source().phase, 'offline');
  h.cleanup(next, null);
});

test('both resource classes stopped cannot replace missing second source snapshot', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain();
  assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true })); h.query(); assert.ok(h.receive('lock', 2, false));
  for (let i = 0; i < 50; i++) {
    assert.equal(h.call('reserve', request(2)), null); assert.equal(h.model.snapshot().busy, false);
    assert.equal(h.source().phase, 'syncing'); assert.equal(h.coordinator().session, null);
  }
  assert.ok(h.receive('settings', 2, true)); const next = h.business(2); h.cleanup(next, null);
});

test('old local written record can coexist with new listening; it is not current-session success', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain(); h.sync(2);
  assert.ok(h.model.reportAt(0, h.old.job, 'written')); assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true }));
  const session = h.call('reserve', request(2)); const capture = h.call('acquire', session, 'capture', 'new-capture');
  assert.ok(h.call('inputReady', session, capture)); h.present('listening');
  assert.equal(h.model.snapshot().outcome, 'written'); assert.equal(h.model.snapshot().applied, false);
  assert.notEqual(h.coordinator().session, h.old.session); assert.equal(h.model.snapshot().busy, false);
  h.cleanup({ session }, null);
});

test('partial recovery lost again discards freshness; stopped executors cannot restore old query', () => {
  const h = harness(); h.initial(); h.model.lostAt(0, h.token); h.drain();
  assert.ok(h.model.stoppedAt(0, h.old.job, { stopped: true })); h.query(); const partial = h.token;
  assert.ok(h.receive('lock', 2, false)); assert.ok(h.model.lostAt(0, partial)); h.query();
  assert.equal(h.receive('settings', 2, true, partial), false); assert.equal(h.receive('lock', 2, false), false);
  assert.ok(h.receive('settings', 2, true)); assert.equal(h.call('reserve', request(2)), null);
  assert.ok(h.receive('lock', 3, false)); const next = h.business(2); h.cleanup(next, null);
});

test('recovery evidence remains simulation-only and linked without production hookup', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-dictation-copy-recovery.md');
  for (const pattern of [/SC-20261114-020/, /4320/, /288/, /TOCTOU/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-copy-effect.md']) assert.ok(read(path).includes('2026-11-14-dictation-copy-recovery.md'));
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|js|jsx|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-copy-effect-model|dictation-copy-recovery/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
});
