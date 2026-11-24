import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('native overlay placement covers secondary DPI, negative origins and primary cursor scaling', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moss-placement-'));
  try {
    const binary = join(dir, process.platform === 'win32' ? 'placement.exe' : 'placement');
    const source = fileURLToPath(new URL('../desktop/src-tauri/src/placement.rs', import.meta.url));
    const compile = spawnSync('rustc', ['--test', source, '-o', binary], {
      encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || '1.100.0' },
    });
    assert.equal(compile.status, 0, compile.error?.message || compile.stderr);
    const run = spawnSync(binary, [], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    assert.match(run.stdout, /5 passed; 0 failed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
