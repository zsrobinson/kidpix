import {test,expect} from '@playwright/test';
const cases=[['new',1047],['print',1051],['help',1080]];
for(const [name,id] of cases)for(const input of ['pointer','Space'])test(`${name} held fallback ${input} silently adopts actual state after default click`,async({page})=>{
 let release;const gate=new Promise(r=>release=r);
 await page.route(`**/button-animations/${id}-1.png*`,async r=>{await gate;await r.continue();});
 await page.addInitScript(()=>{window.calls=[];window.cues=[];window.print=()=>{};document.addEventListener('click',e=>{const n=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(n)calls.push(n);});window.Audio=class extends EventTarget{constructor(src){super();cues.push(String(src));}play(){return Promise.resolve();}pause(){}};});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-native-tool-tab-motion="draw"]')).toBeVisible();
  const b=page.locator(`#hit-layer [data-action="${name}"]`),a=page.locator(`[data-native-command-motion="${name}"]`);await b.evaluate(b=>window.oldButton=b);
  if(input==='pointer'){await b.hover();await page.mouse.down();}else{await b.focus();await page.keyboard.down(' ');await page.keyboard.press('Shift');}
  release();await page.evaluate(async id=>{const i=new Image();i.src=`/original/ui/button-animations/${id}-1.png`;await i.decode();},id);
  await expect(a).toBeHidden();expect(await b.evaluate(b=>b===oldButton)).toBe(true);
  if(input==='pointer')await page.mouse.up();else await page.keyboard.up(' ');
  if(name==='new')await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
  await b.hover();await page.mouse.move(500,400);await expect(a).toBeVisible();await expect(a).toHaveAttribute('data-state',name==='help'?'2':'0');
  expect(await page.evaluate(()=>calls)).toEqual([name]);expect(await page.evaluate(()=>cues.filter(s=>/easel-(1004|1007)/.test(s)).length)).toBe(0);
 }finally{release();await page.mouse.up();await page.keyboard.up(' ');}
});
for(const [name,id] of cases)test(`${name} failed decode remains usable and reentry retries`,async({page})=>{
 await page.route(`**/button-animations/${id}-1.png*`,r=>r.abort());await page.addInitScript(()=>window.print=()=>{});await page.goto('/');
 const b=page.locator(`#hit-layer [data-action="${name}"]`),a=page.locator(`[data-native-command-motion="${name}"]`);await b.click();
 if(name==='new')await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(a).toBeHidden();await page.unroute(`**/button-animations/${id}-1.png*`);await page.mouse.move(500,400);await b.hover();await page.mouse.move(500,400);await expect(a).toBeVisible();await expect(a).toHaveAttribute('data-state',name==='help'?'2':'0');
});
for(const [name,id] of cases)for(const input of ['pointer','Space'])test(`pending semantic ${name} during held Save ${input} preserves command availability`,async({page})=>{
 let release;const gate=new Promise(r=>release=r);await page.route(`**/button-animations/${id}-1.png*`,async r=>{await gate;await r.continue();});
 await page.addInitScript(()=>{window.calls=[];window.print=()=>{};document.addEventListener('click',e=>{const a=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(a)calls.push(a);});});
 try{await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-native-command-motion="save"]')).toBeVisible();
 const held=page.locator('#hit-layer [data-action="save"]');if(input==='pointer'){await held.hover();await page.mouse.down();}else{await held.focus();await page.keyboard.down(' ');}
 await page.locator(`#hit-layer [data-action="${name}"]`).evaluate(b=>b.click());expect(await page.evaluate(()=>calls)).toEqual([name]);
 if(input==='pointer')await page.mouse.up();else await page.keyboard.up(' ');
 expect(await page.evaluate(()=>calls)).toEqual(name==='new'?[name]:[name,'save']);await expect(page.locator('dialog')).toBeVisible();
 }finally{release();await page.mouse.up();await page.keyboard.up(' ');}
});
