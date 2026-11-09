import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './store.mjs';

// Voice line for a completed Codex turn. Turn end is not a verdict on code or tests;
// the client banner carries that caveat. Since 2026-11-09 the WeChat display pipeline
// is disabled by user request, so this watcher is the only event consumer: after an
// event is consumed (announced, dropped, or dismissed) its file is removed, keeping
// the directory from accumulating a backlog.
export function reminderSpeech(event) {
  const project = String(event?.project ?? '').trim() || '未命名项目';
  return `${project}的 Codex 本轮已结束`;
}

const isEventFile = name => /^[a-f0-9]{64}\.json$/.test(name);

// Watches the existing completion event directory and consumes it. Events that already
// exist when the assistant host constructs this watcher count as history and are
// never replayed, so reopening the app cannot repeat an announcement; since the
// WeChat display pipeline is disabled those history files are removed instead of
// lingering as an undelivered backlog. Announcements also hold while a global
// dictation round is active (isBusy), so the spoken reminder can never leak into
// the user's dictated transcript.
export class CompletionVoiceReminder {
  constructor({ service, dir = stateDir, now = Date.now, list = readdirSync, read = readFileSync, remove = unlinkSync, waitMs = 120000, isBusy = null } = {}) {
    this.service = service;
    this.directory = join(dir, 'events');
    this.now = now; this.list = list; this.read = read; this.remove = remove; this.waitMs = waitMs; this.isBusy = isBusy;
    this.seen = new Set();
    this.pending = null; this.pendingAt = 0; this.announcing = false;
    // History is consumed at construction: marked seen so it can never announce,
    // and its file removed so the events directory does not accumulate a backlog.
    try { for (const name of this.list(this.directory)) if (isEventFile(name)) this.dismiss(name); } catch {}
  }
  // Mark the event permanently seen and remove its file. File removal is best effort:
  // a failed delete must never make the reminder re-announce or crash.
  dismiss(name) {
    this.seen.add(name);
    try { this.remove(join(this.directory, name)); } catch {}
  }
  busy() {
    if (this.service.reminderBusy()) return true;
    return this.isBusy ? this.isBusy() === true : false;
  }
  tick() {
    let names;
    try { names = this.list(this.directory); } catch { return; }
    const fresh = [];
    for (const name of names) {
      if (!isEventFile(name) || this.seen.has(name)) continue;
      // Read before consuming: the event is parsed into memory, then the file is
      // removed so nothing accumulates (WeChat display is off; no other consumer).
      let event = null;
      if (this.service.reminderEnabled()) {
        try { event = JSON.parse(this.read(join(this.directory, name), 'utf8')); } catch { event = null; }
      }
      // Consume immediately: mark seen (never replay, even after enabling later)
      // and delete the file. Invalid files are cleaned up too.
      this.dismiss(name);
      if (event && typeof event?.id === 'string' && event.id === name.slice(0, -5)) fresh.push(event);
    }
    // Completions that pile up during one interval announce only the latest turn.
    const newest = fresh.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? ''))).at(-1);
    if (newest) { this.pending = newest; this.pendingAt = this.now(); }
    if (!this.pending || this.announcing) return;
    if (this.busy()) {
      if (this.now() - this.pendingAt > this.waitMs) {
        const dropped = this.pending; this.pending = null;
        this.service.reminderDropped(dropped);
      }
      return;
    }
    // The switch may have been turned off while this reminder waited for idle.
    if (!this.service.reminderEnabled()) { this.pending = null; return; }
    const event = this.pending; this.pending = null; this.announcing = true;
    try {
      Promise.resolve(this.service.announceReminder(event))
        .catch(() => {})
        .finally(() => { this.announcing = false; });
    } catch { this.announcing = false; }
  }
}
