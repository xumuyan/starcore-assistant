import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

test('native playback ownership rejects stale callbacks and preserves legacy Node acknowledgements', { skip: process.platform !== 'darwin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-playback-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', ...['client/AssistantPlayback.swift', 'test/fixtures/assistant-playback.swift'].map(p => join(root, p)), '-o', binary], { timeout: 120000 });
    assert.match(execFileSync(binary, [], { encoding: 'utf8', timeout: 10000 }), /ASSISTANT_PLAYBACK_OK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bridge checks callback ownership before mic changes and blocks dictation during queued playback', () => {
  const bridge = read('client/AssistantBridge.swift');
  const finish = bridge.slice(bridge.indexOf('func finishedAudio'), bridge.indexOf('func setListen'));
  assert.ok(finish.indexOf('playback.finish(object)') < finish.indexOf('microphone.suspend(false)'));
  assert.match(finish, /send\(event\)/);
  for (const callback of ['audioPlayerDidFinishPlaying', 'audioPlayerDecodeErrorDidOccur', 'didFinish utterance', 'didCancel utterance']) {
    assert.ok(finish.split('\n').some(line => line.includes(callback) && line.includes('finishedAudio(')), callback);
  }
  const stop = bridge.slice(bridge.indexOf('func stopAudio()'), bridge.indexOf('func finishedAudio'));
  assert.ok(stop.indexOf('playback.stop()') < stop.indexOf('stopSpeaking'));
  const speech = bridge.slice(bridge.indexOf('case "speak":'), bridge.indexOf('case "play":'));
  assert.ok(speech.indexOf('playback.begin(utterance') < speech.indexOf('synthesizer.speak'));
  assert.match(speech, /playbackID: event\["playbackId"\]/);
  assert.match(read('client/AssistantBridge+Dictation.swift'), /playback\.isActive/);
  assert.doesNotMatch(bridge, /send\(\["type": "playbackEnded"\]\)/, 'all completions pass through identity tracking');
});
