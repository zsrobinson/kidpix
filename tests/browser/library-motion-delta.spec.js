import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('visible Backgrounds tracking advances after its first source tick',async({page})=>{
  if(process.env.LIBRARY_STATIC_BASELINE) await page.route('**/src/native-library-motion.js*',route=>route.fulfill({contentType:'application/javascript',body:readFileSync(new URL('../../src/native-library-motion.js',import.meta.url),'utf8').replace(/export function attachLibraryMotion[\s\S]*?\n}/, 'export function attachLibraryMotion(){return {names:[],ready:()=>false,ownsCue:()=>false,cancel(){},cancelGroup(){},dispose(){},updateSelection(){},completeActivation(){}}}')}));
  await page.clock.install();await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button',{name:'Backgrounds',exact:true}).hover();
  // Allow asset readiness, then pin the source timeline before pressing.
  await page.evaluate(async()=>{const img=new Image();img.src='/original/ui/button-animations/1001-1.png';await img.decode();});
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.mouse.down();
  const first=await page.screenshot({clip:{x:27,y:15,width:105,height:61}});
  await page.clock.runFor(120);
  const second=await page.screenshot({clip:{x:27,y:15,width:105,height:61}});
  expect(second.equals(first),'Authored tracking image changes at tick 1').toBe(false);
  await page.mouse.up();
});

for(const handoff of ['after selection','before release']) test(`fallback selection hands off without replaying its cue: ${handoff}`,async({page})=>{
  let release,arrive;
  const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>arrive=resolve);
  await page.route('**/button-animations/1001-1.png*',async route=>{arrive();await gate;await route.continue();});
  await page.addInitScript(()=>{
    window.handoffAudio=[];
    window.Audio=class extends EventTarget{
      constructor(src){super();this.src=String(src);handoffAudio.push(this);}
      play(){return Promise.resolve();}
      pause(){this.dispatchEvent(new Event('pause'));}
    };
  });
  await page.clock.install();
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await requested;
    const button=page.getByRole('button',{name:'Backgrounds',exact:true});
    const count=()=>page.evaluate(()=>handoffAudio.filter(a=>/easel-1000\.wav/.test(a.src)).length);
    if(handoff==='before release'){
      await button.hover();await page.mouse.down();release();
      await page.waitForFunction(()=>Boolean(document.querySelector('[data-native-library-motion="backgrounds"]')?.dataset.script));
      await page.mouse.up();
    }else await button.click();
    await expect(button).toHaveAttribute('aria-pressed','true');
    expect(await count()).toBe(1);
    release();
    await expect(page.locator('[data-native-library-motion="backgrounds"]')).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now()+1000));await page.clock.runFor(400);
    expect(await count()).toBe(1);
    await page.getByRole('button',{name:'Drawing Tools',exact:true}).click();
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
    expect(await count()).toBe(2);
  }finally{release();}
});
