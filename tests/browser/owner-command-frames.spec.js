import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {compareOpaqueSourcePixels} from './opaque-source-pixels.js';
const oracle=JSON.parse(readFileSync(new URL('../fixtures/owner-command-motion-source.json',import.meta.url)));
const button=(page,name)=>page.locator(`#hit-layer [data-action="${name==='export'?'stereo':name}"]`);
const actor=(page,name)=>page.locator(`[data-native-command-motion="${name}"]`);
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  window.cues=[];window.activations=[];window.print=()=>{};
  window.Audio=class extends EventTarget{constructor(src){super();this.src=String(src);cues.push(this);}play(){return new Promise((resolve,reject)=>{this.reject=reject;});}pause(){this.stopped=true;this.dispatchEvent(new Event('pause'));}};
  document.addEventListener('click',e=>{const a=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(['new','print','help'].includes(a))activations.push(a);});
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
 test(`${name} all raw source compositions, cues and finite audio end gate`,async({page})=>{
  expect(await page.evaluate(()=>cues.filter(a=>/easel-(1004|1007)/.test(a.src)).length)).toBe(0);
  await pixels(page,name,w[0],oracle.scripts[w[0]].groups.length-1);
  await button(page,name).hover();
  for(let i=0;i<oracle.scripts[w[10]].groups.length;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[10],i,true);}
  await page.mouse.down();
  for(let i=0;i<oracle.scripts[w[1]].groups.length;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[1],i);}
  await page.clock.runFor(500);await expect(actor(page,name)).toHaveAttribute('data-finished','false');
  const cue=name==='help'?1007:1004;
  expect(await page.evaluate(cue=>cues.filter(a=>a.src.includes(`easel-${cue}`)).length,cue)).toBe(1);
  await page.evaluate(cue=>cues.find(a=>a.src.includes(`easel-${cue}`)).dispatchEvent(new Event('ended')),cue);
  await page.clock.runFor(120);await expect(actor(page,name)).toHaveAttribute('data-finished','true');
  await page.mouse.move(500,400);
  for(let i=0;i<oracle.scripts[w[0]].groups.length;i++){if(i)await page.clock.runFor(i===1?120:100);await pixels(page,name,w[0],i);}
  await page.mouse.up();expect(await page.evaluate(()=>activations)).toEqual([]);
 });
}
