import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const oracle=JSON.parse(readFileSync(new URL('../fixtures/tool-tab-motion-source.json',import.meta.url)));
const cases = oracle.buttons.map(b=>[b.name,b.name,b.rawWords[0],oracle.scripts[b.rawWords[0]].rectXYWH]);
const controlFor = (page,name) => page.locator(`[data-action="tray:${name==='fill'?'bucket':name}"]`);
const actor = (page,name) => page.locator(`[data-native-tool-tab-motion="${name}"]`);
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    window.cues = [];
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src=String(src); this.ended=false; window.cues.push(this); }
      play() { return new Promise(resolve => { this.resolve=resolve; }); }
      pause() { this.pauses=(this.pauses||0)+1; this.dispatchEvent(new Event('pause')); }
    };
  });
  await page.clock.install();
  await page.goto('/');
  for (const [name] of cases) await expect(actor(page,name)).toBeVisible();
  await page.mouse.move(1023,767);
  await page.clock.pauseAt(new Date(Date.now()+1000));
});
async function sourcePixels(page, name, script, frame, rect, auxiliary = false) {
  const a=auxiliary ? page.locator(`[data-native-rollover="${name}"]`) : actor(page,name);
  await expect(a).toHaveAttribute('data-script',String(script));
  await expect(a).toHaveAttribute('data-frame',String(frame));
  const box=await a.boundingBox(); expect([box.x,box.y,box.width,box.height]).toEqual(rect);
  const actual=PNG.sync.read(await page.screenshot({clip:box}));
  // Composition over the actual studio backing; compare only opaque source
  // pixels so neighboring chrome remains independently owned.
  const response=await page.request.get(`/original/ui/button-animations/${script}-${frame}.png`);
  const expected=PNG.sync.read(await response.body());
  expect(createHash('sha256').update(expected.data).digest('hex')).toBe(oracle.scripts[script].rgbaSha256[frame]);
  let pixels=0;
  for(let i=0;i<expected.data.length;i+=4) if(expected.data[i+3]===255) {
    expect(actual.data.subarray(i,i+3).equals(expected.data.subarray(i,i+3))).toBe(true); pixels++;
  }
  expect(pixels).toBeGreaterThan(100);
}
for(const [name,label,rest,rect] of cases) test(`${name} visible tracking frames and same-script release/audio gate`,async({page})=>{
  const control=controlFor(page,name);
  if(name==='draw') await controlFor(page,'paint').evaluate(b=>b.click());
  await page.evaluate(()=>window.cues=[]);
  await control.hover(); await page.mouse.down();
  await sourcePixels(page,name,rest+1,0,rect);
  await page.clock.runFor(120);
  await sourcePixels(page,name,rest+1,1,rect);
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed','true');
  await sourcePixels(page,name,rest+1,1,rect);
  await page.clock.runFor(100);
  await sourcePixels(page,name,rest+1,2,rect);
  expect(await page.evaluate(()=>window.cues.filter(a=>/easel-1002\.wav/.test(a.src)).length)).toBe(1);
  await page.clock.runFor(500);
  await expect(actor(page,name)).toHaveAttribute('data-frame','2');
  await expect(actor(page,name)).toHaveAttribute('data-finished','false');
  await page.evaluate(()=>{const a=window.cues.find(a=>/easel-1002\.wav/.test(a.src));a.resolve();a.ended=true;a.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(120);
  await expect(actor(page,name)).toHaveAttribute('data-state','2');
  await expect(actor(page,name)).toHaveAttribute('data-finished','true');
});

for(const [name,,rest,rect] of cases) test(`${name} all rest/auxiliary pixels`,async({page})=>{
  const b=controlFor(page,name);
  await b.evaluate(b=>b.click());
  await controlFor(page,name==='draw'?'paint':'draw').evaluate(b=>b.click());
  for(let i=0;i<3;i++) {if(i)await page.clock.runFor(i===1?120:100);await sourcePixels(page,name,rest,i,rect);}
  await page.mouse.move(500,400);await b.hover();
  for(let i=0;i<4;i++) {if(i)await page.clock.runFor(i===1?120:100);await sourcePixels(page,name,rest+2,i,rect,true);}
  await page.mouse.move(500,400);await expect(actor(page,name)).toBeVisible();
});
test('silent hydration, exact outgoing/incoming cues, redundant selection and cancellation',async({page})=>{
  expect(await page.evaluate(()=>cues.filter(a=>/easel-100[12]\.wav/.test(a.src)).length)).toBe(0);
  await controlFor(page,'paint').evaluate(b=>b.click());
  expect(await page.evaluate(()=>cues.filter(a=>/easel-1001\.wav/.test(a.src)).length)).toBe(1);
  expect(await page.evaluate(()=>cues.filter(a=>/easel-1002\.wav/.test(a.src)).length)).toBe(1);
  await controlFor(page,'paint').evaluate(b=>b.click());
  expect(await page.evaluate(()=>cues.filter(a=>/easel-1002\.wav/.test(a.src)).length)).toBe(1);
  await controlFor(page,'grab').hover();await page.mouse.down();
  const count=await page.evaluate(()=>cues.length);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  expect(await page.evaluate(()=>cues.length)).toBe(count);
  await expect(actor(page,'grab')).toHaveAttribute('data-finished','true');
  await expect(controlFor(page,'paint')).toHaveAttribute('aria-pressed','true');
});
test.describe('actual touch',()=>{
 test.use({hasTouch:true});
 test('each tool activates once, then mouse and semantic clicks remain usable',async({page})=>{
  await page.evaluate(()=>{window.activations=[];document.addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a?.startsWith('tray:'))activations.push(a);});});
  const expected=[];
  for(const [name] of cases){
   const b=controlFor(page,name),box=await b.boundingBox();
   await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
   expected.push(`tray:${name==='fill'?'bucket':name}`);
   expect(await page.evaluate(()=>activations)).toEqual(expected);
   await expect(b).toHaveAttribute('aria-pressed','true');
  }
  await controlFor(page,'grab').click();expected.push('tray:grab');
  await controlFor(page,'draw').evaluate(b=>b.click());expected.push('tray:draw');
  expect(await page.evaluate(()=>activations)).toEqual(expected);
 });
});
