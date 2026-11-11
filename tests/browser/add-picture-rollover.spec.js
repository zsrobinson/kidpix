import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';

const control = page => page.locator('#hit-layer [data-action="flipbook"]');
const actor = page => page.locator('[data-native-rollover="flipbook"]');
const idle = page => page.locator('[data-native-part="flipbook"]');
const sourcePins = JSON.parse(readFileSync(new URL('../fixtures/add-picture-rollover-source.json', import.meta.url)));
const media = name => {
  const bytes = readFileSync(new URL(`../../public/original/ui/${name}`, import.meta.url));
  const pin = name === 'paint-empty.png' ? sourcePins.cleanPlate
    : sourcePins.inventory['flipbook-*.png'].find(item => item.path.endsWith(`/${name}`));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
  return bytes;
};
const dataUrl = name => `data:image/png;base64,${media(name).toString('base64')}`;
const outside = png => {
  const bytes = [];
  for (let y=582;y<752;y++) for(let x=933;x<1012;x++) {
    if(y>=592 && y<687) continue;
    const i=(y*png.width+x)*4; bytes.push(...png.data.subarray(i,i+4));
  }
  return Buffer.from(bytes);
};
async function enter(page, fraction=.5) {
  const b=await control(page).boundingBox();
  await page.mouse.move(b.x+b.width*fraction,b.y+b.height*.5);
}
async function leave(page) { await page.mouse.move(500,20); }
async function capture(page) { return PNG.sync.read(await page.locator('#studio').screenshot()); }

test.beforeEach(async ({ page }) => {
  page.errors=[];
  page.on('pageerror', e=>page.errors.push(e.message));
  page.on('response', r=>{ if(r.status()>=400) page.errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(()=>{
    window.audioCalls=[];
    const play=HTMLMediaElement.prototype.play, pause=HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play=function(){ window.audioCalls.push(['play',this.src]); return play.call(this); };
    HTMLMediaElement.prototype.pause=function(){ window.audioCalls.push(['pause',this.src]); return pause.call(this); };
  });
  await page.clock.install({ time:new Date('2026-01-01T12:00:00Z') });
  await page.goto('/');
  await expect(actor(page)).toHaveCount(1);
  await page.evaluate(async()=>{
    await Promise.all(['flipbook-0.png','flipbook-1.png','flipbook-2.png','paint-empty.png'].map(async path=>{
      const image=new Image(); image.src=`original/ui/${path}`; await image.decode();
    }));
  });
  await leave(page);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
});
test.afterEach(async ({page})=>expect(page.errors).toEqual([]));

// Source URLs come only from local original PNGs, never runtime actor pixels or
// its src/metadata. Browser presentation pins the engine's alpha rounding.
async function oracle(page, frame, { plate=true, ghost=false }={}) {
  return page.evaluate(async ({plateUrl,frameUrl,idleUrl,plate,ghost})=>{
    const load=async src=>{const i=new Image();i.src=src;await i.decode();return i;};
    const c=document.createElement('canvas'); c.width=79;c.height=95;
    const ctx=c.getContext('2d');
    if(plate) ctx.drawImage(await load(plateUrl),933,592,79,95,0,0,79,95);
    if(ghost) ctx.drawImage(await load(idleUrl),0,-10);
    ctx.drawImage(await load(frameUrl),0,-10);
    return Array.from(ctx.getImageData(0,0,79,95).data);
  },{plateUrl:dataUrl('paint-empty.png'),frameUrl:dataUrl(`flipbook-${frame}.png`),idleUrl:dataUrl('flipbook-0.png'),plate,ghost});
}
function crop(png) {
  const bytes=[];
  for(let y=592;y<687;y++) for(let x=933;x<1012;x++) {
    const i=(y*png.width+x)*4;bytes.push(...png.data.subarray(i,i+4));
  }
  return bytes;
}

test('visible Studio matches independent clipped source composition in every pose and restores exactly',async({page})=>{
  const baseline=await capture(page);
  await enter(page);
  await expect(actor(page)).toBeVisible();
  expect(await actor(page).evaluate(e=>[e.width,e.height])).toEqual([79,95]);
  for(let frame=0;frame<3;frame++) {
    await expect(actor(page)).toHaveAttribute('data-frame',String(frame));
    const shot=await capture(page), expected=await oracle(page,frame);
    expect(crop(shot)).toEqual(expected);
    expect(outside(shot)).toEqual(outside(baseline));
    // Red-capable controls: static baseline, no clean plate and baked idle.
    if(frame>0) expect(crop(baseline)).not.toEqual(expected);
    expect(await oracle(page,frame,{plate:false})).not.toEqual(expected);
    if(frame>0) expect(await oracle(page,frame,{ghost:true})).not.toEqual(expected);
    if(frame<2) await page.clock.runFor(frame===0?112:100);
  }
  await leave(page); await expect(actor(page)).toBeHidden();
  const restored=await capture(page);
  expect(crop(restored)).toEqual(crop(baseline));expect(outside(restored)).toEqual(outside(baseline));
  expect(await page.evaluate(()=>window.audioCalls.filter(([,src])=>/easel-1032/.test(src)))).toEqual([]);
});

test('source ticks, inside motion, repeat, retirement, reentry and single action',async({page})=>{
  await enter(page); await expect(actor(page)).toHaveAttribute('data-frame','0');
  await page.clock.runFor(112); await expect(actor(page)).toHaveAttribute('data-frame','1');
  await enter(page,.6); await expect(actor(page)).toHaveAttribute('data-frame','1');
  await page.clock.runFor(100); await expect(actor(page)).toHaveAttribute('data-frame','2');
  await page.clock.runFor(100); await expect(actor(page)).toHaveAttribute('data-frame','0');
  for(const event of ['pointercancel','lostpointercapture']) {
    await control(page).dispatchEvent(event); await expect(actor(page)).toBeHidden();
    await leave(page);await enter(page);await expect(actor(page)).toBeVisible();
  }
  for(const event of ['blur','pagehide']) {
    await page.evaluate(type=>window.dispatchEvent(new Event(type)),event);
    await expect(actor(page)).toBeHidden();await page.clock.runFor(400);await expect(actor(page)).toBeHidden();
    await leave(page);await enter(page);await expect(actor(page)).toBeVisible();
  }
  expect(await page.evaluate(()=>window.audioCalls.filter(([,src])=>/easel-1032/.test(src)))).toEqual([]);
  await page.mouse.down();await expect(actor(page)).toBeHidden();await page.mouse.up();
  await expect(page.locator('#status')).toContainText('Picture added as slide 1');
  expect((await page.evaluate(()=>window.audioCalls)).filter(([type,src])=>type==='play'&&src.includes('1032'))).toHaveLength(1);
  await page.getByRole('button',{name:'Go to Slide Show',exact:true}).evaluate(e=>e.click());
  await expect(page.locator('#slide-grid img')).toHaveCount(1);
});

for(const retire of ['leave','press','cancel','blur','hidden']) test(`late decode cannot revive after ${retire}`,async({page})=>{
  // Gate decode itself; assets still load successfully and errors remain visible.
  await page.addInitScript(()=>{
    const decode=HTMLImageElement.prototype.decode;
    window.releaseFlipbook=undefined;
    const gate=new Promise(resolve=>window.releaseFlipbook=resolve);
    HTMLImageElement.prototype.decode=function(){const ready=decode.call(this);return /flipbook-[012]\.png/.test(this.src)?Promise.all([ready,gate]).then(()=>{}):ready;};
  });
  await page.reload();await expect(actor(page)).toHaveCount(1);await enter(page);
  if(retire==='leave') await leave(page);
  if(retire==='press') await control(page).dispatchEvent('pointerdown',{pointerType:'pen',pointerId:71});
  if(retire==='cancel') await control(page).dispatchEvent('pointercancel',{pointerType:'touch',pointerId:72});
  if(retire==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(retire==='hidden') await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>window.releaseFlipbook());await page.clock.runFor(500);await expect(actor(page)).toBeHidden();
  if(retire==='hidden') await page.evaluate(()=>{delete document.hidden;});
  await leave(page);await enter(page);await expect(actor(page)).toBeVisible();
});

test('malformed plate dimensions retain static backing',async({page})=>{
  await page.route('**/original/ui/paint-empty.png*', route=>route.fulfill({contentType:'image/png',body:media('flipbook-0.png')}));
  await page.reload();await expect(actor(page)).toHaveCount(1);await enter(page);await page.clock.runFor(500);
  await expect(actor(page)).toBeHidden();await expect(idle(page)).toBeVisible();
});

for(const viewport of [{width:768,height:1024},{width:512,height:768}]) test(`scaled composition and mixed pointer retirement ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await enter(page);await expect(actor(page)).toBeVisible();
  const b=await actor(page).boundingBox(),studio=await page.locator('#studio').boundingBox();
  expect(b.width/studio.width).toBeCloseTo(79/1024,3);expect(b.height/studio.height).toBeCloseTo(95/768,3);
  await control(page).dispatchEvent('pointerdown',{pointerId:19,pointerType:'pen',buttons:1});await expect(actor(page)).toBeHidden();
  await control(page).dispatchEvent('pointercancel',{pointerId:20,pointerType:'touch'});await page.clock.runFor(300);await expect(actor(page)).toBeHidden();
  await leave(page);await enter(page);await expect(actor(page)).toHaveAttribute('data-frame','0');
});

for(const asset of ['paint-empty.png','flipbook-1.png']) test(`undecodable ${asset} keeps static binding`,async({page})=>{
  await page.route(`**/original/ui/${asset}*`,route=>route.fulfill({contentType:'image/png',body:Buffer.from('invalid PNG')}));
  await page.reload();await expect(actor(page)).toHaveCount(1);await enter(page);await page.clock.runFor(500);
  await expect(actor(page)).toBeHidden();await expect(idle(page)).toBeVisible();
});

test('hidden page retires a ready actor and fresh entry restores source pose zero',async({page})=>{
  await enter(page);await expect(actor(page)).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(actor(page)).toBeHidden();await page.clock.runFor(500);await expect(actor(page)).toBeHidden();
  await page.evaluate(()=>{delete document.hidden;});await leave(page);await enter(page);await expect(actor(page)).toHaveAttribute('data-frame','0');
});

test('visible composition rejects old full-image playback and missing-plate counterfactuals',async({page})=>{
  const baseline=await capture(page);
  await enter(page);await expect(actor(page)).toBeVisible();
  await page.clock.runFor(112);await expect(actor(page)).toHaveAttribute('data-frame','1');
  const expected=await oracle(page,1);
  await actor(page).evaluate(async(e,url)=>{
    const image=new Image();image.src=url;await image.decode();
    e.getContext('2d').clearRect(0,0,e.width,e.height);
    e.getContext('2d').drawImage(image,0,-10);
  },dataUrl('flipbook-1.png'));
  expect(crop(await capture(page))).not.toEqual(expected);
  await actor(page).evaluate(async(e,url)=>{
    const image=new Image();image.src=url;await image.decode();
    e.width=79;e.height=170;e.style.top='582px';e.style.height='170px';
    e.getContext('2d').drawImage(image,0,0);
  },dataUrl('flipbook-1.png'));
  const unclipped=await capture(page);
  expect(outside(unclipped)).not.toEqual(outside(baseline));
});

test('silent hover before audio permission preserves a retained unrelated cue',async({page})=>{
  await page.addInitScript(()=>{
    const RealAudio=window.Audio;
    window.retainedCues=[];
    window.Audio=function(src){
      if(!String(src).includes('easel-1029.wav')) return new RealAudio(src);
      const audio=new EventTarget();audio.src=String(src);audio.paused=true;audio.plays=0;audio.pauses=0;
      audio.play=()=>{audio.paused=false;audio.plays++;return Promise.resolve();};
      audio.pause=()=>{audio.paused=true;audio.pauses++;};
      window.retainedCues.push(audio);return audio;
    };
  });
  await page.reload();await expect(actor(page)).toHaveCount(1);
  await page.mouse.move(950,340);await expect(page.locator('[data-native-rollover="firehose"]')).toBeVisible();
  await enter(page);await expect(actor(page)).toBeVisible();await page.clock.runFor(220);
  await control(page).dispatchEvent('pointercancel');await expect(actor(page)).toBeHidden();await leave(page);
  expect(await page.evaluate(()=>window.retainedCues.map(a=>({plays:a.plays,pauses:a.pauses,paused:a.paused})))).toEqual([{plays:1,pauses:0,paused:false}]);
  expect(await page.evaluate(()=>window.audioCalls.filter(([,src])=>/easel-1032/.test(src)))).toEqual([]);
});
