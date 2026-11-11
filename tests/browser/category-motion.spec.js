import { canonicalMotionFrame } from './canonical-motion-frame.js';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

// Independent registered-pixel compositor; no application/controller imports.
const manifest = JSON.parse(readFileSync('artifacts/t3/library-category-motion/delta/ui/secondary-motion/manifest.json'));
const fixtureSource=JSON.parse(readFileSync('tests/fixtures/library-category-source.json'));
import {existsSync} from 'node:fs';
const png = path => { const staged=`artifacts/t3/library-category-motion/delta/ui/${path}`;return PNG.sync.read(readFileSync(existsSync(staged)?staged:`public/original/ui/${path}`)); };
const profiles={arrows:[18901,[1,2],[320,690,43,62]]};
const actor = (page,name) => page.locator('[data-native-category-motion]');
const control = (page,action) => page.locator(`#library-tray [data-action="${action}"]`);
const snap = (page,name) => actor(page,name).evaluate(c => JSON.parse(c.dataset.motionSnapshot));
const click = (page,action) => control(page,action).evaluate(b => b.click());
const seen = new Set();
test.beforeAll(async({browser,browserName})=>console.log(JSON.stringify({categoryBrowser:browserName,version:browser.version()})));
function compose(bounds, poses) {
  const [left,top,width,height] = bounds, out = new PNG({width,height});
  function overlay(src,x,y,clip) {
    for(let sy=0;sy<src.height;sy++) for(let sx=0;sx<src.width;sx++) {
      const dx=x+sx,dy=y+sy;
      if(dx<left||dy<top||dx>=left+width||dy>=top+height||dy>=768
        || (clip && (dx<clip[0]||dy<clip[1]||dx>=clip[0]+clip[2]||dy>=clip[1]+clip[3]))) continue;
      const a=(sy*src.width+sx)*4,b=((dy-top)*width+dx-left)*4,alpha=src.data[a+3]/255;
      const result=alpha+out.data[b+3]/255*(1-alpha);
      for(let c=0;c<3;c++) out.data[b+c]=result?Math.round((src.data[a+c]*alpha+out.data[b+c]*out.data[b+3]/255*(1-alpha))/result):0;
      out.data[b+3]=Math.round(result*255);
    }
  }
  overlay(png('paint-empty.png'),0,0);
  const backdrop=manifest.backdrops['library-category'];
  overlay(png(backdrop.pages[0].image),backdrop.rect[0],backdrop.rect[1]);
  for(const pose of poses) {
    const script=manifest.scripts[pose.script];
    for(const part of script.frames[pose.frameIndex].parts) {
      overlay(png(manifest.sprites[`${script.collection}:${part.sprite}`].image),part.x,part.y,pose.clip);
    }
  }
  return out;
}
async function pixels(page,name) {
  const states=await snap(page,name),[table,rows,bounds]=profiles[name];
  const buttons=manifest.tables[table].buttons.filter(b=>rows.includes(b.index));
  const expected=compose(bounds,states.map((s,i)=>({...s,clip:s.auxiliary?buttons[i].auxiliaryClipRect:null})));
  const actual=PNG.sync.read(Buffer.from((await canonicalMotionFrame(actor(page,name))).split(',')[1],'base64'));
  const studio=PNG.sync.read(await page.locator('#studio').screenshot());
  expect([studio.width,studio.height]).toEqual([1024,768]);
  let bad=0,visible=0,outside=0;
  for(let y=0;y<768;y++) for(let x=0;x<1024;x++) {
    const a=(y*1024+x)*4;
    if(x<bounds[0]||y<bounds[1]||x>=bounds[0]+bounds[2]||y>=bounds[1]+bounds[3]) {if(actual.data[a+3]) outside++;continue;}
    const b=((y-bounds[1])*bounds[2]+x-bounds[0])*4;
    for(let c=0;c<4;c++) {
      if(Math.abs(actual.data[a+c]-expected.data[b+c])>1) bad++;
      if(expected.data[b+3]===255&&Math.abs(studio.data[a+c]-expected.data[b+c])>1) visible++;
    }
  }
  expect({bad,visible,outside},`${name} complete footprint, vacated pixels, visible studio`).toEqual({bad:0,visible:0,outside:0});
  states.forEach(s=>seen.add(`${s.script}:${s.frameIndex}`));
}
async function fixture(page,count=3,mockAudio=true) {
  await page.routeWebSocket(/ws:\/\/[^/]+/, socket=>socket.close());
  if(mockAudio) await page.addInitScript(()=>{window.categoryAudio=[];window.Audio=class extends EventTarget {constructor(src){super();this.ended=true;this.src=src;}play(){window.categoryAudio.push(this.src);return Promise.resolve();}pause(){}};});
  await page.route('**/original/catalog.json*',async route=>{
    const response=await route.fetch(),catalog=await response.json();
    catalog.groups.backgrounds=Array.from({length:count},(_,i)=>({name:`Category ${i}`,items:[]}));
    await route.fulfill({response,json:catalog});
  });
  await page.goto('/');await page.getByRole('button',{name:'Backgrounds',exact:true}).click();
  await expect(page.locator('#category option')).toHaveCount(count);
  await expect(actor(page)).toBeVisible();
}
const state=page=>snap(page,'arrows');
for (const interference of ['Enter', 'synthetic semantic click']) test(`held category Space rejects ${interference} until matching release`,async({page})=>{
  await fixture(page);await control(page,'category-step:1').focus();
  await page.keyboard.down('Space');
  try {
    if(interference==='Enter')await page.keyboard.press('Enter');
    else await control(page,'category-step:1').evaluate(button=>button.click());
    await expect(page.locator('#category')).toHaveValue('0');
    expect((await state(page))[1].state).toBe(1);
  } finally {await page.keyboard.up('Space');}
  await expect(page.locator('#category')).toHaveValue('1');
  await control(page,'category-step:1').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#category')).toHaveValue('2');
});
for (const interference of ['Enter', 'synthetic semantic click']) test(`fallback held category Space rejects ${interference} across decode`,async({page})=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/secondary-motion/backdrops/library-category.png*',async route=>{
    const response=await route.fetch();await gate;await route.fulfill({response});
  });
  const starting=fixture(page);
  try {
    await expect(page.locator('#category option')).toHaveCount(3);
    await control(page,'category-step:1').focus();await page.keyboard.down('Space');
    if(interference==='Enter')await page.keyboard.press('Enter');
    else await control(page,'category-step:1').evaluate(button=>button.click());
    await expect(page.locator('#category')).toHaveValue('0');
    release();await starting;
    await page.keyboard.up('Space');await expect(page.locator('#category')).toHaveValue('1');
    await control(page,'category-step:1').focus();await page.keyboard.press('Enter');
    await expect(page.locator('#category')).toHaveValue('2');
  } finally {release();await page.keyboard.up('Space');await starting;}
});
for(const [count,index,scripts] of [[3,0,[18315,18293]],[3,1,[18290,18293]],[3,2,[18290,18316]],[1,0,[18315,18316]],[0,0,[18315,18316]]])test(`actual category boundary ${index}/${count}`,async({page})=>{
  await fixture(page,count);if(count)await page.locator('#category').selectOption(String(index));
  expect((await state(page)).map(s=>s.script)).toEqual(scripts);await pixels(page,'arrows');
  await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(0);
});
test('all ten groups, finite hover, delayed cue, unchanged render and boundary reenable',async({page})=>{
  await fixture(page);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));seen.clear();
  await pixels(page,'arrows');await page.locator('#category').selectOption('1');await pixels(page,'arrows');
  for(const action of ['category-step:-1','category-step:1']){
    await page.locator('#category').selectOption('1');await page.mouse.move(900,600);
    await control(page,action).hover();await pixels(page,'arrows');
    expect((await state(page))[action.endsWith(':-1')?0:1].script).toBe(action.endsWith(':-1')?18292:18295);
    await page.mouse.down();await pixels(page,'arrows');
    expect((await state(page)).find(s=>s.state===1).frameIndex).toBe(0);
    const cues=await page.evaluate(()=>window.categoryAudio.filter(p=>/\/18003\.wav(?:\?|$)/.test(p)).length);
    await page.clock.runFor(120);await pixels(page,'arrows');
    expect((await state(page)).find(s=>s.state===1).frameIndex).toBe(1);
    expect(await page.evaluate(()=>window.categoryAudio.filter(p=>/\/18003\.wav(?:\?|$)/.test(p)).length)).toBe(cues+1);
    await page.mouse.up();await pixels(page,'arrows');
  }
  expect([...seen].sort()).toEqual(Object.entries(fixtureSource.scripts).flatMap(([id,s])=>s.frames.map((_,i)=>`${id}:${i}`)).sort());
  await page.locator('#category').selectOption('1');await control(page,'category-step:-1').evaluate(b=>b.click());
  await expect(page.locator('#category')).toHaveValue('0');
});
test('outside release, reentry, Escape, blur, capture loss, cancelled Space, assistive activation once',async({page})=>{
  await fixture(page);await page.locator('#category').selectOption('1');
  const next=()=>control(page,'category-step:1');
  for(const cancellation of ['outside','Escape','blur','capture']){
    await next().hover();await page.mouse.down();
    if(cancellation==='outside')await page.mouse.move(500,400);
    if(cancellation==='Escape')await page.keyboard.press('Escape');
    if(cancellation==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(cancellation==='capture'){
      const box=await next().boundingBox();await page.mouse.move(box.x+20,box.y+15);
      await next().evaluate(b=>{for(let i=1;i<5;i++)if(b.hasPointerCapture(i))b.releasePointerCapture(i);});
      await page.mouse.move(box.x+21,box.y+15);
    }
    await page.mouse.up();await expect(page.locator('#category')).toHaveValue('1');
  }
  await next().focus();await page.keyboard.down('Space');await page.keyboard.press('Escape');await page.keyboard.up('Space');await expect(page.locator('#category')).toHaveValue('1');
  await next().focus();await page.keyboard.press('Space');await expect(page.locator('#category')).toHaveValue('2');
  await page.locator('#category').selectOption('1');await next().hover();await page.mouse.down();await page.mouse.move(500,400);await next().hover();await page.mouse.up();await expect(page.locator('#category')).toHaveValue('2');
});
test('native Audio retrieves the complete pinned 18003 payload through Range-capable originals',async({page})=>{
  await fixture(page,3,false);
  const responses=[];page.on('response',r=>{if(new URL(r.url()).pathname.endsWith('/secondary-motion/sounds/18003.wav') && (r.status()===200 || r.status()===206 && r.headers()['content-range']==='bytes 0-3603/3604'))responses.push(r);});
  await control(page,'category-step:1').hover();await page.mouse.down();
  await expect.poll(()=>responses.length).toBe(1);
  const r=responses[0],body=await r.body();expect([200,206]).toContain(r.status());
  if(r.status()===206)expect(r.headers()['content-range']).toBe('bytes 0-3603/3604');
  expect(body.length).toBe(3604);expect(body.subarray(0,4).toString()).toBe('RIFF');
  expect(createHash('sha256').update(body).digest('hex')).toBe(fixtureSource.sounds[18003].sha256);
  await page.mouse.up();
});
for(const reason of ['focus','capture','cancel','keyboard','keyboard-cancel','stale','outside','reentry'])test(`decode readiness preserves existing ${reason} semantic nodes`,async({page})=>{
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/secondary-motion/backdrops/library-category.png*',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  try{
    // fixture's ready wait is intentionally replaced while the image is gated.
    const starting=fixture(page);await expect(page.locator('#category')).toBeVisible();
    const select=await page.locator('#category').elementHandle();const next=await control(page,'category-step:1').elementHandle();
    if(reason==='focus')await page.locator('#category').focus();
    else if(reason.startsWith('keyboard')){await control(page,'category-step:1').focus();await page.keyboard.down('Space');}
    else {await control(page,'category-step:1').hover();await page.mouse.down();}
    if(reason==='cancel'||reason==='keyboard-cancel')await page.keyboard.press('Escape');
    if(reason==='stale')await page.locator('#category').selectOption('1');
    if(reason==='outside'||reason==='reentry')await page.mouse.move(500,400);
    release();await starting;
    expect(await select.evaluate(n=>n.isConnected)).toBe(reason!=='stale');expect(await next.evaluate(n=>n.isConnected)).toBe(reason!=='stale');
    if(reason==='focus')await expect(page.locator('#category')).toBeFocused();
    else {
      if(reason==='reentry')await control(page,'category-step:1').hover();
      if(reason.startsWith('keyboard'))await page.keyboard.up('Space');else await page.mouse.up();
      await expect(page.locator('#category')).toHaveValue(reason==='cancel'||reason==='keyboard-cancel'||reason==='outside'?'0':'1');
    }
  }finally{release();await page.mouse.up();await page.keyboard.up('Space');}
});
test('decode failure keeps fallback usable and retries without replacing current nodes',async({page})=>{
  let fail=true;await page.route('**/secondary-motion/backdrops/library-category.png*',route=>fail?route.abort():route.continue());
  const pending=fixture(page);await expect(page.locator('[data-category-owner]')).toHaveAttribute('data-motion-error',/./);
  await control(page,'category-step:1').evaluate(b=>b.click());await expect(page.locator('#category')).toHaveValue('1');
  const select=await page.locator('#category').elementHandle();fail=false;
  await control(page,'category-step:1').hover();await pending;expect(await select.evaluate(n=>n.isConnected)).toBe(true);
});
test('held proposal rejects direct select and tab changes; tile/readout/page controls retain ownership',async({page})=>{
  await fixture(page);await page.locator('#category').selectOption('1');
  await control(page,'category-step:1').hover();await page.mouse.down();
  await page.locator('#category').selectOption('0');await page.mouse.up();await expect(page.locator('#category')).toHaveValue('0');
  await control(page,'category-step:1').hover();await page.mouse.down();
  await control(page,'library-tab:maps').evaluate(b=>b.click());await page.mouse.up();
  await expect(control(page,'library-tab:maps')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#category')).toHaveValue('0');
});
test('Space releases only on Space; Enter/touch/assistive activation once',async({page})=>{
  await fixture(page);const next=()=>control(page,'category-step:1');
  await next().focus();await page.keyboard.down('Space');
  await page.locator('[data-action="tray:draw"]').dispatchEvent('pointerdown',{pointerId:779,pointerType:'touch',button:0});
  await page.locator('[data-action="tray:draw"]').dispatchEvent('pointerup',{pointerId:779,pointerType:'touch',button:0});
  await page.locator('[data-action="tray:draw"]').evaluate(b=>b.dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,detail:1,pointerId:779,pointerType:'touch'})));
  await page.keyboard.press('Shift');await expect(page.locator('#category')).toHaveValue('0');
  await page.keyboard.up('Space');await expect(page.locator('#category')).toHaveValue('1');
  await next().focus();await page.keyboard.press('Enter');await expect(page.locator('#category')).toHaveValue('2');
});
test('stable logical list target rejects replacements at release and preserves unchanged rerender/cue @module',async({page})=>{
  await page.route('**/category-fixture',r=>r.fulfill({contentType:'text/html',body:'<style>#studio{position:absolute;inset:0;width:1024px;height:768px}.chrome{pointer-events:none}button{position:absolute}</style><div id="studio"><div id="controls"></div></div>'}));
  await page.goto('/category-fixture');
  await page.evaluate(async()=>{
    const {createNativeCategoryMotion,createCategoryIdentity}=await import('/src/native-category-motion.js');
    window.source=[{}, {}, {}];window.current={active:true,nativeUi:true,categoryIndex:1,categoryCount:3};window.actions=[];
    const identity=createCategoryIdentity();window.read=()=>({...current,identity:identity({key:'backgrounds',tab:'',source,categories:[...source],categoryIndex:current.categoryIndex})});
    const controls=document.querySelector('#controls');
    window.motion=createNativeCategoryMotion({stage:document.querySelector('#studio'),controls,resolve:p=>`/original/ui/${p}`,readState:read,onActivate:a=>actions.push(a)});
    window.rerender=()=>{motion.beforeRender();controls.innerHTML='<button data-action="category-step:-1">Previous</button><button data-action="category-step:1">Next</button>';motion.update(read());};rerender();
  });
  await expect(actor(page)).toBeVisible();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));
  const next=()=>page.locator('[data-action="category-step:1"]');
  await next().hover();await page.mouse.down();await page.clock.runFor(120);
  const before=await state(page);await page.evaluate(()=>rerender());expect(await state(page)).toEqual(before);
  await page.mouse.up();expect(await page.evaluate(()=>actions)).toEqual(['category-step:1']);
  for(const replace of ['source=[...source]','source.reverse()','current.categoryIndex=2']){
    await next().hover();await page.mouse.down();await page.evaluate(code=>eval(code),replace);await page.mouse.up();expect(await page.evaluate(()=>actions.length)).toBe(1);
    await page.evaluate(()=>{current.categoryIndex=1;rerender();});
  }
  await next().hover();await page.mouse.down();await page.mouse.up();expect(await page.evaluate(()=>actions.length)).toBe(2);
  await page.evaluate(()=>motion.dispose());await expect(actor(page)).toHaveCount(0);
});
test.describe('touch category input',()=>{
  test.use({hasTouch:true});
  test('real touch commits once and leaves the dropdown usable',async({page})=>{
    await fixture(page);await control(page,'category-step:1').tap();await expect(page.locator('#category')).toHaveValue('1');
    await page.locator('#category').selectOption('0');await expect(page.locator('#category')).toHaveValue('0');
  });
});
test('browser-delivered pen capture and competing touch contacts commit once',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP input is Chromium only');
  await fixture(page);const session=await page.context().newCDPSession(page);
  const box=await control(page,'category-step:1').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1,pointerType:'pen'});
  await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1,pointerType:'pen'});
  await expect(page.locator('#category')).toHaveValue('1');
  await page.locator('#category').selectOption('0');
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y},{id:2,x:x+2,y:y+2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#category')).toHaveValue('1');await session.detach();
});
test('category changes preserve ink, history, saved document and exported PNG',async({page})=>{
  await fixture(page);await page.locator('[data-action="tray:draw"]').click();
  const paper=page.locator('#paper-canvas'),box=await paper.boundingBox();
  const blank=await paper.evaluate(c=>c.toDataURL());
  await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+180,box.y+150,{steps:10});await page.mouse.up();
  const ink=await paper.evaluate(c=>c.toDataURL());
  const history=await page.locator('[data-action="undo"]').first().getAttribute('aria-disabled');
  async function download(choice){
    await page.locator('[data-action="save"]').last().evaluate(b=>b.click());const pending=page.waitForEvent('download');
    await page.locator('#dialog-actions').getByRole('button',{name:choice,exact:true}).click();
    const {readFile}=await import('node:fs/promises');return readFile(await (await pending).path());
  }
  const doc=JSON.parse(await download('Save Picture')),pngBefore=PNG.sync.read(await download('Export PNG'));
  await page.getByRole('button',{name:'Backgrounds',exact:true}).click();await expect(actor(page)).toBeVisible();
  await control(page,'category-step:1').click();await page.locator('#category').selectOption('2');
  expect(await paper.evaluate(c=>c.toDataURL())).toBe(ink);expect(await page.locator('[data-action="undo"]').first().getAttribute('aria-disabled')).toBe(history);
  expect(JSON.parse(await download('Save Picture'))).toEqual(doc);expect(PNG.sync.read(await download('Export PNG')).data.equals(pngBefore.data)).toBe(true);
  await page.locator('[data-action="undo"]').first().evaluate(b=>b.click());
  await expect.poll(()=>paper.evaluate(c=>c.toDataURL())).toBe(blank);
  await page.locator('[data-action="redo"]').first().evaluate(b=>b.click());
  await expect.poll(()=>paper.evaluate(c=>c.toDataURL())).toBe(ink);
});
test('cold Pencil requests no category payloads; tray close retires the owner',async({page})=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto('/');
  await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();
  expect(requests.filter(url=>/18000-56[0-7]\.|backdrops\/library-category/.test(url))).toEqual([]);
  await page.getByRole('button',{name:'Backgrounds',exact:true}).click();await expect(actor(page)).toBeVisible();
  await page.locator('[data-action="tray:draw"]').click();await expect(actor(page)).toHaveCount(0);
});
test('invalid raw category keeps displayed fallback and safely disables until direct selection repairs it',async({page})=>{
  await fixture(page);await page.locator('#category').evaluate(select=>select.add(new Option('Invalid proposal','99')));
  await page.locator('#category').selectOption('99');
  expect((await state(page)).map(s=>[s.script,s.disabled])).toEqual([[18315,true],[18316,true]]);
  await expect(control(page,'category-step:-1')).toHaveCount(0);await expect(control(page,'category-step:1')).toHaveCount(0);await pixels(page,'arrows');
  await expect(page.locator('#category')).toHaveValue('0');
  await page.locator('#category').selectOption('1');expect((await state(page)).map(s=>s.disabled)).toEqual([false,false]);
});
test('competing contact and late compatibility click cannot activate a replacement tray',async({page})=>{
  await fixture(page);const next=control(page,'category-step:1');await next.hover();await page.mouse.down();
  const drawing=page.locator('[data-action="tray:draw"]');
  await drawing.dispatchEvent('pointerdown',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
  await drawing.dispatchEvent('pointerup',{pointerId:778,pointerType:'touch',isPrimary:true,button:0});
  await drawing.evaluate(b=>b.dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,detail:1,pointerId:778,pointerType:'touch'})));
  await expect(actor(page)).toBeVisible();await page.keyboard.press('Escape');await page.mouse.up();
  // The browser's physical compatibility click after mouse.up is the bounded
  // late-click control; do not fabricate a second click for that sequence.
  await expect(actor(page)).toBeVisible();
  await drawing.click();await expect(actor(page)).toHaveCount(0);
});
test('held Space rejects competing tray activation; fresh Stamp activation remains usable',async({page})=>{
  await fixture(page);await control(page,'category-step:1').focus();await page.keyboard.down('Space');
  await page.locator('[data-action="tray:stamp"]').evaluate(b=>b.click());
  await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(0);
  await expect(actor(page)).toBeVisible();await expect(page.locator('#category')).toHaveValue('0');
  await page.keyboard.up('Space');await expect(page.locator('#category')).toHaveValue('1');
  await page.locator('[data-action="tray:stamp"]').click();
  await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(3);
  await expect(page.locator('#category')).toHaveValue('0');
  await expect(actor(page)).toHaveCount(0);
});

test('browser-delivered pen capture pending decode rejects a small touch drag past the edge',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP input is Chromium only');
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/secondary-motion/backdrops/library-category.png*',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  let session;
  try{
    const starting=fixture(page);await expect(page.locator('#category option')).toHaveCount(3);
    const box=await control(page,'category-step:1').boundingBox();session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:21,x:box.x+box.width-1,y:box.y+15}]});
    release();await starting;
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:21,x:box.x+box.width+2,y:box.y+15}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('#category')).toHaveValue('0');
  }finally{release();if(session)await session.detach();}
});
