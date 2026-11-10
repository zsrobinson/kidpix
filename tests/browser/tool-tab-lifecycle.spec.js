import { test, expect } from '@playwright/test';
const base=page=>page.locator('[data-native-tool-tab-motion="paint"]');
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
for(const reason of ['blur','pagehide','hidden','pointercancel','Escape']) test(`${reason} retires held tool tab state and audio; fresh press recovers`,async({page})=>{
  const b=page.locator('[data-action="tray:paint"]');
  await b.hover();await page.mouse.down();await expect(base(page)).toHaveAttribute('data-script','1016');
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
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1002\.wav/.test(a.src)).every(a=>a.stopped))).toBe(true);
  await page.mouse.move(500,400);await b.hover();await page.mouse.down();
  await expect(base(page)).toHaveAttribute('data-script','1016');
  // The prior owner's rejection/terminal events must not finish this owner.
  await page.evaluate(()=>{const a=motionAudio.find(a=>/easel-1002\.wav/.test(a.src));a.reject(new Error('retired'));a.dispatchEvent(new Event('ended'));});
  await page.clock.runFor(400);await expect(base(page)).toHaveAttribute('data-finished','false');
  await page.mouse.up();
});
test('Space preserves source progress and cue identity across its semantic click',async({page})=>{
  const b=page.locator('[data-action="tray:paint"]');await b.focus();
  await page.keyboard.down(' ');await page.clock.runFor(120);
  await expect(base(page)).toHaveAttribute('data-frame','1');await page.keyboard.up(' ');
  await expect(base(page)).toHaveAttribute('data-frame','1');await expect(b).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1002\.wav/.test(a.src)).length)).toBe(1);
});

test('Escape outside the hit layer cancels a held tool tab pointer before release',async({page})=>{
  const button=page.locator('[data-action="tray:paint"]');
  await button.hover();await page.mouse.down();
  await expect(base(page)).toHaveAttribute('data-script','1016');
  // Focus can leave the captured button without ending the held contact.
  await page.getByRole('textbox',{name:'Picture title',exact:true}).focus();
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1002\.wav/.test(a.src)).every(a=>a.stopped))).toBe(true);
  await button.hover();await page.mouse.down();await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed','true');
});

for(const reason of ['Escape','focusout','blur']) test(`cancelled Space permits later semantic activation after ${reason}`,async({page})=>{
  const button=page.locator('[data-action="tray:paint"]');
  await button.focus();await page.keyboard.down(' ');
  if(reason==='Escape')await page.keyboard.press('Escape');
  else if(reason==='focusout')await page.getByRole('textbox',{name:'Picture title',exact:true}).focus();
  else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.keyboard.up(' ');
  await expect(button).toHaveAttribute('aria-pressed','false');
  await button.evaluate(button=>button.click());
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>motionAudio.filter(a=>/easel-1002\.wav/.test(a.src)).length)).toBe(2);
});
for(const terminal of ['ended','pause','error'])test(`tracking finite gate releases on ${terminal}, pending playback stays live`,async({page})=>{
 const b=page.locator('[data-action="tray:paint"]');await b.hover();await page.mouse.down();
 await page.clock.runFor(450);await expect(base(page)).toHaveAttribute('data-finished','false');
 await page.evaluate(type=>motionAudio.find(a=>/easel-1002\.wav/.test(a.src)).dispatchEvent(new Event(type)),terminal);
 await page.clock.runFor(120);await expect(base(page)).toHaveAttribute('data-finished','true');
 await page.mouse.up();
});
test('held canvas blocks keyboard tab ownership; held tab key blocks another pointer',async({page})=>{
 const paint=page.locator('[data-action="tray:paint"]'),grab=page.locator('[data-action="tray:grab"]');
 await page.locator('#paper-canvas').hover({position:{x:300,y:200}});await page.mouse.down();
 await paint.focus();await page.keyboard.press('Enter');await expect(paint).toHaveAttribute('aria-pressed','false');await page.mouse.up();
 await paint.focus();await page.keyboard.down(' ');
 await grab.click();await expect(grab).toHaveAttribute('aria-pressed','false');
 await page.keyboard.up(' ');await expect(paint).toHaveAttribute('aria-pressed','true');
 await grab.evaluate(b=>b.click());await expect(grab).toHaveAttribute('aria-pressed','true');
});
test('authored drag out/in and same selected repress preserve unchanged-script policy',async({page})=>{
 const b=page.locator('[data-action="tray:paint"]');await b.hover();await page.mouse.down();
 await page.mouse.move(500,400);await expect(base(page)).toHaveAttribute('data-script','1015');
 await b.hover();await expect(base(page)).toHaveAttribute('data-script','1016');
 await page.evaluate(()=>{window.repressAudio=motionAudio.filter(a=>/easel-1002\.wav/.test(a.src)).at(-1);});
 await page.clock.runFor(120);await expect(base(page)).toHaveAttribute('data-frame','1');
 await page.mouse.up();await b.click();
 await expect(base(page)).toHaveAttribute('data-frame','1');
 // Secondary controls legitimately emit the same cue on tray rerender. Check
 // the actual held tracking handle and visible deadline, not a global count.
 expect(await page.evaluate(()=>Boolean(repressAudio.stopped))).toBe(false);
 await expect(base(page)).toHaveAttribute('data-state','2');
});
