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
  // CSS transparency and composited alpha: no rectangular stage or root backdrop.
  async function verifyTransparency() {
    assert.equal(await page.locator('html, body, #root, .preview-stage').evaluateAll(nodes =>
      nodes.every(node => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)')), true);
    const stage = page.locator('.preview-stage');
    assert.equal(await stage.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    const png = await page.screenshot({ clip: await stage.boundingBox(), omitBackground: true });
    const alpha = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]
        .map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
    }, `data:image/png;base64,${png.toString('base64')}`);
    assert.deepEqual(alpha, [0, 0, 0, 0], 'overlay corners have zero alpha, not a black rectangle');
  }
  await verifyTransparency();
  await phase.selectOption('listening');
  await verifyTransparency();
  assert.equal(await page.locator('.voice-ring-slot canvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }), 0);
  await mode.selectOption('dictation'); await phase.selectOption('processing');
  await verifyTransparency();
  await mode.selectOption('conversation'); await phase.selectOption('hidden');
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
  // Deterministic synthetic callback clock, not OS input or a live service.
  await page.clock.install();
  await page.getByRole('button', { name: '测试取消与迟到事件（合成）' }).click();
  await page.clock.runFor(1100);
  assert.equal(await page.locator('.event-stage .conversation-effect').getAttribute('data-phase'), 'processing');
  await page.clock.runFor(1000);
  assert.equal(await page.locator('.event-stage canvas').count(), 0);
  assert.equal(await page.locator('.event-status').innerText(), '已忽略 reply · 回合 1');
  await page.clock.runFor(1500);
  assert.equal(await page.locator('.event-stage .transcript').innerText(), '新一轮合成听写');
  assert.equal(await page.locator('.event-stage .dictation-effect').getAttribute('data-phase'), 'listening');
  assert.equal(await page.locator('.event-status').innerText(), '已忽略 reply · 回合 1');
  await page.clock.runFor(400);
  assert.equal(await page.locator('.event-status').innerText(), '已忽略 begin · 回合 3');
  assert.equal(await page.locator('.event-stage').getAttribute('data-run'), '2');
  await page.clock.runFor(400);
  assert.equal(await page.locator('.event-stage .dictation-effect').getAttribute('data-phase'), 'processing');
  await page.clock.runFor(1100);
  assert.equal(await page.locator('.event-stage canvas').count(), 0);
  await page.getByRole('button', { name: '测试取消与迟到事件（合成）' }).click();
  await page.clock.runFor(600);
  assert.equal(await page.locator('.event-stage .transcript').innerText(), '第一轮合成提问');
  await page.keyboard.press('Escape');
  await page.clock.runFor(6000);
  assert.equal(await page.locator('.event-stage').count(), 0);
  assert.equal(await page.locator('.preview-stage canvas').count(), 0);
  for (const branch of ['played', 'muted', 'failed', 'cancelled']) {
    await page.getByLabel('播放分支').selectOption(branch);
    await page.getByRole('button', { name: '测试回复与播放状态（合成）' }).click();
    await page.clock.runFor(1100);
    const stage = page.locator('.event-stage');
    const effect = page.locator('.event-stage .conversation-effect');
    assert.equal(await stage.getAttribute('data-activity'), 'ready');
    assert.equal(await effect.getAttribute('data-phase'), 'listening');
    assert.equal(await stage.getAttribute('data-level'), '0');
    assert.equal(await page.locator('.voice-activity').innerText(), '回复文字已就绪');
    await page.locator('.conversation-transcript').evaluate(e => { e.dataset.replyGroup = 'retained'; });
    const reply = await page.locator('.event-stage .transcript').innerText();
    await page.clock.runFor(600);
    assert.equal(await stage.getAttribute('data-activity'), branch === 'muted' ? 'muted' : 'synthesizing');
    assert.equal(await page.locator('.voice-activity').innerText(), branch === 'muted' ? '朗读已关闭' : '正在生成语音');
    await page.clock.runFor(1200);
    if (branch === 'cancelled') {
      assert.equal(await stage.getAttribute('data-activity'), 'closed');
      assert.equal(await stage.locator('canvas').count(), 0);
      assert.equal(await page.locator('.event-status').innerText(), '已忽略 playback-started · 回合 1');
    } else {
      const expected = branch === 'played' ? 'playing' : branch === 'failed' ? 'playback-failed' : 'muted';
      assert.equal(await stage.getAttribute('data-activity'), expected);
      assert.equal(await effect.getAttribute('data-phase'), branch === 'played' ? 'speaking' : 'listening');
      assert.equal(await stage.getAttribute('data-level'), branch === 'played' ? '0.65' : '0');
      assert.equal(await page.locator('.event-stage .transcript').innerText(), reply);
      assert.equal(await page.locator('.conversation-transcript').getAttribute('data-reply-group'), 'retained');
      if (branch === 'failed') assert.equal(await page.locator('.voice-activity').innerText(), '语音播放失败 · 文字已保留');
      await page.clock.runFor(600);
      assert.equal(await stage.getAttribute('data-activity'), branch === 'played' ? 'completed' : expected);
      if (branch === 'played') assert.equal(await page.locator('.voice-activity').innerText(), '播放已结束');
      assert.equal(await stage.getAttribute('data-level'), '0');
    }
    await page.clock.runFor(1900);
    assert.equal(await stage.getAttribute('data-activity'), branch === 'cancelled' ? 'closed' : 'listening');
    if (branch !== 'cancelled') {
      assert.equal(await stage.getAttribute('data-run'), '2');
      assert.equal(await stage.locator('.transcript').count(), 0);
    }
    await page.keyboard.press('Escape');
    await page.clock.runFor(6000);
    assert.equal(await page.locator('.preview-stage canvas').count(), 0);
  }
  // The primary full-flow button now uses the same reducer/timer owner.
  await mode.selectOption('conversation');
  const fullFlow = page.getByRole('button', { name: '播放完整语音流程（合成）' });
  await fullFlow.click();
  const fullStage = page.locator('.event-stage');
  for (const [time, activity, level] of [[3300, 'thinking', '0'], [1100, 'ready', '0'],
    [900, 'synthesizing', '0'], [1000, 'playing', '0'], [300, 'playing', '0.56'], [1500, 'completed', '0']]) {
    await page.clock.runFor(time);
    assert.equal(await fullStage.getAttribute('data-activity'), activity);
    assert.equal(await fullStage.getAttribute('data-level'), level);
    assert.equal(await mode.isDisabled(), true);
  }
  await page.clock.runFor(500);
  assert.equal(await fullStage.getAttribute('data-run'), '2');
  assert.equal(await fullStage.getAttribute('data-activity'), 'listening');
  assert.equal(await fullStage.locator('.transcript').count(), 0);
  await page.clock.runFor(1500);
  assert.equal(await fullStage.getAttribute('data-activity'), 'closed');
  assert.equal(await fullStage.locator('canvas').count(), 0);
  await page.getByRole('button', { name: '返回手动外观检查' }).click();
  assert.equal(await mode.isDisabled(), false);
  await phase.selectOption('listening'); await verifyTransparency();
  // Restart and switch experiments during synthesis: old end/resume timers must die.
  await fullFlow.click(); await page.clock.runFor(5400);
  await fullFlow.click(); await page.clock.runFor(100);
  assert.equal(await fullStage.getAttribute('data-activity'), 'listening');
  assert.equal(await fullStage.getAttribute('data-run'), '1');
  await page.getByRole('button', { name: '测试取消与迟到事件（合成）' }).click();
  await page.clock.runFor(5600);
  assert.equal(await fullStage.getAttribute('data-activity'), 'closed');
  await page.clock.runFor(5000);
  assert.equal(await fullStage.getAttribute('data-activity'), 'closed');
  await page.getByRole('button', { name: '返回手动外观检查' }).click();
  await mode.selectOption('dictation'); await fullFlow.click();
  await page.clock.runFor(1900);
  assert.equal(await fullStage.locator('.transcript').innerText(), '这是一段按键听写的合成文字。');
  await page.clock.runFor(1200);
  assert.equal(await fullStage.getAttribute('data-activity'), 'thinking');
  assert.ok(await fullStage.locator('.dictation-orb-slot canvas').count());
  await page.clock.runFor(2500);
  assert.equal(await fullStage.getAttribute('data-activity'), 'closed');
  await page.getByRole('button', { name: '返回手动外观检查' }).click();
  await phase.selectOption('listening');
  assert.equal(await page.locator('.dictation-effect').getAttribute('data-phase'), 'listening');
  await page.keyboard.press('Escape');
  await page.clock.resume();
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.setViewportSize({ width: 960, height: 720 });
  assert.equal((await page.locator('.preview-stage').boundingBox()).width, 620);
  assert.equal((await page.locator('.preview-stage').boundingBox()).height, 440);
  await page.getByLabel('画布尺寸').selectOption('narrow');
  assert.equal((await page.locator('.preview-stage').boundingBox()).width, 320);
  await page.getByLabel('画布尺寸').selectOption('desktop');
  // Reuse the production overlay CSS in a browser-sized viewport, not just the
  // roomy preview stage. This tests layout bounds, not native window behavior.
  await page.addStyleTag({ content: await readFile(resolve(import.meta.dirname, 'frontend/probe.css'), 'utf8') });
  await page.addStyleTag({ content: '.preview-controls { display: none; }' });
  await page.locator('.preview-stage').evaluate(e => { e.className = 'probe-overlay'; });
  async function inside(selector, width, height) {
    const rect = await page.locator(selector).boundingBox();
    assert.ok(rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
      `${selector} outside ${width}x${height}: ${JSON.stringify(rect)}`);
  }
  for (const width of [620, 390, 320]) {
    await page.setViewportSize({ width, height: 440 });
    for (const fontSize of ['16px', '32px']) {
      await page.addStyleTag({ content: `body { font-size: ${fontSize}; }` });
      for (const selectedMode of ['conversation', 'dictation']) {
        // Hidden controls remain usable through DOM events without desktop input.
        await mode.evaluate((e, value) => { e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); }, selectedMode);
        for (const selectedPhase of ['listening', 'processing', ...(selectedMode === 'conversation' ? ['speaking'] : [])]) {
          await phase.evaluate((e, value) => { e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); }, selectedPhase);
          for (const content of ['', '无空格长串'.repeat(60)]) {
            // Use the native input setter so React observes the synthetic text change.
            await text.evaluate((e, value) => {
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value);
              e.dispatchEvent(new Event('input', { bubbles: true }));
            }, content);
            assert.equal(await text.inputValue(), content);
            if (content) assert.equal(await page.locator('.transcript').innerText(), content);
            const effect = selectedMode === 'conversation' ? '.conversation-effect' : '.dictation-effect';
            await inside(effect, width, 440);
            if (selectedMode === 'conversation') await inside('.voice-ring-slot', width, 440);
            if (content || selectedPhase !== 'listening') {
              await inside(selectedMode === 'conversation' ? '.beam-card' : '.dictation-strip', width, 440);
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}/${fontSize}/${selectedMode}/${selectedPhase}`);
          }
        }
      }
    }
  }
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('EFFECTS_BROWSER_PASS: transparent root/stage and zero-alpha corners, anchored ring, phase placeholders/canvas retention, tail-follow/read-back, stable orb slot, bounded text, retained prefix, reduced motion, unified full-flow events/restart/switch/manual return, mode playback, Esc, cancelled/stale/busy event rejection and replay cleanup, reply/TTS/player/muted/failure/resume branches, 620/390/320 overlay bounds at 1x/2x text, offline');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
