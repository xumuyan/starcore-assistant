import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasuredExecFileSync } from '../test-helpers/measured-exec-file.mjs';

function failing(error, file = '/synthetic/node', options = { timeout: 30000 }) {
  let calls = 0; const times = [10, 42.6];
  const run = createMeasuredExecFileSync({ execute: () => { calls++; throw error; }, now: () => times.shift() });
  let caught; try { run(file, ['private-argument'], options); } catch (e) { caught = e; }
  assert.strictEqual(caught, error); assert.equal(calls, 1);
  return error;
}

test('successful calls preserve exact result and forward original options without mutation', () => {
  const value = Buffer.from('fixture'); const args = ['fixture']; const options = { timeout: 30000, env: { FIXTURE: 'private-value' } };
  let calls = 0;
  const run = createMeasuredExecFileSync({ execute: (f, a, o) => { calls++; assert.equal(f, '/synthetic/node'); assert.strictEqual(a, args); assert.strictEqual(o, options); return value; }, now: () => 0 });
  assert.strictEqual(run('/synthetic/node', args, options), value); assert.equal(calls, 1);
  assert.deepEqual(options, { timeout: 30000, env: { FIXTURE: 'private-value' } });
});

test('timeout retains original error identity and adds frozen monotonic timing context only', () => {
  const cause = new Error('fixture'); const error = Object.assign(new Error('fixture failure', { cause }), { code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' });
  failing(error);
  assert.deepEqual(error.executionDiagnostic, { executable: 'node', elapsedMs: 33, timeoutMs: 30000, code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' });
  assert.ok(Object.isFrozen(error.executionDiagnostic)); assert.strictEqual(error.cause, cause);
  assert.equal(error.code, 'ETIMEDOUT'); assert.equal(error.status, null); assert.equal(error.signal, 'SIGTERM');
  assert.match(error.message, /test subprocess diagnostic:/); assert.match(error.stack, /test subprocess diagnostic:/);
});

test('annotation never reads payload, argument or environment values and redacts unknown executable metadata', () => {
  const error = Object.assign(new Error('fixture'), { code: 'private-code', status: 2, signal: 'private-signal' });
  for (const key of ['stdout', 'stderr', 'output']) Object.defineProperty(error, key, { get() { throw new Error('must not inspect payload'); } });
  const options = { timeout: 10000, get env() { throw new Error('must not inspect environment'); }, get input() { throw new Error('must not inspect input'); } };
  failing(error, '/synthetic/private-filename', options);
  assert.deepEqual(error.executionDiagnostic, { executable: 'subprocess', elapsedMs: 33, timeoutMs: 10000, code: null, status: 2, signal: null });
  assert.doesNotMatch(JSON.stringify(error.executionDiagnostic), /private|synthetic/);
});

test('non-error and frozen error throws propagate unchanged without annotation failure', () => {
  for (const error of [null, 'fixture', Object.freeze(new Error('frozen'))]) failing(error);
});

test('unknown timeout is not invented and supported failure codes remain distinguishable', () => {
  for (const code of ['ENOENT', 'EACCES', 'ENOBUFS']) {
    const error = Object.assign(new Error('fixture'), { code, status: 1 });
    failing(error, '/synthetic/cargo', { timeout: undefined });
    assert.equal(error.executionDiagnostic.timeoutMs, null); assert.equal(error.executionDiagnostic.code, code);
    assert.equal(error.executionDiagnostic.executable, 'cargo');
  }
});

test('read-only error message cannot replace original failure during annotation', () => {
  const error = new Error('fixture');
  Object.defineProperty(error, 'message', { value: 'fixture', writable: false });
  failing(error);
  assert.equal(error.message, 'fixture');
});
