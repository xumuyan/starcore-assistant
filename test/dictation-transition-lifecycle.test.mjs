import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DictationTransitionModel } from '../test-helpers/dictation-transition-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const permutations = values => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [v, ...rest])) : [[]];
function harness(coalesceMeters, maxRevision) {
  const model = new DictationTransitionModel({ enabled: true, epoch: 'matrix', coalesceMeters, maxRevision });
  const h = { model, text: ' 合成正文e\u0301\n' + '字'.repeat(8100) };
  // Expected acceptance is supplied by the trajectory oracle, not inferred from return values.
  h.step = (accepted, command, ...args) => {
    const before = model.snapshot(); const frame = model.sample();
    const result = model.dispatch(command, ...args);
    assert.equal(result !== null && result !== false && result !== undefined, accepted, command);
    assert.equal(model.snapshot().revision, Math.min(before.revision + Number(accepted), maxRevision ?? Number.MAX_SAFE_INTEGER), command);
    if (accepted) {
      assert.equal(model.commit(frame), false, `${command}: old frame invalidated`);
      assert.equal(model.snapshot().presentation.status, 'hidden');
    } else if (frame) assert.equal(model.commit(frame), true, `${command}: rejection preserves frame`);
    return result;
  };
  h.show = status => {
    const frame = model.sample(); assert.ok(frame); assert.equal(frame.presentation.status, status);
    assert.ok(model.commit(frame)); return frame;
  };
  h.prepare = () => {
    h.session = h.step(true, 'reserve', request(1)); h.show('hidden');
    h.capture = h.step(true, 'acquire', h.session, 'capture', 'capture');
    h.asr = h.step(true, 'acquire', h.session, 'asr', 'asr');
    h.step(true, 'inputReady', h.session, h.capture); h.show('listening');
    h.step(true, 'deliver', h.capture, { type: 'meter', source: 'input', level: 0.7 });
    h.step(false, 'process', h.session);
    h.step(true, 'released', h.capture, { stopped: true });
    assert.equal(model.snapshot().coordinator.queuedMeters, 0);
    h.step(true, 'process', h.session); h.show('thinking');
    h.writer = h.step(true, 'acquire', h.session, 'writer', 'writer');
  };
  return h;
}
function final(h) {
  h.receipt = h.step(true, 'final', h.asr, { text: h.text }); const frame = h.show('final-ready');
  assert.ok(frame.presentation.truncated); assert.ok(frame.presentation.text.length <= 8000);
  h.attempt = h.step(true, 'begin', h.receipt, h.writer); h.show('preparing');
}
function nextRun(h, mode, old) {
  const session = h.step(true, 'reserve', mode === 'dictation' ? request(2) : { origin: 'wake', mode, requestId: 'next-wake' });
  h.show('hidden'); assert.equal(h.model.snapshot().coordinator.view.active, false);
  h.step(false, 'hide', old.session); h.step(false, 'final', old.asr, { text: '迟到合成值' });
  h.step(false, 'result', old.attempt, old.writer, 'issued');
  h.step(false, 'requestCopy', old.candidate, { userInitiated: true });
  h.step(false, 'copied', old.copy, { written: true });
  assert.equal(h.model.commit(old.frame), false);
  const capture = h.step(true, 'acquire', session, 'capture', 'next-capture');
  const asr = h.step(true, 'acquire', session, 'asr', 'next-asr');
  h.step(true, 'inputReady', session, capture); h.show(mode === 'dictation' ? 'listening' : 'hidden');
  assert.equal(h.model.snapshot().coordinator.view.activity, 'listening');
  assert.equal(h.model.snapshot().coordinator.view.text, '');
  h.step(true, 'released', capture, { stopped: true }); h.step(true, 'process', session);
  if (mode === 'dictation') {
    const receipt = h.step(true, 'final', asr, { text: '独立新轮合成值' });
    const writer = h.step(true, 'acquire', session, 'writer', 'next-writer');
    h.step(false, 'begin', old.receipt, writer);
    const attempt = h.step(true, 'begin', receipt, writer); h.show('preparing');
    h.step(true, 'result', attempt, writer, 'not-issued'); h.show('copy-available');
    h.step(true, 'close', session); h.step(true, 'released', writer, { stopped: true });
  } else { h.step(false, 'final', asr, { text: '不能借用对话' }); h.show('hidden'); h.step(true, 'close', session); }
  h.step(true, 'released', asr, { stopped: true }); assert.equal(h.model.snapshot().coordinator.session, null);
}
const branches = ['issued', 'unknown', 'candidate', 'copied', 'retry-copied', 'dismissed'];
for (const coalesce of [false, true]) for (const branch of branches) test(`transition full lifecycle ${branch}, coalesced=${coalesce}: 12 trajectories`, () => {
  let count = 0;
  for (const order of permutations(['close', 'asr', 'writer'])) for (const mode of ['dictation', 'conversation']) {
    const h = harness(coalesce); h.prepare(); final(h);
    h.step(true, 'result', h.attempt, h.writer, ['issued', 'unknown'].includes(branch) ? branch : 'not-issued');
    const old = { ...h, candidate: h.model.candidate(), copy: null };
    let status = branch === 'issued' ? 'paste-issued' : branch === 'unknown' ? 'paste-uncertain' : 'copy-available';
    h.show(status);
    if (['copied', 'retry-copied'].includes(branch)) {
      old.copy = h.step(true, 'requestCopy', old.candidate, { userInitiated: true }); h.show('copying');
      assert.equal(h.model.copyText(old.copy), h.text, 'copy retains full untruncated original');
      if (branch === 'retry-copied') {
        h.step(true, 'copied', old.copy, { written: false }); h.show('copy-available');
        assert.equal(h.model.copyText(old.copy), null);
        old.copy = h.step(true, 'requestCopy', old.candidate, { userInitiated: true });
      }
      h.step(true, 'copied', old.copy, { written: true }); status = 'copied';
    }
    if (branch === 'dismissed') { h.step(true, 'dismiss'); status = 'hidden'; }
    old.frame = h.show(status); let closed = false; let stops = 0;
    for (const event of order) {
      if (event === 'close') { h.step(true, 'close', h.session, 'end'); closed = true; }
      else { h.step(true, 'released', h[event], { stopped: true }); stops++; }
      h.show(closed ? 'hidden' : status);
      if (!closed || stops < 2) { h.step(false, 'reserve', request(2)); h.step(false, 'restart', 'blocked'); }
      if (!closed && branch === 'candidate') assert.equal(h.model.candidate(), old.candidate);
    }
    assert.equal(h.model.snapshot().coordinator.session, null); nextRun(h, mode, old); count++;
  }
  assert.equal(count, 12);
});

for (const coalesce of [false, true]) for (const disposition of ['issued', 'not-issued', 'unknown']) test(`transition reorder ${disposition}, coalesced=${coalesce}: 120 trajectories`, () => {
  let count = 0;
  for (const order of permutations(['final', 'result', 'asr', 'writer', 'close'])) {
    const h = harness(coalesce); h.text = '短合成正文'; h.prepare();
    let closed = false; let asrStopped = false; let writerStopped = false; let hasFinal = false; let hasAttempt = false; let hasResult = false;
    for (const event of order) {
      if (event === 'final') {
        hasFinal = !closed && !asrStopped; h.receipt = h.step(hasFinal, 'final', h.asr, { text: h.text });
        hasAttempt = hasFinal && !writerStopped; h.attempt = h.step(hasAttempt, 'begin', h.receipt, h.writer);
      } else if (event === 'result') {
        hasResult = !closed && !writerStopped && hasAttempt;
        h.step(hasResult, 'result', h.attempt, h.writer, disposition);
      } else if (event === 'close') { h.step(true, 'close', h.session); closed = true; }
      else { h.step(true, 'released', h[event], { stopped: true }); if (event === 'asr') asrStopped = true; else writerStopped = true; }
      const status = closed ? 'hidden' : hasResult ? { issued: 'paste-issued', 'not-issued': 'copy-available', unknown: 'paste-uncertain' }[disposition]
        : hasAttempt ? 'preparing' : hasFinal ? 'final-ready' : 'thinking';
      h.show(status); assert.equal(h.model.candidate() !== null, !closed && hasResult && disposition === 'not-issued');
      if (!(closed && asrStopped && writerStopped)) h.step(false, 'reserve', request(2));
    }
    assert.equal(h.model.snapshot().coordinator.session, null); assert.ok(h.step(true, 'reserve', request(2)));
    // Drain even the hidden next reservation: no test leaves an occupied session.
    const next = h.model.snapshot().coordinator.session; h.step(true, 'close', next); count++;
  }
  assert.equal(count, 120);
});

for (const coalesce of [false, true]) test(`revision exhaustion at every prefix with six cleanup orders, coalesced=${coalesce}: 96 trajectories`, () => {
  let count = 0;
  for (let max = 1; max <= 16; max++) for (const order of permutations(['close', 'asr', 'writer'])) {
    const h = harness(coalesce, max); let session; let capture; let asr; let writer; let receipt; let attempt; let copy;
    const operations = [
      ['reserve', () => [request(1)], value => { session = value; }],
      ['acquire', () => [session, 'capture', 'capture'], value => { capture = value; }],
      ['acquire', () => [session, 'asr', 'asr'], value => { asr = value; }],
      ['inputReady', () => [session, capture]],
      ['deliver', () => [capture, { type: 'meter', source: 'input', level: 0.3 }]],
      ['deliver', () => [capture, { type: 'meter', source: 'input', level: 0.9 }]],
      ['released', () => [capture, { stopped: true }]],
      ['process', () => [session]],
      ['acquire', () => [session, 'writer', 'writer'], value => { writer = value; }],
      ['final', () => [asr, { text: '耗尽轨迹合成正文' }], value => { receipt = value; }],
      ['begin', () => [receipt, writer], value => { attempt = value; }],
      ['result', () => [attempt, writer, 'not-issued']],
      ['requestCopy', () => [h.model.candidate(), { userInitiated: true }], value => { copy = value; }],
      ['copied', () => [copy, { written: false }]],
      ['requestCopy', () => [h.model.candidate(), { userInitiated: true }], value => { copy = value; }],
      ['copied', () => [copy, { written: true }]],
    ];
    for (const [command, args, save] of operations.slice(0, max)) { const value = h.step(true, command, ...args()); save?.(value); }
    assert.equal(h.model.snapshot().revision, max); assert.equal(h.model.sample(), null);
    assert.equal(h.model.snapshot().presentation.status, 'hidden'); assert.equal(h.model.copyText(copy), null);
    h.step(false, 'result', attempt, writer, 'issued'); h.step(false, 'reserve', request(2));
    if (capture && h.model.snapshot().coordinator.pending.includes(capture)) h.step(true, 'released', capture, { stopped: true });
    let closed = false;
    for (const event of order) {
      if (event === 'close') { h.step(true, 'close', session); closed = true; }
      else {
        const ticket = event === 'asr' ? asr : writer;
        if (ticket) {
          h.step(false, 'released', { ...ticket }, { stopped: true });
          assert.ok(h.model.snapshot().coordinator.pending.includes(ticket));
          h.step(true, 'released', ticket, { stopped: true });
        }
      }
      if (!closed || h.model.snapshot().coordinator.pending.length) assert.notEqual(h.model.snapshot().coordinator.session, null);
    }
    assert.equal(h.model.snapshot().coordinator.session, null); assert.equal(h.model.snapshot().revision, max);
    h.step(false, 'restart', 'cannot-reset'); count++;
  }
  assert.equal(count, 96);
});

test('matrix evidence distinguishes assumptions from hardware acceptance', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const doc = read('docs/verification/2026-11-14-dictation-transition-lifecycle.md');
  for (const pattern of [/SC-20261114-014/, /144 条/, /720 条/, /192 条/, /不是硬件证明/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-transitions.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-transition-lifecycle.md'));
  }
});
