import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enqueue, stateDir } from './store.mjs';

const raw = process.argv.at(-1);
// Preserve the pre-existing computer-use notifier independently of WeChat delivery.
try {
  const prior = JSON.parse(readFileSync(join(stateDir, 'previous-notify.json'), 'utf8'));
  if (prior.length) {
    const child = spawn(prior[0], [...prior.slice(1), raw], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  }
} catch {}
try { enqueue(JSON.parse(raw)); } catch { process.exitCode = 1; }
