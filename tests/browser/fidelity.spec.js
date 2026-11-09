import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.beforeEach(async ({ page }) => {
  page.fidelityErrors = [];
  page.on('pageerror', error => page.fidelityErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.fidelityErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.fidelityErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.addInitScript(() => {
    let seed = 12345;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  });
  const paths = ['catalog.json', 'ui/ui.json', 'ui/trays.json', 'ui/library-trays.json', 'tools/gradients.json'];
  const responses = paths.map(path => page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/original/${path}`) && response.ok()));
  await page.goto('/');
  const loaded = await Promise.all(responses);
  page.nativeUi = await loaded[1].json();
  page.uiQuery = new URL(loaded[1].url()).search;
  page.nativeTrays = await loaded[2].json();
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button', { name: 'Backgrounds', exact: true }).click();
  await expect(page.locator('#library-tray.original-library [data-asset]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Drawing Tools', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'pencil');
});

test.afterEach(async ({ page }) => {
  expect(page.fidelityErrors, 'Browser errors and failed asset requests').toEqual([]);
});

const button = (page, name) => page.getByRole('button', { name, exact: true });
const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
const swatch = page => page.locator('#color-chip').evaluate(canvas => canvas.toDataURL());
const uiSource = (page, file) => new URL(`original/ui/${file}${page.uiQuery}`, page.url()).href;
const pixel = (page, x, y) => page.locator('#paper-canvas').evaluate((canvas, point) => [...canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data], { x, y });

async function pointOnPage(page, x, y) {
  const bounds = await page.locator('#paper-canvas').boundingBox();
  return { x: bounds.x + x * bounds.width / 720, y: bounds.y + y * bounds.height / 542 };
}

async function drag(page, from, to) {
  const start = await pointOnPage(page, ...from);
  const end = await pointOnPage(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 15 });
  await page.mouse.up();
}

test('Undo Guy toggles the last action, independent arrows and new actions preserve history semantics', async ({ page }) => {
  const blank = await ink(page);
  await drag(page, [120, 120], [420, 120]);
  const firstStroke = await ink(page);
  expect(firstStroke).not.toBe(blank);

  const face = button(page, 'Undo Guy');
  const idle = page.locator('#native-buttons [data-native-part="undo-face"]');
  const animation = page.locator('#native-buttons .native-animation');
  const idleSource = await idle.getAttribute('src');
  await face.click();
  await expect.poll(() => ink(page)).toBe(blank);
  await expect(animation).toBeVisible();
  await expect(idle).toBeHidden();
  const script = Number(await animation.getAttribute('data-script'));
  const clip = page.nativeUi.undoAnimations.clips.find(item => item.script === script);
  expect(clip, 'Animation comes from an exported native script').toBeTruthy();
  const bounds = await animation.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual(clip.rect);
  await expect(animation).toBeHidden();
  await expect(idle).toBeVisible();
  expect(await idle.getAttribute('src')).toBe(idleSource);
  expect(await ink(page), 'Face animation does not paint on the picture').toBe(blank);

  await face.click();
  await expect.poll(() => ink(page)).toBe(firstStroke);
  await button(page, 'Undo').click();
  await expect.poll(() => ink(page)).toBe(blank);
  await button(page, 'Redo').click();
  await expect.poll(() => ink(page)).toBe(firstStroke);
  await face.click();
  await expect.poll(() => ink(page)).toBe(blank);

  await drag(page, [120, 220], [420, 220]);
  const replacementStroke = await ink(page);
  expect(replacementStroke).not.toBe(firstStroke);
  await expect(button(page, 'Redo')).toHaveAttribute('aria-disabled', 'true');
  await face.click();
  await expect.poll(() => ink(page)).toBe(blank);
  await face.click();
  await expect.poll(() => ink(page)).toBe(replacementStroke);
});

test('native selection artwork follows the selected tool, size and paint effect', async ({ page }) => {
  const drawing = button(page, 'Drawing Tools');
  const painting = button(page, 'Painting Tools');
  const drawImage = page.locator('#native-buttons [data-native-part="draw"]');
  const paintImage = page.locator('#native-buttons [data-native-part="paint"]');
  await expect(drawImage).toHaveJSProperty('src', uiSource(page, page.nativeUi.buttons.draw.images[3]));
  await drawing.hover();
  await page.mouse.move(1023, 767);
  await expect(drawImage).toHaveJSProperty('src', uiSource(page, page.nativeUi.buttons.draw.images[3]));

  await button(page, 'Straight Line').click();
  await button(page, 'Small').click();
  await drag(page, [120, 120], [420, 120]);
  await button(page, 'Large').click();
  await drag(page, [120, 220], [420, 220]);
  const thickness = await page.locator('#paper-canvas').evaluate(canvas => {
    const context = canvas.getContext('2d');
    return [120, 220].map(y => {
      const data = context.getImageData(270, y - 25, 1, 50).data;
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) if (Math.min(...data.slice(offset, offset + 3)) < 250) count++;
      return count;
    });
  });
  expect(thickness[0]).toBeGreaterThan(0);
  expect(thickness[1]).toBeGreaterThan(thickness[0] * 2);

  await painting.click();
  await page.mouse.move(1023, 767);
  await expect(paintImage).toHaveJSProperty('src', uiSource(page, page.nativeUi.buttons.paint.images[3]));
  await expect(drawImage).toHaveJSProperty('src', uiSource(page, page.nativeUi.buttons.draw.images[0]));
  await button(page, 'Air Brush').click();
  await button(page, 'Large').click();
  await page.mouse.move(1023, 767);
  await expect(page.locator('#tray-buttons .native-option[aria-pressed="true"]')).toHaveCount(1);
  await expect(button(page, 'Air Brush')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Oil Paint')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#tray-buttons [data-native-part="size-large"]')).toHaveJSProperty('src', uiSource(page, page.nativeUi.drawingOptions['size-large'].images[2]));
  await expect(page.locator('#tray-buttons [data-native-part="size-medium"]')).toHaveJSProperty('src', uiSource(page, page.nativeUi.drawingOptions['size-medium'].images[0]));

  // The selected effect must not leave a second, baked-in red frame around
  // the first thumbnail. Check its opaque border against the recovered frame.
  await page.locator('#tray-art').evaluate(image => image.decode());
  const capture = PNG.sync.read(await page.locator('#studio').screenshot());
  const neutral = PNG.sync.read(await (await page.request.get('/original/ui/trays/icons/option-frame-738.png')).body());
  const [x, y] = page.nativeTrays.trays.paint.options[0];
  const actual = (capture.width * (y + 3) + x + 3) * 4;
  const expected = (neutral.width * 3 + 3) * 4;
  expect([...capture.data.subarray(actual, actual + 4)]).toEqual([...neutral.data.subarray(expected, expected + 4)]);
});

test('eyedropper previews scene colors, cancels without committing and picks on click', async ({ page }) => {
  const image = new PNG({ width: 20, height: 20 });
  for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([238, 51, 102, 255], offset);
  const fixture = {
    version: 1, format: 'kidpix-web', title: 'Eyedropper fixture',
    paint: { version: 1, width: 720, height: 542, art: null },
    objects: [{ id: 'color-fixture', kind: 'image', name: 'Red sampling square', x: 300, y: 200, width: 120, height: 120, src: `data:image/png;base64,${PNG.sync.write(image).toString('base64')}` }],
  };
  await page.locator('#picture-file').setInputFiles({ name: 'eyedropper.kidpix-web', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole('textbox', { name: 'Picture title', exact: true })).toHaveValue('Eyedropper fixture');
  const object = page.locator('#objects .scene-object');
  await expect(object).toHaveCount(1);
  await object.locator('img').evaluate(image => image.decode());
  expect(await pixel(page, 360, 260), 'The paint layer beneath the object remains white').toEqual([255, 255, 255, 255]);
  await button(page, 'Grab Tools').click();
  await expect(object).toHaveClass(/is-selectable/);
  const black = await swatch(page);

  async function pick() {
    await button(page, 'Color Swatch').hover();
    await button(page, 'Eye Dropper').click();
    await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'eyedropper');
    await expect(page.locator('#paper-canvas')).toHaveCSS('cursor', /cursors\/10006-0\.png.*1 30/);
    await expect(object).not.toHaveClass(/is-selectable/);
    const bounds = await object.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect.poll(() => swatch(page)).not.toBe(black);
  }

  await pick();
  await page.keyboard.press('Escape');
  await expect.poll(() => swatch(page)).toBe(black);
  await expect(object).toHaveClass(/is-selectable/);
  await button(page, 'Drawing Tools').click();
  await drag(page, [120, 90], [420, 90]);
  expect(await pixel(page, 270, 90), 'Preview alone did not change the drawing color').toEqual([0, 0, 0, 255]);

  await pick();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'pencil');
  await button(page, 'Color Swatch').hover();
  await expect(page.locator('#custom-color')).toHaveValue('#ee3366');
  await page.keyboard.press('Escape');
  // Use one opaque path for the color check; overlapping anti-aliased freehand
  // dabs can accumulate a one-level channel rounding difference in Canvas.
  await button(page, 'Straight Line').click();
  await drag(page, [120, 130], [420, 130]);
  expect(await pixel(page, 270, 130), 'Picked object color becomes the drawing color').toEqual([238, 51, 102, 255]);
});
