import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginPage } from '../src/login-page.mjs';

test('live login replaces old QR without cache and hides it when session ends', async () => {
  const page = await createLoginPage();
  try {
    await page.update('first-login-session');
    const a = await fetch(page.url + 'qr.png?v=1');
    assert.match(a.headers.get('cache-control'), /no-store/);
    const first = Buffer.from(await a.arrayBuffer());
    assert.equal((await fetch(page.url + 'status').then(r => r.json())).revision, 1);
    await page.update('second-login-session');
    // Even an old cache key must return the current image, never the old session.
    const second = Buffer.from(await fetch(page.url + 'qr.png?v=1').then(r => r.arrayBuffer()));
    assert.notDeepEqual(first, second);
    assert.equal((await fetch(page.url + 'status').then(r => r.json())).revision, 2);
    page.finish('connected');
    assert.equal((await fetch(page.url + 'qr.png')).status, 404);
    assert.equal((await fetch(page.url + 'status').then(r => r.json())).phase, 'connected');
  } finally { await page.close(); }
});
