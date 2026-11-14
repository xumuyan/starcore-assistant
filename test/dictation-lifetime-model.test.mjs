import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationLifetimeModel } from '../test-helpers/dictation-lifetime-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(options = {}) {
  const model = new DictationLifetimeModel({ enabled: true, epoch: 'lifetime', candidateTtl: 100, ...options });
  const h = { model, call: (command, ...args) => model.dispatch(command, ...args) };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`);
    h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`);
    assert.equal(h.call('inputReady', h.session, h.capture), true);
  };
  h.prepare = () => {
    h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', `writer-${h.session.run}`);
    h.receipt = h.call('final', h.asr, { text: ' 完整合成正文e\u0301\n' + '字'.repeat(8100) });
    h.attempt = h.call('begin', h.receipt, h.writer); assert.ok(h.attempt);
  };
  h.candidate = () => {
    assert.equal(h.call('result', h.attempt, h.writer, 'not-issued'), true);
    h.token = model.candidate(); assert.ok(h.token);
  };
  h.show = status => {
    const frame = model.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status);
    assert.ok(model.commit(frame)); return frame;
  };
  h.drain = () => {
    for (const ticket of model.snapshot().state.coordinator.pending) assert.equal(h.call('released', ticket, { stopped: true }), true);
    assert.equal(model.snapshot().state.coordinator.session, null);
  };
  return h;
}
const hidden = h => { assert.equal(h.model.snapshot().state.presentation.status, 'hidden'); assert.equal(h.model.candidate(), null); };

test('default off, strict enable, TTL validation and dictation-only reservation', () => {
  for (const enabled of [undefined, false, 'true']) {
    const model = new DictationLifetimeModel({ epoch: 'off', enabled });
    assert.equal(model.advance(10), false); assert.equal(model.event('lock', 'off'), false);
    assert.equal(model.dispatch('reserve', request(1)), null); assert.equal(model.sample(), null);
    assert.equal(model.commit({}), false); assert.equal(model.candidate(), null);
  }
  for (const candidateTtl of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup({ candidateTtl }), /invalid lifetime options/);
  const h = setup(); assert.equal(h.call('reserve', { origin: 'wake', mode: 'conversation', requestId: 'wake' }), null);
});

test('absolute deadline starts at definite not-issued, expires inclusively, never releases resources', () => {
  const h = setup(); h.model.advance(1000); h.start(1); h.prepare();
  assert.equal(h.model.snapshot().deadline, null); h.model.advance(2000); h.candidate();
  assert.equal(h.model.snapshot().deadline, 2100); h.show('copy-available');
  h.model.advance(2099); assert.equal(h.model.candidate(), h.token); const pending = h.model.sample();
  h.model.advance(2100); hidden(h); assert.equal(h.model.commit(pending), false);
  assert.equal(h.model.snapshot().reason, 'expired'); assert.equal(h.model.snapshot().state.coordinator.closing, true);
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.call('requestCopy', h.token, { userInitiated: true }), null);
  assert.equal(h.call('result', h.attempt, h.writer, 'issued'), false); h.drain();
  h.start(2); assert.equal(h.model.snapshot().reason, null); assert.equal(h.model.snapshot().deadline, null); h.show('listening');
  h.call('close', h.session); h.drain();
});

test('reads, samples, copy requests and failed-copy retries cannot renew absolute deadline', () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate();
  h.model.advance(80); const copy = h.call('requestCopy', h.token, { userInitiated: true });
  assert.ok(h.model.copyText(copy).length > 8000); h.show('copying'); h.call('copied', copy, { written: false });
  assert.equal(h.model.snapshot().deadline, 100); h.model.advance(99);
  const retry = h.call('requestCopy', h.token, { userInitiated: true }); h.model.copyText(retry); h.model.candidate(); h.show('copying');
  h.model.advance(100); assert.equal(h.model.copyText(retry), null);
  assert.equal(h.call('copied', retry, { written: true }), false); hidden(h); h.drain();
});

test('expiration after both owner stops still closes active session, but no stop is inferred', () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate();
  h.call('released', h.asr, { stopped: true }); h.call('released', h.writer, { stopped: true });
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.model.candidate(), h.token);
  h.model.advance(100); assert.equal(h.model.snapshot().state.coordinator.session, null); hidden(h);
  h.start(2); h.call('close', h.session); h.drain();
});

for (const disposition of ['issued', 'unknown']) test(`${disposition} never creates a deadline or fallback candidate`, () => {
  const h = setup(); h.start(1); h.prepare(); h.call('result', h.attempt, h.writer, disposition);
  assert.equal(h.model.snapshot().deadline, null); h.model.advance(1000);
  assert.equal(h.model.snapshot().state.coordinator.closing, false);
  h.show(disposition === 'issued' ? 'paste-issued' : 'paste-uncertain'); assert.equal(h.model.candidate(), null);
  h.call('close', h.session); h.drain();
});

for (const ending of ['copied', 'dismiss', 'close', 'disconnect']) test(`${ending} disarms deadline without pretending target acceptance or extra stop`, () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate();
  if (ending === 'copied') { const copy = h.call('requestCopy', h.token, { userInitiated: true }); h.call('copied', copy, { written: true }); }
  else if (ending === 'disconnect') h.call('disconnect', 'lifetime');
  else h.call(ending, ...(ending === 'close' ? [h.session] : []));
  assert.equal(h.model.snapshot().deadline, null); h.model.advance(1000);
  assert.equal(h.model.snapshot().reason, null); assert.equal(h.model.snapshot().state.coordinator.pending.length, 2);
  if (ending === 'copied') h.show('copied'); else h.show('hidden');
  h.call('close', h.session); h.drain();
});

test('presentation-only hide does not disarm expiration or stop original business work', () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate(); h.call('hide', h.session); h.show('hidden');
  assert.equal(h.model.snapshot().deadline, 100); assert.equal(h.model.candidate(), h.token);
  h.model.advance(100); assert.equal(h.model.snapshot().reason, 'expired'); hidden(h); h.drain();
});

for (const event of ['lock', 'disable', 'entry-replaced']) test(`${event} invalidates at five stages (15 total points), preserves leases`, () => {
  for (const stage of ['listening', 'preparing', 'candidate', 'copying', 'copied']) {
    const h = setup(); h.start(1);
    if (stage !== 'listening') h.prepare();
    if (['candidate', 'copying', 'copied'].includes(stage)) h.candidate();
    let copy;
    if (['copying', 'copied'].includes(stage)) copy = h.call('requestCopy', h.token, { userInitiated: true });
    if (stage === 'copied') h.call('copied', copy, { written: true });
    const pending = h.model.sample(); const count = h.model.snapshot().state.coordinator.pending.length;
    assert.equal(h.model.event(event, 'lifetime', h.session), true); hidden(h);
    assert.equal(h.model.snapshot().state.coordinator.pending.length, count); assert.equal(h.model.commit(pending), false);
    assert.equal(h.model.copyText(copy), null); assert.ok(!h.call('copied', copy, { written: true }));
    assert.equal(h.call('reserve', request(2)), null); h.drain();
    if (event === 'lock') { assert.equal(h.call('reserve', request(2)), null); h.model.event('unlock', 'lifetime'); }
    if (event === 'disable') { assert.equal(h.call('reserve', request(2)), null); h.model.event('enable', 'lifetime'); }
    h.start(2); h.show('listening'); h.call('close', h.session); h.drain();
  }
});

test('unlock/enable never resurrect old candidates, and independent persistent gates both require reset', () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate(); h.model.event('lock', 'lifetime'); h.model.event('disable', 'lifetime');
  h.model.event('unlock', 'lifetime'); assert.equal(h.call('reserve', request(2)), null); h.drain();
  assert.equal(h.call('reserve', request(2)), null); h.model.event('enable', 'lifetime');
  assert.equal(h.model.candidate(), null); h.start(2); assert.equal(h.call('requestCopy', h.token, { userInitiated: true }), null);
  h.call('close', h.session); h.drain();
});

test('wrong epoch, copied/old session and unknown events do not invalidate current presentation', () => {
  const h = setup(); h.start(1); const oldSession = h.session; h.call('close', h.session); h.drain(); h.start(2);
  const frame = h.model.sample(); const revision = h.model.snapshot().state.revision;
  assert.equal(h.model.event('lock', 'wrong'), false);
  assert.equal(h.model.event('entry-replaced', 'lifetime', { ...h.session }), false);
  assert.equal(h.model.event('entry-replaced', 'lifetime', oldSession), false);
  assert.equal(h.model.event('unknown', 'lifetime'), false);
  assert.equal(h.model.snapshot().state.revision, revision); assert.ok(h.model.commit(frame)); h.call('close', h.session); h.drain();
});

test('invalid/backward time rejected; equal tick allowed; time itself does not allocate display revision', () => {
  const h = setup(); h.model.advance(50); h.start(1); const frame = h.model.sample();
  for (const now of [49, -1, NaN, Infinity, 51.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(h.model.advance(now), false);
  assert.equal(h.model.advance(50), true); assert.ok(h.model.commit(frame));
  assert.equal(h.model.snapshot().now, 50); h.call('close', h.session); h.drain();
});

test('deadline arithmetic overflow fails closed instead of rounding or granting an unbounded candidate', () => {
  const h = setup(); h.model.advance(Number.MAX_SAFE_INTEGER - 50); h.start(1); h.prepare();
  assert.equal(h.call('result', h.attempt, h.writer, 'not-issued'), true, 'original outcome accepted before policy invalidation');
  hidden(h); assert.equal(h.model.snapshot().reason, 'clock-exhausted');
  assert.equal(h.model.snapshot().deadline, null); h.drain();
});

test('lock during revision exhaustion still closes/drains, and unlock cannot bypass exhausted version', () => {
  const h = setup({ maxRevision: 10 }); h.start(1); h.prepare(); h.candidate();
  assert.equal(h.model.snapshot().state.exhausted, true); assert.equal(h.model.sample(), null);
  assert.ok(h.model.event('lock', 'lifetime')); hidden(h); h.drain(); h.model.event('unlock', 'lifetime');
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.model.snapshot().state.revision, 10);
});

test('new epoch reuses IDs without resetting logical time, old event/copy cannot affect fresh run', () => {
  const h = setup(); h.model.advance(200); h.start(1); h.prepare(); h.candidate();
  const copy = h.call('requestCopy', h.token, { userInitiated: true }); h.call('disconnect', 'lifetime'); h.drain();
  assert.ok(h.call('restart', 'fresh')); h.start(1); h.show('listening');
  assert.equal(h.model.snapshot().now, 200); assert.equal(h.model.snapshot().deadline, null);
  assert.equal(h.model.event('lock', 'lifetime'), false); assert.equal(h.call('copied', copy, { written: true }), false);
  h.call('close', h.session); h.drain();
});

test('deferred copy completion after expiration cannot mark the next run copied', async () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate(); const copy = h.call('requestCopy', h.token, { userInitiated: true });
  let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => h.call('copied', copy, { written: true }));
  h.model.advance(100); h.drain(); h.start(2); h.show('listening'); finish(); assert.equal(await pending, false);
  assert.equal(h.model.snapshot().state.presentation.status, 'listening'); h.call('close', h.session); h.drain();
});

test('lock/disable with no run persist through drain and epoch restart does not bypass policy', () => {
  const h = setup(); assert.ok(h.model.event('lock', 'lifetime')); assert.ok(h.model.event('disable', 'lifetime'));
  assert.equal(h.call('reserve', request(1)), null); assert.equal(h.call('restart', 'new'), null);
  h.model.event('enable', 'lifetime'); assert.equal(h.call('reserve', request(1)), null);
  h.model.event('unlock', 'lifetime'); h.start(1); h.call('disconnect', 'lifetime'); h.drain();
  h.model.event('disable', 'lifetime'); assert.equal(h.call('restart', 'new'), null);
  h.model.event('enable', 'lifetime'); assert.ok(h.call('restart', 'new'));
  h.start(1); h.call('close', h.session); h.drain();
});

test('rejected duplicate/forged results and copy actions preserve deadline and current frame', () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate(); h.model.advance(90);
  const frame = h.model.sample(); const before = h.model.snapshot();
  assert.equal(h.call('result', h.attempt, h.writer, 'not-issued'), false);
  assert.equal(h.call('result', { ...h.attempt }, h.writer, 'not-issued'), false);
  assert.equal(h.call('requestCopy', { ...h.token }, { userInitiated: true }), null);
  assert.equal(h.call('requestCopy', h.token, { userInitiated: 'true' }), null);
  const after = h.model.snapshot(); assert.equal(after.deadline, before.deadline);
  assert.equal(after.state.revision, before.state.revision); assert.ok(h.model.commit(frame));
  assert.ok(Object.isFrozen(after)); assert.ok(Object.isFrozen(after.state));
  h.model.advance(100); h.drain();
});

test('no explicit logical tick means no passage of time or automatic expiration', async () => {
  const h = setup(); h.start(1); h.prepare(); h.candidate();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.model.snapshot().now, 0); assert.equal(h.model.snapshot().deadline, 100);
  assert.equal(h.model.candidate(), h.token); h.show('copy-available');
  h.call('close', h.session); h.drain();
});

test('expiry policy is test-only and evidence states explicit clock/event and real acceptance limits', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-lifetime-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-lifetime.md');
  for (const pattern of [/SC-20261114-015/, /逻辑时钟/, /不是自动定时器/, /不操作剪贴板/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-transition-lifecycle.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-lifetime.md'));
  }
});
