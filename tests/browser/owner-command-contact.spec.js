import {test,expect} from '@playwright/test';
test.use({hasTouch:true});
const b=(p,n)=>p.locator(`#hit-layer [data-action="${n}"]`);
for(const held of ['save','stereo'])for(const input of ['pointer','Space'])for(const semantic of ['print','help'])for(const competing of [false,true])test(`pending ${held} ${input} retained across semantic ${semantic}, competing touch ${competing}`,async({page})=>{
 let release;const gate=new Promise(r=>release=r);const id=held==='save'?1036:1124;
 await page.route(`**/button-animations/${id}-1.png*`,async r=>{await gate;await r.continue();});
 await page.addInitScript(held=>{window.physicalHeldClicks=0;window.addEventListener('click',e=>{if(e.detail>0&&e.target.closest('#hit-layer [data-action]')?.dataset.action===held)physicalHeldClicks++;},true);window.calls=[];window.print=()=>{};document.addEventListener('click',e=>{const a=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(a)calls.push(a);});},held);
 try{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-native-command-motion="help"]')).toBeVisible();await expect(page.locator('[data-native-command-motion="print"]')).toBeVisible();
 const actor=page.locator(`[data-native-command-motion="${held==='save'?'save':'export'}"]`);await expect(actor).toBeHidden();
 if(input==='Space'){await b(page,held).focus();await page.keyboard.down(' ');}else{await b(page,held).hover();await page.mouse.down();}
 await b(page,semantic).evaluate(b=>b.click());expect(await page.evaluate(()=>calls)).toEqual([semantic]);
 const box=await b(page,'print').boundingBox();if(competing)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 expect(await page.evaluate(()=>calls)).toEqual([semantic]);
 if(input==='Space')await page.keyboard.up(' ');else await page.mouse.up();
 // Chromium may suppress the mouse default click after an intervening touch.
 // Match delivery observed before app guards; no-touch and Space lanes require it.
 const delivered=await page.evaluate(()=>physicalHeldClicks);expect(delivered).toBeLessThanOrEqual(1);
 const activates=input==='Space'||!competing||delivered===1;
 const expected=activates?[semantic,held]:[semantic];expect(await page.evaluate(()=>calls)).toEqual(expected);
 if(activates&&held==='save')await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
 await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);expect(await page.evaluate(()=>calls)).toEqual([...expected,'print']);
 }finally{release();await page.keyboard.up(' ');await page.mouse.up();}
});
for(const held of ['save','stereo'])for(const input of ['pointer','Space'])for(const semantic of ['same','new'])test(`pending ${held} ${input} retires on ${semantic==='same'?'own semantic activation':'canonical New modal'}`,async({page})=>{
 let release;const gate=new Promise(r=>release=r),id=held==='save'?1036:1124;
 await page.route(`**/button-animations/${id}-1.png*`,async r=>{await gate;await r.continue();});
 await page.addInitScript(()=>{window.calls=[];window.print=()=>{};document.addEventListener('click',e=>{const action=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(action)calls.push(action);});});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-native-command-motion="help"]')).toBeVisible();
  if(input==='Space'){await b(page,held).focus();await page.keyboard.down(' ');}else{await b(page,held).hover();await page.mouse.down();}
  const action=semantic==='same'?held:'new';await b(page,action).evaluate(b=>b.click());
  if(input==='Space')await page.keyboard.up(' ');else await page.mouse.up();
  expect(await page.evaluate(()=>calls)).toEqual([action]);
  if(action==='save'||action==='new')await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
  const box=await b(page,'print').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  expect(await page.evaluate(()=>calls)).toEqual([action,'print']);
 }finally{release();await page.keyboard.up(' ');await page.mouse.up();}
});
