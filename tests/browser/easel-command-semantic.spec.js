import {test,expect} from '@playwright/test';
const button=(page,action)=>page.locator(`#hit-layer [data-action="${action}"]`);
const heldActor=(page,action)=>page.locator(action==='stereo'?'[data-native-command-motion="export"]':'[data-native-library-motion="backgrounds"]');
async function prepare(page,{saveReady=true,exportReady=true}={}){
 let release=()=>{};
 if(!saveReady||!exportReady){
  const gate=new Promise(resolve=>release=resolve);
  for(const id of [!saveReady&&1036,!exportReady&&1124].filter(Boolean))await page.route(`**/button-animations/${id}-1.png*`,async route=>{await gate;await route.continue();});
 }
 await page.addInitScript(()=>{window.commands=[];document.addEventListener('click',event=>{const action=event.target.closest('#hit-layer [data-action]')?.dataset.action;if(action)commands.push(action);});});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-native-library-motion="backgrounds"]')).toBeVisible();
 if(exportReady)await expect(page.locator('[data-native-command-motion="export"]')).toBeVisible();
 else await expect(page.locator('[data-native-command-motion="export"]')).toBeHidden();
 if(saveReady)await expect(page.locator('[data-native-command-motion="save"]')).toBeVisible();
 else await expect(page.locator('[data-native-command-motion="save"]')).toBeHidden();
 return release;
}
async function hold(page,action,input){const b=button(page,action);if(input==='pointer'){await b.hover();await page.mouse.down();}else{await b.focus();await page.keyboard.down(' ');}}
async function lift(page,input){if(input==='pointer')await page.mouse.up();else await page.keyboard.up(' ');}
for(const ready of [false,true])for(const action of ['tray:backgrounds','stereo'])for(const input of ['pointer','Space'])test(`semantic Save supersedes held ${action} ${input}, ready ${ready}`,async({page})=>{
 const release=await prepare(page,{saveReady:ready});
 try{
  await hold(page,action,input);await expect(heldActor(page,action)).toHaveAttribute('data-state','1');
  await button(page,'save').evaluate(b=>b.click());await expect(page.locator('dialog')).toBeVisible({timeout:1000});
  expect(await page.evaluate(()=>commands)).toEqual(['save']);
  await lift(page,input);await expect(page.locator('dialog')).toBeVisible();
  expect(await page.evaluate(()=>commands)).toEqual(['save']);
  await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
  await button(page,'save').click();await expect(page.locator('dialog')).toBeVisible();
  expect(await page.evaluate(()=>commands)).toEqual(['save','save']);
 }finally{release();await lift(page,input);}
});
for(const ready of [false,true])for(const input of ['pointer','Space'])test(`semantic Export preserves held Save ${input}, ready ${ready}`,async({page})=>{
 const release=await prepare(page,{exportReady:ready});
 try{
  await hold(page,'save',input);await button(page,'stereo').evaluate(b=>b.click());
  await expect(page.locator('#status')).toContainText('Choose a 3D background');
  await expect(page.locator('dialog')).not.toBeVisible();expect(await page.evaluate(()=>commands)).toEqual(['stereo']);
  await lift(page,input);await expect(page.locator('dialog')).toBeVisible({timeout:1000});
  expect(await page.evaluate(()=>commands)).toEqual(['stereo','save']);
 }finally{release();await lift(page,input);}
});
for(const input of ['pointer','Space'])test(`semantic Export preserves held Backgrounds ${input}`,async({page})=>{
 const release=await prepare(page);
 try{
  await hold(page,'tray:backgrounds',input);await button(page,'stereo').evaluate(b=>b.click());
  await expect(page.locator('#status')).toContainText('Choose a 3D background');
  await expect(heldActor(page,'tray:backgrounds')).toHaveAttribute('data-state','1');
  await lift(page,input);await expect(button(page,'tray:backgrounds')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>commands)).toEqual(['stereo','tray:backgrounds']);
 }finally{release();await lift(page,input);}
});
test.describe('physical competing contact',()=>{
 test.use({hasTouch:true});
 for(const action of ['tray:backgrounds','stereo'])for(const input of ['pointer','Space'])test(`held ${action} ${input} still rejects physical Save touch`,async({page})=>{
  const release=await prepare(page);
  try{
   await hold(page,action,input);const box=await button(page,'save').boundingBox();
   await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
   await expect(page.locator('dialog')).not.toBeVisible();expect(await page.evaluate(()=>commands)).toEqual([]);
   await expect(heldActor(page,action)).toHaveAttribute('data-state','1');
   await lift(page,input);expect(await page.evaluate(()=>commands)).toEqual([action]);
   await button(page,'save').click();await expect(page.locator('dialog')).toBeVisible();
   expect(await page.evaluate(()=>commands)).toEqual([action,'save']);
  }finally{release();await lift(page,input);}
 });
});
