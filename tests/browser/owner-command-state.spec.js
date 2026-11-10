import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
for(const initiallySelected of [false,true])test(`Help getter reconciles no-op and silently adopts actual owner ${initiallySelected} @module`,async({page})=>{
 await page.route('**/owner-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root"><button data-action="help">Help</button></div><div id="layer"></div>'}));
 await page.route('**/src/*.js',r=>{const name=new URL(r.request().url()).pathname.split('/').at(-1);return r.fulfill({contentType:'application/javascript',body:readFileSync(new URL(`../../src/${name}`,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'")});});
 await page.clock.install();await page.goto('/owner-fixture');
 await page.evaluate(async initial=>{
  window.selected=initial;window.cues=[];window.Audio=class extends EventTarget{constructor(src){super();this.src=String(src);cues.push(this);}play(){return new Promise(()=>{});}pause(){this.stopped=true;}};
  const manifest=await(await fetch('/original/ui/ui.json')).json(),idle=document.createElement('img');document.querySelector('#layer').append(idle);
  const {attachCommandMotion}=await import('/src/native-command-motion.js');window.owner=attachCommandMotion(manifest,document.querySelector('#root'),new Map([['help',idle]]),document.querySelector('#layer'),{readSelection:()=>selected});
  document.querySelector('button').addEventListener('click',()=>{owner.beforeActivation('help');owner.completeActivation();});
 },initiallySelected);
 const actor=page.locator('[data-native-command-motion="help"]');await expect(actor).toBeVisible();await expect(actor).toHaveAttribute('data-state',initiallySelected?'2':'0');expect(await page.evaluate(()=>cues.length)).toBe(0);
 await page.locator('button').evaluate(b=>b.click());await expect(actor).toHaveAttribute('data-state',initiallySelected?'2':'0');expect(await page.evaluate(()=>selected)).toBe(initiallySelected);
 await page.evaluate(()=>owner.cancel());await expect(actor).toHaveAttribute('data-state',initiallySelected?'2':'0');expect(await page.evaluate(()=>selected)).toBe(initiallySelected);
 await page.evaluate(()=>owner.dispose());await expect(actor).toHaveCount(0);
});
