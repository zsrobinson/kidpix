import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const shortcut of ['Control+x', 'Control+z', 'Delete', 'Control+v']) {
  test(`held recorded path cancels before ${shortcut} changes its target`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Stickers', exact: true }).click();
    await page.locator('#library-tray [data-asset]').first().dblclick();
    if (shortcut === 'Control+v') await page.keyboard.press('Control+c');
    await page.locator('[data-action="path"]').evaluate(button => button.click());
    const canvas = page.locator('#paper-canvas'), box = await canvas.boundingBox();
    await page.evaluate(() => window.addEventListener('pointerdown', event => { window.pathPointer = event.pointerId; }, { capture: true, once: true }));
    await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120);
    expect(await canvas.evaluate(node => node.hasPointerCapture(window.pathPointer))).toBe(true);
    await page.keyboard.press(shortcut);
    expect(await canvas.evaluate(node => node.hasPointerCapture(window.pathPointer))).toBe(false);
    expect(await page.locator('#scene-effects').evaluate(node => node.getContext('2d').getImageData(0, 0, node.width, node.height).data.some(value => value))).toBe(false);
    await page.mouse.up();
    await expect(page.locator('.scene-object')).toHaveCount(shortcut === 'Control+v' ? 2 : 0);
    await page.getByRole('button', { name: 'Save Picture', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Picture', exact: true }).click();
    const download = await downloaded, picture = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(picture.objects.every(object => !object.path && !object.pathDuration)).toBe(true);
    await page.getByRole('button', { name: 'Drawing Tools', exact: true }).click();
    const before = await canvas.evaluate(node => node.toDataURL());
    await page.mouse.move(box.x + 230, box.y + 180); await page.mouse.down();
    await page.mouse.move(box.x + 280, box.y + 180); await page.mouse.up();
    expect(await canvas.evaluate(node => node.toDataURL())).not.toBe(before);
    expect(errors).toEqual([]);
  });
}

for (const change of ['cut', 'delete', 'paste', 'restore']) test(`scene path rejects ${change} target invalidation @module`, async ({ page }) => {
  await page.route('**/path-target-harness', route => route.fulfill({ contentType: 'text/html', body: '<div id="surface" style="width:720px;height:542px"><div id="objects"></div></div>' }));
  await page.goto('/path-target-harness');
  const result = await page.evaluate(async change => {
    const { createScene } = await import('/src/scene.js');
    const { interactionOwner } = await import('/src/interaction-owner.js');
    const surface = document.querySelector('#surface'); let checkpoints = 0;
    const scene = createScene(document.querySelector('#objects'), surface, () => checkpoints++);
    scene.addAsset({ src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', width: 10, height: 10 });
    scene.edit('copy'); const before = scene.snapshot(); scene.beginPath();
    const event = (type, id, x) => new PointerEvent(type, { pointerId: id, pointerType: 'pen', button: 0, clientX: x, clientY: 100 });
    scene.pathStart(event('pointerdown', 17, 100)); scene.pathMove(event('pointermove', 17, 160));
    if (change === 'restore') scene.restore(before); else scene.edit(change);
    const count = checkpoints, accepted = scene.pathEnd(event('pointerup', 17, 180));
    const untouched = scene.snapshot().every(object => !object.path && !object.pathDuration);
    const released = interactionOwner().claim(event('pointerdown', 18, 100), surface);
    interactionOwner().release(surface, 18); scene.destroy();
    return { accepted, untouched, released, extraCheckpoints: checkpoints - count };
  }, change);
  expect(result).toEqual({ accepted: false, untouched: true, released: true, extraCheckpoints: 0 });
});
