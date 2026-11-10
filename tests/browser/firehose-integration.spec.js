import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});

async function setup(page) {
  await page.addInitScript(() => {
    window.cues = [];
    HTMLMediaElement.prototype.play = function () { window.cues.push(this.src); return Promise.reject(Error('audio refused')); };
  });
  await page.goto('/');
  await expect(page.locator('#paper-canvas')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#paint-chrome.native'));
  // Real editable-picture import, with independently identifiable layers/tracks.
  const picture = await page.evaluate(() => {
    const image = color => { const c = document.createElement('canvas'); c.width = 720; c.height = 542;
      const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 720, 542); return c.toDataURL(); };
    const front = document.createElement('canvas'); front.width = 720; front.height = 542;
    const frontContext = front.getContext('2d'); frontContext.fillStyle = '#00ffff'; frontContext.fillRect(400, 100, 80, 80);
    return { version: 1, format: 'kidpix-web', title: 'Wipe test',
      paint: { version: 1, art: image('#ff0000'), background: image('#008000'), foreground: front.toDataURL(),
        paper: '/original/tools/paper/12301.png' },
      objects: [{ id: 'text', kind: 'text', x: 80, y: 60, width: 200, height: 80, text: 'Frozen text', size: 32, font: 'sans-serif', color: '#0000ff', path: [{ x: 180, y: 160 }, { x: 450, y: 300 }] },
        { id: 'sticker', kind: 'image', x: 400, y: 100, width: 80, height: 80, src: image('#ffff00') }],
      sound: { src: '/original/ui/big-eraser/water-cleaner-7433.wav', name: 'Sound' },
      narration: { src: '/original/ui/big-eraser/water-cleaner-7433.wav', name: 'Narration' }, backdrop: { name: 'Test backdrop', src: image('#008000') } };
  });
  await page.locator('#picture-file').setInputFiles({ name: 'test.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(picture)) });
  await expect(page.locator('[data-object="text"]')).toBeAttached();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  return picture;
}
async function fire(page) {
  await page.locator('#hit-layer [data-action="clear"]').evaluate(button => button.click());
  await expect(page.locator('.firehose-wipe')).toHaveCount(1);
}
async function pixel(page, selector, x = 1, y = 540) {
  return page.locator(selector).evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
}
async function save(page) {
  await page.locator('#hit-layer [data-action="save"]').evaluate(b => b.click());
  const download = page.waitForEvent('download');
  await page.locator('#dialog-actions').getByRole('button', { name: 'Save Picture', exact: true }).evaluate(b => b.click());
  const d = await download; const stream = await d.createReadStream(); const parts = [];
  for await (const part of stream) parts.push(part);
  return JSON.parse(Buffer.concat(parts).toString());
}

test('real Firehose freezes full picture, owns cue, blocks keyboard/touch and clears with one unified undo/redo', async ({ page }) => {
  const original = await setup(page);
  await page.locator('#hit-layer [data-action="play"]').evaluate(b => b.click());
  await page.clock.runFor(300);
  await fire(page);
  const frozen = await page.locator('.firehose-frozen').evaluate(c => c.toDataURL());
  expect(await pixel(page, '.firehose-frozen', 420, 120)).toEqual([0, 255, 255, 255]);
  expect(await pixel(page, '.firehose-frozen')).toEqual([255, 0, 0, 255]);
  const bounds = await page.locator('.firehose-wipe').boundingBox();
  expect(bounds).toEqual(await page.locator('#paper-canvas').boundingBox());
  await page.clock.runFor(200);
  expect((await pixel(page, '.firehose-wipe'))[3]).toBe(0);
  await page.clock.runFor(20);
  expect((await pixel(page, '.firehose-wipe'))[3]).toBe(77);
  await page.screenshot({ path: 'artifacts/t3/firehose-runtime/frozen-composite.png' });
  expect((await pixel(page, '.firehose-wipe', 1, 1))[3]).toBe(0);
  await page.keyboard.press('Control+z');
  await page.evaluate(() => {
    document.querySelector('#paper-canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 55, pointerType: 'pen', buttons: 1 }));
    document.querySelector('#hit-layer [data-action="clear"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 56, pointerType: 'touch', buttons: 1 }));
    document.querySelector('#hit-layer [data-action="clear"]').click();
  });
  await page.clock.runFor(300);
  expect(await page.locator('.firehose-frozen').evaluate(c => c.toDataURL())).toBe(frozen);
  expect(await pixel(page, '#paper-canvas')).toEqual([255, 0, 0, 255]);
  await page.clock.runFor(2000);
  await expect(page.locator('.firehose-wipe')).toHaveCount(0);
  const cleared = await save(page);
  expect(cleared.objects).toEqual([]); expect(cleared.sound).toBeNull(); expect(cleared.narration).toBeNull(); expect(cleared.backdrop).toBeNull();
  expect(cleared.paint.paper).toContain('12301.png');
  expect(await pixel(page, '#paper-canvas')).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  const restored = await save(page);
  expect(restored.objects).toEqual(original.objects); expect(restored.sound.name).toEqual(original.sound.name);
  expect(restored.sound.src.split('?')[0]).toEqual(original.sound.src);
  expect(restored.narration.name).toEqual(original.narration.name); expect(restored.backdrop).toEqual(original.backdrop);
  expect(restored.paint.art).toEqual(original.paint.art);
  await page.keyboard.press('Control+y');
  expect((await save(page)).objects).toEqual([]);
  expect((await page.evaluate(() => window.cues)).filter(src => new URL(src).pathname.endsWith('water-cleaner-7433.wav')).length).toBe(3); // two picture tracks + one owned wipe
  expect((await page.evaluate(() => window.cues)).some(src => new URL(src).pathname.endsWith('easel-1029.wav'))).toBe(false);
});

for (const reason of ['escape', 'blur', 'pagehide']) test(`Firehose ${reason} preserves art/history and allows reentry`, async ({ page }) => {
  const original = await setup(page);
  await fire(page); await page.clock.runFor(250);
  await page.evaluate(() => document.querySelector('#hit-layer [data-action="clear"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 101, pointerType: 'touch', buttons: 1 })));
  if (reason === 'escape') await page.keyboard.press('Escape');
  else await page.evaluate(reason => window.dispatchEvent(new Event(reason)), reason);
  await expect(page.locator('.firehose-wipe')).toHaveCount(0);
  await page.evaluate(() => {
    const b = document.querySelector('#hit-layer [data-action="clear"]');
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 101, pointerType: 'touch' }));
    b.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerId: 101, pointerType: 'touch', detail: 1 }));
  });
  await expect(page.locator('.firehose-wipe')).toHaveCount(0);
  await page.clock.runFor(3000);
  const result = await save(page);
  expect(result.paint.art).toBe(original.paint.art); expect(result.objects).toEqual(original.objects);
  await fire(page); await page.clock.runFor(2200);
  expect((await save(page)).objects).toEqual([]);
  await page.keyboard.press('Control+z'); expect((await save(page)).paint.art).toBe(original.paint.art);
});

test('delayed project import cannot resurrect scene or paint after the wipe commits', async ({ page }) => {
  await setup(page);
  await page.route('**/delayed-ink.png', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ path: 'public/original/tools/paper/12301.png' });
  });
  const pending = { version: 1, format: 'kidpix-web', title: 'Stale', paint: { version: 1, art: '/delayed-ink.png' },
    objects: [{ id: 'stale', kind: 'text', text: 'Resurrected' }], sound: { name: 'Stale' } };
  await page.locator('#picture-file').setInputFiles({ name: 'stale.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pending)) });
  await fire(page); await page.clock.runFor(2200);
  await page.waitForResponse('**/delayed-ink.png');
  expect((await save(page)).objects).toEqual([]);
  expect(await pixel(page, '#paper-canvas')).toEqual([255, 255, 255, 255]);
});

for (const failure of ['snapshot', 'commit']) test(`injected ${failure} failure releases operation and preserves coherent undo`, async ({ page }) => {
  const original = await setup(page);
  await page.evaluate(failure => {
    if (failure === 'snapshot') {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (!this.canvas.id && !this.canvas.className && this.canvas.width === 720) {
          CanvasRenderingContext2D.prototype.drawImage = draw; throw Error('snapshot failure');
        }
        return draw.apply(this, args);
      };
    } else {
      const root = document.querySelector('#objects');
      const replace = root.replaceChildren;
      root.replaceChildren = function (...args) {
        root.replaceChildren = replace;
        throw Error('commit failure');
      };
    }
  }, failure);
  await page.locator('#hit-layer [data-action="clear"]').evaluate(b => b.click());
  await page.clock.runFor(2200);
  await expect(page.locator('.firehose-wipe,.firehose-frozen')).toHaveCount(0);
  const restored = await save(page);
  expect(restored.paint.art).toEqual(original.paint.art);
  expect(restored.objects).toEqual(original.objects);
  expect(restored.sound.name).toEqual(original.sound.name);
  await fire(page); await page.clock.runFor(2200);
  await page.keyboard.press('Control+z');
  expect((await save(page)).paint.art).toBe(original.paint.art);
});

test('focused Text settles before snapshot and cancellation', async ({ page }) => {
  await setup(page);
  await page.locator('[data-action="tray:text"]').evaluate(b => b.click());
  await page.locator('.object-text').fill('Settled edit');
  await fire(page); await page.clock.runFor(220);
  expect(await page.locator('.object-text').textContent()).toBe('Settled edit');
  await page.keyboard.press('Escape');
  expect((await save(page)).objects[0].text).toBe('Settled edit');
  await page.keyboard.press('Control+z');
  expect((await save(page)).objects[0].text).toBe('Frozen text');
});

test('blank picture intentionally runs the wipe and has a single undoable clear', async ({ page }) => {
  await setup(page);
  const empty = { version: 1, format: 'kidpix-web', paint: { version: 1 }, objects: [] };
  await page.locator('#picture-file').setInputFiles({ name: 'blank.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) });
  await expect(page.locator('[data-object]')).toHaveCount(0);
  await fire(page); await page.clock.runFor(2200);
  expect(await pixel(page, '#paper-canvas')).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  expect((await save(page)).objects).toEqual([]);
  expect(await page.locator('[data-action="undo"]').first().getAttribute('aria-disabled')).toBe('true');
});

test('@module dispose and failed begin release guards; a late manifest cannot restart the operation', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(async () => {
    const { createFirehoseOperation } = await import('/src/firehose-operation.js');
    const surface = document.createElement('div'); document.body.append(surface);
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 542;
    let released = 0, committed = 0, errors = 0;
    const operation = createFirehoseOperation({ surface, canvas, original: path => `/original/${path}`,
      settle() {}, begin: () => ({ release() { released++; }, commit() { committed++; } }),
      composite: () => canvas.cloneNode(), onError() { errors++; } });
    const pending = operation.play(); operation.dispose(); await pending;
    const failed = createFirehoseOperation({ surface, canvas, original: path => `/original/${path}`,
      settle() {}, begin() { throw Error('begin'); }, composite() {}, onError() { errors++; } });
    await failed.play(); failed.dispose();
    const result = { released, committed, errors, children: surface.children.length, busy: operation.busy || failed.busy };
    surface.remove(); return result;
  })).toEqual({ released: 1, committed: 0, errors: 1, children: 0, busy: false });
});
