import { test, expect } from '@playwright/test';
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(node => node.click());
const object = { id: 'font', kind: 'text', x: 100, y: 100, width: 235, height: 100, text: 'Font output', font: 'KPX Native Catchup', size: 32, color: '#000000' };
async function open(page, data) {
  await page.locator('#picture-file').setInputFiles({ name: 'fonts.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
const picture = () => ({ version: 1, format: 'kidpix-web', paint: { version: 1 }, objects: [object] });
async function start(page) { await page.goto('/'); await click(page, 'tray:text'); }
async function gate(page) {
  let release, calls = 0; const held = new Promise(resolve => release = resolve);
  await page.route('**/fonts/*.ttf?*', async route => { calls++; await held; await route.continue(); });
  return { release, calls: () => calls };
}
for (const offsets of [[2, 8], [8, 2], [5, 5]]) test(`cold arrow retains editor directional range ${offsets}`, async ({ page }) => {
  await start(page); await page.locator('#paper-canvas').click({ position: { x: 160, y: 140 } });
  await page.locator('.object-text').fill('continued typing'); await page.locator('#font').selectOption('monospace');
  await page.locator('.object-text').evaluate((editor, [a, f]) => { editor.focus(); getSelection().setBaseAndExtent(editor.firstChild, a, editor.firstChild, f); }, offsets);
  const held = await gate(page); await page.locator('[data-action="font-step:1"]').click(); await expect.poll(held.calls).toBe(1);
  held.release(); await expect(page.locator('.object-text')).toHaveCSS('font-family', /^"?KPX Native Catchup"?$/);
  await expect(page.locator('.object-text')).toBeFocused();
  expect(await page.evaluate(() => [getSelection().anchorOffset, getSelection().focusOffset])).toEqual(offsets);
  await click(page, 'undo'); await expect(page.locator('.object-text')).toBeFocused();
  expect(await page.evaluate(() => [getSelection().anchorOffset, getSelection().focusOffset])).toEqual(offsets);
  await click(page, 'redo'); await expect(page.locator('.object-text')).toBeFocused();
  expect(await page.evaluate(() => [getSelection().anchorOffset, getSelection().focusOffset])).toEqual(offsets);
  await page.keyboard.type('X'); await expect(page.locator('.object-text')).toContainText('X');
});
test('bounded timeout does not commit and retry is usable', async ({ page }) => {
  await start(page); await page.locator('#paper-canvas').click({ position: { x: 160, y: 140 } }); await page.locator('.object-text').fill('timeout');
  const held = await gate(page); await page.locator('#font').selectOption('KPX Native Catchup');
  await expect(page.locator('#status')).toContainText('timed out', { timeout: 15000 });
  await expect(page.locator('.object-text')).toHaveCSS('font-family', 'Chalkboard, sans-serif');
  held.release(); await page.locator('#font').selectOption('KPX Native Catchup');
  await expect(page.locator('.object-text')).toHaveCSS('font-family', /^"?KPX Native Catchup"?$/);
});
for (const command of ['export', 'print', 'flipbook']) test(`${command} fails visibly without fallback output and retries`, async ({ page }) => {
  await start(page); let calls = 0;
  await page.route('**/fonts/*.ttf?*', route => { calls++; return route.fulfill({ status: 503, body: 'unavailable' }); });
  await open(page, picture()); await expect(page.locator('.object-text')).toHaveText('Font output');
  await expect.poll(() => calls).toBeGreaterThan(0);
  let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { window.printCalls = 0; window.print = () => window.printCalls++; });
  await click(page, command); await expect(page.locator('#status')).toContainText('Retry');
  expect(downloads).toBe(0); expect(await page.evaluate(() => window.printCalls)).toBe(0);
  await page.unroute('**/fonts/*.ttf?*'); await click(page, command);
  if (command === 'export') await expect.poll(() => downloads).toBe(1);
  if (command === 'print') await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(1);
  if (command === 'flipbook') await expect(page.locator('#status')).toContainText('Picture added as slide 1');
});
test('unrelated pending choice does not block committed raster output', async ({ page }) => {
  await start(page); await page.locator('#paper-canvas').click({ position: { x: 160, y: 140 } }); await page.locator('.object-text').fill('legacy');
  const held = await gate(page); await page.locator('#font').selectOption('KPX Native Catchup'); await expect.poll(held.calls).toBe(1);
  const downloaded = page.waitForEvent('download'); await click(page, 'export'); await downloaded; held.release();
});
test('slide advance preflights only its frozen picture and stop retires pending work', async ({ page }) => {
  await start(page); const held = await gate(page);
  await open(page, { version: 1, format: 'kidpix-web-slides', slides: [{ preview: '', picture: picture() }] });
  await click(page, 'slide-play'); await expect.poll(held.calls).toBe(1);
  expect(await page.locator('#slide-objects .object-text').count()).toBe(0);
  await click(page, 'stop-slides'); held.release(); await page.waitForTimeout(200);
  await expect(page.locator('#playback')).toBeHidden(); expect(await page.locator('#slide-objects .object-text').count()).toBe(0);
  await click(page, 'slide-play'); await expect(page.locator('#slide-objects .object-text')).toHaveText('Font output');
});
test('stereo later image wait cannot mix documents', async ({ page }) => {
  await start(page);
  const data = picture(); data.backdrop = { rightSrc: '/stereo-right.png' };
  const png = Buffer.from(await page.evaluate(() => document.createElement('canvas').toDataURL().split(',')[1]), 'base64');
  let release; const held = new Promise(resolve => release = resolve); let requested = false;
  await page.route('**/stereo-right.png', async route => { requested = true; await held; await route.fulfill({ contentType: 'image/png', body: png }); });
  await open(page, data); await expect(page.locator('.object-text')).toHaveText('Font output');
  // Exercise the existing command without exposing a new product control.
  await page.evaluate(() => { const button = document.createElement('button'); button.dataset.action = 'stereo'; button.id = 'stereo-test'; document.querySelector('#app').append(button); });
  let downloads = 0; page.on('download', () => downloads++); await click(page, 'stereo'); await expect.poll(() => requested).toBe(true);
  await open(page, { ...picture(), objects: [] }); await expect(page.locator('.object-text')).toHaveCount(0);
  release(); await page.waitForTimeout(250); expect(downloads).toBe(0);
  await open(page, data); await expect(page.locator('.object-text')).toHaveText('Font output');
  const output = page.waitForEvent('download'); await click(page, 'stereo'); await output; expect(downloads).toBe(1);
});
test('@module scene tokens reject forged/reentrant owners and freeze intended patch', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createScene } = await import('/src/scene.js');
    const root = document.createElement('div'), surface = document.createElement('div'); document.body.append(root, surface);
    let replace = false, entries = 0, scene;
    scene = createScene(root, surface, () => { entries++; if (replace) scene.restore([]); });
    scene.chooseMode('text');
    const style = { font: 'serif', size: 32, color: '#000000' };
    scene.addText({ x: 10, y: 10 }, style);
    const editor = root.querySelector('.object-text'); editor.textContent = 'token text'; editor.dispatchEvent(new Event('input'));
    replace = true;
    const stale = scene.captureTextStyleTarget({ ...style, bold: true });
    const rejected = !scene.commitTextStyle(stale) && scene.snapshot().length === 0;
    replace = false;
    scene.restore([{ ...style, id: 'owned', kind: 'text', text: 'owned', x: 10, y: 10, width: 235, height: 100 }], { textTarget: 'owned' });
    const intended = { ...style, bold: true }; const token = scene.captureTextStyleTarget(intended); intended.bold = false;
    const frozen = Object.isFrozen(token), forged = !scene.commitTextStyle({ ...token });
    const validDefault = scene.commitTextStyle(token) && scene.snapshot()[0].bold === true, noBurst = !scene.commitTextStyle(token);
    scene.destroy(); root.remove(); surface.remove();
    return { rejected, frozen, forged, validDefault, noBurst, entries };
  });
  expect(result).toEqual({ rejected: true, frozen: true, forged: true, validDefault: true, noBurst: true, entries: 2 });
});
test('default-only cold request commits before first text box and stale tray request is discarded', async ({ page }) => {
  await start(page); const held = await gate(page); await page.locator('#font').selectOption('KPX Native Catchup'); await expect.poll(held.calls).toBe(1);
  await click(page, 'tray:draw'); held.release(); await click(page, 'tray:text');
  await expect(page.locator('#font')).toHaveValue('Chalkboard, sans-serif');
  await page.locator('#font').selectOption('KPX Native Catchup'); await expect(page.locator('#font')).toHaveValue('KPX Native Catchup');
  await page.locator('#paper-canvas').click({ position: { x: 160, y: 140 } });
  await expect(page.locator('.object-text')).toHaveCSS('font-family', /^"?KPX Native Catchup"?$/);
});
test('slide font failure stops before restoring fallback text and playback retries', async ({ page }) => {
  await start(page); await page.route('**/fonts/*.ttf?*', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await open(page, { version: 1, format: 'kidpix-web-slides', slides: [{ preview: '', picture: picture() }] });
  await click(page, 'slide-play'); await expect(page.locator('#status')).toContainText('Slide font unavailable');
  await expect(page.locator('#playback')).toBeHidden(); expect(await page.locator('#slide-objects .object-text').count()).toBe(0);
  await page.unroute('**/fonts/*.ttf?*'); await click(page, 'slide-play');
  await expect(page.locator('#slide-objects .object-text')).toHaveText('Font output');
});
test('Firehose declines pending fonts before baking a fallback composite', async ({ page }) => {
  await start(page); const held = await gate(page); await open(page, picture());
  await expect(page.locator('.object-text')).toHaveText('Font output'); await expect.poll(held.calls).toBe(1);
  // The command's hit-layer activation is the existing Firehose entry point.
  await page.locator('#hit-layer [data-action="clear"]').evaluate(node => node.click());
  await expect(page.locator('#status')).toContainText('Fonts are not ready');
  await expect(page.locator('.firehose-frozen')).toHaveCount(0);
  await expect(page.locator('.object-text')).toHaveText('Font output'); held.release();
});
