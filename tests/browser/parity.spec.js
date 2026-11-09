import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { scenarios } from './scenarios.js';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  page.parityErrors = errors;
  await page.addInitScript(() => {
    let seed = 12345;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  });
  const manifests = ['catalog.json', 'ui/ui.json', 'ui/trays.json', 'ui/library-trays.json', 'tools/gradients.json'];
  const loaded = manifests.map(path => page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/original/${path}`) && response.ok()));
  await page.goto('/');
  await Promise.all(loaded);
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  // Exercise catalog rendering too, so a response arriving before its .json()
  // continuation cannot leave a capture racing the library initialization.
  await page.getByRole('button', { name: 'Backgrounds', exact: true }).click();
  await expect(page.locator('#library-tray.original-library [data-asset]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Drawing Tools', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'pencil');
});

test.afterEach(async ({ page }) => {
  expect(page.parityErrors, 'Browser errors and failed asset requests').toEqual([]);
});

async function readyImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = element => element.getBoundingClientRect().width && element.getBoundingClientRect().height;
    await Promise.all([...document.images].filter(visible).map(image => image.decode()));
    const urls = new Set();
    for (const element of document.querySelectorAll('#studio, #studio *')) {
      if (!visible(element)) continue;
      for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\("?([^"\)]+)"?\)/g)) urls.add(match[1]);
    }
    await Promise.all([...urls].map(url => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Cannot load ${url}`));
      image.src = url;
    })));
  });
}

async function capture(page, testInfo, id) {
  await page.mouse.move(1023, 767);
  await expect(page.locator('#status')).toBeHidden();
  const motionTray = scenarios.find(scenario => scenario.id === id)?.motionTray;
  if (motionTray) {
    const actor = page.locator(`[data-native-tool-motion="${motionTray}"]:visible`);
    await expect(actor, 'Source tool motion is loaded before capturing its final pose').toHaveCount(1, { timeout: 20_000 });
    await expect.poll(async () => actor.evaluate(canvas => {
      const snapshot = JSON.parse(canvas.dataset.motionSnapshot || '[]');
      return snapshot.length > 0 && snapshot.every(item => item.finished && !item.auxiliary);
    }), { message: 'All finite tool programs reached their delivered end check', timeout: 10_000 }).toBe(true);
  }
  await readyImages(page);
  const path = testInfo.outputPath(`${id}.png`);
  await page.locator('#studio').screenshot({ path, animations: 'disabled', caret: 'hide' });
  await testInfo.attach(`parity:${id}`, { path, contentType: 'image/png' });
}

async function dragOnPage(page, from, to) {
  const bounds = await page.locator('#paper-canvas').boundingBox();
  const position = ([x, y]) => [bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542];
  await page.mouse.move(...position(from));
  await page.mouse.down();
  await page.mouse.move(...position(to), { steps: 20 });
  await page.mouse.up();
}

const canvasData = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
const placedObject = page => page.locator('#objects .scene-object').evaluate(node => ({
  id: node.dataset.object, position: node.getAttribute('style'),
  source: node.querySelector('img').getAttribute('src'), name: node.querySelector('img').alt,
}));

for (const scenario of scenarios) {
  test(scenario.id, async ({ page }, testInfo) => {
    if (scenario.id === 'pencil-line' || scenario.id === 'filled-box') {
      const blank = await canvasData(page);
      await page.getByRole('button', { name: scenario.id === 'pencil-line' ? 'Straight Line' : 'Filled Box', exact: true }).click();
      await dragOnPage(page, [120, 120], [420, 300]);
      expect(await canvasData(page)).not.toBe(blank);
      const pixel = await page.locator('#paper-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(270, 210, 1, 1).data]);
      expect(pixel).toEqual([0, 0, 0, 255]);
    }
    if (scenario.id === 'paint-tray' || scenario.id === 'paint-airbrush-large') {
      await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
      await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'brush');
      if (scenario.id === 'paint-airbrush-large') {
        await page.getByRole('button', { name: 'Large', exact: true }).click();
        await page.getByRole('button', { name: 'Air Brush', exact: true }).click();
      }
    }
    if (scenario.id === 'backgrounds-tray') {
      await page.getByRole('button', { name: 'Backgrounds', exact: true }).click();
      await expect(page.locator('#library-tray [data-asset]').first()).toBeVisible();
    }
    if (scenario.id === 'spray-native-shape') {
      await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
      await page.getByRole('button', { name: 'Spray Can', exact: true }).click();
      await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
      await page.mouse.click(164 + 220, 67 + 170);
    }
    const trayCaptures = {
      'bucket-tray': 'Paint Bucket Tools', 'mixer-tray': 'Mixer Tools', 'eraser-tray': 'Eraser Tools',
      'grab-tray': 'Grab Tools', 'scissors-tray': 'Grab Tools', 'stamp-tray': 'Rubber Stamp Tools', 'text-tray': 'Text Tools',
    };
    if (trayCaptures[scenario.id]) {
      await page.getByRole('button', { name: trayCaptures[scenario.id], exact: true }).click();
      if (scenario.id === 'scissors-tray') await page.getByRole('button', { name: 'Scissors', exact: true }).click();
      if (scenario.id === 'stamp-tray') await expect(page.locator('#library-tray [data-asset]').first()).toBeVisible();
      if (scenario.id === 'text-tray') {
        await page.getByRole('spinbutton', { name: 'Font size', exact: true }).fill('32');
        await page.getByRole('spinbutton', { name: 'Font size', exact: true }).dispatchEvent('change');
        // Commit the value and leave keyboard focus on neutral tray chrome.
        await page.mouse.click(394, 618);
      }
    }
    if (scenario.id === 'stamp-editor') {
      await page.getByRole('button', { name: 'Rubber Stamp Tools', exact: true }).click();
      await page.locator('#library-tray [data-asset]').first().dblclick();
      await expect(page.getByRole('dialog', { name: 'Stamp Editor', exact: true })).toBeVisible();
    }
    if (scenario.id === 'sticker-placed') {
      await page.getByRole('button', { name: 'Stickers', exact: true }).click();
      await page.locator('#library-tray [data-asset]').first().dblclick();
      await expect(page.locator('#objects .scene-object')).toHaveCount(1);
    }
    if (scenario.id === 'slide-show') {
      await page.getByRole('button', { name: 'Add Picture to Slide Show', exact: true }).click();
      await page.getByRole('button', { name: 'Go to Slide Show', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Slide Show', exact: true })).toBeVisible();
      await expect(page.locator('#slide-grid img')).toHaveCount(1);
    }
    await capture(page, testInfo, scenario.id);
  });
}

test('draw, undo, redo, save, reopen and PNG export', async ({ page }, testInfo) => {
  const blank = await canvasData(page);
  await dragOnPage(page, [120, 120], [420, 300]);
  const drawn = await canvasData(page);
  expect(drawn).not.toBe(blank);
  // Use keyboard undo to avoid the Undo Guy's cosmetic animation in this test.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => canvasData(page)).toBe(blank);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => canvasData(page)).toBe(drawn);
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.locator('#library-tray [data-asset]').first().dblclick();
  await expect(page.locator('#objects .scene-object')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Picture title', exact: true }).fill('Parity roundtrip');
  await page.getByRole('button', { name: 'Save Picture', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Save Picture', exact: true }).click();
  const download = await downloadPromise;
  const projectPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(projectPath);
  const saved = JSON.parse(await readFile(projectPath, 'utf8'));
  expect(saved.format).toBe('kidpix-web');
  expect(saved.objects).toHaveLength(1);
  const objectBefore = await placedObject(page);
  await page.getByRole('button', { name: 'Create New Picture', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New Picture', exact: true }).click();
  await expect.poll(() => canvasData(page)).toBe(blank);
  await expect(page.locator('#objects .scene-object')).toHaveCount(0);
  await page.locator('#picture-file').setInputFiles(projectPath);
  await expect(page.getByRole('textbox', { name: 'Picture title', exact: true })).toHaveValue('Parity roundtrip');
  await expect.poll(() => canvasData(page)).toBe(drawn);
  expect(await placedObject(page)).toEqual(objectBefore);
  await page.getByRole('button', { name: 'Save Picture', exact: true }).click();
  const pngPromise = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Export PNG', exact: true }).click();
  const png = await pngPromise;
  const pngPath = testInfo.outputPath(png.suggestedFilename());
  await png.saveAs(pngPath);
  const { PNG } = await import('pngjs');
  const decoded = PNG.sync.read(await readFile(pngPath));
  expect([decoded.width, decoded.height]).toEqual([720, 542]);
  expect([...decoded.data.subarray((210 * 720 + 270) * 4, (210 * 720 + 270) * 4 + 4)]).toEqual([0, 0, 0, 255]);
});

test('drawing coordinates survive a smaller viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(async () => (await page.locator('#studio').boundingBox()).width).toBe(800);
  await dragOnPage(page, [120, 120], [420, 300]);
  const pixel = await page.locator('#paper-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(270, 210, 1, 1).data]);
  expect(pixel).toEqual([0, 0, 0, 255]);
});
