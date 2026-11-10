import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const pins = JSON.parse(readFileSync('tests/fixtures/text-voice-source.json'));
const manifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const control = (page, direction) => page.locator(`[data-action="voice-step:${direction}"]`);
const select = page => page.locator('#text-voice');
const canvas = page => page.locator('[data-native-action-motion]');
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(b=>b.click());
async function model(page, initial = ['a','b','c']) {
  await page.addInitScript(uris => {
    // Keep native platform wrappers strongly reachable for all asynchronous events.
    window.voicePlatform = { synth: window.speechSynthesis, utterance: window.SpeechSynthesisUtterance };
    let list = uris.map(voiceURI=>({voiceURI,name:'Same name',lang:'en-US'}));
    window.voicePlatform.synth.getVoices = () => list;
    window.refreshVoices = uris => { list=uris.map(voiceURI=>({voiceURI,name:'Same name',lang:'en-US'})); window.voicePlatform.synth.dispatchEvent(new Event('voiceschanged')); };
    window.speechCalls = [];
    window.voicePlatform.synth.speak = utterance => window.speechCalls.push(['speak',utterance.text]);
    window.voicePlatform.synth.cancel = () => window.speechCalls.push(['cancel']);
  },initial);
}
async function start(page, initial) {
  await model(page, initial); await page.goto('/'); await click(page,'tray:text'); await expect(canvas(page)).toBeVisible();
}
async function object(page) {
  await start(page); await page.locator('#paper-canvas').click({position:{x:150,y:140}}); await page.locator('.object-text').fill('Second');
}
const refresh = (page, list) => page.evaluate(list=>window.refreshVoices(list),list);
test('async catalog, raw order, duplicate names/URIs, missing saved URI and explicit Default',async({page})=>{
  await start(page,[]);
  await expect(control(page,1)).toBeDisabled(); await refresh(page,['c','b','a']);
  await expect(control(page,1)).toBeDisabled(); await select(page).selectOption('b');
  await control(page,1).click(); await expect(select(page)).toHaveValue('a');
  await refresh(page,['a','c','b']); await control(page,1).click(); await expect(select(page)).toHaveValue('c');
  await refresh(page,['a']); await expect(select(page)).toHaveValue('c'); await expect(select(page).locator('option:checked')).toContainText('unavailable');
  await refresh(page,['c']); await expect(control(page,1)).toBeDisabled(); await expect(control(page,-1)).toBeDisabled();
  await refresh(page,['a','c','c','b']); await expect(control(page,1)).toBeDisabled(); await expect(control(page,-1)).toBeDisabled();
  await refresh(page,['a','c','b']); await control(page,1).click(); await expect(select(page)).toHaveValue('b');
  await select(page).selectOption(''); await expect(control(page,-1)).toBeDisabled();
  expect(await page.evaluate(()=>window.speechCalls)).toEqual([]);
});
test('catalog notification retains native select DOM, focus and menu options until blur',async({page})=>{
  await object(page); await select(page).focus(); await select(page).evaluate(node=>window.heldSelect=node);
  await refresh(page,['c','b','a','d']);
  await expect(select(page)).toBeFocused(); expect(await select(page).evaluate(node=>node===window.heldSelect)).toBe(true);
  await expect(select(page).locator('option')).toHaveCount(4);
  await select(page).press('ArrowDown'); await expect(select(page)).toHaveValue('a');
  await select(page).press('Tab'); await expect(select(page).locator('option')).toHaveCount(5);
});
for (const art of [true,false]) for (const input of ['pointer','Space']) test(`held ${input} cancelled by generation before RAF, art ${art}`,async({page})=>{
  if(!art) await page.route('**/secondary-motion/manifest.json',route=>route.abort());
  if(art) await object(page); else {await model(page);await page.goto('/');await click(page,'tray:text');}
  await select(page).selectOption('b');
  if(input==='pointer'){await control(page,1).hover();await page.mouse.down();}
  else {await control(page,1).focus();await page.keyboard.down('Space');}
  await page.evaluate(()=> {window.refreshVoices(['c','b','a']);});
  if(input==='pointer') await page.mouse.up(); else await page.keyboard.up('Space');
  await expect(select(page)).toHaveValue('b');
  await control(page,1).click(); await expect(select(page)).toHaveValue('a');
});
for (const [anchor,focus] of [[1,5],[5,1],[3,3]]) test(`voice selected object history/save and range ${anchor}:${focus}`,async({page})=>{
  await object(page); await select(page).selectOption('a');
  await page.locator('.object-text').evaluate((node,[a,f])=>{node.focus();getSelection().setBaseAndExtent(node.firstChild,a,node.firstChild,f);},[anchor,focus]);
  await control(page,1).click();
  expect(await page.evaluate(()=>[getSelection().anchorOffset,getSelection().focusOffset])).toEqual([anchor,focus]);
  await click(page,'undo'); await expect(select(page)).toHaveValue('a');
  await click(page,'redo'); await expect(select(page)).toHaveValue('b');
  await page.locator('#paper-canvas').click({position:{x:420,y:320}});await page.locator('.object-text').last().fill('Other');
  await select(page).selectOption('c'); await page.locator('.object-text').first().focus();await expect(select(page)).toHaveValue('b');
  const download=page.waitForEvent('download');await click(page,'save');await page.locator('#dialog-actions').getByRole('button',{name:'Save Picture',exact:true}).click();const saved=await download; const path=await saved.path();
  const doc=JSON.parse(readFileSync(path));expect(doc.objects.map(o=>o.voice)).toEqual(['b','c']);
  await page.locator('#picture-file').setInputFiles({name:'saved.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.locator('.object-text').first().focus();await expect(select(page)).toHaveValue('b');
  expect(await page.evaluate(()=>window.speechCalls)).toEqual([]);
});
test('absent speech API retains an operable explicit fallback and missing saved URI',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{value:undefined}));
  await page.goto('/');await click(page,'tray:text');await expect(select(page)).toHaveValue('');await expect(control(page,1)).toBeDisabled();
  await select(page).focus();await expect(select(page)).toBeFocused();
});

// All expected voice programs and sprite hashes below come from the independent
// archive audit, never from the runtime manifest under test.
async function pixels(page) {
  const states = await canvas(page).evaluate(c=>JSON.parse(c.dataset.motionSnapshot).filter(s=>s.name.startsWith('voice-step:')));
  const expected = PNG.sync.read(readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`));
  const actual = PNG.sync.read(Buffer.from((await canvas(page).evaluate(c=>c.toDataURL())).split(',')[1],'base64'));
  const studio=PNG.sync.read(await page.locator('#studio').screenshot());
  const backdrop=[113,608,817,168]; // independently audited retained Text backdrop
  let out=Buffer.alloc(43*62*4);
  for(let y=659;y<721;y++) for(let x=731;x<774;x++) expected.data.copy(out,((y-659)*43+x-731)*4,((y-backdrop[1])*expected.width+x-backdrop[0])*4,((y-backdrop[1])*expected.width+x-backdrop[0])*4+4);
  for(const state of states) for(const part of pins.programs[state.script].frames[state.frameIndex].parts){
    const key=`18000:${part.sprite}`,sprite=PNG.sync.read(readFileSync(`public/original/ui/${manifest.sprites[key].image}`));
    for(let sy=0;sy<sprite.height;sy++) for(let sx=0;sx<sprite.width;sx++){
      const i=(sy*sprite.width+sx)*4,j=((part.y+sy-659)*43+part.x+sx-731)*4,a=sprite.data[i+3]/255;
      for(let c=0;c<3;c++)out[j+c]=Math.round(sprite.data[i+c]*a+out[j+c]*(1-a));out[j+3]=255;
    }
  }
  if(test.info().project.use.browserName === 'webkit') {
    // Same independently pinned layers; use this engine's Canvas rounding only.
    const layers=[{ png:PNG.sync.write(expected).toString('base64'),x:backdrop[0]-731,y:backdrop[1]-659 },
      ...states.flatMap(state=>pins.programs[state.script].frames[state.frameIndex].parts.map(part=>({
        png:readFileSync(`public/original/ui/${manifest.sprites[`18000:${part.sprite}`].image}`).toString('base64'),x:part.x-731,y:part.y-659,
      })))];
    const data=await page.evaluate(async layers=>{
      const c=document.createElement('canvas');c.width=43;c.height=62;const ctx=c.getContext('2d');
      for(const layer of layers){const image=new Image();image.src=`data:image/png;base64,${layer.png}`;await image.decode();ctx.drawImage(image,layer.x,layer.y);}
      return c.toDataURL();
    },layers);
    out=PNG.sync.read(Buffer.from(data.split(',')[1],'base64')).data;
  }
  let bad=0;
  for(let y=659;y<721;y++)for(let x=731;x<774;x++)for(let c=0;c<4;c++){
    const e=out[((y-659)*43+x-731)*4+c];for(const image of [actual,studio]) if(Math.abs(image.data[(y*1024+x)*4+c]-e)>1)bad++;
  }
  expect(bad).toBe(0);
}
test('independent full source voice programs, cue/end gates, sprite pins and real studio poses',async({page})=>{
  for(const row of pins.rows) { const actual=manifest.tables[9383].buttons[row.index];expect(actual.rawWords).toEqual(row.rawWords);expect(actual.region).toEqual(row.region); }
  for(const [id,pin] of Object.entries(pins.programs)){
    const clip=manifest.scripts[id];for(const key of ['tickMs','endCheckTick','sounds','frames','sourceSha256','events'])expect(clip[key]).toEqual(pin[key]);
  }
  for(const [key,pin]of Object.entries(pins.sprites)){
    const image=PNG.sync.read(readFileSync(`public/original/ui/${manifest.sprites[key].image}`));
    const argb=readFileSync(`public/original/ui/${manifest.sprites[key].argb}`);expect(createHash('sha256').update(argb).digest('hex')).toBe(pin.argbSha256);
    const rgba=Buffer.alloc(argb.length);
    for(let i=0;i<argb.length;i+=4){rgba[i+3]=argb[i];for(let c=0;c<3;c++)rgba[i+c]=argb[i]?Math.min(255,Math.round(argb[i+c+1]*255/argb[i])):0;}
    expect(image.data.equals(rgba), key+' PNG decoded against independent premultiplied source pin').toBe(true);
  }
  for(const [id,hash] of Object.entries(pins.sounds)) expect(manifest.sounds[id].sourceSha256).toBe(hash);
  const clean=PNG.sync.read(readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`));
  expect(createHash('sha256').update(clean.data).digest('hex')).toBe('455373eaa3f21b2246f50fa7f398abdc4dcfdefc040d6891183220b3eb92d654');
  await object(page); await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));
  for(const direction of [-1,1]){
    await select(page).selectOption('b');await control(page,direction).hover();await page.clock.runFor(16);await pixels(page);
    await page.mouse.down();await pixels(page);await page.clock.runFor(128);await pixels(page);
    expect(await canvas(page).evaluate((c,d)=>JSON.parse(c.dataset.motionSnapshot).find(s=>s.name===`voice-step:${d}`).frameIndex,direction)).toBe(1);
    await page.mouse.move(400,600);await pixels(page);await page.mouse.up();await page.clock.runFor(16);await pixels(page);
  }
  for(const uri of ['a','c']){await select(page).selectOption(uri);await page.clock.runFor(16);await pixels(page);}
});
for(const input of ['pointer','Space']) test(`target change cancels held ${input} before RAF`,async({page})=>{
  await object(page);await select(page).selectOption('a');
  await page.locator('#paper-canvas').click({position:{x:420,y:320}});await page.locator('.object-text').last().fill('Other');await select(page).selectOption('b');
  if(input==='pointer'){await control(page,1).hover();await page.mouse.down();}else{await control(page,1).focus();await page.keyboard.down('Space');}
  // The focus event changes Scene's authoritative target synchronously.
  await page.locator('.object-text').first().focus();
  if(input==='pointer')await page.mouse.up();else await page.keyboard.up('Space');
  await expect(select(page)).toHaveValue('a');await page.locator('.object-text').last().focus();await expect(select(page)).toHaveValue('b');
});
test('voice art failure remains static and usable, retries on tray reentry',async({page})=>{
  await page.route('**/secondary-motion/sprites/18000-451.argb',route=>route.abort());
  await model(page);await page.goto('/');await click(page,'tray:text');await select(page).selectOption('b');
  await expect(canvas(page)).not.toBeVisible();await control(page,1).click();await expect(select(page)).toHaveValue('c');
  await page.unroute('**/secondary-motion/sprites/18000-451.argb');await click(page,'tray:draw');await click(page,'tray:text');await expect(canvas(page)).toBeVisible();
});
test('missing restored URI returns without mutation or history; direct select retains backward range',async({page})=>{
  await start(page,[]);
  await page.locator('#picture-file').setInputFiles({name:'missing.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    version:1,format:'kidpix-web',paint:{version:1},objects:[{id:'saved',kind:'text',x:100,y:100,width:235,height:100,text:'Second',font:'serif',size:32,color:'#000',voice:'saved'}]
  }))});
  await page.locator('.object-text').focus();await expect(select(page)).toHaveValue('saved');await expect(select(page).locator('option:checked')).toContainText('unavailable');
  await refresh(page,['saved','other']);await expect(select(page)).toHaveValue('saved');await expect(control(page,1)).toBeEnabled();
  await expect(page.locator('[data-action="undo"]').first()).toHaveAttribute('aria-disabled','true');
  await page.locator('.object-text').evaluate(node=>{node.focus();getSelection().setBaseAndExtent(node.firstChild,5,node.firstChild,1);});
  await select(page).click();await select(page).selectOption('other');await expect(select(page)).toBeFocused();
  await page.locator('.object-text').focus();expect(await page.evaluate(()=>[getSelection().anchorOffset,getSelection().focusOffset])).toEqual([5,1]);
  await page.keyboard.type('Z');await expect(page.locator('.object-text')).toHaveText('SZd');
});
for(const art of [true,false])test(`first pointer owns held voice action, art ${art}`,async({page})=>{
  if(!art)await page.route('**/secondary-motion/manifest.json',route=>route.abort());
  await model(page);await page.goto('/');await click(page,'tray:text');if(art)await expect(canvas(page)).toBeVisible();
  await select(page).selectOption('b');await control(page,1).hover();await page.mouse.down();
  await control(page,-1).dispatchEvent('pointerdown',{pointerId:99,button:0,isPrimary:false});
  await control(page,-1).dispatchEvent('pointerup',{pointerId:99,button:0,isPrimary:false});
  await control(page,-1).evaluate(node=>node.dispatchEvent(new PointerEvent('click',{bubbles:true,pointerId:99,detail:1,button:0})));
  await expect(select(page)).toHaveValue('b');await page.mouse.up();await expect(select(page)).toHaveValue('c');
});
test('static fallback selection and history synchronize without an animation RAF owner',async({page})=>{
  await page.route('**/secondary-motion/manifest.json',route=>route.abort());await model(page);await page.goto('/');await click(page,'tray:text');
  await page.locator('#paper-canvas').click({position:{x:150,y:140}});await page.locator('.object-text').fill('First');await select(page).selectOption('a');
  await page.locator('#paper-canvas').click({position:{x:420,y:320}});await page.locator('.object-text').last().fill('Other');await select(page).selectOption('b');
  await click(page,'undo');await expect(select(page)).toHaveValue('a');await click(page,'redo');await expect(select(page)).toHaveValue('b');
  await page.locator('.object-text').first().focus();await expect(select(page)).toHaveValue('a');await page.locator('.object-text').last().focus();await expect(select(page)).toHaveValue('b');
});
