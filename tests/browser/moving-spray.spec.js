import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectNativePixels, frameFromSourceTime, loadNativeBank, movingLayers } from './helpers/native-pixel-oracle.js';

test.beforeEach(async ({ page }) => {
  page.movingErrors = [];
  page.on('pageerror', error => page.movingErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.movingErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.movingErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.addInitScript(() => {
    window.movingRandom = 0;
    window.movingRandomCalls = 0;
    Math.random = () => { window.movingRandomCalls++; return window.movingRandom; };
    const BrowserAudio = window.Audio;
    window.movingSounds = [];
    // Media clocks are independent of Playwright's RAF clock. Control only
    // native moving-paint sounds so their completion gate can be tested;
    // ordinary UI sounds retain their real browser implementation.
    window.Audio = function Audio(src) {
      if (!String(src).includes('/moving-spray/native/sounds/')) return new BrowserAudio(src);
      const audio = new EventTarget();
      audio.src = String(src);
      audio.paused = true;
      audio.play = () => { audio.paused = false; audio.playedAt = performance.now(); return Promise.resolve(); };
      audio.pause = () => { audio.paused = true; };
      audio.finish = () => audio.dispatchEvent(new Event('ended'));
      window.movingSounds.push(audio);
      return audio;
    };
    window.Audio.prototype = BrowserAudio.prototype;
  });
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button', { name: 'Painting Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Spray Can', exact: true }).click();
  await page.getByRole('button', { name: 'Moving Paints', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-style', 'moving-spray');
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  page.movingBundle = await loadNativeBank(page, 'moving-spray');
  page.movingClip = page.movingBundle.clips[page.movingBundle.bank.clipIds[0]];
  expect(page.movingClip.sounds[0].atMs, 'This source clip starts its sound at emission').toBe(0);
  const audio = await page.request.get(`/original/${page.movingClip.sounds[0].src}`);
  expect(audio.ok(), 'The authored sound asset exists').toBe(true);
  await page.mouse.move(1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
  page.blankMovingInk = await ink(page);
});

test.afterEach(async ({ page }) => {
  expect(page.movingErrors, 'Browser errors and missing native moving-paint assets').toEqual([]);
});

const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
async function movePaper(page, [x, y]) {
  const bounds = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.move(bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542);
}
async function clickPaper(page, point) {
  await movePaper(page, point);
  await page.mouse.down();
  await page.mouse.up();
}
async function media(page) {
  return page.evaluate(() => ({ now: performance.now(), randomCalls: window.movingRandomCalls,
    sounds: window.movingSounds.map(sound => ({ src: sound.src, playedAt: sound.playedAt, paused: sound.paused })) }));
}
function layersAt(page, point, age) {
  return movingLayers(page.movingBundle, page.movingClip, point, frameFromSourceTime(page.movingClip, age));
}

test('Moving Paint keeps authored timing and registration after release, then sound-gated final artwork', async ({ page }) => {
  const point = [200, 300];
  await clickPaper(page, point);
  const initial = await ink(page);
  expectNativePixels(initial, layersAt(page, point, 0), page.movingBundle.images);
  const firstSound = (await media(page)).sounds[0];
  expect(new URL(firstSound.src, page.url()).pathname).toBe(`/original/${page.movingClip.sounds[0].src}`);
  await page.clock.runFor(80);
  expect(await ink(page), 'The first source hold lasts the authored 100 ms').toBe(initial);
  await page.clock.runFor(40);
  expectNativePixels(await ink(page), layersAt(page, point, 120), page.movingBundle.images);
  expect(await ink(page), 'Mouse release did not stop the authored motion').not.toBe(initial);

  await page.clock.runFor(page.movingClip.minimumCompletionMs + 150 - 120);
  const terminal = await ink(page);
  expectNativePixels(terminal, movingLayers(page.movingBundle, page.movingClip, point,
    page.movingClip.frames[page.movingClip.terminalFrame]), page.movingBundle.images);
  expect((await media(page)).sounds).toHaveLength(1);
  expect((await media(page)).sounds[0].paused, 'A pending source sound postpones flattening').toBe(false);
  await page.evaluate(() => window.movingSounds[0].finish());
  await page.clock.runFor(40);
  expect((await media(page)).sounds[0].paused, 'Completion releases the actor-owned sound').toBe(true);
  expect(await ink(page), 'Completion retains the final authored image group').toBe(terminal);
  await page.clock.runFor(1500);
  expect(await ink(page), 'The finite clip neither loops nor disappears').toBe(terminal);
  expect((await media(page)).sounds).toHaveLength(1);
});

test('held Moving Paint emits at the current pointer, including stationary holds, and skips outside the page', async ({ page }) => {
  const firstPoint = [150, 300];
  const secondPoint = [470, 300];
  await movePaper(page, firstPoint);
  await page.mouse.down();
  await page.clock.runFor(140);
  expect((await media(page)).sounds).toHaveLength(1);
  await movePaper(page, secondPoint);
  expect((await media(page)).sounds).toHaveLength(1);
  await page.clock.runFor(30);
  const atSecond = await media(page);
  expect(atSecond.sounds).toHaveLength(2);
  expectNativePixels(await ink(page), [
    ...layersAt(page, firstPoint, atSecond.now - atSecond.sounds[0].playedAt),
    ...layersAt(page, secondPoint, atSecond.now - atSecond.sounds[1].playedAt),
  ], page.movingBundle.images);

  await movePaper(page, [-20, 200]);
  await page.clock.runFor(340);
  const outside = await media(page);
  expect(outside.sounds).toHaveLength(2);
  expect(outside.randomCalls, 'Outside timer delivery does not consume a variant choice').toBe(atSecond.randomCalls);
  await movePaper(page, secondPoint);
  await page.clock.runFor(180);
  expect((await media(page)).sounds).toHaveLength(3);
  await page.clock.runFor(170);
  expect((await media(page)).sounds, 'A stationary held pointer continues emitting').toHaveLength(4);
  await page.mouse.up();
  await page.clock.runFor(500);
  expect((await media(page)).sounds, 'Release stops future emissions').toHaveLength(4);
});

test('tool cleanup freezes the current source frame and keeps one undo/redo step for the released stroke', async ({ page }) => {
  const point = [200, 300];
  await clickPaper(page, point);
  await page.clock.runFor(240);
  expectNativePixels(await ink(page), layersAt(page, point, 240), page.movingBundle.images);
  await page.getByRole('button', { name: 'Drawing Tools', exact: true }).click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'pencil');
  const frozen = await ink(page);
  expectNativePixels(frozen, layersAt(page, point, 240), page.movingBundle.images);
  expect((await media(page)).sounds.every(sound => sound.paused)).toBe(true);
  await page.clock.runFor(3000);
  expect(await ink(page), 'Cleanup freezes the current frame, not the eventual terminal frame').toBe(frozen);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(page.blankMovingInk);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(frozen);
});

test('PNG export captures live native motion and live undo/redo restores stable picture states', async ({ page }, testInfo) => {
  const point = [200, 300];
  await clickPaper(page, point);
  await page.clock.runFor(240);
  await page.getByRole('button', { name: 'Save Picture', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Export PNG', exact: true }).click();
  const png = await downloaded;
  const path = testInfo.outputPath(png.suggestedFilename());
  await png.saveAs(path);
  expectNativePixels(await readFile(path), layersAt(page, point, 240), page.movingBundle.images);
  await page.clock.runFor(200);
  const current = await ink(page);
  expectNativePixels(current, layersAt(page, point, 440), page.movingBundle.images);
  expect((await media(page)).sounds[0].paused, 'Export does not prematurely complete the native actor').toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(page.blankMovingInk);
  await page.clock.runFor(2500);
  expect(await ink(page), 'Undo leaves no pending actor that can repaint later').toBe(page.blankMovingInk);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(current);
  await page.clock.runFor(1500);
  expect(await ink(page)).toBe(current);
});

test('undo during a second held moving stroke preserves the first stroke and coherent two-step history', async ({ page }) => {
  const first = [150, 300];
  const second = [470, 300];
  await clickPaper(page, first);
  await page.clock.runFor(240);
  const beforeSecond = await ink(page);
  await movePaper(page, second);
  await page.mouse.down();
  await page.clock.runFor(120);
  const both = await ink(page);
  expectNativePixels(both, [...layersAt(page, first, 360), ...layersAt(page, second, 120)], page.movingBundle.images);
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expect.poll(() => ink(page)).toBe(beforeSecond);
  await page.clock.runFor(1000);
  expect(await ink(page), 'The preserved first stroke is frozen after undo').toBe(beforeSecond);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ink(page)).toBe(page.blankMovingInk);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(beforeSecond);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(both);
});

test('undo can cancel the very first moving stroke while the pointer is still held', async ({ page }) => {
  const point = [200, 300];
  await movePaper(page, point);
  await page.mouse.down();
  await page.clock.runFor(120);
  const current = await ink(page);
  expectNativePixels(current, layersAt(page, point, 120), page.movingBundle.images);
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expect.poll(() => ink(page)).toBe(page.blankMovingInk);
  await page.clock.runFor(1000);
  expect(await ink(page)).toBe(page.blankMovingInk);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => ink(page)).toBe(current);
});
