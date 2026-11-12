import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFrontend, noticePackages, root } from '../desktop/build-frontend.mjs';

const read = path => readFileSync(resolve(root, path), 'utf8');

test('reference components bundle locally with all runtime licenses, without legacy client changes', async () => {
  const out = mkdtempSync(join(tmpdir(), 'moss-effects-'));
  try {
    const result = await buildFrontend(out);
    const inputs = Object.keys(result.metafile.inputs);
    for (const name of ['voice-ring', 'voice-glow', 'border-beam', 'thinking-orbs']) {
      assert.ok(inputs.some(path => path.includes(`node_modules/${name}/`)), `${name} is the upstream code, not a placeholder`);
    }
    for (const name of noticePackages) assert.ok(readFileSync(join(out, 'THIRD_PARTY_LICENSES.txt'), 'utf8').includes(`## ${name}@`));
    assert.ok(existsSync(join(out, 'preview.js')));
    assert.ok(existsSync(join(out, 'preview.css')));
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /https?:|iframe/i);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /media-src 'none'/);
    assert.match(read('client/build.py'), /hud\/index.html|Resources\/hud/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('visual adapters clamp levels, default hidden, render states and escape untrusted text', async () => {
  const out = mkdtempSync(join(tmpdir(), 'moss-effects-ssr-'));
  try {
    await build({
      stdin: { contents: `
        import React from 'react';
        import {renderToStaticMarkup} from 'react-dom/server';
        import {ConversationEffect,DictationEffect,normalizePhase,normalizeLevel} from './desktop/frontend/effects.jsx';
        export {normalizePhase,normalizeLevel};
        export function render(mode,props) { return renderToStaticMarkup(React.createElement(mode==='dictation'?DictationEffect:ConversationEffect,props)); }
      `, resolveDir: root }, bundle: true, platform: 'node', format: 'esm',
      outfile: join(out, 'adapter.mjs'), packages: 'bundle',
      // React's Node SSR renderer uses require; preserve it for this test-only bundle.
      banner: { js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);' },
    });
    const { render, normalizePhase, normalizeLevel } = await import(pathToFileURL(join(out, 'adapter.mjs')).href);
    for (const value of [-1, 0, NaN, Infinity, '0.5', null]) assert.equal(normalizeLevel(value), 0);
    assert.equal(normalizeLevel(2), 1); assert.equal(normalizeLevel(0.4), 0.4);
    assert.equal(normalizePhase('invalid'), 'hidden');
    for (const mode of ['conversation', 'dictation']) {
      assert.equal(render(mode, {}), '');
      assert.equal(render(mode, { phase: 'invalid' }), '');
      assert.equal(render(mode, { phase: 'hidden', text: 'must not remain visible' }), '');
      for (const phase of ['listening', 'processing', 'speaking']) {
        const markup = render(mode, { phase, text: '<script>alert(1)</script>', level: 0.5 });
        assert.match(markup, new RegExp(`data-phase="${phase}"`));
        assert.doesNotMatch(markup, /<script>/);
        const transcript = markup.match(/<p class="transcript">(.*?)<\/p>/s)?.[1].replace(/<[^>]*>/g, '');
        assert.equal(transcript, '&lt;script&gt;alert(1)&lt;/script&gt;');
      }
    }
    assert.match(render('conversation', {phase:'listening'}), /canvas/);
    assert.doesNotMatch(render('dictation', {phase:'listening'}), /正在识别/);
    assert.match(render('dictation', {phase:'processing'}), /正在识别/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('preview never acquires microphone or calls real services, and is opt-in with Esc hiding', () => {
  const source = read('desktop/frontend/effects.jsx') + read('desktop/frontend/preview.jsx');
  assert.doesNotMatch(source, /useMicrophone|getUserMedia|fetch\(|XMLHttpRequest|dangerouslySetInnerHTML/);
  assert.match(source, /useState\('hidden'\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /未录音/);
  assert.match(read('desktop/frontend/style.css'), /prefers-reduced-motion: reduce/);
});
