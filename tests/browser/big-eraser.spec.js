import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/big-eraser-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><canvas id="base" width="100" height="80"></canvas><canvas id="overlay" width="100" height="80"></canvas>',
  }));
  await page.goto('/big-eraser-harness');
  await page.evaluate(async () => {
    const { createNativeBigEraser } = await import('/src/native-big-eraser.js');
    const manifest = await fetch('/original/ui/big-eraser/manifest.json').then(response => response.json());
    const base = document.querySelector('#base').getContext('2d');
    const overlay = document.querySelector('#overlay').getContext('2d');
    base.fillStyle = '#ff0000'; base.fillRect(0, 0, 100, 80);
    let time = 0, counter = 0;
    const pending = new Map(), history = [], cues = [], commits = [];
    const controller = createNativeBigEraser({ manifest, context: overlay, rect: [10, 10, 60, 40],
      now: () => time, schedule: fn => { pending.set(++counter, fn); return counter; }, cancel: id => pending.delete(id),
      playSound: cue => { cues.push(cue.soundId); return { pause() {} }; },
      onBegin: () => base.getImageData(0, 0, 100, 80),
      onCommit: ({ token }) => { history.push(token); commits.push(time); base.fillStyle = '#abcdef'; base.fillRect(10, 10, 60, 40); } });
    const composite = document.createElement('canvas'); composite.width = 100; composite.height = 80;
    const context = composite.getContext('2d');
    window.bigEraserTest = { controller, history, cues, commits,
      at(ms) { time = ms; const delivered = [...pending.values()]; pending.clear(); delivered.forEach(fn => fn(time)); },
      pixel(x, y) { context.clearRect(0, 0, 100, 80); context.drawImage(base.canvas, 0, 0); context.drawImage(overlay.canvas, 0, 0);
        return [...context.getImageData(x, y, 1, 1).data]; },
      undo() { base.putImageData(history.pop(), 0, 0); },
      alpha(x, y) { return overlay.getImageData(x, y, 1, 1).data[3]; } };
  });
}

test('Big Eraser Firehose paints cumulative source curves, clips the page, and commits once after the final path', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; f.controller.play({ trigger: 'firehose' }); f.at(200);
    return { pixel: f.pixel(11, 49), commits: f.commits, cues: f.cues };
  })).toEqual({ pixel: [255, 0, 0, 255], commits: [], cues: [7433] });
  const first = await page.evaluate(() => {
    const f = window.bigEraserTest; f.at(201);
    return { bottom: f.pixel(11, 49), top: f.pixel(11, 11), outside: f.pixel(9, 49), alpha: f.alpha(11, 49) };
  });
  expect(first.bottom).toEqual([255, 77, 77, 255]);
  expect(first.alpha).toBe(77);
  expect(first.top).toEqual([255, 0, 0, 255]);
  expect(first.outside).toEqual([255, 0, 0, 255]);
  // Chromium quantizes the cumulative overlay to alpha130 after two fills.
  expect(await page.evaluate(() => { const f = window.bigEraserTest; f.at(312); return f.pixel(11, 49); })).toEqual([255, 130, 130, 255]);
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest;
    for (let index = 2; index < 10; index++) f.at(201 + index * 111);
    return f.history.length;
  })).toBe(0);
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; f.at(1311);
    return { inside: f.pixel(11, 49), outside: f.pixel(9, 49), overlayAlpha: f.alpha(11, 49), commits: f.commits };
  })).toEqual({ inside: [171, 205, 239, 255], outside: [255, 0, 0, 255], overlayAlpha: 0, commits: [1311] });
  expect(await page.evaluate(() => { const f = window.bigEraserTest; f.undo(); return f.pixel(11, 49); })).toEqual([255, 0, 0, 255]);
});

test('Big Eraser cancel restores the untouched composite and late delivery completes without alpha catch-up', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; f.controller.play({ trigger: 'firehose' }); f.at(201); f.controller.cancel('blur'); f.at(5000);
    return { pixel: f.pixel(11, 49), commits: f.commits, state: f.controller.state };
  })).toEqual({ pixel: [255, 0, 0, 255], commits: [], state: 'idle' });
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; f.controller.play({ trigger: 'firehose' }); f.at(7001);
    return { pixel: f.pixel(11, 49), commits: f.commits };
  })).toEqual({ pixel: [171, 205, 239, 255], commits: [7001] });
});

test('Big Eraser Vanish has no delayed sound; QuickTime choices do not clear under another effect name', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; const supported = f.controller.play({ bitmapId: 3701 });
    return { supported, pixel: f.pixel(11, 49), commits: f.commits };
  })).toEqual({ supported: false, pixel: [255, 0, 0, 255], commits: [] });
  expect(await page.evaluate(() => {
    const f = window.bigEraserTest; f.controller.play({ bitmapId: 3714 });
    return { pixel: f.pixel(11, 49), outside: f.pixel(70, 49), cues: f.cues, commits: f.commits };
  })).toEqual({ pixel: [171, 205, 239, 255], outside: [255, 0, 0, 255], cues: [], commits: [0] });
});
