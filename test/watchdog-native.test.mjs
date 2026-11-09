import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('page watchdog recovers an unresponsive HUD page with cooldown and a cap', { skip: process.platform !== 'darwin' ? 'Swift required' : false }, () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'assistant-watchdog-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', ...['client/AssistantWatchdog.swift', 'test/fixtures/assistant-watchdog.swift'].map(p => join(root, p)), '-o', binary], { encoding: 'utf8', timeout: 120000 });
    assert.match(execFileSync(binary, [], { encoding: 'utf8', timeout: 30000 }), /ASSISTANT_WATCHDOG_OK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the bridge wires heartbeat, process-exit recovery and mic reset', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const bridge = readFileSync(join(root, 'client', 'AssistantBridge.swift'), 'utf8');
  assert.match(bridge, /func webViewWebContentProcessDidTerminate/, 'process-exit hook implemented');
  assert.match(bridge, /evaluateJavaScript\("1\+1"/, 'heartbeat evaluates a trivial expression');
  const recover = bridge.slice(bridge.indexOf('func recoverPage'), bridge.indexOf('func send('));
  assert.match(recover, /microphone\.stop\(\)/, 'recovery stops wake listening');
  assert.match(recover, /stopAudio\(\)/, 'recovery halts playback');
  assert.match(recover, /"type": "listen", "enabled": false/, 'recovery tells the host listening stopped');
  assert.match(recover, /"type": "microphone", "enabled": false/, 'recovery resets the page mic state');
  assert.match(recover, /reminderBanner\.showNotice\(reason\)/, 'recovery surfaces a banner');
  assert.match(recover, /web\.reload\(\)/, 'recovery reloads the HUD');
  const app = readFileSync(join(root, 'client', 'App.swift'), 'utf8');
  assert.match(app, /assistant\.startWatchdog\(\)/, 'the watchdog starts with the window');
});
