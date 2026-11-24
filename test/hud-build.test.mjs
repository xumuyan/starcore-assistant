import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

test('HUD-only build bundles all local scripts without installing or packaging the app', () => {
  const root = mkdtempSync(join(tmpdir(), 'muyan-hud-build-'));
  mkdirSync(join(root, 'client'));
  const script = join(root, 'client', 'build.py');
  copyFileSync(new URL('../client/build.py', import.meta.url), script);
  const python = `
import json, runpy, subprocess, sys
from pathlib import Path
script = sys.argv[1]
Path.home = classmethod(lambda cls: Path(script).parent.parent)
commands = []
subprocess.run = lambda command, **kwargs: commands.append(command)
sys.argv = [script, '--hud-only']
try:
    runpy.run_path(script, run_name='__main__')
except SystemExit as result:
    if result.code not in (0, None):
        raise
print(json.dumps(commands))
`;
  const output = execFileSync('python3', ['-c', python, script], { encoding: 'utf8', timeout: 30000 });
  const commands = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(commands.length, 3);
  assert.deepEqual(commands.map(command => basename(command[1])), ['renderer.mjs', 'liquid-glass.mjs', 'thinking-orb.mjs']);
  assert.ok(commands.every(command => basename(command[0]) === 'esbuild' && command.includes('--target=safari16')));
  assert.equal(existsSync(join(root, 'dist')), false, 'HUD build must exit before native app packaging');
});
