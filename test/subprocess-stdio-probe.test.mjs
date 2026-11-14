import test from 'node:test';
import assert from 'node:assert/strict';
import { probeStdio } from '../test-helpers/subprocess-stdio-probe.mjs';

test('stdio probe compares fixed true command without changing timeout or hiding failures', () => {
  let calls = 0; let tick = 0;
  const records = probeStdio({ fd: 7, iterations: 2, now: () => tick += 10, execute: (file, args, options) => {
    assert.equal(file, '/usr/bin/true'); assert.deepEqual(args, []);
    assert.deepEqual(options, calls % 2 ? { timeout: 15000, stdio: [7, 7, 7] } : { timeout: 15000 });
    return calls++ === 1 ? { status: null, error: { code: 'ETIMEDOUT', stdout: 'private-fixture' } } : { status: 0 };
  } });
  assert.equal(calls, 4); assert.ok(Object.isFrozen(records));
  assert.deepEqual(records.map(r => [r.mode, r.index, r.elapsedMs, r.status, r.code, r.failed]), [
    ['default-pipes', 0, 10, 0, null, false], ['regular-file-fds', 0, 10, null, 'ETIMEDOUT', true],
    ['default-pipes', 1, 10, 0, null, false], ['regular-file-fds', 1, 10, 0, null, false],
  ]);
  for (const record of records) assert.ok(Object.isFrozen(record));
  assert.doesNotMatch(JSON.stringify(records), /private-fixture|stdout|args/);
});

test('probe rejects unbounded iteration or invalid descriptor before launching', () => {
  for (const options of [{ fd: 2 }, { fd: -1 }, { fd: 3, iterations: 0 }, { fd: 3, iterations: 6 }, { fd: 3, iterations: 1.5 }]) {
    assert.throws(() => probeStdio({ ...options, execute: () => assert.fail('must not launch') }), TypeError);
  }
});

test('unexpected thrown error retains original identity and is not retried', () => {
  const error = new Error('fixture'); let calls = 0;
  assert.throws(() => probeStdio({ fd: 4, execute: () => { calls++; throw error; } }), e => e === error);
  assert.equal(calls, 1);
});

test('unknown failure metadata is not logged and nonzero status stays a failure', () => {
  const records = probeStdio({ fd: 3, iterations: 1, execute: () => ({ status: 2, error: { code: 'private-code' } }), now: () => 0 });
  for (const record of records) { assert.equal(record.code, null); assert.equal(record.status, 2); assert.equal(record.failed, true); }
});
