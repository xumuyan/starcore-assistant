import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkedResult, hashFile, hashTree, validateIdentity, verifyBundle, assertStableSource } from '../desktop/package-probe.mjs';

const identity = { CFBundleIdentifier: 'dev.starcore.moss.t0-probe', CFBundleExecutable: 'moss-desktop-probe', CFBundlePackageType: 'APPL' };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 't0-package-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = join(dir, 'Probe.app');
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
  writeFileSync(join(app, 'Contents/Info.plist'), 'synthetic plist');
  writeFileSync(join(app, 'Contents/MacOS/moss-desktop-probe'), 'synthetic executable');
  const hash = hashFile(join(app, 'Contents/MacOS/moss-desktop-probe'));
  return { dir, app, hash };
}
test('packaging command requires success without error, timeout or signal', () => {
  assert.equal(checkedResult({ status: 0, stdout: 'ok' }), 'ok');
  for (const result of [{ status: 1 }, { status: null }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) }]) {
    assert.throws(() => checkedResult(result));
  }
});
test('only the isolated T0 identity and fixed executable are accepted', () => {
  validateIdentity(identity);
  for (const change of [{ CFBundleIdentifier: 'local.codex-weixin.client' }, { CFBundleExecutable: '../MuYan' }, { CFBundlePackageType: 'BNDL' }]) {
    assert.throws(() => validateIdentity({ ...identity, ...change }));
  }
});
test('bundle verification checks strict signature, identity and freshly built binary', t => {
  const { app, hash } = fixture(t), calls = [];
  const runner = (command, args) => { calls.push([command, args]); return command.endsWith('plutil') ? JSON.stringify(identity) : ''; };
  const result = verifyBundle(app, hash, runner);
  assert.equal(result.binarySha256, hash);
  assert.deepEqual(calls[1], ['/usr/bin/codesign', ['--verify', '--deep', '--strict', app]]);
  assert.throws(() => verifyBundle(app, '0'.repeat(64), runner), /differs/);
  assert.throws(() => verifyBundle(app, hash, command => {
    if (command.endsWith('codesign')) throw new Error('signature failed');
    return JSON.stringify(identity);
  }), /signature failed/);
});
test('bundle inventory detects added resources, changed contents, permissions and symlink targets', t => {
  const { app } = fixture(t);
  const original = hashTree(app), file = join(app, 'Contents/resource');
  writeFileSync(file, 'a'); const added = hashTree(app); assert.notEqual(added, original);
  writeFileSync(file, 'b'); assert.notEqual(hashTree(app), added);
  const beforeMode = hashTree(app); chmodSync(file, 0o700); assert.notEqual(hashTree(app), beforeMode);
  rmSync(file); assert.equal(hashTree(app), original);
  symlinkSync('missing-one', file); const firstLink = hashTree(app);
  rmSync(file); symlinkSync('missing-two', file); assert.notEqual(hashTree(app), firstLink);
});
test('bundle root and executable symlinks cannot redirect validation', t => {
  const { dir, app, hash } = fixture(t);
  const link = join(dir, 'linked.app'); symlinkSync(app, link);
  assert.throws(() => verifyBundle(link, hash), /real directory/);
  const binary = join(app, 'Contents/MacOS/moss-desktop-probe');
  rmSync(binary); symlinkSync('../Info.plist', binary);
  assert.throws(() => verifyBundle(app, hash), /regular files/);
});
test('source edits or commits during packaging invalidate provenance', () => {
  const before = { commit: 'a'.repeat(40), dirty: true, sourceSha256: 'b'.repeat(64) };
  assertStableSource(before, { ...before });
  for (const change of [{ commit: 'c'.repeat(40) }, { dirty: false }, { sourceSha256: 'd'.repeat(64) }]) {
    assert.throws(() => assertStableSource(before, { ...before, ...change }), /Source changed/);
  }
});
test('packager never installs or launches and documentation keeps acceptance separate', () => {
  const source = readFileSync(new URL('../desktop/package-probe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/Applications|launchctl|osascript|pkill|--self-check/);
  assert.match(source, /mkdtempSync/);
  assert.match(source, /sourceStamp\(\)/);
  assert.ok(source.indexOf("Copied binary differs from build output") < source.indexOf("['--force', '--sign', '-', app]"));
  assert.match(source, /buildBinarySha256: expected/);
  assert.match(source, /installed: false, launched: false/);
  const docs = readFileSync(new URL('../desktop/README.md', import.meta.url), 'utf8');
  assert.match(docs, /package-probe\.mjs --verify/);
  assert.match(docs, /不是公证、发行签名或真机验收/);
});
