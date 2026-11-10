import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const pins = JSON.parse(readFileSync('tests/fixtures/text-clipboard-source.json'));
const manifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const control = (page, action) => page.locator(`[data-action="text-clipboard:${action}"]`);
const canvas = page => page.locator('[data-native-action-motion]');
const click = (page, action) => page.locator(`[data-action="${action}"]`).last().evaluate(b=>b.click());
async function start(page, fallback=false) {
  if(fallback) await page.route('**/secondary-motion/manifest.json*',r=>r.abort());
  await page.addInitScript(()=>{
    window.clipboardCalls=[];
    // Forbidden app API calls fail loudly; ordinary trusted native events remain default.
    for(const name of ['read','readText','write','writeText']) if(navigator.clipboard) Object.defineProperty(navigator.clipboard,name,{value:()=>{window.clipboardCalls.push(name);throw Error('OS clipboard forbidden');}});
    window.cues=[];HTMLMediaElement.prototype.play=function(){window.cues.push(this.src);return Promise.resolve();};
  });
  await page.goto('/');await click(page,'tray:text');
}
async function box(page, text='abcdef',x=140,y=120) {
  await page.locator('#paper-canvas').click({position:{x,y}});
  await page.locator('.object-text').last().fill(text);
}
async function range(page,a,f,index=0) {
  await page.locator('.object-text').nth(index).evaluate((e,[a,f])=>{
    e.focus();getSelection().setBaseAndExtent(e.firstChild,a,e.firstChild,f);
  },[a,f]);
}
const offsets = page => page.evaluate(()=>[getSelection().anchorOffset,getSelection().focusOffset]);
const selectionFingerprint = page => page.evaluate(()=>{
  const selection=getSelection();
  const point=(node,offset)=>{
    const element=node?.nodeType===1?node:node?.parentElement;
    return [element?.closest('[data-object]')?.dataset.object??null,node?.nodeName??null,offset];
  };
  return [point(selection.anchorNode,selection.anchorOffset),point(selection.focusNode,selection.focusOffset)];
});
for(const fallback of [false,true]) for(const [a,f] of [[2,5],[5,2]]) test(`range Copy/Cut/Paste and identity/history; fallback ${fallback}, ${a}:${f}`,async({page})=>{
  await start(page,fallback);await box(page);await range(page,a,f);
  const id=await page.locator('[data-object]').first().getAttribute('data-object');
  await control(page,'copy').click();expect(await offsets(page)).toEqual([a,f]);await expect(page.locator('.object-text')).toBeFocused();
  await control(page,'cut').click();await expect(page.locator('.object-text')).toHaveText('abf');expect(await offsets(page)).toEqual([2,2]);
  await control(page,'paste').click();await expect(page.locator('.object-text')).toHaveText('abcdef');expect(await offsets(page)).toEqual([5,5]);
  await click(page,'undo');await expect(page.locator('.object-text')).toHaveText('abf');expect(await offsets(page)).toEqual([2,2]);
  await click(page,'undo');await expect(page.locator('.object-text')).toHaveText('abcdef');expect(await offsets(page)).toEqual([a,f]);
  await click(page,'redo');await click(page,'redo');expect(await offsets(page)).toEqual([5,5]);
  expect(await page.locator('[data-object]').first().getAttribute('data-object')).toBe(id);
  expect(await page.evaluate(()=>window.clipboardCalls)).toEqual([]);
});
test('two boxes and Grab payload remain separate; all-character Cut keeps box; no-editor/collapsed no-op',async({page})=>{
  await start(page);for(const a of ['cut','copy','paste']) await expect(control(page,a)).toBeDisabled();
  await box(page,'First');await range(page,0,5);await click(page,'edit:copy');await range(page,0,5); // explicit whole-object menu
  await control(page,'cut').click();await expect(page.locator('.object-text')).toHaveText('');await expect(page.locator('[data-object]')).toHaveCount(1);
  for(const a of ['cut','copy']) await expect(control(page,a)).toBeDisabled();
  await box(page,'Other',420,320);await range(page,1,4,1);await control(page,'paste').click();
  await expect(page.locator('.object-text').nth(1)).toHaveText('OFirst r'.replace(' ',''));
  await click(page,'tray:grab');await click(page,'edit:paste');await expect(page.locator('[data-object]')).toHaveCount(3);
  await expect(page.locator('.object-text').last()).toHaveText('First');
});
test('pending typing Cut Paste has three transactions, exact selection and no duplicate blur entry',async({page})=>{
  await start(page);await box(page,'abc');await page.locator('.object-text').blur();await range(page,3,3);
  await page.keyboard.type('def');await range(page,5,2);await control(page,'cut').click();await control(page,'paste').click();
  await page.locator('.object-text').blur();
  for(const [text,selection] of [['abf',[2,2]],['abcdef',[5,2]],['abc',[3,3]]]){
    await click(page,'undo');await expect(page.locator('.object-text')).toHaveText(text);expect(await offsets(page)).toEqual(selection);
  }
  for(const [text,selection] of [['abcdef',[5,2]],['abf',[2,2]],['abcdef',[5,5]]]){
    await click(page,'redo');await expect(page.locator('.object-text')).toHaveText(text);expect(await offsets(page)).toEqual(selection);
  }
});
for(const fallback of [false,true]) for(const input of ['pointer','Space']) for(const change of ['range','text','target','tray','history','document','blur','cancel']) for(const action of ['cut','paste']) test(`held ${input} ${action} rejects ${change}, fallback ${fallback}`,async({page})=>{
  await start(page,fallback);await box(page);await box(page,'Other',420,320);
  let saved;
  if(change==='document') {
    const download=page.waitForEvent('download');await click(page,'save');
    await page.locator('#dialog-actions').getByRole('button',{name:'Save Picture',exact:true}).click();
    saved=readFileSync(await (await download).path());
  }
  await range(page,1,4);await control(page,'copy').click();
  if(input==='pointer'){await control(page,action).hover();await page.mouse.down();}
  else {await control(page,action).focus();await page.keyboard.down('Space');}
  if(change==='range') await range(page,0,2);
  if(change==='text') await page.locator('.object-text').first().evaluate(e=>{e.textContent='Changed';e.dispatchEvent(new InputEvent('input',{bubbles:true}));});
  if(change==='target') await range(page,0,2,1);
  if(change==='tray') await click(page,'tray:grab');
  if(change==='history') await click(page,'undo');
  if(change==='document') { await page.locator('#picture-file').setInputFiles({name:'fresh.kidpix-web',mimeType:'application/json',buffer:saved}); await expect(control(page,'paste')).toBeDisabled(); }
  if(change==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(change==='cancel') await page.keyboard.press('Escape');
  const before=await page.locator('.object-text').allTextContents(), beforeSelection=await selectionFingerprint(page);
  if(input==='pointer')await page.mouse.up();else await page.keyboard.up('Space');
  expect(await page.locator('.object-text').allTextContents()).toEqual(before);
  expect(await selectionFingerprint(page)).toEqual(beforeSelection);
  expect(await page.evaluate(()=>window.clipboardCalls)).toEqual([]);
});

// Source modules are intentionally separate from built-app coverage.
test('@module BR/block/multinode directional canonical offsets and Unicode',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createTextClipboard}=await import('/src/text-clipboard.js');
    const {editorText}=await import('/src/editor-text.js');
    const e=document.createElement('div');e.contentEditable='true';e.innerHTML='A<span>😀</span><br><div>B</div><p>C<br></p>';document.body.append(e);e.focus();
    const model=editorText(e),published=[],changes=[];
    const c=createTextClipboard({current:()=>({id:'A',editor:e,revision:1,editable:true}),publish:p=>{published.push(p);return true;},replace:(t,n)=>{changes.push(n);return true;}});
    getSelection().setBaseAndExtent(...model.point(6),...model.point(2));c.perform('copy');const token=c.target();c.perform('cut',token);
    return {text:model.text,published,changes,range:[token.anchor,token.focus]};
  });
  expect(result.text).toBe('A😀\nB\nC\n');expect(result.published[0].text).toBe('😀\nB\n');expect(result.range).toEqual([6,2]);
  expect(result.changes[0]).toEqual({text:'AC\n',anchor:1,focus:1});
});

async function expectProgram(page,action,script,frameIndex=0) {
 const state=await canvas(page).evaluate((c,a)=>JSON.parse(c.dataset.motionSnapshot).find(s=>s.name===`text-clipboard:${a}`),action);
 expect([state.script,state.frameIndex]).toEqual([script,frameIndex]);
}
async function preservedFields(page) {
 const image=PNG.sync.read(await page.locator('#studio').screenshot());
 // Read and existing font/size/voice browser controls are outside clipboard ownership.
 return [[145,651,231,96],[493,647,61,86],[620,659,155,63]].map(([x,y,w,h])=>{
  const data=Buffer.alloc(w*h*4);
  for(let row=0;row<h;row++)image.data.copy(data,row*w*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+w)*4);
  return createHash('sha256').update(data).digest('hex');
 });
}
async function pixels(page) {
  const states = await canvas(page).evaluate(c=>JSON.parse(c.dataset.motionSnapshot).filter(s=>s.name.startsWith('text-clipboard:')));
  const expected = PNG.sync.read(readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`));
  const actual = PNG.sync.read(Buffer.from((await canvas(page).evaluate(c=>c.toDataURL())).split(',')[1],'base64'));
  const studio=PNG.sync.read(await page.locator('#studio').screenshot());
  const backdrop=[113,608,817,168]; // independently audited retained Text backdrop
  let out=Buffer.alloc(82*86*4);
  for(let y=647;y<733;y++) for(let x=409;x<491;x++) expected.data.copy(out,((y-647)*82+x-409)*4,((y-backdrop[1])*expected.width+x-backdrop[0])*4,((y-backdrop[1])*expected.width+x-backdrop[0])*4+4);
  for(const state of states) for(const part of pins.programs[state.script].frames[state.frameIndex].parts){
    const key=`18000:${part.sprite}`,sprite=PNG.sync.read(readFileSync(`public/original/ui/${manifest.sprites[key].image}`));
    for(let sy=0;sy<sprite.height;sy++) for(let sx=0;sx<sprite.width;sx++){
      const i=(sy*sprite.width+sx)*4,j=((part.y+sy-647)*82+part.x+sx-409)*4,a=sprite.data[i+3]/255;
      for(let c=0;c<3;c++)out[j+c]=Math.round(sprite.data[i+c]*a+out[j+c]*(1-a));out[j+3]=255;
    }
  }
  if(test.info().project.use.browserName === 'webkit') {
    // Same independently pinned layers; use this engine's Canvas rounding only.
    const layers=[{ png:PNG.sync.write(expected).toString('base64'),x:backdrop[0]-409,y:backdrop[1]-647 },
      ...states.flatMap(state=>pins.programs[state.script].frames[state.frameIndex].parts.map(part=>({
        png:readFileSync(`public/original/ui/${manifest.sprites[`18000:${part.sprite}`].image}`).toString('base64'),x:part.x-409,y:part.y-647,
      })))];
    const data=await page.evaluate(async layers=>{
      const c=document.createElement('canvas');c.width=82;c.height=86;const ctx=c.getContext('2d');
      for(const layer of layers){const image=new Image();image.src=`data:image/png;base64,${layer.png}`;await image.decode();ctx.drawImage(image,layer.x,layer.y);}
      return c.toDataURL();
    },layers);
    out=PNG.sync.read(Buffer.from(data.split(',')[1],'base64')).data;
  }
  let bad=0;
  for(let y=647;y<733;y++)for(let x=409;x<491;x++)for(let c=0;c<4;c++){
    const e=out[((y-647)*82+x-409)*4+c];for(const image of [actual,studio]) if(Math.abs(image.data[(y*1024+x)*4+c]-e)>1)bad++;
  }
  expect(bad).toBe(0);
}
test('all source rows/programs/registrations/sprites and real visible rest/hover/tracking pixels',async({page})=>{
  for(const row of pins.rows){const actual=manifest.tables[9383].buttons[row.index];expect(actual.rawWords).toEqual(row.rawWords);expect(actual.region).toEqual(row.region);}
  expect(Object.keys(pins.programs)).toHaveLength(9);expect(Object.keys(pins.sprites)).toHaveLength(9);
  for(const [id,pin] of Object.entries(pins.programs)) for(const key of ['tickMs','endCheckTick','frames','sounds','events','sourceSha256']) expect(manifest.scripts[id][key]).toEqual(pin[key]);
  for(const [id,hash] of Object.entries(pins.soundSourceHashes)) expect(manifest.sounds[id].sourceSha256).toBe(hash);
  for(const [key,pin] of Object.entries(pins.sprites)){
    const image=PNG.sync.read(readFileSync(`public/original/ui/${manifest.sprites[key].image}`));
    const argb=readFileSync(`public/original/ui/${manifest.sprites[key].argb}`);
    expect(createHash('sha256').update(argb).digest('hex')).toBe(pin.argbSha256);
    expect([image.width,image.height]).toEqual([pin.width,pin.height]);
    const rgba=Buffer.alloc(argb.length);for(let i=0;i<argb.length;i+=4){rgba[i+3]=argb[i];for(let c=0;c<3;c++)rgba[i+c]=argb[i]?Math.min(255,Math.round(argb[i+c+1]*255/argb[i])):0;}
    expect(image.data.equals(rgba)).toBe(true);
  }
  const clean=PNG.sync.read(readFileSync(`public/original/ui/${manifest.backdrops.text.pages[0].image}`));
  expect(createHash('sha256').update(clean.data).digest('hex')).toBe('455373eaa3f21b2246f50fa7f398abdc4dcfdefc040d6891183220b3eb92d654');
  await start(page);await box(page);await range(page,1,4);await control(page,'copy').click();
  await expect(canvas(page)).toBeVisible();
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));
  const ids={cut:[18191,18192,18193],copy:[18185,18186,18187],paste:[18188,18189,18190]};
  const cueCount=(page,id)=>page.evaluate(id=>window.cues.filter(s=>new URL(s,location.href).pathname.endsWith(`/${id}.wav`)).length,id);
  for(const [action,cue] of [['cut',18071],['copy',18059],['paste',18060]]){
    await range(page,1,4);await page.mouse.move(400,600);await page.clock.runFor(16);await expectProgram(page,action,ids[action][0]);await pixels(page);
    const preserved=await preservedFields(page);
    await control(page,action).hover();await page.clock.runFor(16);await expectProgram(page,action,ids[action][2]);await pixels(page);
    const before=await cueCount(page,cue);
    await page.mouse.down();await expectProgram(page,action,ids[action][1]);await pixels(page);await page.clock.runFor(99);
    expect(await cueCount(page,cue)).toBe(before);
    await page.clock.runFor(29);await expectProgram(page,action,ids[action][1],1);await pixels(page);
    const snapshot=await canvas(page).evaluate((c,a)=>JSON.parse(c.dataset.motionSnapshot).find(s=>s.name===`text-clipboard:${a}`),action);
    expect(snapshot.frameIndex).toBe(1);expect(snapshot.state).toBe(1);
    await page.clock.runFor(300);expect(await cueCount(page,cue)).toBe(before+1);
    await page.mouse.move(400,600);await page.mouse.up();await page.clock.runFor(16);await expectProgram(page,action,ids[action][0]);await pixels(page);
    expect(await preservedFields(page)).toEqual(preserved);
    await expect(page.locator('.object-text')).toHaveText('abcdef');
  }
});
test('x449 browser overlap activates Copy once and leaves characters/Read/other owner unchanged',async({page})=>{
  await start(page);await box(page);await range(page,1,4);
  expect(await page.evaluate(()=>document.elementFromPoint(449,665)?.closest('[data-action]')?.dataset.action)).toBe('text-clipboard:copy');
  await page.mouse.click(449,665);await expect(page.locator('.object-text')).toHaveText('abcdef');
  await expect(control(page,'paste')).toBeEnabled();await expect(page.locator('[data-action="speak"]')).toHaveAttribute('aria-pressed','false');
});
test('source media failure falls back, preserves range, and a retry keeps the held owner safe',async({page})=>{
  let fail=true,failed=0,releaseRetry;
  const retryGate=new Promise(resolve=>{releaseRetry=resolve;});
  await page.route('**/secondary-motion/sprites/18000-601.png*',async route=>{
    if(fail){failed++;return route.abort();}
    await retryGate;return route.continue();
  });
  try {
    await start(page);await box(page);await range(page,1,4);
    await control(page,'copy').click();expect(await offsets(page)).toEqual([1,4]);
    expect(failed).toBeGreaterThan(0);await expect(canvas(page)).toBeHidden();
    fail=false;await control(page,'cut').hover();await page.mouse.down();
    await page.mouse.move(400,600);releaseRetry();await expect(canvas(page)).toBeVisible();
    await page.mouse.up();await expectProgram(page,'cut',18191);
    await expect(page.locator('.object-text')).toHaveText('abcdef');
    await control(page,'cut').click();await expect(page.locator('.object-text')).toHaveText('aef');
  } finally { releaseRetry(); }
});
for(const backward of [false,true]) test(`built app BR/multinode/Unicode range and caret replacement, backward ${backward}`,async({page})=>{
  await start(page);await box(page);
  await page.locator('.object-text').evaluate((e,backward)=>{
    e.innerHTML='A<span>😀</span><br><span>B</span><br>C';
    e.dispatchEvent(new InputEvent('input',{bubbles:true}));e.focus();
    const pair=e.children[0].firstChild,b=e.children[2].firstChild;
    if(backward)getSelection().setBaseAndExtent(b,1,pair,1);else getSelection().setBaseAndExtent(pair,1,b,1);
  },backward);
  await control(page,'copy').click();
  await control(page,'cut').click();await expect(page.locator('.object-text')).toHaveText('A\nC');expect(await offsets(page)).toEqual([1,1]);
  await control(page,'paste').click();await expect(page.locator('.object-text')).toHaveText('A😀\nB\nC');expect(await offsets(page)).toEqual([5,5]);
});
test('document clipboard survives tray/box switching and clears on New and Open; project omits clipboard',async({page})=>{
  await start(page);await box(page);await range(page,1,4);await control(page,'copy').click();
  await click(page,'tray:grab');await click(page,'tray:text');await range(page,0,0);
  await control(page,'paste').click();await expect(page.locator('.object-text')).toHaveText('bcdabcdef');
  const download=page.waitForEvent('download');await click(page,'save');await page.locator('#dialog-actions').getByRole('button',{name:'Save Picture',exact:true}).click();
  const saved=readFileSync(await (await download).path());expect(saved.toString()).not.toContain('textClipboard');
  await page.locator('#picture-file').setInputFiles({name:'saved.kidpix-web',mimeType:'application/json',buffer:saved});
  await range(page,0,0);await expect(control(page,'paste')).toBeDisabled();
  await range(page,1,3);await control(page,'copy').click();await click(page,'new');await page.locator('#dialog-actions').getByRole('button',{name:'New Picture',exact:true}).click();
  await click(page,'tray:text');await box(page,'Fresh');await range(page,0,0);await expect(control(page,'paste')).toBeDisabled();
});
test('Read retires on range mutation, Undo never restarts it, and Copy has no speech side effect',async({page})=>{
  await page.addInitScript(()=>{
    window.speechCalls=[];window.retainedSpeech=[];
    speechSynthesis.getVoices=()=>[{voiceURI:'a',name:'A',lang:'en-US'}];
    speechSynthesis.speak=u=>{window.speechCalls.push(['speak',u.text]);window.retainedSpeech.push(u);};speechSynthesis.cancel=()=>window.speechCalls.push(['cancel']);
  });
  await start(page);await box(page);await range(page,1,4);await page.locator('[data-action="speak"]').click();
  await expect(page.locator('[data-action="speak"]')).toHaveAttribute('aria-pressed','true');
  const before=await page.evaluate(()=>window.speechCalls.length);await control(page,'copy').click();expect(await page.evaluate(()=>window.speechCalls.length)).toBe(before);
  await control(page,'cut').click();await expect(page.locator('[data-action="speak"]')).toHaveAttribute('aria-pressed','false');
  await click(page,'undo');expect(await page.evaluate(()=>window.speechCalls.filter(c=>c[0]==='speak').length)).toBe(1);
});
for(const action of ['text-clipboard:paste','bold']) test(`@module clipboard generation cancels only held Paste, ${action}`,async({page})=>{
  await page.goto('/');await page.evaluate(async action=>{
    const {createTextClipboard}=await import('/src/text-clipboard.js');const {guardStepperInput}=await import('/src/stepper-input.js');
    const {actionTarget}=await import('/src/native-action-motion.js');
    const root=document.createElement('div'),e=document.createElement('div'),b=document.createElement('button');
    e.contentEditable='true';e.textContent='Example';b.dataset.action=action;b.textContent='Action';root.append(e,b);document.body.append(root);
    e.focus();getSelection().setBaseAndExtent(e.firstChild,0,e.firstChild,3);
    const c=createTextClipboard({current:()=>({id:'A',editor:e,revision:1,editable:true}),replace:()=>true});c.perform('copy');
    window.generationCalls=[];window.changeTextClipboard=()=>c.perform('copy');
    guardStepperInput(root,{actions:[action],getTarget:a=>actionTarget({target:'A',textIdentity:JSON.stringify(c.target()),textClipboardGeneration:c.generation},a),activate:a=>window.generationCalls.push(a)});
    b.id='generation-action';
  },action);
  await page.locator('#generation-action').focus();await page.keyboard.down('Space');await page.evaluate(()=>window.changeTextClipboard());await page.keyboard.up('Space');
  expect(await page.evaluate(()=>window.generationCalls)).toEqual(action==='bold'?['bold']:[]);
});


test('wipe Undo/Redo preserves text copied afterward', async ({ page }) => {
 await start(page);await box(page,'Old picture');
 await page.locator('.object-text').blur();
 await page.locator('#hit-layer [data-action="clear"]').evaluate(button => button.click());
 await expect(page.locator('.firehose-wipe')).toBeVisible();
 await expect(page.locator('.firehose-wipe')).toHaveCount(0);
 await expect(page.locator('.object-text')).toHaveCount(0);
 await box(page,'Fresh');await range(page,0,5);await control(page,'copy').click();
 await click(page,'undo');await expect(page.locator('.object-text')).toHaveCount(0);
 await click(page,'undo');await expect(page.locator('.object-text')).toHaveText('Old picture');
 await range(page,0,0);await expect(control(page,'paste')).toBeEnabled();
 await click(page,'redo');await expect(page.locator('.object-text')).toHaveCount(0);
 await click(page,'redo');await expect(page.locator('.object-text')).toHaveText('Fresh');
 await range(page,5,5);await control(page,'paste').click();
 await expect(page.locator('.object-text')).toHaveText('FreshFresh');
});


test('Escape cancels a source Read pointer while picture text retains focus',async({page})=>{
  await page.addInitScript(()=>{
    window.cancelReadCalls=[];
    window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    speechSynthesis.getVoices=()=>[{voiceURI:'a',name:'A'}];
    speechSynthesis.speak=utterance=>window.cancelReadCalls.push(utterance.text);
    speechSynthesis.cancel=()=>{};
  });
  await start(page);await box(page);await range(page,1,4);
  await expect(canvas(page)).toBeVisible();
  const read=page.locator('[data-action="speak"]');
  await read.hover();await page.mouse.down();
  await expect(page.locator('.object-text')).toBeFocused();
  await page.keyboard.press('Escape');await page.mouse.up();
  expect(await page.evaluate(()=>window.cancelReadCalls)).toEqual([]);
  await expect(read).toHaveAttribute('aria-pressed','false');
  expect(await offsets(page)).toEqual([1,4]);
});
