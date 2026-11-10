import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Independent raw clipboard fixture: each new script is visited once in the Text profile.
const clipboard = JSON.parse(readFileSync('tests/fixtures/text-clipboard-source.json'));
const clipboardFrames = Object.values(clipboard.programs).reduce((n, s) => n + s.frames.length, 0);

test('bounded backing stores preserve every source frame against full native targets @module', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const result = await page.evaluate(async clipboardIds => {
    const { loadDrawingMotionAssets, paintDrawingMotionFrame } = await import('/src/native-drawing-motion.js');
    const { motionCanvasBounds } = await import('/src/native-tool-motion.js');
    const { secondaryManifest, secondaryProfiles } = await import('/src/native-secondary-motion.js');
    const { actionManifest } = await import('/src/native-action-motion.js');
    const resolve = p => `/original/ui/${p}`;
    const [primary, secondary] = await Promise.all(['tool-motion','secondary-motion'].map(async p => (await fetch(resolve(`${p}/manifest.json`))).json()));
    const manifests = Object.values(primary.trays);
    for(const tray of ['draw','paint','eraser','mixer']) for(const selected of ['pencil','brush','sound','spray','round'])
      for(const eraserShape of tray === 'eraser' ? ['round','square'] : ['round'])
        for(const profile of secondaryProfiles({tray,selected,eraserShape})) manifests.push(secondaryManifest(secondary,profile));
    for(const profile of [{table:9383,rows:[2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18]},
      {table:926,rows:[2,3,4]}, {table:926,rows:[2,3,4,6,7,8,9]},
      {table:18700,rows:[1,2]}, {table:18700,rows:[3]}, {table:18202,rows:[0,1,2]}]) manifests.push(actionManifest(secondary,profile));
    const chrome = new Image(); chrome.src=resolve('paint-empty.png');await chrome.decode();
    let frames=0;const failures=[];const seen=new Set();const clipboardCoverage=[];
    for(const manifest of manifests){
      const key=Object.keys(manifest.scripts).sort().join(',');if(seen.has(key))continue;seen.add(key);
      const assets=await loadDrawingMotionAssets(manifest,{resolve});
      const viewport=motionCanvasBounds(manifest),[left,top,width,height]=viewport;
      const parts=Object.values(manifest.scripts).flatMap(s=>s.frames.flatMap(f=>f.parts));
      const x0=Math.min(...parts.map(p=>p.x)),y0=Math.min(...parts.map(p=>p.y));
      const x1=Math.max(...parts.map(p=>p.x+manifest.sprites[p.sprite].width)),y1=Math.max(...parts.map(p=>p.y+manifest.sprites[p.sprite].height));
      const restore=manifest.restorationRects||[[x0,y0,x1-x0,y1-y0]];
      const full=document.createElement('canvas'),local=document.createElement('canvas');
      full.width=1024;full.height=768;local.width=width;local.height=height;
      const fullCtx=full.getContext('2d',{willReadFrequently:true}),localCtx=local.getContext('2d',{willReadFrequently:true});
      localCtx.translate(-left,-top);
      for(const [id,script] of Object.entries(manifest.scripts))for(const [i,frame] of script.frames.entries()){
        if (manifest.buttons.some(b => b.action?.startsWith('text-clipboard:')) && clipboardIds.includes(id)) clipboardCoverage.push(`${id}:${i}`);
        const clipRect = manifest.buttons.find(b=>b.rolloverScript===Number(id))?.auxiliaryClipRect;
        for(const [ctx,origin] of [[fullCtx,[0,0]],[localCtx,[left,top]]]){
          ctx.clearRect(origin[0],origin[1],ctx.canvas.width,ctx.canvas.height);
          ctx.save();ctx.beginPath();for(const r of restore)ctx.rect(...r);ctx.clip();ctx.drawImage(chrome,0,0);ctx.restore();
          paintDrawingMotionFrame(ctx,manifest,frame,assets,[47,126,239],{clipRect,origin});
        }
        const a=fullCtx.getImageData(left,top,width,height).data,b=localCtx.getImageData(0,0,width,height).data;
        let count=0;for(let p=0;p<a.length;p++)if(a[p]!==b[p])count++;
        if(count)failures.push({id,i,count});frames++;
      }
    }
    return {frames,failures,clipboardCoverage};
  }, Object.keys(clipboard.programs));
  console.log(JSON.stringify({boundedSourceFrames:result.frames,differences:result.failures.length}));
  expect(result.frames).toBe(672 + clipboardFrames);
  expect(result.failures).toEqual([]);
  expect(result.clipboardCoverage.sort()).toEqual(Object.entries(clipboard.programs)
    .flatMap(([id, s]) => s.frames.map((_, i) => `${id}:${i}`)).sort());
});
