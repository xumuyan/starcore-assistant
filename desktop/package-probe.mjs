// Explicit local T0 build only: no installation, launch, permissions or service changes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appName = 'MOSS T0 Probe.app';
const executable = 'Contents/MacOS/moss-desktop-probe';
export function checkedResult(result) {
  // status=0 does not override timeout, signal or launch failure.
  if (result.error || result.signal || result.status !== 0) throw new Error('Probe build/check command failed');
  return String(result.stdout ?? '');
}
function run(command, args, cwd = root, timeout = 60_000) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  try { return checkedResult(result); }
  catch { throw new Error(`Command ${basename(command)} failed (status=${result.status}, signal=${result.signal ?? 'none'}, error=${result.error?.code ?? 'none'})`); }
}
export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function addEntry(hash, base, relative) {
  const path = join(base, relative), stat = lstatSync(path);
  hash.update(JSON.stringify([relative, stat.mode & 0o777, stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : 'file']));
  if (stat.isSymbolicLink()) hash.update(JSON.stringify(readlinkSync(path)));
  else if (stat.isFile()) hash.update(hashFile(path));
  else if (!stat.isDirectory()) throw new Error('Unsupported file type');
}
export function hashTree(base) {
  const hash = createHash('sha256');
  function walk(relative) {
    addEntry(hash, base, relative);
    if (!lstatSync(join(base, relative)).isDirectory()) return;
    for (const name of readdirSync(join(base, relative)).sort()) walk(join(relative, name));
  }
  walk('.');
  return hash.digest('hex');
}
export function sourceStamp() {
  const commit = run('git', ['rev-parse', 'HEAD']).trim();
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=all']).length > 0;
  const files = [...new Set(run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const hash = createHash('sha256');
  for (const file of files) addEntry(hash, root, file);
  return { commit, dirty, sourceSha256: hash.digest('hex') };
}
export function assertStableSource(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source changed during build; artifact not accepted');
}
export function validateIdentity(info) {
  if (info.CFBundleIdentifier !== 'dev.starcore.moss.t0-probe' || info.CFBundleExecutable !== 'moss-desktop-probe' || info.CFBundlePackageType !== 'APPL') {
    throw new Error('Not the isolated T0 application');
  }
}
export function verifyBundle(app, expectedBinaryHash, command = run) {
  if (lstatSync(app).isSymbolicLink() || !lstatSync(app).isDirectory()) throw new Error('Bundle must be a real directory');
  const infoPath = join(app, 'Contents/Info.plist');
  if (!lstatSync(infoPath).isFile() || !lstatSync(join(app, executable)).isFile()) throw new Error('Identity and executable must be regular files');
  validateIdentity(JSON.parse(command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPath])));
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const binarySha256 = hashFile(join(app, executable));
  if (binarySha256 !== expectedBinaryHash) throw new Error('Bundled binary differs from the freshly built executable');
  return { binarySha256, bundleSha256: hashTree(app) };
}
export function packageProbe() {
  if (process.platform !== 'darwin') throw new Error('Local macOS packaging only');
  const before = sourceStamp();
  // The repository-pinned CLI is used directly; never npx-download a package.
  run(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--debug', '--bundles', 'app'], join(root, 'desktop'), 20 * 60_000);
  const built = join(root, 'desktop/src-tauri/target/debug');
  const expected = hashFile(join(built, 'moss-desktop-probe'));
  // Never copy into an existing bundle: stale resources/signature files cannot survive.
  const output = mkdtempSync(join(tmpdir(), 'moss-t0-artifact-'));
  try {
    const app = join(output, appName);
    run('/usr/bin/ditto', [join(built, 'bundle/macos', appName), app]);
    if (hashFile(join(app, executable)) !== expected) throw new Error('Copied binary differs from build output');
    // Tauri's local bundle can retain an executable-only signature; seal the new copy.
    run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
    const hashes = verifyBundle(app, hashFile(join(app, executable)));
    assertStableSource(before, sourceStamp());
    const manifest = {
      schema: 1, identity: 'dev.starcore.moss.t0-probe', profile: 'debug',
      ...before, ...hashes, buildBinarySha256: expected, builtAt: new Date().toISOString(),
      acceptance: 'build-and-signature-only', installed: false, launched: false,
      notarized: false,
    };
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return output;
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}
export function verifyArtifact(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.identity !== 'dev.starcore.moss.t0-probe' || !/^[a-f0-9]{64}$/.test(manifest.binarySha256)) throw new Error('Invalid local manifest');
  const hashes = verifyBundle(join(directory, appName), manifest.binarySha256);
  if (hashes.bundleSha256 !== manifest.bundleSha256) throw new Error('Bundle changed since packaging');
  return hashes;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 2) console.log(`T0_ARTIFACT_READY ${packageProbe()}`);
    else if (process.argv.length === 4 && process.argv[2] === '--verify') {
      verifyArtifact(resolve(process.argv[3]));
      console.log('T0_ARTIFACT_VERIFIED (local integrity only; not UI acceptance)');
    } else throw new Error('Usage: node desktop/package-probe.mjs [--verify directory]');
  } catch (error) {
    console.error(`T0_ARTIFACT_FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
