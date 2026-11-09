import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.beforeEach(async ({ page }) => {
  page.sprayErrors = [];
  page.on('pageerror', error => page.sprayErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.sprayErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.sprayErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Spray Can', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paint Shapes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'spray');
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
});

test.afterEach(async ({ page }) => {
  expect(page.sprayErrors, 'Browser errors and failed spray assets').toEqual([]);
});

async function nativeBank(page, id = '24000') {
  const indexResponse = await page.request.get('/original/tools/spray-native.json');
  expect(indexResponse.ok(), 'Complete native spray index is served').toBe(true);
  const index = await indexResponse.json();
  const entry = index.banks[id];
  expect(entry, `Native bank ${id} is present`).toBeTruthy();
  let bank = entry;
  if (entry.manifest) {
    const response = await page.request.get(`/original/${entry.manifest}`);
    expect(response.ok(), 'The selected native bank shard is served').toBe(true);
    bank = (await response.json()).banks[id];
  }
  expect(bank.frameCount).toBeGreaterThan(8);
  expect(bank.frames).toHaveLength(bank.frameCount);
  const images = new Map();
  for (const image of new Set(bank.frames.map(frame => frame.image))) {
    const response = await page.request.get(`/original/${image}`);
    expect(response.ok(), `Native atlas ${image} is served`).toBe(true);
    images.set(image, PNG.sync.read(await response.body()));
  }
  return { bank, images };
}

const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
async function clickPaper(page, [x, y]) {
  const bounds = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.click(bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542);
}

function expectNativeMarks(encoded, marks, images) {
  const actual = PNG.sync.read(Buffer.from(encoded.split(',')[1], 'base64'));
  expect([actual.width, actual.height]).toEqual([720, 542]);
  const expected = Buffer.alloc(actual.width * actual.height * 4, 255);
  const coverage = new Uint8Array(actual.width * actual.height);
  for (const { frame, point } of marks) {
    const source = images.get(frame.image);
    const [left, top, width, height] = frame.sourceRect ?? [0, 0, frame.width, frame.height];
    expect([width, height], 'Native frame dimensions must not be rescaled').toEqual([frame.width, frame.height]);
    const x0 = point[0] - frame.registration[0];
    const y0 = point[1] - frame.registration[1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x0 + x;
        const dy = y0 + y;
        if (dx < 0 || dy < 0 || dx >= actual.width || dy >= actual.height) continue;
        const from = ((top + y) * source.width + left + x) * 4;
        const alpha = source.data[from + 3];
        if (!alpha) continue;
        const to = (dy * actual.width + dx) * 4;
        for (let channel = 0; channel < 3; channel++) {
          expected[to + channel] = Math.round((source.data[from + channel] * alpha + expected[to + channel] * (255 - alpha)) / 255);
        }
        coverage[to / 4] = alpha === 255 ? 2 : 1;
      }
    }
  }
  const mismatch = { opaque: [], edge: [], background: [] };
  let opaque = 0;
  for (let offset = 0; offset < expected.length; offset += 4) {
    const kind = coverage[offset / 4];
    const difference = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(actual.data[offset + channel] - expected[offset + channel])));
    if (kind === 2) opaque++;
    // Browser premultiplication/compositing may round translucent edge channels
    // differently from one straight-alpha calculation; opaque RGB stays exact.
    if (difference > (kind === 1 ? 2 : 0)) {
      const group = kind === 2 ? mismatch.opaque : kind === 1 ? mismatch.edge : mismatch.background;
      if (group.length < 8) group.push({ x: offset / 4 % actual.width, y: Math.floor(offset / 4 / actual.width),
        actual: [...actual.data.subarray(offset, offset + 4)], expected: [...expected.subarray(offset, offset + 4)] });
    }
  }
  expect(opaque, 'The comparison includes substantial opaque source artwork').toBeGreaterThan(1000);
  expect(mismatch, 'Every mark uses the authored crop, registration, dimensions and colors; the surrounding page stays blank').toEqual({ opaque: [], edge: [], background: [] });
}

test('Paint Shapes starts with the authored first image at native registration and offers no size controls', async ({ page }) => {
  const { bank, images } = await nativeBank(page);
  const sizes = page.locator('#tray-buttons [data-action^="size:"]');
  for (const size of await sizes.all()) await expect(size).toBeDisabled();
  await page.evaluate(() => { Math.random = () => .999999; });
  const point = [120, 120];
  await clickPaper(page, point);
  expectNativeMarks(await ink(page), [{ frame: bank.frames[0], point }], images);
});

test('later Paint Shapes use the complete native bank and rounded endpoint rule, with exact undo and redo', async ({ page }) => {
  const { bank, images } = await nativeBank(page);
  const forcedRandom = .999999;
  const next = Math.trunc(forcedRandom * (bank.frameCount - 2) + .5);
  expect(next).toBeGreaterThan(7);
  expect(next).toBe(bank.frameCount - 2);
  expect(next).not.toBe(bank.frameCount - 1);
  await page.evaluate(value => { Math.random = () => value; }, forcedRandom);
  const first = { frame: bank.frames[0], point: [120, 120] };
  const second = { frame: bank.frames[next], point: [450, 270] };
  await clickPaper(page, first.point);
  const firstInk = await ink(page);
  expectNativeMarks(firstInk, [first], images);
  await clickPaper(page, second.point);
  const both = await ink(page);
  expectNativeMarks(both, [first, second], images);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(firstInk);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(both);
});

test('reactivating Spray, reselecting its effect and returning from Moving Paints restart the authored bank', async ({ page }) => {
  const { bank, images } = await nativeBank(page);
  const forcedRandom = .999999;
  const next = Math.trunc(forcedRandom * (bank.frameCount - 2) + .5);
  expect(next).toBeGreaterThan(7);
  await page.evaluate(value => { Math.random = () => value; }, forcedRandom);
  const marks = [
    { frame: bank.frames[0], point: [120, 120] },
    { frame: bank.frames[next], point: [450, 270] },
  ];
  for (const mark of marks) await clickPaper(page, mark.point);
  expectNativeMarks(await ink(page), marks, images);

  await page.getByRole('button', { name: 'Drawing Tools', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'pencil');
  await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'spray');
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  const reactivated = { frame: bank.frames[0], point: [450, 120] };
  await clickPaper(page, reactivated.point);
  marks.push(reactivated);
  expectNativeMarks(await ink(page), marks, images);

  await page.getByRole('button', { name: 'Paint Shape 1', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  const reselected = { frame: bank.frames[0], point: [120, 300] };
  await clickPaper(page, reselected.point);
  marks.push(reselected);
  expectNativeMarks(await ink(page), marks, images);

  await page.getByRole('button', { name: 'Moving Paints', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  await page.getByRole('button', { name: 'Paint Shapes', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  const returned = { frame: bank.frames[0], point: [285, 420] };
  await clickPaper(page, returned.point);
  marks.push(returned);
  expectNativeMarks(await ink(page), marks, images);
});
