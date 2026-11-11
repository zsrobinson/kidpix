import { test, expect } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { stampFetchHeader, unexpectedStampRequests } from './stamp-request-errors.js';
import { createHash } from 'node:crypto';

let manifest;
test.beforeAll(async ({ browser }) => {
  console.log(`Stamp Editor browser: ${browser.version()}`);
  const candidates = [
    fileURLToPath(new URL('../../public/original/ui/', import.meta.url)),
    fileURLToPath(new URL('../../artifacts/research/native-stamp-editor/', import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'stamp-editor/manifest.json'));
      manifest = JSON.parse(await readFile(join(candidate, 'stamp-editor/manifest.json'), 'utf8'));
      break;
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!manifest) throw new Error('Import the native Stamp Editor assets, or run python3 scripts/native-stamp-editor.py to inspect the recovered source layout.');
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({header}) => {
    const fetch = window.fetch;
    window.stampAbortedFetches = new Set();
    window.fetch = function (input, options) {
      const url = new URL(input instanceof Request ? input.url : input, document.baseURI);
      const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
      if (!signal || url.origin !== location.origin || !/\/original\/ui\/(?:tool-motion|secondary-motion)\//.test(url.pathname)) return fetch.apply(this, arguments);
      const id = crypto.randomUUID();
      const aborted = () => window.stampAbortedFetches.add(id);
      signal.addEventListener('abort', aborted, {once:true});
      if (signal.aborted) aborted();
      const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set(header, id);
      return fetch.call(this, input, {...options, headers});
    };
  }, {header:stampFetchHeader});
  page.stampErrors = [];
  page.stampFailedRequests = [];
  page.on('pageerror', error => page.stampErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) page.stampErrors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    page.stampFailedRequests.push({error:request.failure()?.errorText, url:request.url(), fetchId:request.headers()[stampFetchHeader]});
  });
  // Replace one library entry, then exercise the shipped library/editor flow.
  // Native editor artwork, sound and manifest requests still reach the server.
  await page.route('**/original/catalog.json*', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.groups.stamps[0].items = [{
      id: 'stamp-fixture', name: 'Pixel fixture', mediaType: 'image', width: 32, height: 32,
      src: 'stamps/parity-fixture.png', thumbnail: 'stamps/parity-fixture.png',
    }];
    await route.fulfill({ response, json: catalog });
  });
  await page.route('**/original/stamps/parity-fixture.png*', async route => {
    await route.fulfill({ body: stampFixture(), contentType: 'image/png' });
  });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  await ready;
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
});

test.afterEach(async ({ page }) => {
  const aborted = await page.evaluate(() => [...(window.stampAbortedFetches ?? [])]);
  expect([...page.stampErrors, ...unexpectedStampRequests(page.stampFailedRequests, aborted)], 'Browser errors and missing native assets').toEqual([]);
});

function stampFixture() {
  const image = new PNG({ width: 32, height: 32 });
  image.data.fill(0);
  image.data.set([255, 0, 0, 255], (3 * 32 + 2) * 4);
  image.data.set([0, 0, 255, 255], (11 * 32 + 7) * 4);
  return PNG.sync.write(image);
}

const tile = page => page.locator('#library-tray [data-item="stamp-fixture"]');
async function openEditor(page, rapid = false) {
  await page.getByRole('button', { name: 'Rubber Stamp Tools', exact: true }).click();
  await expect(tile(page)).toBeVisible();
  await tile(page).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'stamp');
  const edit = page.getByRole('button', { name: 'Stamp Editor', exact: true });
  if (rapid) await edit.dblclick();
  else await edit.click();
  await expect(page.getByRole('dialog', { name: 'Stamp Editor', exact: true })).toBeVisible();
  return page.getByRole('dialog', { name: 'Stamp Editor', exact: true });
}

const command = (dialog, name) => dialog.getByRole('button', { name, exact: true });
const data = dialog => dialog.locator('.native-stamp-pixels').evaluate(canvas => canvas.toDataURL());
const pixel = (dialog, x, y) => dialog.locator('.native-stamp-pixels').evaluate((canvas, point) => [...canvas.getContext('2d').getImageData(...point, 1, 1).data], [x, y]);
const imagePath = image => image.evaluate(element => new URL(element.src).pathname);
async function point(dialog, x, y) {
  const bounds = await dialog.locator('.native-stamp-pixels').boundingBox();
  return { x: bounds.x + (x + .5) * bounds.width / 32, y: bounds.y + (y + .5) * bounds.height / 32 };
}
async function clickPixel(page, dialog, x, y) {
  const position = await point(dialog, x, y);
  await page.mouse.click(position.x, position.y);
}

// A resize can preserve the canvas width while its centered position changes.
// Wait for the whole recovered panel layout before sending pointer coordinates.
async function expectEditorBounds(canvas, width, height) {
  const [fx, fy, fw, fh] = manifest.frame.rect;
  const scale = Math.min(1, (width - 16) / fw, (height - 16) / fh);
  const expected = [
    width / 2 + (manifest.canvas[0] - fx - fw / 2) * scale,
    height / 2 + (manifest.canvas[1] - fy - fh / 2) * scale,
    manifest.canvas[2] * scale,
    manifest.canvas[3] * scale,
  ];
  await expect.poll(async () => {
    const bounds = await canvas.boundingBox();
    return [bounds.x, bounds.y, bounds.width, bounds.height]
      .every((value, index) => Math.abs(value - expected[index]) < .02);
  }).toBe(true);
}

test('native Stamp Editor uses source geometry and distinct rollover/tracking artwork at both viewport sizes', async ({ page }) => {
  const dialog = await openEditor(page);
  const canvas = dialog.locator('.native-stamp-pixels');
  const bounds = await canvas.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual(manifest.canvas);
  await expect(dialog.locator('.native-stamp-chip')).toHaveCount(78);
  const pencil = command(dialog, 'Pencil');
  const image = pencil.locator('img');
  const states = manifest.buttons.pencil.states;
  await expect.poll(() => imagePath(image)).toBe(`/original/ui/${states.rest.image}`);
  await pencil.hover();
  await expect.poll(() => imagePath(image)).toBe(`/original/ui/${states.rollover.image}`);
  await page.mouse.down();
  await expect.poll(() => imagePath(image)).toBe(`/original/ui/${states.tracking.image}`);
  await page.mouse.up();
  await expect.poll(() => imagePath(image)).toBe(`/original/ui/${states.rollover.image}`);
  await page.mouse.move(1000, 750);
  await expect.poll(() => imagePath(image)).toBe(`/original/ui/${states.rest.image}`);
  await page.setViewportSize({ width: 800, height: 600 });
  await expectEditorBounds(canvas, 800, 600);
  await clickPixel(page, dialog, 10, 10);
  expect(await pixel(dialog, 10, 10)).toEqual([0, 0, 0, 255]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEditorBounds(canvas, 390, 844);
  await clickPixel(page, dialog, 20, 20);
  expect(await pixel(dialog, 20, 20)).toEqual([0, 0, 0, 255]);
});

test('native Stamp Editor preserves pixels through rotate, mirror, undo, erase, restore, pencil and fill', async ({ page }) => {
  const dialog = await openEditor(page);
  const original = await data(dialog);
  await command(dialog, 'Rotate').click();
  expect(await pixel(dialog, 28, 2)).toEqual([255, 0, 0, 255]);
  expect(await pixel(dialog, 2, 3)).toEqual([0, 0, 0, 0]);
  await command(dialog, 'Undo Guy').click();
  expect(await data(dialog)).toBe(original);
  await command(dialog, 'Flip Vertical').click();
  expect(await pixel(dialog, 29, 3)).toEqual([255, 0, 0, 255]);
  expect(await pixel(dialog, 24, 11)).toEqual([0, 0, 255, 255]);
  await command(dialog, 'Undo Guy').click();
  expect(await data(dialog)).toBe(original);
  await command(dialog, 'Eraser').click();
  await expect(dialog).not.toHaveAttribute('data-erasing', 'true');
  expect(await dialog.locator('.native-stamp-pixels').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, 32, 32).data.every(value => value === 0))).toBe(true);
  await command(dialog, 'Restore Original').click();
  expect(await data(dialog)).toBe(original);

  const start = await point(dialog, 0, 31);
  const end = await point(dialog, 31, 31);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 1 });
  await page.mouse.up();
  const row = await dialog.locator('.native-stamp-pixels').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 31, 32, 1).data]);
  expect(row).toEqual(Array.from({ length: 32 }, () => [0, 0, 0, 255]).flat());
  await page.keyboard.press('ControlOrMeta+z');
  expect(await data(dialog), 'One undo removes an entire pencil gesture').toBe(original);

  const color = manifest.chips[0].color;
  await command(dialog, `Color ${color}`).click();
  await command(dialog, 'Fill Bucket').click();
  await clickPixel(page, dialog, 16, 16);
  expect(await pixel(dialog, 16, 16)).toEqual(color.slice(1).match(/../g).map(value => parseInt(value, 16)).concat(255));
  expect(await pixel(dialog, 2, 3), 'Fill preserves an enclosed different-color pixel').toEqual([255, 0, 0, 255]);
  const edited = await data(dialog);
  await command(dialog, 'OK').click();
  await expect(dialog).toHaveCount(0);
  await expect(tile(page).locator('img')).toHaveAttribute('src', edited);
  await expect(tile(page)).toHaveAttribute('aria-pressed', 'true');
  const exported = PNG.sync.read(Buffer.from(edited.split(',')[1], 'base64'));
  expect([exported.width, exported.height]).toEqual([32, 32]);
  await tile(page).locator('img').evaluate(image => image.decode());
  const paper = page.locator('#paper-canvas');
  await expect(paper).toHaveAttribute('data-tool', 'stamp');
  const bounds = await paper.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const placed = await paper.evaluate(canvas => [...canvas.getContext('2d').getImageData(360, 271, 1, 1).data]);
  expect(placed, 'The edited stamp is used for the next placement').toEqual(color.slice(1).match(/../g).map(value => parseInt(value, 16)).concat(255));
});

test('cancel and Escape discard changes while modal keystrokes leave underlying picture objects alone', async ({ page }) => {
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.locator('#library-tray [data-asset]').first().dblclick();
  await expect(page.locator('#objects .scene-object')).toHaveCount(1);
  const picture = await page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
  let dialog = await openEditor(page);
  const originalThumbnail = await tile(page).locator('img').getAttribute('src');
  await clickPixel(page, dialog, 10, 10);
  await command(dialog, 'Cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(tile(page).locator('img')).toHaveAttribute('src', originalThumbnail);

  dialog = await openEditor(page);
  const original = await data(dialog);
  await clickPixel(page, dialog, 11, 11);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await data(dialog), 'Undo stays inside the Stamp Editor').toBe(original);
  await expect(page.locator('#objects .scene-object')).toHaveCount(1);
  await clickPixel(page, dialog, 12, 12);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#objects .scene-object')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(tile(page).locator('img')).toHaveAttribute('src', originalThumbnail);
  expect(await page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL())).toBe(picture);
});

test('a rapid double-click on Stamp Editor opens one modal session', async ({ page }) => {
  const dialog = await openEditor(page, true);
  await expect(page.locator('.native-stamp-editor')).toHaveCount(1);
  await command(dialog, 'Cancel').click();
  await expect(page.locator('.native-stamp-editor')).toHaveCount(0);
});

test('a failed artwork decode releases the editor session so a later open can succeed', async ({ page }) => {
  await page.route('**/original/ui/stamp-editor/frame.png*', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('Invalid image fixture') }), { times: 1 });
  await page.getByRole('button', { name: 'Rubber Stamp Tools', exact: true }).click();
  await tile(page).click();
  await page.getByRole('button', { name: 'Stamp Editor', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Could not open that stamp.');
  await expect(page.locator('.native-stamp-editor')).toHaveCount(0);
  const dialog = await openEditor(page);
  await command(dialog, 'Cancel').click();
  await expect(page.locator('.native-stamp-editor')).toHaveCount(0);
});

test('control contact owns buttons, canvas and palette through rejected touch clicks', async ({ page }) => {
  const dialog = await openEditor(page);
  const original = await data(dialog);
  await command(dialog, 'Pencil').hover();
  await page.mouse.down();
  for (const selector of ['[data-command="fill"]', '.native-stamp-chip', '.native-stamp-pixels']) {
    await dialog.locator(selector).first().evaluate(element => {
      for (const type of ['pointerdown', 'pointerup', 'click']) element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 81, pointerType: 'touch', button: 0, isPrimary: true, detail: type === 'click' ? 1 : 0,
      }));
    });
  }
  await expect(command(dialog, 'Pencil')).toHaveAttribute('aria-pressed', 'true');
  expect(await data(dialog)).toBe(original);
  await page.mouse.up();
});

test('interrupted control cannot activate from a stale physical click or Space release', async ({ page }) => {
  const dialog = await openEditor(page);
  const original = await data(dialog);
  const erase = command(dialog, 'Eraser');
  await erase.hover();
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await erase.evaluate(element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(await data(dialog)).toBe(original);
  await erase.focus();
  await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space');
  expect(await data(dialog)).toBe(original);
});

test('held canvas consumes semantic Undo Save Cancel without changing its checkpoint', async ({ page }) => {
  const dialog = await openEditor(page);
  const p = await point(dialog, 10, 10);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const held = await data(dialog);
  await page.keyboard.press('ControlOrMeta+z');
  await command(dialog, 'OK').evaluate(element => element.click());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(await data(dialog)).toBe(held);
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await pixel(dialog, 10, 10)).toEqual([0, 0, 0, 0]);
});

for (const inactive of ['blur', 'pagehide', 'resize', 'hidden', 'pointercancel', 'lostpointercapture']) {
  test(`control retires only its matched contact on ${inactive}`, async ({ page }) => {
    const dialog = await openEditor(page);
    const erase = command(dialog, 'Eraser');
    const original = await data(dialog);
    await erase.hover();
    await page.mouse.down();
    const states = manifest.buttons.erase.states;
    await expect.poll(() => imagePath(erase.locator('img'))).toBe(`/original/ui/${states.tracking.image}`);
    await erase.evaluate(element => element.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 888 })));
    await expect.poll(() => imagePath(erase.locator('img'))).toBe(`/original/ui/${states.tracking.image}`);
    await erase.evaluate((element, type) => {
      if (type === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
      } else if (type === 'pointercancel' || type === 'lostpointercapture') {
        // Real mouse capture ID is recorded by the actual down event.
        element.dispatchEvent(new PointerEvent(type, { pointerId: window.stampPointer }));
      } else window.dispatchEvent(new Event(type));
    }, inactive);
    await page.mouse.up();
    expect(await data(dialog)).toBe(original);
    await expect.poll(() => imagePath(erase.locator('img'))).not.toBe(`/original/ui/${states.tracking.image}`);
    await command(dialog, 'Fill Bucket').click();
    await expect(command(dialog, 'Fill Bucket')).toHaveAttribute('aria-pressed', 'true');
  });
}

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => window.addEventListener('pointerdown', event => { window.stampPointer = event.pointerId; }, true));
});

test('real keyboard and assistive activation are once only, including modifier keyup and cancelled Space', async ({ page }) => {
  const dialog = await openEditor(page);
  const original = await data(dialog);
  const rotate = command(dialog, 'Rotate');
  await rotate.focus();
  await page.keyboard.down('Space');
  await page.keyboard.down('Shift');
  await page.keyboard.up('Space');
  await page.keyboard.up('Shift');
  expect(await pixel(dialog, 28, 2)).toEqual([255, 0, 0, 255]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await data(dialog)).toBe(original);
  await rotate.focus();
  await page.keyboard.press('Enter');
  expect(await pixel(dialog, 28, 2)).toEqual([255, 0, 0, 255]);
  await command(dialog, 'Undo Guy').evaluate(element => element.click());
  expect(await data(dialog)).toBe(original);
  await rotate.focus();
  await page.keyboard.down('Space');
  await command(dialog, 'Fill Bucket').evaluate(element => element.focus());
  await page.keyboard.up('Space');
  expect(await data(dialog)).toBe(original);
});

test('release outside cancels, reentry commits once, and nonprimary buttons do nothing', async ({ page }) => {
  const dialog = await openEditor(page);
  const original = await data(dialog);
  const rotate = command(dialog, 'Rotate');
  await rotate.click({ button: 'right' });
  expect(await data(dialog)).toBe(original);
  await rotate.hover(); await page.mouse.down();
  await page.mouse.move(900, 700); await page.mouse.up();
  expect(await data(dialog)).toBe(original);
  await rotate.hover(); await page.mouse.down();
  await page.mouse.move(900, 700); await rotate.hover(); await page.mouse.up();
  expect(await pixel(dialog, 28, 2)).toEqual([255, 0, 0, 255]);
  await command(dialog, 'Undo Guy').click();
  expect(await data(dialog)).toBe(original);
});

test('tracking audio observes rejection and terminal events without changing held ownership or hover compositing', async ({ page }) => {
  await page.evaluate(() => {
    window.stampAudio = [];
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src = src; this.pauses = 0; this.live = new Map(); window.stampAudio.push(this); }
      addEventListener(type, fn) { super.addEventListener(type, fn); this.live.set(type, fn); }
      removeEventListener(type, fn) { super.removeEventListener(type, fn); if (this.live.get(type) === fn) this.live.delete(type); }
      play() { return window.rejectStampAudio ? Promise.reject(new Error('deterministic rejection')) : Promise.resolve(); }
      pause() { this.pauses++; this.dispatchEvent(new Event('pause')); }
    };
  });
  const dialog = await openEditor(page);
  const erase = command(dialog, 'Eraser');
  for (const terminal of ['ended', 'error', 'pause', 'reject']) {
    await page.evaluate(reject => { window.rejectStampAudio = reject; }, terminal === 'reject');
    await erase.hover(); await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.stampAudio.at(-1)?.src)).toContain('/stamp-editor/');
    await page.evaluate(type => {
      if (type !== 'reject') window.stampAudio.at(-1).dispatchEvent(new Event(type));
    }, terminal);
    await expect.poll(() => page.evaluate(() => window.stampAudio.at(-1).live.size)).toBe(0);
    await expect.poll(() => imagePath(erase.locator('img'))).toBe(`/original/ui/${manifest.buttons.erase.states.tracking.image}`);
    await command(dialog, 'Fill Bucket').evaluate(element => element.click());
    await expect(command(dialog, 'Pencil')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(900, 700); await page.mouse.up();
  }
  await page.evaluate(() => { window.rejectStampAudio = false; });
  await erase.hover(); await page.mouse.down();
  const count = await page.evaluate(() => window.stampAudio.length);
  await page.mouse.move(900, 700); await erase.hover();
  expect(await page.evaluate(() => window.stampAudio.length)).toBe(count);
  expect(await page.evaluate(() => window.stampAudio.at(-1).pauses)).toBe(0);
  await dialog.locator('.native-stamp-pixels').evaluate(canvas => canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 999 })));
  expect(await page.evaluate(() => window.stampAudio.at(-1).pauses)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.mouse.up();
  expect(await page.evaluate(() => window.stampAudio.at(-1).pauses)).toBe(1);
  expect(await page.evaluate(() => window.stampAudio.every(audio => audio.live.size === 0))).toBe(true);
  await command(dialog, 'Cancel').click();
  await openEditor(page);
  await command(dialog, 'Cancel').click();
  expect(await page.evaluate(() => window.stampAudio.every(audio => audio.live.size === 0))).toBe(true);
});

test.describe('physical modal contacts', () => {
  test.use({ hasTouch: true });
  test('real mouse contact rejects second touch on buttons canvas and palette', async ({ page }) => {
    const dialog = await openEditor(page);
    const original = await data(dialog);
    await command(dialog, 'Pencil').hover(); await page.mouse.down();
    for (const target of [command(dialog, 'Fill Bucket'), dialog.locator('.native-stamp-pixels'), dialog.locator('.native-stamp-chip').first()]) {
      const b = await target.boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    }
    await expect(command(dialog, 'Pencil')).toHaveAttribute('aria-pressed', 'true');
    expect(await data(dialog)).toBe(original);
    await page.mouse.up();
    await command(dialog, 'Fill Bucket').tap();
    await expect(command(dialog, 'Fill Bucket')).toHaveAttribute('aria-pressed', 'true');
  });
  test('browser-delivered pen capture holds editor button against later touch and vice versa', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP pen delivery requires Chromium');
    const dialog = await openEditor(page);
    const original = await data(dialog);
    const pencil = await command(dialog, 'Pencil').boundingBox();
    const fill = await command(dialog, 'Fill Bucket').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const pen = (type, b) => cdp.send('Input.dispatchMouseEvent', { type, x: b.x + b.width/2, y:b.y+b.height/2, button:'left',buttons:type==='mousePressed'?1:0,clickCount:1,pointerType:'pen',force:.6 });
    const touch = (type, b) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:b?[{x:b.x+b.width/2,y:b.y+b.height/2,id:8}]:[]});
    await pen('mousePressed',pencil); await touch('touchStart',fill);
    await pen('mouseReleased',pencil); await touch('touchEnd');
    await expect(command(dialog,'Pencil')).toHaveAttribute('aria-pressed','true');
    await touch('touchStart',fill); await pen('mousePressed',pencil);
    await pen('mouseReleased',pencil); await touch('touchEnd');
    await expect(command(dialog,'Fill Bucket')).toHaveAttribute('aria-pressed','true');
    expect(await data(dialog)).toBe(original);
    await cdp.detach();
  });
});

test('right-button release cannot displace a held primary button or canvas', async ({ page }) => {
  const dialog = await openEditor(page);
  const rotate = command(dialog, 'Rotate');
  await rotate.hover(); await page.mouse.down();
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await expect.poll(() => imagePath(rotate.locator('img'))).toBe(`/original/ui/${manifest.buttons.rotate.states.tracking.image}`);
  await page.mouse.up();
  expect(await pixel(dialog, 28, 2)).toEqual([255, 0, 0, 255]);
  const p = await point(dialog, 10, 10);
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  await page.mouse.down({ button:'right' }); await page.mouse.up({ button:'right' });
  await command(dialog, 'Undo Guy').evaluate(element=>element.click());
  expect(await pixel(dialog, 10, 10)).toEqual([0, 0, 0, 255]);
  await page.mouse.up(); await page.keyboard.press('ControlOrMeta+z');
  expect(await pixel(dialog, 10, 10)).toEqual([0, 0, 0, 0]);
});

test('external close while tracking releases ownership and stale detached activation cannot save', async ({ page }) => {
  let dialog = await openEditor(page);
  const originalThumbnail = await tile(page).locator('img').getAttribute('src');
  await command(dialog, 'Eraser').hover(); await page.mouse.down();
  await dialog.evaluate(element => { window.closedStampSave = element.querySelector('[data-command="save"]'); element.close(); });
  await expect(dialog).toHaveCount(0);
  await page.mouse.up();
  await page.evaluate(() => window.closedStampSave.click());
  await expect(tile(page).locator('img')).toHaveAttribute('src', originalThumbnail);
  dialog = await openEditor(page);
  await command(dialog, 'Fill Bucket').click();
  await expect(command(dialog, 'Fill Bucket')).toHaveAttribute('aria-pressed','true');
  await command(dialog, 'Cancel').click();
});

test('abort during tracking and pending artwork decode allows a clean reopen @module', async ({ page }) => {
  let dialog = await openEditor(page);
  await command(dialog,'Pencil').hover(); await page.mouse.down();
  await page.evaluate(async () => (await import('/src/native-stamp-editor.js')).cancelStampEditor());
  await expect(dialog).toHaveCount(0); await page.mouse.up();
  await page.evaluate(() => {
    const decode = Image.prototype.decode;
    let gateOnce = true;
    Image.prototype.decode = function () {
      if (gateOnce && this.src.includes('/stamp-editor/frame.png')) {
        gateOnce = false;
        window.stampDecodeEntered = true;
        return new Promise(resolve => { window.releaseStampDecode = resolve; }).then(() => decode.call(this));
      }
      return decode.call(this);
    };
    window.restoreStampDecode = () => { Image.prototype.decode = decode; };
  });
  await page.getByRole('button',{name:'Stamp Editor',exact:true}).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.stampDecodeEntered))).toBe(true);
  await page.evaluate(async () => (await import('/src/native-stamp-editor.js')).cancelStampEditor());
  await expect(page.locator('.native-stamp-editor')).toHaveCount(0);
  dialog = await openEditor(page);
  await page.evaluate(() => { window.releaseStampDecode(); window.restoreStampDecode(); });
  await expect(dialog).toBeVisible();
  await command(dialog,'Cancel').click();
});

test.describe('closing touch containment', () => {
  test.use({ hasTouch: true });
  for (const viewport of [{width:1024,height:768},{width:640,height:480}]) {
    test(`Cancel touch stays out of the studio at ${viewport.width}x${viewport.height}`, async ({page}) => {
      await page.setViewportSize(viewport);
      const dialog=await openEditor(page);
      const before=await page.locator('#paper-canvas').evaluate(canvas=>({tool:canvas.dataset.tool,pixels:canvas.toDataURL()}));
      await page.evaluate(()=>{
        window.stampEscapedClicks=[];
        document.addEventListener('click',event=>{
          if(event.detail>0&&!event.target.closest('.native-stamp-editor')) window.stampEscapedClicks.push({target:event.target.id,pointerType:event.pointerType,pointerId:event.pointerId});
        });
      });
      for(let i=0;i<12;i++) await command(dialog,i%2?'Pencil':'Fill Bucket').tap();
      await command(dialog,'Cancel').tap();
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(()=>window.stampEscapedClicks)).toEqual([]);
      expect(await page.locator('#paper-canvas').evaluate(canvas=>({tool:canvas.dataset.tool,pixels:canvas.toDataURL()}))).toEqual(before);
      const reopened=await openEditor(page);
      await command(reopened,'Fill Bucket').tap();
      await expect(command(reopened,'Fill Bucket')).toHaveAttribute('aria-pressed','true');
      await command(reopened,'Cancel').click();
      await expect(reopened).toHaveCount(0);
    });
  }
});

async function freezeEraseClock(page) {
  await page.evaluate(() => {
    const native = window.setTimeout;
    window.eraseCallbacks = [];
    window.setTimeout = (callback, delay, ...args) => delay === 66
      ? (window.eraseCallbacks.push(() => callback(...args)), -window.eraseCallbacks.length)
      : native(callback, delay, ...args);
    window.deliverErase = () => window.eraseCallbacks.shift()?.();
  });
}
async function eraseState(dialog) {
  return dialog.evaluate(element => {
    const read = selector => element.querySelector(selector)?.toDataURL();
    return { committed:read('.native-stamp-pixels'), preview:read('.native-stamp-preview'), temporary:read('.native-stamp-erase') };
  });
}
for (const transparent of [false,true,'mixed']) test(`NORMAL browser erase temporary composition and atomic history transparent=${transparent}`, async ({ page }) => {
  const dialog = await openEditor(page);
  await dialog.locator('.native-stamp-pixels').evaluate((canvas,transparent) => {
    if(transparent==='mixed')return;
    const context=canvas.getContext('2d');context.clearRect(0,0,32,32);
    if(!transparent){context.fillStyle='#e01030';context.fillRect(0,0,32,32);}
    // Sync the fixture before starting, without exposing the editor's context.
    const preview=canvas.parentElement.querySelector('.native-stamp-preview');
    preview.getContext('2d').clearRect(0,0,32,32);preview.getContext('2d').drawImage(canvas,0,0);
  },transparent);
  const before=await eraseState(dialog);
  await freezeEraseClock(page);
  const responses=[];
  page.on('response',response=>{if(response.status()===200&&response.url().includes('sound-14006.wav'))responses.push(response);});
  await command(dialog,'Eraser').click();
  await expect(dialog).toHaveAttribute('data-erasing','true');
  const expectedPixels=Buffer.from(PNG.sync.read(Buffer.from(before.committed.split(',')[1],'base64')).data);
  function expectBrowserComposition(url,step){
    // Browser policy oracle only; source rectangle geometry is pinned separately.
    const [top,left,bottom,right]=[[17,15,19,17],[15,13,21,19],[13,11,23,21],[11,9,25,23],[9,7,27,25],[7,5,29,27],[5,3,31,29]][step];
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      if(((x+.5-(left+right)/2)/((right-left)/2))**2+((y+.5-(top+bottom)/2)/((bottom-top)/2))**2<=1)expectedPixels.set([255,255,255,255],(y*32+x)*4);
    }
    expect(PNG.sync.read(Buffer.from(url.split(',')[1],'base64')).data).toEqual(expectedPixels);
  }
  const immediate=await eraseState(dialog);
  expectBrowserComposition(immediate.temporary,0);
  expect(immediate.committed).toBe(before.committed);expect(immediate.preview).toBe(before.preview);
  expect(immediate.temporary).not.toBe(before.committed);
  const sample=()=>dialog.locator('.native-stamp-erase').evaluate(canvas=>{
    const c=canvas.getContext('2d');return {white:[...c.getImageData(15,17,1,1).data],outside:[...c.getImageData(0,0,1,1).data],backing:getComputedStyle(canvas).backgroundColor};
  });
  expect(await sample()).toEqual({white:[255,255,255,255],outside:transparent?[0,0,0,0]:[224,16,48,255],backing:'rgb(255, 255, 255)'});
  await expect.poll(()=>responses.length).toBe(1);
  const loadedWav = await responses[0].body();
  // Every delivered callback paints exactly one cumulative rectangle.
  for(let i=1;i<7;i++) {
    await page.evaluate(()=>window.deliverErase());
    const state=await eraseState(dialog);expectBrowserComposition(state.temporary,i);expect(state.committed).toBe(before.committed);expect(state.preview).toBe(before.preview);
    const painted=await dialog.locator('.native-stamp-erase').evaluate((canvas,i)=>[...canvas.getContext('2d').getImageData(16,17-i*2,1,1).data],i);
    expect(painted).toEqual([255,255,255,255]);
  }
  await page.evaluate(()=>window.deliverErase());
  await expect(dialog).not.toHaveAttribute('data-erasing','true');
  expect(await dialog.locator('.native-stamp-pixels').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,32,32).data.every(x=>x===0))).toBe(true);
  expect((await eraseState(dialog)).preview).toBe((await eraseState(dialog)).committed);
  await command(dialog,'Undo Guy').click();expect((await eraseState(dialog)).committed).toBe(before.committed);
  await expect(command(dialog,'Undo Guy')).toHaveAttribute('aria-disabled','true');
  await expect.poll(()=>responses.length).toBe(1);
  const bytes=loadedWav;expect(bytes.subarray(0,4).toString()).toBe('RIFF');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('3cf76d5838f2008dbe7eb7b0336d71c7df989bee2a2cebd3e5ff923e690f22cf');
  const metadata=await page.request.get('/original/ui/stamp-editor/manifest.json');
  expect(createHash('sha256').update(await metadata.body()).digest('hex')).toBe('59ddf639accf10f968117c1b1a6d22c1363cc62e751b174e30b39f153c6d7a34');
  expect((await metadata.json()).operations.erase).toMatchObject({sound:14006,geometry:'normal-32-v1',intervalMs:66});
});

test('NORMAL erase keeps history frozen after Cancel drag-out and modified keys',async({page})=>{
 const dialog=await openEditor(page),original=await eraseState(dialog);
 await clickPixel(page,dialog,10,10);const before=await eraseState(dialog);
 await freezeEraseClock(page);await command(dialog,'Eraser').click();
 await command(dialog,'Cancel').hover();await page.mouse.down();await page.mouse.move(900,700);await page.mouse.up();
 await expect(command(dialog,'Cancel')).toBeFocused();await expect(dialog).toHaveAttribute('data-erasing','true');
 await page.keyboard.press('ControlOrMeta+z');
 const after=await eraseState(dialog);expect(after.committed).toBe(before.committed);expect(after.preview).toBe(before.preview);
 await page.keyboard.press('Escape');await command(dialog,'Undo Guy').click();expect((await eraseState(dialog)).committed).toBe(original.committed);
});
for(const remap of ['mouse','MouseEvent'])test(`NORMAL rejected touch remap stays quarantined after close ${remap}`,async({page})=>{
 const dialog=await openEditor(page);await freezeEraseClock(page);
 await command(dialog,'Eraser').focus();await page.keyboard.press('Space');
 await command(dialog,'Rotate').dispatchEvent('pointerdown',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 const studio=page.getByRole('button',{name:'Drawing Tools',exact:true});
 await studio.dispatchEvent('pointerup',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
 await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool','stamp');
 await studio.evaluate((element,remap)=>element.dispatchEvent(remap==='mouse'
  ? new PointerEvent('click',{bubbles:true,cancelable:true,detail:1,pointerId:99,pointerType:'mouse'})
  : new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})),remap);
 await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool','stamp');
 await studio.click();await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool','pencil');
});

test('NORMAL erase rejects reentry Save history palette and held contacts through late click',async({page})=>{
 const dialog=await openEditor(page);const before=await eraseState(dialog);await freezeEraseClock(page);
 await command(dialog,'Eraser').click();
 for(const label of ['OK','Eraser','Rotate','Restore Original','Undo Guy','Fill Bucket',`Color ${manifest.chips[0].color}`])await command(dialog,label).evaluate(el=>el.click());
 await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('Enter');
 expect((await eraseState(dialog)).committed).toBe(before.committed);expect(await page.evaluate(()=>window.eraseCallbacks.length)).toBe(1);
 // Rejected down persists through completion and cannot become a semantic click.
 await command(dialog,'OK').dispatchEvent('pointerdown',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
 for(let i=0;i<7;i++)await page.evaluate(()=>window.deliverErase());
 await command(dialog,'OK').dispatchEvent('pointerup',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
 const late=await command(dialog,'OK').evaluate(el=>{
  let reached=false;el.addEventListener('click',()=>{reached=true;},{once:true});
  const event=new PointerEvent('click',{bubbles:true,cancelable:true,pointerId:778,pointerType:'touch',detail:1});
  el.dispatchEvent(event);return {reached,blocked:event.defaultPrevented};
 });
 expect(late).toEqual({reached:false,blocked:true});
 await expect(dialog).toBeVisible();await command(dialog,'Undo Guy').click();expect((await eraseState(dialog)).committed).toBe(before.committed);
});
for(const reason of ['Escape','blur','pagehide','resize','hidden','Cancel','close'])test(`NORMAL erase ${reason} cancels without late work`,async({page})=>{
 const dialog=await openEditor(page);const before=await eraseState(dialog);await freezeEraseClock(page);
 await command(dialog,'Eraser').click();
 if(reason==='Escape')await page.keyboard.press('Escape');
 else if(reason==='Cancel')await command(dialog,'Cancel').click();
 else if(reason==='close')await dialog.evaluate(el=>el.close());
 else await page.evaluate(reason=>{if(reason==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}else window.dispatchEvent(new Event(reason));},reason);
 for(let i=0;i<8;i++)await page.evaluate(()=>window.deliverErase());
 if(['Cancel','close'].includes(reason)){await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Stamp Editor',exact:true}).click();await expect(dialog).toBeVisible();}
 expect((await eraseState(dialog)).committed).toBe(before.committed);expect((await eraseState(dialog)).preview).toBe(before.preview);
 await expect(dialog.locator('.native-stamp-erase')).toHaveCount(0);
 await expect(command(dialog,'Undo Guy')).toHaveAttribute('aria-disabled','true');
});

for(const terminal of ['finish','cancel','reject','pause','error'])test(`NORMAL operation sound independent lifetime ${terminal}`,async({page})=>{
 await page.evaluate(terminal=>{
  window.operationAudio=[];
  window.Audio=class extends EventTarget{
   constructor(src){super();this.src=src;this.pauses=0;window.operationAudio.push(this);}
   play(){this.plays=(this.plays||0)+1;return terminal==='reject'&&this.src.includes('14006')?Promise.reject(Error('rejected')):Promise.resolve();}
   pause(){this.pauses++;this.dispatchEvent(new Event('pause'));}
  };
 },terminal);
 const dialog=await openEditor(page);await freezeEraseClock(page);
 await command(dialog,'Eraser').hover();await page.mouse.down();
 expect(await page.evaluate(()=>window.operationAudio.filter(a=>a.src.includes('14006')).length)).toBe(0);
 await page.mouse.up();
 expect(await page.evaluate(()=>window.operationAudio.filter(a=>a.src.includes('14006')).map(a=>[a.plays,a.pauses,a.loop||false]))).toEqual([[1,0,false]]);
 expect(await page.evaluate(()=>window.operationAudio.filter(a=>a.src.includes('14002')).every(a=>a.pauses===1))).toBe(true);
 if(['pause','error'].includes(terminal))await page.evaluate(terminal=>window.operationAudio.find(a=>a.src.includes('14006')).dispatchEvent(new Event(terminal)),terminal);
 await expect(dialog).toHaveAttribute('data-erasing','true');
 if(terminal==='cancel')await page.keyboard.press('Escape');else for(let i=0;i<7;i++)await page.evaluate(()=>window.deliverErase());
 await expect(dialog).not.toHaveAttribute('data-erasing','true');
 expect(await page.evaluate(()=>window.operationAudio.filter(a=>a.src.includes('14006')).length)).toBe(1);
 if(['finish','cancel'].includes(terminal))expect(await page.evaluate(()=>window.operationAudio.find(a=>a.src.includes('14006')).pauses)).toBe(1);
 await command(dialog,'Rotate').click(); // audio failure never retains operation ownership
});

test('NORMAL owner abort retires temporary operation before reopening @module',async({page})=>{
 const dialog=await openEditor(page);const before=await eraseState(dialog);await freezeEraseClock(page);
 await command(dialog,'Eraser').click();
 await page.evaluate(async()=> (await import('/src/native-stamp-editor.js')).cancelStampEditor());
 await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Stamp Editor',exact:true}).click();await expect(dialog).toBeVisible();
 for(let i=0;i<8;i++)await page.evaluate(()=>window.deliverErase());
 expect((await eraseState(dialog)).committed).toBe(before.committed);expect((await eraseState(dialog)).preview).toBe(before.preview);
 await command(dialog,'Rotate').click();expect(await pixel(dialog,28,2)).toEqual([255,0,0,255]);
});

for(const failure of ['allocation','render','schedule','commit'])test(`NORMAL internal ${failure} failure restores pixels preview and history`,async({page})=>{
 const dialog=await openEditor(page);const original=await data(dialog);
 await clickPixel(page,dialog,10,10);const before=await eraseState(dialog);
 await freezeEraseClock(page);
 await page.evaluate(failure=>{
  let failed=false;
  if(failure==='allocation'){
   const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(...args){if(!failed&&this.classList.contains('native-stamp-erase')){failed=true;return null;}return get.apply(this,args);};
  }else if(failure==='schedule'){
   const set=window.setTimeout;window.setTimeout=(callback,delay,...args)=>{if(!failed&&delay===66){failed=true;throw Error('schedule fixture');}return set(callback,delay,...args);};
  }else{
   const method=failure==='render'?'fillRect':'clearRect', prior=CanvasRenderingContext2D.prototype[method];
   CanvasRenderingContext2D.prototype[method]=function(...args){
    const target=failure==='render'?this.canvas.classList.contains('native-stamp-erase'):this.canvas.classList.contains('native-stamp-pixels')&&this.canvas.closest('dialog')?.dataset.erasing;
    const result=prior.apply(this,args);
    if(!failed&&target){failed=true;throw Error(`${failure} fixture`);}return result;
   };
  }
 },failure);
 await command(dialog,'Eraser').click();for(let i=0;i<7;i++)await page.evaluate(()=>window.deliverErase());
 await expect(dialog).not.toHaveAttribute('data-erasing','true');
 const after=await eraseState(dialog);expect(after.committed).toBe(before.committed);expect(after.preview).toBe(before.preview);expect(after.temporary).toBeUndefined();
 await command(dialog,'Undo Guy').click();expect(await data(dialog)).toBe(original);
 await command(dialog,'Eraser').click();await expect(dialog).toHaveAttribute('data-erasing','true');
 await page.keyboard.press('Escape');await expect(dialog).not.toHaveAttribute('data-erasing','true');
});
