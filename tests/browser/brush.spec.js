import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());

test('Dry Brush renders the routed native grayscale mask with source coverage and exact undo/redo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  const mask = new PNG({ width: 2, height: 2 });
  for (const [index, value] of [127, 255, 0, 254].entries()) mask.data.set([value, value, value, 255], index * 4);
  const fixture = PNG.sync.write(mask);
  const requestedBrushes = [];
  // Dry Brush uses BristleBrush's CFG base 1022 plus the source size tier.
  await page.route(/\/original\/tools\/brushes\/102[234]\.png(?:\?|$)/, async route => {
    requestedBrushes.push(new URL(route.request().url()).pathname);
    await route.fulfill({ body: fixture, contentType: 'image/png' });
  });
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Dry Brush', exact: true }).click();
  await page.getByRole('button', { name: 'Small', exact: true }).click();
  const canvas = page.locator('#paper-canvas');
  await expect(canvas).toHaveAttribute('data-tool', 'brush');
  await expect(canvas).toHaveAttribute('data-paint-ready', 'ready');
  expect(requestedBrushes).toContain('/original/tools/brushes/1022.png');
  const blank = await ink(page);
  const bounds = await canvas.boundingBox();
  // The real painting surface is 720×542 and scale=width/720=1. Source-sized
  // 2×2 artwork centers at (120,120), producing the four pixels below.
  await page.mouse.click(bounds.x + 120 * bounds.width / 720, bounds.y + 120 * bounds.height / 542);
  const painted = await ink(page);
  const result = await canvas.evaluate(element => {
    const context = element.getContext('2d');
    const samples = [[119, 119], [120, 119], [119, 120], [120, 120]]
      .map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let marked = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== 255 || pixels[offset + 1] !== 255 || pixels[offset + 2] !== 255) marked++;
    }
    return { samples, marked };
  });
  // Mask 127 becomes alpha 128 after 254 normalization, so black over white is 127.
  // These source samples also distinguish native-mask rendering from a
  // procedural brush fallback, rescaling, repeated dabs, or density heuristics.
  expect(result).toEqual({ samples: [[127, 127, 127, 255], [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255]], marked: 3 });
  expect(painted).not.toBe(blank);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(blank);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(painted);
  expect(errors, 'Browser errors and missing brush assets').toEqual([]);
});
