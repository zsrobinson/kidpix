import {test,expect} from '@playwright/test';
for(const unrelatedShift of [false,true])test(`fallback held Space retains ownership through decode${unrelatedShift ? ' after unrelated Shift release' : ''}`,async({page})=>{
 let release,arrive;const gate=new Promise(r=>release=r),requested=new Promise(r=>arrive=r);
 await page.route('**/button-animations/1016-1.png*',async route=>{arrive();await gate;await route.continue();});
 await page.addInitScript(()=>{
  window.tabActivations=[];
  document.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action?.startsWith('tray:'))tabActivations.push(action);});
 });
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});await requested;
  const paint=page.locator('[data-action="tray:paint"]'),grab=page.locator('[data-action="tray:grab"]'),actor=page.locator('[data-native-tool-tab-motion="paint"]');
  await expect(page.locator('[data-native-tool-tab-motion="grab"]')).toBeVisible();
  await paint.focus();await page.keyboard.down(' ');
  if(unrelatedShift){await page.keyboard.down('Shift');await page.keyboard.up('Shift');}
  release();await page.evaluate(async()=>{const image=new Image();image.src='/original/ui/button-animations/1016-1.png';await image.decode();});
  await grab.click();
  await expect(grab,'A second pointer cannot steal the held fallback key').toHaveAttribute('aria-pressed','false');
  await expect(actor,'Artwork adoption waits for the matching key release').toBeHidden();
  expect(await page.evaluate(()=>tabActivations)).toEqual([]);
  await page.keyboard.up(' ');
  await expect(paint).toHaveAttribute('aria-pressed','true');await expect(actor).toBeVisible();
  await expect(actor).toHaveAttribute('data-finished','true');
  expect(await page.evaluate(()=>tabActivations)).toEqual(['tray:paint']);
  await grab.click();await expect(grab).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>tabActivations)).toEqual(['tray:paint','tray:grab']);
 }finally{release();await page.keyboard.up(' ');await page.mouse.up();}
});
for(const timing of ['held','released'])test(`silent fallback adoption after ${timing}`,async({page})=>{
 let release,arrive;const gate=new Promise(r=>release=r),requested=new Promise(r=>arrive=r);
 await page.route('**/button-animations/1016-1.png*',async route=>{arrive();await gate;await route.continue();});
 await page.addInitScript(()=>{window.cues=[];window.Audio=class extends EventTarget{constructor(src){super();this.src=String(src);cues.push(this);}play(){return Promise.resolve();}pause(){this.dispatchEvent(new Event('pause'));}};});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});await requested;
  const b=page.locator('[data-action="tray:paint"]'),actor=page.locator('[data-native-tool-tab-motion="paint"]');
  await b.hover();await page.mouse.down();
  if(timing==='held'){
   release();await page.evaluate(async()=>{const i=new Image();i.src='/original/ui/button-animations/1016-1.png';await i.decode();});
   await expect(actor).toBeHidden();
  }
  await page.mouse.up();await expect(b).toHaveAttribute('aria-pressed','true');release();
  await expect(actor).toBeVisible();await expect(actor).toHaveAttribute('data-finished','true');
  expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1002.wav')).length)).toBe(1);
 }finally{release();await page.mouse.up();}
});
test('failed decode preserves fallback and entry retries silently',async({page})=>{
 await page.route('**/button-animations/1016-1.png*',r=>r.abort());await page.goto('/');
 const b=page.locator('[data-action="tray:paint"]');await b.click();
 await expect(page.locator('[data-native-part="paint"]')).toBeVisible();
 await page.unroute('**/button-animations/1016-1.png*');await page.mouse.move(500,400);await b.hover();
 await expect(page.locator('[data-native-tool-tab-motion="paint"]')).toBeVisible();
 await expect(page.locator('[data-native-tool-tab-motion="paint"]')).toHaveAttribute('data-finished','true');
});
