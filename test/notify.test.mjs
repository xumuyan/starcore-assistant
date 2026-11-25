import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueue, enqueueMusuPaymentHandoff, events, deliver, formatEvent, musuPaymentEvents, nextMusuPaymentEvent, toEvent } from '../src/store.mjs';
import { latestTarget } from '../src/remote-store.mjs';
import { installSendGuard } from '../src/weixin-runtime.mjs';

const input = { type: 'agent-turn-complete', 'thread-id': 'chat-1', 'turn-id': 'turn-1', cwd: '/private/project', 'last-assistant-message': '已修改代码；测试未运行。' };
test('deduplicate across reloads and do not store full paths or prompts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-weixin-test-'));
  assert.ok(enqueue({ ...input, 'input-messages': ['secret prompt'] }, dir));
  assert.equal(enqueue(input, dir), null);
  assert.equal(events(dir).length, 1);
  const saved = JSON.stringify(events(dir));
  assert.ok(!saved.includes('private'));
  assert.ok(!saved.includes('secret prompt'));
  assert.equal(toEvent({ ...input, type: 'other' }), null);
  assert.equal(toEvent({ ...input, 'turn-id': '' }), null);
});
test('delivery uncertainty is persisted and never counted as sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-weixin-test-'));
  const event = enqueue(input, dir);
  await deliver(event, async () => { throw new Error('timeout'); }, dir);
  assert.equal(events(dir)[0].status, 'uncertain');
  assert.equal(events(dir).filter(e => e.status === 'pending').length, 0);
  assert.match(formatEvent(event), /测试未运行/);
  assert.match(formatEvent(event), /不代表代码或测试已通过/);
});
test('successful delivery persists sent status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-weixin-test-'));
  const event = enqueue(input, dir);
  let sent = '';
  await deliver(event, async text => { sent = text; }, dir);
  assert.equal(events(dir)[0].status, 'sent');
  assert.match(sent, /项目：project/);
});
test('common credential forms are hidden from notifications', () => {
  const event = toEvent({ ...input, 'last-assistant-message': 'api_key=abcdef password="abc" sk-123456789012345678901234' });
  assert.ok(!event.summary.includes('abcdef'));
  assert.ok(!event.summary.includes('123456789012345678901234'));
});
test('HTTP 200 protocol error cannot be reported as success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ret: -14 }), { status: 200 });
  const undo = installSendGuard();
  try {
    await assert.rejects(fetch('https://ilinkai.weixin.qq.com/ilink/bot/sendmessage'), /未确认/);
    const response = await fetch('https://ilinkai.weixin.qq.com/ilink/bot/getupdates');
    assert.equal(response.status, 200);
  } finally { undo(); globalThis.fetch = original; }
});
test('successful WeChat responses may omit ret and errcode', async () => {
  const original = globalThis.fetch;
  for (const body of [{}, { message_id: 'test-message' }, { ret: 0 }, { errcode: 0 }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
    const undo = installSendGuard();
    try {
      const response = await fetch('https://ilinkai.weixin.qq.com/ilink/bot/sendmessage');
      assert.equal(response.status, 200);
    } finally { undo(); globalThis.fetch = original; }
  }
});
test('nonzero errcode is rejected even with missing or zero ret', async () => {
  const original = globalThis.fetch;
  for (const body of [{ errcode: -14 }, { ret: 0, errcode: -14 }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
    const undo = installSendGuard();
    try {
      await assert.rejects(fetch('https://ilinkai.weixin.qq.com/ilink/bot/sendmessage'), /未确认/);
    } finally { undo(); globalThis.fetch = original; }
  }
});

test('Musu payment notices use fixed copy and leave the last delivered Codex target in place', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'musu-payment-test-'));
  try {
    const now = new Date();
    const thread = '12e45b77-080c-4000-aa6f-bf6b0de011e2';
    const completion = enqueue({ ...input, 'thread-id': thread }, dir);
    await deliver(completion, () => {}, dir);
    const id = '28c041b4-66ce-4758-9e60-7fa7063fa4d1';
    const event = enqueueMusuPaymentHandoff(id, dir, now);
    assert.equal(enqueueMusuPaymentHandoff(id.toUpperCase(), dir, now), null);
    assert.throws(() => enqueueMusuPaymentHandoff('unexpected payment text', dir, now), /交接编号/);
    assert.equal(nextMusuPaymentEvent(dir, now)?.id, event.id);
    const sent = [];
    await deliver(event, text => sent.push(text), dir);
    assert.deepEqual(sent, ['沐宿 · 付款待验证\n请回到 Mac 上的官方付款页面完成验证。订单及付款状态将在验证后核对。']);
    assert.equal(latestTarget(dir)?.threadId, thread);
    assert.ok(!JSON.stringify(musuPaymentEvents(dir)).includes(id));
  } finally { rmSync(dir, { recursive: true }); }
});

test('Musu CLI queues only a short-lived handoff and does not send it after expiration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'musu-payment-cli-'));
  try {
    const args = ['src/cli.mjs', 'enqueue-musu-payment', '28c041b4-66ce-4758-9e60-7fa7063fa4d1'];
    const options = { env: { ...process.env, CODEX_WEIXIN_STATE_DIR: dir }, encoding: 'utf8' };
    assert.match(execFileSync(process.execPath, args, options), /MUSU_PAYMENT_QUEUED/);
    assert.match(execFileSync(process.execPath, args, options), /MUSU_PAYMENT_DUPLICATE/);
    assert.equal(events(dir).length, 0);
    const [event] = musuPaymentEvents(dir);
    assert.equal(Date.parse(event.expiresAt) - Date.parse(event.time), 120_000);
    assert.equal(nextMusuPaymentEvent(dir, new Date(event.expiresAt)), null);
    assert.equal(musuPaymentEvents(dir)[0].status, 'expired');
  } finally { rmSync(dir, { recursive: true }); }
});
