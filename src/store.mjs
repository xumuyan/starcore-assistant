import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export const stateDir = process.env.CODEX_WEIXIN_STATE_DIR || join(homedir(), '.codex-weixin-notifier');
export function prepare(dir = stateDir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(join(dir, 'events'), { recursive: true, mode: 0o700 });
}
export function redact(text) {
  return String(text ?? '')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,})\b/g, '[凭据已隐藏]')
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*)["']?[^\s"',;]+/gi, '$1[已隐藏]');
}
export function toEvent(payload) {
  if (payload.type !== 'agent-turn-complete') return null;
  const thread = payload['thread-id'];
  const turn = payload['turn-id'];
  if (typeof thread !== 'string' || !thread || typeof turn !== 'string' || !turn) return null;
  const summary = redact(payload['last-assistant-message']).trim();
  if (!summary) return null;
  return {
    id: createHash('sha256').update(JSON.stringify([thread, turn])).digest('hex'),
    threadId: thread,
    turnId: turn,
    project: basename(typeof payload.cwd === 'string' ? payload.cwd : '') || '未命名项目',
    summary: summary.slice(0, 1200),
    time: new Date().toISOString(),
    status: 'pending'
  };
}
export function enqueue(payload, dir = stateDir) {
  const event = toEvent(payload);
  if (!event) return null;
  prepare(dir);
  try {
    writeFileSync(join(dir, 'events', `${event.id}.json`), JSON.stringify(event), { mode: 0o600, flag: 'wx' });
    return event;
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
}
export function events(dir = stateDir) {
  prepare(dir);
  return readdirSync(join(dir, 'events')).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).flatMap(name => {
    try { return [JSON.parse(readFileSync(join(dir, 'events', name), 'utf8'))]; }
    catch { return []; }
  }).filter(event => event.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
}
export function saveEvent(event, dir = stateDir) {
  if (!/^[a-f0-9]{64}$/.test(event.id)) throw new Error('Invalid event ID');
  const dest = join(dir, 'events', `${event.id}.json`);
  writeFileSync(`${dest}.tmp`, JSON.stringify(event), { mode: 0o600 });
  renameSync(`${dest}.tmp`, dest);
}
export function formatEvent(event) {
  const time = new Date(event.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return `Codex 本轮已结束，待查看\n项目：${event.project}\n时间：${time}\n\n最终回复摘要：\n${event.summary}\n\n回合结束不代表代码或测试已通过，请以摘要和实际验收为准。${event.threadId ? '\n手机直接回复要求，将发到最近一条提醒对应的聊天。发“当前项目”可查询目标。' : ''}`;
}
export async function deliver(event, send, dir = stateDir) {
  // Persist before sending: an interrupted delivery is ambiguous and must not be replayed automatically.
  event.status = 'sending';
  saveEvent(event, dir);
  try {
    await send(formatEvent(event));
    event.status = 'sent';
  } catch {
    event.status = 'uncertain';
  }
  saveEvent(event, dir);
  return event.status;
}
