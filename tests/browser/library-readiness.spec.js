import { test, expect } from '@playwright/test';

for (const heldDrag of [false, true]) test(`Stamp readiness preserves library identity during ${heldDrag ? 'drag' : 'category focus'}`, async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/secondary-motion/manifest.json*', async route => {
    const response = await route.fetch(); await gate; await route.fulfill({ response });
  });
  try {
    await page.goto('/');
    await expect(page.locator('canvas[data-native-tool-motion="draw"]')).toBeVisible();
    await page.locator('[data-action="tray:stamp"]').click();
    const tile = page.locator('#library-tray [data-asset][draggable="true"]').first();
    const originalTile = await tile.elementHandle();
    const category = page.locator('#category');
    const originalCategory = await category.elementHandle();
    const paper = page.locator('#paper-canvas');
    const before = await paper.evaluate(node => node.toDataURL());
    if (heldDrag) {
      await page.evaluate(() => { window.libraryDragStarted = false;
        document.addEventListener('dragstart', () => { window.libraryDragStarted = true; }, { once: true }); });
      const box = await tile.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 - 12, { steps: 3 });
      await expect.poll(() => page.evaluate(() => window.libraryDragStarted)).toBe(true);
    } else await category.focus();
    release();
    await expect(page.locator('canvas[data-native-stamp-motion]')).toHaveCount(3);
    expect(await originalTile.evaluate(node => node.isConnected)).toBe(true);
    expect(await originalCategory.evaluate(node => node.isConnected)).toBe(true);
    if (heldDrag) {
      const box = await paper.boundingBox();
      await page.mouse.move(box.x + 400, box.y + 240, { steps: 5 }); await page.mouse.up();
    } else {
      await expect(category).toBeFocused();
      await tile.dragTo(paper, { targetPosition: { x: 400, y: 240 } });
    }
    await expect.poll(() => paper.evaluate(node => node.toDataURL())).not.toBe(before);
  } finally { release(); await page.mouse.up(); }
});
