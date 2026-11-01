import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueue, events, deliver, formatEvent, toEvent } from '../src/store.mjs';
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
