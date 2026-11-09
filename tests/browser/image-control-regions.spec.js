import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const control = (page, label) => page.locator('#hit-layer').getByRole('button', { name: label, exact: true });
const rollover = (page, name) => page.locator(`#native-buttons [data-native-rollover="${name}"]`);
const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());

async function point(page, x, y) {
  const bounds = await page.locator('#studio').boundingBox();
  return [bounds.x + x * bounds.width / 1024, bounds.y + y * bounds.height / 768];
}
async function move(page, x, y) { await page.mouse.move(...await point(page, x, y)); }
async function click(page, x, y) { await page.mouse.click(...await point(page, x, y)); }

test.beforeEach(async ({ page }) => {
  // Optional source-export overlay permits an isolated review before the full
  // importer regenerates public metadata. Normal suite runs use served files.
  if (process.env.KIDPIX_BUTTON_REGIONS_FIXTURE) {
    const sourceRegions = JSON.parse(await readFile(process.env.KIDPIX_BUTTON_REGIONS_FIXTURE, 'utf8'));
    await page.route(url => url.pathname.endsWith('/original/ui/ui.json'), async route => {
      const response = await route.fetch();
      const ui = await response.json();
      await route.fulfill({ response, json: { ...ui, buttonAnimations: sourceRegions } });
    });
  }
  page.imageRegionErrors = [];
  page.on('pageerror', error => page.imageRegionErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.imageRegionErrors.push(`${response.status()} ${response.url()}`);
  });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  page.sourceUi = await (await ready).json();
  await expect(control(page, 'Painting Tools')).toHaveAttribute('data-native-region', 'tSCR:1017');
});

test.afterEach(async ({ page }) => {
  expect(page.imageRegionErrors, 'Browser errors and missing source assets').toEqual([]);
});

test('kind-1 bounds use the native rectangular corner for hover and activation at either scale', async ({ page }) => {
  const source = page.sourceUi.buttonAnimations.buttons;
  expect(source.filter(button => button.hotspotKind === 1 && button.hotspotRegion.status === 'exact')).toHaveLength(20);
  expect(source.filter(button => button.hotspotKind === 2 && button.hotspotRegion.status === 'exact')).toHaveLength(7);
  // Stop shares Play's rectangle; Stop and record26 do not bind separate DOM buttons.
  expect(await page.locator('#hit-layer [data-native-region]').count()).toBe(25);
  const paint = control(page, 'Painting Tools');
  const draw = control(page, 'Drawing Tools');
  const art = page.locator('#native-buttons [data-native-part="paint"]');

  for (const viewport of [{ width: 1024, height: 768 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await page.locator('#studio').boundingBox()).width).toBe(viewport.width);
    await draw.click();
    const artBounds = await art.boundingBox();
    // The old hit approximation extended above native y=365.
    await click(page, 100, 364);
    await expect(draw).toHaveAttribute('aria-pressed', 'true');
    // Native bottom-right rectangle includes transparent image pixels.
    await move(page, 131.5, 420.5);
    await expect(rollover(page, 'paint')).toBeVisible();
    await move(page, 133, 420.5);
    await expect(rollover(page, 'paint')).toBeHidden();
    expect(await art.boundingBox()).toEqual(artBounds);
    await click(page, 131.5, 420.5);
    await expect(paint).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tray-buttons [data-action="tool:brush"]')).toBeVisible();
  }
});

test('native Undo rectangle excludes its former outside strip and keeps a transparent source corner clickable', async ({ page }) => {
  const undo = control(page, 'Undo');
  await expect(undo).toHaveAttribute('data-native-region', 'tSCR:1132');
  const blank = await ink(page);
  await move(page, 350, 200);
  await page.mouse.down();
  await move(page, 450, 200);
  await page.mouse.up();
  const drawn = await ink(page);
  expect(drawn).not.toBe(blank);
  await click(page, 26, 330);
  expect(await ink(page)).toBe(drawn);
  await move(page, 28.5, 350.5);
  await expect(rollover(page, 'undo')).toBeVisible();
  await click(page, 28.5, 350.5);
  await expect.poll(() => ink(page)).toBe(blank);
});
