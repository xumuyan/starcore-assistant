import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { events, stateDir, prepare } from './store.mjs';

export function remoteEnabled(dir = stateDir) {
  try { return JSON.parse(readFileSync(join(dir, 'remote-settings.json'), 'utf8')).enabled !== false; }
  catch { return true; }
}
export function setRemoteEnabled(enabled, dir = stateDir) {
  prepare(dir);
  writeFileSync(join(dir, 'remote-settings.json'), JSON.stringify({ enabled }), { mode: 0o600 });
}
export function latestTarget(dir = stateDir) {
  // Select the last delivered reminder, not another project's pending completion.
  const last = events(dir).filter(e => e.status === 'sent').at(-1);
  return last && /^[0-9a-f-]{36}$/i.test(last.threadId ?? '') ? last : null;
}
function requestDir(dir) {
  prepare(dir);
  const path = join(dir, 'remote-requests');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}
export function requests(dir = stateDir) {
  const root = requestDir(dir);
  return readdirSync(root).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).flatMap(n => {
    try { return [JSON.parse(readFileSync(join(root, n), 'utf8'))]; } catch { return []; }
  }).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
export function saveRequest(request, dir = stateDir) {
  if (!/^[a-f0-9]{64}$/.test(request.id)) throw new Error('Invalid request ID');
  const path = join(requestDir(dir), request.id + '.json');
  const temp = path + '.' + randomUUID() + '.tmp';
  const stored = { ...request };
  if (stored.source === 'mac-assistant') {
    // Mac conversation context lives in the encrypted transcript. The queue
    // journal only needs a fingerprint to match the desktop user's exact input.
    if (typeof stored.text === 'string') stored.textDigest = createHash('sha256').update(stored.text).digest('hex');
    delete stored.text; delete stored.userText;
  }
  writeFileSync(temp, JSON.stringify(stored), { mode: 0o600 });
  renameSync(temp, path);
}
export function acceptRemote(text, owner, dir = stateDir) {
  if (!remoteEnabled(dir)) return { reply: '手机续写已关闭。发送“开启续写”后再提交要求。' };
  const target = latestTarget(dir);
  if (!target) return { reply: '还没有可续写的聊天。请先等待一条带有手机回复说明的新任务提醒。' };
  const id = createHash('sha256').update(JSON.stringify([owner, target.id, text])).digest('hex');
  const clientUserMessageId = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`;
  const request = { id, clientUserMessageId, threadId: target.threadId, project: target.project, reminderId: target.id, text, receivedAt: new Date().toISOString(), status: 'pending' };
  try {
    writeFileSync(join(requestDir(dir), id + '.json'), JSON.stringify(request), { mode: 0o600, flag: 'wx' });
    return { request, reply: `已收到，目标项目：${target.project}\n要求已排队；原聊天空闲后，会在相同会话中继续执行。完成后自动提醒。` };
  } catch (error) {
    if (error.code === 'EEXIST') return { reply: `这条要求已经收到，未重复提交。\n目标项目：${target.project}` };
    throw error;
  }
}

export function observeRemoteRecord(threadId, record, dir = stateDir) {
  const payload = record.payload;
  if (!(record.type === 'response_item' && payload?.role === 'user') && !(record.type === 'event_msg' && payload?.type === 'task_complete')) return;
  const pending = requests(dir).filter(r => r.threadId === threadId && ['submitting', 'submitted', 'running'].includes(r.status));
  if (!pending.length) return;
  if (record.type === 'response_item' && payload?.role === 'user') {
    const text = (payload.content ?? []).map(c => c.text ?? '').join('');
    const digest = createHash('sha256').update(text).digest('hex');
    const request = pending.find(r => r.text === text || r.textDigest === digest);
    const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id;
    if (request && turnId) { request.status = 'running'; request.turnId = turnId; saveRequest(request, dir); }
  }
  if (record.type === 'event_msg' && payload?.type === 'task_complete') {
    for (const request of pending.filter(r => r.turnId === payload.turn_id)) {
      request.status = payload.error ? 'failed' : 'completed';
      saveRequest(request, dir);
    }
  }
}

export function inboundFilter(dir = stateDir) {
  prepare(dir);
  const path = join(dir, 'inbound-seen.json');
  let seen;
  try { seen = JSON.parse(readFileSync(path, 'utf8')); } catch { seen = {}; }
  return body => {
    const msgs = body.msgs.filter(message => {
      const identity = message.client_id || message.message_id || message.seq;
      if (identity == null) return true;
      const key = createHash('sha256').update(JSON.stringify([message.from_user_id, identity])).digest('hex');
      if (seen[key]) return false;
      seen[key] = Date.now();
      return true;
    });
    seen = Object.fromEntries(Object.entries(seen).filter(([, time]) => Date.now() - time < 86400000).slice(-5000));
    writeFileSync(path + '.tmp', JSON.stringify(seen), { mode: 0o600 });
    renameSync(path + '.tmp', path);
    return { ...body, msgs };
  };
}
