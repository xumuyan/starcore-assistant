import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync, openSync, closeSync, readSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { prepare, stateDir, enqueue } from './store.mjs';
import { observeRemoteRecord } from './remote-store.mjs';

// Local adapter for the installed desktop's state_5.sqlite / JSONL format.
// Neither the database nor transcripts are modified. No old completions are sent.
export class DesktopWatcher {
  constructor(database, directory = stateDir) {
    this.directory = directory;
    prepare(directory);
    this.cursorPath = join(directory, 'desktop-cursor.json');
    this.db = new DatabaseSync(database, { readOnly: true });
    this.query = this.db.prepare('SELECT id, rollout_path, cwd, source FROM threads WHERE archived=0');
    this.cursor = existsSync(this.cursorPath) ? JSON.parse(readFileSync(this.cursorPath, 'utf8')) : null;
    if (!this.cursor) {
      this.cursor = { version: 1, since: Date.now(), files: {} };
      for (const row of this.rows()) {
        try {
          const stat = statSync(row.rollout_path);
          this.cursor.files[row.id] = { path: row.rollout_path, inode: stat.ino, offset: stat.size };
        } catch {}
      }
      this.save();
    }
  }
  rows() {
    return this.query.all().filter(row => {
      if (typeof row.source !== 'string') return false;
      // Spawned agents have their own completion events; notify only main chats.
      try { return !JSON.parse(row.source)?.subagent; } catch { return !row.source.includes('subagent'); }
    });
  }
  save() {
    writeFileSync(`${this.cursorPath}.tmp`, JSON.stringify(this.cursor), { mode: 0o600 });
    renameSync(`${this.cursorPath}.tmp`, this.cursorPath);
  }
  tick() {
    let changed = false;
    let added = 0;
    for (const row of this.rows()) {
      let stat;
      try { stat = statSync(row.rollout_path); } catch { continue; }
      let file = this.cursor.files[row.id];
      if (!file || file.path !== row.rollout_path || file.inode !== stat.ino || file.offset > stat.size) {
        file = { path: row.rollout_path, inode: stat.ino, offset: 0 };
        this.cursor.files[row.id] = file;
        changed = true;
      }
      if (stat.size <= file.offset) continue;
      const fd = openSync(row.rollout_path, 'r');
      let data;
      try {
        const buffer = Buffer.alloc(stat.size - file.offset);
        const bytes = readSync(fd, buffer, 0, buffer.length, file.offset);
        data = buffer.subarray(0, bytes);
      } finally { closeSync(fd); }
      const last = data.lastIndexOf(10);
      if (last < 0) continue; // An unfinished JSONL record is retried on the next tick.
      for (const line of data.subarray(0, last).toString('utf8').split('\n')) {
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        observeRemoteRecord(row.id, record, this.directory);
        const event = record.payload;
        if (record.type !== 'event_msg' || event?.type !== 'task_complete') continue;
        if (!(Date.parse(record.timestamp) >= this.cursor.since)) continue;
        if (enqueue({
          type: 'agent-turn-complete',
          'thread-id': row.id,
          'turn-id': event.turn_id,
          cwd: row.cwd,
          'last-assistant-message': event.last_agent_message
        }, this.directory)) added++;
      }
      file.offset += last + 1;
      changed = true;
    }
    if (changed) this.save();
    return added;
  }
  close() { this.db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const watcher = new DesktopWatcher(join(homedir(), '.codex', 'state_5.sqlite'));
  const abort = new AbortController();
  process.on('SIGTERM', () => abort.abort());
  process.on('SIGINT', () => abort.abort());
  const statusPath = join(stateDir, 'desktop-status.json');
  try {
    while (!abort.signal.aborted) {
      try {
        const added = watcher.tick();
        writeFileSync(statusPath, JSON.stringify({ running: true, added, checkedAt: new Date().toISOString() }), { mode: 0o600 });
      } catch {
        writeFileSync(statusPath, JSON.stringify({ running: true, error: 'desktop_scan_failed', checkedAt: new Date().toISOString() }), { mode: 0o600 });
      }
      await sleep(2000, undefined, { signal: abort.signal }).catch(() => {});
    }
  } finally {
    watcher.close();
    writeFileSync(statusPath, JSON.stringify({ running: false, checkedAt: new Date().toISOString() }), { mode: 0o600 });
  }
}
