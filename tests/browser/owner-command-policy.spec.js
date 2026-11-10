import {test,expect} from '@playwright/test';
const b=(p,n)=>p.locator(`#hit-layer [data-action="${n}"]`);
const a=(p,n)=>p.locator(`[data-native-command-motion="${n}"]`);
async function prepare(page){
 await page.addInitScript(()=>{
  window.printCalls=[];window.calls=[];
  window.print=()=>{printCalls.push({state:document.querySelector('[data-native-command-motion="print"]')?.dataset.state,capture:document.querySelector('#hit-layer').hasPointerCapture(1)});if(window.printThrows)throw new Error('mock print');};
  document.addEventListener('click',e=>{const n=e.target.closest('#hit-layer [data-action]')?.dataset.action;if(n)calls.push(n);});
 });
 await page.goto('/');await expect(a(page,'help')).toBeVisible();await expect(a(page,'new')).toBeVisible();await expect(a(page,'print')).toBeVisible();
}
for(const name of ['new','print','help'])for(const key of ['Enter',' '])test(`${name} ${key} repeat, Shift and matching release`,async({page})=>{
 await prepare(page);await b(page,name).focus();await page.keyboard.down(key);await page.keyboard.down(key);await page.keyboard.press('Shift');expect(await page.evaluate(()=>calls)).toEqual([]);
 await page.keyboard.up(key);expect(await page.evaluate(()=>calls)).toEqual([name]);await expect(a(page,name)).toHaveAttribute('data-state',name==='help'?'2':'0');
});
for(const choice of ['Cancel','Escape','New Picture'])test(`New resets before confirmation, ${choice} preserves document contract`,async({page})=>{
 await prepare(page);await page.getByRole('textbox',{name:'Picture title',exact:true}).fill('Keep me');
 await page.evaluate(()=>{const show=HTMLDialogElement.prototype.showModal;window.dialogStates=[];HTMLDialogElement.prototype.showModal=function(){dialogStates.push(document.querySelector('[data-native-command-motion="new"]').dataset.state);return show.call(this);};});
 await b(page,'new').click();await expect(page.locator('dialog')).toBeVisible();expect(await page.evaluate(()=>dialogStates)).toEqual(['0']);await expect(page.getByRole('textbox',{name:'Picture title',exact:true})).toHaveValue('Keep me');
 if(choice==='Escape')await page.keyboard.press('Escape');else await page.locator('#dialog-actions').getByRole('button',{name:choice,exact:true}).click();
 await expect(page.locator('dialog')).not.toBeVisible();await expect(a(page,'new')).toHaveAttribute('data-state','0');
 if(choice!=='New Picture')await expect(page.getByRole('textbox',{name:'Picture title',exact:true})).toHaveValue('Keep me');else await expect(page.getByRole('textbox',{name:'Picture title',exact:true})).not.toHaveValue('Keep me');
});
for(const throws of [false,true])test(`Print immediate reset and synchronous mock ${throws?'throw':'return'}, redundant cleanup events`,async({page})=>{
 await prepare(page);await page.evaluate(x=>window.printThrows=x,throws);await b(page,'print').click();
 expect(await page.evaluate(()=>printCalls)).toEqual([{state:'0',capture:false}]);await expect(a(page,'print')).toHaveAttribute('data-state','0');
 await page.evaluate(()=>{for(const type of ['beforeprint','afterprint','afterprint'])window.dispatchEvent(new Event(type));});
 await b(page,'print').evaluate(b=>b.click());expect(await page.evaluate(()=>printCalls.length)).toBe(2);
});
for(const reason of ['blur','pagehide','hidden','disable','pointercancel'])test(`Help ${reason} retains authoritative boolean and Escape clears it`,async({page})=>{
 await prepare(page);await b(page,'help').click();await expect(a(page,'help')).toHaveAttribute('data-state','2');
 await b(page,'help').hover();await page.mouse.down();
 await page.evaluate(reason=>{
  if(reason==='disable')document.querySelector('#hit-layer [data-action="help"]').disabled=true;
  else if(reason==='hidden'){Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));}
  else if(reason==='pointercancel')document.querySelector('#hit-layer').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));
  else window.dispatchEvent(new Event(reason));
 },reason);await page.mouse.up();
 await page.evaluate(()=>{document.querySelector('#hit-layer [data-action="help"]').disabled=false;Object.defineProperty(document,'hidden',{value:false,configurable:true});});
 await page.mouse.move(500,400);await b(page,'help').hover();await expect(a(page,'help')).toBeVisible();await expect(a(page,'help')).toHaveAttribute('data-state','2');
 await page.keyboard.press('Escape');await expect(a(page,'help')).toHaveAttribute('data-state','0');
 await b(page,'help').evaluate(b=>b.click());await expect(a(page,'help')).toHaveAttribute('data-state','2');await b(page,'help').evaluate(b=>b.click());await expect(a(page,'help')).toHaveAttribute('data-state','0');
});
for(const command of ['print','help'])for(const held of ['save','tray:backgrounds'])for(const input of ['pointer','Space'])test(`semantic ${command} preserves held ${held} ${input}`,async({page})=>{
 await prepare(page);const control=b(page,held);if(input==='pointer'){await control.hover();await page.mouse.down();}else{await control.focus();await page.keyboard.down(' ');}
 await b(page,command).evaluate(b=>b.click());expect(await page.evaluate(()=>calls)).toEqual([command]);
 if(input==='pointer')await page.mouse.up();else await page.keyboard.up(' ');
 expect(await page.evaluate(()=>calls)).toEqual([command,held]);if(held==='save')await expect(page.locator('dialog')).toBeVisible();else await expect(control).toHaveAttribute('aria-pressed','true');
});
for(const name of ['new','print','help'])for(const slot of [0,1,2,3])test(`${name} requires native mode1 slot ${slot}`,async({page})=>{
 await page.route('**/ui/ui.json*',async r=>{const response=await r.fetch(),json=await response.json();json.buttonAnimations.buttons.find(b=>b.name===name).stateScripts[slot]=0;await r.fulfill({response,json});});
 await page.goto('/');await expect(page.locator('[data-native-tool-tab-motion="draw"]')).toBeVisible();await expect(a(page,name)).toHaveCount(0);
 if(name==='print')await page.evaluate(()=>window.print=()=>{window.printed=true;});await b(page,name).click();if(name==='new')await expect(page.locator('dialog')).toBeVisible();if(name==='print')expect(await page.evaluate(()=>printed)).toBe(true);if(name==='help')await expect(page.locator('#status')).toContainText('Move over a tool');
});
for(const name of ['new','print','help'])for(const input of ['pointer','Space'])test(`same-control semantic ${name} consumes only older ${input} proposal`,async({page})=>{
 await prepare(page);if(input==='pointer'){await b(page,name).hover();await page.mouse.down();}else{await b(page,name).focus();await page.keyboard.down(' ');}
 await b(page,name).evaluate(b=>b.click());if(input==='pointer')await page.mouse.up();else await page.keyboard.up(' ');expect(await page.evaluate(()=>calls)).toEqual([name]);
});
test('New clears painted document and history only on acceptance',async({page})=>{
 await prepare(page);const undo=page.locator('#hit-layer [data-action="undo"]'),redo=page.locator('#hit-layer [data-action="redo"]');
 await page.mouse.move(300,350);await page.mouse.down();await page.mouse.move(450,400,{steps:12});await page.mouse.up();await expect(undo).toBeEnabled();
 await b(page,'new').click();await expect(undo).toBeEnabled();await page.locator('#dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();await expect(undo).toBeEnabled();
 await b(page,'new').click();await page.locator('#dialog-actions').getByRole('button',{name:'New Picture',exact:true}).click();await expect(undo).toBeDisabled();await expect(redo).toBeDisabled();
});
test.describe('new commands physical touch ownership',()=>{
 test.use({hasTouch:true});
 for(const name of ['new','print','help'])test(`${name} competitor rejected and fresh touch once`,async({page})=>{
  await prepare(page);await b(page,'save').focus();await page.keyboard.down(' ');const box=await b(page,name).boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);expect(await page.evaluate(()=>calls)).toEqual([]);
  await page.keyboard.press('Escape');await page.keyboard.up(' ');await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);expect(await page.evaluate(()=>calls)).toEqual([name]);
 });
});
for(const truncated of [true,false])test(`truncated mode1 ${truncated?'slot array':'missing final slot'} rejects owner`,async({page})=>{
 await page.route('**/ui/ui.json*',async r=>{const response=await r.fetch(),json=await response.json(),record=json.buttonAnimations.buttons.find(b=>b.name==='help');if(truncated)record.stateScripts.length=3;else record.stateScripts[3]=0;await r.fulfill({response,json});});
 await page.goto('/');await expect(page.locator('[data-native-tool-tab-motion="draw"]')).toBeVisible();await expect(a(page,'help')).toHaveCount(0);await b(page,'help').click();await expect(page.locator('#status')).toContainText('Move over a tool');
});
