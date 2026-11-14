import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FinalAsrProjection } from '../test-helpers/final-asr-projection.mjs';
import { VoiceCoordinatorModel } from '../test-helpers/voice-coordinator-model.mjs';

const request = number => ({ origin: 'right-control', mode: 'dictation',
  requestId: `12345678-1234-1234-1234-${String(number).padStart(12, '0')}` });
function setup({ mode = 'dictation', process = true, enabled = true } = {}) {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'asr-epoch' });
  const session = model.reserve(mode === 'dictation' ? request(1) : { origin: 'wake', mode, requestId: 'wake-1' });
  const capture = model.acquire(session, 'capture', 'capture-1');
  const asr = model.acquire(session, 'asr', 'asr-1');
  const projection = new FinalAsrProjection(model, { enabled });
  assert.equal(model.inputReady(session, capture), true);
  if (process) { model.released(capture, { stopped: true }); assert.equal(model.process(session), true); }
  return { model, session, capture, asr, projection };
}
function writer(h, operationId = 'writer-1') { return h.model.acquire(h.session, 'writer', operationId); }
const result = text => ({ text });
const hidden = { activity: 'hidden', text: '', truncated: false };

test('proposal defaults off even with an active processing dictation', () => {
  const h = setup(); const off = new FinalAsrProjection(h.model);
  assert.equal(off.accept(h.asr, result('合成最终文字')), null);
  assert.deepEqual(off.snapshot(), hidden);
});

test('final ASR has an independent ready display without reviving input or changing reducer seq', () => {
  const h = setup(); const before = h.model.snapshot().view;
  const receipt = h.projection.accept(h.asr, result('合成最终文字'));
  assert.ok(receipt); assert.deepEqual(receipt, {}); assert.ok(Object.isFrozen(receipt));
  assert.deepEqual(h.projection.snapshot(), { activity: 'final-ready', text: '合成最终文字', truncated: false });
  assert.ok(Object.isFrozen(h.projection.snapshot()));
  assert.strictEqual(h.model.snapshot().view, before);
  assert.equal(h.model.deliver(h.asr, { type: 'transcript', text: '仍不可硬塞' }), false);
  assert.equal(h.projection.writerText(receipt, writer(h)), '合成最终文字');
});

test('preparing and listening results reject; process still requires capture stop', () => {
  const h = setup({ process: false }); const text = result('合成文字');
  assert.equal(h.projection.accept(h.asr, text), null);
  assert.equal(h.model.process(h.session), false);
  assert.equal(h.projection.accept(h.asr, text), null);
  h.model.released(h.capture, { stopped: true }); assert.equal(h.model.process(h.session), true);
  assert.ok(h.projection.accept(h.asr, text));
  const m = new VoiceCoordinatorModel({ enabled: true, epoch: 'preparing' }); const s = m.reserve(request(1));
  const asr = m.acquire(s, 'asr', 'preparing-asr');
  assert.equal(new FinalAsrProjection(m, { enabled: true }).accept(asr, text), null);
});

test('conversation cannot use the dictation final-result proposal or overwrite a reply', () => {
  const h = setup({ mode: 'conversation' }); const chat = h.model.acquire(h.session, 'chat', 'chat');
  assert.equal(h.projection.accept(h.asr, result('不能作为听写结果')), null);
  h.model.deliver(chat, { type: 'reply', text: '合成回复' });
  assert.equal(h.projection.accept(h.asr, result('不能覆盖回复')), null);
  assert.equal(h.model.snapshot().view.text, '合成回复');
});

test('only original current ASR owns result; copied/foreign/writer/missing owners reject', () => {
  const h = setup(); const foreign = setup(); const w = writer(h);
  for (const ticket of [null, undefined, {}, { ...h.asr }, foreign.asr, w, h.capture]) {
    assert.equal(h.projection.accept(ticket, result('不可信合成结果')), null);
    assert.deepEqual(h.projection.snapshot(), hidden);
  }
  assert.ok(h.projection.accept(h.asr, { text: '可信合成结果', run: 999, seq: 999, mode: 'conversation' }));
  assert.equal(h.model.snapshot().view.seq, 1, 'payload identity ignored, projection does not assign view seq');
});

test('bad/oversized/empty/none/malformed results do not consume the one-shot acceptance', () => {
  const h = setup(); const before = h.model.snapshot().view;
  for (const value of [null, {}, result(null), result(42), result(''), result(' \n '), result('NONE'),
    result('...😀'), result('字'.repeat(16001)), result('字\ud800'), result('\udc00字')]) {
    assert.equal(h.projection.accept(h.asr, value), null);
    assert.deepEqual(h.projection.snapshot(), hidden); assert.strictEqual(h.model.snapshot().view, before);
  }
  assert.ok(h.projection.accept(h.asr, result('0')));
});

for (const length of [7999, 8000, 8001, 16000]) test(`UTF-16 boundaries preserve full writer payload at ${length}`, () => {
  const h = setup(); const text = '字'.repeat(length); const receipt = h.projection.accept(h.asr, result(text));
  assert.ok(receipt); const display = h.projection.snapshot();
  assert.equal(display.text, text.slice(0, 8000));
  assert.equal(display.truncated, length > 8000);
  assert.equal(h.projection.writerText(receipt, writer(h)), text);
});

for (const cluster of ['😀', 'e\u0301', '👩‍👩‍👧‍👦', '🇨🇳', 'a' + '\u0301'.repeat(8000)]) {
  test(`display cap does not split grapheme (cluster UTF-16 length=${cluster.length})`, () => {
    const h = setup(); const prefix = '字'.repeat(cluster.length > 8000 ? 1 : 7999);
    const text = prefix + cluster + '后'; const receipt = h.projection.accept(h.asr, result(text));
    assert.ok(receipt); assert.equal(h.projection.snapshot().text, prefix);
    assert.equal(h.projection.snapshot().truncated, true);
    assert.ok(h.projection.snapshot().text.isWellFormed());
    assert.equal(h.projection.writerText(receipt, writer(h)), text);
  });
}

test('oversized first grapheme yields empty flagged display, never empty writer text', () => {
  const h = setup(); const text = 'a' + '\u0301'.repeat(8000);
  const receipt = h.projection.accept(h.asr, result(text));
  assert.ok(receipt);
  assert.deepEqual(h.projection.snapshot(), { activity: 'final-ready', text: '', truncated: true });
  assert.equal(h.projection.writerText(receipt, writer(h)), text);
});

test('projection cannot restore exhausted coordinator event capacity or consume terminal seq', () => {
  const model = new VoiceCoordinatorModel({ enabled: true, epoch: 'small-capacity', maxCounter: 2 });
  const session = model.reserve(request(1)); const capture = model.acquire(session, 'capture', 'c');
  const asr = model.acquire(session, 'asr', 'a'); model.inputReady(session, capture);
  model.released(capture, { stopped: true }); assert.equal(model.process(session), true);
  const projection = new FinalAsrProjection(model, { enabled: true });
  assert.ok(projection.accept(asr, result('容量不被重置')));
  assert.equal(model.snapshot().view.seq, 1);
  assert.equal(model.process(session), false, 'ordinary event capacity remains exhausted');
  assert.equal(model.close(session), true); assert.equal(model.snapshot().view.seq, 2);
  assert.deepEqual(projection.snapshot(), hidden);
});

test('source audit preserves final-business-result and differing Unicode length boundaries', () => {
  const node = readFileSync(new URL('../src/assistant-dictation.mjs', import.meta.url), 'utf8');
  const swift = readFileSync(new URL('../client/DictationController.swift', import.meta.url), 'utf8');
  assert.match(node, /MAX_TEXT = 16000/); assert.match(node, /text\.length <= MAX_TEXT/);
  const finishAt = node.indexOf('async finish');
  const tailAt = node.indexOf('await session.tail', finishAt);
  const polishAt = node.indexOf('text = polished', finishAt);
  const resultAt = node.indexOf("type: 'dictationResult'", finishAt);
  assert.ok(finishAt >= 0 && tailAt > finishAt && polishAt > tailAt && resultAt > polishAt);
  assert.match(swift, /text\.count <= 16000/); assert.match(swift, /writer\.insert\(text, target: target/);
});

test('no trim, normalization, ellipsis or caller mutation leaks into writer source', () => {
  const h = setup(); const text = ' \te\u0301\n合成文字  '; const payload = result(text);
  const receipt = h.projection.accept(h.asr, payload); payload.text = '外部改动';
  assert.equal(h.projection.snapshot().text, text);
  assert.equal(h.projection.writerText(receipt, writer(h)), text);
  assert.equal(h.projection.accept(h.asr, result('重复结果')), null);
});

test('receipt is not writer authorization: original live writer is separately required', () => {
  const h = setup(); const receipt = h.projection.accept(h.asr, result('合成原文'));
  assert.equal(h.projection.writerText(receipt, null), null);
  const w = writer(h); const foreign = setup(); const fw = writer(foreign);
  for (const [r, ticket] of [[{ ...receipt }, w], [receipt, { ...w }], [receipt, h.asr], [receipt, fw]]) {
    assert.equal(h.projection.writerText(r, ticket), null);
  }
  assert.equal(h.projection.writerText(receipt, w), '合成原文');
  h.model.released(w, { stopped: true }); assert.equal(h.projection.writerText(receipt, w), null);
  assert.equal(h.projection.writerText(receipt, writer(h, 'writer-2')), '合成原文');
  assert.equal(h.model.snapshot().view.activity, 'thinking', 'payload access is not inserted/copied outcome');
});

for (const terminal of ['cancel', 'end', 'fail', 'disconnect']) {
  test(`${terminal} invalidates display and writer access, but does not release ASR/writer`, () => {
    const h = setup(); const receipt = h.projection.accept(h.asr, result('需失效的合成原文')); const w = writer(h);
    if (terminal === 'disconnect') h.model.disconnect('asr-epoch'); else h.model.close(h.session, terminal);
    assert.deepEqual(h.projection.snapshot(), hidden);
    assert.equal(h.projection.writerText(receipt, w), null);
    assert.equal(h.projection.accept(h.asr, result('迟到结果')), null);
    assert.equal(h.model.reserve(request(2)), null);
    assert.equal(h.model.restart('next-epoch'), false);
    assert.equal(h.model.snapshot().pending.length, 2);
    h.model.released(h.asr, { stopped: true }); assert.equal(h.model.restart('next-epoch'), false);
    h.model.released(w, { stopped: true }); assert.equal(h.model.restart('next-epoch'), true);
  });
}

test('ASR stop proof before result rejects; result before proof does not itself release the lease', () => {
  const h = setup(); h.model.released(h.asr, { stopped: true });
  assert.equal(h.projection.accept(h.asr, result('已释放来源')), null);
  const next = setup(); const receipt = next.projection.accept(next.asr, result('先接受再释放'));
  assert.equal(next.model.snapshot().pending.length, 1);
  next.model.released(next.asr, { stopped: true });
  assert.equal(next.projection.snapshot().text, '先接受再释放');
  assert.equal(next.projection.writerText(receipt, writer(next)), '先接受再释放');
});

test('Promise result captured before cancellation cannot be relabelled as the next run', async () => {
  const h = setup(); let finish;
  const pending = new Promise(resolve => { finish = resolve; }).then(() => h.projection.accept(h.asr, result('旧异步合成结果')));
  h.model.close(h.session); h.model.released(h.asr, { stopped: true });
  const next = h.model.reserve(request(2));
  const capture = h.model.acquire(next, 'capture', 'next-capture'); const asr = h.model.acquire(next, 'asr', 'next-asr');
  h.model.inputReady(next, capture); h.model.released(capture, { stopped: true }); h.model.process(next);
  finish(); assert.equal(await pending, null);
  assert.deepEqual(h.projection.snapshot(), hidden);
  assert.ok(h.projection.accept(asr, result('新回合合成结果')));
  assert.equal(h.projection.snapshot().text, '新回合合成结果');
});

test('fresh epoch with reused run/operation numbers cannot reuse old receipts or handles', () => {
  const h = setup(); const receipt = h.projection.accept(h.asr, result('旧实例原文')); const oldWriter = writer(h);
  h.model.close(h.session); h.model.released(h.asr, { stopped: true }); h.model.released(oldWriter, { stopped: true });
  assert.equal(h.model.restart('new-epoch'), true);
  const session = h.model.reserve(request(1)); const capture = h.model.acquire(session, 'capture', 'capture-1');
  const asr = h.model.acquire(session, 'asr', 'asr-1'); h.model.inputReady(session, capture);
  h.model.released(capture, { stopped: true }); h.model.process(session);
  const newWriter = h.model.acquire(session, 'writer', 'writer-1');
  assert.equal(h.projection.writerText(receipt, newWriter), null);
  assert.equal(h.projection.accept(h.asr, result('旧来源')), null);
  const newReceipt = h.projection.accept(asr, result('新来源'));
  assert.ok(newReceipt); assert.notEqual(newReceipt, receipt);
  assert.equal(h.projection.writerText(receipt, newWriter), null);
});

test('proposal remains test-only; documentation keeps unsupported integration explicit', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const scan = path => {
    for (const entry of readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) scan(child);
      else if (/\.(mjs|jsx|js|ts|tsx|swift|rs)$/.test(entry.name)) assert.doesNotMatch(read(child), /final-asr-projection/);
    }
  };
  for (const path of ['desktop/frontend', 'src', 'client', 'rust-host/src']) scan(path);
  const doc = read('docs/verification/2026-11-14-final-asr-contract.md');
  for (const pattern of [/SC-20261114-008/, /独立投影/, /8000 UTF-16/, /16000 UTF-16/, /grapheme/,
    /不等于写入成功/, /不分配 seq/, /惰性清理/, /T0 未验收、T1 未启动/, /G1～G6 仍未验收/]) assert.match(doc, pattern);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-14-voice-adapter-contract.md']) {
    assert.ok(read(path).includes('2026-11-14-final-asr-contract.md'));
  }
});
