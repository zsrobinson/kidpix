import { test, expect } from '@playwright/test';

const backgrounds = page => page.getByRole('button', { name: 'Backgrounds', exact: true });
const rollover = page => page.locator('#native-buttons [data-native-rollover="backgrounds"]');
const underlying = page => page.locator('#native-buttons [data-native-part="backgrounds"]');

test.beforeEach(async ({ page }) => {
  page.rolloverErrors = [];
  page.on('pageerror', error => page.rolloverErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.rolloverErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.rolloverErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  const response = await ready;
  page.nativeUi = await response.json();
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(rollover(page)).toHaveCount(1);
  await expect(backgrounds(page)).toHaveAttribute('aria-pressed', 'false');
  // Decode before pausing the clock or measuring source frames.
  const record = page.nativeUi.buttonAnimations.buttons.find(button => button.name === 'backgrounds');
  page.rolloverClip = page.nativeUi.buttonAnimations.scripts[String(record.rolloverScript)];
  await page.evaluate(async frames => {
    await Promise.all(frames.map(frame => {
      const image = new Image();
      image.src = `original/ui/${frame.image}`;
      return image.decode();
    }));
  }, page.rolloverClip.frames);
  await page.mouse.move(1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
});

test.afterEach(async ({ page }) => {
  expect(page.rolloverErrors, 'Browser errors and missing native assets').toEqual([]);
});

async function moveInside(page, fraction = .5) {
  const bounds = await backgrounds(page).boundingBox();
  await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height * .5);
}

test('actual Backgrounds control uses word-10 script 1002, preserves progress inside, repeats and cancels on leave', async ({ page }) => {
  const image = rollover(page);
  expect(page.rolloverClip.script).toBe(1002);
  expect(page.rolloverClip.tickMs).toBe(100);
  await moveInside(page);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('data-script', '1002');
  await expect(image).toHaveAttribute('data-frame', '0');
  await expect(underlying(page)).toBeHidden();
  const bounds = await image.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual(page.rolloverClip.rect);
  await page.clock.runFor(120);
  await expect(image).toHaveAttribute('data-frame', '1');
  await moveInside(page, .6);
  await expect(image).toHaveAttribute('data-frame', '1');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '2');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '3');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '0');
  await page.mouse.move(1023, 767);
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
  const idlePath = await underlying(page).getAttribute('src');
  expect(new URL(idlePath, page.url()).pathname).toContain(`/${page.nativeUi.buttons.backgrounds.images[0]}`);
  await page.clock.runFor(1000);
  await expect(image).toBeHidden();
});

test('actual Backgrounds press cancels rollover and selected or disabled controls suppress it', async ({ page }) => {
  const control = backgrounds(page);
  const image = rollover(page);
  await moveInside(page);
  await expect(image).toBeVisible();
  await page.mouse.down();
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(1023, 767);
  await moveInside(page);
  await page.clock.runFor(500);
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();

  const drawing = page.getByRole('button', { name: 'Drawing Tools', exact: true });
  const drawBounds = await drawing.boundingBox();
  await page.mouse.click(drawBounds.x + drawBounds.width / 2, drawBounds.y + drawBounds.height / 2);
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  // Backgrounds has no normal disabled application state. Exercise this real
  // control's accessibility state and its native binding observer directly.
  await control.evaluate(element => element.setAttribute('aria-disabled', 'true'));
  await moveInside(page);
  await page.clock.runFor(500);
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
  await page.mouse.move(1023, 767);
  await control.evaluate(element => element.setAttribute('aria-disabled', 'false'));
  await moveInside(page);
  await expect(image).toBeVisible();
  await control.evaluate(element => element.setAttribute('aria-disabled', 'true'));
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
});
