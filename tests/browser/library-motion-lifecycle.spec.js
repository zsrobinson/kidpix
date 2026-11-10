import { test, expect } from '@playwright/test';
const base=page=>page.locator('[data-native-library-motion="backgrounds"]');
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.motionAudio=[];
    window.Audio=class extends EventTarget {
      constructor(src){super();this.src=String(src);window.motionAudio.push(this);}
      play(){return new Promise((resolve,reject)=>{this.reject=reject;});}
      pause(){this.stopped=true;this.dispatchEvent(new Event('pause'));}
    };
  });
  await page.clock.install();await page.goto('/');await expect(base(page)).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now()+1000));
});
for(const reason of ['blur','pagehide','hidden','pointercancel','Escape']) test(`${reason} retires held library state and audio; fresh press recovers`,async({page})=>{
  const b=page.getByRole('button',{name:'Backgrounds',exact:true});
  await b.hover();await page.mouse.down();await expect(base(page)).toHaveAttribute('data-script','1001');
  await page.evaluate(reason=>{
    if(reason==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
    else if(reason==='pointercancel') document.querySelector('#hit-layer').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));
    else if(reason==='Escape') document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    else window.dispatchEvent(new Event(reason));
  },reason);
  // Escape is a document event as it can originate away from the control.
  if(reason==='Escape') await page.keyboard.press('Escape');
  await page.mouse.up();
  if(reason==='hidden') await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(b).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1000\.wav/.test(a.src)).every(a=>a.stopped))).toBe(true);
  await page.mouse.move(500,400);await b.hover();await page.mouse.down();
  await expect(base(page)).toHaveAttribute('data-script','1001');
  // The prior owner's rejection/terminal events must not finish this owner.
  await page.evaluate(()=>{const a=motionAudio.find(a=>/easel-1000\.wav/.test(a.src));a.reject(new Error('retired'));a.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(400);await expect(base(page)).toHaveAttribute('data-finished','false');
  await page.mouse.up();
});
test('Space preserves source progress and cue identity across its semantic click',async({page})=>{
  const b=page.getByRole('button',{name:'Backgrounds',exact:true});await b.focus();
  await page.keyboard.down(' ');await page.clock.runFor(120);
  await expect(base(page)).toHaveAttribute('data-frame','1');await page.keyboard.up(' ');
  await expect(base(page)).toHaveAttribute('data-frame','1');await expect(b).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1000\.wav/.test(a.src)).length)).toBe(1);
});
