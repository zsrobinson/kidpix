import { test, expect } from '@playwright/test';
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(node => node.click());
const editor = page => page.locator('.object-text').first();
async function start(page) {
  await page.goto('/'); await click(page, 'tray:text');
  await page.locator('#paper-canvas').click({ position: { x: 150, y: 140 } });
  await editor(page).fill('Bundled font words');
}
async function choose(page, family) { await page.locator('#font').selectOption(`KPX Native ${family}`); }
async function family(page, name) { await expect(editor(page)).toHaveCSS('font-family', new RegExp(`^"?KPX Native ${name}"?$`)); }
async function open(page, font = 'KPX Native Schoolhouse') {
  await page.locator('#picture-file').setInputFiles({ name: 'font.kpx', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    version: 1, format: 'kidpix-web', paint: { version: 1 }, objects: [{ id: 'font-object', kind: 'text', x: 100, y: 100, width: 235, height: 100,
      text: 'Stored font', font, size: 32, color: '#000000', bold: true, italic: true }]
  })) });
  await expect(editor(page)).toHaveText('Stored font');
}
async function gate(page) {
  let release; const held = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/fonts/*.ttf?*', async route => { calls++; await held; await route.continue(); });
  return { release, calls: () => calls };
}
for (const remaining of ['replaced', 'current', 'another-object']) test(`restored font failure is reported only while referenced: ${remaining}`, async ({ page }) => {
  await start(page);
  let release, requested = 0, responded = 0;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/fonts/*.ttf?*', async route => {
    requested++; await held; await route.fulfill({ status: 503, body: 'unavailable' }); responded++;
  });
  await open(page, 'KPX Native Catchup');
  await expect.poll(() => requested).toBe(1);
  await page.locator('#objects').evaluate(root => {
    window.restoreFontErrors = [];
    root.addEventListener('fontfailure', event => window.restoreFontErrors.push(event.detail));
  });
  if (remaining === 'another-object') {
    const saved = { version: 1, format: 'kidpix-web', paint: { version: 1 }, objects: [0, 1].map(index => ({
      id: `owner-${index}`, kind: 'text', x: 100 + index * 300, y: 100, width: 235, height: 100,
      text: 'Stored font', font: 'KPX Native Catchup', size: 32, color: '#000000',
    })) };
    await page.locator('#picture-file').setInputFiles({ name: 'two-fonts.kpx', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await expect(page.locator('.object-text')).toHaveCount(2);
  }
  if (remaining !== 'current') {
    await editor(page).focus(); await page.locator('#font').selectOption('serif');
    await expect(editor(page)).toHaveCSS('font-family', 'serif');
  }
  release(); await expect.poll(() => responded).toBe(1);
  // HTTP-error handling aborts the fetch, so requestfinished is not guaranteed.
  // Fulfillment has completed; allow the fetch rejection and scene callback to settle.
  await page.waitForTimeout(150);
  const errors = await page.evaluate(() => window.restoreFontErrors);
  if (remaining === 'replaced') {
    expect(errors).toEqual([]); await expect(page.locator('#status')).not.toContainText('Font unavailable');
  } else {
    expect(errors).toEqual(['Font HTTP 503']); await expect(page.locator('#status')).toContainText('Font HTTP 503');
  }
});
test('each restored face reports its own still-referenced failure', async ({ page }) => {
  await start(page);
  const releases = new Map(), responded = new Set();
  await page.route('**/fonts/*.ttf?*', async route => {
    const key = route.request().url().includes('Catchup') ? 'retired' : 'current';
    await new Promise(resolve => releases.set(key, resolve));
    await route.fulfill({ status: key === 'retired' ? 503 : 502, body: 'unavailable' }); responded.add(key);
  });
  const saved = { version: 1, format: 'kidpix-web', paint: { version: 1 }, objects: ['Catchup', 'Schoolhouse'].map((family, index) => ({
    id: `owner-${index}`, kind: 'text', x: 100 + index * 300, y: 100, width: 235, height: 100,
    text: family, font: `KPX Native ${family}`, size: 32, color: '#000000',
  })) };
  await page.locator('#picture-file').setInputFiles({ name: 'two-faces.kpx', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect.poll(() => releases.size).toBe(2);
  await page.locator('#objects').evaluate(root => {
    window.restoreFontErrors = [];
    root.addEventListener('fontfailure', event => window.restoreFontErrors.push(event.detail));
  });
  await editor(page).focus(); await page.locator('#font').selectOption('serif');
  await expect(editor(page)).toHaveCSS('font-family', 'serif');
  releases.get('retired')(); await expect.poll(() => responded.has('retired')).toBe(true); await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.restoreFontErrors)).toEqual([]);
  releases.get('current')();
  await expect.poll(() => page.evaluate(() => window.restoreFontErrors)).toEqual(['Font HTTP 502']);
  await expect(page.locator('#status')).toContainText('Font HTTP 502');
});
test('cold/warm catalog, Schoolhouse actual styles, synthesis, focused select and exact save', async ({ page }) => {
  const urls = []; page.on('request', request => { if (request.url().includes('/fonts/')) urls.push(request.url()); });
  await start(page); expect(urls).toEqual([]);
  expect(await page.locator('#font option').count()).toBe(29);
  await page.locator('#font').focus(); await choose(page, 'Schoolhouse'); await family(page, 'Schoolhouse');
  await expect(page.locator('#font')).toBeFocused();
  await click(page, 'bold'); await expect(editor(page)).toHaveCSS('font-weight', '700');
  await click(page, 'italic'); await expect(editor(page)).toHaveCSS('font-style', 'italic');
  expect(urls.filter(url => url.endsWith('.ttf'))).toHaveLength(0);
  expect(new Set(urls).size).toBe(3);
  await click(page, 'bold'); await expect(editor(page)).toHaveCSS('font-weight', '400');
  await click(page, 'bold'); await expect(editor(page)).toHaveCSS('font-weight', '700');
  expect(new Set(urls).size).toBe(4);
  await choose(page, 'Catchup'); await family(page, 'Catchup');
  await expect(editor(page)).toHaveCSS('font-weight', '700'); await expect(editor(page)).toHaveCSS('font-style', 'italic');
  await choose(page, 'Schoolhouse'); await family(page, 'Schoolhouse'); expect(new Set(urls).size).toBe(5);
  const downloadPromise = page.waitForEvent('download'); await click(page, 'export'); const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await click(page, 'save');
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save Picture', exact: true }).last().click();
  const file = await saved; const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks)).objects[0].font).toBe('KPX Native Schoolhouse');
});
test('pending choice has no history, retry succeeds and one undo removes only choice', async ({ page }) => {
  await start(page); const held = await gate(page); await choose(page, 'Schoolhouse');
  await expect.poll(held.calls).toBe(1); await expect(editor(page)).toHaveCSS('font-family', 'Chalkboard, sans-serif');
  held.release(); await family(page, 'Schoolhouse'); await click(page, 'undo');
  await expect(editor(page)).toHaveCSS('font-family', 'Chalkboard, sans-serif'); await expect(editor(page)).toHaveText('Bundled font words');
  await click(page, 'redo'); await family(page, 'Schoolhouse');
});
for (const cancel of ['typing', 'style', 'undo', 'escape', 'tray', 'blur', 'newer', 'ABA', 'open', 'new', 'redo', 'delete', 'hidden', 'playback']) test(`pending choice retired by ${cancel}`, async ({ page }) => {
  await start(page);
  if (cancel === 'ABA') {
    await page.locator('#paper-canvas').click({ position: { x: 460, y: 340 } }); await page.locator('.object-text').last().fill('Second owner');
    await editor(page).focus();
  }
  if (cancel === 'redo') { await click(page, 'underline'); await click(page, 'undo'); }
  const held = await gate(page); await choose(page, 'Catchup'); await expect.poll(held.calls).toBe(1);
  if (cancel === 'typing') { await editor(page).focus(); await page.keyboard.type('x'); }
  if (cancel === 'style') await click(page, 'underline');
  if (cancel === 'undo') await click(page, 'undo');
  if (cancel === 'escape') await page.keyboard.press('Escape');
  if (cancel === 'tray') await click(page, 'tray:draw');
  if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  if (cancel === 'newer') await page.locator('#font').selectOption('serif');
  if (cancel === 'ABA') { await page.locator('.object-text').last().focus(); await editor(page).focus(); }
  if (cancel === 'redo') await click(page, 'redo');
  if (cancel === 'delete') await page.evaluate(() => {
    const button = document.createElement('button'); button.dataset.action = 'edit:delete';
    document.querySelector('#app').append(button); button.click(); button.remove();
  });
  if (cancel === 'hidden') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
  if (cancel === 'playback') await click(page, 'play');
  if (cancel === 'open') await open(page, 'serif');
  if (cancel === 'new') { await click(page, 'new'); await page.getByRole('button', { name: 'New Picture', exact: true }).click(); }
  held.release(); await page.waitForTimeout(200);
  if (await editor(page).count()) await expect(editor(page)).not.toHaveCSS('font-family', /^"?KPX Native Catchup"?$/);
});
for (const fault of ['http', 'hash', 'malformed']) test(`failed ${fault} choice leaves committed identity and is retryable`, async ({ page }) => {
  await start(page); let calls = 0;
  await page.route('**/fonts/*.ttf?*', async route => {
    calls++; if (calls > 1) return route.continue();
    if (fault === 'http') return route.fulfill({ status: 503, body: 'unavailable' });
    const response = await route.fetch(); const bytes = await response.body();
    if (fault === 'hash') bytes[bytes.length - 1] ^= 1;
    await route.fulfill({ response, body: fault === 'malformed' ? Buffer.from('bad') : bytes });
  });
  await choose(page, 'Catchup'); await expect(page.locator('#status')).toContainText('unavailable');
  await expect(editor(page)).toHaveCSS('font-family', 'Chalkboard, sans-serif');
  await choose(page, 'Catchup'); await family(page, 'Catchup'); expect(calls).toBe(2);
});
for (const command of ['export', 'print', 'flipbook']) test(`${command} cannot output pending restored fonts after paint mutation`, async ({ page }) => {
  await start(page); const held = await gate(page); await open(page); await expect.poll(held.calls).toBe(1);
  let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { window.printCalls = 0; window.print = () => window.printCalls++; });
  await click(page, command);
  await click(page, 'tray:draw');
  await page.locator('#paper-canvas').click({ position: { x: 250, y: 240 } });
  held.release(); await expect(page.locator('#status')).toContainText('Picture changed');
  expect(downloads).toBe(0); expect(await page.evaluate(() => window.printCalls)).toBe(0);
  await click(page, command);
  if (command === 'export') await expect.poll(() => downloads).toBe(1);
  if (command === 'print') expect(await page.evaluate(() => window.printCalls)).toBe(1);
  if (command === 'flipbook') await expect(page.locator('#status')).toContainText('Picture added as slide 1');
});
