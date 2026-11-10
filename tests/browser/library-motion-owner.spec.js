import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async({page})=>{
  await page.route('**/motion-fixture',route=>route.fulfill({contentType:'text/html',body:'<style>#root{position:absolute;inset:0;width:1024px;height:768px}.native-sprite{position:absolute}</style><div id="root"><button data-action="tray:backgrounds" aria-pressed="false">Backgrounds</button></div><div id="layer" style="pointer-events:none"></div>'}));
  await page.route('**/src/*.js',route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    const body=readFileSync(new URL(`../../src/${name}`,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'");
    return route.fulfill({contentType:'application/javascript',body});
  });
  await page.goto('/motion-fixture');
  await page.evaluate(async()=>{
    const RealImage=window.Image;window.releaseDecodes=[];
    window.Image=class extends RealImage {decode(){return new Promise((resolve,reject)=>releaseDecodes.push(()=>super.decode().then(resolve,reject)));}};
    const manifest=await (await fetch('/original/ui/ui.json')).json();
    const idle=document.createElement('img');idle.id='idle';idle.src='/original/ui/backgrounds-0.png';document.querySelector('#layer').append(idle);
    const {attachLibraryMotion}=await import('/src/native-library-motion.js');
    window.owner=attachLibraryMotion(manifest,document.querySelector('#root'),new Map([['backgrounds',idle]]),document.querySelector('#layer'));
  });
});
// This fixture imports source modules explicitly, independently of the app build.
for(const reason of ['pagehide','dispose']) test(`pending decodes cannot resurrect after ${reason} @module`,async({page})=>{
  await page.evaluate(async reason=>{
    if(reason==='dispose')owner.dispose();else window.dispatchEvent(new Event('pagehide'));
    await Promise.all(releaseDecodes.map(release=>release()));
  },reason);
  await expect.poll(()=>page.evaluate(()=>owner.ready('backgrounds'))).toBe(false);
  await page.waitForFunction(()=>[...document.images].every(i=>!i.src||i.complete));
  expect(await page.evaluate(()=>owner.ready('backgrounds'))).toBe(false);
  await expect(page.locator('#idle')).toBeVisible();
  if(reason==='dispose') await expect(page.locator('[data-native-library-motion]')).toHaveCount(0);
  else {
    await expect.poll(async()=>{
      await page.getByRole('button',{name:'Backgrounds',exact:true}).dispatchEvent('pointerenter',{pointerId:1,pointerType:'mouse',buttons:0});
      return page.evaluate(()=>owner.ready('backgrounds'));
    }).toBe(true);
  }
});
