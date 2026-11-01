import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('native dictation pure audio and hotkey state fixtures', { skip: process.platform !== 'darwin' ? 'Swift/macOS frameworks required' : false }, () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'dictation-native-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'CoreGraphics', ...['client/DictationAudio.swift', 'client/DictationRecorder.swift', 'client/DictationHotkey.swift', 'test/fixtures/dictation-native.swift'].map(p => join(root, p)), '-o', binary], { encoding: 'utf8', timeout: 120000 });
    assert.match(execFileSync(binary, [], { encoding: 'utf8', timeout: 30000 }), /DICTATION_NATIVE_OK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
