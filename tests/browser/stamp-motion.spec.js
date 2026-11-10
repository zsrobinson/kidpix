import { canonicalMotionFrame } from './canonical-motion-frame.js';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

// Independent registered-pixel compositor; no application/controller imports.
const manifest = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
const pins = JSON.parse(readFileSync('scripts/secondary-motion/stamp-pose-oracles.json')).rows;
const png = path => PNG.sync.read(readFileSync(`public/original/ui/${path}`));
const profiles = { arrows:[18700,[1,2],[329,665,43,62]], editor:[18700,[3],[490,650,61,76]], size:[18202,[0,1,2],[432,653,32,75]] };
const actor = (page,name) => page.locator(`[data-native-stamp-motion="stamp:${name}"]`);
const control = (page,action) => page.locator(`#library-tray [data-action="${action}"]`);
const snap = (page,name) => actor(page,name).evaluate(c => JSON.parse(c.dataset.motionSnapshot));
const click = (page,action) => control(page,action).evaluate(b => b.click());
const seen = new Set();
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
  const backdrop=manifest.backdrops.stamps;
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
  if(mockAudio) await page.addInitScript(()=>{window.stampAudio=[];window.Audio=class extends EventTarget {constructor(src){super();this.ended=true;this.src=src;}play(){window.stampAudio.push(['play',this.src]);return Promise.resolve();}pause(){window.stampAudio.push(['stop',this.src]);}};});
  await page.route('**/original/catalog.json*',async route=>{
    const response=await route.fetch(),catalog=await response.json();
    catalog.groups.stamps=Array.from({length:count},(_,i)=>({name:`Category ${i}`,items:Array.from({length:7},(_,j)=>({
      id:`stamp-${i}-${j}`,name:`Stamp ${i}/${j}`,src:'stamps/motion-fixture.png',thumbnail:'stamps/motion-fixture.png',mediaType:'image',width:32,height:32,
    }))}));
    await route.fulfill({response,json:catalog});
  });
  const image=new PNG({width:32,height:32});for(let i=0;i<image.data.length;i+=4) image.data.set([230,10,40,255],i);
  await page.route('**/original/stamps/motion-fixture.png',route=>route.fulfill({body:PNG.sync.write(image),contentType:'image/png'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Rubber Stamp Tools',exact:true}).click();
  await expect(page.locator('#category option')).toHaveCount(count);
}
async function ready(page) {for(const name of Object.keys(profiles)) await expect(actor(page,name)).toBeVisible();}
async function sourceClock(page) {await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+60000));}

test('all 29 independent source pins remain valid (row0 source-only)',()=>{
  let groups=0;
  for(const row of pins) for(const pose of row.poses) {
    const image=compose(row.boundsXYWH,[{script:pose.script,frameIndex:pose.frame}]);
    expect(createHash('sha256').update(image.data).digest('hex'),`${row.table}:${row.row}:${pose.script}:${pose.frame}`).toBe(pose.rgbaSha256);
    groups++;
  }
  expect(groups).toBe(29);
});

test('six live rows: every authored group, disabled boundaries and vacated source pixels',async({page})=>{
  await fixture(page);await ready(page);await sourceClock(page);seen.clear();
  await pixels(page,'arrows');await pixels(page,'editor');await pixels(page,'size');
  await page.locator('#category').selectOption('1');
  for(const action of ['category-step:-1','category-step:1','stamp-edit','size:4','size:8','size:16']) {
    const name=action.startsWith('category')?'arrows':action.startsWith('size')?'size':'editor';
    if(name==='arrows') await page.locator('#category').selectOption('1');
    if(name==='size') await click(page,action==='size:8'?'size:4':'size:8');
    await page.mouse.move(900,600);await pixels(page,name);
    await control(page,action).hover();await pixels(page,name);
    await page.mouse.down();await pixels(page,name);
    await page.clock.runFor(120);await pixels(page,name);
    if(name==='editor') {await page.mouse.move(900,600);await page.mouse.up();}
    else {await page.mouse.up();await pixels(page,name);}
  }
  await page.locator('#category').selectOption('2');await pixels(page,'arrows');
  // Static row0 accounts for the remaining three pins; it has no animated owner.
  const livePins=pins.filter(p=>!(p.table===18700&&p.row===0)).flatMap(p=>p.poses.map(s=>`${s.script}:${s.frame}`));
  expect([...new Set(livePins)].filter(key=>!seen.has(key)),'all 26 live groups visited').toEqual([]);
});

for(const [count,index,scripts] of [[3,0,[18307,18057]],[3,1,[18054,18057]],[3,2,[18054,18308]],[1,0,[18307,18308]]]) {
  test(`category boundary fixture ${index}/${count}`,async({page})=>{
    await fixture(page,count);await ready(page);await page.locator('#category').selectOption(String(index));
    expect((await snap(page,'arrows')).map(s=>s.script)).toEqual(scripts);
    await pixels(page,'arrows');
    await expect(control(page,'category-step:-1')).toHaveCount(index>0?1:0);
    await expect(control(page,'category-step:1')).toHaveCount(index+1<count?1:0);
    await expect(page.locator('#category')).not.toHaveAttribute('data-native-motion-index');
  });
}

test('keyboard once, pointer cancellation, rerenders, native select, editor and library drag stay usable',async({page})=>{
  await fixture(page);await ready(page);await sourceClock(page);
  for(const event of ['pointercancel','lostpointercapture','blur']) {
    await control(page,'size:16').hover();await page.mouse.down();
    if(event==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else await control(page,'size:16').dispatchEvent(event,{pointerId:1});
    await page.mouse.up();expect((await snap(page,'size'))[1].state).toBe(3);
  }
  await control(page,'size:4').focus();await page.keyboard.down('Space');
  await page.locator('#category').selectOption('1');await page.keyboard.up('Space');
  expect((await snap(page,'size'))[0].state).toBe(3);
  await control(page,'size:16').focus();await page.keyboard.down('Space');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');
  expect((await snap(page,'size'))[0].state).toBe(3);
  await page.locator('#category').selectOption('0');
  await control(page,'category-step:1').focus();await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');await expect(page.locator('#category')).toHaveValue('1');
  await page.locator('#category').focus();await page.keyboard.press('Home');await page.keyboard.press('Enter');
  await page.locator('#category').selectOption('0');
  await control(page,'size:8').hover();await page.mouse.down();
  await click(page,'lib-page:1');await page.clock.runFor(120);
  expect((await snap(page,'size'))[1]).toMatchObject({state:1,frameIndex:1});
  await page.mouse.up();expect((await snap(page,'size'))[1].state).toBe(3);
  await click(page,'lib-page:-1');
  const tile=page.locator('#library-tray [data-item="stamp-0-0"]');await tile.click();
  await control(page,'stamp-edit').focus();await page.keyboard.down('Space');
  await page.locator('#library-tray [data-item="stamp-0-1"]').evaluate(b=>b.click());
  await page.clock.runFor(32);await page.keyboard.up('Space');
  await expect(page.getByRole('dialog',{name:'Stamp Editor',exact:true})).toHaveCount(0);
  await control(page,'stamp-edit').press('Enter');
  const dialog=page.getByRole('dialog',{name:'Stamp Editor',exact:true});await expect(dialog).toHaveCount(1);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await ready(page);await pixels(page,'editor');
  const before=await page.locator('#paper-canvas').evaluate(c=>c.toDataURL());
  await tile.dragTo(page.locator('#paper-canvas'),{targetPosition:{x:200,y:150}});
  await expect.poll(()=>page.locator('#paper-canvas').evaluate(c=>c.toDataURL())).not.toBe(before);
  await expect(tile).toHaveAttribute('draggable','true');
  await expect(page.locator('#library-tray .original-library-art')).toBeVisible();
  await expect(page.locator('#library-tray .original-library-digit')).toHaveCount(2);
});

test('failed optional manifest preserves static controls; hover retry and tray exit reject stale loading',async({page})=>{
  let fail=true;
  await page.route('**/ui/secondary-motion/manifest.json*',route=>fail?route.abort():route.continue());
  await fixture(page);
  await expect(control(page,'size:4')).toBeVisible();await click(page,'size:4');
  await expect(control(page,'size:4')).toHaveAttribute('aria-pressed','true');
  fail=false;await control(page,'size:8').hover();await ready(page);
  expect((await snap(page,'size'))[0].state).toBe(3);
  await page.getByRole('button',{name:'Drawing Tools',exact:true}).click();
  await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(0);
  await page.getByRole('button',{name:'Rubber Stamp Tools',exact:true}).click();await ready(page);
});

test('departed loading owner cannot paint; reentry restores authoritative state',async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let held=0;
  await page.route('**/ui/secondary-motion/manifest.json*',async route=>{held++;await gate;await route.continue();});
  await fixture(page);await expect.poll(()=>held).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Drawing Tools',exact:true}).click();
  release();await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(0);
  await page.getByRole('button',{name:'Rubber Stamp Tools',exact:true}).click();await ready(page);
  await pixels(page,'arrows');await pixels(page,'size');
});

for(const kind of ['image','argb']) test(`${kind} failure leaves static size hitboxes usable, then retries`,async({page})=>{
  const script=manifest.scripts[18226],part=script.frames[0].parts[0];
  const path=manifest.sprites[`${script.collection}:${part.sprite}`][kind];
  let fail=true;
  await page.route(`**/ui/${path}*`,route=>fail?route.abort():route.continue());
  await fixture(page);await expect(actor(page,'arrows')).toBeVisible();await expect(actor(page,'editor')).toBeVisible();
  await expect(page.locator('[data-stamp-owner="size"]')).toHaveAttribute('data-motion-error',/.+/);
  await expect(control(page,'size:4')).toBeVisible();
  await click(page,'size:4');await expect(control(page,'size:4')).toHaveAttribute('aria-pressed','true');
  await expect(actor(page,'size')).toHaveCount(0);
  fail=false;await control(page,'size:8').hover();await ready(page);await sourceClock(page);await page.mouse.move(900,600);
  expect((await snap(page,'size'))[0].state).toBe(3);
  await pixels(page,'size');
});

test('no-stamp editor keeps its existing response, failed audio does not block navigation',async({page})=>{
  let requested=0;
  await page.route('**/*.wav*',route=>{requested++;return route.abort();});
  await fixture(page,3,false);await ready(page);
  await control(page,'stamp-edit').press('Enter');
  await expect(page.getByRole('dialog',{name:'Stamp Editor',exact:true})).toHaveCount(0);
  await expect(page.getByText('Choose a stamp to edit.',{exact:true})).toBeVisible();
  await sourceClock(page);await control(page,'category-step:1').hover();await page.mouse.down();
  await page.clock.runFor(120);await page.mouse.up();
  await expect(page.locator('#category')).toHaveValue('1');await expect.poll(()=>requested).toBeGreaterThan(0);await pixels(page,'arrows');
});


test('tray exit stops Stamp-owned audio and cancels captured input',async({page})=>{
  await fixture(page);await ready(page);await sourceClock(page);
  await control(page,'category-step:1').hover();await page.mouse.down();await page.clock.runFor(120);
  const played=await page.evaluate(()=>window.stampAudio.filter(e=>e[0]==='play'&&e[1].includes('secondary-motion/sounds/18003.wav')).length);
  expect(played).toBeGreaterThan(0);
  const stops=await page.evaluate(()=>window.stampAudio.filter(e=>e[0]==='stop'&&e[1].includes('secondary-motion/sounds/18003.wav')).length);
  await page.getByRole('button',{name:'Drawing Tools',exact:true}).evaluate(b=>b.click());
  expect(await page.evaluate(()=>window.stampAudio.filter(e=>e[0]==='stop'&&e[1].includes('secondary-motion/sounds/18003.wav')).length)).toBeGreaterThan(stops);
  await page.mouse.up();await expect(page.locator('[data-native-stamp-motion]')).toHaveCount(0);
});
