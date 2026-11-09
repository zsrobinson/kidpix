import { installPaletteClockAudio, openClockPalette, closeClockPalette } from './palette-clock.js';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
const decode = data => PNG.sync.read(Buffer.from(data.split(',')[1], 'base64'));
function image(width, height, rgb) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    png.data.set([...(typeof rgb === 'function' ? rgb(x, y) : rgb), 255], (y * width + x) * 4);
  }
  return png;
}
function setPixel(png, x, y, rgb) { png.data.set([...rgb, 255], (y * png.width + x) * 4); }
function expectPicture(actual, expected) {
  const decoded = decode(actual);
  expect([decoded.width, decoded.height]).toEqual([720, 542]);
  const mismatches = [];
  for (let i = 0; i < decoded.data.length; i += 4) {
    if (!decoded.data.subarray(i, i + 4).equals(expected.data.subarray(i, i + 4)) && mismatches.length < 8) {
      mismatches.push({ x: i / 4 % 720, y: Math.floor(i / 4 / 720),
        actual: [...decoded.data.subarray(i, i + 4)], expected: [...expected.data.subarray(i, i + 4)] });
    }
  }
  expect(mismatches, 'Every picture pixel matches the independent fixture oracle').toEqual([]);
}
async function routeMask(page, pattern, png) {
  await page.route(pattern, route => route.fulfill({ body: PNG.sync.write(png), contentType: 'image/png' }));
}
async function point(page, x, y) {
  const bounds = await page.locator('#paper-canvas').boundingBox();
  return [bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542];
}
async function click(page, x, y) { await page.mouse.click(...await point(page, x, y)); }
async function ready(page) { await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready'); }
async function marker(page) {
  await button(page, 'Drawing Tools').click();
  await button(page, 'Marker').click();
  await button(page, 'Small').click();
  await ready(page);
}
async function color(page, value) {
  await openClockPalette(page);
  const custom = page.locator('#custom-color');
  await custom.focus();
  await custom.fill(value);
  await custom.dispatchEvent('change');
  await page.locator('#paper-canvas').focus();
  await closeClockPalette(page);
}
async function history(page, before, after) {
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(after);
}

test.beforeEach(async ({ page }) => {
  await installPaletteClockAudio(page);
  page.brushErrors = [];
  page.on('pageerror', error => page.brushErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) page.brushErrors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.brushErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
});
test.afterEach(async ({ page }) => { expect(page.brushErrors, 'Browser errors and missing brush assets').toEqual([]); });
async function open(page) {
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
}

test('Marker darkens imported colored ink channel by channel, accumulates exactly and white never lightens', async ({ page }) => {
  await routeMask(page, /\/original\/tools\/brushes\/101[012]\.png(?:\?|$)/,
    image(3, 3, x => Array(3).fill([127, 254, 0][x])));
  await open(page);
  const base = image(720, 542, [30, 150, 90]);
  const fixture = { version: 1, format: 'kidpix-web', title: 'Marker RGB fixture', objects: [],
    paint: { version: 1, width: 720, height: 542, art: `data:image/png;base64,${PNG.sync.write(base).toString('base64')}` } };
  await page.locator('#picture-file').setInputFiles({ name: 'marker.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole('textbox', { name: 'Picture title', exact: true })).toHaveValue(fixture.title);
  expectPicture(await ink(page), base);
  await marker(page);
  await color(page, '#7814b4');
  const before = await ink(page);
  await click(page, 120, 120);
  for (let y = 119; y <= 121; y++) {
    setPixel(base, 119, y, [30, 85, 90]);
    setPixel(base, 120, y, [30, 20, 90]);
  }
  expectPicture(await ink(page), base);
  const first = await ink(page);
  await history(page, before, first);
  await click(page, 120, 120);
  for (let y = 119; y <= 121; y++) setPixel(base, 119, y, [30, 53, 90]);
  expectPicture(await ink(page), base);
  const second = await ink(page);
  await history(page, first, second);
  await color(page, '#ffffff');
  await click(page, 120, 120);
  expect(await ink(page), 'White Marker must never lighten existing ink').toBe(second);
  expectPicture(await ink(page), base);
});

test('Marker uses integer spacing three with an accepted segment endpoint and no subthreshold release tail', async ({ page }) => {
  await routeMask(page, /\/original\/tools\/brushes\/101[012]\.png(?:\?|$)/, image(1, 1, [254, 254, 254]));
  await open(page);
  await marker(page);
  const blank = await ink(page);
  await page.mouse.move(...await point(page, 120, 120));
  await page.mouse.down();
  await page.mouse.move(...await point(page, 124, 122));
  await page.mouse.move(...await point(page, 126, 123));
  await page.mouse.up();
  const expected = image(720, 542, [255, 255, 255]);
  for (const [x, y] of [[120, 120], [123, 122], [124, 122]]) setPixel(expected, x, y, [0, 0, 0]);
  expectPicture(await ink(page), expected);
  await history(page, blank, await ink(page));
});

test('undo during held native media checkpoints visible ink before choosing the history entry', async ({ page }) => {
  await routeMask(page, /\/original\/tools\/brushes\/101[012]\.png(?:\?|$)/, image(1, 1, [127, 127, 127]));
  await open(page);
  await marker(page);
  const blank = await ink(page);
  await page.mouse.move(...await point(page, 120, 120));
  await page.mouse.down();
  const first = await ink(page);
  expect(first).not.toBe(blank);
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expect.poll(() => ink(page)).toBe(blank);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(first);
  await page.mouse.move(...await point(page, 150, 120));
  await page.mouse.down();
  const both = await ink(page);
  expect(both).not.toBe(first);
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expect.poll(() => ink(page)).toBe(first);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(blank);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(first);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(both);
});

test('raw full-page paper modulates Marker and Dry Brush and Option inverts texture while painting', async ({ page }) => {
  await routeMask(page, /\/original\/tools\/brushes\/(?:101[012]|102[234])\.png(?:\?|$)/, image(1, 1, [127, 127, 127]));
  await routeMask(page, /\/original\/tools\/paper\/12301\.png(?:\?|$)/,
    image(720, 542, x => Array(3).fill(x < 360 ? 0 : 254)));
  await open(page);
  await marker(page);
  await button(page, 'Paper Texture Canister').click();
  if (await button(page, 'Paper Texture Canister').getAttribute('data-paper-state')) {
    await expect(button(page, 'Paper Texture Canister')).toHaveAttribute('data-paper-state', 'opening');
    await page.clock.runFor(650);
  }
  await button(page, 'Paper texture 1').click();
  await expect(page.locator('#paper-picker')).toBeHidden();
  const blank = await ink(page);
  const expected = image(720, 542, [255, 255, 255]);
  await click(page, 120, 120);
  setPixel(expected, 120, 120, [191, 191, 191]);
  expectPicture(await ink(page), expected);
  await click(page, 500, 120);
  setPixel(expected, 500, 120, [64, 64, 64]);
  expectPicture(await ink(page), expected);
  await page.keyboard.down('Alt');
  await click(page, 120, 150);
  await page.keyboard.up('Alt');
  setPixel(expected, 120, 150, [63, 63, 63]);
  expectPicture(await ink(page), expected);
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'marker');
  await button(page, 'Painting Tools').click();
  await button(page, 'Dry Brush').click();
  await button(page, 'Small').click();
  await ready(page);
  await click(page, 120, 200);
  setPixel(expected, 120, 200, [191, 191, 191]);
  expectPicture(await ink(page), expected);
  const beforeLast = await ink(page);
  await click(page, 500, 200);
  setPixel(expected, 500, 200, [64, 64, 64]);
  expectPicture(await ink(page), expected);
  await history(page, beforeLast, await ink(page));
  expect(await ink(page)).not.toBe(blank);
});

test('stationary Airbrush paints during held polling, has no release duplicate, exports and undoes exactly', async ({ page }, testInfo) => {
  await routeMask(page, /\/original\/tools\/brushes\/100[123]\.png(?:\?|$)/, image(8, 8, [127, 127, 127]));
  await open(page);
  await button(page, 'Painting Tools').click();
  await button(page, 'Air Brush').click();
  await button(page, 'Small').click();
  await ready(page);
  const blank = await ink(page);
  await page.mouse.move(...await point(page, 120, 120));
  await page.mouse.down();
  const clickOnly = await ink(page);
  await page.mouse.up();
  expect(await ink(page), 'An immediate release must not duplicate the first dab').toBe(clickOnly);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(blank);
  await page.mouse.move(...await point(page, 120, 120));
  await page.mouse.down();
  const immediate = await ink(page);
  expect(immediate).not.toBe(blank);
  await page.clock.runFor(4);
  expect(await ink(page)).toBe(immediate);
  // Requested native polls are 5 ms; screen compositing is RAF-coalesced.
  // Finish the first 16 ms frame rather than claiming a measured 5 ms display.
  await page.clock.runFor(12);
  const held = await ink(page);
  expect(held, 'Stationary native media adds coverage without pointer movement').not.toBe(immediate);
  await page.clock.runFor(16);
  const lastHeld = await ink(page);
  expect(lastHeld).not.toBe(held);
  await page.mouse.up();
  expect(await ink(page), 'Release adds no extra dab').toBe(lastHeld);
  await page.clock.runFor(100);
  expect(await ink(page), 'Held timer stops at release').toBe(lastHeld);
  const rendered = decode(lastHeld);
  let marked = 0;
  const badPixels = [];
  for (let y = 0; y < 542; y++) for (let x = 0; x < 720; x++) {
    const rgba = [...rendered.data.subarray((y * 720 + x) * 4, (y * 720 + x) * 4 + 4)];
    if (rgba[0] < 255) {
      marked++;
      if (!(x >= 115 && x <= 124 && y >= 115 && y <= 124) || rgba[1] !== rgba[0] || rgba[2] !== rgba[0] || rgba[3] !== 255) {
        if (badPixels.length < 8) badPixels.push({ x, y, rgba });
      }
    } else if (rgba.some(value => value !== 255) && badPixels.length < 8) badPixels.push({ x, y, rgba });
  }
  expect(badPixels, 'Every changed pixel is opaque grayscale within the source-sized jitter bounds').toEqual([]);
  expect(marked).toBeGreaterThan(20);
  await history(page, blank, lastHeld);
  await button(page, 'Save Picture').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloaded;
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const exported = PNG.sync.read(await readFile(path));
  expect([exported.width, exported.height]).toEqual([720, 542]);
  expect(exported.data.equals(rendered.data), 'Export preserves every live canvas pixel').toBe(true);
});

test('window blur finalizes one held Air Brush stroke, releases capture and stops its polling and audio', async ({ page }) => {
  await page.addInitScript(() => {
    const RealAudio = window.Audio;
    window.heldBrushAudio = [];
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/\/wacky-sounds\/7279\.mp3(?:\?|$)/.test(String(src))) return new RealAudio(src);
        this.src = String(src);
        this.paused = true;
        window.heldBrushAudio.push(this);
      }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    };
    window.addEventListener('pointerdown', event => { window.lastBrushPointer = event.pointerId; }, true);
  });
  await routeMask(page, /\/original\/tools\/brushes\/100[123]\.png(?:\?|$)/, image(8, 8, [127, 127, 127]));
  await open(page);
  await button(page, 'Painting Tools').click();
  await button(page, 'Air Brush').click();
  await button(page, 'Small').click();
  await ready(page);
  const blank = await ink(page);
  await page.mouse.move(...await point(page, 200, 200));
  await page.mouse.down();
  await page.clock.runFor(32);
  const held = await ink(page);
  expect(held).not.toBe(blank);
  expect(await page.evaluate(() => window.heldBrushAudio.map(audio => audio.paused))).toEqual([false]);
  expect(await page.locator('#paper-canvas').evaluate(canvas => canvas.hasPointerCapture(window.lastBrushPointer))).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await ink(page), 'Blur commits the current visible frame without a final dab').toBe(held);
  expect(await page.locator('#paper-canvas').evaluate(canvas => canvas.hasPointerCapture(window.lastBrushPointer))).toBe(false);
  expect(await page.evaluate(() => window.heldBrushAudio.map(audio => audio.paused))).toEqual([true]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await page.clock.runFor(1000);
  expect(await ink(page), 'Repeated blur, later mouseup and timers leave the finished ink unchanged').toBe(held);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(blank);
  await expect(button(page, 'Undo')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(held);
});
