import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waitForEventAt } from '../test-helpers/event-at.mjs';

const user = { type: 'message', role: 'user' };
const thinking = { type: 'state', name: 'thinking' };

test('exact-position wait tolerates message and next state arriving in separate stdout chunks', async () => {
  const lines = []; let buffer = '';
  function push(chunk) {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      lines.push(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    }
  }
  const read = () => lines.map(line => JSON.parse(line));
  push(`${JSON.stringify(user)}\n`);
  const earlySnapshot = read();
  assert.throws(() => earlySnapshot[1].type, TypeError, 'old immediate snapshot fails deterministically');
  let completed = false;
  const pending = waitForEventAt(read, 1, { timeoutMs: 1000, pollMs: 1 }).then(event => { completed = true; return event; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  push('{"type":"state","name":"think');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false, 'partial JSON without newline is not an event');
  push('ing"}\n');
  assert.deepEqual(await pending, thinking);
  assert.equal(earlySnapshot.length, 1, 'fresh snapshots do not grow retroactively');
});

test('already arrived exact event resolves without needing a subsequent stdout callback', async () => {
  let calls = 0; const events = [user, thinking];
  assert.strictEqual(await waitForEventAt(() => { calls++; return events; }, 1), thinking);
  assert.equal(calls, 1);
});

test('wrong intervening event is returned for assertion failure, not skipped for a later match', async () => {
  const wrong = { type: 'notice' };
  const event = await waitForEventAt(() => [user, wrong, thinking], 1);
  assert.strictEqual(event, wrong);
  assert.throws(() => assert.equal(event.type, 'state'), assert.AssertionError);
});

test('missing next event times out with position/count only and no raw payload', async () => {
  await assert.rejects(waitForEventAt(() => [{ ...user, content: 'synthetic-private-marker' }], 1,
    { timeoutMs: 5, pollMs: 1 }), error => {
    assert.match(error.message, /等待第 1 条事件超时（已有 1 条）/);
    assert.doesNotMatch(error.message, /synthetic-private-marker/); return true;
  });
});

test('parser errors propagate rather than silently retrying corrupt events', async () => {
  const error = new SyntaxError('synthetic invalid JSON');
  await assert.rejects(waitForEventAt(() => { throw error; }, 1), value => value === error);
});

test('event wait rejects invalid positions/deadlines instead of hanging', async () => {
  for (const index of [-1, .5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(waitForEventAt(() => [], index), TypeError);
  }
  for (const options of [{ timeoutMs: -1 }, { timeoutMs: Infinity }, { pollMs: 0 }, { pollMs: NaN }]) {
    await assert.rejects(waitForEventAt(() => [], 0, options), TypeError);
  }
});

test('Rust relay check awaits exact adjacent position and preserves state/name assertions', () => {
  const source = readFileSync(new URL('./rust-host.test.mjs', import.meta.url), 'utf8');
  assert.match(source, /await waitForEventAt\(parseAll, userAt \+ 1\)/);
  assert.match(source, /assert\.equal\(next\.type, 'state'\)/);
  assert.match(source, /assert\.equal\(next\.name, 'thinking'\)/);
  assert.doesNotMatch(source, /events\[userAt \+ 1\]/);
});

test('event-wait verification keeps test-only scope and actual acceptance limits', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-rust-relay-event-wait.md');
  for (const pattern of [/SC-20261114-007/, /不跳过错误中间事件/, /旧快照读取确定性抛 TypeError/,
    /T0 未验收、T1 未启动/, /G1～G6 仍未验收/, /当前不需要用户操作或授权/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md']) assert.ok(read(path).includes('2026-11-14-rust-relay-event-wait.md'));
});
