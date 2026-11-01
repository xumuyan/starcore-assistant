import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopWatcher } from '../src/desktop-watch.mjs';
import { events, enqueue } from '../src/store.mjs';

test('desktop adapter skips history, reads appended completion, handles split records and deduplicates notify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-desktop-watch-'));
  const dbPath = join(dir, 'state.sqlite');
  const transcript = join(dir, 'chat.jsonl');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE threads(id TEXT,rollout_path TEXT,cwd TEXT,source TEXT,archived INTEGER)');
  db.prepare('INSERT INTO threads VALUES(?,?,?,?,0)').run('desktop-chat', transcript, '/my/project', 'vscode');
  const record = (turn, timestamp = new Date(Date.now() + 1000).toISOString()) => JSON.stringify({ timestamp, type: 'event_msg', payload: { type: 'task_complete', turn_id: turn, last_agent_message: '任务完成，测试未运行。' } }) + '\n';
  writeFileSync(transcript, record('old'));
  const watcher = new DesktopWatcher(dbPath, dir);
  try {
    assert.equal(watcher.tick(), 0);
    assert.equal(events(dir).length, 0);
    appendFileSync(transcript, record('new'));
    assert.equal(watcher.tick(), 1);
    assert.equal(watcher.tick(), 0);
    assert.equal(enqueue({ type: 'agent-turn-complete', 'thread-id': 'desktop-chat', 'turn-id': 'new', cwd: '/my/project', 'last-assistant-message': '任务完成，测试未运行。' }, dir), null);
    const split = record('split');
    appendFileSync(transcript, split.slice(0, 40));
    assert.equal(watcher.tick(), 0);
    appendFileSync(transcript, split.slice(40));
    assert.equal(watcher.tick(), 1);
    const child = join(dir, 'child.jsonl');
    writeFileSync(child, record('child-turn'));
    db.prepare('INSERT INTO threads VALUES(?,?,?,?,0)').run('child', child, '/project', JSON.stringify({ subagent: { thread_spawn: {} } }));
    assert.equal(watcher.tick(), 0);
    watcher.close();
    const resumed = new DesktopWatcher(dbPath, dir);
    try { assert.equal(resumed.tick(), 0); assert.equal(events(dir).length, 2); }
    finally { resumed.close(); }
  } finally { db.close(); }
});
