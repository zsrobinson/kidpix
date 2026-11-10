import { test, expect } from '@playwright/test';
const click = (page,action)=>page.locator(`[data-action="${action}"]`).last().evaluate(b=>b.click());
const read=page=>page.locator('[data-action="speak"]');
async function setup(page,art=true) {
 if(!art) await page.route('**/secondary-motion/manifest.json',r=>r.abort());
 await page.addInitScript(()=>{
  window.platform={engine:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance};
  window.calls=[]; window.utterances=[];
  window.SpeechSynthesisUtterance=class { constructor(text){this.text=text;} };
  platform.engine.getVoices=()=>[{voiceURI:'a',name:'A'}];
  platform.engine.speak=u=>{calls.push(['speak',u.text]);utterances.push(u);};
  platform.engine.cancel=()=>calls.push(['cancel']);
 });
 await page.goto('/');await click(page,'tray:text');
 await page.locator('#paper-canvas').click({position:{x:150,y:140}});
 await page.locator('.object-text').fill('A😀\nsecond');
 if(art) await expect(page.locator('[data-native-action-motion]')).toBeVisible();
}
async function range(page,a,f) { await page.locator('.object-text').evaluate((node,[a,f])=>{node.focus();getSelection().setBaseAndExtent(node.firstChild,a,node.firstChild,f);},[a,f]); }
for(const art of [true,false]) for(const [a,f,expected] of [[1,3,'😀'],[3,1,'😀'],[3,3,'A😀\nsecond']]) test(`Read immutable selected range ${a}/${f}, art ${art}`,async({page})=>{
 await setup(page,art);await range(page,a,f);await read(page).click();
 expect(await page.evaluate(()=>calls)).toEqual([['speak',expected]]);
 await expect(read(page)).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>utterances[0].onstart());await read(page).click();
 expect(await page.evaluate(()=>calls)).toEqual([['speak',expected],['cancel']]);
 await expect(read(page)).toHaveAttribute('aria-pressed','false');
 await read(page).click();await page.evaluate(()=>{utterances[0].onend();utterances[0].onerror();});
 await expect(read(page)).toHaveAttribute('aria-pressed','true');await page.evaluate(()=>utterances[1].onend());
 await expect(read(page)).toHaveAttribute('aria-pressed','false');
});
for(const art of [true,false]) for(const key of ['Space','pointer']) test(`held ${key} invalidates on completion and payload change, art ${art}`,async({page})=>{
 await setup(page,art);await range(page,1,3);await read(page).click();
 if(key==='Space'){await read(page).focus();await page.keyboard.down('Space');}else{await read(page).hover();await page.mouse.down();}
 await page.evaluate(()=>utterances[0].onend());
 if(key==='Space')await page.keyboard.up('Space');else await page.mouse.up();
 expect(await page.evaluate(()=>calls)).toEqual([['speak','😀']]);
 if(key==='Space'){await read(page).focus();await page.keyboard.down('Space');}else{await read(page).hover();await page.mouse.down();}
 await page.locator('.object-text').evaluate(node=>{node.firstChild.data='Changed';node.dispatchEvent(new Event('input',{bubbles:true}));});
 if(key==='Space')await page.keyboard.up('Space');else await page.mouse.up();
 expect(await page.evaluate(()=>calls)).toEqual([['speak','😀']]);
});
test('multi-node plaintext, range change cancels; PicturePlay takeover and rejection',async({page})=>{
 await setup(page);await page.locator('.object-text').evaluate(node=>{node.innerHTML='<div>A😀</div><div>Second<br>Third</div>';node.dispatchEvent(new Event('input',{bubbles:true}));node.focus();getSelection().setBaseAndExtent(node.firstChild.firstChild,1,node.lastChild.lastChild,2);});
 await read(page).click();expect(await page.evaluate(()=>calls[0])).toEqual(['speak','😀\nSecond\nTh']);
 await click(page,'play');expect(await page.evaluate(()=>calls)).toEqual([['speak','😀\nSecond\nTh'],['cancel'],['speak','A😀\nSecond\nThird']]);
 await expect(read(page)).toBeDisabled();await page.evaluate(()=>utterances[0].onend());await expect(read(page)).toBeDisabled();
 await click(page,'play');
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const pins=JSON.parse(readFileSync('tests/fixtures/text-read-source.json'));
const manifest=JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const actor=page=>page.locator('[data-native-action-motion]');
async function readPixels(page,script,frameIndex=0){
 const state=await actor(page).evaluate(c=>JSON.parse(c.dataset.motionSnapshot).find(s=>s.name==='speak'));
 expect([state.script,state.frameIndex]).toEqual([script,frameIndex]);
 const base=PNG.sync.read(readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`));
 let expected=Buffer.alloc(61*86*4);
 for(let y=0;y<86;y++)base.data.copy(expected,y*61*4,((y+647-608)*base.width+493-113)*4,((y+647-608)*base.width+554-113)*4);
 for(const part of pins.programs[script].frames[frameIndex].parts){
  const sprite=PNG.sync.read(readFileSync(`public/original/ui/${manifest.sprites[`18000:${part.sprite}`].image}`));
  for(let y=0;y<86;y++)for(let x=0;x<61;x++){
   const i=(y*61+x)*4,a=sprite.data[i+3]/255;
   for(let c=0;c<3;c++)expected[i+c]=Math.round(sprite.data[i+c]*a+expected[i+c]*(1-a));expected[i+3]=255;
  }
 }
 // Keep Chromium's integer source oracle. WebKit uses the same independently
 // pinned layers with its own Canvas premultiplication/source-over rounding.
 if(test.info().project.use.browserName === 'webkit') {
  const layers = [{png:readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`).toString('base64'),x:113-493,y:608-647},
   ...pins.programs[script].frames[frameIndex].parts.map(part => ({
    png:readFileSync(`public/original/ui/${manifest.sprites[`18000:${part.sprite}`].image}`).toString('base64'),x:part.x-493,y:part.y-647,
   }))];
  const data = await page.evaluate(async layers => {
   const canvas = document.createElement('canvas');canvas.width=61;canvas.height=86;
   const context = canvas.getContext('2d');
   for(const layer of layers){const image=new Image();image.src=`data:image/png;base64,${layer.png}`;await image.decode();context.drawImage(image,layer.x,layer.y);}
   return canvas.toDataURL();
  }, layers);
  expected=PNG.sync.read(Buffer.from(data.split(',')[1],'base64')).data;
 }
 const images=[PNG.sync.read(Buffer.from((await actor(page).evaluate(c=>c.toDataURL())).split(',')[1],'base64')),PNG.sync.read(await page.locator('#studio').screenshot())];
 for(const image of images){let bad=0;for(let y=0;y<86;y++)for(let x=0;x<61;x++)for(let c=0;c<4;c++)if(Math.abs(image.data[((y+647)*1024+x+493)*4+c]-expected[(y*61+x)*4+c])>1)bad++;expect(bad).toBe(0);}
}
test('independent Read source registration, all programs/cues/pixels; rest hover tracking running stop completion',async({page})=>{
 const row=manifest.tables[9383].buttons[15];expect(row.rawWords).toEqual(pins.rows[0].rawWords);expect(row.region).toEqual(pins.rows[0].region);
 expect(Object.keys(pins.programs)).toHaveLength(3);expect(Object.values(pins.programs).flatMap(p=>p.frames)).toHaveLength(4);
 for(const [id,pin]of Object.entries(pins.programs))for(const field of ['frames','events','sounds','tickMs','endCheckTick','sourceSha256','originXY','headerBoundsLTRB'])expect(manifest.scripts[id][field]).toEqual(pin[field]);
 for(const [key,pin]of Object.entries(pins.sprites)){
  const sprite=manifest.sprites[key],argb=readFileSync(`public/original/ui/${sprite.argb}`);expect(createHash('sha256').update(argb).digest('hex')).toBe(pin.argbSha256);
  const image=PNG.sync.read(readFileSync(`public/original/ui/${sprite.image}`)),rgba=Buffer.alloc(argb.length);
  for(let i=0;i<argb.length;i+=4){rgba[i+3]=argb[i];for(let c=0;c<3;c++)rgba[i+c]=argb[i]?Math.min(255,Math.round(argb[i+c+1]*255/argb[i])):0;}
  expect(image.data.equals(rgba)).toBe(true);
 }
 for(const [id,hash]of Object.entries(pins.soundSourceHashes))expect(manifest.sounds[id].sourceSha256).toBe(hash);
 await setup(page);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));
 await page.mouse.move(400,600);await readPixels(page,18238);
 await read(page).hover();await readPixels(page,18240);
 await page.mouse.down();await readPixels(page,18239);await page.clock.runFor(128);await readPixels(page,18239,1);
 await page.mouse.up();await readPixels(page,18239,1); // Shared script 1→2 preserves progress.
 await page.mouse.move(400,600);await readPixels(page,18239,1);
 await read(page).click();await page.mouse.move(400,600);await readPixels(page,18238);
 await read(page).click();await page.evaluate(()=>utterances.at(-1).onend());await page.mouse.move(400,600);await readPixels(page,18238);
});

test('catalog reorder and font preserve Read; explicit voice, range, target and tray changes retire it',async({page})=>{
 await setup(page);await range(page,1,3);await read(page).click();
 await page.evaluate(()=>{platform.engine.getVoices=()=>[{voiceURI:'b',name:'B'},{voiceURI:'a',name:'A'}];platform.engine.dispatchEvent(new Event('voiceschanged'));});
 await expect(read(page)).toHaveAttribute('aria-pressed','true');
 await click(page,'bold');await expect(read(page)).toHaveAttribute('aria-pressed','true');
 await page.locator('#text-voice').selectOption('a');await expect(read(page)).toHaveAttribute('aria-pressed','false');
 await read(page).click();await page.evaluate(()=>{platform.engine.getVoices=()=>[{voiceURI:'b',name:'B'}];platform.engine.dispatchEvent(new Event('voiceschanged'));});
 await expect(read(page)).toBeDisabled();expect(await page.evaluate(()=>calls.filter(c=>c[0]==='cancel').length)).toBe(2);
 await page.locator('#text-voice').selectOption('');await read(page).click();await range(page,0,1);await expect(read(page)).toHaveAttribute('aria-pressed','false');
 await read(page).click();await click(page,'tray:draw');expect(await page.evaluate(()=>calls.filter(c=>c[0]==='cancel').length)).toBe(4);
});
test('stale other-object selection cannot supply Read text; API failure and no history pollution',async({page})=>{
 await setup(page);await page.locator('#paper-canvas').click({position:{x:430,y:330}});await page.locator('.object-text').last().fill('Current');
 await page.locator('.object-text').first().evaluate(node=>{node.contentEditable='false';getSelection().setBaseAndExtent(node.firstChild,1,node.firstChild,3);});
 await read(page).click();expect(await page.evaluate(()=>calls[0])).toEqual(['speak','Current']);
 await page.evaluate(()=>utterances[0].onerror());await expect(read(page)).toHaveAttribute('aria-pressed','false');
 await page.evaluate(()=>{platform.engine.speak=()=>{throw Error('blocked');};});await read(page).click();await expect(read(page)).toHaveAttribute('aria-pressed','false');
 // Speech has not introduced a saved property on either object.
 expect(await page.locator('.object-text').count()).toBe(2);
});
for(const owner of ['Read','Picture'])for(const outcome of ['cancel','commit','failure','commit-failure'])test(`${owner} speech through Firehose ${outcome}`,async({page})=>{
 await setup(page);await page.evaluate(()=>{
  window.speechPaused=false;window.pauseCalls=0;window.resumeCalls=0;
  Object.defineProperty(platform.engine,'paused',{configurable:true,get:()=>speechPaused});
  platform.engine.pause=()=>{pauseCalls++;speechPaused=true;};platform.engine.resume=()=>{resumeCalls++;speechPaused=false;};
 });
 if(owner==='Read')await read(page).click();else await click(page,'play');
 if(outcome==='commit-failure')await page.evaluate(()=>{const root=document.querySelector('#objects'),replace=root.replaceChildren;root.replaceChildren=function(...args){root.replaceChildren=replace;throw Error('commit failure');};});
 if(outcome==='failure')await page.evaluate(()=>{platform.engine.pause=()=>{pauseCalls++;throw Error('pause failure');};});
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));
 await page.locator('#hit-layer [data-action="clear"]').evaluate(b=>b.click());
 if(outcome==='cancel')await page.keyboard.press('Escape');
 else if(outcome==='commit'||outcome==='commit-failure')await page.clock.runFor(2400);
 await expect(page.locator('.firehose-wipe')).toHaveCount(0);
 const calls=await page.evaluate(()=>window.calls);
 expect(calls.filter(c=>c[0]==='speak')).toHaveLength(1);
 expect(calls.filter(c=>c[0]==='cancel')).toHaveLength(owner==='Read'||outcome==='commit'?1:0);
 if(outcome!=='commit')await expect(page.locator('.object-text')).toHaveCount(1);
});

test('@module whole-picture payload order/defaults are unchanged and independent of selection',async({page})=>{
 await setup(page);
 expect(await page.evaluate(async()=>{
  const {createScene}=await import('/src/scene.js');const root=document.createElement('div'),surface=document.createElement('div');document.body.append(root,surface);
  const scene=createScene(root,surface,()=>{});scene.restore([
   {id:'c',kind:'text',text:'third',y:20,x:20,voice:'missing'},
   {id:'b',kind:'text',text:'second',y:20,x:10,voice:'a'},
   {id:'a',kind:'text',text:'first',y:10,x:100},
   {id:'empty',kind:'text',text:'  ',y:0,x:0}]);
  const result=scene.speechPayloads();scene.destroy();root.remove();surface.remove();return result;
 })).toEqual([{text:'first',voiceURI:''},{text:'second',voiceURI:'a'},{text:'third',voiceURI:'missing'}]);
});
test('restore retires Read, delayed end cannot reset the replacement request',async({page})=>{
 await setup(page);await read(page).focus();await read(page).click();await click(page,'undo');await expect(read(page)).toHaveAttribute('aria-pressed','false');
 await click(page,'redo');await page.locator('.object-text').focus();await read(page).click();
 await page.evaluate(()=>{utterances[0].onend();utterances[0].onerror();});await expect(read(page)).toHaveAttribute('aria-pressed','true');
});

test('empty asynchronous catalog, paused synthesis and API absence disable Read without running art',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{platform.engine.getVoices=()=>[];platform.engine.dispatchEvent(new Event('voiceschanged'));});await expect(read(page)).toBeDisabled();
 await page.evaluate(()=>{platform.engine.getVoices=()=>[{voiceURI:'a',name:'A'}];platform.engine.dispatchEvent(new Event('voiceschanged'));});await expect(read(page)).toBeEnabled();
 await page.evaluate(()=>Object.defineProperty(platform.engine,'paused',{configurable:true,get:()=>true}));
 await click(page,'speak');await expect(read(page)).toBeDisabled();expect(await page.evaluate(()=>calls)).toEqual([]);
 await page.evaluate(()=>{Object.defineProperty(platform.engine,'paused',{configurable:true,get:()=>false});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:undefined});});
 await click(page,'speak');await expect(read(page)).toBeDisabled();expect(await page.evaluate(()=>calls)).toEqual([]);
});
test('Read adds no history entries between a format change and its undo',async({page})=>{
 await setup(page);await read(page).focus();await click(page,'bold');await read(page).click();await click(page,'undo');
 await expect(page.locator('.object-text')).toHaveCSS('font-weight','400');
 await expect(read(page)).toHaveAttribute('aria-pressed','false');
});


test('@module canonical editor endpoints roundtrip through trailing breaks and blocks', async ({ page }) => {
 await page.goto('/');
 const results = await page.evaluate(async () => {
  const { editorText } = await import('/src/editor-text.js');
  const { createTextRangeKeeper } = await import('/src/text-range.js');
  const results = [];
  for (const html of ['a<br>', 'a<br>b<br>', '<div>a</div><div>b<br></div>', '<p>a<br></p><p>b</p>']) {
   const root = document.createElement('div');
   root.innerHTML = `<div data-object="test"><div class="object-text" contenteditable="true">${html}</div></div>`;
   document.body.append(root);
   const editor = root.firstChild.firstChild, model = editorText(editor), keeper = createTextRangeKeeper(root);
   editor.focus();
   const mapped = Array.from({ length: model.text.length + 1 }, (_, offset) => model.offset(...model.point(offset)));
   const ranges = [];
   for (const offsets of [[model.text.length, model.text.length], [model.text.length, 0]]) {
    getSelection().setBaseAndExtent(...model.point(offsets[0]), ...model.point(offsets[1]));
    keeper.capture(editor);
    getSelection().removeAllRanges();
    keeper.restore(editor);
    ranges.push(keeper.payload({ id: 'test' }).range);
   }
   results.push({ html, mapped, ranges, length: model.text.length,
    fallback: [-1, model.text.length + 1, 0.4].map(offset => model.offset(...model.point(offset))) });
   root.remove();
  }
  return results;
 });
 for (const result of results) {
  expect(result.mapped, result.html).toEqual(Array.from({ length: result.length + 1 }, (_, i) => i));
  expect(result.ranges, result.html).toEqual([[result.length, result.length], [result.length, 0]]);
  expect(result.fallback, result.html).toEqual([0, result.length, 0]);
 }
});

for (const art of [true, false]) test(`Read preserves backward trailing-break selection through keyboard focus, art ${art}`, async ({ page }) => {
 await setup(page, art);
 await page.locator('.object-text').evaluate(editor => {
  editor.innerHTML = 'a<br>b<br>';
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus();
  getSelection().setBaseAndExtent(editor, 4, editor.childNodes[2], 0);
 });
 await read(page).click();
 expect(await page.evaluate(() => calls)).toEqual([['speak', 'b\n']]);
 await page.keyboard.press('Tab');
 await page.keyboard.press('Shift+Tab');
 await expect(read(page)).toHaveAttribute('aria-pressed', 'true');
 expect(await page.evaluate(() => calls)).toEqual([['speak', 'b\n']]);
 expect(await page.locator('.object-text').evaluate(editor => {
  const selection = getSelection();
  return [selection.anchorNode === editor, selection.anchorOffset,
   selection.focusNode === editor.childNodes[2], selection.focusOffset];
 })).toEqual([true, 4, true, 0]);
});
