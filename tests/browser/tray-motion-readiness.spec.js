import {test,expect} from '@playwright/test';

const semantic=(page,action)=>page.locator(`[data-action="${action}"]`).last().evaluate(button=>button.click());
const primary=page=>page.locator('canvas[data-native-tool-motion="grab"]');
async function gateAsset(page,pattern){
 let release,arrive;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>arrive=resolve);
 await page.route(pattern,async route=>{arrive();await gate;await route.continue();});
 return{release,requested};
}
async function textObject(page,second=false){
 await page.addInitScript(()=>{
  const synth=window.speechSynthesis;let voices=['a','b','c'].map(voiceURI=>({voiceURI,name:'Same name',lang:'en-US'}));
  synth.getVoices=()=>voices;
  window.refreshVoices=values=>{voices=values.map(voiceURI=>({voiceURI,name:'Same name',lang:'en-US'}));synth.dispatchEvent(new Event('voiceschanged'));};
  window.cutMutations=0;let count=0;
  document.addEventListener('scenechange',()=>{const next=document.querySelectorAll('.object-text').length;if(next<count)cutMutations+=count-next;count=next;},true);
 });
 await page.goto('/');await expect(page.locator('canvas[data-native-tool-motion="draw"]')).toBeVisible();
 await semantic(page,'tray:text');await page.locator('#paper-canvas').click({position:{x:150,y:140}});
 await page.locator('.object-text').fill('First');
 if(second){await page.locator('#paper-canvas').click({position:{x:420,y:320}});await page.locator('.object-text').last().fill('Second');}
 await page.locator('#text-voice').selectOption('b');
 await semantic(page,'tray:grab');
}
async function hold(page,control,input){
 if(input==='pointer'){await control.hover();await page.mouse.down();}
 else{await control.focus();await page.keyboard.down(' ');}
}
const releaseInput=(page,input)=>input==='pointer'?page.mouse.up():page.keyboard.up(' ');
async function verifyCutHistory(page){
 await expect(page.locator('.object-text')).toHaveCount(0);
 expect(await page.evaluate(()=>cutMutations)).toBe(1);
 await semantic(page,'undo');await expect(page.locator('.object-text')).toHaveText('First');
 await semantic(page,'redo');await expect(page.locator('.object-text')).toHaveCount(0);
}
for(const input of ['pointer','Space'])for(const timing of ['before','during','after'])test(`primary readiness ${timing} fallback Cut ${input} preserves one command and history`,async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;
  if(timing==='before'){gate.release();await expect(primary(page)).toBeVisible();}
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');
  await cut.evaluate(button=>window.heldCut=button);await hold(page,cut,input);
  await page.evaluate(()=>{refreshVoices(['a','b','c']);refreshVoices(['c','b','a']);});
  let preserved=true;
  if(timing==='during'){
   gate.release();await expect(primary(page)).toBeVisible();
   preserved=await cut.evaluate(button=>button===window.heldCut&&window.heldCut.isConnected);
   if(input==='Space')await expect(cut).toBeFocused();
  }
  await releaseInput(page,input);
  await verifyCutHistory(page);
  expect(preserved,'Same-target art readiness must retain the held semantic button').toBe(true);
  if(timing==='after'){gate.release();await expect(primary(page)).toBeVisible();}
 }finally{gate.release();await releaseInput(page,input);}
});
test('primary readiness during fallback Cut does not require voice notifications',async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');
  await cut.evaluate(button=>window.heldCut=button);await hold(page,cut,'pointer');
  gate.release();await expect(primary(page)).toBeVisible();await page.mouse.up();
  await verifyCutHistory(page);
  expect(await cut.evaluate(button=>button===window.heldCut&&window.heldCut.isConnected)).toBe(true);
 }finally{gate.release();await page.mouse.up();}
});
for(const input of ['pointer','Space'])test(`action readiness preserves held fallback Cut ${input}`,async({page})=>{
 const gate=await gateAsset(page,/\/secondary-motion\/manifest\.json(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;await expect(primary(page)).toBeVisible();
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');
  await cut.evaluate(button=>window.heldCut=button);await hold(page,cut,input);
  gate.release();await expect(page.locator('canvas[data-native-action-motion]')).toBeVisible();
  expect(await cut.evaluate(button=>button===window.heldCut&&button.isConnected)).toBe(true);
  if(input==='Space')await expect(cut).toBeFocused();
  await releaseInput(page,input);await verifyCutHistory(page);
 }finally{gate.release();await releaseInput(page,input);}
});
for(const input of ['pointer','Space'])test(`selector readiness preserves held fallback mode ${input}`,async({page})=>{
 const gate=await gateAsset(page,/\/secondary-motion\/manifest\.json(?:\?|$)/);
 try{
  await page.goto('/');await expect(page.locator('canvas[data-native-tool-motion="draw"]')).toBeVisible();
  await semantic(page,'tray:paint');await gate.requested;
  const mode=page.locator('#tray-buttons [data-action="mode:true"]');
  await mode.evaluate(button=>{
   window.heldMode=button;window.modeChanges=[];const canvas=document.querySelector('#paper-canvas');
   new MutationObserver(records=>{for(const record of records)if(record.oldValue!==canvas.dataset.paintStyle)modeChanges.push([record.oldValue,canvas.dataset.paintStyle]);})
    .observe(canvas,{attributes:true,attributeFilter:['data-paint-style'],attributeOldValue:true});
  });
  await hold(page,mode,input);gate.release();
  await expect(page.locator('[data-native-secondary-motion="paint:18001"]')).toBeVisible();
  expect(await mode.evaluate(button=>button===window.heldMode&&button.isConnected)).toBe(true);
  if(input==='Space')await expect(mode).toBeFocused();
  await releaseInput(page,input);
  await expect(page.locator('#tray-buttons [data-action="mode:true"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>modeChanges)).toEqual([['paint','wacky']]);
 }finally{gate.release();await releaseInput(page,input);}
});
for(const reason of ['Escape','focusout','blur'])test(`fallback Cut Space cancellation by ${reason} preserves later semantic activation`,async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');await hold(page,cut,'Space');
  gate.release();await expect(primary(page)).toBeVisible();
  if(reason==='Escape')await page.keyboard.press('Escape');
  else if(reason==='focusout')await page.getByRole('textbox',{name:'Picture title',exact:true}).focus();
  else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.keyboard.up(' ');await expect(page.locator('.object-text')).toHaveCount(1);
  await cut.evaluate(button=>button.click());await verifyCutHistory(page);
 }finally{gate.release();await page.keyboard.up(' ');}
});
test('held fallback Cut Space blocks another pointer after unrelated Shift release',async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;
  await hold(page,page.locator('#tray-buttons [data-action="edit:cut"]'),'Space');
  await page.keyboard.press('Shift');gate.release();await expect(primary(page)).toBeVisible();
  await page.locator('[data-action="tray:paint"]').click();
  await expect(page.locator('[data-action="tray:grab"]')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.up(' ');await verifyCutHistory(page);
 }finally{gate.release();await page.keyboard.up(' ');}
});
test('fallback Cut release outside cancels across readiness and permits a fresh press',async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');await hold(page,cut,'pointer');
  gate.release();await expect(primary(page)).toBeVisible();await page.mouse.move(800,400);await page.mouse.up();
  await expect(page.locator('.object-text')).toHaveText('First');expect(await page.evaluate(()=>cutMutations)).toBe(0);
  await cut.click();await verifyCutHistory(page);
 }finally{gate.release();await page.mouse.up();}
});
test('fallback Cut rejects a changed scene target even when its button survives readiness',async({page})=>{
 await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
 const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
 try{
  await textObject(page);await gate.requested;await semantic(page,'edit:copy');
  const cut=page.locator('#tray-buttons [data-action="edit:cut"]');await cut.evaluate(button=>window.heldCut=button);
  await hold(page,cut,'pointer');
  // An independent command changes the selected object without replacing the
  // tray, matching a document/selection update before the original release.
  await page.locator('#menu-items [data-action="edit:paste"]').evaluate(button=>button.click());
  await expect(page.locator('.object-text')).toHaveCount(2);
  gate.release();await expect(primary(page)).toBeVisible();
  expect(await cut.evaluate(button=>button===window.heldCut&&button.isConnected)).toBe(true);
  await page.mouse.up();await expect(page.locator('.object-text')).toHaveCount(2);
  expect(await page.evaluate(()=>cutMutations)).toBe(0);
  await cut.click();await expect(page.locator('.object-text')).toHaveText('First');
 }finally{gate.release();await page.mouse.up();}
});
test.describe('fallback touch',()=>{
 test.use({hasTouch:true});
 test('a real fallback Cut tap works before artwork and permits a fresh tap',async({page})=>{
  await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
  const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
  try{
   await textObject(page);await gate.requested;
   const cut=page.locator('#tray-buttons [data-action="edit:cut"]');
   await cut.tap();await verifyCutHistory(page);
   await semantic(page,'undo');await expect(page.locator('.object-text')).toHaveCount(1);
   await page.locator('.object-text').tap();
   await cut.tap();await expect(page.locator('.object-text')).toHaveCount(0);
   expect(await page.evaluate(()=>cutMutations)).toBe(3);
   gate.release();await expect(primary(page)).toBeVisible();
  }finally{gate.release();}
 });
 test('a held fallback Cut pointer rejects competing canvas touch',async({page})=>{
  await page.route(/\/secondary-motion\/manifest\.json(?:\?|$)/,route=>route.abort());
  const gate=await gateAsset(page,/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/);
  try{
   await textObject(page,true);await gate.requested;
   const cut=page.locator('#tray-buttons [data-action="edit:cut"]');await hold(page,cut,'pointer');
   const first=await page.locator('.object-text').first().boundingBox();
   await page.touchscreen.tap(first.x+20,first.y+20);
   await expect(page.locator('.scene-object.is-selected .object-text')).toHaveText('Second');
   gate.release();await expect(primary(page)).toBeVisible();await page.mouse.up();
   await expect(page.locator('.object-text')).toHaveText('First');expect(await page.evaluate(()=>cutMutations)).toBe(1);
   await semantic(page,'undo');await expect(page.locator('.object-text')).toHaveText(['First','Second']);
   await semantic(page,'redo');await expect(page.locator('.object-text')).toHaveText('First');
  }finally{gate.release();await page.mouse.up();}
 });
});
