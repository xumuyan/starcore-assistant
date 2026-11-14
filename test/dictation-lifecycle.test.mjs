import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';
import { FinalAsrProjection } from '../test-helpers/final-asr-projection.mjs';
import { DictationOutcomeModel } from '../test-helpers/dictation-outcome-model.mjs';

const request = n => ({ origin: 'right-control', mode: 'dictation',
  requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function permutations(values) {
  return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map(rest => [value, ...rest])) : [[]];
}
function setup(coalesceMeters) {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'lifecycle', coalesceMeters });
  const session = model.reserve(request(1));
  const capture = model.acquire(session, 'capture', 'capture'); const asr = model.acquire(session, 'asr', 'asr');
  const projection = new FinalAsrProjection(model, { enabled: true });
  const outcome = new DictationOutcomeModel(model, projection, { enabled: true });
  assert.deepEqual(projection.snapshot(), { activity: 'hidden', text: '', truncated: false });
  assert.equal(model.inputReady(session, capture), true);
  assert.equal(model.deliver(capture, { type: 'meter', source: 'input', level: 0.8 }), true);
  assert.equal(model.process(session), false, 'capture stop cannot be inferred from meter');
  assert.equal(model.released(capture, { stopped: true }), true);
  assert.equal(model.snapshot().queuedMeters, 0);
  assert.equal(model.process(session), true);
  const writer = model.acquire(session, 'writer', 'writer');
  const text = ' 合成完整正文e\u0301\n' + '字'.repeat(8100);
  return { model, session, asr, writer, projection, outcome, text };
}
function accept(h) {
  const before = h.model.snapshot().view;
  const receipt = h.projection.accept(h.asr, { text: h.text }); assert.ok(receipt);
  assert.ok(h.projection.snapshot().truncated);
  const attempt = h.outcome.begin(receipt, h.writer); assert.ok(attempt);
  assert.strictEqual(h.model.snapshot().view, before, 'projection/outcome allocate no seq');
  return { receipt, attempt };
}
function assertHidden(h) {
  assert.equal(h.projection.snapshot().activity, 'hidden');
  assert.equal(h.projection.snapshot().text, '');
  assert.equal(h.outcome.snapshot().status, 'hidden');
  assert.equal(h.outcome.snapshot().canCopy, false);
  assert.equal(h.outcome.candidate(), null);
}
function nextRun(h, mode, old) {
  const session = h.model.reserve(mode === 'dictation' ? request(2) : { origin: 'wake', mode, requestId: 'wake-next' });
  assert.ok(session); assert.equal(session.run, 2);
  assert.equal(h.model.snapshot().view.active, false, 'reservation is not inputReady');
  assertHidden(h);
  assert.equal(h.projection.accept(h.asr, { text: '迟到合成结果' }), null);
  assert.equal(h.outcome.result(old.attempt, h.writer, 'issued'), false);
  assert.equal(h.outcome.requestCopy(old.candidate, { userInitiated: true }), null);
  assert.equal(h.outcome.copied(old.copy, { written: true }), false);
  assert.equal(h.model.released(h.writer, { stopped: true }), false);
  const capture = h.model.acquire(session, 'capture', 'next-capture');
  const asr = h.model.acquire(session, 'asr', 'next-asr');
  assert.equal(h.model.inputReady(session, capture), true);
  assert.equal(h.model.snapshot().view.activity, 'listening');
  assert.equal(h.model.snapshot().view.text, ''); assert.equal(h.model.snapshot().view.level, 0);
  h.model.released(capture, { stopped: true }); assert.equal(h.model.process(session), true);
  if (mode === 'dictation') {
    const receipt = h.projection.accept(asr, { text: '新回合合成原文' }); assert.ok(receipt);
    const writer = h.model.acquire(session, 'writer', 'next-writer');
    assert.equal(h.projection.writerText(old.receipt, writer), null);
    const attempt = h.outcome.begin(receipt, writer); assert.ok(attempt);
    assert.equal(h.outcome.result(old.attempt, writer, 'not-issued'), false);
    assert.equal(h.outcome.result(attempt, writer, 'not-issued'), true);
    const candidate = h.outcome.candidate(); assert.notEqual(candidate, old.candidate);
    const copy = h.outcome.requestCopy(candidate, { userInitiated: true });
    assert.equal(h.outcome.copyText(copy), '新回合合成原文');
    assert.equal(h.outcome.copyText(old.copy), null);
    h.model.close(session); h.model.released(writer, { stopped: true });
  } else {
    assert.equal(h.projection.accept(asr, { text: '不能借对话做听写' }), null);
    assertHidden(h); h.model.close(session);
  }
  h.model.released(asr, { stopped: true }); assert.equal(h.model.snapshot().session, null);
}

const branches = ['issued', 'unknown', 'candidate', 'copied', 'retry-copied', 'dismissed'];
for (const coalesce of [false, true]) for (const branch of branches) {
  test(`complete lifecycle ${branch}, coalesced=${coalesce}: 12 stop/close/next-mode trajectories`, () => {
    let count = 0;
    for (const order of permutations(['close', 'asr', 'writer'])) for (const mode of ['dictation', 'conversation']) {
      const h = setup(coalesce); const old = accept(h);
      const disposition = ['issued', 'unknown'].includes(branch) ? branch : 'not-issued';
      assert.equal(h.outcome.result(old.attempt, h.writer, disposition), true);
      old.candidate = h.outcome.candidate();
      if (['copied', 'retry-copied'].includes(branch)) {
        old.copy = h.outcome.requestCopy(old.candidate, { userInitiated: true });
        assert.equal(h.outcome.copyText(old.copy), h.text);
        if (branch === 'retry-copied') {
          h.outcome.copied(old.copy, { written: false });
          assert.equal(h.outcome.copyText(old.copy), null);
          old.copy = h.outcome.requestCopy(old.candidate, { userInitiated: true });
        }
        assert.equal(h.outcome.copied(old.copy, { written: true }), true);
      }
      if (branch === 'dismissed') h.outcome.dismiss();
      assert.equal(h.model.reserve(request(2)), null, 'result/copy/dismiss is not end');
      let closed = false; let stopped = 0;
      for (const event of order) {
        if (event === 'close') { assert.equal(h.model.close(h.session, 'end'), true); closed = true; assertHidden(h); }
        else { assert.equal(h.model.released(h[event], { stopped: true }), true); stopped++; }
        if (!closed || stopped !== 2) {
          assert.equal(h.model.reserve(request(2)), null);
          assert.equal(h.model.restart('premature'), false);
        }
        if (!closed && branch === 'candidate') {
          assert.equal(h.outcome.candidate(), old.candidate, 'stopped does not consume a live-run candidate');
        }
      }
      assert.equal(h.model.snapshot().session, null); nextRun(h, mode, old); count++;
    }
    assert.equal(count, 12);
  });
}

for (const coalesce of [false, true]) for (const disposition of ['issued', 'not-issued', 'unknown']) {
  test(`all final/result/stop/close orders: ${disposition}, coalesced=${coalesce} (120 trajectories)`, () => {
    let count = 0;
    for (const order of permutations(['final', 'result', 'asr', 'writer', 'close'])) {
      const h = setup(coalesce); let closed = false; let asrStopped = false; let writerStopped = false;
      let receipt = null; let attempt = null; let acceptedFinal = false; let acceptedResult = false;
      for (const event of order) {
        const before = h.model.snapshot().view;
        if (event === 'final') {
          receipt = h.projection.accept(h.asr, { text: h.text });
          acceptedFinal = !closed && !asrStopped; assert.equal(receipt !== null, acceptedFinal);
          attempt = h.outcome.begin(receipt, h.writer);
          assert.equal(attempt !== null, acceptedFinal && !writerStopped);
        } else if (event === 'result') {
          acceptedResult = !closed && !writerStopped && attempt !== null;
          assert.equal(h.outcome.result(attempt, h.writer, disposition), acceptedResult);
        } else if (event === 'close') {
          assert.equal(h.model.close(h.session, 'end'), true); closed = true;
        } else {
          assert.equal(h.model.released(h[event], { stopped: true }), true);
          if (event === 'asr') asrStopped = true; else writerStopped = true;
        }
        if (event !== 'close') assert.strictEqual(h.model.snapshot().view, before, 'business events/stopped allocate no seq');
        assert.equal(h.outcome.candidate() !== null, !closed && acceptedResult && disposition === 'not-issued');
        if (closed) assertHidden(h);
        if (!(closed && asrStopped && writerStopped)) {
          assert.equal(h.model.reserve(request(2)), null); assert.equal(h.model.restart('blocked'), false);
        }
      }
      assert.equal(h.model.snapshot().session, null); assertHidden(h);
      assert.equal(h.projection.writerText(receipt, h.writer), null);
      assert.equal(h.outcome.result(attempt, h.writer, disposition), false);
      assert.ok(h.model.reserve(request(2))); count++;
    }
    assert.equal(count, 120);
  });
}

test('composition gap stays explicit: outcome dismiss/issued does not clear the independent final projection', () => {
  for (const branch of ['issued', 'unknown', 'dismiss']) {
    const h = setup(false); const { receipt, attempt } = accept(h);
    if (branch === 'dismiss') h.outcome.dismiss(); else h.outcome.result(attempt, h.writer, branch);
    assert.equal(h.projection.snapshot().activity, 'final-ready', 'no imaginary global cleanup');
    assert.equal(h.projection.writerText(receipt, h.writer), h.text, 'existing projection contract still holds original');
    assert.equal(h.outcome.begin(receipt, h.writer), null, 'same outcome cannot resend');
    h.model.close(h.session); assertHidden(h);
    h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true });
  }
});

test('deferred copy callback after close cannot mutate a prepared next run in the same epoch', async () => {
  const h = setup(true); const old = accept(h); h.outcome.result(old.attempt, h.writer, 'not-issued');
  old.candidate = h.outcome.candidate(); old.copy = h.outcome.requestCopy(old.candidate, { userInitiated: true });
  let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => h.outcome.copied(old.copy, { written: true }));
  h.model.close(h.session); h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true });
  const session = h.model.reserve(request(2)); const capture = h.model.acquire(session, 'capture', 'new-capture');
  const asr = h.model.acquire(session, 'asr', 'new-asr'); h.model.inputReady(session, capture);
  h.model.released(capture, { stopped: true }); h.model.process(session);
  const receipt = h.projection.accept(asr, { text: '新合成结果' }); const writer = h.model.acquire(session, 'writer', 'new-writer');
  assert.ok(h.outcome.begin(receipt, writer)); finish(); assert.equal(await pending, false);
  assert.equal(h.outcome.snapshot().status, 'preparing'); h.model.close(session);
  h.model.released(asr, { stopped: true }); h.model.released(writer, { stopped: true }); assertHidden(h);
});

test('disconnect with one missing stop never turns copy completion into reconnect or lease release', () => {
  const h = setup(true); const old = accept(h); h.outcome.result(old.attempt, h.writer, 'not-issued');
  const copy = h.outcome.requestCopy(h.outcome.candidate(), { userInitiated: true });
  h.model.disconnect('lifecycle'); h.model.released(h.writer, { stopped: true });
  for (let i = 0; i < 50; i++) {
    assert.equal(h.outcome.copied(copy, { written: true }), false);
    assert.equal(h.model.restart(`blocked-${i}`), false); assert.equal(h.model.reserve(request(2)), null);
  }
  assertHidden(h); h.model.released(h.asr, { stopped: true });
  assert.equal(h.model.reserve(request(2)), null, 'drain is not reconnect');
  assert.equal(h.model.restart('reconnected'), true);
  const session = h.model.reserve(request(1)); assert.ok(session); assert.equal(session.run, 1); assertHidden(h);
});

test('lifecycle evidence preserves independent-projection and real acceptance boundaries', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-dictation-lifecycle.md');
  for (const pattern of [/SC-20261114-010/, /144 条/, /720 条/, /独立投影仍保留/, /不是统一展示仲裁器/,
    /T0 未验收、T1 未启动/, /G1～G6 仍未验收/, /不操作剪贴板/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-outcomes.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-lifecycle.md'));
  }
});
