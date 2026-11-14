import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationCopyEffectModel } from '../test-helpers/dictation-copy-effect-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function setup(options = {}) {
  const model = new DictationCopyEffectModel({ enabled: true, epoch: 'effect', sourceTtl: 100, candidateTtl: 1000, ...options });
  const h = { model, now: 0, epoch: 'effect' };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.receive = (channel, version, value, kind = 'snapshot') => model.receiveAt(h.now, h.token, { epoch: h.epoch, channel, version, value, kind, observedAt: h.now });
  h.sync = version => { h.token = model.beginAt(h.now); assert.ok(h.token); assert.ok(h.receive('lock', version, false)); assert.ok(h.receive('settings', version, true)); };
  h.coordinator = () => model.snapshot().state.state.state.lifetime.state.coordinator;
  h.drain = () => { for (const ticket of h.coordinator().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`); h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`);
    assert.ok(h.call('inputReady', h.session, h.capture));
  };
  h.copying = (text = '合成完整正文') => {
    h.start(1); h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', 'writer'); h.receipt = h.call('final', h.asr, { text });
    h.attempt = h.call('begin', h.receipt, h.writer); assert.ok(h.call('result', h.attempt, h.writer, 'not-issued'));
    h.copy = h.call('requestCopy', model.candidate(), { userInitiated: true }); assert.ok(h.copy);
  };
  h.prepare = () => { h.check = model.prepareAt(h.now, h.session, h.copy); assert.ok(h.check); };
  h.checked = () => { assert.ok(model.checkedAt(h.now, h.check, { observedAt: h.now, allowed: true })); };
  h.handoff = () => { h.job = model.handoffAt(h.now, h.check); assert.ok(h.job); };
  h.status = () => model.sample()?.presentation.status;
  h.cleanup = () => { h.call('close', h.session); h.drain(); if (model.snapshot().busy) assert.ok(model.stoppedAt(h.now, h.job, { stopped: true })); };
  return h;
}

test('strict default-off and no public full-text/underlying-model bypass', () => {
  for (const enabled of [undefined, false, 'true']) {
    const m = new DictationCopyEffectModel({ epoch: 'off', enabled });
    assert.equal(m.advance(0), false); assert.equal(m.beginAt(0), null); assert.equal(m.dispatchAt(0, 'reserve', request(1)), null);
    assert.equal(m.prepareAt(0, {}, {}), null); assert.equal(m.checkedAt(0, {}, { observedAt: 0, allowed: true }), false);
    assert.equal(m.handoffAt(0, {}), null); assert.equal(m.reportAt(0, {}, 'written'), false);
    assert.equal(m.stoppedAt(0, {}, { stopped: true }), false); assert.equal(m.receiveAt(0, {}, {}), false); assert.equal(m.lostAt(0, {}), false);
    assert.equal(m.candidate(), null); assert.equal(m.sample(), null); assert.equal(m.commit({}), false);
    assert.equal(m.copyTextAt, undefined); assert.equal(m.model, undefined); assert.equal(m.snapshot().busy, false);
  }
});

test('prepare/check do not write, expose text or allocate business revision; handoff starts unknown', () => {
  const h = setup(); h.sync(1); h.copying(); const revision = h.model.snapshot().state.state.state.lifetime.state.revision;
  h.prepare(); assert.deepEqual(h.check, {}); assert.ok(Object.isFrozen(h.check)); h.checked();
  assert.equal(h.model.snapshot().outcome, 'unattempted'); assert.equal(h.model.snapshot().busy, false);
  h.handoff(); assert.ok(Object.isFrozen(h.job)); assert.equal(h.job.text, '合成完整正文');
  assert.equal(h.model.snapshot().outcome, 'unknown'); assert.equal(h.model.snapshot().busy, true);
  assert.equal(h.model.snapshot().state.state.state.lifetime.state.revision, revision); h.cleanup();
});

test('handoff is one-shot, original-instance only; guarded read is not executor completion', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare();
  assert.equal(h.model.handoffAt(0, h.check), null); assert.equal(h.model.checkedAt(0, { ...h.check }, { observedAt: 0, allowed: true }), false);
  h.checked(); assert.equal(h.model.handoffAt(0, { ...h.check }), null); h.handoff();
  assert.equal(h.model.handoffAt(0, h.check), null); assert.equal(h.call('copied', h.copy, { written: true }), null);
  assert.equal(h.model.reportAt(0, { ...h.job }, 'written'), false); assert.equal(h.model.snapshot().outcome, 'unknown'); h.cleanup();
});

test('guard evidence requires matching explicit observation time and strict allowed boolean', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare();
  for (const proof of [{ allowed: true }, { observedAt: 1, allowed: true }, { observedAt: 0, allowed: 'true' }, { observedAt: -1, allowed: true }]) assert.equal(h.model.checkedAt(0, h.check, proof), false);
  assert.equal(h.model.checkedAt(-1, h.check, { observedAt: -1, allowed: true }), false);
  h.checked(); assert.equal(h.model.checkedAt(0, h.check, { observedAt: 0, allowed: true }), false); h.handoff(); h.cleanup();
});

test('negative preflight is definitely not-issued and permits only a new explicit copy action', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare();
  assert.ok(h.model.checkedAt(0, h.check, { observedAt: 0, allowed: false }));
  assert.equal(h.model.snapshot().outcome, 'not-issued'); assert.equal(h.model.snapshot().applied, true); assert.equal(h.status(), 'copy-available');
  assert.equal(h.model.prepareAt(0, h.session, h.copy), null); assert.equal(h.model.handoffAt(0, h.check), null);
  const copy = h.call('requestCopy', h.model.candidate(), { userInitiated: true }); assert.ok(copy); assert.notEqual(copy, h.copy);
  assert.ok(h.model.prepareAt(0, h.session, copy)); h.cleanup();
});

test('a checked token cannot survive logical time advance; new check on old copy is not a retry', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked();
  assert.equal(h.model.handoffAt(1, h.check), null); assert.equal(h.model.snapshot().outcome, 'not-issued');
  assert.equal(h.model.prepareAt(1, h.session, h.copy), null); assert.equal(h.status(), 'copy-available'); h.now = 1; h.cleanup();
});

for (const event of ['lost', 'expired', 'cancel', 'disconnect', 'disable', 'lock', 'hide', 'dismiss']) {
  test(`${event} before handoff is not-issued; after handoff stays unknown and requires original executor stop`, () => {
    for (const handedOff of [false, true]) {
      const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); if (handedOff) h.handoff();
      if (event === 'lost') h.model.lostAt(0, h.token);
      if (event === 'expired') { h.now = 100; h.model.advance(100); }
      if (event === 'cancel') h.call('close', h.session, 'cancel');
      if (event === 'disconnect') h.call('disconnect', h.epoch);
      if (event === 'disable') h.receive('settings', 2, false);
      if (event === 'lock') h.receive('lock', 2, true);
      if (event === 'hide') h.call('hide', h.session);
      if (event === 'dismiss') h.call('dismiss');
      assert.equal(h.model.handoffAt(h.now, h.check), null);
      assert.equal(h.model.snapshot().outcome, handedOff ? 'unknown' : 'not-issued');
      assert.equal(h.model.snapshot().busy, handedOff);
      assert.equal(h.coordinator().pending.length, 2, 'neither check nor cancellation fakes ASR/writer stops'); h.cleanup();
    }
  });
}

test('permissive version-only update invalidates check despite unchanged business revision', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked();
  const revision = h.model.snapshot().state.state.state.lifetime.state.revision;
  assert.ok(h.receive('lock', 2, false, 'update'));
  assert.equal(h.model.snapshot().outcome, 'not-issued'); assert.equal(h.model.handoffAt(0, h.check), null);
  assert.equal(h.model.snapshot().state.state.state.lifetime.state.revision, revision + 1, 'abort itself completes original copy false'); h.cleanup();
});

test('rejected source envelope and wrong original scope leave healthy check usable', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked();
  assert.equal(h.model.prepareAt(0, { ...h.session }, h.copy), null);
  assert.equal(h.receive('lock', 1, false), false); assert.equal(h.model.lostAt(0, { ...h.token }), false);
  assert.equal(h.call('released', { ...h.asr }, { stopped: true }), false); h.handoff(); h.cleanup();
});

for (const outcome of ['written', 'not-written', 'unknown']) test(`executor ${outcome} does not imply stop or target acceptance`, () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff();
  assert.ok(h.model.reportAt(0, h.job, outcome)); assert.equal(h.model.snapshot().busy, true);
  assert.equal(h.model.snapshot().outcome, outcome); assert.equal(h.model.snapshot().applied, outcome !== 'unknown');
  assert.equal(h.status(), outcome === 'written' ? 'copied' : outcome === 'not-written' ? 'copy-available' : 'copying');
  assert.equal(h.model.reportAt(0, h.job, outcome), false);
  assert.equal(h.call('requestCopy', h.model.candidate(), { userInitiated: true }), null);
  assert.equal(h.model.stoppedAt(0, { ...h.job }, { stopped: true }), false);
  assert.equal(h.model.stoppedAt(0, h.job, { stopped: 'true' }), false);
  assert.ok(h.model.stoppedAt(0, h.job, { stopped: true })); assert.equal(h.model.stoppedAt(0, h.job, { stopped: true }), false);
  if (outcome === 'not-written') assert.ok(h.call('requestCopy', h.model.candidate(), { userInitiated: true }));
  if (outcome === 'unknown') assert.equal(h.call('requestCopy', h.model.candidate(), { userInitiated: true }), null);
  h.cleanup();
});

test('stop without report drains executor but cannot fabricate not-written or allow retry', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff();
  assert.ok(h.model.stoppedAt(0, h.job, { stopped: true })); assert.equal(h.model.snapshot().outcome, 'unknown');
  assert.equal(h.model.reportAt(0, h.job, 'not-written'), false); assert.equal(h.call('requestCopy', h.model.candidate(), { userInitiated: true }), null); h.cleanup();
});

for (const coalesceMeters of [false, true]) for (const outcome of ['written', 'not-written']) test(`120 reorder trajectories: coalescing=${coalesceMeters}, report=${outcome}`, () => {
  let count = 0;
  for (const order of permutations(['check', 'handoff', 'loss', 'report', 'stop'])) {
    const h = setup({ coalesceMeters }); h.sync(1); h.copying(); h.prepare(); h.now = 50;
    let invalid = false, checked = false, issued = false, reported = false, stopped = false, expected = 'unattempted';
    for (const event of order) {
      if (event === 'check') {
        const accepted = !invalid && !checked && !issued;
        assert.equal(h.model.checkedAt(50, h.check, { observedAt: 50, allowed: true }), accepted); if (accepted) checked = true;
      }
      if (event === 'handoff') {
        const accepted = checked && !invalid && !issued;
        const job = h.model.handoffAt(50, h.check); assert.equal(job !== null, accepted);
        if (accepted) { h.job = job; issued = true; expected = 'unknown'; }
      }
      if (event === 'loss') { assert.ok(h.model.lostAt(50, h.token)); invalid = true; if (!issued) expected = 'not-issued'; }
      if (event === 'report') {
        const accepted = issued && !reported && !stopped;
        assert.equal(h.model.reportAt(50, h.job, outcome), accepted); if (accepted) { reported = true; expected = outcome; }
      }
      if (event === 'stop') {
        const accepted = issued && !stopped;
        assert.equal(h.model.stoppedAt(50, h.job, { stopped: true }), accepted); if (accepted) stopped = true;
      }
      assert.equal(h.model.snapshot().outcome, expected); assert.equal(h.model.snapshot().busy, issued && !stopped);
      assert.equal(h.coordinator().pending.length, 2);
    }
    h.cleanup(); count++;
  }
  assert.equal(count, 120);
});

test('deferred old executor truth never applies to a new voice session; pending executor blocks concurrent copy', async () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff(); const old = h.job;
  let resolve; const pending = new Promise(r => { resolve = r; }).then(() => h.model.reportAt(h.now, old, 'written'));
  h.call('close', h.session); h.drain(); h.start(2); const frame = h.model.sample(); assert.ok(h.model.commit(frame));
  resolve(); assert.ok(await pending); assert.equal(h.model.snapshot().applied, false); assert.equal(h.status(), 'listening');
  assert.equal(h.model.snapshot().busy, true); assert.ok(h.model.stoppedAt(0, old, { stopped: true })); h.cleanup();
});

test('late result at inclusive source expiry is recorded, not applied as successful current copy', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff(); h.now = 100;
  assert.ok(h.model.reportAt(100, h.job, 'written')); assert.equal(h.model.snapshot().outcome, 'written');
  assert.equal(h.model.snapshot().applied, false); assert.equal(h.coordinator().closing, true); assert.equal(h.model.snapshot().busy, true); h.cleanup();
});

test('full Unicode business text is exposed only at handoff; retained job is not revocable', () => {
  const text = '文'.repeat(7999) + '👩‍💻' + '字'.repeat(7996); const h = setup(); h.sync(1); h.copying(text);
  assert.equal(h.model.sample().presentation.truncated, true); h.prepare(); h.checked(); h.handoff(); assert.equal(h.job.text, text);
  h.call('close', h.session); h.drain(); assert.equal(h.job.text, text); assert.equal(h.model.snapshot().outcome, 'unknown');
  assert.ok(h.model.stoppedAt(0, h.job, { stopped: true }));
});

test('copy guard is not a global lock/focus oracle: same logical now cannot prove OS atomicity', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked();
  // An unseen native lock/permission change is deliberately not reported. The
  // local model cannot infer it from elapsed time or the empty check token.
  h.handoff(); assert.equal(h.model.snapshot().outcome, 'unknown'); h.cleanup();
});

test('wrong report/backward time does not consume original report or fabricate executor stop', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff();
  assert.equal(h.model.reportAt(0, h.job, 'issued'), false); assert.equal(h.model.reportAt(-1, h.job, 'written'), false);
  assert.equal(h.model.stoppedAt(-1, h.job, { stopped: true }), false); assert.equal(h.model.snapshot().busy, true);
  assert.ok(h.model.reportAt(0, h.job, 'not-written')); h.cleanup();
});

test('candidate cutoff independently invalidates prepared check without executor ownership', () => {
  const h = setup({ candidateTtl: 50 }); h.sync(1); h.copying(); h.prepare(); h.checked(); h.now = 50;
  assert.equal(h.model.handoffAt(50, h.check), null); assert.equal(h.model.snapshot().outcome, 'not-issued');
  assert.equal(h.coordinator().closing, true); assert.equal(h.coordinator().pending.length, 2); h.cleanup();
});

test('wrong session/copy and foreign instance cannot prepare even without outstanding check', () => {
  const h = setup(); h.sync(1); h.copying(); const other = setup(); other.sync(1); other.copying();
  assert.equal(h.model.prepareAt(0, { ...h.session }, h.copy), null);
  assert.equal(h.model.prepareAt(0, h.session, { ...h.copy }), null);
  assert.equal(h.model.prepareAt(0, h.session, other.copy), null);
  h.prepare(); h.checked(); h.handoff(); h.cleanup(); other.cleanup();
});

test('voice resource release invalidates preflight but never marks executor stopped', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked();
  assert.ok(h.call('released', h.writer, { stopped: true })); assert.equal(h.model.snapshot().outcome, 'not-issued');
  assert.equal(h.model.handoffAt(0, h.check), null); assert.equal(h.coordinator().pending.length, 1); h.cleanup();
});

test('source recovery and voice drain cannot free outstanding executor; new copy waits original stop', () => {
  const h = setup(); h.sync(1); h.copying(); h.prepare(); h.checked(); h.handoff(); const old = h.job;
  assert.ok(h.model.lostAt(0, h.token)); h.drain(); h.sync(2); h.start(2);
  h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
  const writer = h.call('acquire', h.session, 'writer', 'writer-2');
  const receipt = h.call('final', h.asr, { text: '第二轮合成正文' }); const attempt = h.call('begin', receipt, writer);
  assert.ok(h.call('result', attempt, writer, 'not-issued')); const candidate = h.model.candidate(); assert.ok(candidate);
  assert.equal(h.call('requestCopy', candidate, { userInitiated: true }), null);
  assert.ok(h.model.reportAt(0, old, 'not-written')); assert.equal(h.model.snapshot().applied, false);
  assert.equal(h.call('requestCopy', candidate, { userInitiated: true }), null);
  assert.ok(h.model.stoppedAt(0, old, { stopped: true }));
  const copy = h.call('requestCopy', candidate, { userInitiated: true }); assert.ok(copy);
  const check = h.model.prepareAt(0, h.session, copy); assert.ok(check);
  assert.ok(h.model.checkedAt(0, check, { observedAt: 0, allowed: true }));
  h.job = h.model.handoffAt(0, check); assert.equal(h.job.text, '第二轮合成正文');
  assert.equal(h.model.reportAt(0, old, 'written'), false); h.cleanup();
});

test('saturated business revision aborts preflight; original cleanup remains available', () => {
  const baseline = setup(); baseline.sync(1); baseline.copying();
  const maxRevision = baseline.model.snapshot().state.state.state.lifetime.state.revision + 1; baseline.cleanup();
  const h = setup({ maxRevision }); h.sync(1); h.copying(); h.prepare(); h.checked();
  assert.ok(h.call('hide', h.session)); assert.equal(h.model.handoffAt(0, h.check), null);
  assert.equal(h.model.snapshot().outcome, 'not-issued'); assert.equal(h.model.snapshot().applied, false);
  assert.equal(h.model.sample(), null); h.cleanup();
});

test('copy effect proposal stays offline; evidence, plan and README preserve actual gaps', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-copy-effect-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-copy-effect.md');
  for (const pattern of [/SC-20261114-019/, /480 条/, /TOCTOU/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/, /not-written/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-source-lease.md']) assert.ok(read(path).includes('2026-11-14-dictation-copy-effect.md'));
});
