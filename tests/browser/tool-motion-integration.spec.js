import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const actor = (page, tray = 'draw') => page.locator(`[data-native-tool-motion="${tray}"]`);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const snapshot = (page, tray = 'draw') => actor(page, tray).evaluate(canvas => JSON.parse(canvas.dataset.motionSnapshot));
const click = (page, action) => page.locator(`[data-action="${action}"]`).evaluate(control => control.click());
async function move(page, x, y) {
  const bounds = await page.locator('#studio').boundingBox();
  await page.mouse.move(bounds.x + x * bounds.width / 1024, bounds.y + y * bounds.height / 768);
}
async function until(page, start, elapsed) {
  const now = await page.evaluate(() => performance.now());
  if (start + elapsed > now) await page.clock.runFor(start + elapsed - now);
}

test.beforeEach(async ({ page }) => {
  page.motionErrors = [];
  page.on('pageerror', error => page.motionErrors.push(error.message));
  await page.addInitScript(() => {
    window.motionSounds = [];
    const RealAudio = window.Audio;
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/\/(drawing-motion|tool-motion)\//.test(String(src))) return new RealAudio(src);
        this.src = String(src); this.ended = true; this.paused = false;
        window.motionSounds.push(this);
      }
      play() { this.started = performance.now(); return Promise.resolve(); }
      pause() { this.paused = true; }
    };
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.goto('/');
  await expect(actor(page)).toBeVisible();
  await move(page, 1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
  page.toolIndex = await (await page.request.get('/original/ui/tool-motion/manifest.json')).json();
});

test.afterEach(async ({ page }) => { expect(page.motionErrors).toEqual([]); });

for (const name of ['pencil', 'chalk', 'crayon', 'marker']) {
  test(`${name}: actual controls retain every authored selection pose, end hold and owned cue`, async ({ page }) => {
    const manifest = page.toolIndex.trays.draw;
    const index = manifest.buttons.findIndex(button => button.name === name);
    const evidence = manifest.buttons[index];
    if (index === 0) await click(page, 'tool:chalk');
    await move(page, ...[evidence.region.boundsXYWH[0] + 20, 700]);
    await page.mouse.down();
    const start = await page.evaluate(() => performance.now());
    const clip = manifest.scripts[evidence.stateScripts[1]];
    // Playwright delivers RAF every16ms; a100ms deadline is delivered at112ms.
    // Source schedules the next deadline from that delivery rather than catching up.
    for (let tick = 0; tick < clip.endCheckTick; tick++) {
      await until(page, start, tick * 112 + 20);
      const frame = (await snapshot(page))[index];
      let expected = 0;
      while (expected + 1 < clip.frames.length && clip.frames[expected + 1].tick <= tick) expected++;
      expect(frame.frameIndex, `source update ${tick}`).toBe(expected);
      expect(frame.state).toBe(1);
      expect(frame.finished).toBe(false);
      if (tick === 1) {
        // A real same-tray size render must preserve the running script.
        await click(page, 'size:16');
        expect((await snapshot(page))[index].frameIndex).toBe(expected);
      }
    }
    await page.mouse.up();
    expect((await snapshot(page))[index].state).toBe(3);
    await until(page, start, clip.endCheckTick * 112 + 30);
    expect((await snapshot(page))[index]).toMatchObject({ frameIndex: clip.frames.length - 1, finished: true });
    const cue = manifest.sounds[clip.sounds[0].sound].src;
    const count = await page.evaluate(cue => window.motionSounds.filter(audio => audio.src.includes(cue)).length, cue);
    await page.clock.runFor(1000);
    expect((await snapshot(page))[index].frameIndex).toBe(clip.frames.length - 1);
    expect(await page.evaluate(cue => window.motionSounds.filter(audio => audio.src.includes(cue)).length, cue)).toBe(count);
    await expect(page.locator(`[data-action="tool:${name}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#native-draw [data-native-drawing-tool]')).toHaveCount(0);
  });
}

test('press, exact hit-region drag out/reentry, release-inside and keyboard share one transition', async ({ page }) => {
  await move(page, 290, 700); // Crayon's MRGN, not its larger sprite bounds.
  await page.mouse.down();
  await page.clock.runFor(220);
  const before = (await snapshot(page))[2];
  await page.mouse.up();
  const selected = (await snapshot(page))[2];
  expect(selected).toMatchObject({ script: before.script, frameIndex: before.frameIndex, state: 3 });
  await move(page, 230, 700); await page.mouse.down();
  await move(page, 180, 620);
  expect((await snapshot(page))[1].state).toBe(0);
  await move(page, 230, 700);
  expect((await snapshot(page))[1].state).toBe(1);
  await move(page, 180, 620); await page.mouse.up();
  expect((await snapshot(page))[2].state).toBe(3);
  await button(page, 'Marker').focus();
  await page.keyboard.down('Space');
  expect((await snapshot(page))[3].state).toBe(1);
  await page.clock.runFor(220);
  const held = (await snapshot(page))[3];
  await page.keyboard.up('Space');
  expect((await snapshot(page))[3]).toMatchObject({ script: held.script, frameIndex: held.frameIndex, state: 3 });
  const sounds = await page.evaluate(() => window.motionSounds.filter(audio => /18014\.wav/.test(audio.src)).length);
  expect(sounds).toBe(1);
  await button(page, 'Marker').press('Enter');
  expect((await snapshot(page))[3].frameIndex).toBe(held.frameIndex);
});

test('Space held across a color/size render retains focus and commits once on keyup', async ({ page }) => {
  await button(page, 'Chalk').focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(224);
  const before = (await snapshot(page))[1];
  await click(page, 'size:4');
  await expect(button(page, 'Chalk')).toBeFocused();
  expect((await snapshot(page))[1]).toMatchObject(before);
  await page.keyboard.up('Space');
  expect((await snapshot(page))[1]).toMatchObject({ state: 3, script: before.script, frameIndex: before.frameIndex });
  await expect(button(page, 'Chalk')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.motionSounds.filter(audio => /18008\.wav/.test(audio.src)).length)).toBe(1);
});

test('color and style renders preserve the running frame; actual studio pixels include source composition', { tag: '@module' }, async ({ page }, testInfo) => {
  await click(page, 'tool:crayon');
  await page.clock.runFor(220);
  const before = (await snapshot(page))[2];
  // Trigger the application's real palette path without hovering another tool.
  await click(page, 'palette');
  const color = page.locator('#palette [data-action^="color:"]').filter({ hasNot: page.locator('[hidden]') }).first();
  const selectedColor = (await color.getAttribute('data-action')).slice(6);
  await color.evaluate(control => control.click());
  await click(page, 'style:line');
  expect((await snapshot(page))[2]).toMatchObject({ script: before.script, frameIndex: before.frameIndex, state: 3 });
  // Build an independent backdrop in a separate canvas, then use the tested raw
  // callback. Comparing the full studio screenshot catches wrong DOM stacking.
  const expected = await page.evaluate(async ({ manifest, color }) => {
    const { loadDrawingMotionAssets, paintDrawingMotionFrame } = await import('/src/native-drawing-motion.js');
    const ui = await (await fetch('/original/ui/ui.json')).json();
    const assets = await loadDrawingMotionAssets(manifest, { resolve: path => `/original/ui/${path}` });
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
    const context = canvas.getContext('2d');
    for (const [path, rect] of [['paint-empty.png', [0, 0, 1024, 768]],
      [ui.drawingOptions['tray-draw'].images[0], [133, 637, 250, 120]]]) {
      const image = new Image(); image.src = `/original/ui/${path}`; await image.decode(); context.drawImage(image, ...rect);
    }
    const states = JSON.parse(document.querySelector('[data-native-tool-motion="draw"]').dataset.motionSnapshot);
    const rgb = color.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
    for (const item of states) paintDrawingMotionFrame(context, manifest, manifest.scripts[item.script].frames[item.frameIndex], assets, rgb,
      { clipRect: item.auxiliary ? manifest.buttons.find(button => button.name === item.name).auxiliaryClipRect : null });
    return [...context.getImageData(132, 621, 250, 143).data];
  }, { manifest: page.toolIndex.trays.draw, color: selectedColor });
  const actual = PNG.sync.read(await page.locator('#studio').screenshot());
  const mismatch = [];
  for (let y = 621; y < 764; y++) for (let x = 132; x < 382; x++) {
    const at = ((y - 621) * 250 + x - 132) * 4;
    const got = (y * 1024 + x) * 4;
    if (expected.slice(at, at + 3).some((value, channel) => value !== actual.data[got + channel]) && mismatch.length < 8) mismatch.push([x, y]);
  }
  expect(mismatch).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('drawing-studio.png') });
});

test('finite hover, leave, blur and switching trays cancel only owned motion', async ({ page }) => {
  await move(page, 230, 700);
  expect((await snapshot(page))[1].auxiliary).toBe(true);
  await page.clock.runFor(700);
  expect((await snapshot(page))[1].auxiliary).toBe(false);
  await move(page, 230, 700);
  expect((await snapshot(page))[1].auxiliary).toBe(false);
  await move(page, 500, 600); await move(page, 230, 700);
  expect((await snapshot(page))[1].auxiliary).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page))[1].auxiliary).toBe(false);
  await page.evaluate(() => { window.previousMotionSounds = [...window.motionSounds]; });
  await click(page, 'tray:paint');
  await expect(actor(page, 'draw')).toHaveCount(0);
  expect(await page.evaluate(() => window.previousMotionSounds.every(audio => audio.paused))).toBe(true);
  await click(page, 'tray:draw'); await expect(actor(page)).toBeVisible();
});

for (const tray of ['paint', 'bucket', 'mixer', 'eraser']) {
  test(`${tray}: every row activates by identity and same-owner option changes retain the canvas and source progress`, async ({ page }) => {
    await click(page, `tray:${tray}`);
    await expect(actor(page, tray)).toBeVisible();
    const manifest = page.toolIndex.trays[tray];
    await actor(page, tray).evaluate(canvas => { window.savedActor = canvas; });
    for (const evidence of [...manifest.buttons].reverse()) {
      const control = page.locator(`[data-action="tool:${evidence.name}"]`);
      if (await control.getAttribute('aria-pressed') === 'true') continue;
      await control.focus(); await page.keyboard.press('Enter');
      await expect(actor(page, tray)).toBeVisible();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      expect((await snapshot(page, tray))[evidence.index]).toMatchObject({ state: 3, script: evidence.stateScripts[3] });
      expect(await actor(page, tray).evaluate(canvas => canvas === window.savedActor)).toBe(true);
      await page.clock.runFor(112);
      const before = await snapshot(page, tray);
      for (const action of ['size:4', 'effect:1', 'page:1', 'page:-1']) {
        const option = page.locator(`[data-action="${action}"]`);
        if (!await option.count()) continue;
        await option.evaluate(control => control.click());
        await expect(actor(page, tray)).toBeVisible();
        expect(await snapshot(page, tray)).toEqual(before);
        expect(await actor(page, tray).evaluate(canvas => canvas === window.savedActor)).toBe(true);
      }
      await expect(page.locator('#tray-art')).toHaveAttribute('src', /tool-motion\/backdrops\//);
    }
    await expect(page.locator('[data-native-tool-motion]:visible')).toHaveCount(1);
  });
}

test('opaque gzip cold load uses one bundle and no individual source sprite requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (/\/(?:drawing-motion|tool-motion)\/.*(?:argb|png|gz|bin)(?:\?|$)/.test(request.url()) && !request.url().includes('/backdrops/')) requests.push(request.url());
  });
  await page.route(/\/original\/ui\/tool-motion\/[^/]+\/sprites\.bin(?:\.gz)?(?:\?|$)/, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ body: readFileSync(new URL(`../../public${path}`, import.meta.url)), contentType: 'application/octet-stream' });
  });
  await page.reload(); await expect(actor(page)).toBeVisible();
  for (const tray of ['paint', 'bucket', 'mixer', 'eraser']) {
    await click(page, `tray:${tray}`); await expect(actor(page, tray)).toBeVisible();
  }
  expect(requests).toHaveLength(5);
  expect(requests.every(path => path.includes('/sprites.bin'))).toBe(true);
});

test('failed first-use art keeps static controls usable and a later entry retries the selected row', async ({ page }) => {
  let fail = true;
  await page.route(/\/original\/ui\/(?:tool-motion|drawing-motion)\/.*\.(?:gz|bin|argb|png)(?:\?|$)/, route =>
    fail ? route.fulfill({ status: 503, body: 'temporary fixture failure' }) : route.continue());
  await page.reload();
  await expect(page.locator('#native-tool-motion')).toHaveAttribute('data-motion-error', /503/);
  await expect(actor(page)).toHaveCount(0);
  await click(page, 'tool:marker');
  await expect(button(page, 'Marker')).toHaveAttribute('aria-pressed', 'true');
  fail = false;
  await click(page, 'tray:text'); await click(page, 'tray:draw');
  await expect(actor(page)).toBeVisible();
  expect((await snapshot(page))[3].state).toBe(3);
});

test('tray changes invalidate delayed decoding without a late actor or owned cue', async ({ page }) => {
  let held = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/\/original\/ui\/tool-motion\/draw\/sprites\.bin(?:\.gz)?(?:\?|$)/, async route => {
    held++;
    await gate;
    try { await route.continue(); } catch { /* An actual owner change aborts this load. */ }
  });
  await page.reload();
  await expect.poll(() => held).toBeGreaterThan(0);
  await click(page, 'tray:text');
  release();
  await page.clock.runFor(1000);
  await expect(page.locator('[data-native-tool-motion]')).toHaveCount(0);
  expect(await page.evaluate(() => window.motionSounds.length)).toBe(0);
  await click(page, 'tray:paint'); await expect(actor(page, 'paint')).toBeVisible();
  await expect(actor(page, 'draw')).toHaveCount(0);
});
