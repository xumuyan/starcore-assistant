// Explicit headless Chromium layout/interaction check with a synthetic IPC adapter.
// Not macOS focus/tray acceptance. Never launches or changes installed applications.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const executable = process.env.MOSS_CHROMIUM_PATH;
if (!executable) throw new Error('Set MOSS_CHROMIUM_PATH to an existing Chromium executable');
const out = mkdtempSync(join(tmpdir(), 'moss-beam-browser-'));
try {
  await build({ entryPoints: ['desktop/frontend/probe.jsx'], bundle: true, outfile: join(out, 'probe.js'),
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-ipc', setup(builder) {
      builder.onResolve({ filter: /^@tauri-apps\/api\/(core|event)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
        let handler; let hotkeyEnabled = false;
        window.probeCalls = [];
        export async function listen(_, fn) { handler = fn; return () => {}; }
        export async function invoke(name, args) {
          window.probeCalls.push({ name, args });
          if (name === 'probe_hotkey') { hotkeyEnabled = args.enabled; handler?.({payload:{demo:null,hotkeyEnabled}}); }
          return {demo:null,hotkeyEnabled};
        }`, loader: 'js' }));
    } }] });
  const checks = `
    const check = (value, message) => { if (!value) throw new Error(message); };
    const delay = () => new Promise(resolve => setTimeout(resolve, 200));
    async function run() {
      await delay(); await delay();
      const view = new URLSearchParams(location.search).get('view');
      const beam = document.querySelector('[data-beam]');
      check(document.querySelectorAll('[data-beam]').length === 1, 'exactly one whole-panel beam');
      check(beam.firstElementChild.classList.contains('probe-surface'), 'rounded first child');
      const surface = beam.firstElementChild, rect = surface.getBoundingClientRect();
      check(rect.left >= 15 && rect.top >= 15 && rect.right <= innerWidth - 15 && rect.bottom <= innerHeight - 15, 'halo margins');
      check(getComputedStyle(surface).borderRadius === '18px', 'rounded surface');
      check(getComputedStyle(beam, '::after').pointerEvents === 'none', 'beam must not intercept input');
      check(getComputedStyle(beam, '::after').animationName !== 'none', 'upstream beam animates');
      check(document.documentElement.scrollWidth <= innerWidth, 'no horizontal clipping');
      const buttons = [...surface.querySelectorAll('button')];
      if (view === 'chooser') {
        check(buttons.length === 2, 'only history and settings entries');
        check(buttons[1].getBoundingClientRect().top >= buttons[0].getBoundingClientRect().bottom, 'vertical menu rows');
        buttons[0].click(); buttons[1].click();
        check(window.probeCalls.some(c => c.name === 'probe_open' && c.args.page === 'history'), 'history command');
        check(window.probeCalls.some(c => c.name === 'probe_open' && c.args.page === 'settings'), 'settings command');
      } else {
        check(surface.scrollHeight <= surface.clientHeight + 1, 'content fits standard window');
        check(surface.textContent.includes('无麦克风'), 'isolation notice');
        if (view === 'settings') {
          const toggle = surface.querySelector('[role=switch]');
          check(toggle.getAttribute('aria-checked') === 'false', 'default off');
          toggle.click(); await delay();
          check(toggle.getAttribute('aria-checked') === 'true', 'explicit enable');
          surface.querySelector('input').value = 'synthetic';
          buttons.find(b => b.textContent === '收音外观').click();
          check(window.probeCalls.some(c => c.name === 'probe_demo' && c.args.value === 'listening'), 'demo command');
        } else check(surface.textContent.includes('尚未接入加密历史'), 'history remains unconnected');
        buttons.find(b => b.textContent === '退出验证壳').click();
        check(window.probeCalls.some(c => c.name === 'probe_quit'), 'quit command');
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      check(window.probeCalls.some(c => c.name === 'probe_hide'), 'Escape command');
      document.getElementById('result').textContent = 'PROBE_BEAM_BROWSER_PASS';
    }
    run().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.message; });
  `;
  writeFileSync(join(out, 'index.html'), `<html><head><meta charset="utf-8"><link rel="stylesheet" href="probe.css"></head><body><div id="root"></div><pre id="result" hidden></pre><script src="probe.js"></script><script>${checks}</script></body></html>`);
  for (const [view, width, height] of [['chooser', 220, 160], ['history', 540, 260], ['settings', 600, 420]]) {
    // A fixed-size iframe avoids Chromium's minimum top-level window width.
    writeFileSync(join(out, 'frame.html'), `<html><body><iframe style="border:0;width:${width}px;height:${height}px" src="index.html?view=${view}"></iframe><pre id="outer"></pre><script>setTimeout(()=>{document.getElementById('outer').textContent=document.querySelector('iframe').contentDocument.getElementById('result').textContent},2500)</script></body></html>`);
    const result = spawnSync(executable, ['--headless', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(out, 'profile-' + view)}`, '--allow-file-access-from-files', '--virtual-time-budget=3000',
      '--dump-dom', pathToFileURL(join(out, 'frame.html')).href], { encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /<pre id="outer">PROBE_BEAM_BROWSER_PASS<\/pre>/, `${view}: ${result.stdout.match(/<pre id="outer">[^<]*/)?.[0]}`);
    console.log(`PROBE_BEAM_BROWSER_PASS ${view} ${width}x${height} (synthetic IPC, not native acceptance)`);
  }
} finally { rmSync(out, { recursive: true, force: true }); }
