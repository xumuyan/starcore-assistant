// Fixed offline display-validation child. Never receives original handles or
// full writer text, never writes files, clipboard, audio or input devices.
import { fileURLToPath } from 'node:url';
const statuses = new Set(['hidden', 'listening', 'thinking', 'final-ready', 'preparing',
  'paste-issued', 'paste-uncertain', 'copy-available', 'copying', 'copied', 'checking',
  'checked', 'not-issued', 'copy-written', 'copy-not-written', 'copy-unknown', 'copy-waiting']);
const keys = ['status', 'text', 'truncated', 'level', 'showOrbs', 'canCopy', 'awaitingStop', 'executorWaiting'];
const exact = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
export function validPresentation(value) {
  return Boolean(exact(value, keys) && statuses.has(value.status) && typeof value.text === 'string' &&
    value.text.length <= 8000 && value.text.isWellFormed() && typeof value.level === 'number' &&
    Number.isFinite(value.level) && value.level >= 0 && value.level <= 1 &&
    keys.slice(2).filter(key => key !== 'level').every(key => typeof value[key] === 'boolean'));
}
export const validJobId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const exactMessage = exact;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (typeof process.send !== 'function') process.exitCode = 2;
  else {
    process.on('message', message => {
      if (exact(message, ['type']) && message.type === 'shutdown') { process.disconnect(); return; }
      if (!exact(message, ['type', 'id', 'presentation']) || message.type !== 'prepare' ||
        !validJobId(message.id) || !validPresentation(message.presentation)) {
        process.send({ type: 'protocol-error' }); return;
      }
      // ACK is text-free; original frame remains exclusively in the parent.
      process.send({ type: 'prepared', id: message.id });
    });
    process.send({ type: 'ready' });
  }
}
