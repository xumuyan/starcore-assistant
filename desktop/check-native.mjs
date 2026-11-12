// Explicit native integration runner. Does not build/install the product or inject input.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const checkpoints = ['Boot', 'Bounded', 'History', 'Settings', 'Listening', 'Processing', 'Speaking', 'Dictation', 'Hidden'];
export function verifyNativeResult(result) {
  if (result.error || result.signal || result.status !== 0) throw new Error('Native self-check failed or timed out');
  const lines = String(result.stdout).trim().split(/\r?\n/).filter(line => line.startsWith('T0_'));
  const expected = [...checkpoints.map(step => `T0_CHECKPOINT ${step}`), 'T0_SELF_CHECK PASS'];
  if (JSON.stringify(lines) !== JSON.stringify(expected)) throw new Error('Incomplete or unexpected native checkpoints');
  return lines;
}
export function checkNative() {
  const binary = fileURLToPath(new URL(`./src-tauri/target/debug/moss-desktop-probe${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
  // Result is bounded; raw process logs are intentionally not printed by this runner.
  const result = spawnSync(binary, ['--self-check'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 });
  for (const line of verifyNativeResult(result)) console.log(line);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkNative(); }
  catch { console.error('T0_NATIVE_CHECK_FAILED (build the isolated probe first; no product installation)'); process.exitCode = 1; }
}
