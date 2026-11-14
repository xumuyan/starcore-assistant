import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { selectDictationPresentation as select } from '../test-helpers/dictation-presentation.mjs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';
import { FinalAsrProjection } from '../test-helpers/final-asr-projection.mjs';
import { DictationOutcomeModel } from '../test-helpers/dictation-outcome-model.mjs';
const request = n => ({ origin: 'right-control', mode: 'dictation', requestId: `12345678-1234-1234-1234-${String(n).padStart(12, '0')}` });
const empty = { status: 'hidden', text: '', truncated: false, level: 0, showOrbs: false, canCopy: false };
function setup() {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'presentation' });
  const session = model.reserve(request(1));
  const capture = model.acquire(session, 'capture', 'capture'); const asr = model.acquire(session, 'asr', 'asr');
  const projection = new FinalAsrProjection(model, { enabled: true });
  const outcome = new DictationOutcomeModel(model, projection, { enabled: true });
  const text = '最终合成正文e\u0301' + '字'.repeat(8100);
  const h = { model, session, capture, asr, projection, outcome, text };
  h.frame = (dismissedSession = null) => ({ enabled: true, coordinator: model.snapshot(),
    final: { session, value: projection.snapshot() }, outcome: { session, value: outcome.snapshot() }, dismissedSession });
  h.process = () => { model.inputReady(session, capture); model.released(capture, { stopped: true }); model.process(session); };
  h.ready = () => projection.accept(asr, { text });
  h.prepare = () => { const receipt = h.ready(); h.writer = model.acquire(session, 'writer', 'writer');
    h.receipt = receipt; h.attempt = outcome.begin(receipt, h.writer); assert.ok(h.attempt); };
  return h;
}
function assertStatus(frame, status, text = '', truncated = false, level = 0, canCopy = false) {
  const actual = select(frame);
  assert.deepEqual(actual, { status, text, truncated, level, showOrbs: status === 'thinking', canCopy });
  assert.ok(Object.isFrozen(actual)); return actual;
}

test('defaults disabled; preparing/reservation is not listening; closed/disconnected override all content', () => {
  assert.deepEqual(select(), empty);
  const h = setup(); assertStatus(h.frame(), 'hidden'); h.process(); h.prepare();
  const frame = h.frame(); assertStatus({ ...frame, enabled: false }, 'hidden');
  assertStatus({ ...frame, enabled: 'true' }, 'hidden');
  h.model.disconnect('presentation'); assertStatus(h.frame(), 'hidden');
});

test('listening shows only view text/level, ignores final/outcome branch and never shows orbs', () => {
  const h = setup(); h.model.inputReady(h.session, h.capture);
  h.model.deliver(h.asr, { type: 'transcript', text: '合成收音快照' });
  h.model.deliver(h.capture, { type: 'meter', source: 'input', level: 0.65 });
  assertStatus({ ...h.frame(), final: undefined, outcome: undefined }, 'listening', '合成收音快照', false, 0.65);
  assertStatus(h.frame(h.session), 'hidden');
});

test('thinking clears stale listening text; final-ready supersedes processing and turns off orbs', () => {
  const h = setup(); h.model.inputReady(h.session, h.capture);
  h.model.deliver(h.asr, { type: 'transcript', text: '不应继续显示的收音快照' });
  h.model.released(h.capture, { stopped: true }); h.model.process(h.session);
  assertStatus(h.frame(), 'thinking'); h.ready();
  const display = h.projection.snapshot(); assertStatus(h.frame(), 'final-ready', display.text, true);
  assert.equal(h.model.snapshot().view.activity, 'thinking', 'selector never rewrites reducer');
});

for (const disposition of ['issued', 'unknown', 'not-issued']) {
  test(`writer ${disposition} supersedes final-ready; only definite non-issue shows copy`, () => {
    const h = setup(); h.process(); h.prepare();
    const display = h.projection.snapshot(); assertStatus(h.frame(), 'preparing', display.text, true);
    h.outcome.result(h.attempt, h.writer, disposition);
    const status = { issued: 'paste-issued', unknown: 'paste-uncertain', 'not-issued': 'copy-available' }[disposition];
    assertStatus(h.frame(), status, disposition === 'not-issued' ? display.text : '', disposition === 'not-issued', 0, disposition === 'not-issued');
    assert.equal(h.projection.snapshot().text, display.text, 'hidden content is not deletion of original projection');
    assert.equal(h.model.reserve(request(2)), null, 'terminal display is not end/drain');
  });
}

test('copying disables copy affordance; failure re-enables explicit action; copied clears display text', () => {
  const h = setup(); h.process(); h.prepare(); h.outcome.result(h.attempt, h.writer, 'not-issued');
  const candidate = h.outcome.candidate(); let copy = h.outcome.requestCopy(candidate, { userInitiated: true });
  const display = h.projection.snapshot(); assertStatus(h.frame(), 'copying', display.text, true);
  h.outcome.copied(copy, { written: false }); assertStatus(h.frame(), 'copy-available', display.text, true, 0, true);
  copy = h.outcome.requestCopy(candidate, { userInitiated: true }); h.outcome.copied(copy, { written: true });
  assertStatus(h.frame(), 'copied'); assert.equal(h.projection.snapshot().activity, 'final-ready');
  assert.equal(h.model.snapshot().pending.length, 2);
});

test('oversized first grapheme yields visible final status with empty text and truncated marker', () => {
  const h = setup(); h.process(); const receipt = h.projection.accept(h.asr, { text: 'a' + '\u0301'.repeat(8000) });
  assert.ok(receipt); assertStatus(h.frame(), 'final-ready', '', true);
});

test('explicit dismissedSession hides whole run presentation without end, deletion or resource release', () => {
  const h = setup(); h.process(); h.prepare(); h.outcome.dismiss();
  // Preparing dismissal is indistinguishable from a never-started hidden outcome.
  assertStatus(h.frame(), 'final-ready', h.projection.snapshot().text, true);
  assertStatus(h.frame(h.session), 'hidden');
  assertStatus(h.frame({ ...h.session }), 'final-ready', h.projection.snapshot().text, true);
  assert.equal(h.projection.writerText(h.receipt, h.writer), h.text);
  assert.equal(h.model.snapshot().pending.length, 2); assert.equal(h.model.reserve(request(2)), null);
});

for (const disposition of ['issued', 'unknown', 'not-issued']) test(`dismissed ${disposition} outcome never resurrects final even without explicit marker`, () => {
  const h = setup(); h.process(); h.prepare(); h.outcome.result(h.attempt, h.writer, disposition); h.outcome.dismiss();
  assert.equal(h.projection.snapshot().activity, 'final-ready'); assertStatus(h.frame(), 'hidden');
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) test(`${terminal} wins over retained stale snapshots and dismissal does not reopen`, () => {
  const h = setup(); h.process(); h.prepare(); const old = h.frame();
  if (terminal === 'disconnect') h.model.disconnect('presentation'); else h.model.close(h.session, terminal);
  assertStatus({ ...old, coordinator: h.model.snapshot() }, 'hidden');
  h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true });
  assertStatus(h.frame(), 'hidden');
});

test('copied/stale/missing session envelopes or mixed epoch/run/phase fail closed', () => {
  const h = setup(); h.process(); h.prepare(); const frame = h.frame();
  for (const altered of [
    { ...frame, final: undefined }, { ...frame, outcome: undefined },
    { ...frame, final: { ...frame.final, session: { ...h.session } } },
    { ...frame, outcome: { ...frame.outcome, session: { ...h.session } } },
    { ...frame, coordinator: { ...frame.coordinator, epoch: 'other' } },
    { ...frame, coordinator: { ...frame.coordinator, view: { ...frame.coordinator.view, run: 2 } } },
    { ...frame, coordinator: { ...frame.coordinator, view: { ...frame.coordinator.view, phase: 'speaking' } } },
    { ...frame, coordinator: { ...frame.coordinator, view: { ...frame.coordinator.view, mode: 'conversation' } } },
  ]) assertStatus(altered, 'hidden');
});

test('malformed final/outcome and impossible terminal pairs never become thinking or copy-ready', () => {
  const h = setup(); h.process(); h.prepare(); const frame = h.frame();
  for (const value of [null, { activity: 'final-ready', text: '字'.repeat(8001), truncated: true },
    { activity: 'final-ready', text: '字\ud800', truncated: false },
    { activity: 'final-ready', text: '字', truncated: 'true' }, { activity: 'hidden', text: '泄漏', truncated: false }]) {
    assertStatus({ ...frame, final: { session: h.session, value } }, 'hidden');
  }
  for (const value of [null, { status: 'inserted', pasteDisposition: 'issued', canCopy: false, copying: false },
    { status: 'copy-available', pasteDisposition: 'unknown', canCopy: true, copying: false },
    { status: 'copying', pasteDisposition: 'not-issued', canCopy: true, copying: true },
    { status: 'paste-issued', pasteDisposition: 'issued', canCopy: true, copying: false }]) {
    assertStatus({ ...frame, outcome: { session: h.session, value } }, 'hidden');
  }
  assertStatus({ ...frame, final: { session: h.session, value: { activity: 'hidden', text: '', truncated: false } } }, 'hidden');
});

test('new session/epoch rejects old frame envelopes and ignores prior dismissal', () => {
  const h = setup(); h.process(); h.prepare(); const old = h.frame(h.session);
  h.model.close(h.session); h.model.released(h.asr, { stopped: true }); h.model.released(h.writer, { stopped: true });
  h.model.restart('fresh'); const session = h.model.reserve(request(1));
  const capture = h.model.acquire(session, 'capture', 'capture'); const asr = h.model.acquire(session, 'asr', 'asr');
  h.model.inputReady(session, capture); h.model.released(capture, { stopped: true }); h.model.process(session);
  assertStatus({ ...old, coordinator: h.model.snapshot() }, 'hidden');
  h.projection.accept(asr, { text: '新合成结果' });
  const frame = { ...old, coordinator: h.model.snapshot(), final: { session, value: h.projection.snapshot() },
    outcome: { session, value: h.outcome.snapshot() } };
  assertStatus(frame, 'final-ready', '新合成结果');
  const before = JSON.stringify(frame); for (let i = 0; i < 10; i++) select(frame);
  assert.equal(JSON.stringify(frame), before, 'selector is pure and retains no state');
});

test('conversation remains outside dictation selector rather than hiding or changing existing conversation UI', () => {
  const h = setup(); const frame = h.frame();
  assertStatus({ ...frame, coordinator: { ...frame.coordinator, session: { ...h.session, mode: 'conversation' } } }, 'hidden');
});

test('presentation shape contains no payload handles/business text and cannot authorize copy', () => {
  const h = setup(); h.process(); h.prepare(); h.outcome.result(h.attempt, h.writer, 'not-issued');
  const shown = select(h.frame());
  assert.deepEqual(Object.keys(shown).sort(), ['canCopy', 'level', 'showOrbs', 'status', 'text', 'truncated']);
  assert.ok(shown.text.length <= 8000); assert.notEqual(shown.text, h.text);
  assert.equal(h.outcome.requestCopy(shown, { userInitiated: true }), null);
  const before = h.model.snapshot(); const final = h.projection.snapshot(); const outcome = h.outcome.snapshot();
  for (let i = 0; i < 50; i++) assert.deepEqual(select(h.frame()), shown);
  assert.deepEqual(h.model.snapshot(), before); assert.strictEqual(h.projection.snapshot(), final);
  assert.deepEqual(h.outcome.snapshot(), outcome);
});

test('32 priority combinations never emit two primary states or orbs after a writer result', () => {
  const h = setup(); h.process(); h.ready(); const frame = h.frame();
  const outcomes = [
    ['hidden', 'unattempted'], ['preparing', 'unattempted'], ['paste-issued', 'issued'],
    ['paste-uncertain', 'unknown'], ['copy-available', 'not-issued'], ['copying', 'not-issued'],
    ['copied', 'not-issued'], ['hidden', 'not-issued'],
  ];
  let count = 0;
  for (const [status, pasteDisposition] of outcomes) for (const ready of [false, true]) for (const dismissed of [false, true]) {
    const value = { status, pasteDisposition, canCopy: status === 'copy-available', copying: status === 'copying' };
    const sample = { ...frame, final: { session: h.session, value: ready ? frame.final.value : { activity: 'hidden', text: '', truncated: false } },
      outcome: { session: h.session, value }, dismissedSession: dismissed ? h.session : null };
    const expected = dismissed ? 'hidden' : status === 'hidden'
      ? pasteDisposition === 'unattempted' ? ready ? 'final-ready' : 'thinking' : 'hidden'
      : ready ? status : 'hidden';
    const shown = select(sample); assert.equal(shown.status, expected);
    assert.equal(shown.showOrbs, expected === 'thinking'); assert.equal(shown.level, 0);
    assert.equal(shown.canCopy, expected === 'copy-available'); count++;
  }
  assert.equal(count, 32);
});

test('an entirely stale same-session frame cannot discover later close; latest coordinator is mandatory', () => {
  const h = setup(); h.process(); h.prepare(); const old = h.frame();
  h.model.close(h.session);
  assertStatus(old, 'preparing', old.final.value.text, true, 0, false);
  assertStatus({ ...old, coordinator: h.model.snapshot() }, 'hidden');
  // Frozen local values are not a live subscription or freshness certificate.
  assert.equal(h.model.snapshot().closing, true);
});

test('selector remains test-only and evidence states snapshot freshness/dismissal limitations', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => { for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) scan(child);
    else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /dictation-presentation/);
  } };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-dictation-presentation.md');
  for (const pattern of [/SC-20261114-011/, /dismissedSession/, /同 session 旧快照/, /不授予复制权限/,
    /T0 未验收、T1 未启动/, /G1～G6 仍未验收/, /不操作剪贴板/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-dictation-lifecycle.md']) {
    assert.ok(read(path).includes('2026-11-14-dictation-presentation.md'));
  }
});
