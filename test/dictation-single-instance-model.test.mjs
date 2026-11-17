// Offline tests for the single-instance / data-safety wiring-readiness model
// (SC-20261115-020, T1 gap). Logical checks only; no real filesystem,
// clipboard, input injection, system listeners, processes or timers; default off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DictationSingleInstanceModel, instanceStates, writeKinds } from '../test-helpers/dictation-single-instance-model.mjs';

const PATHS = [
  'Application Support/moss/encrypted-records.json',
  'Application Support/moss/encrypted-records-2.json',
];

const setup = (options = {}) => new DictationSingleInstanceModel({ enabled: true, encryptedRecordPaths: PATHS, ...options });

test('default off and fixed vocabularies; constructor validates path list', () => {
  assert.deepEqual([...instanceStates].sort(), ['claimed', 'contended', 'retired', 'unclaimed'].sort());
  assert.deepEqual([...writeKinds].sort(), ['encrypted-record', 'plaintext'].sort());
  for (const enabled of [undefined, false, 'yes']) {
    const m = new DictationSingleInstanceModel({ enabled, encryptedRecordPaths: PATHS });
    assert.equal(m.enabled, false);
    assert.deepEqual(m.claim('a'), { accepted: false, reason: 'disabled' });
    assert.deepEqual(m.beginWrite({ path: PATHS[0], kind: 'encrypted-record' }).verdict, 'disabled');
    assert.equal(m.state, 'unclaimed');
    assert.equal(m.latched, false);
  }
  for (const bad of [{ encryptedRecordPaths: 'x' }, { encryptedRecordPaths: [1] }, { encryptedRecordPaths: [''] },
    { encryptedRecordPaths: ['dir/'] }, { encryptedRecordPaths: ['a\\'] }, { encryptedRecordPaths: ['a', 'a'] }]) {
    assert.throws(() => new DictationSingleInstanceModel({ enabled: true, ...bad }), TypeError);
  }
  assert.equal(setup().enabled, true);
});

test('single-instance mutual exclusion: one live claim, release frees the slot', () => {
  const m = setup();
  assert.deepEqual(m.claim('inst-1'), { accepted: true, instance: 'inst-1' });
  assert.equal(m.state, 'claimed');
  assert.equal(m.instanceId, 'inst-1');
  assert.equal(m.stats.claimsAccepted, 1);
  // non-holder release is refused; the claim stays
  assert.deepEqual(m.release('inst-2'), { accepted: false, reason: 'not-holder' });
  assert.equal(m.state, 'claimed');
  assert.deepEqual(m.release('inst-1'), { accepted: true });
  assert.equal(m.state, 'unclaimed');
  assert.equal(m.instanceId, null);
  // re-claim by a new instance after voluntary release is allowed
  assert.deepEqual(m.claim('inst-2'), { accepted: true, instance: 'inst-2' });
  assert.equal(m.stats.claimsAccepted, 2);
});

test('duplicate startup is fail-closed: latch, contended state, permanent refusal', () => {
  const fails = [];
  const m = setup({ onFail: (r) => fails.push(r) });
  assert.ok(m.claim('inst-1').accepted);
  assert.deepEqual(m.claim('inst-2'), { accepted: false, reason: 'duplicate-startup' });
  assert.equal(m.latched, true);
  assert.equal(m.state, 'contended');
  assert.equal(m.stats.duplicateStartups, 1);
  assert.deepEqual(fails, ['duplicate-startup']);
  // every entry is refused while latched, including the original holder
  assert.deepEqual(m.claim('inst-1'), { accepted: false, reason: 'latched' });
  assert.deepEqual(m.release('inst-1'), { accepted: false, reason: 'latched' });
  assert.deepEqual(m.retire('inst-1'), { accepted: false, reason: 'not-holder' });
  assert.deepEqual(m.beginWrite({ path: PATHS[0], kind: 'encrypted-record' }).verdict, 'latched');
  assert.equal(m.stats.writesAccepted, 0);
  assert.equal(m.snapshot().latched, true);
  // no reset, no retry path
  assert.deepEqual(m.claim('inst-9'), { accepted: false, reason: 'latched' });
  assert.equal(m.latched, true);
});

test('retirement is irreversible; no claim ever succeeds afterwards', () => {
  const fails = [];
  const m = setup({ onFail: (r) => fails.push(r) });
  assert.ok(m.claim('inst-1').accepted);
  assert.deepEqual(m.retire('inst-1'), { accepted: true });
  assert.equal(m.state, 'retired');
  assert.equal(m.instanceId, null);
  assert.deepEqual(fails, ['instance-retired']);
  assert.deepEqual(m.claim('inst-2'), { accepted: false, reason: 'retired' });
  assert.deepEqual(m.claim('inst-1'), { accepted: false, reason: 'retired' });
  assert.equal(m.state, 'retired');
  // retirement of a non-holder is refused without state change
  const m2 = setup();
  assert.deepEqual(m2.retire('nobody'), { accepted: false, reason: 'not-holder' });
  assert.equal(m2.state, 'unclaimed');
});

test('data safety: exact whitelist, encrypted-record kind only, no plaintext anywhere', () => {
  const m = setup();
  assert.deepEqual(m.beginWrite({ path: PATHS[0], kind: 'encrypted-record' }),
    { verdict: 'accepted', accepted: true, path: PATHS[0], kind: 'encrypted-record' });
  // unknown path refused even for encrypted records (no new files)
  assert.deepEqual(m.beginWrite({ path: PATHS[0] + '.bak', kind: 'encrypted-record' }),
    { verdict: 'unknown-path', accepted: false, reason: 'unknown-path' });
  // plaintext kind refused even on whitelisted paths
  assert.deepEqual(m.beginWrite({ path: PATHS[0], kind: 'plaintext' }).verdict, 'plaintext-or-invalid');
  assert.deepEqual(m.beginWrite({ path: '/tmp/plain.txt', kind: 'plaintext' }).verdict, 'plaintext-or-invalid');
  assert.equal(m.beginWrite({}).verdict, 'plaintext-or-invalid');
  assert.equal(m.beginWrite({ path: PATHS[0] }).verdict, 'plaintext-or-invalid');
  assert.equal(m.stats.writesRefused, 5);
  assert.equal(m.stats.writesAccepted, 1);
  // prefix membership is not enough: exact string match only
  assert.deepEqual(m.beginWrite({ path: PATHS[0] + '/x', kind: 'encrypted-record' }).verdict, 'unknown-path');
  // API carries no content parameter at all: writes with content keys are the
  // caller's mistake, the model ignores unknown extra keys and still only
  // checks (path, kind).
  assert.equal(m.beginWrite({ path: PATHS[1], kind: 'encrypted-record', content: 'secret' }).accepted, true);
  assert.equal(m.allowedPaths.length, 2);
});

test('writes are refused after retirement and while latched, with distinct verdicts', () => {
  const m = setup();
  assert.ok(m.claim('inst-1').accepted);
  assert.ok(m.retire('inst-1').accepted);
  assert.deepEqual(m.beginWrite({ path: PATHS[0], kind: 'encrypted-record' }),
    { verdict: 'retired', accepted: false, reason: 'retired' });
  const m2 = setup();
  assert.ok(m2.claim('a').accepted);
  assert.equal(m2.claim('b').accepted, false); // latch
  assert.deepEqual(m2.beginWrite({ path: PATHS[0], kind: 'encrypted-record' }),
    { verdict: 'latched', accepted: false, reason: 'latched' });
});

test('offline source assertions: no clipboard, input injection, processes, timers, real fs', () => {
  const src = readFileSync(new URL('../test-helpers/dictation-single-instance-model.mjs', import.meta.url), 'utf8');
  for (const banned of ['NSPasteboard', 'pbcopy', 'CGEvent', 'child_process', 'spawn', 'exec', 'setTimeout', 'setInterval',
    'Date.now', 'fs.', 'readFileSync', 'writeFile', 'launchctl', 'osascript', 'navigator', 'addEventListener']) {
    assert.equal(src.includes(banned), false, `banned token in model: ${banned}`);
  }
  const self = readFileSync(new URL('../test-helpers/dictation-single-instance-model.mjs', import.meta.url), 'utf8');
  assert.equal((self.match(/#enabled/g) || []).length > 0, true);
});
