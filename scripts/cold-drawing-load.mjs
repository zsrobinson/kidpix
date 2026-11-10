// Isolated actual-studio cold readiness probe. No production changes or fake clock.
import { chromium, webkit } from '@playwright/test';
import { createServer, build } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { snapshotPNG } from './shared-pen-pixels.mjs';
import { createBrowserBuildServer } from './serve-browser-build.mjs';
const out=resolve(process.env.COLD_OUT || 'artifacts/t3/cold-drawing-load/run');
await mkdir(out,{recursive:true});
const instrument=process.env.INSTRUMENT==='1',engine=process.env.ENGINE||'chromium',built=process.env.BUILT==='1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const patch=(code,seam,replacement)=>{assert.equal(code.split(seam).length,2,`seam ${seam}`);return code.replace(seam,replacement);};
const plugin={name:'cold-probe-only',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/main.js'))return code+'\nwindow.coldPaint=paint;';
 if(id.endsWith('/src/native-drawing-motion.js')&&process.env.DECODE_LIMIT){
 const limit=Number(process.env.DECODE_LIMIT);assert(Number.isSafeInteger(limit)&&limit>0);
 code=patch(code,'  const entries = await Promise.all(Object.entries(manifest.sprites).map(async ([id, sprite]) => {',`  const waiting=[];let running=0;async function limited(task){if(running>=${limit})await new Promise(r=>waiting.push(r));else running++;try{return await task();}finally{if(waiting.length)waiting.shift()();else running--;}}
  const entries = await Promise.all(Object.entries(manifest.sprites).map(([id, sprite]) => limited(async () => {`);
 return patch(code,'  }));\n  abort();\n  return new Map(entries);','  })));\n  abort();\n  return new Map(entries);');
 }
 if(!id.endsWith('/src/paint.js'))return;
 code=patch(code,'makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))','makeRandom(53)');
 if(instrument){
  code=patch(code,'function setOptions(next) {','function setOptions(next) { window.coldLog?.push({kind:"options",t:performance.now(),next,contact});');
  code=patch(code,'function cancel() {','function cancel() { window.coldLog?.push({kind:"cancel",t:performance.now(),contact});');
  code=patch(code,'function strokeTo(current, end) {','function strokeTo(current, end) { window.coldLog?.push({kind:"sample",t:performance.now(),end,contact});');
  code=patch(code,'function render() {','function render() { window.coldLog?.push({kind:"render",t:performance.now(),contact});');
 }
 return code;
}};
let server,browser;
const result={node:process.version,revision:process.env.REVISION||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),harness:hash(await readFile(new URL(import.meta.url))),engine,instrument,built,cpu:Number(process.env.CPU||1),decodeLimit:Number(process.env.DECODE_LIMIT||0),rows:[],limitations:'Synthetic pen with test-only capture shim. Real clocks. Timing is enqueue/handler/RAF proxy, not hardware or photons. Source exposure and RNG seed shared across lanes; counter wrappers only INSTRUMENT=1.'};
try{
 if(built){await build({configLoader:'runner',plugins:[plugin],cacheDir:`${out}/cache`,publicDir:false,build:{outDir:`${out}/build`}});server=createBrowserBuildServer({buildRoot:`${out}/build`});await new Promise(r=>server.listen(4402,'127.0.0.1',r));}
 else{server=await createServer({configLoader:'runner',cacheDir:`${out}/cache`,plugins:[plugin],server:{host:'127.0.0.1',port:4401,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});await server.listen();}
 browser=await ({chromium,webkit}[engine]).launch();result.browser=browser.version();
 for(const scenario of (process.env.SCENARIOS||'warm,art,ui,trays').split(',')) for(let trial=0;trial<Number(process.env.TRIALS||1);trial++){
  const context=await browser.newContext({viewport:{width:1366,height:1024},deviceScaleFactor:2,hasTouch:true});
  const page=await context.newPage(),errors=[],network=[],bodies=[];page.on('pageerror',e=>errors.push(String(e)));
  let release;const gate=new Promise(r=>release=r);let released=false;const held=[];
  await page.exposeFunction('releaseCold',()=>{released=true;release();});
  await page.route('**/original/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   const hold=scenario==='ui'?path.endsWith('/ui/ui.json'):scenario==='trays'?path.endsWith('/ui/trays.json'):(scenario==='art'&&(path.endsWith('.bin')||/secondary-motion\/.*\.(png|argb)$/.test(path))||scenario==='primary'&&path.endsWith('.bin')||scenario==='secondary'&&/secondary-motion\/.*\.(png|argb)$/.test(path));
   if(hold&&!released){held.push(path);await gate;}
   await route.continue();
  });
  let cdp;
  if(engine==='chromium'){
   cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
   const records=new Map();
   cdp.on('Network.requestWillBeSent',e=>{const r={id:e.requestId,url:e.request.url,start:e.timestamp};records.set(e.requestId,r);network.push(r);});
   cdp.on('Network.responseReceived',e=>Object.assign(records.get(e.requestId)||{},{status:e.response.status,protocol:e.response.protocol,cache:e.response.fromDiskCache||e.response.fromServiceWorker,headers:e.response.headers}));
   cdp.on('Network.loadingFailed',e=>Object.assign(records.get(e.requestId)||{},{failed:e.errorText,canceled:e.canceled}));
   cdp.on('Network.loadingFinished',e=>{const r=records.get(e.requestId);if(!r)return;Object.assign(r,{eof:e.timestamp,encodedBytes:e.encodedDataLength});if(/\/original\/.*\.(bin|argb)$/.test(new URL(r.url).pathname))bodies.push(cdp.send('Network.getResponseBody',{requestId:e.requestId}).then(async b=>{const bytes=Buffer.from(b.body,b.base64Encoded?'base64':'utf8');r.bodyBytes=bytes.length;r.bodyHash=hash(bytes);const local=await readFile(resolve('public',new URL(r.url).pathname.slice(1)));r.matchesLocal=hash(local)===r.bodyHash;}).catch(e=>{r.bodyError=String(e);}));});
   if(result.cpu!==1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:result.cpu});
  }
  await page.addInitScript(({instrument})=>{
   window.coldLog=[];window.decodeLog=[];window.longtasks=[];
   if(instrument){const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){const row={src:this.src,start:performance.now()};window.decodeLog.push(row);return decode.call(this).then(v=>{row.end=performance.now();row.w=this.naturalWidth;row.h=this.naturalHeight;return v;});};}
   try{new PerformanceObserver(list=>window.longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch{}
  },{instrument});
  await page.goto(`http://127.0.0.1:${built?4402:4401}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.coldPaint&&document.querySelector('#paper-canvas').dataset.paintReady==='ready');
  const ready=()=>page.waitForFunction(()=>document.querySelector('[data-native-tool-motion="draw"]')&&document.querySelectorAll('[data-native-secondary-motion]').length>=2);
  if(scenario==='warm')await ready();
  else if(['art','primary','secondary'].includes(scenario))await page.waitForFunction(()=>document.querySelector('#paint-chrome').classList.contains('native'));
  await page.locator('#picture-title').focus();
  const row=await page.evaluate(async ({instrument,negative})=>{
   const canvas=document.querySelector('#paper-canvas'),paint=window.coldPaint,box=canvas.getBoundingClientRect(),blank=canvas.toDataURL();
   const captures=new Set();canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
   const points=Array.from({length:241},(_,i)=>({x:70+i*2.1,y:190+Math.sin(i/23)*40,pressure:.15+.7*i/240}));
   const geometry={width:canvas.width,height:canvas.height,box:{x:box.x,y:box.y,width:box.width,height:box.height}};
   const delivery=[],frames=[],owners=[],freshness=[];let active=true;
   const frame=()=>{if(active){frames.push(performance.now());requestAnimationFrame(frame);}};requestAnimationFrame(frame);
   const make=(type,p,id=77)=>new PointerEvent(type,{pointerId:id,pointerType:id===77?'pen':'touch',clientX:box.x+p.x*box.width/720,clientY:box.y+p.y*box.height/542,pressure:type==='pointerup'?0:p.pressure,button:0,buttons:type==='pointerup'?0:1,bubbles:true});
   const send=(type,p)=>canvas.dispatchEvent(make(type,p));
   window.coldLog=[];const start=performance.now();send('pointerdown',points[0]);const firstDelivered=performance.now();
   let firstInk=instrument?canvas.toDataURL()!==blank:null;
   const channel=new MessageChannel();let continuation;channel.port1.onmessage=()=>continuation();const task=()=>new Promise(r=>{continuation=r;channel.port2.postMessage(0);});
   let releaseAt;
   for(let i=1;i<=240;i++){
    const due=start+i*1000/240;while(performance.now()<due)await new Promise(r=>setTimeout(r,Math.max(0,due-performance.now())));await task();
    if(i===80){releaseAt=performance.now();void window.releaseCold();if(negative)paint.setOptions({tool:'marker'});}
    const begin=performance.now();send('pointermove',points[i]);delivery.push({i,due,begin,end:performance.now()});
    if(instrument)requestAnimationFrame(()=>freshness.push({i,ms:performance.now()-begin}));
    if(i%20===0){owners.push({i,t:performance.now(),captured:captures.has(77),sameCanvas:document.querySelector('#paper-canvas')===canvas,focus:document.activeElement.id,ready:[...document.querySelectorAll('[data-native-tool-motion],[data-native-secondary-motion]')].map(n=>n.dataset.nativeToolMotion||n.dataset.nativeSecondaryMotion)});canvas.dispatchEvent(make('pointerdown',{x:640,y:450,pressure:.9},99));canvas.dispatchEvent(make('pointermove',{x:650,y:450,pressure:.9},99));canvas.dispatchEvent(make('pointerup',{x:650,y:450,pressure:0},99));}
   }
   send('pointerup',points.at(-1));const end=performance.now();active=false;channel.port1.close();channel.port2.close();
   const png=canvas.toDataURL(),canUndo=paint.canUndo;paint.undo();const undone=canvas.toDataURL(),secondUndo=paint.canUndo;paint.redo();const redone=canvas.toDataURL();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const stable=canvas.toDataURL()===png;
   return {start,firstDelivered,firstInk,releaseAt,end,delivery,frames,owners,freshness,geometry,points,png,blank,undone,redone,canUndo,secondUndo,stable,capturedAfter:captures.size,log:window.coldLog,decode:window.decodeLog,longtasks:window.longtasks};
  },{instrument,negative:process.env.NEGATIVE==='1'&&scenario==='art'});
  release();released=true;await ready();await page.waitForTimeout(100);await Promise.all(bodies);
  row.readinessAfter=await page.locator('[data-native-tool-motion],[data-native-secondary-motion]').count();row.held=held;row.scenario=scenario;row.trial=trial;row.errors=errors;
  row.network=network;row.networkIncomplete=network.filter(r=>!r.eof&&!r.failed).map(r=>r.url);
  for(const key of ['png','blank','undone','redone']){const s=snapshotPNG(row[key]);await writeFile(`${out}/${scenario}-${trial}-${key}.png`,Buffer.from(row[key].split(',')[1],'base64'));row[key]=s;}
  const sorted=a=>a.toSorted((a,b)=>a-b),p95=a=>sorted(a)[Math.floor(a.length*.95)];
  row.summary={leadingFrameGap:row.frames[0]-row.start,trailingFrameGap:row.end-row.frames.at(-1),worstFrameGap:Math.max(row.frames[0]-row.start,row.end-row.frames.at(-1),...row.frames.slice(1).map((t,i)=>t-row.frames[i])),actualHz:240000/(row.end-row.start),samples:row.delivery.length,frameHz:row.frames.length*1000/(row.end-row.start),deadlineP95:p95(row.delivery.map(r=>r.begin-r.due)),dispatchP95:p95(row.delivery.map(r=>r.end-r.begin)),frameGapP95:p95(row.frames.slice(1).map((t,i)=>t-row.frames[i])),firstDeliveredMs:row.firstDelivered-row.start,decodeCount:row.decode.length,decodeOverlap:row.decode.filter(r=>r.start<row.end&&r.end>row.start).length,held:held.length};
  result.rows.push(row);await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(scenario,trial,JSON.stringify(row.summary));
  if(instrument){assert.equal(row.log.filter(r=>r.kind==='sample').length,241,'all moves plus release consumed');assert(!row.log.some(r=>r.kind==='cancel'&&r.contact===77),'readiness canceled held contact');assert(row.firstInk,'first down delivered ink');}
  assert(row.owners.some(o=>o.i>80&&o.ready.length===3),'art did not become ready within held stroke');if(scenario!=='warm')assert(held.length>0,'no controlled resource held');assert.deepEqual(errors,[]);assert.equal(row.delivery.length,240);assert(row.owners.every(o=>o.captured&&o.sameCanvas&&o.focus==='picture-title'),'held owner/identity/focus changed');assert(row.canUndo&&!row.secondUndo,'exactly one undo');assert.equal(row.undone.rgbaHash,row.blank.rgbaHash);assert.equal(row.redone.rgbaHash,row.png.rgbaHash);assert(row.stable&&!row.capturedAfter);assert(network.filter(r=>r.bodyHash).every(r=>r.matchesLocal),'body differs');
  if(engine==='chromium'){
   const bundleRows=network.filter(r=>new URL(r.url).pathname.endsWith('/tool-motion/draw/sprites.bin'));
   assert.equal(bundleRows.length,1,'single primary bundle');
   const manifest=JSON.parse(await readFile('public/original/ui/tool-motion/manifest.json','utf8'));
   assert.equal(bundleRows[0].bodyHash,manifest.trays.draw.bundle.sha256,'compressed hash vs manifest');
   assert(!network.some(r=>/\/original\/.*\.(bin|argb)$/.test(new URL(r.url).pathname)&&(!r.eof||r.failed||r.bodyError)),'incomplete asset body capture');
  }
  const baseline=result.rows.find(r=>r.scenario==='warm');if(baseline){assert.equal(row.png.rgbaHash,baseline.png.rgbaHash,'cold changed ink');assert.deepEqual(row.geometry,baseline.geometry);assert.deepEqual(row.points,baseline.points);if(instrument)assert.deepEqual(row.log.filter(r=>r.kind==='sample').map(r=>({end:r.end,contact:r.contact})),baseline.log.filter(r=>r.kind==='sample').map(r=>({end:r.end,contact:r.contact}))); }
  await context.close();
 }
}finally{await browser?.close();if(server?.httpServer)await server.close();else if(server)await new Promise(r=>server.close(r));await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));}
