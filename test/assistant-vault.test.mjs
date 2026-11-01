import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { LocalVault } from '../src/assistant-vault.mjs';
import { ConversationMemory } from '../src/assistant-memory.mjs';
import { saveRequest, requests, observeRemoteRecord } from '../src/remote-store.mjs';

function folder(t) { const path = mkdtempSync(join(tmpdir(), 'jarvis-vault-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
test('AES-GCM authenticates content and purpose, with random nonces and private key', t => {
  const root = folder(t), vault = new LocalVault(root), text = Buffer.from('敏感对话和测试密钥');
  const first = vault.seal(text, 'fixture'), second = vault.seal(text, 'fixture');
  assert.equal(first.includes(text), false); assert.notDeepEqual(first, second);
  assert.deepEqual(vault.open(first, 'fixture'), text);
  assert.throws(() => vault.open(first, 'different-purpose'));
  const tampered = Buffer.from(first); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => vault.open(tampered, 'fixture'));
  assert.equal(statSync(join(root, 'master.key')).mode & 0o777, 0o600);
});
test('existing plaintext database and assistant backups migrate without losing messages', t => {
  const root = folder(t), message = '以前的项目讨论必须保留';
  const db = new DatabaseSync(join(root, 'conversations.sqlite'));
  db.exec('CREATE TABLE messages(id INTEGER PRIMARY KEY,role TEXT,content TEXT,time TEXT,source TEXT); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);');
  db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(7, 'user', message, '2026-10-30', 'chat');
  db.prepare('INSERT INTO metadata VALUES (?,?)').run('legacy-imported', 'yes'); db.close();
  mkdirSync(join(root, 'backups')); writeFileSync(join(root, 'backups/settings.json'), '{"private":"old setting"}');
  writeFileSync(join(root, 'history.json'), '[{"role":"user","content":"old copy"}]');
  const memory = new ConversationMemory(root);
  assert.equal(memory.page()[0].content, message); assert.equal(memory.page()[0].id, 7);
  assert.equal(readFileSync(join(root, 'conversations.sqlite')).includes(Buffer.from(message)), false);
  assert.equal(existsSync(join(root, 'history.json')), false);
  assert.equal(existsSync(join(root, 'history.json.sealed')), true);
  assert.equal(existsSync(join(root, 'backups/settings.json')), false);
  assert.equal(existsSync(join(root, 'backups/settings.json.sealed')), true);
  memory.close(); const reopened = new ConversationMemory(root); assert.equal(reopened.page().length, 1); reopened.close();
});
test('missing local master key does not silently replace encrypted data', t => {
  const root = folder(t); writeFileSync(join(root, 'credentials.bin'), 'existing-encrypted-file');
  assert.throws(() => new LocalVault(root), /密钥缺失/);
  assert.equal(existsSync(join(root, 'master.key')), false);
  assert.equal(readFileSync(join(root, 'credentials.bin'), 'utf8'), 'existing-encrypted-file');
});
test('Mac handoff journal keeps a digest, never a plaintext copy of conversation context', t => {
  const root = folder(t), text = '本次要求和私密讨论背景';
  const request = { id: 'a'.repeat(64), threadId: 'test-thread', receivedAt: new Date().toISOString(), status: 'submitted', source: 'mac-assistant', text, userText: '本次要求' };
  saveRequest(request, root);
  const raw = readFileSync(join(root, 'remote-requests', request.id + '.json'), 'utf8');
  assert.equal(raw.includes('私密讨论'), false); assert.equal(raw.includes('本次要求'), false);
  assert.match(requests(root)[0].textDigest, /^[a-f0-9]{64}$/);
  observeRemoteRecord(request.threadId, { type: 'response_item', payload: { role: 'user', content: [{ text }], internal_chat_message_metadata_passthrough: { turn_id: 'test-turn' } } }, root);
  assert.equal(requests(root)[0].status, 'running');
  observeRemoteRecord(request.threadId, { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'test-turn' } }, root);
  assert.equal(requests(root)[0].status, 'completed');
});
