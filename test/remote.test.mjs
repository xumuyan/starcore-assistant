import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { enqueue, saveEvent } from '../src/store.mjs';
import { acceptRemote, requests, saveRequest, setRemoteEnabled, inboundFilter, observeRemoteRecord } from '../src/remote-store.mjs';
import { threadInfo, runExistingThread } from '../src/codex-runner.mjs';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
function reminder(dir, thread, status, time) {
  const event = enqueue({ type: 'agent-turn-complete', 'thread-id': thread, 'turn-id': 'one', cwd: '/project', 'last-assistant-message': '完成' }, dir);
  event.status = status;
  event.time = time;
  saveEvent(event, dir);
}
test('routing pins latest delivered chat at receipt; ignores pending reminders and repeated input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-router-'));
  assert.match(acceptRemote('继续', 'owner', dir).reply, /还没有/);
  reminder(dir, first, 'sent', '2026-10-30T01:00:00Z');
  reminder(dir, second, 'pending', '2026-10-30T02:00:00Z');
  const accepted = acceptRemote('继续', 'owner', dir);
  assert.equal(accepted.request.threadId, first);
  assert.match(acceptRemote('继续', 'owner', dir).reply, /未重复/);
  assert.equal(requests(dir).length, 1);
  setRemoteEnabled(false, dir);
  assert.match(acceptRemote('新要求', 'owner', dir).reply, /已关闭/);
});
test('inbound replay IDs remain suppressed after service restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-replay-'));
  const body = { msgs: [{ from_user_id: 'owner', message_id: 'msg-1' }] };
  assert.equal(inboundFilter(dir)(body).msgs.length, 1);
  assert.equal(inboundFilter(dir)(body).msgs.length, 0);
  assert.equal(inboundFilter(dir)({ msgs: [{ from_user_id: 'owner', message_id: 'msg-2' }] }).msgs.length, 1);
});
test('desktop status detects active chat and resumes only a completed main chat', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-thread-'));
  const file = join(dir, 'chat.jsonl');
  const database = join(dir, 'state.sqlite');
  const db = new DatabaseSync(database);
  db.exec('CREATE TABLE threads(id TEXT,cwd TEXT,rollout_path TEXT,source TEXT,archived INTEGER)');
  db.prepare('INSERT INTO threads VALUES(?,?,?,?,0)').run(first, '/project', file, 'vscode');
  writeFileSync(file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n');
  assert.equal(threadInfo(database, first).status, 'active');
  appendFileSync(file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete' } }) + '\n');
  assert.equal(threadInfo(database, first).status, 'idle');
  assert.equal(threadInfo(database, second), null);
  db.close();
});
test('runner queues to original UUID over RPC without resume, fork, shell or model override', async () => {
  let input;
  const dangerousText = '继续处理 $(touch /tmp/do-not-run); --last';
  const result = await runExistingThread('/codex', { id: first, cwd: '/project' }, dangerousText, {
    clientUserMessageId: 'request-1',
    spawnProcess(executable, args, options) {
      assert.equal(executable, '/codex');
      assert.deepEqual(args, ['app-server', '--stdio']);
      assert.equal(options.cwd, '/project');
      assert.ok(!options.shell);
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.kill = () => { child.emit('close', 0); };
      child.stdin.on('data', bytes => {
        const message = JSON.parse(bytes.toString());
        if (message.method === 'initialize') process.nextTick(() => child.stdout.write('{"id":1,"result":{}}\n'));
        if (message.method === 'thread/queue/add') {
          input = message.params;
          process.nextTick(() => child.stdout.write('{"id":2,"result":{"queuedSubmission":{"id":"submission-1"}}}\n'));
        }
      });
      return child;
    }
  });
  assert.equal(input.threadId, first);
  assert.equal(input.input[0].text, dangerousText);
  assert.equal(input.clientUserMessageId, 'request-1');
  assert.equal(result.status, 'submitted');
  assert.equal(result.submissionId, 'submission-1');
});

test('remote request completion matches exact original user text and its turn ID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-completion-'));
  reminder(dir, first, 'sent', '2026-10-30T01:00:00Z');
  const { request } = acceptRemote('继续处理登录', 'owner', dir);
  request.status = 'submitted';
  saveRequest(request, dir);
  observeRemoteRecord(first, { type: 'response_item', payload: { role: 'user', content: [{ text: '继续处理登录' }], internal_chat_message_metadata_passthrough: { turn_id: 'actual-turn' } } }, dir);
  assert.equal(requests(dir)[0].status, 'running');
  observeRemoteRecord(first, { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'unrelated-turn' } }, dir);
  assert.equal(requests(dir)[0].status, 'running');
  observeRemoteRecord(first, { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'actual-turn' } }, dir);
  assert.equal(requests(dir)[0].status, 'completed');
});
