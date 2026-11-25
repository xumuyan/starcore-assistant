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
  return enqueueEvent(event, dir);
}
const paymentKind = 'musu-payment-handoff';
export function enqueueMusuPaymentHandoff(handoffId, dir = stateDir, now = new Date()) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(handoffId ?? '')) {
    throw new Error('需要有效的沐宿付款交接编号');
  }
  return enqueueEvent({
    id: createHash('sha256').update(JSON.stringify([paymentKind, handoffId.toLowerCase()])).digest('hex'),
    kind: paymentKind,
    time: now.toISOString(),
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    status: 'pending'
  }, dir);
}
function isMusuPaymentHandoff(event) {
  return event.kind === paymentKind;
}
function enqueueEvent(event, dir) {
  const directory = eventDirectory(dir, event);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(directory, `${event.id}.json`), JSON.stringify(event), { mode: 0o600, flag: 'wx' });
    return event;
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
}
function eventDirectory(dir, event) {
  return join(dir, isMusuPaymentHandoff(event) ? 'musu-payment-events' : 'events');
}
export function events(dir = stateDir) {
  return readEvents(join(dir, 'events'));
}
export function musuPaymentEvents(dir = stateDir) {
  return readEvents(join(dir, 'musu-payment-events'));
}
function readEvents(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return readdirSync(directory).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).flatMap(name => {
    try { return [JSON.parse(readFileSync(join(directory, name), 'utf8'))]; }
    catch { return []; }
  }).filter(event => event.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
}
export function saveEvent(event, dir = stateDir) {
  if (!/^[a-f0-9]{64}$/.test(event.id)) throw new Error('Invalid event ID');
  const dest = join(eventDirectory(dir, event), `${event.id}.json`);
  writeFileSync(`${dest}.tmp`, JSON.stringify(event), { mode: 0o600 });
  renameSync(`${dest}.tmp`, dest);
}
export function nextMusuPaymentEvent(dir = stateDir, now = new Date()) {
  for (const event of musuPaymentEvents(dir)) {
    if (event.status !== 'pending') continue;
    if (Date.parse(event.expiresAt) > now.getTime()) return event;
    saveEvent({ ...event, status: 'expired' }, dir);
  }
  return null;
}
export function formatEvent(event) {
  if (isMusuPaymentHandoff(event)) {
    return '沐宿 · 付款待验证\n请回到 Mac 上的官方付款页面完成验证。订单及付款状态将在验证后核对。';
  }
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
