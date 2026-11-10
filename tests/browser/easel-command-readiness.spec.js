import {test,expect} from '@playwright/test';
for(const contact of ['pointer','Space'])test(`held fallback ${contact} keeps node, activation and silent adoption`,async({page})=>{
 let release,arrive;const gate=new Promise(r=>release=r),requested=new Promise(r=>arrive=r);
 await page.route('**/button-animations/1124-1.png*',async r=>{arrive();await gate;await r.continue();});
 await page.addInitScript(()=>{window.cues=[];window.activations=[];document.addEventListener('click',e=>{if(e.target.closest('[data-action="stereo"]'))activations.push('stereo');});window.Audio=class extends EventTarget{constructor(src){super();this.src=String(src);cues.push(this);}play(){return Promise.resolve();}pause(){}};});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});await requested;
  const b=page.locator('#hit-layer [data-action="stereo"]'),a=page.locator('[data-native-command-motion="export"]');
  await b.evaluate(b=>window.oldButton=b);
  if(contact==='pointer'){await b.hover();await page.mouse.down();}else{await b.focus();await page.keyboard.down(' ');await page.keyboard.press('Shift');}
  release();await page.evaluate(async()=>{const i=new Image();i.src='/original/ui/button-animations/1124-1.png';await i.decode();});
  await expect(a).toBeHidden();expect(await b.evaluate(b=>b===oldButton&&b.isConnected)).toBe(true);
  await page.locator('#hit-layer [data-action="save"]').evaluate(b=>{for(const type of ['pointerdown','pointerup','click'])b.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:99,pointerType:'touch',button:0,detail:1}));});await expect(page.locator('dialog')).not.toBeVisible();
  if(contact==='pointer')await page.mouse.up();else await page.keyboard.up(' ');
  await expect(a).toBeVisible();await expect(a).toHaveAttribute('data-finished','true');expect(await page.evaluate(()=>activations)).toEqual(['stereo']);
  expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1004')).length)).toBe(0);
 }finally{release();await page.mouse.up();await page.keyboard.up(' ');}
});
test('decode failure leaves usable static art and reentry retries',async({page})=>{
 await page.route('**/button-animations/1124-1.png*',r=>r.abort());await page.goto('/');
 const b=page.locator('#hit-layer [data-action="stereo"]');await b.click();
 await expect(page.locator('[data-native-part="export"]')).toBeVisible();await expect(page.locator('#status')).toContainText('Choose a 3D background');
 await page.unroute('**/button-animations/1124-1.png*');await page.mouse.move(500,400);await b.hover();await expect(page.locator('[data-native-rollover="export"]')).toBeVisible();await page.mouse.move(500,400);await expect(page.locator('[data-native-command-motion="export"]')).toBeVisible();
});
test.describe('touch compatibility',()=>{
 test.use({hasTouch:true});
 test('each touch dispatches once and later semantic activation survives cancel',async({page})=>{
  await page.addInitScript(()=>{window.activations=[];document.addEventListener('click',e=>{const a=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(a==='save'||a==='stereo')activations.push(a);});});
  await page.goto('/');await expect(page.locator('[data-native-command-motion="export"]')).toBeVisible();
  const b=page.locator('#hit-layer [data-action="stereo"]'),box=await b.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  expect(await page.evaluate(()=>activations)).toEqual(['stereo']);
  await b.focus();await page.keyboard.down(' ');await page.keyboard.press('Escape');await page.keyboard.up(' ');
  expect(await page.evaluate(()=>activations)).toEqual(['stereo']);
  await b.evaluate(b=>b.click());expect(await page.evaluate(()=>activations)).toEqual(['stereo','stereo']);
 });
});
