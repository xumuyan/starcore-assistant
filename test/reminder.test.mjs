import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompletionVoiceReminder, reminderSpeech } from '../src/assistant-reminder.mjs';
import { enqueue, prepare } from '../src/store.mjs';
import { AssistantService } from '../src/assistant-service.mjs';
import { assistantDefaults } from '../src/assistant-core.mjs';

function stubHarness(t, { enabled = true, busy = false, preExisting = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-test-'));
  prepare(dir);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const announced = [], dropped = [];
  const state = { enabled, busy, dictationBusy: false };
  const service = {
    reminderEnabled: () => state.enabled,
    reminderBusy: () => state.busy,
    announceReminder: event => { announced.push(event); return Promise.resolve(); },
    reminderDropped: event => { dropped.push(event); }
  };
  let now = 1000;
  for (const spec of preExisting) enqueue(spec, dir);
  const reminder = new CompletionVoiceReminder({ service, dir, now: () => now, isBusy: () => state.dictationBusy });
  return {
    dir, reminder, announced, dropped,
    setEnabled: value => { state.enabled = value; },
    setBusy: value => { state.busy = value; },
    setDictationBusy: value => { state.dictationBusy = value; },
    advance: ms => { now += ms; },
    write: (thread, turn, project = '项目A', message = '完成摘要') =>
      enqueue({ type: 'agent-turn-complete', 'thread-id': thread, 'turn-id': turn, cwd: `/work/${project}`, 'last-assistant-message': message }, dir)
  };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('reminder speech names the project and turn end without inventing a verdict', () => {
  assert.equal(reminderSpeech({ project: '电视盒子' }), '电视盒子的 Codex 本轮已结束');
  assert.equal(reminderSpeech({ project: '  ' }), '未命名项目的 Codex 本轮已结束');
  assert.equal(reminderSpeech(undefined), '未命名项目的 Codex 本轮已结束');
  assert.equal(reminderSpeech({ project: 'x' }).includes('已通过'), false);
});

test('events existing before the watcher starts are history: never replayed and files removed', t => {
  const h = stubHarness(t, { preExisting: [{ type: 'agent-turn-complete', 'thread-id': 'thread-1', 'turn-id': 'turn-1', cwd: '/work/项目A', 'last-assistant-message': '完成摘要' }] });
  h.reminder.tick(); h.reminder.tick();
  assert.equal(h.announced.length, 0);
  assert.equal(h.dropped.length, 0);
  assert.equal(existsSync(join(h.dir, 'events', `${'a'.repeat(64)}.json`)), false, 'history file consumed at construction');
  assert.equal(readdirSync(join(h.dir, 'events')).length, 0, 'no backlog remains');
});

test('a new completion announces once, its file is consumed and it never repeats', async t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  const event = h.write('thread-1', 'turn-2');
  h.reminder.tick();
  await wait(0);
  assert.equal(h.announced.length, 1);
  assert.equal(h.announced[0].id, event.id);
  assert.equal(h.announced[0].project, '项目A');
  assert.equal(existsSync(join(h.dir, 'events', `${event.id}.json`)), false, 'announced event file removed: no backlog');
  assert.equal(readdirSync(join(h.dir, 'events')).length, 0, 'events directory stays clean');
  h.reminder.tick(); h.reminder.tick();
  assert.equal(h.announced.length, 1, 'same event id never announces twice');
});

test('the switch is checked on arrival; enabling later never replays skipped completions', t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  h.setEnabled(false);
  h.write('thread-1', 'turn-1');
  h.reminder.tick();
  assert.equal(h.announced.length, 0);
  assert.equal(readdirSync(join(h.dir, 'events')).length, 0, 'dismissed-while-disabled events are consumed, not stored');
  h.setEnabled(true);
  h.reminder.tick();
  assert.equal(h.announced.length, 0, 'skipped history stays skipped');
  const latest = h.write('thread-1', 'turn-2');
  h.reminder.tick();
  assert.equal(h.announced.length, 1);
  assert.equal(h.announced[0].id, latest.id);
});

test('busy holds the reminder, idle releases it and later events replace the pending one', async t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  h.setBusy(true);
  h.write('thread-1', 'turn-1', '项目A');
  h.reminder.tick();
  assert.equal(h.announced.length, 0);
  await wait(5); // distinct timestamps so latest is unambiguous
  const newest = h.write('thread-2', 'turn-2', '项目B');
  h.reminder.tick();
  assert.equal(h.announced.length, 0);
  h.setBusy(false);
  h.reminder.tick();
  await wait(0);
  assert.equal(h.announced.length, 1, 'queued completions coalesce to the latest turn');
  assert.equal(h.announced[0].id, newest.id);
  assert.equal(h.announced[0].project, '项目B');
});

test('waiting past the limit drops the pending reminder with an explicit notice', t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  h.setBusy(true);
  h.write('thread-1', 'turn-1');
  h.reminder.tick();
  h.advance(120001);
  h.reminder.tick();
  assert.equal(h.announced.length, 0);
  assert.equal(h.dropped.length, 1);
  assert.equal(readdirSync(join(h.dir, 'events')).length, 0, 'dropped event is consumed too: no stale backlog');
  h.setBusy(false);
  h.reminder.tick();
  assert.equal(h.announced.length, 0, 'a dropped reminder is not announced later');
});

test('store-level deduplication means one turn announces at most once', t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  const first = h.write('thread-1', 'turn-1');
  const second = h.write('thread-1', 'turn-1');
  assert.equal(second, null, 'duplicate thread/turn event is rejected by the store');
  h.reminder.tick();
  assert.equal(h.announced.length, 1);
  assert.equal(h.announced[0].id, first.id);
});

test('an active dictation round holds the reminder so speech never leaks into the transcript', async t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  h.setDictationBusy(true);
  h.write('thread-1', 'turn-1');
  h.reminder.tick();
  assert.equal(h.announced.length, 0, 'dictation recording counts as busy');
  h.setDictationBusy(false);
  h.reminder.tick();
  await wait(0);
  assert.equal(h.announced.length, 1, 'released once the dictation round ends');
});

test('turning the switch off while waiting drops the pending reminder silently', async t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  h.setBusy(true);
  h.write('thread-1', 'turn-1');
  h.reminder.tick();
  h.setEnabled(false);
  h.setBusy(false);
  h.reminder.tick();
  await wait(0);
  assert.equal(h.announced.length, 0);
  assert.equal(h.dropped.length, 0, 'a user-disabled reminder is not announced and needs no error');
});

test('files that are not completion events are ignored and cleaned up', t => {
  const h = stubHarness(t);
  h.reminder.tick(); // baseline
  writeFileSync(join(h.dir, 'events', 'not-an-event.json'), '{}');
  writeFileSync(join(h.dir, 'events', `${'a'.repeat(64)}.json`), JSON.stringify({ id: 'mismatch', project: '伪造' }));
  h.reminder.tick();
  assert.equal(h.announced.length, 0);
  assert.equal(existsSync(join(h.dir, 'events', `${'a'.repeat(64)}.json`)), false, 'invalid hex event file is cleaned up');
  assert.equal(existsSync(join(h.dir, 'events', 'not-an-event.json')), true, 'files outside the event namespace are untouched');
});

test('a failing file removal never breaks announcing or lets events replay', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-test-'));
  prepare(dir);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const announced = [];
  const service = {
    reminderEnabled: () => true,
    reminderBusy: () => false,
    announceReminder: event => { announced.push(event); return Promise.resolve(); },
    reminderDropped: () => {}
  };
  let now = 1000;
  const remove = () => { throw new Error('disk busy'); };
  const reminder = new CompletionVoiceReminder({ service, dir, now: () => now, remove, isBusy: () => false });
  const event = enqueue({ type: 'agent-turn-complete', 'thread-id': 'thread-1', 'turn-id': 'turn-1', cwd: '/work/项目A', 'last-assistant-message': '完成摘要' }, dir);
  reminder.tick();
  await wait(0);
  assert.equal(announced.length, 1, 'announce works even when deletion fails');
  assert.equal(announced[0].id, event.id);
  reminder.tick(); reminder.tick();
  assert.equal(announced.length, 1, 'seen-memory prevents replay when the file could not be removed');
});

function serviceHarness(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-service-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const emitted = [];
  const fetchCalls = [];
  return {
    dir, emitted, fetchCalls,
    service: new AssistantService({
      dir, emit: x => emitted.push(x), asr: {},
      fetchRequest: options.fetchRequest ?? (() => { throw new Error('network not expected'); }),
      ...options.service
    })
  };
}

const completion = { id: 'a'.repeat(64), threadId: 'thread-9', project: '电视盒子', summary: '已修复登录并补充测试', time: new Date().toISOString(), status: 'pending' };

test('reminder enablement defaults off and is an independent boolean setting', t => {
  const { service } = serviceHarness(t);
  assert.equal(service.reminderEnabled(), false);
  service.config = { ...service.config, codexVoiceReminder: true };
  assert.equal(service.reminderEnabled(), true);
});

test('announcing emits the reminder event, speaks with its own voice and keeps chat history clean', async t => {
  const { service, emitted } = serviceHarness(t);
  const before = service.history.length;
  await service.announceReminder(completion);
  const reminderEvent = emitted.find(x => x.type === 'codexReminder');
  assert.ok(reminderEvent, 'reminder event emitted for the native banner');
  assert.equal(reminderEvent.project, '电视盒子');
  assert.equal(reminderEvent.summary, '已修复登录并补充测试');
  assert.equal(reminderEvent.threadId, 'thread-9');
  assert.equal(emitted.filter(x => x.type === 'speak').length, 1, 'system voice speaks even when chat reply audio is off');
  assert.match(emitted.find(x => x.type === 'speak').text, /电视盒子的 Codex 本轮已结束/);
  assert.equal(service.history.length, before, 'reminders never enter chat history');
  assert.equal(emitted.some(x => x.type === 'message'), false);
  assert.equal(service.busy, false);
});

test('fish reminder falls back to system voice without retries on synthesis failure', async t => {
  let fishCalls = 0;
  const { service, emitted } = serviceHarness(t, {
    fetchRequest: async url => {
      if (String(url).includes('fish.audio')) { fishCalls++; return { ok: false, status: 429 }; }
      throw new Error('network not expected');
    }
  });
  service.keys = { fish: 'test' };
  service.config = { ...assistantDefaults, voice: 'fish', codexVoiceReminder: true };
  await service.announceReminder(completion);
  assert.equal(fishCalls, 1, 'no retry');
  assert.equal(emitted.filter(x => x.type === 'speak').length, 1);
  assert.ok(emitted.some(x => x.type === 'error'));
});

test('cancelled reminder never starts stale audio or a fallback voice', async t => {
  const { service, emitted } = serviceHarness(t, {
    fetchRequest: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })
  });
  service.keys = { fish: 'test' };
  service.config = { ...assistantDefaults, voice: 'fish', codexVoiceReminder: true };
  const pending = service.announceReminder(completion);
  service.cancel();
  await pending;
  assert.equal(emitted.some(x => ['play', 'speak'].includes(x.type)), false);
});

test('reminder respects the same busy gate as the dictation and chat services', t => {
  const { service } = serviceHarness(t);
  assert.equal(service.reminderBusy(), false);
  service.busy = true; assert.equal(service.reminderBusy(), true);
  service.busy = false; service.asrBusy = true; assert.equal(service.reminderBusy(), true);
  service.asrBusy = false; service.playing = true; assert.equal(service.reminderBusy(), true);
});

test('the reminder module drives the real service end to end', async t => {
  const { service, emitted } = serviceHarness(t);
  service.config = { ...service.config, codexVoiceReminder: true };
  const dir = mkdtempSync(join(tmpdir(), 'reminder-e2e-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reminder = new CompletionVoiceReminder({ service, dir });
  reminder.tick(); // baseline: nothing exists yet
  enqueue({ type: 'agent-turn-complete', 'thread-id': 'thread-9', 'turn-id': 'turn-1', cwd: '/work/电视盒子', 'last-assistant-message': '已完成' }, dir);
  reminder.tick();
  await wait(10);
  assert.equal(emitted.filter(x => x.type === 'codexReminder').length, 1);
  assert.equal(emitted.some(x => x.type === 'speak'), true);
  reminder.tick();
  assert.equal(emitted.filter(x => x.type === 'codexReminder').length, 1);
});

test('the host gates announcements on active dictation rounds', t => {
  const source = readFileSync(new URL('../src/assistant-host.mjs', import.meta.url), 'utf8');
  assert.match(source, /new CompletionVoiceReminder\(\{ service: assistant, isBusy: \(\) => dictation\.active \}\)/,
    'reminder waits while a global dictation round owns the microphone');
});
