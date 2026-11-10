import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const oracle=JSON.parse(readFileSync(new URL('../fixtures/library-motion-source.json',import.meta.url)));
const cases = [ ['backgrounds','Backgrounds',1000,[27,15,105,61]], ['stickers','Stickers',1003,[36,85,91,55]], ['animations','Animations',1006,[38,148,106,70]], ['media','Sounds & Movies',1009,[14,222,103,67]] ];
const actor = (page,name) => page.locator(`[data-native-library-motion="${name}"]`);
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
  const control=page.getByRole('button',{name:label,exact:true});
  await control.hover(); await page.mouse.down();
  await sourcePixels(page,name,rest+1,0,rect);
  await page.clock.runFor(120);
  await sourcePixels(page,name,rest+1,1,rect);
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed','true');
  await sourcePixels(page,name,rest+1,1,rect);
  await page.clock.runFor(100);
  await sourcePixels(page,name,rest+1,2,rect);
  expect(await page.evaluate(()=>window.cues.filter(a=>/easel-1000\.wav/.test(a.src)).length)).toBe(1);
  await page.clock.runFor(500);
  await expect(actor(page,name)).toHaveAttribute('data-frame','2');
  await expect(actor(page,name)).toHaveAttribute('data-finished','false');
  await page.evaluate(()=>{const a=window.cues.find(a=>/easel-1000\.wav/.test(a.src));a.resolve();a.ended=true;a.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(120);
  await expect(actor(page,name)).toHaveAttribute('data-state','2');
  await expect(actor(page,name)).toHaveAttribute('data-finished','true');
});
test('drag-out/reentry, outside release, semantic peer selection and deactivation',async({page})=>{
  const b=page.getByRole('button',{name:'Backgrounds',exact:true});
  await b.hover();await page.mouse.down();await page.mouse.move(500,400);
  await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1000');
  await b.hover();await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1001');
  await page.mouse.move(500,400);await page.mouse.up();await expect(b).toHaveAttribute('aria-pressed','false');
  await b.evaluate(b=>b.click());await expect(b).toHaveAttribute('aria-pressed','true');
  const s=page.getByRole('button',{name:'Stickers',exact:true});await s.focus();await page.keyboard.press('Enter');
  await expect(s).toHaveAttribute('aria-pressed','true');await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1000');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(()=>window.cues.filter(a=>/easel-1000\.wav/.test(a.src)).every(a=>a.pauses>0))).toBe(true);
});
test('failed state asset preserves static/hover fallback and entry retries',async({page})=>{
  // New document: fail a tracking-only frame without touching the hover cache.
  await page.route('**/button-animations/1001-1.png*',route=>route.abort());
  await page.reload();
  await expect(page.locator('[data-native-part="backgrounds"]')).toBeVisible();
  const b=page.getByRole('button',{name:'Backgrounds',exact:true});
  await b.hover();
  await expect(page.locator('[data-native-fallback-rollover="backgrounds"]')).toBeVisible();
  await page.unroute('**/button-animations/1001-1.png*');
  await page.mouse.move(500,400);await b.hover();
  await expect(page.locator('[data-native-rollover="backgrounds"]')).toBeVisible();
  await page.mouse.down();
  await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1001');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1000');
  await page.mouse.up();
});
test('secondary held touch cannot replace library owner or activate on late click',async({page})=>{
  await page.evaluate(()=>{
    const b=document.querySelector('[data-action="tray:backgrounds"]');
    const s=document.querySelector('[data-action="tray:stickers"]');
    const send=(el,type,id,extra={})=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:id,button:0,buttons:1,...extra}));
    // Synthetic capture is unavailable, so stub only the platform capture seam.
    const root=document.querySelector('#hit-layer');root.setPointerCapture=()=>{};
    root.hasPointerCapture=()=>false;
    send(b,'pointerdown',71);send(s,'pointerdown',72);send(s,'pointerup',72);
    send(s,'click',72,{detail:1});
  });
  await expect(actor(page,'backgrounds')).toHaveAttribute('data-script','1001');
  await expect(page.getByRole('button',{name:'Stickers',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
});
for(const [name,label,rest,rect] of cases) test(`${name} all rest and auxiliary frames retain full registered pixels`,async({page})=>{
  const b=page.getByRole('button',{name:label,exact:true});
  await b.evaluate(b=>b.click());
  await page.getByRole('button',{name:'Drawing Tools',exact:true}).evaluate(b=>b.click());
  for(let i=0;i<3;i++) { if(i) await page.clock.runFor(i===1?120:100); await sourcePixels(page,name,rest,i,rect); }
  await page.mouse.move(500,400);await b.hover();
  for(let i=0;i<4;i++) { if(i) await page.clock.runFor(i===1?120:100); await sourcePixels(page,name,rest+2,i,rect,true); }
  await page.mouse.move(500,400);
  await expect(actor(page,name)).toBeVisible();
});

test.describe('browser touch activation',()=>{
  test.use({hasTouch:true});
  test('a cancelled touch cannot activate on its compatibility click; a fresh tap succeeds',async({page})=>{
    await page.evaluate(()=>{
      window.touchActivations=0;
      document.addEventListener('click',event=>{if(event.target.closest('[data-action="tray:backgrounds"]'))touchActivations++;});
      document.addEventListener('pointerdown',event=>{
        if(event.pointerType==='touch'&&event.target.closest('[data-action="tray:backgrounds"]'))window.dispatchEvent(new Event('blur'));
      },{once:true});
    });
    const button=page.getByRole('button',{name:'Backgrounds',exact:true}),box=await button.boundingBox();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(button).toHaveAttribute('aria-pressed','false');
    expect(await page.evaluate(()=>touchActivations)).toBe(0);
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(button).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>touchActivations)).toBe(1);
  });
  test('touch taps activate each library once and preserve later mouse and semantic activation',async({page})=>{
    await page.evaluate(()=>{
      window.libraryActivations=[];
      document.addEventListener('click',event=>{
        const action=event.target.closest('[data-action]')?.dataset.action;
        if(['tray:backgrounds','tray:stickers','tray:toons','tray:media'].includes(action))libraryActivations.push(action);
      });
    });
    const actions=['tray:backgrounds','tray:stickers','tray:toons','tray:media'];
    const expected=[];
    for(const [index,[,label]] of cases.entries()){
      const control=page.getByRole('button',{name:label,exact:true}),box=await control.boundingBox();
      await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
      expected.push(actions[index]);
      await expect(control).toHaveAttribute('aria-pressed','true');
      expect(await page.evaluate(()=>libraryActivations)).toEqual(expected);
    }
    const backgrounds=page.getByRole('button',{name:'Backgrounds',exact:true});
    const box=await backgrounds.boundingBox();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);expected.push(actions[0]);
    await page.getByRole('button',{name:'Stickers',exact:true}).click();expected.push(actions[1]);
    await backgrounds.evaluate(button=>button.click());expected.push(actions[0]);
    expect(await page.evaluate(()=>libraryActivations)).toEqual(expected);
    expect(await page.evaluate(()=>cues.filter(a=>/easel-1000\.wav/.test(a.src)).length)).toBe(expected.length);
  });
});
