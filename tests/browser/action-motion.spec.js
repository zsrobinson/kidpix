import { canonicalMotionFrame } from './canonical-motion-frame.js';
import { test, expect } from '@playwright/test';
const actor = page => page.locator('[data-native-action-motion]');
const snap = page => actor(page).evaluate(c => JSON.parse(c.dataset.motionSnapshot));
const control = (page, action) => page.locator(`#tray-buttons [data-action="${action}"]`);
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(b => b.click());
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:/, socket => socket.close());
  await page.addInitScript(() => {
    window.Audio = class extends EventTarget { constructor() { super(); this.ended = true; } play() { return Promise.resolve(); } pause() {} };
  });
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();
});
async function start(page, tray) {
  await click(page, `tray:${tray}`);
  await expect(actor(page)).toBeVisible();
}
async function clock(page) { await page.clock.pauseAt(new Date(Date.now() + 60000)); }
async function textObject(page, text = 'Action text') {
  await start(page, 'text');
  await page.locator('#paper-canvas').click({ position: { x: 150, y: 140 } });
  await page.locator('.object-text').fill(text);
}

test('native Grab keeps path actions in the menu without floating over the studio', async ({ page }) => {
  await textObject(page, 'Path target');
  await start(page, 'grab');
  await expect(page.locator('#tray-buttons .path-controls')).toHaveCount(0);
  await page.locator('#menu-trigger').click();
  await page.locator('#menu-items summary').filter({ hasText: 'Paint Zone' }).click();
  for (const action of ['path', 'loop-path', 'preview-object']) {
    await expect(page.locator(`#menu-items [data-action="${action}"]`)).toBeVisible();
  }
  await page.locator('#menu-items [data-action="path"]').click();
  const bounds = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.move(bounds.x + 150, bounds.y + 140); await page.mouse.down();
  await page.mouse.move(bounds.x + 280, bounds.y + 210, { steps: 5 }); await page.mouse.up();
  await page.locator('#menu-trigger').click();
  await page.locator('#menu-items summary').filter({ hasText: 'Paint Zone' }).click();
  await page.locator('#menu-items [data-action="loop-path"]').click();
  await expect(page.locator('#status')).toContainText('Loop Path on');
  await page.locator('#menu-trigger').click();
  await page.locator('#menu-items summary').filter({ hasText: 'Paint Zone' }).click();
  await page.locator('#menu-items [data-action="preview-object"]').click();
  await expect(page.locator('#status')).toContainText('Select an animation or movie first.');
});

test('Grab animation restoration leaves unbound object-navigation artwork visible', async ({ page }) => {
  await textObject(page); await start(page, 'grab'); await clock(page);
  const canvas = PNG.sync.read(Buffer.from((await canonicalMotionFrame(actor(page))).split(',')[1], 'base64'));
  let covered = 0;
  for (let y = 648; y < 731; y++) for (let x = 491; x < 531; x++) covered += canvas.data[(y * 1024 + x) * 4 + 3] !== 0;
  expect(covered, 'unbound navigation column must remain transparent').toBe(0);
  const image = PNG.sync.read(await page.locator('#studio').screenshot());
  for (const row of [5, 10]) {
    const button = sourceManifest.tables[926].buttons.find(button => button.index === row);
    const script = sourceManifest.scripts[button.stateScripts[0]];
    let opaque = 0;
    for (const part of script.frames[0].parts) {
      const source = png(sourceManifest.sprites[`${script.collection}:${part.sprite}`].image);
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        const from = (y * source.width + x) * 4;
        if (source.data[from + 3] !== 255) continue;
        const to = ((part.y + y) * 1024 + part.x + x) * 4;
        for (let channel = 0; channel < 3; channel++) expect(Math.abs(image.data[to + channel] - source.data[from + channel])).toBeLessThanOrEqual(1);
        opaque++;
      }
    }
    expect(opaque).toBeGreaterThan(100);
  }
});

test('held Cut cancels a target change before the next animation frame', async ({ page }) => {
  await textObject(page, 'First');
  await page.locator('#paper-canvas').click({ position: { x: 420, y: 320 } });
  await page.locator('.object-text').last().fill('Second');
  await start(page, 'grab'); await clock(page); await page.clock.runFor(32);
  const cut = control(page, 'edit:cut');
  await cut.evaluate(button => button.addEventListener('pointerdown', event => {
    window.heldActionPointer = event.pointerId;
  }, { once: true }));
  await cut.hover(); await page.mouse.down();
  const remaining = await page.evaluate(() => {
    const first = document.querySelector('.scene-object');
    const box = first.getBoundingClientRect();
    first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1,
      pointerId: window.heldActionPointer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
    const button = document.querySelector('#tray-buttons [data-action="edit:cut"]');
    const bounds = button.getBoundingClientRect();
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0,
      pointerId: window.heldActionPointer, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 }));
    return [...document.querySelectorAll('.object-text')].map(node => node.textContent);
  });
  await page.mouse.up();
  expect(remaining).toEqual(['First', 'Second']);
  expect((await snap(page)).find(item => item.name === 'edit:paste').disabled).toBe(true);
});

test('formatting preserves a backward text selection and its active end', async ({ page }) => {
  await textObject(page, 'Second');
  await page.locator('.object-text').evaluate(editor => {
    editor.focus();
    getSelection().setBaseAndExtent(editor.firstChild, 5, editor.firstChild, 1);
  });
  const selection = () => page.evaluate(() => ({ anchor: getSelection().anchorOffset,
    focus: getSelection().focusOffset, text: getSelection().toString() }));
  await control(page, 'bold').click();
  expect(await selection()).toEqual({ anchor: 5, focus: 1, text: 'econ' });
  await page.keyboard.press('Shift+ArrowRight');
  expect(await selection()).toEqual({ anchor: 5, focus: 2, text: 'con' });
});
// Independent ordinary source compositor. No application renderer/controller import.
async function expectSourcePixels(page, owner, view) {
  const states = (await snap(page, owner)).filter(state => state.name !== 'speak');
  const scripts = states.map(state => sourceManifest.scripts[state.script]);
  const allParts = Object.values(sourceManifest.tables[view === 'text' ? 9383 : 926].buttons.filter(b => (view === 'text' ? [2,3,4,5,6,7,8,9,10,11] : [2,3,4,6,7,8,9]).includes(b.index)))
    .flatMap(button => [...button.stateScripts, button.rolloverScript].filter(Boolean))
    .flatMap(id => sourceManifest.scripts[id].frames.flatMap(frame => frame.parts.map(part => ({ ...part, collection: sourceManifest.scripts[id].collection }))));
  const left = Math.min(...allParts.map(part => part.x));
  const top = Math.min(...allParts.map(part => part.y));
  const right = Math.max(...allParts.map(part => part.x + sourceManifest.sprites[`${part.collection}:${part.sprite}`].width));
  const bottom = Math.max(...allParts.map(part => part.y + sourceManifest.sprites[`${part.collection}:${part.sprite}`].height));
  let expected = new PNG({ width: 1024, height: 768 });
  const layers = [];
  const overlay = (src, x, y, clip = [left, top, right - left, bottom - top]) => {
    layers.push({png: PNG.sync.write(src).toString('base64'), x, y, clip});
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
    const button = sourceManifest.tables[view === 'text' ? 9383 : 926].buttons.filter(b => (view === 'text' ? [2,3,4,5,6,7,8,9,10,11] : [2,3,4,6,7,8,9]).includes(b.index)).find(button => button.stateScripts.includes(state.script) || button.rolloverScript === state.script);
    for (const part of script.frames[state.frameIndex].parts) overlay(png(sourceManifest.sprites[`${script.collection}:${part.sprite}`].image), part.x, part.y,
      state.auxiliary ? button.auxiliaryClipRect : [0, 0, 1024, 768]);
  }
  // WebKit rounds premultiplied Canvas source-over differently from Chromium.
  // Keep Chromium's independent integer oracle; compose the same pinned source
  // PNGs with WebKit's own Canvas rules for its pixel/placement comparison.
  // No app renderer, timeline or asset loader is used by either oracle.
  if (test.info().project.use.browserName === 'webkit') {
    const reference = await page.evaluate(async layers => {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
      const context = canvas.getContext('2d');
      for (const layer of layers) {
        const image = new Image(); image.src = `data:image/png;base64,${layer.png}`; await image.decode();
        context.save(); context.beginPath(); context.rect(...layer.clip); context.clip();
        context.drawImage(image, layer.x, layer.y); context.restore();
      }
      return canvas.toDataURL();
    }, layers);
    expected = PNG.sync.read(Buffer.from(reference.split(',')[1], 'base64'));
  }
  const actual = PNG.sync.read(Buffer.from((await canonicalMotionFrame(actor(page, owner))).split(',')[1], 'base64'));
  const studio = PNG.sync.read(await page.locator('#studio').screenshot());
  expect([studio.width, studio.height]).toEqual([1024, 768]);
  let canvasBad = 0, visibleBad = 0; const firstBad = [];
  for (let y = top; y < Math.min(bottom, 768); y++) for (let x = left; x < right; x++) {
    const offset = (y * 1024 + x) * 4;
    // Independent source footprints, excluding the unbound navigation column.
    const owned = (view === 'text' ? [[257,643,43,62],[334,643,43,62],[160,714,194,33]] : [[409,647,82,86],[542,651,324,82]])
      .some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
    if (!owned) expected.data.fill(0, offset, offset + 4);
    for (let c = 0; c < 4; c++) {
      if (Math.abs(actual.data[offset + c] - expected.data[offset + c]) > 1) { canvasBad++; if(firstBad.length<8)firstBad.push([x,y,c,actual.data[offset+c],expected.data[offset+c]]); }
      if (expected.data[offset + 3] === 255 && Math.abs(studio.data[offset + c] - expected.data[offset + c]) > 1) visibleBad++;
    }
  }
  expect(canvasBad, `${owner} source canvas channels ${JSON.stringify(firstBad)}`).toBe(0);
  if (visibleBad) {
    await page.screenshot({ path: test.info().outputPath(`${owner.replace(':', '-')}-actual.png`) });
    await import('node:fs').then(fs => fs.writeFileSync(test.info().outputPath(`${owner.replace(':', '-')}-expected.png`), PNG.sync.write(expected)));
  }
  expect(visibleBad, `${owner} visible studio channels`).toBe(0);
}

import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sourceManifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const png = path => PNG.sync.read(readFileSync(`public/original/ui/${path}`));
const hash = value => createHash('sha256').update(value).digest('hex');


for (const tray of ['text', 'grab']) test(`${tray}: every source rest, hover, tracking and active pose in studio`, async ({ page }) => {
  await textObject(page);
  if (tray === 'grab') await start(page, 'grab');
  await clock(page);
  const actions = tray === 'text' ? ['align:left','align:right','align:center','bold','italic','underline']
    : ['edit:cut','edit:copy','edit:paste','edit:front','edit:back','edit:forward','edit:backward'];
  if (tray === 'grab') await click(page, 'edit:copy');
  for (const action of actions) {
    if (tray === 'text' && action.startsWith('align:')) await click(page, action === 'align:left' ? 'align:right' : 'align:left');
    if (tray === 'grab' && action === 'edit:copy') await page.locator('.object-text').first().click();
    if (tray === 'grab' && action === 'edit:cut') { await click(page,'edit:paste'); }
    await expectSourcePixels(page, '', tray);
    await page.clock.runFor(120);
    await expectSourcePixels(page, '', tray);
    await control(page, action).hover();
    await expectSourcePixels(page, '', tray);
    await page.mouse.down();
    expect((await snap(page)).find(s=>s.name===action).state).toBe(1);
    await expectSourcePixels(page, '', tray);
    await page.clock.runFor(120);
    await expectSourcePixels(page, '', tray);
    await page.mouse.up();
    await expectSourcePixels(page, '', tray);
    await page.clock.runFor(120);
    await expectSourcePixels(page, '', tray);
    await page.mouse.move(900, 600);
    if (['bold','italic','underline'].includes(action)) {
      await control(page, action).hover(); await page.mouse.down();
      await expectSourcePixels(page, '', tray); await page.clock.runFor(120);
      await expectSourcePixels(page, '', tray); await page.mouse.up();
      await expectSourcePixels(page, '', tray); await page.clock.runFor(120);
      await expectSourcePixels(page, '', tray);
    }
  }
});
test('independent toggles, accepted clicks and keyboard cancellation retain editable text', async ({ page }) => {
  await textObject(page); await clock(page);
  for (const action of ['bold','italic','underline']) await click(page, action);
  expect((await snap(page)).filter(s=>['bold','italic','underline'].includes(s.name)).map(s => s.state)).toEqual([2,2,2]);
  await click(page, 'italic');
  expect((await snap(page)).filter(s=>['bold','italic','underline'].includes(s.name)).map(s => s.state)).toEqual([2,0,2]);
  await control(page,'italic').focus(); await page.keyboard.down('Space');
  await page.clock.runFor(120); await click(page,'align:center');
  expect((await snap(page)).find(s=>s.name==='italic')).toMatchObject({state:1,frameIndex:1});
  await page.keyboard.up('Space');
  expect((await snap(page)).find(s=>s.name==='italic').state).toBe(2);
  await control(page,'bold').focus(); await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space'); expect((await snap(page)).find(s=>s.name==='bold').state).toBe(2);
  await control(page,'bold').press('Enter'); expect((await snap(page)).find(s=>s.name==='bold').state).toBe(0);
  await expect(page.locator('.object-text')).toHaveText('Action text');
});

test('Grab capabilities follow actual clipboard and target; ordering and cut/paste use existing scene routes', async ({ page }) => {
  for (const [i, word] of ['One','Two','Three'].entries()) {
    await start(page,'text');
    await page.locator('#paper-canvas').click({position:{x:70+i*240,y:80+i*170}});
    await page.locator('.object-text').last().fill(word);
  }
  await start(page,'grab'); await clock(page); await page.clock.runFor(32);
  expect((await snap(page))[2].state).toBe(0);
  const order = () => page.locator('.object-text').allTextContents();
  await click(page,'edit:copy'); await page.clock.runFor(32);
  await click(page,'edit:paste'); expect(await order()).toEqual(['One','Two','Three','Three']);
  await page.locator('.object-text').filter({hasText:'One'}).click();
  await click(page,'edit:front'); expect(await order()).toEqual(['Two','Three','Three','One']);
  await click(page,'edit:backward'); expect(await order()).toEqual(['Two','Three','One','Three']);
  await click(page,'edit:back'); expect(await order()).toEqual(['One','Two','Three','Three']);
  await click(page,'edit:forward'); expect(await order()).toEqual(['Two','One','Three','Three']);
  await control(page,'edit:cut').focus(); await page.keyboard.down('Space');
  await page.locator('.object-text').filter({hasText:'Two'}).click();
  await page.keyboard.up('Space'); expect(await order()).toHaveLength(4);
  await click(page,'edit:cut'); expect(await order()).toEqual(['One','Three','Three']);
  await page.clock.runFor(32);
  expect((await snap(page)).filter(s => s.name !== 'edit:paste').every(s => s.state === 0)).toBe(true);
  await click(page,'edit:paste'); expect(await order()).toEqual(['One','Three','Three','Two']);
  await click(page,'tool:scissors'); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).map(s=>s.name)).toEqual(['edit:cut','edit:copy','edit:paste']);
  const before = await order(); await click(page,'edit:paste'); expect(await order()).toEqual(before);
});

test('pointer drag out, reentry, cancellation and rejected synthetic identity never activate a different actor', async ({ page }) => {
  await textObject(page); await clock(page);
  await control(page,'bold').hover(); await page.mouse.down();
  await page.mouse.move(900,600); await page.mouse.up();
  expect((await snap(page)).find(s=>s.name==='bold').state).toBe(0);
  await control(page,'bold').hover(); await page.mouse.down();
  await click(page,'italic'); expect((await snap(page)).find(s=>s.name==='italic').state).toBe(0);
  await page.mouse.move(900,600); await control(page,'bold').hover();
  await page.mouse.up(); expect((await snap(page)).find(s=>s.name==='bold').state).toBe(2);
  await control(page,'italic').hover(); await page.mouse.down();
  await control(page,'italic').dispatchEvent('pointercancel',{pointerId:1});
  await page.mouse.up(); expect((await snap(page)).find(s=>s.name==='italic').state).toBe(0);
  await control(page,'italic').focus(); await page.keyboard.down('Space');
  await page.locator('#font-size').evaluate(e=>{e.value='42';e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.clock.runFor(120); expect((await snap(page)).find(s=>s.name==='italic')).toMatchObject({state:1,frameIndex:1});
  await page.keyboard.up('Space'); expect((await snap(page)).find(s=>s.name==='italic').state).toBe(2);
});

test('failed action manifest keeps static controls usable and retries authoritative toggles', async ({ page }) => {
  await page.route('**/secondary-motion/manifest.json*',route=>route.abort());
  await click(page,'tray:text');
  await expect(page.locator('[data-motion-error]')).toHaveCount(1);
  await click(page,'bold'); await expect(control(page,'bold')).toHaveAttribute('aria-pressed','true');
  await page.unroute('**/secondary-motion/manifest.json*');
  await click(page,'italic'); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).filter(s=>['bold','italic','underline'].includes(s.name)).map(s=>s.state)).toEqual([2,2,0]);
});

const sourcePins = {"18110":{"sha256":"ef9ab23d853cfecd72f5adf88e2856702b7d824bb69abda12dd214b13c3ec5ae","framesSha256":"49d00e79a952f103b85d6b7cb4e52eed6723839d4913d6b050d939fd31c2f899","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":37,"sound":18037,"channel":1}]},"18111":{"sha256":"2545809a1a27813db12b9ae635b993b8bc791b996569bd0e76ade692626af7e9","framesSha256":"11af9765c38a9b8c7a239ca2bc93f8775f2ac5b0cd94c524f9185fc5694348db","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":38,"sound":18038,"channel":1}]},"18112":{"sha256":"c14045b5cb6aab2e2a418a9946279fac323e36f2ad50007c894e479df6abcdd1","framesSha256":"5341e0ef5f7eb8da8f2a5d95983d70bb8e3ab536b2eab1f3bf64744d03ca5b61","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18113":{"sha256":"565f72602be64b17fe30368e82d4e30648781955b2dfbb1e9bab3d5fb90444a2","framesSha256":"4e669f29c89160e585156677357f85f005b7fcabc4a46c8219f3eee6cfe014c4","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":37,"sound":18037,"channel":1}]},"18114":{"sha256":"9ebf0ebf7001b4e47b49c12f49f46f1e571b66253fc0e040abc3781d1af3019e","framesSha256":"d7ebf6f656acb206cc47b479d58900d8771d011d8d749a26cec353736ff8f958","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":38,"sound":18038,"channel":1}]},"18115":{"sha256":"bae150ff570c11117f15151a9e7073aa5dc7ce8302350ee5358a3eb2f572367f","framesSha256":"97b406b633e26e6baeba365754f414e5b1682de568021b689aefd9714d863cfe","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18116":{"sha256":"ed5e64209efcbe89e7be04ad8c4c934eea9136f8bcbefc6457104d0445ebcd38","framesSha256":"a664b61cd49e1f72cc103e5def91d6398367d0b37281458fadfcf5c824ecbce8","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":37,"sound":18037,"channel":1}]},"18117":{"sha256":"66b1860d75c9da107cefc214615bbe5eff7616b8cc7e6bbf36082ca94a646cb7","framesSha256":"9cfb414d9d5e1c9efbb26076f7ef918d630ab9b5bbacbe5451bca618c85be014","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":38,"sound":18038,"channel":1}]},"18118":{"sha256":"49c68f79e72db40ccefbf2470f36bbb40f3c8974c99f1da7fac319d590ca809c","framesSha256":"1c0aab2035e1d6938573101dbb3d6bf4121059aa16f1426c3e46bbf54d81335b","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18119":{"sha256":"c1649e4c44b3802f2816593035ad20ccd1c7f9928094b022337cbeb9dcd5d865","framesSha256":"048be19dc16b71c2d1615822b63ec0d78cb2bc66cf8b3cce4e4fd06603b28505","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18120":{"sha256":"a124eee53bedaa888e368c5c7053a207990d59ae989afe7d56f98119b1e19715","framesSha256":"53aab57d1cfc11d3a85bfac317dd59ded0b7204e959f9d6a55cdff2ddf278927","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":39,"sound":18039,"channel":1}]},"18121":{"sha256":"750c6bcd3b06dd01deaff1bc271c121e85193457831accf171b054a841536035","framesSha256":"35f506f078f41f3a6449b7a36e77579ef4e0f76902715715de673ef02a67e598","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18122":{"sha256":"70c97bdb75862238d3a596c3a04a7a71be9342faa15ff3984c133ea3d3af4098","framesSha256":"403d12056e878e49c9c93b2a3ffa2bb82880cc2cfc93ada2543f8066f27ca79a","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18123":{"sha256":"8d6e5737ac94d8d666690d4fcadb0866e09b4ff3fc43f3daec65df51c92355f3","framesSha256":"543243681b124e4b49c8d070f6c89a62c877bd4447e57ed4e5bdfb6f6725cdb3","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":39,"sound":18039,"channel":1}]},"18124":{"sha256":"30c68942bf12d904a637776255a1613490bb73f636185351f076be3692febd68","framesSha256":"8dca7330897d7c54cd1ecb2e9f52500b8905d4d71e4a0f8af6f6ff8251991c7e","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18125":{"sha256":"354d01adba20caba31578d9238811105fabfc41b16505b1244d6ce322e9fea86","framesSha256":"eb387dfdd52f9a9c859765a46b85bdddb35d4f8ab6751dab7147b394abaf38a0","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18126":{"sha256":"3f093d1f6b7096d4e623f52e43dd4542c2544384580408cfd6d22fe69121cf26","framesSha256":"9d6f23e7688213c47bd1936df97c9acc839867839ae700904e42f6e9154a6d62","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":39,"sound":18039,"channel":1}]},"18127":{"sha256":"b41c9ddcf4919b64856b5a87577f9e9d2454c667497b336080a9524c1483fce9","framesSha256":"b9f04dfac1c47ab0101d8b9c226255fa4dbc9098d36316d37a81b3fa769f882f","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18185":{"sha256":"fa4ac4b259a6c0fae68f451b4740e49c2cc97297b83f15e06575488b8685271f","framesSha256":"3d911a89e7c420c3f0a8ed7db74ab1f56cbe2aa461beaf8b48d4acfca1b13d9a","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18186":{"sha256":"f6cb5fb6b9bc111aefdae75fc6c6b328568e20aa5309a5340e4671fbb4688226","framesSha256":"079464bf4deb766dcb96c488a6bbfad6e817664c9f0cc1b1267e91a8c904f86b","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":59,"sound":18059,"channel":1}]},"18187":{"sha256":"271d98a197a3e45fbd4fc38d474d2d70ffc52951f73988806f14dd9ff4940256","framesSha256":"0d5fd44fe317b4ddacac0a8d7dc1567d3c8f1b592993da6fcf969e74b9b139d5","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18188":{"sha256":"54fa512c39372a96fd98896f33d96f692d2e0ebe182907314d0329ba5aaeb178","framesSha256":"6a8b7924fbd8851537b84f1692deb4e4f1ed34a2027dfa11d964fdeb99ea1f17","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18189":{"sha256":"27412f5039e87bf49f30607f2faf97ca3bac6191cbde507d9305bed92690426c","framesSha256":"5b40b652b0f90330c13fa26be06318ea0e6eb20a4d78dfdb0219767114a56193","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":60,"sound":18060,"channel":1}]},"18190":{"sha256":"638e00b910769c37b2d8a12d8aa2d0b0935f0202ed5904f5c3588c5ab1cf40aa","framesSha256":"579420a401cbeba8594b258546e4c9affab85a336e1250279ca17a1e9926ec1a","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18194":{"sha256":"c22a00f1d26375582e4145a417da044830acc4d473cfddfab16c39202d6139a9","framesSha256":"2d659b2f1f482e83c54a7f36e43ebd0e9a295be093c5374947fc56ac23bcb588","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18195":{"sha256":"cb2fd492470d7391d61d2c315609ff630e1bbb6a0f7db3370ab1358e28d325c3","framesSha256":"33125e55834f7a8261a7cdd8fad1395e5efb6b066501a3f7f6979736dbfa7629","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":71,"sound":18071,"channel":1}]},"18196":{"sha256":"2fb12d75156bdb9b76866f095e9b4d4c70f2f427854890cfa3e1bdee86100248","framesSha256":"bbe047330c5ae00bb0af60f35a9e9b8ccff3c64e6eba84a64f15315f578f41e6","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18361":{"sha256":"e16ffe874a471cd363af4182af86e1899050d5dcad39fdf42c161ae5874e3cf6","framesSha256":"2efa438f67df125efd747b17561fab1ae995c7714de294330c3682243048da43","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18362":{"sha256":"1fcf874c3bfd4c5115d3c2ff49a8dc805b5dffdfea579e3f0a78e7c02822ae68","framesSha256":"653f9fbe7e72bc6661bd85c5b69f3dc80b3a9c54053e335e1e898b3c9926d3c7","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":72,"sound":18072,"channel":1}]},"18363":{"sha256":"d7e8a136680c488e9681a5259549d77491f8372e6c5fe66076eb1625ab0e0d43","framesSha256":"d67a65001dc504a00717ce1e5932666d716d8f6c94d89c422a94a941c559e21b","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18364":{"sha256":"81d5cca5ab3ec67de55bdb578e17d69fbaa70442e537ef2f82ee7d7d56466ff6","framesSha256":"4f03415beff2e6898a1564ee1b5c50a2ad5f9e8fbf0694e9f8dd91e093a494ad","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18365":{"sha256":"f891d9cf83c56817cad974f746008e4eb45bcaeccdeac1be508f96252fc773c2","framesSha256":"519b89c26b986d70e7b0dbeb93d447167e81d72afbcff5cf4a5705902b4aa442","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":72,"sound":18072,"channel":1}]},"18366":{"sha256":"41e9d57f8c778145e3e9712c6fd7ae05592b3cd234abe7daa0b3fb4c354abfe1","framesSha256":"833bb4066a80bfea0ff9efbada42d637776cb9b6cfa52bb15deef090e8375184","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18367":{"sha256":"547ef08eee39bee29ce263d63408943a0d36f153ba8038f1a34840ffeb62cf66","framesSha256":"0d60a8db36229481d3bbc14ad34a6f7a77111591cc3e3f25fe630d000e38750c","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18368":{"sha256":"0dae6e4875590d31da62ad0cbc6ac056a27bd05a879ad904db4e89e113f2287b","framesSha256":"02a5d533cf8399a2ad8e4b7f4a26b53d70b33c02266ac397907e66365b55e957","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":72,"sound":18072,"channel":1}]},"18369":{"sha256":"42563ba382538f35c20298deabd301d37e049557aa8b2484b30d84a310900938","framesSha256":"6995e207da47f604cc04cb3afba4ced645336bdaf77464b4ca245c946a1c0b7b","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18370":{"sha256":"e77a410664558616b82ef328f95551731b80f4c96de402ca5b309849afd092e9","framesSha256":"1b9f2b281ac4978d50ba0ebc2ba019e359fd5c51d66a73d73308a1af183a3d51","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]},"18371":{"sha256":"84ff54308fa6c73c1fff9916388469750ffb5cbe81ad557bc53cfe9a14de390e","framesSha256":"1a69042465b21c85205a57f746512436988927b9f748204a96eed3ad47c29aff","groups":2,"tickMs":[100],"endCheckTick":2,"sounds":[{"tick":1,"cue":72,"sound":18072,"channel":1}]},"18372":{"sha256":"65837b7d9ac5524b1b62224cd942d88154706bc8c0424dd49301882b74749932","framesSha256":"3acc986205f4bc31989fb7442e7ee8c655d668224607ca0feaebc3eeb8babcf6","groups":1,"tickMs":[100],"endCheckTick":1,"sounds":[]}};
test('all action program bytes, registrations, authored deadlines and cues match independent source pins', () => {
  for (const [id,pin] of Object.entries(sourcePins)) {
    const script=sourceManifest.scripts[id];
    expect(script.sourceSha256).toBe(pin.sha256);
    const frames=script.frames.map(frame=>({tick:frame.tick,parts:frame.parts.map(part=>({
      sprite:part.sprite,rawImage:part.rawImage,sourceXY:part.sourceXY,registrationXY:part.registrationXY,x:part.x,y:part.y,
    }))}));
    expect(hash(JSON.stringify(frames))).toBe(pin.framesSha256);
    expect([script.frames.length,script.endCheckTick]).toEqual([pin.groups,pin.endCheckTick]);
    expect(script.sounds).toEqual(pin.sounds);
  }
});

test('Text pointer formatting keeps editable focus and range; object changes restore independent flags', async ({ page }) => {
  await textObject(page);
  await page.locator('.object-text').evaluate(e=>{
    e.focus();const r=document.createRange();r.setStart(e.firstChild,1);r.setEnd(e.firstChild,6);
    const s=getSelection();s.removeAllRanges();s.addRange(r);
  });
  await control(page,'bold').click();
  expect(await page.evaluate(()=>({text:getSelection().toString(),focus:document.activeElement.className}))).toEqual({text:'ction',focus:'object-text'});
  await page.locator('#paper-canvas').click({position:{x:450,y:350}});
  await page.locator('.object-text').last().fill('Second');
  await click(page,'italic');
  await page.locator('.object-text').first().focus();
  await expect(control(page,'italic')).toHaveAttribute('aria-pressed','false');
  expect((await snap(page)).filter(s=>['bold','italic','underline'].includes(s.name)).map(s=>s.state)).toEqual([2,0,0]);
});

test('empty scene and raster selections reject unavailable actions; Scissors clipboard is independent', async ({ page }) => {
  await start(page,'grab'); await clock(page); await page.clock.runFor(32);
  expect((await snap(page)).every(s=>s.disabled)).toBe(true);
  for (const action of ['edit:cut','edit:copy','edit:paste','edit:front']) await click(page,action);
  await click(page,'tool:scissors'); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).every(s=>s.disabled)).toBe(true);
  await page.mouse.move(220,180); await page.mouse.down(); await page.mouse.move(320,280); await page.mouse.up();
  await page.clock.runFor(32);
  expect((await snap(page)).map(s=>s.disabled)).toEqual([false,false,true]);
  await click(page,'edit:copy'); await page.clock.runFor(32);
  expect((await snap(page)).map(s=>s.disabled)).toEqual([false,false,false]);
  await click(page,'edit:cut'); await page.clock.runFor(32);
  expect((await snap(page)).map(s=>s.disabled)).toEqual([true,true,false]);
  await click(page,'edit:paste');
  await click(page,'tool:grab'); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).every(s=>s.disabled)).toBe(true);
});

test('held Enter repeat activates once and selected alignment rejects toggle-off', async ({ page }) => {
  await textObject(page); await clock(page);
  await control(page,'bold').focus();
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.down('Enter');
  await page.keyboard.up('Enter'); expect((await snap(page)).find(s=>s.name==='bold').state).toBe(2);
  await click(page,'align:center'); await click(page,'align:center');
  expect((await snap(page)).filter(s=>s.name.startsWith('align:')).map(s=>s.state)).toEqual([0,0,3]);
});

for (const extension of ['png','argb']) test(`${extension} first-use failure leaves static actions usable and retries cleanly`, async ({ page }) => {
  const route=`**/secondary-motion/sprites/18000-457.${extension}*`;
  await page.route(route,r=>r.abort()); await click(page,'tray:text');
  await expect(page.locator('[data-motion-error]')).toHaveCount(1);
  await click(page,'bold'); await expect(control(page,'bold')).toHaveAttribute('aria-pressed','true');
  await page.unroute(route); await click(page,'italic'); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).filter(s=>['bold','italic','underline'].includes(s.name)).map(s=>s.state)).toEqual([2,2,0]);
});

test('departed view invalidates delayed action decoding', async ({ page }) => {
  let finish;
  const gate=new Promise(r=>finish=r);
  await page.route('**/secondary-motion/sprites/18000-457.png*',async route=>{await gate;await route.continue().catch(()=>{});});
  await click(page,'tray:text'); await expect(control(page,'bold')).toBeVisible();
  await click(page,'bold'); await click(page,'tray:grab');
  finish(); await expect(actor(page)).toBeVisible();
  expect((await snap(page)).every(s=>s.name.startsWith('edit:'))).toBe(true);
  await start(page,'text'); expect((await snap(page)).find(s=>s.name==='bold').state).toBe(2);
});

test('unavailable audio completes, and cancellation stops owned tracking audio without later cues', async ({ page }) => {
  await textObject(page); await clock(page);
  await page.evaluate(()=>{
    window.actionAudio=[];
    window.Audio=class extends EventTarget {
      constructor(src){super();this.src=src;this.ended=false;window.actionAudio.push(this);}
      play(){return Promise.reject(new Error('unavailable'));}
      pause(){this.stopped=true;}
    };
  });
  await control(page,'italic').hover(); await page.mouse.down(); await page.clock.runFor(120);
  await page.mouse.up(); await page.clock.runFor(300);
  expect((await snap(page)).find(s=>s.name==='italic')).toMatchObject({state:2,finished:true});
  await control(page,'bold').hover(); await page.mouse.down(); await page.clock.runFor(120);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const count=await page.evaluate(()=>window.actionAudio.length);
  await page.mouse.up(); await page.clock.runFor(300);
  expect((await snap(page)).find(s=>s.name==='bold').state).toBe(0);
  expect(await page.evaluate(()=>window.actionAudio.length)).toBe(count);
  expect(await page.evaluate(()=>window.actionAudio.every(a=>a.stopped))).toBe(true);
});
