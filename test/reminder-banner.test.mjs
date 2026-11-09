import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('native reminder banner pure metrics and hidden window fixtures', { skip: process.platform !== 'darwin' ? 'Swift/macOS frameworks required' : false }, () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'reminder-banner-'));
  try {
    const binary = join(dir, 'fixture');
    execFileSync('swiftc', ['-swift-version', '5', '-framework', 'AppKit', '-framework', 'CoreGraphics', join(root, 'client/ReminderBanner.swift'), join(root, 'test/fixtures/reminder-banner.swift'), '-o', binary], { encoding: 'utf8', timeout: 120000 });
    const output = execFileSync(binary, [], { encoding: 'utf8', timeout: 30000 });
    assert.match(output, /REMINDER_BANNER_PURE_OK|REMINDER_BANNER_WINDOWSERVER_UNAVAILABLE/);
    if (output.includes('REMINDER_BANNER_PURE_OK')) assert.match(output, /REMINDER_BANNER_WINDOW_OK|REMINDER_BANNER_WINDOWSERVER_UNAVAILABLE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bridge routes notices and errors to the system-level banner while keeping the HUD toast', { skip: process.platform !== 'darwin' ? 'Swift/macOS frameworks required' : false }, () => {
  const source = readFileSync(new URL('../client/AssistantBridge.swift', import.meta.url), 'utf8');
  assert.match(source, /case "notice": reminderBanner\.showNotice\(event\["message"\] as\? String \?\? ""\); emit\(event\)/, 'notices reach the top banner and keep the in-window toast');
  assert.match(source, /case "error": launchingListen = false; reminderBanner\.showNotice\(event\["message"\] as\? String \?\? ""\); emit\(event\)/, 'errors reach the top banner and keep the in-window toast');
});
