import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './store.mjs';

// Voice line for a completed Codex turn. Turn end is not a verdict on code or tests;
// the client banner and the WeChat reminder carry that caveat.
export function reminderSpeech(event) {
  const project = String(event?.project ?? '').trim() || '未命名项目';
  return `${project}的 Codex 本轮已结束`;
}

const isEventFile = name => /^[a-f0-9]{64}\.json$/.test(name);

// Watches the existing completion event directory read-only. The desktop watcher,
// the WeChat queue and event status files are never modified. Events that already
// exist when the assistant host constructs this watcher count as history and are
// never replayed, so reopening the app cannot repeat an announcement; WeChat
// remains the durable channel while the app is closed.
export class CompletionVoiceReminder {
  constructor({ service, dir = stateDir, now = Date.now, list = readdirSync, read = readFileSync, waitMs = 120000 } = {}) {
    this.service = service;
    this.directory = join(dir, 'events');
    this.now = now; this.list = list; this.read = read; this.waitMs = waitMs;
    this.seen = new Set();
    this.pending = null; this.pendingAt = 0; this.announcing = false;
    try { for (const name of this.list(this.directory)) if (isEventFile(name)) this.seen.add(name); } catch {}
  }
  tick() {
    let names;
    try { names = this.list(this.directory); } catch { return; }
    const fresh = [];
    for (const name of names) {
      if (!isEventFile(name) || this.seen.has(name)) continue;
      // Mark seen regardless of the switch, so enabling it later never replays old completions.
      this.seen.add(name);
      if (!this.service.reminderEnabled()) continue;
      let event;
      try { event = JSON.parse(this.read(join(this.directory, name), 'utf8')); } catch { continue; }
      if (typeof event?.id !== 'string' || event.id !== name.slice(0, -5)) continue;
      fresh.push(event);
    }
    // Completions that pile up during one interval announce only the latest turn.
    const newest = fresh.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? ''))).at(-1);
    if (newest) { this.pending = newest; this.pendingAt = this.now(); }
    if (!this.pending || this.announcing) return;
    if (this.service.reminderBusy()) {
      if (this.now() - this.pendingAt > this.waitMs) {
        const dropped = this.pending; this.pending = null;
        this.service.reminderDropped(dropped);
      }
      return;
    }
    const event = this.pending; this.pending = null; this.announcing = true;
    try {
      Promise.resolve(this.service.announceReminder(event))
        .catch(() => {})
        .finally(() => { this.announcing = false; });
    } catch { this.announcing = false; }
  }
}
