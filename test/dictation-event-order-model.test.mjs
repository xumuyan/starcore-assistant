import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationEventOrderModel } from '../test-helpers/dictation-event-order-model.mjs';
import { DictationLifetimeModel } from '../test-helpers/dictation-lifetime-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function setup(options = {}) {
  const model = new DictationEventOrderModel({ enabled: true, epoch: 'ordered', candidateTtl: 100, ...options });
  const h = { model, now: 0 };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.event = (channel, version, value, epoch = 'ordered') => model.receiveAt(h.now, { epoch, channel, version, value });
  h.ready = () => { assert.ok(h.event('lock', 1, false)); assert.ok(h.event('settings', 1, true)); };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`);
    h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`);
    assert.ok(h.call('inputReady', h.session, h.capture));
  };
  h.copying = () => {
    h.start(1); h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', 'writer');
    h.receipt = h.call('final', h.asr, { text: '合成正文' });
    h.attempt = h.call('begin', h.receipt, h.writer); assert.ok(h.call('result', h.attempt, h.writer, 'not-issued'));
    h.candidate = model.candidate(); h.copy = h.call('requestCopy', h.candidate, { userInitiated: true }); assert.ok(h.copy);
  };
  h.drain = () => { for (const lease of model.snapshot().lifetime.state.coordinator.pending) assert.ok(h.call('released', lease, { stopped: true })); };
  h.show = status => { const frame = model.sample(); assert.equal(frame.presentation.status, status); assert.ok(model.commit(frame)); return frame; };
  return h;
}

test('default off, strict enable and no mutable sources', () => {
  for (const enabled of [undefined, false, 'true']) {
    const model = new DictationEventOrderModel({ epoch: 'off', enabled });
    assert.equal(model.receiveAt(0, { epoch: 'off', channel: 'lock', version: 1, value: false }), false);
    assert.equal(model.dispatchAt(0, 'reserve', request(1)), null); assert.equal(model.advance(0), false);
    assert.equal(model.sample(), null); assert.equal(model.commit({}), false); assert.equal(model.copyTextAt(0, {}), null);
    assert.deepEqual(Object.keys(model), []);
  }
});

test('initial state stays blocked until independent lock and settings snapshots arrive', () => {
  const h = setup(); assert.equal(h.call('reserve', request(1)), null);
  h.event('lock', 1, false); assert.equal(h.call('reserve', request(1)), null);
  h.event('settings', 1, true); h.start(1); h.call('close', h.session); h.drain();
});

test('old lifetime model counterexample: same-epoch late unlock can reopen after drain', () => {
  const model = new DictationLifetimeModel({ enabled: true, epoch: 'old' });
  model.event('unlock', 'old'); // Generated before the later lock, delivered again afterwards.
  model.event('lock', 'old'); model.event('unlock', 'old');
  assert.ok(model.dispatch('reserve', request(1)), 'old model has no source version');
  model.dispatch('close', model.snapshot().state.coordinator.session);
});

for (const channel of ['lock', 'settings']) test(`${channel} versions reject stale enabling events and equal-version conflicts`, () => {
  const h = setup(); h.ready(); h.copying(); const disabling = channel === 'lock';
  assert.ok(h.event(channel, 3, disabling)); h.drain();
  assert.equal(h.event(channel, 2, !disabling), false); assert.equal(h.event(channel, 3, !disabling), false);
  assert.equal(h.call('reserve', request(2)), null); assert.ok(h.event(channel, 4, !disabling));
  assert.equal(h.model.candidate(), null); h.start(2); h.call('close', h.session); h.drain();
});

test('validation rejects invalid envelope before time/version changes and preserves pending frame', () => {
  const h = setup(); h.ready(); h.copying(); const frame = h.model.sample();
  for (const patch of [{ epoch: 'wrong' }, { channel: 'constructor' }, { channel: 'toString' }, { version: 1 }, { version: 0 }, { version: NaN }, { version: 1.1 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { value: 'false' }]) {
    assert.equal(h.model.receiveAt(100, { epoch: 'ordered', channel: 'lock', version: 2, value: false, ...patch }), false);
  }
  assert.equal(h.model.receiveAt(-1, { epoch: 'ordered', channel: 'lock', version: 2, value: false }), false);
  assert.equal(h.model.snapshot().lifetime.now, 0); assert.equal(h.model.snapshot().versions.lock, 1); assert.ok(h.model.commit(frame));
  h.call('close', h.session); h.drain();
});

for (const written of [false, true]) for (const time of [99, 100]) test(`copy/tick/lock/settings order, written=${written}, time=${time}: 24 trajectories`, () => {
  let count = 0;
  for (const order of permutations(['copy', 'tick', 'lock', 'disable'])) {
    const h = setup(); h.ready(); h.copying(); h.now = time;
    let closed = false; let copied = false;
    for (const event of order) {
      // Every valid ingress advances time first: deadline wins at exactly 100.
      if (time === 100 && !copied) closed = true;
      if (event === 'copy') {
        assert.equal(h.call('copied', h.copy, { written }) === true, !closed);
        if (!closed && written) copied = true;
      } else if (event === 'tick') assert.ok(h.model.advance(time));
      else { assert.ok(h.event(event === 'lock' ? 'lock' : 'settings', 2, event === 'lock')); closed = true; }
      assert.equal(h.model.snapshot().lifetime.state.coordinator.closing, closed);
      assert.equal(h.model.snapshot().lifetime.state.coordinator.pending.length, 2);
      assert.equal(h.call('reserve', request(2)), null);
    }
    assert.equal(h.model.candidate(), null); h.show('hidden'); h.drain();
    assert.equal(h.call('reserve', request(2)), null);
    h.event('lock', 3, false); assert.equal(h.call('reserve', request(2)), null); h.event('settings', 3, true);
    h.start(2); h.show('listening'); h.call('close', h.session); h.drain(); count++;
  }
  assert.equal(count, 24);
});

for (const channel of ['lock', 'settings']) test(`${channel} four source snapshots in all arrival orders: 24 trajectories`, () => {
  let count = 0;
  for (const order of permutations([2, 3, 4, 5])) {
    const h = setup(); h.ready(); h.start(1); let high = 1; let restricted = false;
    for (const version of order) {
      const accepted = version > high;
      const isRestricted = version % 2 === 1;
      assert.equal(h.event(channel, version, channel === 'lock' ? isRestricted : !isRestricted), accepted);
      if (accepted) { high = version; restricted = isRestricted; }
      const state = h.model.snapshot(); assert.equal(state.versions[channel], high);
      assert.equal(channel === 'lock' ? state.lifetime.locked : !state.lifetime.settingsEnabled, restricted);
      assert.equal(state.lifetime.state.coordinator.pending.length, 2);
    }
    assert.equal(high, 5); h.call('close', h.session); h.drain();
    assert.equal(h.call('reserve', request(2)), null); count++;
  }
  assert.equal(count, 24);
});

test('deadline precedes copy reads and even rejected business commands on valid ingress', () => {
  for (const method of ['read', 'command', 'event', 'replace']) {
    const h = setup(); h.ready(); h.copying(); const frame = h.model.sample();
    if (method === 'read') assert.equal(h.model.copyTextAt(100, h.copy), null);
    else if (method === 'command') assert.equal(h.model.dispatchAt(100, 'not-a-command'), null);
    else if (method === 'event') assert.ok(h.model.receiveAt(100, { epoch: 'ordered', channel: 'lock', version: 2, value: false }));
    else assert.equal(h.model.replaceAt(100, 'ordered', h.session), false, 'expiry closed before replacement');
    assert.equal(h.model.snapshot().lifetime.reason, 'expired'); assert.equal(h.model.commit(frame), false); h.now = 100; h.drain();
  }
});

test('sample/snapshot are not a clock; no tick still means no expiry detection', () => {
  const h = setup(); h.ready(); h.copying(); h.show('copying');
  assert.equal(h.model.snapshot().lifetime.now, 0); assert.equal(h.model.snapshot().lifetime.deadline, 100);
  assert.ok(h.model.copyTextAt(99, h.copy)); assert.equal(h.model.copyTextAt(100, h.copy), null); h.now = 100; h.drain();
});

test('channels are independent and source versions persist across fresh epochs without reset/wrap', () => {
  const h = setup(); h.ready(); h.event('lock', 7, false); h.start(1);
  h.call('disconnect', 'ordered'); h.drain(); assert.ok(h.call('restart', 'fresh'));
  assert.equal(h.event('lock', 7, false, 'fresh'), false);
  assert.equal(h.event('lock', 1, true, 'ordered'), false);
  assert.equal(h.event('lock', 1, true, 'fresh'), false, 'no source-counter restart escape');
  assert.ok(h.event('settings', 2, false, 'fresh')); assert.equal(h.call('reserve', request(1)), null);
  assert.ok(h.event('settings', 3, true, 'fresh')); h.start(1); h.call('close', h.session); h.drain();
});

test('maximum version fails closed for either channel/value; cleanup still drains without reset or wrap', () => {
  for (const channel of ['lock', 'settings']) for (const value of [false, true]) {
    const h = setup(); h.ready(); h.copying(); assert.ok(h.event(channel, Number.MAX_SAFE_INTEGER, value));
    assert.equal(h.event(channel, Number.MAX_SAFE_INTEGER + 1, !value), false);
    assert.equal(h.event(channel, 2, !value), false); h.drain(); assert.equal(h.call('reserve', request(2)), null);
  }
});

test('entry replacement keeps original session guard and advances deadline only for valid scope', () => {
  const h = setup(); h.ready(); h.copying(); const frame = h.model.sample();
  assert.equal(h.model.replaceAt(100, 'ordered', { ...h.session }), false);
  assert.equal(h.model.replaceAt(100, 'wrong', h.session), false); assert.ok(h.model.commit(frame));
  assert.ok(h.model.replaceAt(99, 'ordered', h.session)); assert.equal(h.model.candidate(), null);
  assert.equal(h.model.snapshot().lifetime.reason, 'entry-replaced'); h.now = 99; h.drain();
});

test('source-version counterexample: unseen higher-version disable cannot be inferred', () => {
  const h = setup(); h.ready();
  assert.ok(h.event('lock', 2, false), 'cannot know a version 3 lock exists but is not delivered');
  h.start(1); assert.ok(h.event('lock', 3, true)); assert.equal(h.call('reserve', request(2)), null); h.drain();
});

test('deferred old unlock after newer lock rejects and cannot open a drained next run', async () => {
  const h = setup(); h.ready(); h.copying(); let finish;
  const pending = new Promise(resolve => { finish = resolve; }).then(() => h.event('lock', 2, false));
  assert.ok(h.event('lock', 3, true)); h.drain(); finish(); assert.equal(await pending, false);
  assert.equal(h.call('reserve', request(2)), null);
});

test('version-only enable update is not a presentation transition and old snapshot cannot be revoked', () => {
  const h = setup(); h.ready(); h.copying(); const frame = h.model.sample(); const before = h.model.snapshot();
  assert.ok(Object.isFrozen(before.versions)); assert.ok(h.event('lock', 2, false));
  assert.equal(h.model.snapshot().lifetime.state.revision, before.lifetime.state.revision); assert.ok(h.model.commit(frame));
  assert.equal(before.versions.lock, 1); h.call('close', h.session); h.drain();
});

test('event ordering proposal stays test-only and evidence records source/trust/time gaps', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-event-order-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-event-order.md');
  for (const pattern of [/SC-20261114-016/, /96 条/, /不是生成序号分配器/, /未到达/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-lifetime.md']) assert.ok(read(path).includes('2026-11-14-dictation-event-order.md'));
});
