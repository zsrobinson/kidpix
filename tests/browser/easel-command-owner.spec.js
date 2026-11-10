import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
for(const reason of ['cancel','dispose','modal'])test(`pending command decode cannot resurrect after ${reason} @module`,async({page})=>{
 await page.route('**/command-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root"><button data-action="save">Save</button><button data-action="stereo">Export</button></div><div id="layer"></div><dialog></dialog>'}));
 await page.route('**/src/*.js',r=>{const name=new URL(r.request().url()).pathname.split('/').at(-1);return r.fulfill({contentType:'application/javascript',body:readFileSync(new URL(`../../src/${name}`,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'")});});
 await page.goto('/command-fixture');await page.evaluate(async()=>{
  const RealImage=Image;window.decodes=[];window.cues=[];window.Image=class extends RealImage{decode(){return new Promise((resolve,reject)=>decodes.push(()=>super.decode().then(resolve,reject)));}};
  window.Audio=class{constructor(src){cues.push(src);}play(){return Promise.resolve();}pause(){}};
  const manifest=await(await fetch('/original/ui/ui.json')).json(),sprites=new Map();
  for(const name of ['save','export']){const img=document.createElement('img');img.dataset.idle=name;document.querySelector('#layer').append(img);sprites.set(name,img);}
  const {attachCommandMotion}=await import('/src/native-command-motion.js');window.owner=attachCommandMotion(manifest,document.querySelector('#root'),sprites,document.querySelector('#layer'));
 });
 await page.evaluate(async reason=>{if(reason==='modal'){document.querySelector('dialog').showModal();await new Promise(r=>setTimeout(r,0));}else owner[reason]();await Promise.all(decodes.map(r=>r()));},reason);
 expect(await page.evaluate(()=>owner.names.some(n=>owner.ready(n)))).toBe(false);expect(await page.evaluate(()=>cues.length)).toBe(0);
 if(reason==='dispose')await expect(page.locator('[data-native-command-motion]')).toHaveCount(0);
});
