import { test, expect } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PNG } from 'pngjs';

let manifest;
test.beforeAll(async () => {
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
  page.stampErrors = [];
  page.on('pageerror', error => page.stampErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) page.stampErrors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.stampErrors.push(`${request.failure()?.errorText} ${request.url()}`);
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
  expect(page.stampErrors, 'Browser errors and missing native assets').toEqual([]);
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
  await expect.poll(async () => (await canvas.boundingBox()).width).toBe(manifest.canvas[2]);
  await clickPixel(page, dialog, 10, 10);
  expect(await pixel(dialog, 10, 10)).toEqual([0, 0, 0, 255]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await canvas.boundingBox()).width).toBeCloseTo(manifest.canvas[2] * (390 - 16) / manifest.frame.rect[2], 2);
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
