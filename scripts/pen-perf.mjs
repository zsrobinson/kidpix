// Sequential, warm real-studio pen workload. No fake clocks or network stress.
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const output = path.resolve(process.env.PERF_OUT || 'artifacts/pen-perf');
await mkdir(output, { recursive: true });
const seedPlugin = { name:'pen-perf-seed', enforce:'pre',
 async load(id) { if(process.env.REFERENCE_MARKER_SOURCE && id.endsWith('/src/native-marker.js')) return readFile(process.env.REFERENCE_MARKER_SOURCE,'utf8'); if(process.env.REFERENCE_SOURCE && id.endsWith('/src/paint-original.js')) return readFile(process.env.REFERENCE_SOURCE,'utf8'); },
 transform(code,id) { if(id.endsWith('/src/paint.js')) {
  const expression='makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))';
  if(!code.includes(expression))throw Error('Stroke seed seam changed; update benchmark');
  code=code.replace(expression,'makeRandom(53)');
  if(process.env.REFERENCE_MARKER_SOURCE)code=code.replace('deferUploads: true, ','').replace('      current.nativeMarker.flush()\n','');
  return code;
 } },
};
const server = await createServer({configLoader:"runner", plugins:[seedPlugin], cacheDir: `${output}/cache`, server: { host:'127.0.0.1', port:4241, strictPort:true, watch:{ignored:['**/*']}, hmr:false } });
await server.listen();
let browser;
const rows=[], phases=[];
let revision=process.env.REVISION||'unknown';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
try {
 const engine=process.env.ENGINE || 'chromium';
 browser=await ({ chromium, webkit }[engine]).launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:1024},hasTouch:true,deviceScaleFactor:2});
 const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  const metrics={events:[],frames:[],nextRAF:[],longTasks:[],canvas:{},enabled:false,longTaskSupported:PerformanceObserver.supportedEntryTypes.includes('longtask')}; window.penMetrics=metrics;
  for(const name of ['getImageData','putImageData','drawImage','clearRect','fillRect']){
   const original=CanvasRenderingContext2D.prototype[name];
   CanvasRenderingContext2D.prototype[name]=function(...args){
    if(!metrics.enabled)return original.apply(this,args);
    const start=performance.now(); const result=original.apply(this,args);
    const entry=metrics.canvas[name]??={count:0,ms:0};entry.count++;entry.ms+=performance.now()-start;return result;
   };
  }
  let last;function frame(now){if(metrics.enabled&&last>=metrics.started)metrics.frames.push(now-last);last=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);
  if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{if(metrics.enabled)metrics.longTasks.push(...list.getEntries().map(e=>e.duration))}).observe({type:'longtask'});
  document.addEventListener('pointermove',e=>{if(!metrics.enabled||e.target.id!=='paper-canvas')return;const start=performance.now();e.__perfStart=start;metrics.events.push({start,trusted:e.isTrusted,samples:e.getCoalescedEvents?.().length||1});requestAnimationFrame(()=>metrics.nextRAF.push(performance.now()-start));},true);
  document.addEventListener('pointermove',e=>{if(e.__perfStart!=null)metrics.events.at(-1).ms=performance.now()-e.__perfStart;});
 });
 const cdp=engine==='chromium'?await page.context().newCDPSession(page):null;
 if(cdp){await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.CPU||1)});}
 const calibration=await page.evaluate(()=>{const times=[];let value=53;for(let run=0;run<6;run++){const start=performance.now();for(let i=0;i<3000000;i++)value=(Math.imul(value,1664525)+1013904223)>>>0;times.push(performance.now()-start);}return{times:times.slice(1),value};});
 await page.goto('http://127.0.0.1:4241/');
 await page.waitForSelector('[data-native-tool-motion="draw"]');

 if(process.env.PHASES){
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{})));});
  for(const phase of ['idle','tool-hover']){
   if(phase==='tool-hover')await page.locator('[data-native-tool-motion="draw"]').hover({force:true});
   await page.evaluate(()=>{const m=window.penMetrics;m.events=[];m.frames=[];m.nextRAF=[];m.longTasks=[];m.canvas={};m.started=performance.now();m.enabled=true;});
   await page.waitForTimeout(1500);
   phases.push({phase,...await page.evaluate(()=>{window.penMetrics.enabled=false;return window.penMetrics;})});
  }
 }
 const tools=(process.env.TOOLS||'pencil,chalk,crayon,marker').split(',');
 for(let trial=0;trial<Number(process.env.TRIALS||3);trial++)for(const tool of tools)for(const size of (process.env.SIZES||'8,16').split(',').map(Number))for(const mode of (process.env.MODES||'replay120,replay240,cdp').split(',')){
  if(mode==='cdp'&&!cdp)continue;
  await page.locator(`#tray-buttons [data-action="tool:${tool}"]`).evaluate(el=>el.click());
  await page.locator(`#tray-buttons [data-action="size:${size}"]`).evaluate(el=>el.click());
  await page.evaluate(mode=>{const c=document.querySelector('#paper-canvas');if(!c.__capture)c.__capture=[c.setPointerCapture,c.releasePointerCapture];[c.setPointerCapture,c.releasePointerCapture]=mode==='cdp'?c.__capture:[()=>{},()=>{}];},mode);
  await page.locator('#paper-canvas[data-paint-ready="ready"]').waitFor();
  await page.waitForTimeout(250);
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{})));});
  // Warm selected brush through the same app input path, then undo it.
  const box=await page.locator('#paper-canvas').boundingBox();
  const at=(i)=>({x:box.x+(60+Math.abs(((i*Number(process.env.SPEED||5))%1200)-600))*box.width/720,y:box.y+(160+60*Math.sin(i/12))*box.height/542});
  const send=async(type,i)=>{
   if(mode==='cdp')return cdp.send('Input.dispatchMouseEvent',{type,...at(i),button:'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1,pointerType:'pen',force:type==='mouseReleased'?0:.5+.35*Math.sin(i/17)});
   return page.evaluate(({type,p,previous,mode,i})=>{const target=document.querySelector('#paper-canvas');const eventType={mousePressed:'pointerdown',mouseMoved:'pointermove',mouseReleased:'pointerup'}[type];const make=(x,y,pressure)=>new PointerEvent(eventType,{pointerId:77,pointerType:'pen',clientX:x,clientY:y,pressure,button:0,buttons:eventType==='pointerup'?0:1,bubbles:true});const event=make(p.x,p.y,type==='mouseReleased'?0:.5+.35*Math.sin(i/17));if(type==='mouseMoved')Object.defineProperty(event,'getCoalescedEvents',{value:()=>Array.from({length:mode==='replay240'?4:2},(_,j)=>{const t=(j+1)/(mode==='replay240'?4:2);return make(previous.x+(p.x-previous.x)*t,previous.y+(p.y-previous.y)*t,.5+.35*Math.sin((i-1+t)/17));})});target.dispatchEvent(event);},{type,p:at(i),previous:at(Math.max(0,i-1)),mode,i});
  };
  await send('mousePressed',0);await send('mouseMoved',1);await send('mouseReleased',1);
  await page.locator('[data-action="undo"]').first().evaluate(el=>el.click());
  await page.waitForTimeout(150);
  if(process.env.PROFILE&&cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  await page.evaluate(()=>{const m=window.penMetrics;m.events=[];m.frames=[];m.nextRAF=[];m.longTasks=[];m.canvas={};m.started=performance.now();m.enabled=true;});
  const start=performance.now();await send('mousePressed',0);
  // 60 event batches/s; 2/4 coalesced samples model 120/240Hz delivery.
  for(let i=1;i<=100;i++){await send('mouseMoved',i);const due=start+i*1000/60;await new Promise(r=>setTimeout(r,Math.max(0,due-performance.now())));}
  await send('mouseReleased',100);await page.waitForTimeout(60);
  const metrics=await page.evaluate(()=>{window.penMetrics.enabled=false;return window.penMetrics;});
  if(process.env.PROFILE&&cdp){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${output}/${tool}-${size}-${mode}-${trial}.cpuprofile`,JSON.stringify(profile));}
  const stats=values=>{const s=values.filter(Number.isFinite).sort((a,b)=>a-b);return{n:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],worst:s.at(-1)}};
  const row={trial,tool,size,mode,elapsed:performance.now()-start,handler:stats(metrics.events.map(e=>e.ms)),frame:stats(metrics.frames),nextRAF:stats(metrics.nextRAF),heap:cdp?(await cdp.send('Performance.getMetrics')).metrics.filter(m=>/Heap|TaskDuration|LayoutCount|RecalcStyleCount/.test(m.name)):null,samples:metrics.events.reduce((n,e)=>n+e.samples,0),trusted:metrics.events.filter(e=>e.trusted).length,over60:metrics.frames.filter(n=>n>1000/60*1.5).length,over120:metrics.frames.filter(n=>n>1000/120*1.5).length,canvas:metrics.canvas,longTasks:metrics.longTasks,metrics};
  rows.push(row);console.log(JSON.stringify({...row,metrics:undefined}));
  await page.locator('[data-action="undo"]').first().evaluate(el=>el.click());
 }
 await writeFile(`${output}/results.json`,JSON.stringify({revision,referenceSource:process.env.REFERENCE_SOURCE||null,speed:Number(process.env.SPEED||5),seed:53,engine,cpu:Number(process.env.CPU||1),browser:browser.version(),errors,calibration,phases,rows},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 if(process.env.MAX_UPLOADS&&rows.some(r=>(r.canvas.putImageData?.count||0)>Number(process.env.MAX_UPLOADS)))process.exitCode=1;
 if(process.env.MAX_READBACKS&&rows.some(r=>(r.canvas.getImageData?.count||0)>Number(process.env.MAX_READBACKS)))process.exitCode=1;
 if(process.env.MAX_HANDLER_MS&&rows.some(r=>r.handler.p95>Number(process.env.MAX_HANDLER_MS)))process.exitCode=1;
}finally{await browser?.close();await server.close();}
