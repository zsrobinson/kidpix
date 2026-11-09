import { test, expect } from '@playwright/test';
const actor = page => page.locator('[data-native-action-motion]');
const snap = page => actor(page).evaluate(c => JSON.parse(c.dataset.motionSnapshot));
const control = (page, action) => page.locator(`#tray-buttons [data-action="${action}"]`);
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(b => b.click());
async function start(page) {
  await page.goto('/'); await click(page,'tray:text');
  await expect(actor(page)).toBeVisible();
}
async function object(page) {
  await start(page);
  await page.locator('#paper-canvas').click({position:{x:150,y:140}});
  await page.locator('.object-text').fill('Second');
}
const range = page => page.evaluate(() => ({ anchor:getSelection().anchorOffset, focus:getSelection().focusOffset }));
test('preset bounds and typed custom value; real numeric/select focus and keyboard',async ({page}) => {
  await object(page);
  const input = page.locator('#font-size');
  await input.fill('42'); await input.press('Tab');
  await expect(input).toHaveValue('42');
  await control(page,'font-size-step:1').click(); await expect(input).toHaveValue('48');
  await control(page,'font-size-step:-1').focus(); await page.keyboard.press('Space'); await expect(input).toHaveValue('36');
  for (const [value,disabled] of [['7','font-size-step:-1'],['336','font-size-step:1']]) {
    await input.fill(value); await input.press('Tab'); await expect(control(page,disabled)).toBeDisabled();
  }
  await input.fill('42'); await input.press('Tab');
  await page.locator('#font').selectOption('serif');
  await expect(page.locator('.object-text')).toHaveCSS('font-family','serif');
  await page.locator('#font').focus(); await expect(page.locator('#font')).toBeFocused();
  await input.focus(); await input.fill('120'); await expect(input).toBeFocused();
  await input.press('Tab'); await expect(page.locator('.object-text')).toHaveCSS('font-size','120px');
});
for (const [anchor,focus] of [[1,5],[5,1],[3,3]]) test(`arrow preserves range ${anchor}:${focus} and typing`,async ({page}) => {
  await object(page);
  await page.locator('.object-text').evaluate((editor,[a,f]) => {editor.focus();getSelection().setBaseAndExtent(editor.firstChild,a,editor.firstChild,f);},[anchor,focus]);
  await control(page,'font-step:1').click(); expect(await range(page)).toEqual({anchor,focus});
  await control(page,'font-size-step:1').click(); expect(await range(page)).toEqual({anchor,focus});
  await page.keyboard.type('Z'); await expect(page.locator('.object-text')).toContainText('Z');
});
test('asset failure leaves usable static arrows and retries on reentry',async ({page}) => {
  await page.route('**/secondary-motion/manifest.json',route=>route.abort());
  await page.goto('/'); await click(page,'tray:text');
  await control(page,'font-size-step:1').click(); await expect(page.locator('#font-size')).toHaveValue('36');
  await control(page,'font-step:1').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#font')).toHaveValue('serif');
  await page.unroute('**/secondary-motion/manifest.json');
  await click(page,'tray:draw'); await click(page,'tray:text'); await expect(actor(page)).toBeVisible();
  await control(page,'font-size-step:1').click(); await expect(page.locator('#font-size')).toHaveValue('48');
});

// Independent ordinary source compositor. No application renderer/controller import.
async function expectSourcePixels(page, owner, view) {
  const states = await snap(page, owner);
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
    layers.push({ png: PNG.sync.write(src).toString('base64'), x, y, clip });
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
  const actual = PNG.sync.read(Buffer.from((await actor(page, owner).evaluate(canvas => canvas.toDataURL())).split(',')[1], 'base64'));
  const studio = PNG.sync.read(await page.locator('#studio').screenshot());
  expect([studio.width, studio.height]).toEqual([1024, 768]);
  let canvasBad = 0, visibleBad = 0;
  for (let y = top; y < Math.min(bottom, 768); y++) for (let x = left; x < right; x++) {
    const offset = (y * 1024 + x) * 4;
    // Independent source footprints, excluding the unbound navigation column.
    const owned = (view === 'text' ? [[257,643,43,62],[334,643,43,62],[160,714,194,33]] : [[409,647,82,86],[542,651,324,82]])
      .some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
    if (!owned) expected.data.fill(0, offset, offset + 4);
    for (let c = 0; c < 4; c++) {
      if (Math.abs(actual.data[offset + c] - expected.data[offset + c]) > 1) canvasBad++;
      if (expected.data[offset + 3] === 255 && Math.abs(studio.data[offset + c] - expected.data[offset + c]) > 1) visibleBad++;
    }
  }
  if (canvasBad) {
    const differences = [];
    for (let offset = 0; offset < actual.data.length && differences.length < 24; offset += 4) {
      const a = [...actual.data.subarray(offset, offset + 4)], e = [...expected.data.subarray(offset, offset + 4)];
      if (a.some((v, c) => Math.abs(v - e[c]) > 1)) differences.push({ x: offset / 4 % actual.width, y: Math.floor(offset / 4 / actual.width), actual: a, expected: e });
    }
    await test.info().attach('source-canvas-differences', { body: JSON.stringify({ canvasBad, differences }), contentType: 'application/json' });
  }
  expect(canvasBad, `${owner} source canvas channels`).toBe(0);
  if (visibleBad) {
    await page.screenshot({ path: `artifacts/t3/action-runtime/${owner.replace(':', '-')}-actual.png` });
    await import('node:fs').then(fs => fs.writeFileSync(`artifacts/t3/action-runtime/${owner.replace(':', '-')}-expected.png`, PNG.sync.write(expected)));
  }
  expect(visibleBad, `${owner} visible studio channels`).toBe(0);
}

import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sourceManifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const png = path => PNG.sync.read(readFileSync(`public/original/ui/${path}`));
const hash = value => createHash('sha256').update(value).digest('hex');


test('four arrows: both source tracking poses, hover, rest, boundaries, vacated studio pixels',async ({page}) => {
  await start(page);
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now()+60000));
  await page.locator('#font').selectOption('serif');
  for (const action of ['font-step:-1','font-step:1','font-size-step:1','font-size-step:-1']) {
    // Interior reset without moving popup focus.
    await page.locator('#font').selectOption('serif');
    await page.locator('#font-size').fill('42'); await page.locator('#font-size').press('Tab');
    await control(page,action).hover(); await page.clock.runFor(16); await expectSourcePixels(page,'text','text');
    await page.mouse.down(); await expectSourcePixels(page,'text','text');
    expect((await snap(page)).find(s=>s.name===action).frameIndex).toBe(0);
    await page.clock.runFor(112); expect((await snap(page)).find(s=>s.name===action).frameIndex).toBe(1);
    await expectSourcePixels(page,'text','text');
    await page.mouse.up(); await page.clock.runFor(16); await expectSourcePixels(page,'text','text');
  }
  for (const value of ['7','336']) {
    await page.locator('#font-size').fill(value); await page.locator('#font-size').press('Tab'); await page.clock.runFor(16);
    await expectSourcePixels(page,'text','text');
  }
});
for (const [anchor,focus] of [[1,5],[5,1],[3,3]]) test(`direct edits keep range ${anchor}:${focus} and genuine focus`,async ({page}) => {
  await object(page);
  await page.locator('.object-text').evaluate((editor,[a,f]) => {editor.focus();getSelection().setBaseAndExtent(editor.firstChild,a,editor.firstChild,f);},[anchor,focus]);
  await page.locator('#font-size').click(); await page.locator('#font-size').fill('42');
  await page.locator('#font-size').dispatchEvent('change'); await expect(page.locator('#font-size')).toBeFocused();
  await page.locator('#font').focus(); await page.locator('#font').selectOption('monospace');
  await expect(page.locator('#font')).toBeFocused();
  await page.locator('.object-text').focus(); expect(await range(page)).toEqual({anchor,focus});
  await page.keyboard.type('Z'); await expect(page.locator('.object-text')).toContainText('Z');
});
test('held arrows cancel outside, pointercancel, blur, keyboard repeat and target replacement',async ({page}) => {
  await object(page);
  const larger = control(page,'font-size-step:1');
  await larger.hover(); await page.mouse.down(); await page.mouse.move(400,600); await page.mouse.up();
  await expect(page.locator('#font-size')).toHaveValue('32');
  await larger.evaluate(b=>b.addEventListener('pointerdown',e=>window.held=e.pointerId,{once:true}));
  await larger.hover(); await page.mouse.down();
  await larger.evaluate(b=>b.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:window.held})));
  await page.mouse.up(); await expect(page.locator('#font-size')).toHaveValue('32');
  await larger.focus(); await page.keyboard.down('Space');
  await larger.dispatchEvent('keydown',{key:' ',repeat:true}); await page.keyboard.up('Space');
  await expect(page.locator('#font-size')).toHaveValue('36');
  await control(page,'font-size-step:1').focus(); await page.keyboard.down('Space');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); await page.keyboard.up('Space');
  await expect(page.locator('#font-size')).toHaveValue('36');
  await page.locator('#paper-canvas').click({position:{x:420,y:320}}); await page.locator('.object-text').last().fill('Other');
  await control(page,'font-size-step:1').hover(); await page.mouse.down();
  await page.locator('.object-text').first().focus(); await page.mouse.up();
  await expect(page.locator('.object-text').first()).toHaveCSS('font-size','36px');
  await expect(page.locator('.object-text').last()).toHaveCSS('font-size','36px');
});
test('selected object and undo redo refresh values without replacing a focused input',async ({page}) => {
  await object(page); await page.locator('#font-size').fill('42'); await page.locator('#font-size').press('Tab');
  await page.locator('#paper-canvas').click({position:{x:420,y:320}}); await page.locator('.object-text').last().fill('Other');
  await page.locator('#font-size').fill('96'); await page.locator('#font-size').press('Tab');
  await click(page,'undo');
  await expect(page.locator('.object-text').last()).toHaveCSS('font-size','42px');
  await click(page,'redo'); await expect(page.locator('.object-text').last()).toHaveCSS('font-size','96px');
  await page.locator('.object-text').first().focus(); await expect(page.locator('#font-size')).toHaveValue('42');
  await page.locator('.object-text').last().focus(); await expect(page.locator('#font-size')).toHaveValue('96');
});
test('saved unknown font and size survive selection and undo without coercion',async ({page}) => {
  await start(page);
  await page.locator('#picture-file').setInputFiles({name:'saved.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    version:1,format:'kidpix-web',paint:{version:1},objects:[{id:'saved-text',kind:'text',x:100,y:100,width:235,height:100,text:'Saved',font:'Missing Saved Family',size:42,color:'#000000',align:'left'}]
  }))});
  await page.locator('.object-text').focus(); await expect(page.locator('#font')).toHaveValue('Missing Saved Family');
  await expect(control(page,'font-step:-1')).toBeDisabled(); await expect(control(page,'font-step:1')).toBeDisabled();
  await expect(page.locator('#font-size')).toHaveValue('42');
  await page.locator('#font').selectOption('serif'); await click(page,'undo');
  await page.locator('.object-text').focus(); await expect(page.locator('#font')).toHaveValue('Missing Saved Family');
  await expect(page.locator('#font-size')).toHaveValue('42');
});
test('same tray rerender retains held arrow stream and commits once',async ({page}) => {
  await object(page); await page.clock.install(); await page.clock.pauseAt(new Date(Date.now()+60000));
  await control(page,'font-size-step:1').hover(); await page.mouse.down(); await page.clock.runFor(112);
  expect((await snap(page)).find(s=>s.name==='font-size-step:1').frameIndex).toBe(1);
  await click(page,'tray:text');
  expect((await snap(page)).find(s=>s.name==='font-size-step:1')).toMatchObject({frameIndex:1,state:1});
  await page.mouse.up(); await expect(page.locator('#font-size')).toHaveValue('36');
});

for (const id of ['font-size','font']) test(`art readiness retains focused ${id} identity and editing`, async ({page}) => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/secondary-motion/manifest.json', async route => { await ready; await route.continue().catch(() => {}); });
  try {
    await page.goto('/'); await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();
    await click(page,'tray:text');
    const field=page.locator(`#${id}`);await field.focus();
    if(id==='font-size') await field.fill('42');
    await field.evaluate(node=>window.pendingTextField=node);
    release();await expect(actor(page)).toBeVisible();
    expect(await field.evaluate(node=>node===window.pendingTextField)).toBe(true);
    await expect(field).toBeFocused();
    if(id==='font-size') {
      await page.keyboard.type('0');await expect(field).toHaveValue('420');await field.press('Tab');await expect(field).toHaveValue('336');
    } else {
      await field.press('ArrowDown');await expect(field).toHaveValue('serif');
    }
  } finally { release(); }
});

for (const cancellation of ['Escape','blur','focus','pagehide','hidden']) test(`fallback Space cancels on ${cancellation} and permits a fresh activation`,async({page})=>{
  await page.route('**/secondary-motion/manifest.json',route=>route.abort());
  await page.goto('/');await click(page,'tray:text');
  const larger=control(page,'font-size-step:1');await larger.focus();await page.keyboard.down('Space');
  if(cancellation==='Escape') await page.keyboard.press('Escape');
  else if(cancellation==='focus') await page.locator('#font-size').focus();
  else await page.evaluate(type=>{
    if(type==='hidden') {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});}
    else window.dispatchEvent(new Event(type));
  },cancellation);
  await page.keyboard.up('Space');await expect(page.locator('#font-size')).toHaveValue('32');
  await larger.focus();await page.keyboard.press('Space');await expect(page.locator('#font-size')).toHaveValue('36');
});

for (const cancel of [false,true]) test(`fallback Space survives art readiness ${cancel?'cancelled':'accepted'} exactly once`,async({page})=>{
  let release;
  const ready=new Promise(resolve=>{release=resolve;});
  await page.route('**/secondary-motion/manifest.json',async route=>{await ready;await route.continue().catch(()=>{});});
  try {
    await page.goto('/');await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();await click(page,'tray:text');
    await control(page,'font-size-step:1').focus();await page.keyboard.down('Space');
    if(cancel) await page.keyboard.press('Escape');
    release();await expect(actor(page)).toBeVisible();await page.keyboard.up('Space');
    await expect(page.locator('#font-size')).toHaveValue(cancel?'32':'36');
  } finally { release(); }
});

for (const cancel of [false,true]) test(`fallback pointer survives art readiness ${cancel?'cancelled':'accepted'} exactly once`,async({page})=>{
  let release;const ready=new Promise(resolve=>release=resolve);
  await page.route('**/secondary-motion/manifest.json',async route=>{await ready;await route.continue().catch(()=>{});});
  try{
    await page.goto('/');await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();await click(page,'tray:text');
    await control(page,'font-size-step:1').hover();await page.mouse.down();
    if(cancel)await page.keyboard.press('Escape');
    release();await expect(actor(page)).toBeVisible();await page.mouse.up();
    await expect(page.locator('#font-size')).toHaveValue(cancel?'32':'36');
  }finally{release();await page.mouse.up();}
});
