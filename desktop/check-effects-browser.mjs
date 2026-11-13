// Optional actual-browser acceptance for the offline visual lab, not desktop input.
// Run after build:desktop:preview; provide Playwright's module path if not installed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.MOSS_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.MOSS_PLAYWRIGHT_PATH)).href : 'playwright');
const root = resolve(import.meta.dirname, '../dist/desktop-preview');
const server = createServer(async (req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (file === 'favicon.ico') { res.writeHead(204).end(); return; }
  if (!['index.html', 'preview.js', 'preview.css'].includes(file)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(resolve(root, file)));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [], external = [];
  const origin = `http://127.0.0.1:${server.address().port}/`;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  await page.goto(origin);
  assert.equal(await page.locator('.preview-stage canvas').count(), 0);
  const mode = page.getByLabel('模式'), phase = page.getByLabel('阶段'), text = page.getByLabel('示例文字');
  // Streaming follows new text, but never drags a reader back to the bottom.
  async function verifyScroll(selector) {
    const box = page.locator(selector);
    await text.fill('合成长文字。'.repeat(250));
    await page.waitForTimeout(100);
    assert.ok(await box.evaluate(e => e.scrollHeight > e.clientHeight));
    assert.ok(await box.evaluate(e => e.scrollHeight - e.scrollTop - e.clientHeight < 2));
    await box.evaluate(e => { e.scrollTop = 0; e.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await text.fill('合成长文字。'.repeat(260));
    assert.equal(await box.evaluate(e => e.scrollTop), 0);
    await box.evaluate(e => { e.scrollTop = e.scrollHeight; e.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await text.fill('合成长文字。'.repeat(270));
    assert.ok(await box.evaluate(e => e.scrollHeight - e.scrollTop - e.clientHeight < 2));
  }
  await phase.selectOption('listening');
  await page.waitForTimeout(300); // Allow the local entry transform to finish.
  const anchor = await page.locator('.voice-ring-slot').boundingBox();
  assert.equal(await page.locator('.conversation-transcript').count(), 0);
  await text.fill('首段合成文字。');
  await page.waitForTimeout(300);
  assert.equal((await page.locator('.voice-ring-slot').boundingBox()).y, anchor.y);
  await verifyScroll('.voice-content');
  assert.equal((await page.locator('.voice-ring-slot').boundingBox()).y, anchor.y);
  // The ring canvas stays mounted across phases; reply text gets a fresh group.
  await page.locator('.voice-ring-slot canvas').first().evaluate(e => { e.dataset.retained = 'yes'; });
  await text.fill('');
  await phase.selectOption('processing');
  assert.equal(await page.locator('[role="status"]').innerText(), '正在思考');
  await page.locator('.conversation-transcript').evaluate(e => { e.dataset.utterance = 'yes'; });
  await phase.selectOption('speaking');
  assert.equal(await page.locator('[role="status"]').innerText(), '正在回复');
  assert.equal(await page.locator('.conversation-transcript').getAttribute('data-utterance'), null);
  assert.equal(await page.locator('.voice-ring-slot canvas').first().getAttribute('data-retained'), 'yes');
  assert.equal((await page.locator('.voice-ring-slot').boundingBox()).y, anchor.y);

  assert.equal((await page.locator('.voice-ring-slot').boundingBox()).width, 240);
  await mode.selectOption('dictation');
  const initial = await page.locator('.dictation-strip').boundingBox();
  await phase.selectOption('processing');
  const processing = await page.locator('.dictation-strip').boundingBox();
  assert.equal(processing.height, initial.height);
  assert.ok(await page.locator('.dictation-orb-slot canvas').count());
  await verifyScroll('.dictation-text');
  assert.ok((await page.locator('.dictation-strip').boundingBox()).height <= 140);
  await text.fill('前缀。');
  await page.locator('.reveal-word').first().evaluate(e => { e.dataset.retained = 'yes'; });
  await text.fill('前缀。新增');
  assert.equal(await page.locator('.reveal-word').first().getAttribute('data-retained'), 'yes');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.dictation-effect').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.getByRole('button', { name: '播放完整语音流程（合成）' }).click();
  await page.waitForTimeout(1200);
  assert.equal(await mode.inputValue(), 'dictation');
  assert.equal(await page.locator('.dictation-effect').getAttribute('data-phase'), 'listening');
  await page.waitForTimeout(2100);
  assert.equal(await page.locator('.dictation-effect').getAttribute('data-phase'), 'processing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2600);
  assert.equal(await page.locator('.preview-stage canvas').count(), 0);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('EFFECTS_BROWSER_PASS: anchored ring, phase placeholders/canvas retention, tail-follow/read-back, stable orb slot, bounded text, retained prefix, reduced motion, mode playback, Esc, offline');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
