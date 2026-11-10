import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const names=['mixer','grab','eraser','text','stamp','draw','paint','fill'];
const action=name=>`tray:${name==='fill'?'bucket':name}`;
test.beforeEach(async({page})=>{
 await page.route('**/tab-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root" style="width:1024px;height:768px"></div><div id="layer"></div>'}));
 await page.route('**/src/*.js',route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  return route.fulfill({contentType:'application/javascript',body:readFileSync(new URL(`../../src/${name}`,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'")});
 });
 await page.goto('/tab-fixture');
});
async function setup(page,selected){
 await page.evaluate(async({names,selected})=>{
  window.selection=selected;window.cues=[];window.decodes=[];
  window.Audio=class extends EventTarget {constructor(src){super();this.src=src;cues.push(this);}play(){return new Promise(()=>{});}pause(){this.dispatchEvent(new Event('pause'));}};
  const RealImage=Image;
  window.Image=class extends RealImage {decode(){return new Promise((resolve,reject)=>decodes.push(()=>super.decode().then(resolve,reject)));}};
  const manifest=await(await fetch('/original/ui/ui.json')).json();
  const sprites=new Map();
  for(const name of names){
   const b=document.createElement('button');b.dataset.action=`tray:${name==='fill'?'bucket':name}`;document.querySelector('#root').append(b);
   const img=document.createElement('img');document.querySelector('#layer').append(img);sprites.set(name,img);
  }
  const {attachToolTabMotion}=await import('/src/native-tool-tab-motion.js');
  window.owner=attachToolTabMotion(manifest,document.querySelector('#root'),sprites,document.querySelector('#layer'),{readSelection:()=>selection});
 },{names,selected});
}
for(const name of names)for(const reverse of [false,true])test(`silent ${name} hydration decode order ${reverse} @module`,async({page})=>{
 await setup(page,name==='fill'?'bucket':name);
 await page.evaluate(async reverse=>{const pending=reverse?[...decodes].reverse():decodes;for(const resolve of pending)await resolve();},reverse);
 await expect.poll(()=>page.evaluate(()=>owner.names.every(n=>owner.ready(n)))).toBe(true);
 expect(await page.evaluate(()=>cues.length)).toBe(0);
 for(const n of names){const a=page.locator(`[data-native-tool-tab-motion="${n}"]`);await expect(a).toHaveAttribute('data-state',n===name?'2':'0');await expect(a).toHaveAttribute('data-finished','true');}
});
for(const reason of ['cancel','dispose'])test(`generation rejects pending decode after ${reason} @module`,async({page})=>{
 await setup(page,'draw');
 await page.evaluate(async reason=>{owner[reason]();await Promise.all(decodes.map(resolve=>resolve()));},reason);
 expect(await page.evaluate(()=>owner.names.some(n=>owner.ready(n)))).toBe(false);
 expect(await page.evaluate(()=>cues.length)).toBe(0);
});
test('synchronous transient selection and no-op activation reconciliation @module',async({page})=>{
 await setup(page,'draw');await page.evaluate(async()=>{await Promise.all(decodes.map(r=>r()));});
 await page.evaluate(()=>{selection='stamp';owner.updateSelection(selection);selection='grab';owner.updateSelection(selection);owner.updateSelection(selection);});
 expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1001.wav')).length)).toBe(2);
 expect(await page.evaluate(()=>cues.filter(a=>a.src.includes('easel-1002.wav')).length)).toBe(2);
 await page.locator(`[data-action="${action('paint')}"]`).evaluate(b=>b.click());
 await page.evaluate(()=>owner.completeActivation());
 await expect(page.locator('[data-native-tool-tab-motion="paint"]')).toHaveAttribute('data-state','0');
 await expect(page.locator('[data-native-tool-tab-motion="grab"]')).toHaveAttribute('data-state','2');
});
