import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';
import { FinalAsrProjection } from '../test-helpers/final-asr-projection.mjs';
import { DictationOutcomeModel } from '../test-helpers/dictation-outcome-model.mjs';

const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
function setup() {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'outcome-epoch' });
  const session = model.reserve(request(1));
  const capture = model.acquire(session, 'capture', 'capture'); const asr = model.acquire(session, 'asr', 'asr');
  model.inputReady(session, capture); model.released(capture, { stopped: true }); model.process(session);
  const projection = new FinalAsrProjection(model, { enabled: true });
  const text = ' 完整合成原文\ne\u0301' + '字'.repeat(8100);
  const receipt = projection.accept(asr, { text }); const writer = model.acquire(session, 'writer', 'writer');
  const outcome = new DictationOutcomeModel(model, projection, { enabled: true });
  return { model, session, asr, projection, text, receipt, writer, outcome };
}
function prepare(h) { const attempt = h.outcome.begin(h.receipt, h.writer); assert.ok(attempt); return attempt; }
function fallback(h) { const attempt = prepare(h); assert.equal(h.outcome.result(attempt, h.writer, 'not-issued'), true); return h.outcome.candidate(); }

test('outcome proposal defaults off and never implicitly dispatches or copies', () => {
  const h = setup(); const off = new DictationOutcomeModel(h.model, h.projection);
  assert.equal(off.begin(h.receipt, h.writer), null);
  assert.deepEqual(off.snapshot(), { status: 'hidden', pasteDisposition: 'unattempted', canCopy: false, copying: false });
  assert.equal(off.requestCopy(null, { userInitiated: true }), null);
});

test('preparation uses original final receipt/writer, is one-shot and does not change view/seq', () => {
  const h = setup(); const foreign = setup(); const before = h.model.snapshot().view;
  for (const [r, w] of [[{}, h.writer], [h.receipt, { ...h.writer }], [h.receipt, foreign.writer], [h.receipt, h.asr]]) {
    assert.equal(h.outcome.begin(r, w), null);
  }
  const attempt = prepare(h); assert.ok(Object.isFrozen(attempt)); assert.deepEqual(attempt, {});
  assert.equal(h.outcome.begin(h.receipt, h.writer), null);
  assert.equal(h.outcome.snapshot().status, 'preparing'); assert.equal(h.outcome.candidate(), null);
  assert.strictEqual(h.model.snapshot().view, before);
});

for (const disposition of ['issued', 'unknown']) test(`${disposition} never claims target acceptance or creates an automatic copy fallback`, () => {
  const h = setup(); const attempt = prepare(h);
  assert.equal(h.outcome.result(attempt, h.writer, disposition), true);
  assert.equal(h.outcome.snapshot().status, disposition === 'issued' ? 'paste-issued' : 'paste-uncertain');
  assert.equal(h.outcome.snapshot().pasteDisposition, disposition);
  assert.equal(h.outcome.candidate(), null); assert.equal(h.outcome.requestCopy({}, { userInitiated: true }), null);
  assert.equal(h.outcome.begin(h.receipt, h.writer), null, 'never resend');
  assert.equal(h.outcome.result(attempt, h.writer, 'not-issued'), false, 'cannot revise result into duplicate-copy fallback');
  assert.equal(h.model.snapshot().pending.length, 2, 'ASR/writer drain remains independent');
});

test('missing/invalid/wrong-owner outcomes do not create fallback or consume the valid result', () => {
  const h = setup(); const attempt = prepare(h); const foreign = setup();
  for (const [a, w, value] of [[{}, h.writer, 'issued'], [attempt, { ...h.writer }, 'issued'],
    [attempt, foreign.writer, 'not-issued'], [attempt, h.writer, undefined], [attempt, h.writer, 'accepted'],
    [attempt, h.writer, false], [attempt, h.writer, 'timeout']]) assert.equal(h.outcome.result(a, w, value), false);
  assert.equal(h.outcome.snapshot().status, 'preparing'); assert.equal(h.outcome.candidate(), null);
  assert.equal(h.outcome.result(attempt, h.writer, 'not-issued'), true);
});

test('only definite not-issued exposes a candidate; copied handles and non-explicit actions reject', () => {
  const h = setup(); const candidate = fallback(h);
  assert.ok(Object.isFrozen(candidate)); assert.deepEqual(candidate, {});
  assert.ok(Object.isFrozen(h.outcome.snapshot()));
  for (const value of [undefined, false, 'true', 1]) assert.equal(h.outcome.requestCopy(candidate, { userInitiated: value }), null);
  assert.equal(h.outcome.requestCopy({ ...candidate }, { userInitiated: true }), null);
  const copy = h.outcome.requestCopy(candidate, { userInitiated: true }); assert.ok(copy);
  assert.equal(h.outcome.snapshot().canCopy, false); assert.equal(h.outcome.requestCopy(candidate, { userInitiated: true }), null);
  assert.equal(h.outcome.copyText({ ...copy }), null);
  assert.equal(h.outcome.copyText(copy), h.text, 'copy candidate is full business text, not 8000-char display');
  assert.ok(h.projection.snapshot().truncated);
});

test('clipboard completion requires strict owner proof; failure needs a fresh explicit action', () => {
  const h = setup(); const candidate = fallback(h); const copy = h.outcome.requestCopy(candidate, { userInitiated: true });
  for (const value of [undefined, null, 1, 'true']) assert.equal(h.outcome.copied(copy, { written: value }), false);
  assert.equal(h.outcome.copied({ ...copy }, { written: true }), false);
  assert.equal(h.outcome.copied(copy, { written: false }), true);
  assert.equal(h.outcome.snapshot().status, 'copy-available'); assert.equal(h.outcome.copyText(copy), null);
  assert.equal(h.outcome.copied(copy, { written: true }), false);
  const retry = h.outcome.requestCopy(candidate, { userInitiated: true }); assert.notEqual(retry, copy);
  assert.equal(h.outcome.copied(retry, { written: true }), true);
  assert.equal(h.outcome.snapshot().status, 'copied'); assert.equal(h.outcome.candidate(), null);
  assert.equal(h.outcome.snapshot().pasteDisposition, 'not-issued', 'clipboard success is not paste/target acceptance');
  assert.equal(h.model.snapshot().pending.length, 2, 'copy result does not release any lease');
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) for (const stage of ['preparing', 'candidate', 'copying']) {
  test(`${terminal} at ${stage} clears text/candidate and rejects delayed results without releasing leases`, () => {
    const h = setup(); const attempt = prepare(h); let candidate; let copy;
    if (stage !== 'preparing') { h.outcome.result(attempt, h.writer, 'not-issued'); candidate = h.outcome.candidate(); }
    if (stage === 'copying') copy = h.outcome.requestCopy(candidate, { userInitiated: true });
    if (terminal === 'disconnect') h.model.disconnect('outcome-epoch'); else h.model.close(h.session, terminal);
    assert.equal(h.outcome.snapshot().status, 'hidden'); assert.equal(h.outcome.candidate(), null);
    assert.equal(h.outcome.copyText(copy), null); assert.equal(h.outcome.copied(copy, { written: true }), false);
    assert.equal(h.outcome.result(attempt, h.writer, 'issued'), false);
    assert.equal(h.outcome.requestCopy(candidate, { userInitiated: true }), null);
    assert.equal(h.model.reserve(request(2)), null); assert.equal(h.model.restart('next'), false);
    h.model.released(h.asr, { stopped: true }); assert.equal(h.model.restart('next'), false);
    h.model.released(h.writer, { stopped: true }); assert.equal(h.model.restart('next'), true);
  });
}

test('cancel after issued retains only honest disposition, never claims retraction or enables copy', () => {
  const h = setup(); h.outcome.result(prepare(h), h.writer, 'issued'); h.model.close(h.session);
  assert.deepEqual(h.outcome.snapshot(), { status: 'hidden', pasteDisposition: 'issued', canCopy: false, copying: false });
});

test('stopped writer before result cannot produce a fallback, while accepted fallback can outlive its lease within the active run', () => {
  const h = setup(); const attempt = prepare(h); h.model.released(h.writer, { stopped: true });
  assert.equal(h.outcome.result(attempt, h.writer, 'not-issued'), false);
  const next = setup(); const candidate = fallback(next);
  next.model.released(next.asr, { stopped: true }); next.model.released(next.writer, { stopped: true });
  assert.equal(next.model.reserve(request(2)), null, 'active candidate keeps run open, not a resource lease');
  const copy = next.outcome.requestCopy(candidate, { userInitiated: true }); assert.ok(copy);
  assert.equal(next.outcome.copyText(copy), next.text);
  next.outcome.dismiss(); next.model.close(next.session, 'end');
  assert.ok(next.model.reserve(request(2)), 'explicit end after drain permits next run');
});

test('dismiss/explicit expiry clears pending copy without adding retries or releasing resources', () => {
  const h = setup(); const candidate = fallback(h); const copy = h.outcome.requestCopy(candidate, { userInitiated: true });
  assert.equal(h.outcome.dismiss(), true); assert.equal(h.outcome.copyText(copy), null);
  assert.equal(h.outcome.copied(copy, { written: true }), false);
  assert.equal(h.outcome.requestCopy(candidate, { userInitiated: true }), null);
  assert.equal(h.outcome.begin(h.receipt, h.writer), null);
  assert.equal(h.model.snapshot().pending.length, 2);
});

test('deferred copy and writer results cannot mutate the next run or fresh epoch with reused IDs', async () => {
  const h = setup(); const candidate = fallback(h); const copy = h.outcome.requestCopy(candidate, { userInitiated: true });
  let finish; const delayed = new Promise(resolve => { finish = resolve; }).then(() => h.outcome.copied(copy, { written: true }));
  h.model.close(h.session); h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true });
  assert.equal(h.model.restart('fresh'), true);
  const session = h.model.reserve(request(1)); const capture = h.model.acquire(session, 'capture', 'capture');
  const asr = h.model.acquire(session, 'asr', 'asr'); h.model.inputReady(session, capture);
  h.model.released(capture, { stopped: true }); h.model.process(session);
  const receipt = h.projection.accept(asr, { text: '新合成结果' }); const w = h.model.acquire(session, 'writer', 'writer');
  const attempt = h.outcome.begin(receipt, w); assert.ok(attempt);
  finish(); assert.equal(await delayed, false);
  assert.equal(h.outcome.requestCopy(candidate, { userInitiated: true }), null);
  assert.equal(h.outcome.snapshot().status, 'preparing');
  h.outcome.result(attempt, w, 'not-issued'); const newCandidate = h.outcome.candidate();
  assert.notEqual(newCandidate, candidate);
  const newCopy = h.outcome.requestCopy(newCandidate, { userInitiated: true });
  assert.equal(h.outcome.copyText(newCopy), '新合成结果');
});

test('source audit and evidence keep real paste guards and model-only limitations', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const paste = read('client/DictationPaste.swift'); const controller = read('client/DictationController.swift');
  assert.match(paste, /guard isCurrent\(\), targetStillMatches\(target\)/);
  assert.match(paste, /guard postPaste\(\) else/); assert.match(paste, /clipboard\.restoreIfUnchanged\(\)/);
  assert.match(controller, /self\.requestID == id/); assert.match(controller, /已发出粘贴/);
  assert.match(controller, /private func copyResult\(\)/); assert.match(controller, /copyText = nil/);
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-outcome-model/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-outcomes.md');
  for (const pattern of [/SC-20261114-009/, /not-issued/, /unknown/, /不等于目标应用接受/, /惰性清理/,
    /不保留跨取消候选/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-final-asr-contract.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-outcomes.md'));
  }
});
