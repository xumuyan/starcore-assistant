import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the filtering event tap never covers mouse or wheel events', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = readFileSync(join(root, 'client', 'DictationHotkey.swift'), 'utf8');
  const keyTapCreate = source.slice(source.indexOf('guard let tap = CGEvent.tapCreate'), source.indexOf('guard let source ='));
  assert.match(keyTapCreate, /options: \.defaultTap/, 'keyboard tap filters');
  assert.match(keyTapCreate, /eventsOfInterest: keyMask/, 'keyboard tap uses the key mask');
  assert.doesNotMatch(keyTapCreate, /leftMouseDown|rightMouseDown|otherMouseDown|scrollWheel/, 'filtering tap carries no pointer events');
  const pointerTapCreate = source.slice(source.indexOf('guard let pointerTap = CGEvent.tapCreate'), source.indexOf('guard let pointerSource ='));
  assert.match(pointerTapCreate, /options: \.listenOnly/, 'pointer events are observed listen-only');
  assert.match(pointerTapCreate, /eventsOfInterest: pointerMask/, 'pointer tap keeps its events');
});

test('native dictation pure audio and hotkey state fixtures', { skip: process.platform !== 'darwin' ? 'Swift/macOS frameworks required' : false }, () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'dictation-native-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'CoreGraphics', ...['client/DictationAudio.swift', 'client/DictationRecorder.swift', 'client/DictationHotkey.swift', 'test/fixtures/dictation-native.swift'].map(p => join(root, p)), '-o', binary], { encoding: 'utf8', timeout: 120000 });
    assert.match(execFileSync(binary, [], { encoding: 'utf8', timeout: 30000 }), /DICTATION_NATIVE_OK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
