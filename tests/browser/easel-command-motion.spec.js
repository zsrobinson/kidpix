import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {compareOpaqueSourcePixels} from './opaque-source-pixels.js';
const oracle=JSON.parse(readFileSync(new URL('../fixtures/easel-command-motion-source.json',import.meta.url)));
const button=(page,name)=>page.locator(`#hit-layer [data-action="${name==='export'?'stereo':name}"]`);
const actor=(page,name)=>page.locator(`[data-native-command-motion="${name}"]`);
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  window.cues=[];window.activations=[];
  window.Audio=class extends EventTarget{constructor(src){super();this.src=String(src);cues.push(this);}play(){return new Promise((resolve,reject)=>{this.reject=reject;});}pause(){this.stopped=true;this.dispatchEvent(new Event('pause'));}};
  document.addEventListener('click',e=>{const a=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(a==='save'||a==='stereo')activations.push(a);});
 });
 await page.clock.install();await page.goto('/');
 for(const b of oracle.buttons)await expect(actor(page,b.name)).toBeVisible();
 await page.mouse.move(500,400);await page.clock.pauseAt(new Date(Date.now()+1000));
});
async function pixels(page,name,id,frame,aux=false){
 const a=aux?page.locator(`[data-native-rollover="${name}"]`):actor(page,name);
 await expect(a).toHaveAttribute('data-script',String(id));await expect(a).toHaveAttribute('data-frame',String(frame));
 const rect=oracle.scripts[id].rectXYWH,box=await a.boundingBox();expect([box.x,box.y,box.width,box.height]).toEqual(rect);
 const expected=PNG.sync.read(await (await page.request.get(`/original/ui/button-animations/${id}-${frame}.png`)).body());
 expect(createHash('sha256').update(expected.data).digest('hex')).toBe(oracle.scripts[id].rgbaSha256[frame]);
 const actual=PNG.sync.read(await page.screenshot({clip:box})),comparison=compareOpaqueSourcePixels(actual,expected);
 expect(comparison.mismatched,JSON.stringify(comparison.firstMismatch)).toBe(0);expect(comparison.compared).toBeGreaterThan(100);
}
for(const {name,rawWords:w} of oracle.buttons){
 test(`${name} all ten source frame compositions and silent terminal hydration`,async({page})=>{
  expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1004')).length)).toBe(0);
  await pixels(page,name,w[0],2);
  const b=button(page,name);await b.hover();
  for(let i=0;i<4;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[10],i,true);}
  await page.mouse.down();
  for(let i=0;i<3;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[1],i);}
  await page.clock.runFor(400);await expect(actor(page,name)).toHaveAttribute('data-finished','false');
  await page.evaluate(()=>cues.find(a=>a.src.includes('easel-1004')).dispatchEvent(new Event('ended')));
  await page.clock.runFor(120);await expect(actor(page,name)).toHaveAttribute('data-finished','true');
  await page.mouse.move(500,400);
  for(let i=0;i<3;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[0],i);}
  await page.mouse.up();expect(await page.evaluate(()=>activations)).toEqual([]);
 });
 test(`${name} drag out/in, primary capture and release inside dispatch once`,async({page})=>{
  const b=button(page,name);await b.hover();await page.mouse.down({button:'right'});await expect(actor(page,name)).toHaveAttribute('data-state','0');await page.mouse.up({button:'right'});
  await page.mouse.down();await page.mouse.move(500,400);await expect(actor(page,name)).toHaveAttribute('data-state','0');await b.hover();await expect(actor(page,name)).toHaveAttribute('data-state','1');await page.mouse.up();
  expect(await page.evaluate(()=>activations)).toEqual([name==='export'?'stereo':name]);
  await expect(actor(page,name)).toHaveAttribute('data-state','0');
  expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1004')).every(a=>a.stopped))).toBe(true);
  await expect(page.locator('[data-action="tray:draw"]')).toHaveAttribute('aria-pressed','true');
 });
 for(const key of ['Enter',' '])test(`${name} ${key} matching keyup and repeat dispatch once`,async({page})=>{
  const b=button(page,name);await b.focus();await page.keyboard.down(key);await page.keyboard.down(key);
  await page.keyboard.press('Shift');expect(await page.evaluate(()=>activations)).toEqual([]);
  await expect(actor(page,name)).toHaveAttribute('data-state','1');await page.keyboard.up(key);
  expect(await page.evaluate(()=>activations)).toEqual([name==='export'?'stereo':name]);await expect(actor(page,name)).toHaveAttribute('data-state','0');
 });
}
for(const reason of ['Escape','blur','pagehide','hidden','pointercancel','disable','modal'])test(`${reason} retires own tracking and permits future semantic activation`,async({page})=>{
 const b=button(page,'export');await b.hover();await page.mouse.down();
 await page.evaluate(reason=>{
  // Unrelated audio is outside the motion owner's stream map.
  window.unrelated=new Audio('/original/ui/easel-1007.wav');unrelated.play();
  if(reason==='Escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  else if(reason==='pointercancel')document.querySelector('#hit-layer').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));
  else if(reason==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
  else if(reason==='disable')document.querySelector('[data-action="stereo"]').disabled=true;
  else if(reason==='modal')document.querySelector('dialog').showModal();
  else window.dispatchEvent(new Event(reason));
 },reason);
 await page.mouse.up();expect(await page.evaluate(()=>activations)).toEqual([]);
 expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1004')).every(a=>a.stopped))).toBe(true);
 expect(await page.evaluate(()=>Boolean(unrelated.stopped))).toBe(false);
 await page.evaluate(()=>{document.querySelector('[data-action="stereo"]').disabled=false;document.querySelector('dialog').close();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
 await b.evaluate(b=>b.click());expect(await page.evaluate(()=>activations)).toEqual(['stereo']);
});
for(const choice of ['Cancel','Save Picture','Export PNG'])test(`Save dialog ${choice} preserves canonical immediate action`,async({page})=>{
 await button(page,'save').click();await expect(page.locator('dialog')).toBeVisible();
 expect(await page.evaluate(()=>activations)).toEqual(['save']);
 if(choice==='Cancel'){await page.locator('#dialog-actions').getByRole('button',{name:choice,exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();}
 else{const download=page.waitForEvent('download');await page.locator('#dialog-actions').getByRole('button',{name:choice,exact:true}).click();expect((await download).suggestedFilename()).toMatch(choice==='Save Picture'?/\.kidpix-web$/:/\.png$/);}
 await expect(actor(page,'save')).toHaveAttribute('data-state','0');
});
test('Export rejects missing right background without opening Save or downloading PNG',async({page})=>{
 let downloads=0;page.on('download',()=>downloads++);await button(page,'export').click();
 await expect(page.locator('#status')).toContainText('Choose a 3D background');expect(downloads).toBe(0);await expect(page.locator('dialog')).not.toBeVisible();
 await expect(actor(page,'export')).toHaveAttribute('data-state','0');
});
for(const failure of ['throw','reject'])test(`stereo ${failure} preserves failure status and cannot reclaim a newer contact`,async({page})=>{
 const png=new PNG({width:720,height:542});png.data.fill(255);
 const fixture={version:1,format:'kidpix-web',title:'Stereo race',objects:[],paint:{version:1,art:`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`},backdrop:{rightSrc:'/test-right.png'}};
 await page.route('**/test-right.png',r=>r.fulfill({contentType:'image/png',body:PNG.sync.write(png)}));
 await page.locator('#picture-file').setInputFiles({name:'race.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.getByRole('textbox',{name:'Picture title',exact:true})).toHaveValue('Stereo race');
 await page.evaluate(failure=>{
  const decode=HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode=function(){if(this.src.endsWith('/test-right.png')){if(failure==='throw')throw new Error('decode failure');return new Promise((resolve,reject)=>{window.failOld=()=>reject(new Error('async failure'));});}return decode.call(this);};
 },failure);
 const b=button(page,'export');await b.click();await expect(actor(page,'export')).toHaveAttribute('data-state','0');
 if(failure==='reject'){
  await page.waitForFunction(()=>typeof failOld==='function');await page.mouse.move(500,400);await b.hover();await page.mouse.down();await expect(actor(page,'export')).toHaveAttribute('data-state','1');
  await page.evaluate(()=>failOld());await expect(page.locator('#status')).toContainText('Could not export');
  await expect(actor(page,'export')).toHaveAttribute('data-state','1');expect(await page.evaluate(()=>Boolean(cues.filter(a=>a.src.includes('easel-1004')).at(-1).stopped))).toBe(false);
  await page.mouse.move(500,400);await page.mouse.up();
 }else await expect(page.locator('#status')).toContainText('Could not export');
});
test('stereo download remains independent while Save modal owns the page',async({page})=>{
 const png=new PNG({width:720,height:542});png.data.fill(255);
 const fixture={version:1,format:'kidpix-web',title:'Stereo success',objects:[],paint:{version:1,art:`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`},backdrop:{rightSrc:'/test-right.png'}};
 await page.route('**/test-right.png',r=>r.fulfill({contentType:'image/png',body:PNG.sync.write(png)}));
 await page.locator('#picture-file').setInputFiles({name:'success.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.getByRole('textbox',{name:'Picture title',exact:true})).toHaveValue('Stereo success');
 await page.evaluate(()=>{const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){if(this.src.endsWith('/test-right.png'))return new Promise((resolve,reject)=>{window.finishStereo=()=>decode.call(this).then(resolve,reject);});return decode.call(this);};});
 await button(page,'export').click();await page.waitForFunction(()=>typeof finishStereo==='function');await expect(actor(page,'export')).toHaveAttribute('data-state','0');
 await button(page,'save').click();await expect(page.locator('dialog')).toBeVisible();const download=page.waitForEvent('download');await page.evaluate(()=>finishStereo());
 expect((await download).suggestedFilename()).toMatch(/^Stereo[ _]success[ _]3D\.png$/);await expect(page.locator('dialog')).toBeVisible();
 await expect(actor(page,'export')).toHaveAttribute('data-state','0');await expect(actor(page,'export')).toHaveAttribute('data-finished','true');
});
