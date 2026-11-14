import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationSourceSyncModel } from '../test-helpers/dictation-source-sync-model.mjs';
import { DictationEventOrderModel } from '../test-helpers/dictation-event-order-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function setup(options = {}) {
  const model = new DictationSourceSyncModel({ enabled: true, epoch: 'sync', candidateTtl: 100, ...options });
  const h = { model, now: 0, epoch: 'sync' };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.begin = () => { h.token = model.beginAt(h.now); assert.ok(h.token); };
  h.receive = (channel, version, value, kind = 'snapshot', token = h.token) => model.receiveAt(h.now, token, { epoch: h.epoch, channel, version, value, kind });
  h.sync = version => { h.begin(); assert.ok(h.receive('lock', version, false)); assert.ok(h.receive('settings', version, true)); };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`);
    h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`);
    assert.ok(h.call('inputReady', h.session, h.capture));
  };
  h.prepare = () => {
    h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', 'writer');
    h.receipt = h.call('final', h.asr, { text: '合成完整正文' }); h.attempt = h.call('begin', h.receipt, h.writer);
    assert.ok(h.attempt);
  };
  h.candidate = () => { assert.ok(h.call('result', h.attempt, h.writer, 'not-issued')); h.candidateToken = model.candidate(); };
  h.copying = () => { h.candidate(); h.copy = h.call('requestCopy', h.candidateToken, { userInitiated: true }); assert.ok(h.copy); };
  h.drain = () => { for (const ticket of model.snapshot().state.lifetime.state.coordinator.pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.show = status => { const frame = model.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status); assert.ok(model.commit(frame)); return frame; };
  return h;
}

test('strict default-off and frozen local query token, no mutable underlying source', () => {
  for (const enabled of [undefined, false, 'true']) {
    const model = new DictationSourceSyncModel({ epoch: 'off', enabled });
    assert.equal(model.beginAt(0), null); assert.equal(model.lostAt(0, {}), false);
    assert.equal(model.dispatchAt(0, 'reserve', request(1)), null); assert.equal(model.sample(), null);
    assert.equal(model.receiveAt(0, {}, {}), false); assert.equal(model.copyTextAt(0, {}), null);
    assert.equal(model.commit({}), false); assert.equal(model.advance(0), false); assert.equal(model.candidate(), null);
  }
  const h = setup(); h.begin(); assert.ok(Object.isFrozen(h.token)); assert.deepEqual(Object.keys(h.model), []);
  assert.ok(Object.isFrozen(h.model.snapshot().fresh));
});

test('original event-order counterexample: unreported source loss leaves last allowed state usable', () => {
  const model = new DictationEventOrderModel({ enabled: true, epoch: 'old' });
  for (const [channel, value] of [['lock', false], ['settings', true]]) assert.ok(model.receiveAt(0, { epoch: 'old', channel, version: 1, value }));
  assert.ok(model.dispatchAt(0, 'reserve', request(1)), 'no source-loss API/detector in original model');
  model.dispatchAt(0, 'close', model.snapshot().lifetime.state.coordinator.session);
});

test('offline and one fresh snapshot cannot open work; updates alone are not query snapshots', () => {
  const h = setup(); assert.equal(h.call('reserve', request(1)), null); h.begin();
  assert.ok(h.receive('lock', 1, false, 'update')); assert.ok(h.receive('settings', 1, true, 'update'));
  assert.equal(h.model.snapshot().phase, 'syncing'); assert.equal(h.call('reserve', request(1)), null);
  assert.ok(h.receive('lock', 2, false)); assert.equal(h.call('reserve', request(1)), null);
  assert.ok(h.receive('settings', 2, true)); assert.equal(h.model.snapshot().phase, 'ready');
  h.start(1); h.call('close', h.session); h.drain();
});

for (const stage of ['reserved', 'listening', 'preparing', 'candidate', 'copying', 'copied']) test(`source loss at ${stage} closes but keeps original leases`, () => {
  const h = setup(); h.sync(1);
  if (stage === 'reserved') h.session = h.call('reserve', request(1)); else h.start(1);
  if (['preparing', 'candidate', 'copying', 'copied'].includes(stage)) h.prepare();
  if (stage === 'candidate') h.candidate();
  if (['copying', 'copied'].includes(stage)) h.copying();
  if (stage === 'copied') h.call('copied', h.copy, { written: true });
  const frame = h.model.sample(); const pending = h.model.snapshot().state.lifetime.state.coordinator.pending;
  const oldToken = h.token; assert.ok(h.model.lostAt(0, oldToken));
  assert.equal(h.model.snapshot().phase, 'offline'); assert.equal(h.model.commit(frame), false); h.show('hidden');
  assert.deepEqual(h.model.snapshot().state.lifetime.state.coordinator.pending, pending);
  assert.equal(h.model.copyTextAt(0, h.copy), null); assert.equal(h.model.lostAt(0, oldToken), false);
  assert.equal(h.call('reserve', request(2)), null); h.drain(); assert.equal(h.call('reserve', request(2)), null);
  h.sync(2); assert.equal(h.call('copied', h.copy, { written: true }), false);
  h.start(2); h.show('listening'); h.call('close', h.session); h.drain();
});

for (const coalesceMeters of [false, true]) test(`snapshot and original stop permutations, coalesced=${coalesceMeters}: 24 trajectories`, () => {
  let count = 0;
  for (const order of permutations(['lock', 'settings', 'asr', 'writer'])) {
    const h = setup({ coalesceMeters }); h.sync(1); h.start(1); h.prepare(); h.copying();
    assert.ok(h.model.lostAt(0, h.token)); h.begin();
    let lock = false; let settings = false; let asr = false; let writer = false;
    for (const event of order) {
      if (event === 'lock') { assert.ok(h.receive('lock', 2, false)); lock = true; }
      else if (event === 'settings') { assert.ok(h.receive('settings', 2, true)); settings = true; }
      else { assert.ok(h.call('released', h[event], { stopped: true })); if (event === 'asr') asr = true; else writer = true; }
      assert.equal(h.model.snapshot().phase, lock && settings ? 'ready' : 'syncing');
      assert.equal(h.model.snapshot().state.lifetime.state.coordinator.session === null, asr && writer);
      if (!(lock && settings && asr && writer)) assert.equal(h.call('reserve', request(2)), null);
      h.show('hidden');
    }
    h.session = h.call('reserve', request(2)); assert.ok(h.session); h.show('hidden');
    assert.equal(h.model.snapshot().state.lifetime.state.coordinator.view.active, false);
    h.call('close', h.session); h.drain(); count++;
  }
  assert.equal(count, 24);
});

test('new query token rejects old/copy tokens, wrong epoch/kind and duplicate snapshot without ticking', () => {
  const h = setup(); h.sync(1); const old = h.token; h.model.lostAt(0, old); h.begin();
  const version = h.model.snapshot().state.versions.lock;
  for (const [token, patch] of [[old, {}], [{ ...h.token }, {}], [h.token, { epoch: 'wrong' }], [h.token, { kind: 'unknown' }], [h.token, { version: 1 }]]) {
    assert.equal(h.model.receiveAt(100, token, { epoch: 'sync', channel: 'lock', version: 2, value: false, kind: 'snapshot', ...patch }), false);
  }
  assert.equal(h.model.snapshot().state.lifetime.now, 0); assert.equal(h.model.snapshot().state.versions.lock, version);
  assert.equal(h.model.beginAt(0), null); assert.equal(h.model.lostAt(0, old), false);
  assert.ok(h.receive('lock', 2, false)); assert.ok(h.receive('settings', 2, true));
});

test('newer restriction update precedes stale snapshot; old snapshot cannot complete sync', () => {
  const h = setup(); h.sync(1); h.model.lostAt(0, h.token); h.begin();
  assert.ok(h.receive('lock', 3, true, 'update')); assert.equal(h.receive('lock', 2, false), false);
  assert.ok(h.receive('settings', 2, true)); assert.equal(h.model.snapshot().phase, 'syncing');
  assert.ok(h.receive('lock', 4, true)); assert.equal(h.model.snapshot().phase, 'ready');
  assert.equal(h.call('reserve', request(1)), null); assert.ok(h.receive('lock', 5, false, 'update'));
  h.start(1); h.call('close', h.session); h.drain();
});

test('second loss during partial handshake revokes its snapshots; drain cannot manufacture freshness', () => {
  const h = setup(); h.sync(1); h.start(1); h.prepare(); h.copying(); h.model.lostAt(0, h.token);
  h.begin(); const second = h.token; h.receive('lock', 2, false); h.model.lostAt(0, second); h.drain();
  h.begin(); assert.equal(h.receive('settings', 2, true, 'snapshot', second), false);
  h.receive('settings', 2, true); assert.equal(h.call('reserve', request(2)), null);
  assert.equal(h.receive('lock', 2, false), false); h.receive('lock', 3, false); h.start(2); h.call('close', h.session); h.drain();
});

test('bad loss token/time preserves current frame; valid loss closes even at revision exhaustion', () => {
  const h = setup({ maxRevision: 10 }); h.sync(1); h.start(1); h.prepare(); h.candidate();
  assert.equal(h.model.snapshot().state.lifetime.state.exhausted, true);
  assert.equal(h.model.lostAt(-1, h.token), false); assert.equal(h.model.lostAt(0, { ...h.token }), false);
  assert.ok(h.model.lostAt(0, h.token)); h.drain(); h.sync(2);
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.model.snapshot().state.lifetime.state.revision, 10);
});

test('expiry, source loss and deferred copy completion do not retract real OS effects or admit old callbacks', async () => {
  const h = setup(); h.sync(1); h.start(1); h.prepare(); h.copying(); let finish;
  const completion = new Promise(resolve => { finish = resolve; }).then(() => h.call('copied', h.copy, { written: true }));
  h.now = 100; assert.ok(h.model.lostAt(100, h.token)); h.drain(); h.sync(2); h.start(2); h.show('listening');
  finish(); assert.equal(await completion, false); assert.equal(h.model.copyTextAt(100, h.copy), null);
  h.call('close', h.session); h.drain();
});

test('voice disconnect is independent; fresh source snapshots do not reconnect voice; restart revokes query', () => {
  const h = setup(); h.sync(1); h.start(1); const old = h.token; h.call('disconnect', 'sync'); h.drain();
  assert.equal(h.call('reserve', request(2)), null); assert.ok(h.call('restart', 'fresh'));
  assert.equal(h.model.snapshot().phase, 'offline'); h.epoch = 'fresh';
  assert.equal(h.receive('lock', 2, false, 'snapshot', old), false); assert.equal(h.call('reserve', request(1)), null);
  h.sync(2); h.start(1); h.call('close', h.session); h.drain();
});

test('saturated source versions cannot be reset by a reconnect query token', () => {
  const h = setup(); h.sync(1); h.receive('lock', Number.MAX_SAFE_INTEGER, false, 'update');
  h.model.lostAt(0, h.token); h.begin(); assert.equal(h.receive('lock', 1, false), false);
  assert.ok(h.receive('settings', 2, true)); assert.equal(h.model.snapshot().phase, 'syncing');
  assert.equal(h.call('reserve', request(1)), null);
});

test('missing original ASR proof blocks fifty reserves after fresh source recovery', () => {
  const h = setup(); h.sync(1); h.start(1); h.prepare(); h.copying();
  h.model.lostAt(0, h.token); h.sync(2); h.call('released', h.writer, { stopped: true });
  assert.equal(h.call('released', { ...h.asr }, { stopped: true }), false);
  assert.equal(h.call('released', h.asr, { stopped: 'true' }), false);
  for (let i = 0; i < 50; i++) {
    assert.equal(h.call('reserve', request(2)), null); assert.equal(h.call('restart', 'blocked'), false);
  }
  assert.deepEqual(h.model.snapshot().state.lifetime.state.coordinator.pending, [h.asr]);
  assert.ok(h.call('released', h.asr, { stopped: true })); h.start(2); h.show('listening');
  h.call('close', h.session); h.drain();
});

test('forged loss and backward time do not blank healthy current presentation', () => {
  const h = setup(); h.sync(1); h.start(1); h.show('listening'); const frame = h.model.sample();
  assert.equal(h.model.lostAt(0, { ...h.token }), false); assert.equal(h.model.lostAt(-1, h.token), false);
  assert.equal(h.model.receiveAt(1, h.token, { epoch: 'sync', channel: 'lock', version: 2, value: false, kind: 'invented' }), false);
  assert.ok(h.model.commit(frame)); assert.equal(h.model.snapshot().phase, 'ready');
  assert.equal(h.model.snapshot().state.lifetime.now, 0); h.call('close', h.session); h.drain();
});

test('both source and voice loss require source sync, drained voice restart, then new-epoch snapshots', () => {
  const h = setup(); h.sync(1); h.start(1); h.call('disconnect', 'sync');
  assert.ok(h.model.lostAt(0, h.token)); h.drain(); assert.equal(h.call('restart', 'fresh'), null);
  h.sync(2); assert.equal(h.call('reserve', request(2)), null, 'source ready cannot reconnect voice');
  assert.ok(h.call('restart', 'fresh')); h.epoch = 'fresh';
  assert.equal(h.call('reserve', request(1)), null); h.sync(3); h.start(1); h.show('listening');
  h.call('close', h.session); h.drain();
});

test('ready with fresh restrictive snapshots is not permission and allowing update does not revive old run', () => {
  const h = setup(); h.sync(1); h.start(1); h.model.lostAt(0, h.token); h.drain(); h.begin();
  h.receive('lock', 2, true); h.receive('settings', 2, false);
  assert.equal(h.model.snapshot().phase, 'ready'); assert.equal(h.call('reserve', request(2)), null);
  h.receive('lock', 3, false, 'update'); assert.equal(h.call('reserve', request(2)), null);
  h.receive('settings', 3, true, 'update'); h.session = h.call('reserve', request(2)); assert.ok(h.session);
  h.show('hidden'); assert.equal(h.model.snapshot().state.lifetime.state.coordinator.view.active, false);
  h.call('close', h.session); h.drain();
});

test('silent loss counterexample remains: no detector means unreported source failure cannot be known', () => {
  const h = setup(); h.sync(1); h.start(1); h.show('listening');
  assert.equal(h.model.snapshot().phase, 'ready', 'not a heartbeat or real source observer');
  h.call('close', h.session); h.drain();
});

test('source sync is test-only; evidence separates snapshot ownership from authentic system freshness', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-source-sync-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-source-sync.md');
  for (const pattern of [/SC-20261114-017/, /48 条/, /静默失联/, /不是系统认证/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-event-order.md']) assert.ok(read(path).includes('2026-11-14-dictation-source-sync.md'));
});
