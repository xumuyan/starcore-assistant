import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DictationTransitionModel } from '../test-helpers/dictation-transition-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup(options = {}) {
  const model = new DictationTransitionModel({ enabled: true, epoch: 'transitions', ...options });
  const h = { model, call: (command, ...args) => model.dispatch(command, ...args) };
  h.start = n => {
    h.session = h.call('reserve', request(n)); assert.ok(h.session);
    h.capture = h.call('acquire', h.session, 'capture', `capture-${n}`);
    h.asr = h.call('acquire', h.session, 'asr', `asr-${n}`);
    assert.equal(h.call('inputReady', h.session, h.capture), true);
  };
  h.prepare = () => {
    h.call('released', h.capture, { stopped: true }); h.call('process', h.session);
    h.receipt = h.call('final', h.asr, { text: '最终合成正文' }); assert.ok(h.receipt);
    h.writer = h.call('acquire', h.session, 'writer', `writer-${h.session.run}`);
    h.attempt = h.call('begin', h.receipt, h.writer); assert.ok(h.attempt);
  };
  h.close = () => {
    h.call('close', h.session); h.call('released', h.capture, { stopped: true });
    h.call('released', h.asr, { stopped: true }); if (h.writer) h.call('released', h.writer, { stopped: true });
  };
  h.show = status => { const frame = model.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status);
    assert.equal(model.commit(frame), true); return frame; };
  return h;
}

test('default off/strict enable and counter validation; unknown commands cannot reach methods', () => {
  for (const enabled of [undefined, false, 'true']) {
    const model = new DictationTransitionModel({ epoch: 'off', enabled });
    assert.equal(model.dispatch('reserve', request(1)), null); assert.equal(model.sample(), null);
    assert.equal(model.commit({}), false); assert.equal(model.candidate(), null);
  }
  for (const maxRevision of [0, -1, Infinity, 1.2]) assert.throws(() => setup({ maxRevision }), /invalid transition options/);
  const h = setup(); for (const command of ['constructor', 'toString', 'snapshot', 'writerText']) assert.equal(h.call(command), null);
});

test('each accepted owner operation invalidates pending display and advances independent revision', () => {
  const h = setup(); const operations = [
    () => { h.session = h.call('reserve', request(1)); return h.session; },
    () => { h.capture = h.call('acquire', h.session, 'capture', 'capture'); return h.capture; },
    () => { h.asr = h.call('acquire', h.session, 'asr', 'asr'); return h.asr; },
    () => h.call('inputReady', h.session, h.capture),
    () => h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0.5 }),
    () => h.call('deliver', h.asr, { type: 'transcript', text: '合成中间文字' }),
    () => h.call('released', h.capture, { stopped: true }),
    () => h.call('process', h.session),
    () => { h.receipt = h.call('final', h.asr, { text: '最终合成正文' }); return h.receipt; },
    () => { h.writer = h.call('acquire', h.session, 'writer', 'writer'); return h.writer; },
    () => { h.attempt = h.call('begin', h.receipt, h.writer); return h.attempt; },
    () => h.call('result', h.attempt, h.writer, 'not-issued'),
    () => { h.copy = h.call('requestCopy', h.model.candidate(), { userInitiated: true }); return h.copy; },
    () => h.call('copied', h.copy, { written: true }),
  ];
  for (const op of operations) {
    const old = h.model.sample(); const before = h.model.snapshot().revision;
    assert.ok(op()); assert.equal(h.model.snapshot().revision, before + 1);
    assert.equal(h.model.commit(old), false); assert.equal(h.model.snapshot().presentation.status, 'hidden');
  }
  h.show('copied'); h.close();
});

test('ABA copy-available -> copying -> failed -> copy-available rejects old record without intermediate samples', () => {
  const h = setup(); h.start(1); h.prepare(); h.call('result', h.attempt, h.writer, 'not-issued');
  const old = h.model.sample(); const copy = h.call('requestCopy', h.model.candidate(), { userInitiated: true });
  assert.equal(h.model.copyText(copy), '最终合成正文'); h.call('copied', copy, { written: false });
  assert.equal(h.model.snapshot().revision, old.revision + 2); assert.equal(h.model.commit(old), false);
  const next = h.show('copy-available'); assert.deepEqual(next.presentation, old.presentation); h.close();
});

test('rejected forged/invalid callbacks preserve revision and pending valid record', () => {
  const h = setup(); h.start(1); h.prepare(); const frame = h.model.sample(); const revision = h.model.snapshot().revision;
  for (const [command, ...args] of [
    ['result', { ...h.attempt }, h.writer, 'issued'], ['result', h.attempt, { ...h.writer }, 'issued'],
    ['result', h.attempt, h.writer, 'accepted'], ['final', h.asr, { text: '重复最终结果' }],
    ['released', h.writer, { stopped: 'true' }], ['hide', { ...h.session }], ['requestCopy', {}, { userInitiated: true }],
  ]) { assert.ok(!h.call(command, ...args)); assert.equal(h.model.snapshot().revision, revision); }
  assert.ok(h.model.commit(frame)); h.close();
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) test(`${terminal} hides synchronously at unique ingress and holds leases until original stops`, () => {
  const h = setup(); h.start(1); h.prepare(); h.show('preparing'); const pending = h.model.sample();
  if (terminal === 'disconnect') h.call('disconnect', 'transitions'); else h.call('close', h.session, terminal);
  assert.equal(h.model.snapshot().presentation.status, 'hidden'); assert.equal(h.model.commit(pending), false);
  assert.equal(h.call('reserve', request(2)), null); assert.equal(h.call('result', h.attempt, h.writer, 'issued'), false);
  h.call('released', h.asr, { stopped: true }); h.call('released', h.writer, { stopped: true });
  assert.equal(h.model.snapshot().coordinator.session, null);
});

for (const command of ['dismiss', 'hide']) test(`${command} preparing cannot resurrect final and marker never crosses run`, () => {
  const h = setup(); h.start(1); h.prepare(); const oldSession = h.session; const old = h.model.sample();
  assert.ok(h.call(command, ...(command === 'hide' ? [h.session] : [])));
  assert.equal(h.model.commit(old), false); h.show('hidden');
  assert.equal(h.model.snapshot().coordinator.pending.length, 2); assert.equal(h.call('reserve', request(2)), null);
  h.close(); h.start(2); h.show('listening'); assert.equal(h.call('hide', oldSession), false); h.close();
});

test('same-value accepted meter/duplicate hide still advances conservatively; reads/sample/commit do not', () => {
  const h = setup(); h.start(1); h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0 });
  const revision = h.model.snapshot().revision; const old = h.model.sample();
  h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0 });
  assert.equal(h.model.snapshot().revision, revision + 1); assert.equal(h.model.commit(old), false);
  const frame = h.model.sample(); const next = h.model.sample(); assert.equal(frame.revision, next.revision);
  assert.equal(h.model.commit(frame), false); assert.equal(h.model.commit({ ...next }), false); assert.ok(h.model.commit(next));
  assert.equal(h.model.commit(next), false); assert.equal(h.model.snapshot().revision, revision + 1);
  h.call('hide', h.session); const hidden = h.model.sample(); h.call('hide', h.session);
  assert.equal(h.model.commit(hidden), false); h.close();
});

test('coalesced meter overwrite is a transition even when queue length/seq unchanged', () => {
  const h = setup({ coalesceMeters: true }); h.start(1);
  h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0.3 }); const old = h.model.sample();
  const seq = h.model.snapshot().coordinator.view.seq;
  h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0.9 });
  assert.equal(h.model.snapshot().coordinator.view.seq, seq); assert.equal(h.model.commit(old), false);
  assert.equal(h.call('flushMeter', h.session), true); const next = h.show('listening');
  assert.equal(next.presentation.level, 0.9); h.close();
});

test('new epoch reusing IDs cannot reset transition revision or accept old frame/session', () => {
  const h = setup(); h.start(1); const old = h.model.sample(); const oldSession = h.session;
  h.close(); assert.ok(h.call('restart', 'new-epoch')); h.start(1); const next = h.show('listening');
  assert.ok(next.revision > old.revision); assert.equal(h.model.commit(old), false); assert.equal(h.call('hide', oldSession), false); h.close();
});

test('exhaustion blocks ordinary work but close/disconnect/original stop remain usable without wrapping', () => {
  const h = setup({ maxRevision: 5 }); h.start(1); const old = h.model.sample();
  assert.equal(h.call('deliver', h.capture, { type: 'meter', source: 'input', level: 0.2 }), true);
  assert.equal(h.model.snapshot().exhausted, true); assert.equal(h.model.sample(), null); assert.equal(h.model.commit(old), false);
  assert.equal(h.call('process', h.session), null); assert.equal(h.model.copyText({}), null);
  assert.equal(h.call('close', h.session), true); assert.equal(h.call('disconnect', 'transitions'), true);
  assert.equal(h.call('released', h.capture, { stopped: true }), true); assert.equal(h.call('released', h.asr, { stopped: true }), true);
  assert.equal(h.model.snapshot().revision, 5); assert.equal(h.model.snapshot().coordinator.session, null);
  assert.equal(h.call('restart', 'other'), null, 'fresh instance required; no epoch reset escape');
});

test('exhaustion during active copying prevents late completion and new copy reads, but drains original leases', () => {
  const h = setup({ maxRevision: 11 }); h.start(1); h.prepare();
  assert.equal(h.model.snapshot().revision, 9);
  h.call('result', h.attempt, h.writer, 'not-issued'); const available = h.model.sample();
  const copy = h.call('requestCopy', h.model.candidate(), { userInitiated: true }); assert.ok(copy);
  assert.equal(h.model.snapshot().revision, 11); assert.equal(h.model.commit(available), false);
  assert.equal(h.call('copied', copy, { written: true }), null); assert.equal(h.model.copyText(copy), null);
  assert.equal(h.model.snapshot().presentation.status, 'hidden');
  assert.equal(h.call('close', h.session), true); assert.equal(h.model.candidate(), null);
  h.call('released', h.asr, { stopped: true }); h.call('released', h.writer, { stopped: true });
  assert.equal(h.model.snapshot().coordinator.session, null); assert.equal(h.model.snapshot().revision, 11);
});

test('successful idempotent close/disconnect conservatively invalidate frames; wrong epoch stays rejected', () => {
  const h = setup(); h.start(1); h.call('close', h.session); const old = h.model.sample();
  const revision = h.model.snapshot().revision; assert.equal(h.call('close', h.session), true);
  assert.equal(h.model.snapshot().revision, revision + 1); assert.equal(h.model.commit(old), false);
  assert.equal(h.call('disconnect', 'wrong'), false); assert.equal(h.model.snapshot().revision, revision + 1);
  h.call('disconnect', 'transitions'); const offline = h.model.sample(); const nextRevision = h.model.snapshot().revision;
  h.call('disconnect', 'transitions'); assert.equal(h.model.snapshot().revision, nextRevision + 1);
  assert.equal(h.model.commit(offline), false); h.close();
});

test('delayed commits and callbacks after fresh run cannot relabel old ownership', async () => {
  const h = setup(); h.start(1); h.prepare(); const old = h.model.sample(); const attempt = h.attempt; const writer = h.writer;
  let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => [h.model.commit(old), h.call('result', attempt, writer, 'issued')]);
  h.close(); h.start(2); h.show('listening'); finish(); assert.deepEqual(await pending, [false, false]);
  assert.equal(h.model.snapshot().presentation.status, 'listening'); h.close();
});

test('private models expose no injected mutation route; records are display-only and never copy candidates', () => {
  const h = setup(); h.start(1); h.prepare(); h.call('result', h.attempt, h.writer, 'not-issued'); const frame = h.model.sample();
  assert.ok(Object.isFrozen(frame)); assert.ok(Object.isFrozen(frame.presentation)); assert.deepEqual(Object.keys(h.model), []);
  assert.equal(h.call('requestCopy', frame, { userInitiated: true }), null);
  const foreign = setup(); assert.equal(foreign.model.commit(frame), false);
  const snapshot = h.model.snapshot(); assert.ok(Object.isFrozen(snapshot.coordinator));
  assert.ok(Object.isFrozen(snapshot.coordinator.pending)); assert.ok(Object.isFrozen(snapshot.coordinator.session)); h.close();
});

test('exclusive model remains test-only; evidence preserves authentication and hardware gaps', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-transition-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-transitions.md');
  for (const regex of [/SC-20261114-013/, /ABA/, /唯一入口/, /不操作剪贴板/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, regex);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-frames.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-transitions.md'));
  }
});
