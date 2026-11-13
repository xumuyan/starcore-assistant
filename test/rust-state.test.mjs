import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ConversationMemory } from '../src/assistant-memory.mjs';
import { AssistantService } from '../src/assistant-service.mjs';
import { ensureHostBinary } from '../test-helpers/rust-host-bin.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = join(homedir(), '.cargo/bin/cargo');
const host = join(root, 'rust-host/target/debug/moss-host');
const skip = !existsSync(cargo) ? 'cargo 未安装' : false;
before(() => { if (!skip) execFileSync(cargo, ['build', '--quiet'], { cwd: join(root, 'rust-host'), timeout: 300000 }); });
function sandbox(t) {
  const home = mkdtempSync(join(tmpdir(), 'moss-state-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const state = join(home, 'custom-state');
  const assistant = join(state, 'assistant');
  mkdirSync(assistant, { recursive: true });
  return { home, state, assistant, env: { HOME: home, CODEX_WEIXIN_STATE_DIR: state, MOSS_CHAT_TIMEOUT_MS: '3000' } };
}
function start(env) { return spawnSync(host, ['serve'], { env, input: '', encoding: 'utf8', timeout: 5000 }); }
function assertRefused(result) {
  assert.equal(result.status, 1, result.stderr);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.type, 'error');
  assert.match(event.message, /初始化失败/);
  assert.doesNotMatch(result.stderr, /panicked/);
  return event.message;
}

test('state path honors override and falls back to HOME/assistant without touching misplaced P3 files', { skip }, t => {
  const h = sandbox(t);
  // Historical Rust path is not migrated, overwritten or guessed automatically.
  writeFileSync(join(h.state, 'master.key'), 'synthetic legacy marker');
  assert.equal(start(h.env).status, 0);
  assert.equal(readFileSync(join(h.state, 'master.key'), 'utf8'), 'synthetic legacy marker');
  assert.ok(existsSync(join(h.assistant, 'master.key')));
  assert.equal(existsSync(join(h.home, '.codex-weixin-notifier')), false);
  for (const env of [{ HOME: h.home }, { HOME: h.home, CODEX_WEIXIN_STATE_DIR: '' }]) {
    assert.equal(start(env).status, 0);
    assert.ok(existsSync(join(h.home, '.codex-weixin-notifier/assistant/conversations.sqlite')));
    assert.equal(existsSync(join(h.home, '.codex-weixin-notifier/conversations.sqlite')), false);
  }
});

test('missing, invalid or mismatched keys fail closed with structured errors and unchanged ciphertext', { skip }, t => {
  const h = sandbox(t);
  const memory = new ConversationMemory(h.assistant);
  memory.append('user', 'synthetic safety fixture');
  memory.close();
  const keyPath = join(h.assistant, 'master.key');
  const dbPath = join(h.assistant, 'conversations.sqlite');
  const key = readFileSync(keyPath), dbBefore = readFileSync(dbPath);
  rmSync(keyPath);
  assert.match(assertRefused(start(h.env)), /密钥缺失/);
  assert.equal(existsSync(keyPath), false);
  for (const bytes of [Buffer.from('bad'), Buffer.alloc(32, 42)]) {
    writeFileSync(keyPath, bytes);
    assertRefused(start(h.env));
    assert.deepEqual(readFileSync(keyPath), bytes);
    assert.deepEqual(readFileSync(dbPath), dbBefore);
  }
  writeFileSync(keyPath, key);
  assert.equal(start(h.env).status, 0);
  const reopened = new ConversationMemory(h.assistant);
  assert.equal(reopened.context()[0].content, 'synthetic safety fixture');
  reopened.close();
});

test('corrupt SQLite and legacy plaintext tables are refused without resetting the files', { skip }, t => {
  const h = sandbox(t);
  writeFileSync(join(h.assistant, 'master.key'), Buffer.alloc(32, 5));
  const path = join(h.assistant, 'conversations.sqlite');
  writeFileSync(path, 'not a database');
  assertRefused(start(h.env));
  assert.equal(readFileSync(path, 'utf8'), 'not a database');
  rmSync(path);
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE messages(id INTEGER PRIMARY KEY,content TEXT)');
  db.close();
  const before = readFileSync(path);
  assert.match(assertRefused(start(h.env)), /Node.*迁移/);
  assert.deepEqual(readFileSync(path), before);
});

test('a non-regular key or linked database is refused before reading or writing its target', { skip }, t => {
  const h = sandbox(t);
  const key = join(h.assistant, 'master.key');
  execFileSync('/usr/bin/mkfifo', [key]);
  assertRefused(start(h.env)); // 5s process timeout also detects accidental blocking FIFO reads.
  rmSync(key);
  writeFileSync(key, Buffer.alloc(32, 9));
  const target = join(h.home, 'outside.db');
  writeFileSync(target, 'untouched target');
  symlinkSync(target, join(h.assistant, 'conversations.sqlite'));
  assertRefused(start(h.env));
  assert.equal(readFileSync(target, 'utf8'), 'untouched target');
});

test('authentication checks old rows outside the recent context window without changing damaged data', { skip }, t => {
  const h = sandbox(t);
  const memory = new ConversationMemory(h.assistant);
  for (let i = 0; i < 25; i++) memory.append('user', `synthetic row ${i}`);
  const row = memory.db.prepare('SELECT data FROM sealed_messages WHERE id=1').get();
  const damaged = Buffer.from(row.data); damaged[20] ^= 1;
  memory.db.prepare('UPDATE sealed_messages SET data=? WHERE id=1').run(damaged);
  memory.close();
  const path = join(h.assistant, 'conversations.sqlite');
  const before = readFileSync(path);
  assert.match(assertRefused(start(h.env)), /校验失败/);
  assert.deepEqual(readFileSync(path), before);
});

test('real Node service path roundtrips Node → Rust relay context → Node after restart', { skip }, async t => {
  const h = sandbox(t);
  const node = new AssistantService({ dir: h.state, emit: () => {}, asr: {} });
  node.record('user', '合成前文问题');
  node.record('assistant', '合成前文回复');
  node.memory.close();
  const originalKey = readFileSync(join(h.assistant, 'master.key'));
  let request;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      request = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ output_text: '合成 Rust 回复' }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  await ensureHostBinary(host);
  const proc = spawn(host, ['serve'], { env: h.env });
  let buffer = '';
  const events = [];
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', text => {
    buffer += text;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1);
    }
  });
  try {
    proc.stdin.write(JSON.stringify({ type: 'configure', settings: { chatBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, speak: false }, keys: { yunqiao: 'synthetic-test-key' } }) + '\n');
    proc.stdin.write(JSON.stringify({ type: 'text', text: '合成新问题' }) + '\n');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { clearInterval(poll); reject(Error('Rust relay response timeout')); }, 8000);
      const poll = setInterval(() => {
        if (events.some(e => e.type === 'state' && e.detail === '回复已就绪')) {
          clearInterval(poll); clearTimeout(timer); resolve();
        }
      }, 20);
    });
    assert.ok(request.input.some(m => m.role === 'user' && m.content === '合成前文问题'));
    assert.ok(request.input.some(m => m.role === 'assistant' && m.content === '合成前文回复'));
  } finally {
    const exit = once(proc, 'exit'); proc.kill(); await exit;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  assert.equal(start(h.env).status, 0, 'Rust reopen validates all Node and Rust rows');
  const reopened = new AssistantService({ dir: h.state, emit: () => {}, asr: {} });
  try {
    assert.deepEqual(reopened.memory.context().map(m => m.content), ['合成前文问题', '合成前文回复', '合成新问题', '合成 Rust 回复']);
    assert.deepEqual(readFileSync(join(h.assistant, 'master.key')), originalKey);
    assert.equal(existsSync(join(h.home, '.codex-weixin-notifier')), false, 'explicit state dir must not fall back to HOME');
    assert.equal(existsSync(join(h.state, 'conversations.sqlite')), false, 'no second database at old Rust path');
  } finally { reopened.memory.close(); }
});
