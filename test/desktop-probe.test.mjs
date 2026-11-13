import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFrontend, root } from '../desktop/build-frontend.mjs';
const read = path => readFileSync(join(root, path), 'utf8');

test('T0 has isolated identity, hidden windows, bounded ACL and no service plugins', () => {
  const config = JSON.parse(read('desktop/src-tauri/tauri.conf.json'));
  assert.equal(config.identifier, 'dev.starcore.moss.t0-probe');
  assert.deepEqual(config.app.windows, []);
  assert.equal(config.bundle.active, false);
  assert.match(config.app.security.csp, /connect-src ipc: http:\/\/ipc.localhost;/);
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval|https:|\*/);
  const acl = JSON.parse(read('desktop/src-tauri/capabilities/probe.json'));
  assert.deepEqual(acl.windows, ['chooser', 'history', 'settings', 'overlay']);
  assert.deepEqual(acl.permissions, ['core:event:allow-listen', 'core:event:allow-unlisten', 'allow-probe-commands']);
  const permission = read('desktop/src-tauri/permissions/probe.toml');
  for (const command of ['snapshot','open','demo','hide','hotkey','quit']) {
    assert.ok(permission.includes(`"probe_${command}"`));
    assert.ok(read('desktop/src-tauri/build.rs').includes(`"probe_${command}"`), 'custom commands participate in generated ACL');
  }
  assert.doesNotMatch(read('desktop/src-tauri/Cargo.toml'), /tauri-plugin-(shell|fs|http|opener)/);
});

test('T0 native declarations preserve focus separation and transient Escape registration', () => {
  const source = read('desktop/src-tauri/src/main.rs');
  assert.match(source, /visible\(false\)/);
  assert.match(source, /focused\(false\)/);
  assert.match(source, /focusable\(!overlay\)/);
  assert.match(source, /always_on_top\(true\)/);
  assert.match(source, /set_ignore_cursor_events\(true\)/);
  assert.match(source, /unregister\("Escape"\)/);
  assert.match(source, /--show-chooser/);
  const demo = source.split('fn demo(')[1].split('#[tauri::command]')[0];
  assert.doesNotMatch(demo.replace(/\/\/[^\n]*/g, ''), /set_focus\(/);
  const model = read('desktop/src-tauri/src/model.rs');
  assert.match(model, /pub enum Page/);
  assert.match(model, /pub enum Demo/);
  assert.doesNotMatch(source, /std::fs|Command::new|rust.host|assistant-host|reqwest|UserDefaults/);
});

test('T0 page bundles original visuals and IPC offline, keeping browser preview separate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moss-t0-'));
  try {
    const result = await buildFrontend(dir, { probe: true });
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(inputs.some(path => path.includes('@tauri-apps/api/core')));
    assert.ok(inputs.some(path => path.includes('node_modules/motion/') || path.includes('node_modules/framer-motion/')), 'motion runtime is bundled, not linked from a CDN');
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /probe\.js/);
    assert.match(html, /probe\.css/);
    assert.doesNotMatch(html, /Content-Security-Policy|preview\.js/);
    const notices = readFileSync(join(dir, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
    assert.match(notices, /@tauri-apps\/api@2\.12\.4/);
    assert.match(notices, /## motion@14\.12\.0/);
    const page = read('desktop/frontend/probe.jsx');
    assert.doesNotMatch(page, /fetch\(|getUserMedia|localStorage|dangerouslySetInnerHTML/);
    assert.match(page, /hotkeyEnabled: false/);
    assert.match(page, /不是清空后的历史/);
    assert.match(page, /unlisten\(\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('diagnostic mode is explicit and never relaxes the frameless popover windows', () => {
  const native = read('desktop/src-tauri/src/main.rs');
  const model = read('desktop/src-tauri/src/model.rs');
  assert.match(model, /arg == "--diagnostic-controls"/);
  assert.doesNotMatch(model, /standard_window/);
  assert.match(native, /ActivationPolicy::Regular/);
  assert.match(native, /ActivationPolicy::Accessory/);
  assert.match(native, /decorations\(false\)/);
  assert.match(native, /transparent\(true\)/);
  assert.match(native, /always_on_top\(true\)/);
  assert.match(native, /· diagnostic/);
  assert.doesNotMatch(read('desktop/src-tauri/tauri.macos.conf.json'), /macOSPrivateApi.*false/);
});

test('menu popover anchors under the tray icon, frameless, closing on blur or page open', () => {
  const native = read('desktop/src-tauri/src/main.rs');
  for (const pattern of [/TrayIconEvent::Click/, /fn anchored_window_origin/, /available_monitors\(\)/,
    /fn physical_tray_rect/, /tray\.rect\(\)/,
    /set_position/, /Focused\(false\)/, /fn hide_pages/, /shadow\(false\)/, /decorations\(false\)/,
    /170\.0, 54\.0/, /"chooser" \| "history" \| "settings"/]) {
    assert.match(native, pattern);
  }
  const page = read('desktop/frontend/probe.jsx');
  const chooser = page.split('className="probe-chooser"')[1].split("if (view !== 'history'")[0];
  assert.match(chooser, /历史记录/);
  assert.match(chooser, /设置/);
  assert.doesNotMatch(chooser, /BeamCard/);
  const pages = page.split("if (view !== 'history'")[1];
  assert.match(pages, /<Switch/);
  assert.match(pages, /<Input/);
  assert.match(pages, /<Button/);
  assert.doesNotMatch(pages, /BeamCard/);
  const beui = read('desktop/frontend/beui.jsx');
  for (const pattern of [/beui\.dev/, /MIT/, /useReducedMotion/, /SPRING_PRESS/, /role="switch"/, /stiffness: 800/]) {
    assert.match(beui, pattern);
  }
  assert.doesNotMatch(beui, /fetch\(|getUserMedia|dangerouslySetInnerHTML/);
  assert.match(read('desktop/frontend/beui.css'), /prefers-reduced-motion: reduce/);
  assert.match(read('licenses/beui-motion-MIT.txt'), /Saurabh Chauhan/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /beUI motion/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.motion, '14.12.0');
  assert.equal(pkg.dependencies.clsx, undefined);
  assert.equal(pkg.dependencies['tailwind-merge'], undefined);
});
