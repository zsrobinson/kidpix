import { test, expect } from '@playwright/test';
async function api(page, fn, arg) {
 return page.evaluate(async ([source,arg]) => {
   const {stickerTest:t}=await import('/src/main.js');
   return (0,eval)(`(${source})`)(t,arg);
 }, [String(fn),arg]);
}
async function start(page, fallback=false) {
 if(fallback) await page.route('**/secondary-motion/manifest.json*',r=>r.abort());
 await page.goto('/');
 await page.waitForSelector('#paper-canvas');
 await api(page, async t=>{
   // Exact, independently specified pixel source, no extraction output oracle.
   const c=document.createElement('canvas');c.width=720;c.height=542;
   const x=c.getContext('2d');x.fillStyle='#f02040';x.fillRect(0,0,720,542);
   x.fillStyle='#20e060';x.fillRect(100,100,50,50);
   await t.paint.restore({version:1,art:c.toDataURL()});
   await t.activate('tray:grab');await t.activate('tool:scissors');await t.activate('style:rectangle');
 });
}
async function select(page, points=[[30,40],[80,90]]) {
 const box=await page.locator('#paper-canvas').boundingBox();
 await page.mouse.move(box.x+points[0][0],box.y+points[0][1]);await page.mouse.down();
 for(const [x,y] of points.slice(1)) await page.mouse.move(box.x+x,box.y+y,{steps:2});
 await page.mouse.up();
}
const snapshot = page=>api(page,t=>({paint:t.paint.save(),objects:t.scene.snapshot(),undo:t.undo.length,redo:t.redo.length,tool:t.state.tools.grab,identity:t.paint.stickerIdentity,selected:t.scene.actionState.target,paintUndo:t.paint.canUndo,paintRedo:t.paint.canRedo,textGeneration:t.scene.textClipboard.generation}));
test('rectangle exact geometry, retained raster, clipboard neutrality, one history and Undo/Redo selection/tool policy',async({page})=>{
 await start(page);await select(page);await api(page,t=>t.paint.copy());
 const before=await snapshot(page);
 await api(page,t=>t.activate('make-sticker'));
 const after=await snapshot(page);
 expect(after.paint).toEqual(before.paint);expect(after.objects).toHaveLength(1);
 expect(after.objects[0]).toMatchObject({x:30,y:40,width:50,height:50,kind:'image'});
 expect(after.undo).toBe(before.undo+1);expect(after.tool).toBe('grab');expect(after.identity).toBeNull();
 expect(await api(page,async t=>{
   const im=new Image();im.src=t.scene.snapshot()[0].src;await im.decode();
   const c=document.createElement('canvas');c.width=50;c.height=50;const x=c.getContext('2d');x.drawImage(im,0,0);
   return [...x.getImageData(25,25,1,1).data];
 })).toEqual([240,32,64,255]);
 await api(page,t=>t.history('undo'));const undone=await snapshot(page);
 expect(undone.objects).toHaveLength(0);expect(undone.tool).toBe('scissors');expect(undone.identity).toBeTruthy();
 await api(page,t=>t.history('redo'));expect((await snapshot(page)).objects).toEqual(after.objects);
 // Raster clipboard survived conversion and history, independently exercised by Paste.
 await api(page,t=>t.paint.paste());expect(await api(page,t=>t.paint.canUndo)).toBe(true);
});
for(const [name,points] of [['tiny',[[10,10],[11,11]]],['large',[[0,0],[710,530]]],['lasso',[[30,40],[80,40],[30,90],[30,40]]]]) test(`${name} exact dimensions and mask`,async({page})=>{
 await start(page);if(name==='lasso')await api(page,t=>t.activate('style:freehand'));
 await select(page,points);const before=await snapshot(page);await api(page,t=>t.activate('make-sticker'));const after=await snapshot(page);
 expect(after.paint).toEqual(before.paint);expect(after.objects).toHaveLength(1);
 expect(after.objects[0]).toMatchObject({x:points[0][0],y:points[0][1],width:name==='tiny'?1:name==='large'?710:50,height:name==='tiny'?1:name==='large'?530:50});
 if(name==='lasso')expect(await api(page,async t=>{const im=new Image();im.src=t.scene.snapshot()[0].src;await im.decode();const c=document.createElement('canvas');c.width=c.height=50;const x=c.getContext('2d');x.drawImage(im,0,0);return [[...x.getImageData(5,5,1,1).data],[...x.getImageData(45,45,1,1).data]]})).toEqual([[240,32,64,255],[0,0,0,0]]);
});
for(const change of ['tool','selection','document','Escape','blur','hidden','pagehide','paint','scene'])test(`deferred decode rejects ${change}`,async({page})=>{
 await start(page);await select(page);
 await page.evaluate(()=>{window.decodeOriginal=Image.prototype.decode;Image.prototype.decode=function(){return new Promise(resolve=>{window.finishDecode=()=>window.decodeOriginal.call(this).then(resolve)})}});
 await api(page,t=>{t.activate('make-sticker');});
 await expect.poll(()=>page.evaluate(()=>Boolean(window.finishDecode))).toBe(true);
 if(change==='tool')await api(page,t=>t.activate('tool:grab'));
 else if(change==='selection')await select(page,[[200,200],[250,250]]);
 else if(change==='document')await api(page,t=>t.freshPicture());
 else if(change==='paint')await api(page,t=>t.paint.clear());
 else if(change==='scene')await api(page,t=>t.scene.addText({x:10,y:10},{}));
 else if(change==='Escape')await page.keyboard.press('Escape');
 else if(change==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
 else await page.evaluate(type=>window.dispatchEvent(new Event(type)),change);
 const before=await snapshot(page);await page.evaluate(()=>{Image.prototype.decode=window.decodeOriginal;window.finishDecode()});
 await page.waitForTimeout(100);expect(await snapshot(page)).toEqual(before);
});
for(const failure of ['decode','insert','consume','history'])test(`failure ${failure} leaves state and histories intact`,async({page})=>{
 await start(page);await select(page);const before=await snapshot(page);
 await api(page,async(t,f)=>{
  if(f==='decode'){const orig=Image.prototype.decode;Image.prototype.decode=()=>Promise.reject(Error('modeled decode failure'));await t.activate('make-sticker');Image.prototype.decode=orig;}
  else {const obj=f==='insert'?t.scene:f==='consume'?t.paint:t.undo,key=f==='insert'?'insertPreparedSticker':f==='consume'?'consumeSticker':'push';const orig=obj[key];obj[key]=()=>{throw Error('modeled commit failure')};await t.activate('make-sticker');obj[key]=orig;}
 },failure);
 expect(await snapshot(page)).toEqual(before);
});
for(const fallback of [false,true])for(const input of ['pointer','touch','Space','Enter','assistive'])test(`once-only ${input}, fallback ${fallback}`,async({page})=>{
 await start(page,fallback);await select(page);
 const b=page.locator('#tray-buttons [data-action="make-sticker"]');await expect(b).toBeEnabled();
 if(input==='pointer')await b.click();else if(input==='touch')await b.tap();else if(input==='assistive')await b.evaluate(e=>e.click());else{await b.focus();await page.keyboard.press(input);}
 await expect.poll(()=>api(page,t=>t.scene.snapshot().length)).toBe(1);expect(await api(page,t=>t.undo.length)).toBe(1);
});
test('unsupported and moved selections reject; repeated activation dedupes',async({page})=>{
 await start(page);await api(page,t=>t.activate('style:ellipse'));await select(page);await api(page,t=>t.activate('make-sticker'));expect((await snapshot(page)).objects).toHaveLength(0);
 await api(page,t=>t.activate('style:rectangle'));await select(page);await select(page,[[50,60],[60,70]]);
 await api(page,t=>t.activate('make-sticker'));expect((await snapshot(page)).objects).toHaveLength(0);
 await select(page,[[200,200],[260,260]]);await api(page,t=>Promise.all([t.activate('make-sticker'),t.activate('make-sticker')]));expect((await snapshot(page)).objects).toHaveLength(1);
});
test('save/Open and image export retain sticker geometry and original raster',async({page})=>{
 await start(page);await select(page);await api(page,t=>t.activate('make-sticker'));
 const saved=await api(page,t=>JSON.parse(JSON.stringify(t.project())));
 expect(saved.objects[0]).toMatchObject({x:30,y:40,width:50,height:50});
 await api(page,t=>t.freshPicture());await api(page,(t,p)=>t.restoreProject(p),saved);
 expect((await snapshot(page)).objects).toEqual(saved.objects);expect((await snapshot(page)).paint).toEqual(saved.paint);
 const download=page.waitForEvent('download');await api(page,t=>t.activate('save'));
 await page.locator('#dialog-actions').getByRole('button',{name:'Export PNG',exact:true}).click();
 expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
for(const fallback of [false,true])for(const input of ['pointer','Space'])test(`held ${input} target change cancels, fallback ${fallback}`,async({page})=>{
 await start(page,fallback);await select(page);const b=page.locator('#tray-buttons [data-action="make-sticker"]');await expect(b).toBeEnabled();
 if(input==='pointer'){await b.hover();await page.mouse.down();}else{await b.focus();await page.keyboard.down('Space');}
 await api(page,t=>{t.paint.clearStickerSelection();});
 if(input==='pointer')await page.mouse.up();else await page.keyboard.up('Space');
 expect((await snapshot(page)).objects).toHaveLength(0);
});
test('empty, ongoing and pasted pixels are unavailable; menu follows capability',async({page})=>{
 await start(page);await expect(page.locator('#menu [data-action="make-sticker"]')).toBeDisabled();
 await api(page,t=>t.activate('make-sticker'));expect((await snapshot(page)).objects).toHaveLength(0);
 await api(page,t=>t.activate('style:freehand'));await select(page,[[30,40],[80,90]]);expect(await api(page,t=>t.paint.stickerIdentity)).toBeNull();
 await api(page,t=>t.activate('style:rectangle'));
 const box=await page.locator('#paper-canvas').boundingBox();await page.mouse.move(box.x+30,box.y+40);await page.mouse.down();await page.mouse.move(box.x+80,box.y+90);
 expect(await api(page,t=>t.paint.captureSticker())).toBeNull();await page.mouse.up();
 await api(page,t=>{t.paint.copy();t.paint.paste();});expect(await api(page,t=>t.paint.captureSticker())).toBeNull();
});
test('row11 all source poses, finite tracking cue, restoration and Hand ownership',async({page})=>{
 await page.addInitScript(()=>{
  window.testCues=[];window.Audio=class extends EventTarget{
   constructor(src){super();this.src=String(src);window.testCues.push(this)}
   play(){return new Promise(()=>{})}pause(){this.stopped=true;this.dispatchEvent(new Event('pause'))}
  };
 });
 await page.clock.install();await start(page);await select(page);
 const motion=page.locator('[data-native-action-motion]');await expect(motion).toBeVisible();
 await page.mouse.move(700,400);await page.clock.pauseAt(new Date(Date.now()+1000));
 const rect={x:493,y:647,width:61,height:86};
 const {PNG}=await import('pngjs');const {readFileSync}=await import('node:fs');
 const pin=JSON.parse(readFileSync('tests/fixtures/make-sticker-source.json'));
 // Every visible opaque authored pixel, independent fixed source geometry.
 async function pose(number){
  const actual=PNG.sync.read(await page.screenshot({clip:rect}));
  const expected=PNG.sync.read(readFileSync(`public/original/ui/secondary-motion/sprites/18000-${number}.png`));
  const composed=await page.evaluate(async({base,sprite})=>{
   const [b,s]=await Promise.all([base,sprite].map(async src=>{const i=new Image();i.src=src;await i.decode();return i}));
   const c=document.createElement('canvas');c.width=61;c.height=86;const x=c.getContext('2d');
   x.drawImage(b,-380,-39);x.drawImage(s,0,0);return c.toDataURL();
  },{base:`data:image/png;base64,${readFileSync('public/original/ui/secondary-motion/backdrops/scissors-1.png').toString('base64')}`,sprite:`data:image/png;base64,${readFileSync(`public/original/ui/secondary-motion/sprites/18000-${number}.png`).toString('base64')}`});
  const full=PNG.sync.read(Buffer.from(composed.split(',')[1],'base64'));
  expect(actual.data.equals(full.data),'all visible footprint bytes, including translucent edges and restored pixels').toBe(true);
  let compared=0;for(let i=0;i<expected.data.length;i+=4)if(expected.data[i+3]===255){compared++;expect([...actual.data.subarray(i,i+3)]).toEqual([...expected.data.subarray(i,i+3)])}
  expect(compared).toBeGreaterThan(100);expect(pin.sprites[`18000:${number}`].width).toBe(61);
 }
 await pose(634);const b=page.locator('#tray-buttons [data-action="make-sticker"]');await b.hover();await page.clock.runFor(20);await pose(636);
 await page.mouse.down();await page.clock.runFor(20);await pose(635);await page.clock.runFor(100);await pose(635);
 expect(await page.evaluate(()=>testCues.filter(a=>a.src.includes('18066.wav')).length)).toBe(1);
 await page.clock.runFor(500);expect(JSON.parse(await motion.getAttribute('data-motion-snapshot')).find(s=>s.name==='make-sticker').finished).toBe(false);expect(await page.evaluate(()=>testCues.filter(a=>a.src.includes('18066.wav')).length)).toBe(1);
 await page.evaluate(()=>testCues.find(a=>a.src.includes('18066.wav')).dispatchEvent(new Event('ended')));await page.clock.runFor(120);
 expect(JSON.parse(await motion.getAttribute('data-motion-snapshot')).find(s=>s.name==='make-sticker').finished).toBe(true);
 await page.mouse.move(700,400);await page.clock.runFor(20);await pose(634);await page.mouse.up();
 expect((await snapshot(page)).objects).toHaveLength(0);
 await api(page,t=>t.activate('tool:grab'));expect(await page.locator('#tray-buttons [data-action="make-sticker"]').count()).toBe(0);
 await api(page,t=>t.activate('tool:scissors'));await page.clock.runFor(100);await pose(634);
});
test('late rollback keeps selected object DOM and modeled media playback, without orphans',async({page})=>{
 await page.addInitScript(()=>{
  window.modeledPlayers=[];
  Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !this.modeledPlaying}});
  HTMLMediaElement.prototype.play=function(){this.modeledPlaying=true;if(!modeledPlayers.includes(this))modeledPlayers.push(this);return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){this.modeledPlaying=false};
 });
 await start(page);
 await api(page,t=>{t.scene.restore([{id:'existing',kind:'video',src:'data:video/mp4;base64,',x:400,y:200,width:80,height:60}],{history:true});t.scene.selectSticker('existing');});
 await page.evaluate(()=>{window.originalVideo=document.querySelector('#objects video');originalVideo.play()});
 await select(page);const before=await snapshot(page);
 await api(page,async t=>{const orig=t.paint.consumeSticker;t.paint.consumeSticker=()=>{throw Error('modeled late commit failure')};await t.activate('make-sticker');t.paint.consumeSticker=orig});
 expect(await snapshot(page)).toEqual(before);
 expect(await page.evaluate(()=>({same:document.querySelector('#objects video')===originalVideo,playing:!originalVideo.paused,orphans:modeledPlayers.filter(p=>p instanceof HTMLVideoElement&&!p.paused&&!p.isConnected).length}))).toEqual({same:true,playing:true,orphans:0});
});
test('scene clipboard survives conversion and its Undo/Redo',async({page})=>{
 await start(page);await api(page,t=>{t.scene.addAsset({src:'data:image/png;base64,',width:80,height:80,name:'clipboard object'});t.scene.edit('copy')});
 await select(page);await api(page,t=>t.activate('make-sticker'));await api(page,t=>t.history('undo'));await api(page,t=>t.history('redo'));
 await api(page,t=>t.scene.edit('paste'));expect(await api(page,t=>t.scene.snapshot().at(-1).name)).toBe('clipboard object');
});
test('tiny selection leaves legacy cut/copy unavailable; failed readback is neutral',async({page})=>{
 await start(page);await select(page,[[10,10],[11,11]]);
 expect(await api(page,t=>({cut:t.paint.actionState.cut,copy:t.paint.copy(),sticker:t.paint.actionState.makeSticker}))).toEqual({cut:false,copy:null,sticker:true});
 const before=await snapshot(page);
 await api(page,async t=>{const original=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=()=>{throw Error('modeled raster preparation failure')};await t.activate('make-sticker');HTMLCanvasElement.prototype.toDataURL=original});
 expect(await snapshot(page)).toEqual(before);
});
test('text clipboard remains usable after conversion',async({page})=>{
 await start(page);await api(page,t=>{t.activate('tray:text');t.scene.addText({x:400,y:200},{font:'Arial',size:20,color:'#000'})});
 const editor=page.locator('#objects .object-text');await editor.fill('clip text');await editor.blur();await editor.evaluate(e=>{e.focus();getSelection().selectAllChildren(e)});
 expect(await api(page,t=>t.scene.textClipboard.perform('copy'))).toBe(true);
 const generation=await api(page,t=>t.scene.textClipboard.generation);
 await api(page,t=>{t.activate('tray:grab');t.activate('tool:scissors')});await select(page);await api(page,t=>t.activate('make-sticker'));
 expect(await api(page,t=>t.scene.textClipboard.generation)).toBe(generation);
 await api(page,t=>{t.scene.selectSticker(t.scene.snapshot().find(o=>o.kind==='text').id);t.activate('tray:text')});
 await editor.evaluate(e=>{e.focus();getSelection().setBaseAndExtent(e.firstChild,9,e.firstChild,9)});
 expect(await api(page,t=>t.scene.textClipboard.perform('paste'))).toBe(true);await expect(editor).toHaveText('clip textclip text');
});
test('conversion history preserves unrelated later paint and scene edits',async({page})=>{
 await start(page);await select(page);const original=await api(page,t=>t.paint.save());await api(page,t=>t.activate('make-sticker'));
 await api(page,t=>t.paint.placeText('later',{x:200,y:200,size:24,color:'#000000'}));
 await api(page,t=>t.history('undo'));expect(await api(page,t=>t.paint.save())).toEqual(original);
 await api(page,t=>t.history('undo'));expect((await snapshot(page)).objects).toHaveLength(0);expect((await snapshot(page)).identity).toBeTruthy();
 await api(page,t=>t.history('redo'));expect((await snapshot(page)).objects).toHaveLength(1);
 await api(page,t=>t.scene.addAsset({src:'data:image/png;base64,',name:'later scene object'}));
 await api(page,t=>t.history('undo'));expect((await snapshot(page)).objects).toHaveLength(1);
 await api(page,t=>t.history('undo'));expect((await snapshot(page)).objects).toHaveLength(0);
});
test.beforeAll(async({browser})=>{ console.log(`Pinned browser engine: ${browser.version()}`); });
test('pending Open rejects extraction and cannot create a history-free conversion',async({page})=>{
 await start(page);await select(page);const saved=await api(page,t=>JSON.parse(JSON.stringify(t.project())));
 let pending;await page.route('**/pending-open.png',route=>{pending=route});
 await api(page,(t,p)=>{t.restoreProject({...p,paint:{...p.paint,art:'/pending-open.png'}})},saved);
 await expect.poll(()=>Boolean(pending)).toBe(true);
 await api(page,t=>t.activate('make-sticker'));expect((await snapshot(page)).objects).toHaveLength(0);expect((await snapshot(page)).tool).toBe('scissors');
 await pending.fulfill({contentType:'image/png',body:Buffer.from(saved.paint.art.split(',')[1],'base64')});
 await expect.poll(()=>api(page,t=>t.paint.save().art)).toBe(saved.paint.art);
 expect((await snapshot(page)).objects).toHaveLength(0);expect((await snapshot(page)).undo).toBe(0);
});
test('a held static Make Sticker press survives source readiness and commits once',async({page})=>{
 const pending=[];await page.route('**/secondary-motion/manifest.json*',route=>{pending.push(route)});
 await start(page);await select(page);const b=page.locator('#tray-buttons [data-action="make-sticker"]');await expect(b).toBeEnabled();
 await b.hover();await page.mouse.down();await expect(b).toBeEnabled();
 await expect.poll(()=>pending.length).toBeGreaterThan(0);for(const route of pending.splice(0))await route.continue();
 await page.unroute('**/secondary-motion/manifest.json*');await expect(page.locator('[data-native-action-motion]')).toBeVisible();
 await expect(b).toBeEnabled();await page.mouse.up();
 await expect.poll(()=>api(page,t=>t.scene.snapshot().length)).toBe(1);expect(await api(page,t=>t.undo.length)).toBe(1);
});
test('selection replacement retires a deferred request and allows immediate retry',async({page})=>{
 await start(page);await select(page);
 await page.evaluate(()=>{window.originalDecode=Image.prototype.decode;Image.prototype.decode=function(){if(window.finishOldStickerDecode)return window.originalDecode.call(this);return new Promise(resolve=>{window.finishOldStickerDecode=()=>window.originalDecode.call(this).then(resolve)})}});
 await api(page,t=>{t.activate('make-sticker')});await expect.poll(()=>page.evaluate(()=>Boolean(window.finishOldStickerDecode))).toBe(true);
 await select(page,[[200,200],[260,260]]);await api(page,t=>t.activate('make-sticker'));
 expect((await snapshot(page)).objects).toHaveLength(1);expect((await snapshot(page)).objects[0]).toMatchObject({x:200,y:200,width:60,height:60});
 const before=await snapshot(page);await page.evaluate(()=>{Image.prototype.decode=window.originalDecode;window.finishOldStickerDecode()});await page.waitForTimeout(100);expect(await snapshot(page)).toEqual(before);
});
for(const pageIndex of [1,2])for(const fail of [false,true])test(`Scissors page ${pageIndex+1} ${fail?'rollback':'Undo'} restores source page and owner`,async({page})=>{
 await start(page);await api(page,(t,p)=>{for(let i=0;i<p;i++)t.activate('page:1')},pageIndex);await select(page);
 expect(await api(page,t=>t.state.page)).toBe(pageIndex);
 if(fail){const before=await snapshot(page);await api(page,async t=>{const orig=t.undo.push;t.undo.push=()=>{throw Error('modeled late history failure')};await t.activate('make-sticker');t.undo.push=orig});expect(await snapshot(page)).toEqual(before)}
 else{await api(page,t=>t.activate('make-sticker'));expect((await snapshot(page)).tool).toBe('grab');await api(page,t=>t.history('undo'));expect((await snapshot(page)).tool).toBe('scissors');expect((await snapshot(page)).identity).toBeTruthy()}
 expect(await api(page,t=>t.state.page)).toBe(pageIndex);await expect(page.locator('#tray-buttons [data-action="make-sticker"]')).toBeEnabled();
});
