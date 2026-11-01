import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, arch } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('dictation panel is inert, cannot take focus, and clears content without displaying a window', { skip: process.platform !== 'darwin' ? 'Swift/AppKit required' : false }, (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'dictation-panel-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', '-target', `${arch() === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx13.0`, '-framework', 'AppKit', join(root, 'client/DictationPanel.swift'), join(root, 'test/fixtures/dictation-panel.swift'), '-o', binary], { encoding: 'utf8', timeout: 120000 });
    // CI without a WindowServer still compiles and runs the pure status/layout checks.
    const output = execFileSync(binary, [], { encoding: 'utf8', timeout: 30000 });
    assert.match(output, /DICTATION_PANEL_PURE_OK/);
    assert.match(output, /DICTATION_PANEL_(INERT_OK|WINDOWSERVER_UNAVAILABLE)/);
    t.diagnostic(output.trim());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
