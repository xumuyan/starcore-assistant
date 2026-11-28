import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../desktop/build-frontend.mjs';
const read = path => readFileSync(join(root, path), 'utf8');

test('whole-panel Beam uses the pinned upstream wrapper and escapes child content', async () => {
  const out = mkdtempSync(join(tmpdir(), 'moss-panel-ssr-'));
  try {
    await build({ stdin: { contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {BeamPanel} from './desktop/frontend/beam-panel.jsx';
      export function render(name) { return renderToStaticMarkup(React.createElement(BeamPanel,
        {className:name,label:'test'}, React.createElement('button',null,'<unsafe>'))); }
    `, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: join(out, 'panel.mjs'),
      banner: { js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);' } });
    const { render } = await import(pathToFileURL(join(out, 'panel.mjs')).href);
    for (const name of ['probe-menu', 'probe-panel']) {
      const markup = render(name);
      assert.equal((markup.match(/<div[^>]*data-beam="/g) || []).length, 1);
      assert.match(markup, new RegExp(`<section class="probe-surface ${name}" aria-label="test"><button>&lt;unsafe&gt;</button></section>`));
      assert.match(markup, /data-beam-bloom/);
      assert.doesNotMatch(markup, /<unsafe>/);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('Beam surface bounds content while preserving halo space and unchanged native controls', () => {
  const css = read('desktop/frontend/probe.css');
  assert.match(css, /padding: 16px; width: 100vw; height: 100vh/);
  assert.match(css, /max-height: calc\(100vh - 32px\);\s*overflow-y: auto/);
  assert.match(css, /\.probe-menu[^}]*flex-direction: column/);
  assert.match(css, /:focus-visible/);
  const panel = read('desktop/frontend/beam-panel.jsx');
  assert.match(panel, /import \{ BorderBeam \} from 'border-beam'/);
  assert.match(panel, /theme="dark" size="md" colorVariant="colorful"/);
  assert.doesNotMatch(panel, /VoiceBeam|fetch\(|getUserMedia|dangerouslySetInnerHTML/);
  assert.equal(JSON.parse(read('package.json')).dependencies['border-beam'], '1.4.1');
  const native = read('desktop/src-tauri/src/main.rs');
  assert.match(native, /"chooser", 220\.0, 160\.0/);
  assert.match(native, /"history", 540\.0, 260\.0/);
  assert.match(native, /"settings", 600\.0, 420\.0/);
  assert.match(native, /focusable\(!overlay\)/);
  assert.match(native, /set_ignore_cursor_events\(true\)/);
  const checker = read('desktop/check-probe-browser.mjs');
  assert.match(checker, /synthetic-ipc/);
  assert.match(checker, /timeout: 30_000, killSignal: 'SIGKILL'/);
  assert.match(checker, /result\.error/);
});
