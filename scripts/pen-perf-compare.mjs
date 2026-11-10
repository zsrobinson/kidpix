// Compare the original dab entry against a retained source file, with real masks.
// REFERENCE_SOURCE=artifacts/pen-perf/paint-original-reference.js node scripts/pen-perf-compare.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
if(!process.env.REFERENCE_SOURCE)throw Error('Set REFERENCE_SOURCE to the baseline paint-original.js');
const reference=await readFile(process.env.REFERENCE_SOURCE,'utf8');
const server=await createServer({configLoader:"runner",cacheDir:'artifacts/pen-perf/compare-cache',server:{host:'127.0.0.1',port:4241,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
let browser;
try{
 await server.listen();browser=await chromium.launch();const page=await browser.newPage();
 await page.route('**/src/paint-original-reference.js',r=>r.fulfill({body:reference,contentType:'application/javascript'}));
 await page.goto('http://127.0.0.1:4241/');
 const result=await page.evaluate(async()=>{
  const current=await import('/src/paint-original.js'),previous=await import('/src/paint-original-reference.js');
  const cases=[];
  for(const tool of ['chalk','crayon','marker','brush'])for(const sizeIndex of [0,1,2]){
   const options={tool,sizeIndex,color:'#263a57',variant:'Dry Brush'};
   const dab=current.originalDab(options),image=new Image();image.src=`/original/tools/brushes/${dab.id}.png`;await image.decode();
   for(const color of ['#263a57','#ff3210','#ffffff'])for(const paper of [false,true])for(const invertTexture of [false,true])for(const factor of [.25,1,1.5]){
    const texture=paper?{width:90,height:70,data:Uint8ClampedArray.from({length:90*70},(_,i)=>i*17%256)}:undefined;
    const render=module=>{const canvas=document.createElement('canvas');canvas.width=90;canvas.height=70;const ctx=canvas.getContext('2d');let seed=53;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
     for(const [step,p] of [{x:0,y:0},{x:30,y:35},{x:35,y:35},{x:89,y:69}].entries()){
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(factor,factor);ctx.translate(-p.x,-p.y);
      module.drawOriginalDab(ctx,p,{...options,color,nativeTexture:texture,invertTexture},dab,image,random,step);ctx.restore();
     }return canvas.toDataURL();};
    cases.push({tool,sizeIndex,color,paper,invertTexture,factor,equal:render(current)===render(previous)});
   }
  }return {count:cases.length,failed:cases.filter(c=>!c.equal)};
 });
 await writeFile('artifacts/pen-perf/exact-pixels.json',JSON.stringify(result,null,2));console.log(result);
 if(result.failed.length)process.exitCode=1;
}finally{await browser?.close();await server.close();}
