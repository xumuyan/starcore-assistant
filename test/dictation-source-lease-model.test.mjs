import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationSourceLeaseModel } from '../test-helpers/dictation-source-lease-model.mjs';
import { DictationSourceSyncModel } from '../test-helpers/dictation-source-sync-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
function setup(options = {}) {
  const model = new DictationSourceLeaseModel({ enabled: true, epoch: 'lease', sourceTtl: 100, candidateTtl: 1000, ...options });
  const h = { model, now: 0, epoch: 'lease' };
  h.call = (command, ...args) => model.dispatchAt(h.now, command, ...args);
  h.begin = () => { h.token = model.beginAt(h.now); assert.ok(h.token); };
  h.receive = (channel, version, value, kind = 'snapshot', observedAt = h.now, token = h.token) => model.receiveAt(h.now, token, { epoch: h.epoch, channel, version, value, kind, observedAt });
  h.sync = version => { h.begin(); assert.ok(h.receive('lock', version, false)); assert.ok(h.receive('settings', version, true)); };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`);
    h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`); assert.ok(h.call('inputReady', h.session, h.capture));
  };
  h.copying = () => {
    h.start(1); h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.writer = h.call('acquire', h.session, 'writer', 'writer');
    h.receipt = h.call('final', h.asr, { text: '合成完整正文' }); h.attempt = h.call('begin', h.receipt, h.writer);
    assert.ok(h.call('result', h.attempt, h.writer, 'not-issued'));
    h.candidate = model.candidate(); h.copy = h.call('requestCopy', h.candidate, { userInitiated: true }); assert.ok(h.copy);
  };
  h.coordinator = () => model.snapshot().state.state.lifetime.state.coordinator;
  h.drain = () => { for (const ticket of h.coordinator().pending) assert.ok(h.call('released', ticket, { stopped: true })); };
  h.show = status => { const frame = model.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status); assert.ok(model.commit(frame)); return frame; };
  return h;
}

test('default-off, strict enable and positive safe integer budget', () => {
  for (const sourceTtl of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup({ sourceTtl }), /invalid source lease options/);
  for (const enabled of [undefined, false, 'true']) {
    const model = new DictationSourceLeaseModel({ epoch: 'off', enabled });
    assert.equal(model.beginAt(0), null); assert.equal(model.advance(0), false); assert.equal(model.sample(), null);
    assert.equal(model.commit({}), false); assert.equal(model.receiveAt(0, {}, {}), false); assert.equal(model.lostAt(0, {}), false);
    assert.equal(model.dispatchAt(0, 'reserve', request(1)), null); assert.equal(model.copyTextAt(0, {}), null); assert.equal(model.candidate(), null);
  }
});

test('original source-sync counterexample: explicit clock alone never expires ready state', () => {
  const model = new DictationSourceSyncModel({ enabled: true, epoch: 'old' }); const token = model.beginAt(0);
  for (const [channel, value] of [['lock', false], ['settings', true]]) assert.ok(model.receiveAt(0, token, { epoch: 'old', kind: 'snapshot', channel, version: 1, value }));
  model.advance(100000); assert.equal(model.snapshot().phase, 'ready');
  const session = model.dispatchAt(100000, 'reserve', request(1)); assert.ok(session); model.dispatchAt(100000, 'close', session);
});

test('inclusive expiry closes current run, hides original frame but never supplies stops', () => {
  const h = setup(); h.sync(1); h.copying(); const frame = h.model.sample();
  assert.equal(h.model.snapshot().deadlines.lock, 100); assert.ok(h.model.copyTextAt(99, h.copy));
  assert.equal(h.model.copyTextAt(100, h.copy), null); assert.equal(h.model.snapshot().reason, 'source-expired');
  assert.equal(h.model.snapshot().state.phase, 'offline'); assert.equal(h.model.commit(frame), false); h.show('hidden');
  assert.equal(h.coordinator().pending.length, 2); assert.equal(h.coordinator().connected, true);
  h.now = 100; h.drain(); assert.equal(h.call('reserve', request(2)), null);
  h.sync(2); h.start(2); h.show('listening'); h.call('close', h.session); h.drain();
});

test('initial query itself has finite independent channel budgets; partial snapshot cannot wait forever', () => {
  const h = setup(); h.begin(); h.now = 90; h.receive('lock', 1, false);
  assert.deepEqual(h.model.snapshot().deadlines, { lock: 190, settings: 100 });
  h.now = 100; assert.equal(h.receive('settings', 1, true), false);
  assert.equal(h.model.snapshot().state.phase, 'offline'); assert.equal(h.model.snapshot().reason, 'source-expired');
});

test('new source version or update activity does not renew authoritative observation budget', () => {
  const h = setup(); h.sync(1); h.start(1); h.now = 80;
  assert.ok(h.receive('lock', 2, false, 'update')); assert.ok(h.receive('settings', 2, true, 'update'));
  assert.deepEqual(h.model.snapshot().deadlines, { lock: 100, settings: 100 });
  h.now = 100; h.call('not-a-command'); assert.equal(h.model.snapshot().state.phase, 'offline'); h.drain();
});

test('one refreshed channel cannot certify the other; only accepted snapshots renew their own budget', () => {
  const h = setup(); h.sync(1); h.start(1); h.now = 80;
  assert.ok(h.receive('lock', 2, false)); assert.deepEqual(h.model.snapshot().deadlines, { lock: 180, settings: 100 });
  assert.equal(h.receive('settings', 1, true), false); h.model.advance(100);
  assert.equal(h.model.snapshot().reason, 'source-expired'); h.now = 100; h.drain();
});

test('arrival time cannot freshen delayed snapshot; same observation time never extends deadline', () => {
  const h = setup(); h.sync(1); h.now = 80;
  assert.ok(h.receive('lock', 2, false, 'snapshot', 0)); assert.equal(h.model.snapshot().deadlines.lock, 100);
  assert.ok(h.receive('settings', 2, true, 'snapshot', 40)); assert.equal(h.model.snapshot().deadlines.settings, 140);
  h.model.advance(100); assert.equal(h.model.snapshot().state.phase, 'offline');
});

test('regressing cached snapshot rejects; next query cannot accept snapshot at its expiry', () => {
  const h = setup(); h.sync(1); h.now = 80; h.receive('lock', 2, false); h.receive('settings', 2, true);
  h.now = 120;
  // Old observation regresses a successfully refreshed channel, even with a new version.
  assert.equal(h.receive('lock', 3, false, 'snapshot', 0), false);
  assert.equal(h.model.snapshot().state.state.lifetime.now, 80);
  h.model.lostAt(120, h.token); h.begin(); h.now = 220;
  assert.equal(h.receive('lock', 3, false, 'snapshot', 120), false); assert.equal(h.model.snapshot().state.phase, 'offline');
});

test('bad observation/token/envelope and backward clock preserve current frame, versions and budget', () => {
  const h = setup(); h.sync(1); h.start(1); h.now = 10; const frame = h.model.sample();
  const base = { epoch: 'lease', channel: 'lock', version: 2, value: false, kind: 'snapshot', observedAt: 10 };
  for (const patch of [{ observedAt: -1 }, { observedAt: 11 }, { observedAt: NaN }, { observedAt: 1.5 }, { observedAt: undefined }, { channel: 'constructor' }, { epoch: 'wrong' }, { version: 1 }, { kind: 'invented' }]) {
    assert.equal(h.model.receiveAt(10, h.token, { ...base, ...patch }), false);
  }
  assert.equal(h.model.receiveAt(10, { ...h.token }, base), false);
  assert.equal(h.model.receiveAt(-1, h.token, { ...base, observedAt: 0 }), false);
  assert.equal(h.model.snapshot().state.state.lifetime.now, 0); assert.ok(h.model.commit(frame));
  assert.deepEqual(h.model.snapshot().deadlines, { lock: 100, settings: 100 }); h.call('close', h.session); h.drain();
});

for (const written of [false, true]) for (const time of [99, 100]) test(`renew/tick/copy at ${time}, written=${written}: 24 trajectories`, () => {
  let count = 0;
  for (const order of permutations(['lock', 'settings', 'tick', 'copy'])) {
    const h = setup(); h.sync(1); h.copying(); h.now = time; const closed = time === 100;
    for (const event of order) {
      if (event === 'tick') assert.ok(h.model.advance(time));
      else if (event === 'copy') assert.equal(h.call('copied', h.copy, { written }) === true, !closed);
      else assert.equal(h.receive(event, 2, event === 'settings'), !closed);
      assert.equal(h.coordinator().closing, closed); assert.equal(h.coordinator().pending.length, 2);
      assert.equal(h.model.snapshot().state.phase, closed ? 'offline' : 'ready');
    }
    if (!closed) { assert.deepEqual(h.model.snapshot().deadlines, { lock: 199, settings: 199 }); h.call('close', h.session); }
    h.drain(); assert.equal(h.model.candidate(), null); count++;
  }
  assert.equal(count, 24);
});

for (const candidateTtl of [50, 100, 200]) test(`candidate TTL ${candidateTtl} never renews source or substitutes its expiry`, () => {
  const h = setup({ candidateTtl }); h.sync(1); h.copying();
  h.now = 100; h.model.advance(100); assert.equal(h.model.snapshot().state.phase, 'offline');
  assert.equal(h.model.copyTextAt(100, h.copy), null); assert.equal(h.coordinator().pending.length, 2); h.drain();
});

test('reads, meter/business work, copy failures and retries never renew source deadline', () => {
  const h = setup(); h.sync(1); h.copying(); h.now = 80;
  const copyText = h.model.copyTextAt(80, h.copy); assert.ok(copyText);
  h.show('copying'); assert.ok(h.call('copied', h.copy, { written: false }));
  const next = h.call('requestCopy', h.model.candidate(), { userInitiated: true }); assert.ok(next);
  assert.deepEqual(h.model.snapshot().deadlines, { lock: 100, settings: 100 });
  assert.ok(h.call('copied', next, { written: true })); h.model.advance(100);
  assert.equal(h.model.snapshot().state.phase, 'offline'); assert.equal(typeof copyText, 'string', 'already returned strings irrevocable');
  h.now = 100; h.drain();
});

test('no tick means no automatic passage; presentation and snapshots are not permission for OS effect', () => {
  const h = setup(); h.sync(1); h.copying(); h.show('copying');
  assert.equal(h.model.snapshot().state.state.lifetime.now, 0);
  assert.equal(h.model.snapshot().state.phase, 'ready'); h.model.advance(100); h.now = 100; h.drain();
});

test('logical deadline addition overflow refuses begin or closes an active source without rounding', () => {
  const h = setup(); h.now = Number.MAX_SAFE_INTEGER - 50; assert.equal(h.model.beginAt(h.now), null);
  assert.equal(h.model.snapshot().reason, 'clock-exhausted');
  const g = setup(); g.now = Number.MAX_SAFE_INTEGER - 150; g.sync(1); g.start(1);
  g.now = Number.MAX_SAFE_INTEGER - 60;
  assert.equal(g.receive('lock', 2, false), false); assert.equal(g.model.snapshot().reason, 'clock-exhausted'); g.drain();
});

test('deferred pre-expiry snapshot and copied callback cannot revive next source/run', async () => {
  const h = setup(); h.sync(1); h.copying(); const old = h.token; let finish;
  const pending = new Promise(resolve => { finish = resolve; }).then(() => [h.receive('lock', 2, false, 'snapshot', 0, old), h.call('copied', h.copy, { written: true })]);
  h.now = 100; h.model.advance(100); h.drain(); h.sync(3); h.start(2); h.show('listening');
  finish(); assert.deepEqual(await pending, [false, false]); h.call('close', h.session); h.drain();
});

test('restart clears lease ownership but retains logical time and source versions; source loss also clears budgets', () => {
  const h = setup(); h.sync(1); h.start(1); h.now = 30; h.call('disconnect', 'lease'); h.drain();
  assert.ok(h.call('restart', 'fresh')); h.epoch = 'fresh';
  assert.equal(h.model.snapshot().state.phase, 'offline'); assert.deepEqual(h.model.snapshot().deadlines, { lock: null, settings: null });
  h.sync(2); assert.deepEqual(h.model.snapshot().deadlines, { lock: 130, settings: 130 });
  assert.ok(h.model.lostAt(30, h.token)); assert.equal(h.model.snapshot().reason, 'source-lost');
  assert.equal(h.model.snapshot().state.state.versions.lock, 2);
});

test('source expiry still closes/drains exhausted business model and missing original stop blocks restart', () => {
  const h = setup({ maxRevision: 10 }); h.sync(1); h.start(1);
  h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
  const writer = h.call('acquire', h.session, 'writer', 'writer'); const receipt = h.call('final', h.asr, { text: '合成' });
  const attempt = h.call('begin', receipt, writer); h.call('result', attempt, writer, 'not-issued');
  assert.equal(h.model.snapshot().state.state.lifetime.state.exhausted, true);
  h.now = 100; h.model.advance(100); assert.equal(h.coordinator().closing, true);
  assert.equal(h.call('released', { ...h.asr }, { stopped: true }), false); h.call('released', writer, { stopped: true });
  h.sync(2); for (let i = 0; i < 50; i++) assert.equal(h.call('reserve', request(2)), null);
  h.call('released', h.asr, { stopped: true }); assert.equal(h.call('reserve', request(2)), null, 'exhaustion cannot reset');
});

test('source expiry without active work still revokes token and requires both new snapshots', () => {
  const h = setup({ sourceTtl: 1 }); h.sync(1); const old = h.token;
  h.now = 1; h.model.advance(1); assert.equal(h.coordinator().session, null);
  assert.equal(h.receive('lock', 2, false, 'snapshot', 1, old), false);
  h.begin(); h.receive('lock', 2, false); assert.equal(h.call('reserve', request(1)), null);
  h.receive('settings', 2, true); h.start(1); h.call('close', h.session); h.drain();
});

test('accepted fresh restrictive snapshots renew only liveness, not permission', () => {
  const h = setup(); h.sync(1); h.start(1); h.now = 90;
  h.receive('lock', 2, true); h.receive('settings', 2, false); h.drain();
  h.now = 150; h.model.advance(150); assert.equal(h.model.snapshot().state.phase, 'ready');
  assert.deepEqual(h.model.snapshot().deadlines, { lock: 190, settings: 190 });
  assert.equal(h.call('reserve', request(2)), null);
  h.receive('lock', 3, false, 'update'); assert.equal(h.call('reserve', request(2)), null);
  h.receive('settings', 3, true, 'update'); h.start(2); h.call('close', h.session); h.drain();
});

test('missing stop after source renewal remains blocking, but original proof permits fresh input', () => {
  const h = setup(); h.sync(1); h.copying(); const oldCopy = h.copy; h.now = 100; h.model.advance(100);
  h.call('released', h.writer, { stopped: true }); h.sync(2);
  assert.equal(h.call('released', { ...h.asr }, { stopped: true }), false);
  for (let i = 0; i < 50; i++) assert.equal(h.call('reserve', request(2)), null);
  h.call('released', h.asr, { stopped: true }); h.start(2); h.show('listening');
  assert.equal(h.call('copied', oldCopy, { written: true }), false); h.call('close', h.session); h.drain();
});

test('source budget ending at safe maximum is exact, and expiry never resets time', () => {
  const h = setup(); h.now = Number.MAX_SAFE_INTEGER - 100; h.sync(1);
  assert.deepEqual(h.model.snapshot().deadlines, { lock: Number.MAX_SAFE_INTEGER, settings: Number.MAX_SAFE_INTEGER });
  assert.ok(h.model.advance(Number.MAX_SAFE_INTEGER)); assert.equal(h.model.snapshot().reason, 'source-expired');
  assert.equal(h.model.advance(0), false); assert.equal(h.model.beginAt(Number.MAX_SAFE_INTEGER), null);
  assert.equal(h.model.snapshot().reason, 'clock-exhausted');
});

test('source lease stays test-only; evidence records trustworthy observations and TOCTOU gap', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`; if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-source-lease-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-source-lease.md');
  for (const pattern of [/SC-20261114-018/, /96 条/, /observedAt/, /TOCTOU/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-source-sync.md']) assert.ok(read(path).includes('2026-11-14-dictation-source-lease.md'));
});
