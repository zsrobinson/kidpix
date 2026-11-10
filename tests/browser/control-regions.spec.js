import { test, expect } from '@playwright/test';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const rollover = (page, name) => page.locator(`#native-buttons [data-native-rollover="${name}"]`);
const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());

async function point(page, x, y) {
  const bounds = await page.locator('#studio').boundingBox();
  return [bounds.x + x * bounds.width / 1024, bounds.y + y * bounds.height / 768];
}
async function move(page, x, y) { await page.mouse.move(...await point(page, x, y)); }
async function click(page, x, y) { await page.mouse.click(...await point(page, x, y)); }

test.beforeEach(async ({ page }) => {
  page.regionErrors = [];
  page.on('pageerror', error => page.regionErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.regionErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.regionErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  page.nativeUi = await (await ready).json();
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(button(page, 'Backgrounds')).toHaveAttribute('data-native-region', 'MRGN:375');
  await move(page, 1023, 767);
});

test.afterEach(async ({ page }) => {
  expect(page.regionErrors, 'Browser errors and missing native assets').toEqual([]);
});

test('single source rectangle controls Backgrounds hover and action without moving its artwork', async ({ page }) => {
  const control = button(page, 'Backgrounds');
  const art = page.locator('#native-buttons [data-native-library-motion="backgrounds"]');
  const source = page.nativeUi.buttons.backgrounds;
  await expect(art).toBeVisible();
  const artBounds = await art.boundingBox();
  expect([artBounds.x, artBounds.y, artBounds.width, artBounds.height]).toEqual([source.x, source.y, source.w, source.h]);
  const bounds = await control.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([34, 18, 79, 43]);

  // This point belonged to the former broad approximation but not MRGN 375.
  await move(page, 125, 35);
  await expect(rollover(page, 'backgrounds')).toBeHidden();
  await click(page, 125, 35);
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(button(page, 'Drawing Tools')).toHaveAttribute('aria-pressed', 'true');
  await move(page, 70, 35);
  await expect(rollover(page, 'backgrounds')).toBeVisible();
  await expect(art).toBeHidden();
  await move(page, 125, 35);
  await expect(rollover(page, 'backgrounds')).toBeHidden();
  await expect(art).toBeVisible();
  // Source rectangular corners must not inherit the former rounded hit box.
  await click(page, 35, 19);
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#library-tray [data-asset]').first()).toBeVisible();
});

test('chrome dragging avoids selection and image ghosts while text editing and library dragging work', async ({ page }) => {
  await page.evaluate(() => {
    window.chromeDrags = [];
    document.addEventListener('dragstart', event => window.chromeDrags.push(event.target.tagName));
    window.getSelection().removeAllRanges();
  });
  // Sweep through rendered chrome, including native art, tool buttons and labels.
  await move(page, 15, 90);
  await page.mouse.down();
  for (const [x, y] of [[120, 100], [120, 290], [30, 620], [125, 750]]) await move(page, x, y);
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
  expect(await page.evaluate(() => window.chromeDrags)).toEqual([]);
  const title = page.getByRole('textbox', { name: 'Picture title', exact: true });
  await title.fill('Selectable title');
  await title.press('Home');
  await title.press('Shift+End');
  expect(await title.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe('Selectable title');
  await title.press('ArrowRight');
  await title.press('!');
  await expect(title).toHaveValue('Selectable title!');

  await button(page, 'Text Tools').click();
  await click(page, 350, 230);
  const editable = page.getByLabel('Picture text', { exact: true });
  await expect(editable).toBeVisible();
  await editable.fill('Picture words');
  await editable.press('ControlOrMeta+a');
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('Picture words');
  await editable.press('ArrowRight');
  await editable.press('!');
  await expect(editable).toHaveText('Picture words!');
  await editable.press('Home');
  await editable.press('Shift+ArrowRight');
  expect(await page.evaluate(() => window.getSelection().toString())).not.toBe('');

  await button(page, 'Stickers').click();
  const tile = page.locator('#library-tray [data-asset][draggable="true"]').first();
  await expect(tile).toBeVisible();
  const before = await page.locator('#objects .scene-object').count();
  await tile.dragTo(page.locator('#paper-canvas'), { targetPosition: { x: 400, y: 250 } });
  await expect(page.locator('#objects .scene-object')).toHaveCount(before + 1);
  expect(await page.evaluate(() => window.chromeDrags)).toEqual(['BUTTON']);
});

test('Firehose rectangle union excludes upper whitespace and retains both authored parts at either scale', async ({ page }) => {
  const control = button(page, 'Firehose Screen Eraser');
  await expect(control).toHaveAttribute('data-native-region', 'MRGN:1089');
  const bounds = await control.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([910, 330, 95, 125]);
  const blank = await ink(page);
  await move(page, 300, 200);
  await page.mouse.down();
  await move(page, 500, 200);
  await page.mouse.up();
  const drawn = await ink(page);
  expect(drawn).not.toBe(blank);

  for (const viewport of [{ width: 1024, height: 768 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await page.locator('#studio').boundingBox()).width).toBe(viewport.width);
    await move(page, 920, 340);
    // A retained actor can still be visible here on the second viewport pass.
    // Assert the region's actual pointer target independently of actor lifetime.
    expect(await page.evaluate(() => document.querySelector('[data-action="clear"]').matches(':hover'))).toBe(false);
    await click(page, 920, 340);
    expect(await ink(page), 'Excluded whitespace must not erase').toBe(drawn);
    await move(page, 950, 340);
    await expect(rollover(page, 'firehose')).toBeVisible();
    await move(page, 920, 340);
    // MBTN word 12 = 294 preserves Firehose's auxiliary actor on ordinary leave.
    await expect(rollover(page, 'firehose')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('[data-action="clear"]').matches(':hover'))).toBe(false);
    await click(page, 920, 400);
    await expect.poll(() => ink(page)).toBe(blank);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => ink(page)).toBe(drawn);
    await click(page, 950, 340);
    await expect.poll(() => ink(page)).toBe(blank);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => ink(page)).toBe(drawn);
  }
});
