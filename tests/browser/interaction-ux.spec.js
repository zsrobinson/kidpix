import { test, expect } from '@playwright/test';

// Native guide expectations and browser-only UX policy are distinguished in
// docs/audits/interaction-ux.md. No native runtime parity is claimed here.
const button = (page, name) => page.getByRole('button', { name, exact: true });
const canvas = page => page.locator('#paper-canvas');
const objects = page => page.locator('#objects .scene-object');
const title = page => page.getByRole('textbox', { name: 'Picture title', exact: true });
const text = page => page.getByLabel('Picture text', { exact: true });
const ink = page => canvas(page).evaluate(node => node.toDataURL());

async function point(page, x, y) {
  const bounds = await canvas(page).boundingBox();
  return [bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542];
}
async function move(page, x, y) { await page.mouse.move(...await point(page, x, y)); }
async function stroke(page, from = [80, 80], to = [220, 110]) {
  await move(page, ...from);
  await page.mouse.down();
  await move(page, ...to);
  await page.mouse.up();
}
async function marker(page) {
  await button(page, 'Drawing Tools').click();
  await button(page, 'Marker').click();
  await button(page, 'Small').click();
  await expect(canvas(page)).toHaveAttribute('data-paint-ready', 'ready');
}
async function addText(page, words = 'Keep these words') {
  await button(page, 'Text Tools').click();
  await page.mouse.click(...await point(page, 140, 130));
  await expect(text(page)).toBeFocused();
  await text(page).fill(words);
}
async function undoRedo(page, before, after) {
  await canvas(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(after);
}
async function firstSticker(page) {
  await button(page, 'Stickers').click();
  const tile = page.locator('#library-tray [data-asset][draggable="true"]').first();
  await expect(tile).toBeVisible();
  return tile;
}
async function objectRect(page) {
  return objects(page).last().evaluate(node => ({
    x: parseFloat(node.style.left), y: parseFloat(node.style.top),
    width: parseFloat(node.style.width), height: parseFloat(node.style.height),
  }));
}

test.beforeEach(async ({ page }) => {
  page.uxErrors = [];
  page.on('pageerror', error => page.uxErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.uxErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.uxErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(canvas(page)).toHaveAttribute('data-paint-ready', 'ready');
});
test.afterEach(async ({ page }) => {
  expect(page.uxErrors, 'Uncaught browser errors and missing requested assets').toEqual([]);
});

test('keyboard focus reaches chrome controls and title selection/copy/paste stays inside the editor', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await title(page).fill('Picture Alpha');
  await title(page).press('Home');
  await title(page).press('Shift+End');
  expect(await title(page).evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('Picture Alpha');
  await title(page).press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Picture Alpha');
  await page.keyboard.insertText('Beta');
  await expect(title(page)).toHaveValue('Beta');
  await title(page).press('ControlOrMeta+a');
  await title(page).press('ControlOrMeta+v');
  await expect(title(page)).toHaveValue('Picture Alpha');
  await title(page).press('Tab');
  await expect(button(page, 'Drawing Tools')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Drawing Tools')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Pencil')).toBeVisible();
  await expect(objects(page)).toHaveCount(0);
});

test('picture text supports pointer selection, keyboard copy/cut/paste and history after blur', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await addText(page, 'Editable picture words');
  const bounds = await text(page).boundingBox();
  // A real pointer sweep catches inherited user-select:none on scene objects.
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + Math.min(bounds.width - 3, 190), bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).not.toBe('');
  await text(page).press('ControlOrMeta+a');
  await text(page).press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Editable picture words');
  await text(page).press('ControlOrMeta+x');
  await expect(text(page)).toHaveText('');
  await expect(objects(page)).toHaveCount(1);
  await text(page).press('ControlOrMeta+v');
  await expect(text(page)).toHaveText('Editable picture words');
  await text(page).press('End');
  await text(page).press('!');
  await title(page).click();
  await expect(objects(page)).toHaveCount(1);
  await canvas(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(objects(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(text(page)).toHaveText('Editable picture words!');
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 800, height: 600 }, { width: 600, height: 900 }]) {
  test(`library drag drops at picture coordinates and remains editable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const scale = Math.min(viewport.width / 1024, viewport.height / 768);
    await expect.poll(async () => (await canvas(page).boundingBox()).width).toBeCloseTo(720 * scale, 2);
    const tile = await firstSticker(page);
    const assetName = await tile.getAttribute('aria-label');
    const drop = await point(page, 410, 270);
    const from = await tile.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 - 12, { steps: 3 });
    await page.mouse.move(...drop, { steps: 15 });
    await page.mouse.up();
    await expect(objects(page)).toHaveCount(1);
    const image = objects(page).locator('img');
    await expect(image).toHaveAttribute('alt', assetName);
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    const rect = await objectRect(page);
    // HTML drag events quantize to screen pixels. Bound error in screen
    // coordinates rather than demanding a subpixel native-page position.
    expect(Math.abs(rect.x + rect.width / 2 - 410) * scale).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.y + rect.height / 2 - 270) * scale).toBeLessThanOrEqual(1);
    await expect(button(page, 'Grab Tools')).toHaveAttribute('aria-pressed', 'true');
    await canvas(page).focus();
    await page.keyboard.press('ArrowRight');
    expect((await objectRect(page)).x).toBeCloseTo(rect.x + 1, 4);
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(objects(page)).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(objects(page)).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(objects(page)).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(objects(page)).toHaveCount(1);
  });
}

test('abandoned library drag creates no object and the next real drop succeeds once', async ({ page }) => {
  const tile = await firstSticker(page);
  const bounds = await tile.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 10, bounds.y - 20, { steps: 4 });
  await page.mouse.move(4, 4, { steps: 10 });
  await page.mouse.up();
  await expect(objects(page)).toHaveCount(0);
  await tile.dragTo(canvas(page), { targetPosition: { x: 400, y: 240 } });
  await expect(objects(page)).toHaveCount(1);
  await canvas(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(objects(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(objects(page)).toHaveCount(1);
});

test('object pointer cancellation stops movement and preserves a single undoable move', async ({ page }) => {
  const tile = await firstSticker(page);
  await tile.dragTo(canvas(page), { targetPosition: { x: 320, y: 230 } });
  await expect(objects(page)).toHaveCount(1);
  const original = await objectRect(page);
  const root = page.locator('#objects');
  await root.evaluate(node => node.addEventListener('pointerdown', event => { node.dataset.uxPointer = event.pointerId; }));
  const bounds = await objects(page).boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 25);
  const moved = await objectRect(page);
  expect(moved.x).toBeCloseTo(original.x + 35, 4);
  expect(moved.y).toBeCloseTo(original.y + 25, 4);
  await root.evaluate(node => node.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: Number(node.dataset.uxPointer), pointerType: 'mouse', bubbles: true,
  })));
  await page.mouse.up();
  await move(page, 500, 400);
  expect(await objectRect(page)).toEqual(moved);
  await canvas(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await objectRect(page)).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await objectRect(page)).toEqual(moved);
});

test('captured paint release outside the paper ends one stroke without chrome selection', async ({ page }) => {
  await marker(page);
  const blank = await ink(page);
  await move(page, 120, 120);
  await page.mouse.down();
  await move(page, 250, 140);
  await page.mouse.move(1018, 760);
  await page.mouse.up();
  const drawn = await ink(page);
  expect(drawn).not.toBe(blank);
  await move(page, 350, 240);
  expect(await ink(page), 'Pointer movement after release cannot extend the stroke').toBe(drawn);
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await undoRedo(page, blank, drawn);
  await stroke(page, [100, 300], [200, 300]);
  expect(await ink(page), 'A fresh stroke still works after outside release').not.toBe(drawn);
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur']) {
  test(`${interruption} ends native paint without dropping ink or leaking a held gesture`, async ({ page }) => {
    await marker(page);
    const blank = await ink(page);
    await canvas(page).evaluate(node => node.addEventListener('pointerdown', event => { node.dataset.uxPointer = event.pointerId; }));
    await move(page, 90, 100);
    await page.mouse.down();
    await move(page, 240, 120);
    const drawn = await ink(page);
    expect(drawn).not.toBe(blank);
    // Cancellation and blur delivery are injected at the OS-event boundary;
    // ordinary movement, capture establishment and ink are real browser input.
    await canvas(page).evaluate((node, kind) => {
      const pointerId = Number(node.dataset.uxPointer);
      if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      else if (kind === 'lostpointercapture') node.releasePointerCapture(pointerId);
      else node.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true, pointerType: 'mouse' }));
    }, interruption);
    await page.mouse.up();
    await move(page, 400, 250);
    expect(await ink(page), 'Delivered ink survives; movement after cancellation adds nothing').toBe(drawn);
    await undoRedo(page, blank, drawn);
    await stroke(page, [90, 300], [240, 300]);
    const next = await ink(page);
    expect(next).not.toBe(drawn);
    await undoRedo(page, drawn, next);
  });
}

test('modal Cancel and Escape preserve edits while background controls stay out of keyboard focus', async ({ page }) => {
  await marker(page);
  await stroke(page);
  const drawn = await ink(page);
  await title(page).fill('Unfinished picture');
  await addText(page, 'Draft remains');
  for (const dismissal of ['Cancel', 'Escape']) {
    const trigger = button(page, 'Create New Picture');
    await trigger.click();
    const dialog = page.locator('#dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Create a new picture?');
    const focusedActions = new Set();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const focus = await dialog.evaluate(node => ({
        allowed: document.activeElement === document.body || node.contains(document.activeElement),
        label: node.contains(document.activeElement) ? document.activeElement.textContent : null,
      }));
      // Chromium can put focus on its browser chrome between cycles (reported
      // as body); the picture controls must remain inert throughout.
      expect(focus.allowed, 'Tab never enters an inert picture control').toBe(true);
      if (focus.label) focusedActions.add(focus.label);
    }
    expect([...focusedActions].sort()).toEqual(['Cancel', 'New Picture']);
    await title(page).evaluate(node => node.focus());
    await expect(title(page)).not.toBeFocused();
    if (dismissal === 'Cancel') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(title(page)).toHaveValue('Unfinished picture');
    await expect(text(page)).toHaveText('Draft remains');
    expect(await ink(page)).toBe(drawn);
  }
  await canvas(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(objects(page)).toHaveCount(0);
  expect(await ink(page), 'Dismissing the dialog adds no picture-history entry').toBe(drawn);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(text(page)).toHaveText('Draft remains');
});

test('paper, color and menu popup dismissal preserve the edited picture', async ({ page }) => {
  await addText(page, 'Do not lose this edit');
  await title(page).fill('Popup draft');
  const before = await ink(page);
  await button(page, 'Paper Texture Canister').click();
  await expect(page.locator('#paper-picker')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#paper-picker')).toBeHidden();
  await expect(button(page, 'Paper Texture Canister')).toHaveAttribute('aria-expanded', 'false');
  await button(page, 'Paper Texture Canister').click();
  await expect(page.locator('#paper-picker')).toBeVisible();
  await title(page).click();
  await expect(page.locator('#paper-picker')).toBeHidden();
  await button(page, 'Color Swatch').hover();
  await expect(page.locator('#palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#palette')).toBeHidden();
  await button(page, 'Show menus').click();
  await expect(page.locator('#menu-items')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-items')).toBeHidden();
  await expect(button(page, 'Show menus')).toHaveAttribute('aria-expanded', 'false');
  await expect(title(page)).toHaveValue('Popup draft');
  await expect(text(page)).toHaveText('Do not lose this edit');
  expect(await ink(page)).toBe(before);
  await text(page).click();
  await text(page).press('ControlOrMeta+a');
  await text(page).press('!');
  await expect(text(page)).toHaveText('!');
});

for (const interruption of ['lost capture', 'window blur']) {
  test(`object dragging settles once after ${interruption} and later hover cannot move it`, async ({ page }) => {
    const tile = await firstSticker(page);
    await tile.dragTo(canvas(page), { targetPosition: { x: 320, y: 230 } });
    await expect(objects(page)).toHaveCount(1);
    const original = await objectRect(page);
    const bounds = await objects(page).boundingBox();
    await page.locator('#objects').evaluate(node => node.addEventListener('pointerdown', event => { node.dataset.pointer = event.pointerId; }));
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 10);
    if (interruption === 'lost capture') {
      await page.locator('#objects').evaluate(node => node.releasePointerCapture(Number(node.dataset.pointer)));
    } else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.move(1020, 740);
    await page.mouse.up();
    const moved = await objectRect(page);
    expect(moved).not.toEqual(original);
    await page.mouse.move(x + 30, y + 20);
    expect(await objectRect(page), 'A no-buttons hover cannot continue an interrupted move').toEqual(moved);
    await canvas(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => objectRect(page)).toEqual(original);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => objectRect(page)).toEqual(moved);
  });
}

test('dismissing the moving paper before completion cannot reopen it over continued text editing', async ({ page }) => {
  await addText(page, 'Opening draft');
  const control = button(page, 'Paper Texture Canister');
  await control.click();
  await expect(control).toHaveAttribute('data-paper-state', 'opening');
  await page.keyboard.press('Escape');
  await expect(control).toHaveAttribute('data-paper-state', 'closed');
  await text(page).click();
  await text(page).press('ControlOrMeta+a');
  await page.keyboard.insertText('Continued draft');
  // Past the recovered six 100ms groups, a canceled asynchronous opening must
  // not publish stale controls. This uses real timers, not a mocked clock.
  await page.waitForTimeout(700);
  await expect(control).toHaveAttribute('data-paper-state', 'closed');
  await expect(page.locator('#paper-picker')).toBeHidden();
  await expect(text(page)).toHaveText('Continued draft');
  await expect(text(page)).toBeFocused();
});
