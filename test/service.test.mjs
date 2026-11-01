import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { enqueue, events } from '../src/store.mjs';

async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (check()) return; await sleep(50); }
  throw new Error('Timed out waiting for service');
}

test('service sends only after owner activates, preserves pause, and queues offline notifications', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-weixin-service-'));
  const inbound = [];
  const sent = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/getupdates')) {
      await sleep(80);
      res.end(JSON.stringify({ ret: 0, msgs: inbound.splice(0) }));
    } else {
      if (req.url.endsWith('/sendmessage')) sent.push(body.msg);
      // WeChat may omit return codes on successful sends. Exercise the real
      // service path, not just the fetch guard, with this valid response shape.
      res.end(JSON.stringify(req.url.endsWith('/sendmessage') ? { message_id: 'test-message' } : { ret: 0 }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const accountDir = join(dir, 'weixin/openclaw-weixin/accounts');
  mkdirSync(accountDir, { recursive: true });
  writeFileSync(join(dir, 'weixin/openclaw-weixin/accounts.json'), '["test-im-bot"]');
  writeFileSync(join(accountDir, 'test-im-bot.json'), JSON.stringify({ token: 'dummy', userId: 'owner', baseUrl: `http://127.0.0.1:${server.address().port}` }));
  const child = spawn(process.execPath, ['src/cli.mjs', 'start'], { env: { ...process.env, CODEX_WEIXIN_STATE_DIR: dir }, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const message = (text, from = 'owner') => inbound.push({ from_user_id: from, context_token: 'dummy-context', item_list: [{ type: 1, text_item: { text } }] });
  const input = { type: 'agent-turn-complete', 'thread-id': 't', 'turn-id': 'one', cwd: '/project', 'last-assistant-message': '完成修改，测试未运行。' };
  try {
    await until(() => { try { return JSON.parse(readFileSync(join(dir, 'status.json'))).running; } catch { return false; } });
    enqueue(input, dir);
    message('开启提醒', 'stranger');
    await sleep(300);
    assert.equal(sent.length, 0);
    message('开启提醒');
    await until(() => events(dir)[0]?.status === 'sent');
    assert.equal(sent.filter(m => m.item_list[0].text_item.text.startsWith('Codex 本轮')).length, 1);
    assert.ok(sent.every(m => m.to_user_id === 'owner'));
    message('暂停');
    await until(() => sent.some(m => m.item_list[0].text_item.text.startsWith('已暂停')));
    enqueue({ ...input, 'turn-id': 'two' }, dir);
    message('状态');
    await sleep(2200);
    assert.equal(events(dir).filter(e => e.status === 'pending').length, 1);
    message('开启提醒');
    await until(() => events(dir).every(e => e.status === 'sent'));
    assert.equal(sent.filter(m => m.item_list[0].text_item.text.startsWith('Codex 本轮')).length, 2);
  } finally {
    child.kill('SIGTERM');
    await exited;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
