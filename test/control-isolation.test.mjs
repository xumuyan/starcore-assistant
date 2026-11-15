import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('control stop honors the same injected launcher as start/status without changing production defaults', () => {
  const node = read('src/client-control.mjs');
  const rust = read('rust-host/src/control.rs');
  assert.match(node, /const launchctl = process\.env\.MOSS_LAUNCHCTL \|\| '\/bin\/launchctl'/);
  const nodeStop = node.split("} else if (command === 'stop') {")[1]?.split("} else if (command !== 'status')")[0];
  assert.ok(nodeStop);
  assert.match(nodeStop, /execFileSync\(launchctl, \['bootout'/);
  assert.doesNotMatch(nodeStop, /execFileSync\(['"]/);
  const rustStop = rust.split('} else if command == "stop" {')[1]?.split('\n    }')[0];
  assert.ok(rustStop);
  assert.match(rustStop, /stop_agents\(&launchctl, domain\)/);
  assert.doesNotMatch(rustStop, /stop_agents\("/);
  assert.match(read('rust-host/src/status.rs'), /var\("MOSS_LAUNCHCTL"\)\.unwrap_or_else\(\|_\| "\/bin\/launchctl"/);
});

test('stop parity test injects launchers into both engines and checks all commands exactly', () => {
  const source = read('test/rust-host.test.mjs');
  const stop = source.split("test('rust host stop matches node output")[1]?.split("test('rust host serve")[0];
  assert.ok(stop);
  assert.match(stop, /runWithLaunchctl\(home, nodeLauncher, process\.execPath/);
  assert.match(stop, /runWithLaunchctl\(home, rustLauncher, mossHost/);
  assert.doesNotMatch(stop, /\brun\(home,/);
  for (const engine of ['Node', 'Rust']) assert.ok(stop.includes(`assert.equal(readFileSync(log${engine}, 'utf8'), expected)`));
  assert.match(source, /timeout: 30000/);
});
