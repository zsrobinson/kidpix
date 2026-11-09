import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

// Exercise createPaint and the real procedural/native renderers, without app
// chrome or synthetic capture pretending to prove physical Pencil behavior.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.evaluate(async () => {
    const { createPaint } = await import('/src/paint.js');
    window.renderStroke = async ({ tool = 'pencil', pointerType = 'pen', pressure = .5,
      moves = [{ x: 180, y: 100 }], upPressure = 0, upX = 180, coalesced, api = 'missing', variant = 'freehand', foreignMove = false, paper = false } = {}) => {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 250;
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:250px';
      document.body.append(canvas);
      canvas.setPointerCapture = () => {};
      canvas.releasePointerCapture = () => {};
      const paint = createPaint(canvas, { soundEffects: false, originalTools: '/original/tools/' });
      await paint.setOptions({ tool, variant, size: 14, sizeIndex: 2, color: '#263a57' });
      if (paper) await paint.setPaper(paper);
      const send = (type, x, p, entries, pointerId = 77) => {
        const event = new PointerEvent(type, { pointerId, pointerType, button: 0,
          buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 100, pressure: p });
        if (p === null) Object.defineProperty(event, 'pressure', { value: undefined });
        Object.defineProperty(event, 'getCoalescedEvents', { value: api === 'missing' ? undefined : () => entries ?? [] });
        canvas.dispatchEvent(event);
      };
      send('pointerdown', 60, pressure);
      for (const move of moves) send('pointermove', move.x, move.pressure ?? pressure,
        coalesced?.map(sample => new PointerEvent('pointermove', { clientX: sample.x, clientY: 100, pressure: sample.pressure,
          pointerType: 'pen', pointerId: 0 })));
      if (foreignMove) send('pointermove', 400, .9, undefined, 99);
      send('pointerup', upX, upPressure);
      const pixels = canvas.getContext('2d').getImageData(0, 0, 720, 250).data;
      let count = 0;
      const heights = [];
      for (let x = 0; x < 720; x++) {
        let min = 250, max = -1;
        for (let y = 0; y < 250; y++) {
          const i = (y * 720 + x) * 4;
          if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
            count++; min = Math.min(min, y); max = Math.max(max, y);
          }
        }
        heights.push(max < 0 ? 0 : max - min + 1);
      }
      const png = canvas.toDataURL();
      const canUndo = paint.canUndo;
      paint.undo(); const undone = canvas.toDataURL();
      paint.redo(); const redone = canvas.toDataURL();
      paint.destroy(); canvas.remove();
      return { png, count, heights, canUndo, undone, redone };
    };
  });
});
const render = (page, options) => page.evaluate(options => window.renderStroke(options), options);

for (const tool of ['pencil', 'chalk', 'crayon']) {
  test(`${tool}: real renderer responds to light/heavy pen; neutral and nonpen pixels stay exact`, async ({ page }) => {
    const mouse = await render(page, { tool, pointerType: 'mouse' });
    const neutral = await render(page, { tool });
    expect(neutral.png).toBe(mouse.png);
    for (const [pointerType, pressure] of [['mouse', .1], ['touch', .9], ['pen', null]]) {
      expect((await render(page, { tool, pointerType, pressure })).png).toBe(mouse.png);
    }
    const light = await render(page, { tool, pressure: .1 });
    const heavy = await render(page, { tool, pressure: .9 });
    expect(light.count).toBeGreaterThan(0);
    expect(heavy.count).toBeGreaterThan(light.count * 2);
    expect(heavy.canUndo).toBe(true);
    expect(heavy.redone).toBe(heavy.png);
    expect(heavy.undone).not.toBe(heavy.png);
    expect((await render(page, { tool, pressure: .9, upPressure: .9 })).png).toBe(heavy.png);
    expect((await render(page, { tool, api: 'empty' })).png).toBe(neutral.png);
  });
  test(`${tool}: coalesced pressure uses dispatched ownership, interpolates dabs and excludes parent`, async ({ page }) => {
    const samples = [{ x: 100, pressure: .1 }, { x: 140, pressure: .9 }];
    const options = { tool, pressure: .1, upX: 140 };
    const separate = await render(page, { ...options, moves: samples });
    const batch = await render(page, { ...options, api: 'list', moves: [{ x: 400 }], coalesced: samples });
    expect(batch.png).toBe(separate.png);
    expect(batch.heights[390]).toBe(0);
    expect(batch.heights[130]).toBeGreaterThan(batch.heights[90]);
  });
}

test('pencil release zero preserves the last pressure through the final segment', async ({ page }) => {
  const options = { pressure: .9, moves: [{ x: 130, pressure: .9 }], upX: 180 };
  const zero = await render(page, options);
  expect(zero.png).toBe((await render(page, { ...options, upPressure: .9 })).png);
  expect(zero.heights[175]).toBeGreaterThan(12);
});

test('marker and shaped pencil ignore pen pressure', async ({ page }) => {
  for (const options of [{ tool: 'marker' }, { tool: 'pencil', variant: 'line' }]) {
    expect((await render(page, { ...options, pressure: .1 })).png)
      .toBe((await render(page, { ...options, pressure: .9 })).png);
  }
});

test('foreign dispatched pointer is ignored even when its samples look valid', async ({ page }) => {
  for (const tool of ['pencil', 'chalk', 'crayon']) {
    expect((await render(page, { tool, foreignMove: true })).png)
      .toBe((await render(page, { tool })).png);
  }
});

test('native stationary pressure updates carry into the next emitted segment', async ({ page }) => {
  for (const tool of ['chalk', 'crayon']) {
    const options = { tool, pressure: .1, upX: 140 };
    const changed = await render(page, { ...options, moves: [{ x: 60, pressure: .9 }, { x: 140, pressure: .9 }] });
    const gradient = await render(page, { ...options, moves: [{ x: 140, pressure: .9 }] });
    expect(changed.heights[70]).toBeGreaterThan(gradient.heights[70]);
  }
});


test('native Crayon scales a grayscale mask per dab with exact neutral source coverage', async ({ page }) => {
  const mask = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < mask.data.length; i += 4) mask.data.set([127, 127, 127, 255], i);
  let requests = 0;
  await page.route('**/original/tools/brushes/1003.png', route => {
    requests++;
    return route.fulfill({ body: PNG.sync.write(mask), contentType: 'image/png' });
  });
  const options = { tool: 'crayon', moves: [], upX: 60 };
  const neutral = await render(page, options);
  const pixels = PNG.sync.read(Buffer.from(neutral.png.split(',')[1], 'base64'));
  expect([...pixels.data.subarray((100 * 720 + 60) * 4, (100 * 720 + 60) * 4 + 4)])
    .toEqual([146, 156, 171, 255]);
  expect(neutral.count).toBe(64);
  expect((await render(page, { ...options, pressure: .1 })).count).toBe(4);
  expect((await render(page, { ...options, pressure: .9 })).count).toBe(144);
  expect(requests).toBeGreaterThan(0);

  // A page texture is sampled through the same native mask path. Neutral pen
  // must match mouse exactly even with spatially varying paper coefficients.
  const texture = new PNG({ width: 720, height: 250 });
  for (let i = 0; i < texture.data.length; i += 4) {
    const value = (i / 4 % 720) % 2 ? 255 : 0;
    texture.data.set([value, value, value, 255], i);
  }
  const paper = `data:image/png;base64,${PNG.sync.write(texture).toString('base64')}`;
  expect((await render(page, { ...options, paper })).png)
    .toBe((await render(page, { ...options, paper, pointerType: 'mouse' })).png);
});
