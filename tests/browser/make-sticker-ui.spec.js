import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const command = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(button => button.click());
const objects = page => page.locator('#objects .scene-object');
async function drag(page, points) {
  const box = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.move(box.x + points[0][0], box.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
  await page.mouse.up();
}
async function save(page) {
  const download = page.waitForEvent('download');
  await command(page, 'save');
  await page.locator('#dialog-actions').getByRole('button', { name: 'Save Picture', exact: true }).click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

for (const style of ['rectangle', 'freehand']) test(`shipped Make Sticker ${style}: exact geometry, retained ink, one Undo/Redo and saved picture`, async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();
  await drag(page, [[110, 110], [130, 120], [145, 140]]);
  const original = await save(page);
  await command(page, 'tray:grab');
  await command(page, 'tool:scissors');
  await command(page, `style:${style}`);
  const control = page.locator('#tray-buttons [data-action="make-sticker"]');
  await expect(control).toBeDisabled();
  await drag(page, style === 'rectangle' ? [[100, 100], [160, 160]] : [[100, 100], [160, 100], [100, 160], [100, 100]]);
  await expect(control).toBeEnabled();
  if (style === 'rectangle') await control.click();
  else {
    await page.locator('#menu-trigger').click();
    await page.locator('#menu-items summary').filter({ hasText: 'Paint Zone' }).click();
    await page.locator('#menu-items [data-action="make-sticker"]').click();
  }
  await expect(objects(page)).toHaveCount(1);
  expect(await objects(page).evaluate(node => [node.style.left, node.style.top, node.style.width, node.style.height])).toEqual(['100px', '100px', '60px', '60px']);
  const converted = await save(page);
  expect(converted.paint).toEqual(original.paint);
  expect(converted.objects).toHaveLength(1);
  expect(converted.objects[0]).toMatchObject({ kind: 'image', x: 100, y: 100, width: 60, height: 60 });
  await command(page, 'undo');
  await expect(objects(page)).toHaveCount(0);
  await expect(page.locator('#tray-buttons [data-action="make-sticker"]')).toBeEnabled();
  await command(page, 'redo');
  await expect(objects(page)).toHaveCount(1);
  expect((await save(page)).objects).toEqual(converted.objects);
});
