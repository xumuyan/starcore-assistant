import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFrontend, noticePackages, root } from '../desktop/build-frontend.mjs';
import { transcriptSegments } from '../desktop/frontend/transcript.mjs';
import { referenceSequence, dictationSequence, sequenceForMode } from '../desktop/frontend/reference-sequence.mjs';

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
        const transcript = markup.match(/<p class="transcript"[^>]*>(.*?)<\/p>/s)?.[1].replace(/<[^>]*>/g, '');
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

test('reference layout keeps the ring square and bounds streaming transcripts', () => {
  const css = read('desktop/frontend/style.css');
  assert.doesNotMatch(css, /\.conversation-effect\s*>\s*div\s*\{\s*width:\s*100%/);
  assert.match(css, /\.voice-ring-slot\s*\{[^}]*width: 240px;[^}]*height: 240px;/);
  assert.match(css, /\.voice-content\s*\{[^}]*max-height: 112px;[^}]*overflow-y: auto/);
  const source = read('desktop/frontend/effects.jsx');
  assert.match(source, /<BorderBeam[^>]*><section className="beam-card">\s*<VoiceBeam/);
  assert.match(source, /key=\{phase === 'speaking' \? 'reply' : 'utterance'\}/);
  const prefix = transcriptSegments('沐言，请');
  const grown = transcriptSegments('沐言，请打开浏览器。');
  assert.deepEqual(grown.slice(0, prefix.length), prefix);
  assert.equal(transcriptSegments('🪐你好').map(item => item.word).join(''), '🪐你好');
  assert.equal(transcriptSegments('x'.repeat(9000)).map(item => item.word).join('').length, 8000);
  assert.equal(new Set(grown.map(item => `${item.offset}:${item.word}`)).size, grown.length);
});

test('explicit synthetic rehearsal covers the main reference flow and cancels timers', () => {
  assert.equal(referenceSequence[0].phase, 'listening');
  assert.equal(referenceSequence[0].text, '');
  assert.equal(referenceSequence.at(-1).phase, 'hidden');
  assert.ok(referenceSequence.some(frame => frame.phase === 'processing' && frame.text));
  assert.ok(referenceSequence.some(frame => frame.phase === 'speaking' && frame.text));
  assert.ok(referenceSequence.every((frame, index) => index === 0 || frame.at > referenceSequence[index - 1].at));
  const source = read('desktop/frontend/preview.jsx');
  assert.match(source, /useState\(false\)/);
  assert.match(source, /timers\.forEach\(clearTimeout\)/);
  assert.match(source, /window\.addEventListener\('keydown', cancel\)/);
  assert.match(source, /播放完整语音流程（合成）/);
});


test('dictation rehearsal stays in selected mode and switching from hidden reveals it', () => {
  assert.equal(sequenceForMode('dictation'), dictationSequence);
  assert.equal(sequenceForMode('conversation'), referenceSequence);
  assert.equal(dictationSequence[0].phase, 'listening');
  assert.equal(dictationSequence.at(-1).phase, 'hidden');
  assert.ok(dictationSequence.some(frame => frame.phase === 'processing'));
  assert.ok(!dictationSequence.some(frame => frame.phase === 'speaking'));
  const source = read('desktop/frontend/preview.jsx');
  assert.match(source, /sequenceForMode\(mode\)\.map/);
  assert.doesNotMatch(source, /function rehearse\(\) \{ setMode/);
  assert.match(source, /function changeMode[^}]*setPhase\('listening'\)/);
  assert.match(source, /mode === 'conversation' && <option value="speaking"/);
});

test('streaming viewport follows the tail with tolerance and preserves a scrolled-back position', async () => {
  const { isNearTranscriptEnd } = await import('../desktop/frontend/transcript-scroll.mjs');
  assert.equal(isNearTranscriptEnd({ scrollHeight: 600, scrollTop: 488, clientHeight: 112 }), true);
  assert.equal(isNearTranscriptEnd({ scrollHeight: 600, scrollTop: 467, clientHeight: 112 }), true);
  assert.equal(isNearTranscriptEnd({ scrollHeight: 600, scrollTop: 100, clientHeight: 112 }), false);
  assert.equal(isNearTranscriptEnd({ scrollHeight: 80, scrollTop: 0, clientHeight: 112 }), true);
  const source = read('desktop/frontend/effects.jsx');
  assert.match(source, /if \(following.current && viewport.current\)/);
  assert.match(source, /following.current = isNearTranscriptEnd/);
  assert.match(source, /TranscriptViewport className="dictation-text"/);
  const css = read('desktop/frontend/style.css');
  assert.match(css, /\.dictation-orb-slot[^}]*flex: 0 0 64px/);
  assert.match(css, /\.dictation-text[^}]*max-height: 112px/);
  assert.match(css, /prefers-reduced-motion: reduce[^}]*\.dictation-effect \{ animation: none/);
});
