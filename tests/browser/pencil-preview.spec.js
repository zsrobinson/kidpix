import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const choice = page => page.locator('[data-action="pencil-preview"]');
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
}
async function menu(page, name = 'Paint Zone') {
  await page.getByRole('button', { name: 'Show menus' }).click();
  await page.locator('#menu summary').filter({ hasText: new RegExp(`^${name}$`) }).click();
}
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.__previewErrors = errors;
});
test.afterEach(async ({ page }) => { expect(page.__previewErrors).toEqual([]); });

test('fresh default, keyboard and assistive once-only toggle and reload persistence', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#menu-items')).toBeHidden();
  await expect(choice(page)).toHaveAttribute('aria-checked', 'false');
  await menu(page);
  await expect(page.locator('#pencil-preview-help')).toBeVisible();
  await choice(page).focus(); await page.keyboard.press('Space');
  await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await page.reload(); await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await menu(page); await choice(page).focus(); await page.keyboard.press('Enter');
  await expect(choice(page)).toHaveAttribute('aria-checked', 'false');
  await menu(page);
  await choice(page).evaluate(button => button.click());
  await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await page.reload(); await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
});

test.describe('touch choice', () => {
  test.use({ hasTouch: true });
  test('activates once', async ({ page }) => {
    await ready(page); await menu(page);
    await choice(page).tap();
    await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
    await menu(page); await choice(page).tap();
    await expect(choice(page)).toHaveAttribute('aria-checked', 'false');
  });
});
for (const mode of ['denied', 'malformed']) test(`${mode} storage safely defaults off`, async ({ page }) => {
  await page.addInitScript(mode => {
    if (mode === 'denied') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    else localStorage.setItem('kidpix.pencil-preview', '{"enabled":true}');
  }, mode);
  await ready(page); await expect(choice(page)).toHaveAttribute('aria-checked', 'false');
  await menu(page); await choice(page).click();
  await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await page.reload(); await expect(choice(page)).toHaveAttribute('aria-checked', 'false');
});

test('saved picture, New, Open and history do not contain or reset browser choice', async ({ page }) => {
  await ready(page); await menu(page); await choice(page).click();
  const c = page.locator('#paper-canvas'), box = await c.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 80); await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 100, { steps: 4 }); await page.mouse.up();
  for (const action of ['undo', 'redo']) {
    await menu(page, 'Edit'); await page.locator(`#menu-items [data-action="${action}"]`).click();
    await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  }
  await menu(page, 'File'); await page.locator('#menu-items [data-action="save"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#dialog-actions').getByRole('button', { name: 'Save Picture', exact: true }).click();
  const download = await downloadPromise;
  const content = await readFile(await download.path(), 'utf8');
  expect(content).not.toMatch(/pencil.?preview|prediction/i);
  const savedInk = await c.evaluate(canvas => canvas.toDataURL());
  await menu(page, 'File'); await page.locator('#menu-items [data-action="new"]').click();
  await page.locator('#dialog-actions').getByRole('button', { name: 'New Picture', exact: true }).click();
  await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await page.locator('#picture-file').setInputFiles({ name: 'roundtrip.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(choice(page)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => c.evaluate(canvas => canvas.toDataURL())).toBe(savedInk);
  await expect(page.locator('#status')).not.toContainText('Could not');
});
