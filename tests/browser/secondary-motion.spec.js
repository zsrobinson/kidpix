import { canonicalMotionFrame } from './canonical-motion-frame.js';
import { test, expect } from '@playwright/test';
const actor = (page, owner) => page.locator(`[data-native-${owner.includes(':') ? 'secondary' : 'tool'}-motion="${owner}"]`);
const snap = (page, owner) => actor(page, owner).evaluate(canvas => JSON.parse(canvas.dataset.motionSnapshot));
const control = (page, action) => page.locator(`[data-action="${action}"]`);
const click = (page, action) => control(page, action).evaluate(button => button.click());

test.beforeEach(async ({ page }) => {
  page.motionErrors = [];
  page.on('pageerror', error => page.motionErrors.push(error.message));
  // Install before app RAF registration; existing native callbacks cannot be clock-driven.
  await page.clock.install();
  await page.addInitScript(() => {
    window.secondarySounds = [];
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src = String(src); this.ended = !window.holdSecondaryCue || !this.src.includes(window.holdSecondaryCue); window.secondarySounds.push(this); }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    };
  });
  await page.goto('/');
  await expect(actor(page, 'draw:18400')).toBeVisible();
  await expect(actor(page, 'draw:18200')).toBeVisible();
  await expect(actor(page, 'draw')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
});

test('Drawing source rows map to nine correct choices and retain press progress through rerender', async ({ page }) => {
  const choices = ['line', 'curve', 'rectangle', 'filled-rectangle', 'ellipse', 'filled-ellipse', 'polygon', 'filled-polygon', 'freehand'];
  for (const [index, style] of choices.entries()) {
    const button = control(page, `style:${style}`);
    if (await button.getAttribute('aria-pressed') === 'true') await click(page, 'style:line');
    await button.focus();
    await page.keyboard.down('Space');
    expect((await snap(page, 'draw:18400'))[index]).toMatchObject({ state: 1, frameIndex: 0 });
    await page.clock.runFor(120);
    expect((await snap(page, 'draw:18400'))[index]).toMatchObject({ state: 1, frameIndex: 1 });
    await click(page, 'size:16');
    expect((await snap(page, 'draw:18400'))[index]).toMatchObject({ state: 1, frameIndex: 1 });
    await page.keyboard.up('Space');
    expect((await snap(page, 'draw:18400'))[index]).toMatchObject({ state: 3, frameIndex: 1 });
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
});

test('Painting mode groups and eraser shapes use source timelines with clean cancellation', async ({ page }) => {
  await click(page, 'tray:paint');
  await expect(actor(page, 'paint:18001')).toBeVisible();
  for (const [tool, table] of [['brush', 18001], ['sound', 18002], ['spray', 18003]]) {
    await click(page, `tool:${tool}`);
    await expect(actor(page, `paint:${table}`)).toBeVisible();
    await control(page, 'mode:true').focus();
    await page.keyboard.down('Space');
    await page.clock.runFor(120);
    expect((await snap(page, `paint:${table}`))[1]).toMatchObject({ state: 1, frameIndex: 1 });
    await page.keyboard.up('Space');
    expect((await snap(page, `paint:${table}`))[1]).toMatchObject({ state: 3, frameIndex: 1 });
    await click(page, 'mode:false');
  }
  await click(page, 'tray:eraser');
  await expect(actor(page, 'eraser:18203')).toBeVisible();
  await control(page, 'eraser-shape:square').focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(120);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snap(page, 'eraser:18203'))[1].state).toBe(0);
  await page.keyboard.up('Space');
  await expect(control(page, 'eraser-shape:round')).toHaveAttribute('aria-pressed', 'true');
});

// Independent ordinary source compositor. No application renderer/controller import.
async function expectSourcePixels(page, owner, view) {
  const states = await snap(page, owner);
  const scripts = states.map(state => sourceManifest.scripts[state.script]);
  const allParts = Object.values(sourceManifest.tables[owner.split(':')[1]].buttons)
    .flatMap(button => [...button.stateScripts, button.rolloverScript].filter(Boolean))
    .flatMap(id => sourceManifest.scripts[id].frames.flatMap(frame => frame.parts.map(part => ({ ...part, collection: sourceManifest.scripts[id].collection }))));
  const left = Math.min(...allParts.map(part => part.x));
  const top = Math.min(...allParts.map(part => part.y));
  const right = Math.max(...allParts.map(part => part.x + sourceManifest.sprites[`${part.collection}:${part.sprite}`].width));
  const bottom = Math.max(...allParts.map(part => part.y + sourceManifest.sprites[`${part.collection}:${part.sprite}`].height));
  const expected = new PNG({ width: 1024, height: 768 });
  const overlay = (src, x, y, clip = [left, top, right - left, bottom - top]) => {
    for (let sy = 0; sy < src.height; sy++) for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx, dy = y + sy;
      if (dx < clip[0] || dy < clip[1] || dx >= clip[0] + clip[2] || dy >= clip[1] + clip[3] || dy >= 768) continue;
      const from = (sy * src.width + sx) * 4, to = (dy * 1024 + dx) * 4;
      const alpha = src.data[from + 3] / 255;
      const out = alpha + expected.data[to + 3] / 255 * (1 - alpha);
      for (let c = 0; c < 3; c++) expected.data[to + c] = out ? Math.round((src.data[from + c] * alpha
        + expected.data[to + c] * expected.data[to + 3] / 255 * (1 - alpha)) / out) : 0;
      expected.data[to + 3] = Math.round(out * 255);
    }
  };
  overlay(png('paint-empty.png'), 0, 0);
  const backdrop = sourceManifest.backdrops[view];
  overlay(png(backdrop.pages[0].image), backdrop.rect[0], backdrop.rect[1]);
  for (let index = 0; index < states.length; index++) {
    const state = states[index], script = scripts[index];
    const button = sourceManifest.tables[owner.split(':')[1]].buttons.find(button => button.stateScripts.includes(state.script) || button.rolloverScript === state.script);
    for (const part of script.frames[state.frameIndex].parts) overlay(png(sourceManifest.sprites[`${script.collection}:${part.sprite}`].image), part.x, part.y,
      state.auxiliary ? button.auxiliaryClipRect : [0, 0, 1024, 768]);
  }
  const actual = PNG.sync.read(Buffer.from((await canonicalMotionFrame(actor(page, owner))).split(',')[1], 'base64'));
  const studio = PNG.sync.read(await page.locator('#studio').screenshot());
  expect([studio.width, studio.height]).toEqual([1024, 768]);
  let canvasBad = 0, visibleBad = 0; const firstBad = [];
  for (let y = top; y < Math.min(bottom, 768); y++) for (let x = left; x < right; x++) {
    const offset = (y * 1024 + x) * 4;
    for (let c = 0; c < 4; c++) {
      if (Math.abs(actual.data[offset + c] - expected.data[offset + c]) > 1) { canvasBad++; if(firstBad.length<8)firstBad.push([x,y,c,actual.data[offset+c],expected.data[offset+c]]); }
      if (expected.data[offset + 3] === 255 && Math.abs(studio.data[offset + c] - expected.data[offset + c]) > 1) visibleBad++;
    }
  }
  expect(canvasBad, `${owner} source canvas channels ${JSON.stringify(firstBad)}`).toBe(0);
  if (visibleBad) {
    await page.screenshot({ path: `artifacts/t3/runtime-secondary/${owner.replace(':', '-')}-actual.png` });
    await import('node:fs').then(fs => fs.writeFileSync(`artifacts/t3/runtime-secondary/${owner.replace(':', '-')}-expected.png`, PNG.sync.write(expected)));
  }
  expect(visibleBad, `${owner} visible studio channels`).toBe(0);
}

import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sourceManifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const png = path => PNG.sync.read(readFileSync(`public/original/ui/${path}`));
const hash = value => createHash('sha256').update(value).digest('hex');

test('all enabled selector programs retain independently recovered registrations, source bytes and cue ticks', () => {
  for (const [id, pin] of Object.entries(sourcePins)) {
    const script = sourceManifest.scripts[id];
    expect(script.sourceSha256).toBe(pin.sha256);
    const frames = script.frames.map(frame => ({ tick: frame.tick, parts: frame.parts.map(part => ({
      sprite: part.sprite, rawImage: part.rawImage, sourceXY: part.sourceXY, registrationXY: part.registrationXY, x: part.x, y: part.y,
    })) }));
    expect(hash(JSON.stringify(frames))).toBe(pin.framesSha256);
    expect([script.frames.length, script.tickMs, script.endCheckTick]).toEqual([pin.groups, 100, pin.endCheckTick]);
    expect(script.sounds).toEqual(pin.sounds);
  }
});

for (const [tray, tool, owner, view, action] of [
  ['draw', null, 'draw:18400', 'draw', 'style:line'],
  ['draw', null, 'draw:18200', 'draw', 'size:16'],
  ['paint', 'brush', 'paint:18001', 'paint', 'mode:true'],
  ['paint', 'brush', 'paint:18200', 'paint', 'size:16'],
  ['paint', 'sound', 'paint:18200', 'sound', 'size:16'],
  ['paint', 'sound', 'paint:18002', 'sound', 'mode:true'],
  ['paint', 'spray', 'paint:18003', 'spray', 'mode:true'],
  ['eraser', 'round', 'eraser:18203', 'eraser', 'eraser-shape:square'],
  ['eraser', 'round', 'eraser:18200', 'eraser', 'size:16'],
  ['eraser', 'square', 'eraser:18201', 'eraser', 'size:16'],
  ['mixer', 'wand', 'mixer:18200', 'mixer-wand', 'size:16'],
  ['mixer', 'mega', 'mixer:18200', 'mixer', 'size:16'],
]) test(`${owner}/${tool ?? 'default'}: source pixels in actual studio for rest, hover, tracking and selected poses`, async ({ page }) => {
  await click(page, `tray:${tray}`);
  await expect(actor(page, tray)).toBeVisible();
  if (tool === 'square') await click(page, 'eraser-shape:square');
  else if (tool) await click(page, `tool:${tool}`);
  await expect(actor(page, owner)).toBeVisible();
  const table = Number(owner.split(':')[1]);
  const actions = table === 18400 ? ['line', 'curve', 'rectangle', 'filled-rectangle', 'ellipse', 'filled-ellipse', 'polygon', 'filled-polygon', 'freehand'].map(style => `style:${style}`)
    : [18200, 18201].includes(table) ? [4, 8, 16].map(size => `size:${size}`)
      : table === 18203 ? ['eraser-shape:round', 'eraser-shape:square'] : ['mode:false', 'mode:true'];
  for (const action of actions) {
    if (await control(page, action).getAttribute('aria-pressed') === 'true') {
      await click(page, actions.find(peer => peer !== action));
      await expect(actor(page, owner)).toBeVisible();
    }
    await expectSourcePixels(page, owner, view);
    const target = control(page, action);
    await target.hover();
    await expectSourcePixels(page, owner, view);
    await page.mouse.down();
    await expectSourcePixels(page, owner, view);
    await page.clock.runFor(120);
    await expectSourcePixels(page, owner, view);
    await page.mouse.up();
    await page.mouse.move(1000, 600);
    await expect(actor(page, owner)).toBeVisible();
    await expectSourcePixels(page, owner, view);
  }
});

test('exact source bounds, capture transfer, drag out/reentry and lost capture do not activate cancelled controls', async ({ page }) => {
  const button = control(page, 'style:line');
  await button.hover();
  await page.mouse.down();
  await page.clock.runFor(120);
  await click(page, 'size:16');
  expect((await snap(page, 'draw:18400'))[0]).toMatchObject({ state: 1, frameIndex: 1 });
  const hasCapture = await page.locator('#tray-buttons').evaluate(root => {
    for (let id = 0; id < 8; id++) if (root.hasPointerCapture(id)) return true;
    return false;
  });
  expect(hasCapture).toBe(true);
  await page.mouse.move(1000, 600);
  expect((await snap(page, 'draw:18400'))[0].state).toBe(0);
  await button.hover();
  expect((await snap(page, 'draw:18400'))[0].state).toBe(1);
  await page.locator('#tray-buttons').dispatchEvent('lostpointercapture');
  expect((await snap(page, 'draw:18400'))[0].state).toBe(0);
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  const region = sourceManifest.tables[18400].buttons.find(button => button.index === 4).region;
  const rect = await button.evaluate(button => [button.style.left, button.style.top, button.style.width, button.style.height]);
  expect(rect).toEqual(region.boundsXYWH.map(value => `${value}px`));
  await button.hover(); await page.mouse.down();
  await button.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('source tracking cue plays once, gates terminal completion and stops on window deactivation', async ({ page }) => {
  await page.clock.runFor(256);
  const cue = sourceManifest.sounds[18061].src;
  await page.evaluate(cue => { window.secondarySounds = []; window.holdSecondaryCue = cue; }, cue);
  await control(page, 'style:line').focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(120);
  expect((await snap(page, 'draw:18400'))[0]).toMatchObject({ state: 1, frameIndex: 1 });
  expect(await page.evaluate(cue => window.secondarySounds.filter(audio => audio.src.includes(cue)).length, cue)).toBe(1);
  expect(await page.evaluate(cue => window.secondarySounds.filter(audio => audio.src.includes(cue)).every(audio => !audio.ended), cue)).toBe(true);
  await page.clock.runFor(120);
  expect((await snap(page, 'draw:18400'))[0]).toMatchObject({ finished: false, frameIndex: 1 });
  await page.evaluate(cue => { window.secondarySounds.filter(audio => audio.src.includes(cue)).forEach(audio => { audio.ended = true; audio.dispatchEvent(new Event('ended')); }); }, cue);
  await page.clock.runFor(120);
  expect((await snap(page, 'draw:18400'))[0]).toMatchObject({ finished: true, frameIndex: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(cue => window.secondarySounds.filter(audio => audio.src.includes(cue)).every(audio => audio.paused), cue)).toBe(true);
  await page.keyboard.up('Space');
  await expect(control(page, 'style:line')).toHaveAttribute('aria-pressed', 'false');
});

test.afterEach(async ({ page }) => { expect(page.motionErrors).toEqual([]); });

test('missing optional secondary art keeps static choices usable and reentry retries without stale actors', async ({ page }) => {
  await click(page, 'tray:text');
  await page.route('**/secondary-motion/sprites/*', route => route.abort());
  await click(page, 'tray:paint');
  await expect(page.locator('.native-secondary-motion[data-motion-error]').first()).toBeAttached();
  await expect(actor(page, 'paint')).toBeVisible();
  await click(page, 'mode:true');
  await expect(control(page, 'mode:true')).toHaveAttribute('aria-pressed', 'true');
  await click(page, 'tray:text');
  await page.unroute('**/secondary-motion/sprites/*');
  await click(page, 'tray:paint');
  await expect(actor(page, 'paint:18001')).toBeVisible();
  expect((await snap(page, 'paint:18001'))[0].state).toBe(3);
  await expect(page.locator('[data-native-secondary-motion^="draw:"]')).toHaveCount(0);
});

test('hover retries failed same-owner background loading while retaining selector state', async ({ page }) => {
  await click(page, 'tray:paint');
  const selector = actor(page, 'paint:18001');
  await expect(selector).toBeVisible();
  await expect(actor(page, 'paint:18200')).toBeVisible();
  await expect(actor(page, 'paint')).toBeVisible();
  await selector.evaluate(canvas => { canvas.dataset.retryIdentity = 'retained'; });
  const pattern = '**/backdrops/wacky*.png*';
  await page.route(pattern, route => route.abort());
  await click(page, 'mode:true');
  await expect(selector.locator('..')).toHaveAttribute('data-motion-error', /.+/);
  await expect(actor(page, 'paint:18200').locator('..')).toHaveAttribute('data-motion-error', /.+/);
  await expect(page.locator('#native-tool-motion')).toHaveAttribute('data-motion-error', /.+/);
  await expect(selector).toBeHidden();
  await page.unroute(pattern);
  await control(page, 'mode:false').hover();
  await expect(selector).toBeVisible();
  await expect(selector).toHaveAttribute('data-retry-identity', 'retained');
  expect((await snap(page, 'paint:18001'))[1].state).toBe(3);
  await expect(control(page, 'mode:true')).toHaveAttribute('aria-pressed', 'true');
  expect(page.motionErrors).toEqual([]);
});

// Pins copied from the pre-existing independent installer audit, not the new exporter.
const sourcePins = {"18140":{"sha256":"80cbe533344f14da137b69b00c6ab2d2c89d0e5c5857c219428db887fb133c04","framesSha256":"54d3e101ce8e6f20a853b60db0b0f63988920f8020f249d840be5bbe3786610c","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18141":{"sha256":"6961257b8e8af6e32c5cf5586afe705e8a1cdfcbeca4716988b62bb25c70ed0c","framesSha256":"2f193dd5242bf2643c55960a6eda0b01b3a015856c67cb3a15bb22d08085ef99","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":52,"sound":18052,"channel":1}]},
"18142":{"sha256":"58b3a76e621c9978affd136519b62e87e5303eebf8cf4b865e8ec15f915807fc","framesSha256":"a479805a4549ada8814d0f9ce4f8c54403d02e51e7aec7704fcaedcd0e711f0e","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18143":{"sha256":"968cf408508f3c9604538b49d5fca637be960ed84803c1d3427212f11e167c8c","framesSha256":"43a3ae096be311c53f5e5e1d107699890e565eaca6b40c34f4da4d285700bd2a","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18144":{"sha256":"c0e2625487b76423143b181a8fd022ac2fc38ea433f72855b83e757541f53787","framesSha256":"5f76e083c85a5926b1876783f49f43e4a2ebcb9c704aae1f083a63ed1d9f6e54","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":53,"sound":18053,"channel":1}]},
"18145":{"sha256":"1a8a0af8ad441b440e44228658ce6d2968e2356150c0ad761cc45ee402abe403","framesSha256":"8b6929a62cbe388c95354eb5864ba0ccee04069b868a8df8136e623cb6d5d17f","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18146":{"sha256":"3c0fcc35c6ad57ab732eadf23f0e0d5c7b88ce11c385f373c63bc7cdabbdad1a","framesSha256":"40d14fdebf9cd2814d56e4201f80a6fb437f4147fc667e6156a255dbe6734dbb","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18147":{"sha256":"b8ab5994258a2b6316df6961f90e32bf6838d4552a0f6b6b4e5078206b62ab4c","framesSha256":"7bcd0cb36ac99befd428a2f6f5601c88c9b5e99b4d2bb2e85789ac7e3b4b7fe2","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":54,"sound":18054,"channel":1}]},
"18148":{"sha256":"8886c58ade18cf84fbeb4b69c32ba75226dccf68576306450cc64dbaac89a435","framesSha256":"874319d1979bf9c4e3e35528a08d8466ad4046787b2de592f30562c6153bc372","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18150":{"sha256":"ca6da0f6226672ca47ec1fe5ab79d9dd226bdcc2182460648b1bdc8e90bfe8f1","framesSha256":"c32f87f4a45c76281fa9d763954ce5299e4835fe396f05e71eea3740542ad7f4","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18151":{"sha256":"0f06fca7413252b2ee1ec99590c03b43b5ece30c51ec702ea810209ed6b7eacd","framesSha256":"c2b4e7c899615229c1d0949cc0c67b5a0bd9305a6f4ee016999ccc0be4980d2a","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":55,"sound":18055,"channel":1}]},
"18152":{"sha256":"4ec7143f62c58379f4b8d00fcb497e0fb2157cda2ec3fb86cfbd30949bc9add7","framesSha256":"5ccf5201e7af8358bf530debcc6db4edbda68322fa1ef68c95e147b2d1a69b6c","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18153":{"sha256":"16e40831be8541933c787a44b06e124bf747bd3dc4bcf26a0b59e21521c8f762","framesSha256":"fff5a32f33031e8b78d3216ac0ffbb43bafd39d1192771101c695857069d17e1","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18154":{"sha256":"e089333519af0567d257879ff9c30ebba38097c55599a482c091f7f0f579b37e","framesSha256":"32d791e29477fddcff4b6ee0e0d2ade308e0cfb05882be733b18d9f3d5d749b2","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":56,"sound":18056,"channel":1}]},
"18155":{"sha256":"1b4ac50441abfbc7a5b9d456aaddeafac0a321e1471a2fb60f00d539f112212c","framesSha256":"92f62e617179d6aaf890a46245ad793ced2b5205d3cf904505893dda61b8521c","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18156":{"sha256":"c2dfa2bf4aca627a98172c87cac897f986d4cb5e63a5bb94e0e4dd938f99aca1","framesSha256":"015fcf6fee81471aa62b8224f58d8cc00c2781e1596086d3a8c69acaec135e1b","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18157":{"sha256":"950756f3e6152a5ff6cbd05f7d50066f8c6fd4bb4ce03ad05a6b7f9b68c06ee4","framesSha256":"5b8ae6a13ea5023ac1d655ea433a176a558504b53cc4e40c1bf525ddc3cb707f","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":54,"sound":18054,"channel":1}]},
"18158":{"sha256":"8f5dc5316c24e101dc9edd2d7c8b477fa02e9d224c548f76fa90fcca9b2ec090","framesSha256":"320c7efe5642adbd954c1b5b099a2a7a72b46b80794f280c0dcc4ed7224766cc","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18160":{"sha256":"20d647c559deef375b81689eefaa68494ee886e6d81dcee581b336f0a4d35824","framesSha256":"398360ccf71a4a64d90f062fe25c783a3114b31a2a0405b4eea61c64c7c25cd7","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18161":{"sha256":"7fc0a7ba502abe0407e66a32f58deabe40d5d31befa069c1ff466df2cfb176d4","framesSha256":"b744d12fbd8a1f311f6f2de5a15138bc05df289886975cc54e48ec7df87d5f81","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":57,"sound":18057,"channel":1}]},
"18162":{"sha256":"4b0c6c5e590cd0961a7e6e233495440ff0a3da72b59a06e7511b8aabf3075bd7","framesSha256":"3d859a6adc942cc19c2ef449adb6e533d3f5922542d4631f95b873d2fa3ce9ff","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18163":{"sha256":"2bd474526f0f1d0866427e9a6a11a6cb3c8764e309bd8b3169c648c1106f2cf3","framesSha256":"857a225b66a7be35699378909f58d29a233a6853b0d0fece19adbf4e712aed6b","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18164":{"sha256":"b98ad68c45247f7f54df4609c9c28af7ebfe52e37d4af283bf53ab612c6e4267","framesSha256":"0d6a69714d576bebc7358375994b052c1c737ff5fbe27299fc5e90c6135fd5e3","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":57,"sound":18057,"channel":1}]},
"18165":{"sha256":"722b660492d752a660a37b67d82db19827a328f8dcf80c331ec61e1132e3a864","framesSha256":"b14f3055c409096a5e36568054d764ce2543db0d3c5df5b3f23fd9a7c3ca72b9","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18167":{"sha256":"d2e08f91bdbf07da12224e7cf112e879c1edc31ba765155281d10955c137d068","framesSha256":"0e84c281fdd0839a4365aa8af4b453a2231664952dab68c983fb8442a443bff3","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18168":{"sha256":"af3cd6ce2e156ccd9702bf83ef5e41b0cee23dd47f44f64131bad17556ef2515","framesSha256":"2bca06efe4f273616a2b73c9d753621dcee00c9eac2aa5fcbaac1d4c2be48766","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18169":{"sha256":"6ef8b74f524c57597b2efae5376a7ee58f358a0cc4705fe10d181bd097a09b28","framesSha256":"a9df08314b138a9ec173a9133481e1b9aff2265c66168ff9a87ae4101f4fbdcb","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18170":{"sha256":"10e12c1e2fd4296555e8b09a0f4ed1b20db69da87a060e1c4407535675a5eb33","framesSha256":"035dce9af4cd1d072f1cd4dceaadb7156522de670024593cc765b6c50801e7fa","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18171":{"sha256":"b84e14bc58c733513495ac2bf69556af01a2feb00cceac8e3a9fcefe385c573d","framesSha256":"31467c8940393f1a047a4b126eb3a1308092d7cab4ccd45da438af664c1ddb5e","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18172":{"sha256":"a8449e345403c4ce79d0f0d0de926ceeb5778eba62429fb02187b5350bbbf94a","framesSha256":"f8477c67e4b3c810b98af8a19baf29517bde428b996eb2d647d9ad4172c22957","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18173":{"sha256":"fb048499818d0a32bb9dcf90036edcca6373d2def2c3ccf411d6096cfdbc279f","framesSha256":"7f4738b62958cd8d93cbf4aabfcd753f081803f92719729e8d727762e8395410","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18174":{"sha256":"7dfa99eff04ff105b261a896b24c95f05a0e4ff098446011a791957bc69c0b94","framesSha256":"bbed8097067089c7b904bc5eb2366b5f97b2fe5d068f406a7fd2df190629536c","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18175":{"sha256":"7a3809d5ac6969fa52e7c3f08958a9e2a4febc99666fb195baa61a39e7b70d27","framesSha256":"23326532ae5e78129f12c2ee5066b3bd35e8f9e27cdecb6588451f9d2ae9647e","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18176":{"sha256":"185100eb41f51c3b42ece3c48a6d3ee34b54e02192e09e5e1ba5bc63f8626dce","framesSha256":"65e89afbd23f9b9cdcf3f6d5865e15ae74cdb1ac2d507baf1e4aaafdf709d0cc","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18177":{"sha256":"1c39099689083bc5d346b480f99d1a33a175c071d4d395b1cfe2e9f9be5b34b9","framesSha256":"085aa8a54c95e05392030314c71cfe465bb669c0982d9a1c8237fbf60302de8b","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18178":{"sha256":"63bbc1469251a2c13ef79d9760f52d7c324533e6055798cce7354c7d9b5d75a7","framesSha256":"d78ad579842d3b57996a0afaaa0f7b0b4db2d29de16aa05595d487328a3fccf0","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18179":{"sha256":"15a4aa5a67ad50750d0c96556230332b05edf7b8ff5760ec0ed98e42590d5680","framesSha256":"410ba87f59231bb69c12b1a94b0bc0dea5e9f8cd4eb8fef52e9b0aa34ee8d91f","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18180":{"sha256":"d47ee09d3d6772f2806640cf375c0e82fd17c77fc44cd7033705916161a0400d","framesSha256":"ed2116c0ca3b89bc609318cc04672327b8034aec40d9911be2c02543b1875b33","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18181":{"sha256":"966fb2f08b5067e3774b9b030dcc49c07e5b824f52284731023a9fa1cc3eeac7","framesSha256":"3a98ba99239361d3e46d42c1695c33cee6bf0b64526da3748eb8cf32842ec3b2","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18182":{"sha256":"a0522a19ed527ea6f77517ecfe4d186903ecb0ac0c880a148ed57847777863b6","framesSha256":"b54eb4e512b3765d9ccfe9e5852bf08813234c2942ac03e698cf74be01669367","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18183":{"sha256":"f51c9bf6c7e92e33df6a31150f62ed7c1ef73f6bdf279b10b4f6f51578ca847d","framesSha256":"827563fa105b4f27ff8e8d5336b3ad5621ba09e86cfb60fe3d5977bc443a01e5","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":58,"sound":18058,"channel":1}]},
"18184":{"sha256":"e95e75c51bfcab6b3050ce3290d7bc1829ca735c830aeb705d940fc8aca7de4a","framesSha256":"978eeb6d9fb0fc64a83e5a93e1da71d838e757d79678f953a035dd12ec2d021a","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18198":{"sha256":"ffa719f56855ce61eda3f1078c755b149f17a57a7ff8c9d3f0e2540c2eb9c18b","framesSha256":"65b1a43417335e80e58734270728ef2406b458c0273af8665494a64af26a9705","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18199":{"sha256":"74a159b74bbe24deede85018499953e351198eee6a12dfb8654f79955cbb7c64","framesSha256":"408447cf910ab35b53546a4528b66bcb081f4dfb637f566c54c42b637bdee2b6","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18200":{"sha256":"b54cde4c9d8bf1953f1a989f41a9bdbd514731f284c450924d7810c322cd9491","framesSha256":"3bfaea0c0ac486e3eab3af7a62edda846b583121c11ada5ef8daf4466fc63828","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18201":{"sha256":"d4e65aaec2433c395a47c557426e700bef957ca9bd8c5d951841d4396b7096c3","framesSha256":"af8558759c62d99fd204215bc3e72e61721f5986bd3c1f25420fe007d97156e9","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18202":{"sha256":"f6cdb82cd9a2e19fb321de7f445c65a91a450c5a598d026ff9443cac54b54524","framesSha256":"679fb376418a0f58dea4327dfe94bb640f05869a84e5e3ef8c2430e5de75b66e","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18203":{"sha256":"aa32fa89925aa12bb9d67d8fbf9b920d4cb98ee78a79cf671f54fc8312f470e9","framesSha256":"ca5ea6f1803d862d0be548bc5ca4ceb0d228d5d6e5258dca127f50d1cd91e648","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18204":{"sha256":"51cbaa827d8834012bf8397aa0631b6365901642c7829c5eaec2f6f9ee64d0a2","framesSha256":"e82fd78e5e43cd0aba880e976afa0d82c72715d62fe4b27be20242af3cf73a90","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18205":{"sha256":"75919d04255893735e906b6b8d7fe1147c16f2e157cd73f586bb6163a2d79fb1","framesSha256":"2965c08ec251c46dd738afa788c9c3b59d3c225c2986bc3775e364023b6abfa1","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18206":{"sha256":"991d431bf4dd9d63202a7b65a6f2169dd123d31891ff38644aa5e95ad49a9c66","framesSha256":"e99c1f621c8fc7ab15fd4734eebc4d0a5ec9f841117f5295f6586f7d6b9bd249","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18207":{"sha256":"d0a3a881671f03890abd3d6f59d1155eacf86663bda2ef12e8574d732529cf57","framesSha256":"8b76e40acc4a87dd2ed2f82548b42ea3b4413fbe765485ce7c76e88ec12207f2","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18208":{"sha256":"48af563538e8c704d2706d7e6c8450ce1b44eacb9b264be320073f6413a92519","framesSha256":"f7bd0405e4fe205eecaaf027d92a25d98399d0c90542091a2e12f1a28c9fee61","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18209":{"sha256":"c16f3968abd38c1a97a3ad90ba8ea1c6bc8e13c1a2b2ba662997e29675611f32","framesSha256":"179a604c30304731759a062df620c6fc0d8ee52fe8fea70aef15eee61bcae013","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18210":{"sha256":"bf5721d3947470d69bd1ce23e8e8a3b9361b26f7de7c78ee906b071de2074129","framesSha256":"6e6354706f0398f819c200bcf1f4f33a01c213b091b1f0bafdf4de319dcf53d7","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18211":{"sha256":"67c5bcd422695a1bd044abf20aee5078fd6f45ece6f38a2633a7746946f1b8d8","framesSha256":"e199fe9dfe0e180f7dc52f728d3cb0758eb0534ce453cfff8818b8bfc41a58a0","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18212":{"sha256":"2173e382ca0f55c7ad38d71d19ffb3ddf33987c550a8d939665507ecd132fec5","framesSha256":"1b65dec041eafa9e1aa1df5390d5ab42841f37ce7ebdd6b6da12e3d1cb75d923","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18213":{"sha256":"fc05885b0124333492f608fa10e251af40cb3c28ccb78fdb26814ef7ebca819a","framesSha256":"dc2707c15790876b53a74aee9775258291e8b9233a8f75817b6f2fd3473ab250","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18214":{"sha256":"5ca96f8205d83b2d8464174cda1ad243fc58ed18f59097dc8462a4ebb4b4121c","framesSha256":"bf377abb0d45f863ca4ac961503f3f8750e0b0938c42ec95ddbc718b08be5504","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18215":{"sha256":"12b13819ddd7bbdfa30201ee5d9ed01470cc1d4d5bc8eab311d95f50ab008842","framesSha256":"3ffe036d0779cec2e2c0d5246aa5e1dc5a9079720d2ad248fe87e6494cf74553","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18216":{"sha256":"9811bf4e973e71bb623140aab93ceb73eb42c24e0d1fe6c258baf530a9483ed6","framesSha256":"1a2f551d240f8232e994dda0a3645bc0eaab35ae9a1bdade683243ac2d161b3f","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18217":{"sha256":"dd4a08e012dce0a00c65bfeea145d267523ae81558a89345364dc9f15c3211dc","framesSha256":"e9c24a03cf69aaea2d8afc2a454bfe7d416ec3a43bbcfaa3b4af871e3d6617e0","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18218":{"sha256":"f2c8129fcda6a868d9e7bb5c728aeea8fcd8bda8bffbc849f50c3f4d7fd8b5c8","framesSha256":"df36989b40d9d57da1840dae8bc21558e6dc9a075960fec0b36f3c901ae2bcb5","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18219":{"sha256":"faf4a9072a46bca33ad79b488c69c0fb3bcef008d81bace2a646c489aa6c678b","framesSha256":"f883141580e71c2bdcaba2b86b63f494eae12e17ba84fac5f7c3f50c40a91974","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18220":{"sha256":"d47837b7e8dcea4c2bf3f6a760019b647120185592fbbce56ad015e1805ab190","framesSha256":"c88cf317b9757a5be45f8467daf9b9b992ff40f99ed209bde61ddaaf79e6f54e","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18221":{"sha256":"09f13d7055f0c0d66f781af85e5f07f3838c0db246466d81cae3bffaf1a78d1c","framesSha256":"ccc6ea00760cb1144998596912d317535d2458db83801cfcaa477b936d205466","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18222":{"sha256":"cbcfd03aea94dad3af3fc6be98980918a3494f1619b50887a2c3c8118d65a9a6","framesSha256":"3e2e4b7056ff3a0fa05faa8fac5af11005a508d0c4310181893fe40ac61629e7","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},
"18223":{"sha256":"ab1500ac5ed81a98d2e80a06dac93e208e50907e8e2a4534a5989a6bfc12a4aa","framesSha256":"e0388d87162736d7b49b3a815f4a1d051352c543c31841507d0a3d498cb0864b","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":61,"sound":18061,"channel":1}]},
"18224":{"sha256":"08fdd93c7d0b2b1023ec5f5f6df8b6f2c8382a9580fbb201403b87ad6042fc18","framesSha256":"3008395d45a5a7cf0149d8b161cf49507f15dad1d43cf762f77f24c2389ef052","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]}};
