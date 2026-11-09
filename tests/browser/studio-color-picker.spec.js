import { test, expect } from '@playwright/test';

// This file uses only the shipped app and independently composes source PNGs.
const phase = page => page.locator('#palette');
async function start(page) {
  await page.goto('/');
  await expect(page.locator('#studio')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#paper-canvas')?.dataset.paintReady === 'ready');
}
async function open(page) {
  await page.locator('#color-button').dispatchEvent('click', { detail: 0 });
  await expect(phase(page)).toHaveAttribute('data-phase', 'open');
}

test('studio source programs render all 14 independently composed poses and gate controls', async ({ page }) => {
  await start(page);
  await page.clock.install({ time: new Date(1000000) });
  await page.clock.pauseAt(new Date(1000000));
  // Disable audio for deterministic source terminal-update checks.
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function() { return Promise.reject(new Error('disabled')); }; });
  await page.locator('#color-button').dispatchEvent('click', { detail: 0 });
  await expect(phase(page)).toHaveAttribute('data-phase', 'opening');
  const positions = [[1,-78,559],[2,-46,510],[3,-7,470],[4,38,426],[5,38,426],[6,38,426],[7,38,426]];
  async function compare([id,x,y]) {
    return page.evaluate(async ({id,x,y}) => {
      const image = new Image(); image.src = `/original/ui/color-picker-motion/big-${id}.png`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width=1024;canvas.height=768;
      const c=canvas.getContext('2d');c.save();c.beginPath();c.rect(-80,411,427,457);c.clip();c.drawImage(image,x,y);c.restore();
      const a=c.getImageData(0,0,1024,768).data;
      const b=document.querySelector('#color-picker-actor').getContext('2d').getImageData(0,0,1024,768).data;
      return a.reduce((n,v,i)=>n+(v!==b[i]),0);
    },{id,x,y});
  }
  for (let i=0;i<7;i++) { if(i) await page.clock.runFor(32); expect(await compare(positions[i]), `opening ${i}`).toBe(0); }
  await expect(phase(page)).toBeHidden();
  await page.clock.runFor(32);
  await expect(phase(page)).toHaveAttribute('data-phase','open');
  await page.keyboard.press('Escape');
  for(let i=0;i<7;i++) { if(i) await page.clock.runFor(112); expect(await compare(positions[6-i])).toBe(0); }
  await page.clock.runFor(112); await expect(phase(page)).toHaveAttribute('data-phase','closed');
});

test('interrupted opening runs full close, refuses reentry, then can reopen', async ({ page }) => {
  await start(page);
  await page.locator('#color-button').dispatchEvent('click',{detail:0});
  await expect(phase(page)).toHaveAttribute('data-phase','opening');
  await page.keyboard.press('Escape');
  await expect(phase(page)).toHaveAttribute('data-phase','closing');
  await page.locator('#color-button').dispatchEvent('click',{detail:0});
  await expect(phase(page)).toHaveAttribute('data-phase','closing');
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
  await open(page);
});

test('decode failure offers static controls and retries after dismissal; stale load cannot reopen', async ({ page }) => {
  await start(page);
  await page.route('**/color-picker-motion/big-1.png*',route=>route.fulfill({contentType:'image/png',body:'broken'}));
  await page.locator('#color-button').dispatchEvent('click',{detail:0});
  await expect(phase(page)).toHaveAttribute('data-phase','fallback');
  await expect(page.getByLabel('Custom color',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/color-picker-motion/big-1.png*');
  await open(page);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
  await open(page);
});

for(const pointerType of ['mouse','touch','pen']) test(`scaled ${pointerType} source mask selection retains palette and updates tool color`, async ({page})=>{
  await start(page); await page.setViewportSize({width:768,height:600}); await page.waitForTimeout(150); await open(page);
  const expected = await page.evaluate(async () => {
    const image = new Image(); image.src='/original/ui/color-picker-motion/big-7.png'; await image.decode();
    const c=document.createElement('canvas'); c.width=307;c.height=307;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
    return '#'+[...ctx.getImageData(191-38,580-426,1,1).data].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
  });
  await page.evaluate(pointerType=>{
    const studio=document.querySelector('#studio'), r=studio.getBoundingClientRect();
    for(const type of ['pointerdown','pointerup']) studio.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
      pointerId:71,pointerType,clientX:r.left+190*r.width/1024,clientY:r.top+580*r.height/768,buttons:type==='pointerdown'?1:0}));
  },pointerType);
  await expect(phase(page)).toHaveAttribute('data-phase','open');
  await expect(page.locator('#color-button')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#custom-color')).toHaveValue(expected);
  await page.getByLabel('Custom color',{exact:true}).fill('#123456');
  await expect(page.locator('#custom-color')).toHaveValue('#123456');
});

test('held source cue gates opening and closing, interruption cancels its owner', async ({page})=>{
  await start(page);
  await page.evaluate(()=>{
    window.pickerSounds=[];
    window.Audio=class extends EventTarget {
      constructor(src){super();this.src=src;this.ended=false;window.pickerSounds.push(this);}
      play(){return Promise.resolve();} pause(){this.paused=true;} removeAttribute(){} load(){}
    };
  });
  await page.locator('#color-button').dispatchEvent('click',{detail:0});
  await expect(phase(page)).toHaveAttribute('data-phase','opening');
  await page.waitForTimeout(400);
  await expect(phase(page)).toBeHidden();
  await page.evaluate(()=>window.pickerSounds.find(s=>s.src.includes('color-picker-motion/big-1501.wav')).dispatchEvent(new Event('ended')));
  await expect(phase(page)).toHaveAttribute('data-phase','open');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>window.pickerSounds.find(s=>s.src.includes('color-picker-motion/big-1501.wav')).paused)).toBe(true);
  await page.waitForTimeout(800);
  await expect(phase(page)).toHaveAttribute('data-phase','closing');
  await page.evaluate(()=>window.pickerSounds.find(s=>s.src.includes('color-picker-motion/big-1500.wav')).dispatchEvent(new Event('error')));
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
});

test('delayed decode cannot resurrect a dismissed palette; lifecycle cancels held ownership',async({page})=>{
  await start(page);
  let release;
  const gate=new Promise(resolve=>release=resolve);
  await page.route('**/color-picker-motion/manifest.json*',async route=>{await gate;await route.continue();});
  await page.locator('#color-button').dispatchEvent('click',{detail:0});
  await expect(phase(page)).toHaveAttribute('data-phase','loading');
  await page.keyboard.press('Escape'); release();
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
  await page.unroute('**/color-picker-motion/manifest.json*');
  await open(page);
  await page.mouse.move(190,580); await page.mouse.down();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
  await open(page);
  await page.getByRole('button',{name:'Painting Tools',exact:true}).click();
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
});

test('dropper rest, hover and held tracking use authored overlays; command preserves scene sampling',async({page})=>{
  await start(page); await open(page);
  const check=async sprite=> page.evaluate(async sprite=>{
    const paths=[7,sprite];const images=await Promise.all(paths.map(async id=>{const image=new Image();image.src=`/original/ui/color-picker-motion/big-${id}.png`;await image.decode();return image;}));
    const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d');
    ctx.save();ctx.beginPath();ctx.rect(-80,411,427,457);ctx.clip();ctx.drawImage(images[0],38,426);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(116,446,71,80);ctx.clip();ctx.drawImage(images[1],118,461);ctx.restore();
    const a=ctx.getImageData(0,0,1024,768).data,b=document.querySelector('#color-picker-actor').getContext('2d').getImageData(0,0,1024,768).data;
    return a.reduce((sum,v,i)=>sum+(v!==b[i]),0);
  },sprite);
  expect(await check(9)).toBe(0);
  await page.mouse.move(140,480);expect(await check(11)).toBe(0);
  await page.mouse.down();expect(await check(10)).toBe(0);
  await page.mouse.up();await expect(phase(page)).toHaveAttribute('data-phase','closing');
  await page.mouse.click(400,300);
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready','ready');
});

test('held palette owns contact against foreign touch and restores preview on cancellation',async({page})=>{
  await start(page);await open(page);
  const original=await page.locator('#color-chip').evaluate(c=>c.toDataURL());
  await page.mouse.move(190,580);await page.mouse.down();
  await expect.poll(()=>page.locator('#color-chip').evaluate(c=>c.toDataURL())).not.toBe(original);
  await page.locator('#color-button').evaluate(control=>{
    for(const type of ['pointerdown','pointerup','click']) control.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:99,pointerType:'touch',detail:1}));
  });
  await expect(phase(page)).toHaveAttribute('data-phase','open');
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect.poll(()=>page.locator('#color-chip').evaluate(c=>c.toDataURL())).toBe(original);
  await expect(phase(page)).toHaveAttribute('data-phase','closed');
  await open(page);
});

for(const interrupt of ['pagehide','hidden','resize']) test(`${interrupt} cancels animation and allows a clean new open`,async({page})=>{
  await start(page);await open(page);
  await page.evaluate(interrupt=>{
    if(interrupt==='hidden') {
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document,'hidden',{configurable:true,value:false});
    } else window.dispatchEvent(new Event(interrupt));
  },interrupt);
  await expect(phase(page)).toHaveAttribute('data-phase','closed');await open(page);
});

for(const pointerType of ['touch','pen']) test(`held drawing rejects foreign ${pointerType} palette first contact`,async({page})=>{
  await start(page); await page.mouse.move(400,300);await page.mouse.down();
  await page.locator('#color-button').evaluate((control,pointerType)=>{
    for(const type of ['pointerenter','pointerdown','pointerup','click']) control.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:99,pointerType,detail:1}));
  },pointerType);
  await expect(phase(page)).toBeHidden();
  await page.mouse.up();await open(page);
});
