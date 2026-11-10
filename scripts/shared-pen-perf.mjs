// Real-clock shared-path experiment. Synthetic in-page replay is NOT trusted pen input.
// Same 240 chronological points/pressure/seed for every delivery pattern. Duration
// varies with event rate and coalescing; both are explicit in each result.
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { snapshotPNG, samePixels } from './shared-pen-pixels.mjs';
import { idleOwnerTransform, assertOwnerWindow } from './shared-pen-idle-control.mjs';
import { studioControlPlugin, stageState, overlayState, assertBlankOverlays, emptyObjectsState, assertEmptyObjects } from './shared-pen-studio-control.mjs';
import { displayControlTransform, installStrokeAttribution } from './shared-pen-display-control.mjs';
import { applyMinimization, timingDiagnostic } from './shared-pen-minimize.mjs';
const minimize=process.env.MINIMIZE || '';
const coalesceDisplay=process.env.COALESCE_DISPLAY==='1', strokeCounters=process.env.STROKE_COUNTERS==='1', strokeAttribution=process.env.STROKE_ATTRIBUTION==='1';
const controlMode = process.env.CONTROL_MODE || 'full';
if(process.env.MOTION_REVISION && process.env.IDLE_OWNERS && process.env.IDLE_OWNERS!=='off')throw Error('Do not combine source revision and idle suppression');
const idleOwners = process.env.IDLE_OWNERS || 'off';
if(!['off','default','parked'].includes(idleOwners))throw Error('Invalid IDLE_OWNERS');
if(idleOwners!=='off' && (controlMode!=='full'||process.env.UI_SCENARIO!=='quiescent'))throw Error('Idle owners requires full/quiescent');
const presentation = process.env.PRESENTATION || 'default';
if(controlMode==='minimal' && (process.env.SCENE && process.env.SCENE!=='blank' || process.env.UI_SCENARIO!=='quiescent'))throw Error('Minimal control requires blank/quiescent; it has no source UI actors');
const uiScenario = process.env.UI_SCENARIO || 'legacy-undo';
if (!['legacy-undo','quiescent','tool-selection','fixed-undo'].includes(uiScenario)) throw Error('Invalid UI_SCENARIO');
if(minimize&&(uiScenario!=='quiescent'||(process.env.SCENE&&process.env.SCENE!=='blank')))throw Error('Minimization requires blank/quiescent');
const undoScript = Number(process.env.UNDO_SCRIPT || 1095);
const uiTrace = process.env.UI_TRACE === '1';
const output = path.resolve(process.env.PERF_OUT || 'artifacts/t3/shared-pen-performance/run');
await mkdir(output, { recursive: true });
const port = Number(process.env.PORT || 4251);
const engine = process.env.ENGINE || 'chromium';
const instrument = process.env.INSTRUMENT !== '0';
// Restrict paired source controls to the canvas representation under test.
const motionRevision = process.env.MOTION_REVISION;
const motionSources = new Map(motionRevision ? ['native-tool-motion.js', 'native-drawing-motion.js'].map(name =>
 [name, execFileSync('git', ['show', `${motionRevision}:src/${name}`], { encoding: 'utf8' })]) : []);
const server = await createServer({ configLoader: 'runner', cacheDir: `${output}/cache`,
 plugins: [studioControlPlugin(controlMode,presentation), { name: 'fixed-stroke-seed', enforce: 'pre', transform(code, id) {
  for (const [name, source] of motionSources) if (id.endsWith(`/src/${name}`)) return source;
  if(idleOwners!=='off' && id.endsWith('/src/native-tool-motion.js'))code=idleOwnerTransform(code);
  if (id.endsWith('/src/main.js') && uiScenario !== 'legacy-undo') {
   const seam = 'const clip = clips[index];';
   if (!code.includes(seam)) throw Error('Undo source seam changed');
   code=code.replace(seam, `const clip = clips.find(c => c.script === ${undoScript}); if (!clip) throw Error('Missing fixed Undo script');`);
   if(uiTrace){const actionSeam='function actionMotionState() {';if(code.split(actionSeam).length!==2)throw Error('Action refresh seam changed');code=code.replace(actionSeam,actionSeam+`if(window.sharedPerf?.enabled)window.sharedUITrace.push({time:performance.now(),actor:'action-state-refresh'});`);}
   return code;
  }
  if (uiTrace && id.endsWith('/src/native-animation.js')) {
   const seam = 'const waitingForSound = [...pendingSounds.values()].some(channel => channel === 1 || channel === 2);';
   if (!code.includes(seam)) throw Error('Animation progress seam changed');
   return code.replace(seam, seam + `
      if(window.sharedPerf?.enabled)window.sharedUITrace.push({time:performance.now(),actor:'undo',script:clip.script,tick,endTick,pendingChannels:[...pendingSounds.values()]});`);
  }
  if (uiTrace && id.endsWith('/src/native-tool-motion.js')) {
   const seam = 'function render(snapshot) {';
   if (!code.includes(seam)) throw Error('Motion render seam changed');
   code=code.replace(seam,seam + `
    if(window.sharedPerf?.enabled)window.sharedUITrace.push({time:performance.now(),actor:'motion-render',snapshot:snapshot.map(({script,tick,frameIndex,finished,state})=>({script,tick,frameIndex,finished,state}))});`);
   const callbackSeam='    refreshState();\n    owner.controller.step(time);';
   if(code.split(callbackSeam).length!==2)throw Error('Motion callback seam changed');
   return code.replace(callbackSeam,`const sharedTraceStart=performance.now();refreshState();const sharedRefreshEnd=performance.now();owner.controller.step(time);
    if(window.sharedPerf?.enabled)window.sharedUITrace.push({time:sharedTraceStart,actor:'motion-callback',tray:current.tray,refreshCurrent:Boolean(refreshCurrent),refreshMs:sharedRefreshEnd-sharedTraceStart,stepMs:performance.now()-sharedRefreshEnd});`);
  }
  if (!id.endsWith('/src/paint.js')) return code;
  code=displayControlTransform(code,{coalesce:coalesceDisplay,counters:strokeCounters,attribution:strokeAttribution});
  if(minimize==='no-display')code=code.replace('  function render() {', `  function render() { if(window.sharedPerf?.enabled && window.sharedMinEvent==='pointermove')return;`);
  const seam = 'makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))';
  if (!code.includes(seam)) throw Error('Seed seam changed');
  code=code.replace(seam, 'makeRandom(53)');
  const optionsSeam = 'function setOptions(next) {';
  if(!code.includes(optionsSeam))throw Error('Options seam changed');
  code=code.replace(optionsSeam, optionsSeam+' window.sharedPaintOptions = structuredClone(next);');
  if(process.env.DISPLAY_ALPHA==='0'){const seam="const display = canvas.getContext('2d', { willReadFrequently: true })";if(!code.includes(seam))throw Error('Display alpha seam changed');code=code.replace(seam,"const display = canvas.getContext('2d', { willReadFrequently: true, alpha: false })");}
  if(process.env.DISPLAY_READ_FREQUENTLY==='0'){const displaySeam="const display = canvas.getContext('2d', { willReadFrequently: true })";if(!code.includes(displaySeam))throw Error('Display seam changed');code=code.replace(displaySeam,"const display = canvas.getContext('2d')");}
  return code;
 } }], server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
let browser, page;
const results = { minimize, helperHashes:Object.fromEntries(await Promise.all(['shared-pen-studio-control.mjs','shared-pen-pixels.mjs','shared-pen-idle-control.mjs','shared-pen-display-control.mjs','shared-pen-minimize.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')]))), harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), node:process.version, platform:process.platform, arch:process.arch, cpuModel:cpus()[0]?.model, revision: process.env.REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
 motionSourceHashes: Object.fromEntries([...motionSources].map(([name,source]) => [name,createHash('sha256').update(source).digest('hex')])), motionRevision: motionRevision || null, engine, coalesceDisplay, strokeCounters, strokeAttribution, controlMode, presentation, idleOwners, sourceActors:controlMode==='minimal'?'absent; actual paint history only':'production studio', instrument, uiScenario, undoScript:uiScenario==='legacy-undo'?null:undoScript, uiTrace, legacySyncCatchup:process.env.LEGACY_SYNC_CATCHUP==='1', profiled:!!process.env.PROFILE, traced:!!process.env.TRACE, scene:process.env.SCENE||'blank', displayAlpha:process.env.DISPLAY_ALPHA!=='0', displayReadFrequently:process.env.DISPLAY_READ_FREQUENTLY!=='0', cpu: Number(process.env.CPU || 1), seed: 53, samples: 240,
 limitations: 'Desktop headless engine; RAF callback and intended-deadline proxies, no compositor visibility or physical iPad latency.', baselines: [], rows: [] };
const stats = values => { const a = values.filter(Number.isFinite).sort((a,b)=>a-b); return { n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],worst:a.at(-1) }; };
try {
 await server.listen();
 browser = await ({chromium,webkit}[engine]).launch(); results.browser = browser.version();
 page = await browser.newPage({ viewport: { width:1366,height:1024 }, deviceScaleFactor:2, hasTouch:true });
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 if(strokeAttribution)await page.addInitScript(installStrokeAttribution);
 await page.addInitScript(({instrument,uiTrace})=>{
  const media=[];const NativeAudio=window.Audio;window.Audio=class extends NativeAudio { constructor(...args){super(...args);media.push(this);} };
  const activation=()=>navigator.userActivation?{isActive:navigator.userActivation.isActive,hasBeenActive:navigator.userActivation.hasBeenActive}:null;
  const inputs=[]; for(const type of ['pointerdown','click','keydown'])document.addEventListener(type,e=>inputs.push({type,trusted:e.isTrusted,target:e.target.id||e.target.dataset?.action,activation:activation()}),true);
  window.sharedUIState=()=>({time:performance.now(),activation:activation(),inputs:inputs.slice(-12),media:media.map(a=>({src:a.currentSrc||a.src,paused:a.paused,ended:a.ended,time:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:null,readyState:a.readyState,error:a.error?.code})),undo:[...document.querySelectorAll('.native-animation')].map(n=>({hidden:n.hidden,src:n.src,...n.dataset})),motion:[...document.querySelectorAll('[data-motion-snapshot]')].map(n=>({...n.dataset})),trace:window.sharedUITrace||[]});
  if(uiTrace){window.sharedUITrace=[];new MutationObserver(rows=>{if(!window.sharedPerf?.enabled)return;for(const r of rows)if(r.target.matches?.('[data-motion-snapshot],.native-animation'))window.sharedUITrace.push({time:performance.now(),attribute:r.attributeName,hidden:r.target.hidden,src:r.target.getAttribute('src'),...r.target.dataset});}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-motion-snapshot','data-frame','data-script','src','hidden']});}
  window.sharedPerf={enabled:false,events:[],canvas:{},frames:[],callbackTimes:[],nextRAF:[],delivery:[]};
  const m=window.sharedPerf;
  // Off control installs neither canvas wrappers nor event timing listeners.
  if(instrument){
   for(const name of ['getImageData','putImageData','drawImage','clearRect','fillRect']){
    const original=CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name]=function(...args){if(!m.enabled)return original.apply(this,args);const start=performance.now();const value=original.apply(this,args);const row=m.canvas[name]??={count:0,ms:0};row.count++;row.ms+=performance.now()-start;return value;};
   }
   document.addEventListener('pointermove',e=>{if(!m.enabled||e.target.id!=='paper-canvas')return;const row={start:performance.now(),stampAge:performance.now()-e.timeStamp,trusted:e.isTrusted,samples:e.getCoalescedEvents?.().length||1};m.events.push(row);e.__sharedPerf=row;requestAnimationFrame(()=>m.nextRAF.push(performance.now()-row.start));},true);
   document.addEventListener('pointermove',e=>{if(e.__sharedPerf)e.__sharedPerf.ms=performance.now()-e.__sharedPerf.start;});
  }
  window.startSharedPerf=()=>{window.sharedStroke={calls:{},samples:[],listeners:{},requests:0};window.sharedUITrace=[];Object.assign(m,{enabled:true,started:performance.now(),events:[],canvas:{},frames:[],callbackTimes:[],nextRAF:[],delivery:[]});};
  let previous;function frame(now){if(m.enabled){m.callbackTimes.push(performance.now());if(previous>=m.started)m.frames.push(now-previous);}previous=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.dispatchSharedPen=({type,points,due})=>{
   const canvas=document.querySelector('#paper-canvas');
   const make=p=>new PointerEvent(type,{pointerId:77,pointerType:'pen',clientX:p.x,clientY:p.y,pressure:type==='pointerup'?0:p.pressure,buttons:type==='pointerup'?0:1,button:0,bubbles:true});
   const event=make(points.at(-1));
   if(type==='pointermove')Object.defineProperty(event,'getCoalescedEvents',{value:()=>points.map(make)});
   if(type==='pointerup'||type==='pointercancel')m.beforeReleasePending=window.sharedDisplayState?.()||null;
   const start=performance.now();window.sharedMinEvent=type;canvas.dispatchEvent(event);window.sharedMinEvent=null;
   if(type==='pointerup'||type==='pointercancel')m.releasePending=window.sharedDisplayState?.()||null;
   if(type==='pointermove')m.delivery.push({start,due,end:performance.now(),samples:points.length});
  };
 },{instrument,uiTrace});
 const cdp=engine==='chromium'?await page.context().newCDPSession(page):null;
 if(cdp)await cdp.send('Emulation.setCPUThrottlingRate',{rate:results.cpu});
 const measureIdle=async(label)=>{await page.evaluate(()=>window.startSharedPerf());await page.waitForTimeout(2000);const m=await page.evaluate(()=>{window.sharedPerf.enabled=false;return window.sharedPerf;});results.baselines.push({label,frame:stats(m.frames),canvas:m.canvas});};
 await page.goto('about:blank');await page.waitForTimeout(300);await measureIdle('blank-page');
 await page.goto(`http://127.0.0.1:${port}/`);
 if(controlMode==='full')await page.waitForSelector('[data-native-tool-motion="draw"]');
 await page.waitForSelector('#paper-canvas[data-paint-ready="ready"]');
 if(process.env.SCENE==='layered'){
  const picture=await page.evaluate(()=>{
   const image=(kind)=>{const c=document.createElement('canvas');c.width=720;c.height=542;const x=c.getContext('2d');if(kind==='background'){x.fillStyle='#ddeeff';x.fillRect(0,0,720,542);}if(kind==='foreground'){x.fillStyle='#37a65b';x.fillRect(300,120,80,140);}return c.toDataURL();};
   return{version:1,format:'kidpix-web',title:'Shared composition probe',paint:{version:1,art:image('blank'),background:image('background'),foreground:image('foreground'),paper:null},objects:[]};
  });
  await page.locator('#picture-file').setInputFiles({name:'shared-perf.kidpix-web',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(picture))});
  await page.waitForFunction(()=>document.querySelector('#paper-canvas').getContext('2d').getImageData(0,0,1,1).data[0]===221);
 }
 await page.evaluate(async()=>Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{}))));
 results.motionCanvases = await page.locator('[data-native-tool-motion], .native-secondary-motion > canvas').evaluateAll(canvases => canvases.map(c => ({ width:c.width, height:c.height, style:c.getAttribute('style'), rgbaBytes:c.width*c.height*4 })));
 // Browser mouse and keyboard warmup; event trust and activation are recorded.
 await page.mouse.click(5,5);await page.keyboard.press('Shift');
 results.trustedWarmup=await page.evaluate(()=>window.sharedUIState());
 const awaitIdle=async()=>{
  // No actor is stopped or hidden: wait for finite motion and UI media. Drawing audio is recorded, not gated.
  await page.waitForFunction(()=>{const s=window.sharedUIState();return s.undo.every(a=>a.hidden)&&s.media.filter(a=>a.src.includes('/ui/')).every(a=>a.paused||a.ended||a.error)&&s.motion.every(c=>JSON.parse(c.motionSnapshot).every(a=>a.finished));},{},{timeout:30000});
  await page.waitForTimeout(200);
 };
 await page.waitForTimeout(1500);await measureIdle('warm-app-idle');
 const patterns=(process.env.PATTERNS||'60x1,120x1,240x1,60x2,60x4').split(',').map(p=>{const [hz,batch]=p.split('x').map(Number);if(![60,120,240].includes(hz)||![1,2,4].includes(batch))throw Error('Invalid pattern');return{hz,batch};});
 for(let trial=0;trial<Number(process.env.TRIALS||3);trial++)for(const tool of (process.env.TOOLS||'pencil,chalk,crayon,marker').split(','))for(const driver of (process.env.DRIVERS||'inpage,protocol,cdp').split(','))for(const {hz,batch} of patterns){
  if(driver==='cdp'&&(!cdp||batch!==1))continue;
  if(controlMode==='minimal')await page.evaluate(tool=>window.selectMinimalTool(tool),tool);
  else {
   await page.locator(`#tray-buttons [data-action="tool:${tool}"]`).evaluate(el=>el.click());
   await page.locator('#tray-buttons [data-action="size:16"]').evaluate(el=>el.click());
  }
  await page.waitForSelector('#paper-canvas[data-paint-ready="ready"]');await page.waitForTimeout(200);
  await page.evaluate(trusted=>{const c=document.querySelector('#paper-canvas');c.__capture??=[c.setPointerCapture,c.releasePointerCapture];[c.setPointerCapture,c.releasePointerCapture]=trusted?c.__capture:[()=>{},()=>{}];},driver==='cdp');
  const box=await page.locator('#paper-canvas').boundingBox();
  const points=Array.from({length:241},(_,i)=>({x:box.x+(60+Math.abs(((i*10)%1200)-600))*box.width/720,y:box.y+(160+60*Math.sin(i/28.8))*box.height/542,pressure:.5+.35*Math.sin(i/40.8)}));
  const send=async(type,pts,due)=>{
   if(driver==='cdp')return cdp.send('Input.dispatchMouseEvent',{type:{pointerdown:'mousePressed',pointermove:'mouseMoved',pointerup:'mouseReleased'}[type],x:pts.at(-1).x,y:pts.at(-1).y,button:'left',buttons:type==='pointerup'?0:1,clickCount:type==='pointermove'?0:1,pointerType:'pen',force:type==='pointerup'?0:pts.at(-1).pressure});
   return page.evaluate(payload=>window.dispatchSharedPen(payload),{type,points:pts,due});
  };
  await send('pointerdown',[points[0]]);await send('pointermove',[points[1]]);await send('pointerup',[points[1]]);
  if(controlMode==='minimal')await page.evaluate(()=>{if(!window.minimalPaint.canUndo)throw Error('Missing minimal history');window.minimalPaint.undo();});
  else await page.locator('[data-action="undo"]').first().evaluate(el=>el.click());
  if(controlMode==='full'&&uiScenario!=='legacy-undo'){
   // Hidden during asynchronous decode is not completed playback. Observe start first.
   await page.waitForFunction(script=>[...document.querySelectorAll('.native-animation')].some(n=>!n.hidden&&Number(n.dataset.script)===script),undoScript);
  }
  if(uiScenario==='legacy-undo'||uiScenario==='fixed-undo')await page.waitForTimeout(150);
  else{
   await awaitIdle();
   if(uiScenario==='tool-selection'){
    const alternate=tool==='pencil'?'chalk':'pencil';
    await page.locator(`#tray-buttons [data-action="tool:${alternate}"]`).click();await awaitIdle();
    await page.locator(`#tray-buttons [data-action="tool:${tool}"]`).click();
    await page.waitForSelector('#paper-canvas[data-paint-ready="ready"]');
   }
  }
  const overlaysBefore=controlMode==='full'?await page.evaluate(overlayState):null;
  if(overlaysBefore&&(process.env.SCENE!=='layered'||presentation.endsWith('-hidden')))assertBlankOverlays(overlaysBefore,presentation);
  const objectsBefore=controlMode==='full'?await page.evaluate(emptyObjectsState):null;
  if(objectsBefore&&process.env.SCENE!=='layered')assertEmptyObjects(objectsBefore,presentation);
  if(objectsBefore&&presentation==='objects-hidden')assertEmptyObjects(objectsBefore,presentation);
  const stage=await page.evaluate(stageState);
  const chromeState=controlMode==='full'?await page.locator('#paint-chrome').evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {backgroundImage:s.backgroundImage,backgroundSize:s.backgroundSize,backgroundPosition:s.backgroundPosition,display:s.display,visibility:s.visibility,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}):null;
  if(controlMode==='full' && ((chromeState.backgroundImage==='none')!==(presentation==='chrome-no-image')))throw Error('Chrome image treatment did not compute');
  if(stage.chain.find(n=>n.id==='surface').presentation.contain!==(presentation==='surface-paint'?'paint':'none'))throw Error('Presentation treatment did not apply');
  const promotionTarget=presentation==='paper-promote'?'paper-canvas':presentation==='surface-promote'?'surface':null;
  if(promotionTarget && stage.chain.find(n=>n.id===promotionTarget).presentation.willChange!=='transform')throw Error('Promotion hint did not compute');
  if(presentation==='studio-no-gradient' && stage.chain.find(n=>n.id==='studio').presentation.backgroundImage!=='none')throw Error('Gradient removal did not compute');
  const uiBefore=await page.evaluate(()=>window.sharedUIState());
  if(uiScenario==='quiescent' && (uiBefore.undo.some(a=>!a.hidden)||uiBefore.motion.some(c=>JSON.parse(c.motionSnapshot).some(a=>!a.finished))))throw Error('UI-idle precondition changed before replay');
  if(process.env.TRACE&&cdp)await cdp.send('Tracing.start',{categories:'devtools.timeline,v8.execute',transferMode:'ReturnAsStream'});
  if(process.env.PROFILE&&cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  const ownerBefore=idleOwners==='off'?null:await page.evaluate(parked=>{const owners=window.sharedIdleOwners?.filter(o=>o.state().active);if(owners?.length!==3)throw Error('Expected three owners: '+JSON.stringify(window.sharedIdleOwners?.map(o=>o.state())));return owners.map(o=>parked?o.park():o.state());},idleOwners==='parked');
  const minimization=minimize?await applyMinimization(page,minimize):null;
  const stageDuring=minimize?await page.evaluate(stageState):null;
  if(stageDuring&&JSON.stringify(stageDuring.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry})))!==JSON.stringify(stage.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry}))))throw Error('Minimization changed paper ancestry geometry');
  const timing=minimize?await timingDiagnostic(page):null;
  await page.evaluate(()=>window.startSharedPerf());
  const wallStart=performance.now();
  if(driver==='inpage')await page.evaluate(async({points,hz,batch,legacy})=>{
   const channel=new MessageChannel();let continuation;channel.port1.onmessage=()=>continuation();
   const yieldTask=()=>new Promise(resolve=>{continuation=resolve;channel.port2.postMessage(null);});
   const dispatch=window.dispatchSharedPen;dispatch({type:'pointerdown',points:[points[0]]});const start=performance.now();
   for(let i=1;i<=240/batch;i++){
    const due=start+i*1000/hz;
    // Recheck real clock: early timers cannot advance the delivery deadline.
    while(performance.now()<due)await new Promise(r=>setTimeout(r,Math.max(0,due-performance.now())));
    // Every event gets its own task even when late; never catch up in one JS job.
    if(!legacy)await yieldTask();
    dispatch({type:'pointermove',points:points.slice(1+(i-1)*batch,1+i*batch),due});
   }
   dispatch({type:'pointerup',points:[points.at(-1)]});channel.port1.close();channel.port2.close();
  },{points,hz,batch,legacy:process.env.LEGACY_SYNC_CATCHUP==='1'});
  else{
   await send('pointerdown',[points[0]]);const start=performance.now();
   for(let i=1;i<=240/batch;i++){
    const due=start+i*1000/hz;while(performance.now()<due)await new Promise(r=>setTimeout(r,Math.max(0,due-performance.now())));
    await send('pointermove',points.slice(1+(i-1)*batch,1+i*batch));
   }
   await send('pointerup',[points.at(-1)]);
  }
  const elapsed=performance.now()-wallStart;
  const m=await page.evaluate(async()=>{window.sharedPerf.enabled=false;window.sharedPerf.ended=performance.now();window.sharedPerf.ownerEnd=window.sharedIdleOwners?.filter(o=>o.state().active).map(o=>o.state());window.sharedIdleOwners?.forEach(o=>{if(o.state().parked)o.resume();});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.sharedPerf.stroke=window.sharedStroke;window.sharedPerf.displayAfterDrain=window.sharedDisplayState?.()||null;return window.sharedPerf;});
  const ownerResumed=idleOwners==='off'?null:await page.evaluate(()=>window.sharedIdleOwners.filter(o=>o.state().active).map(o=>o.state()));
  if(ownerBefore)assertOwnerWindow(ownerBefore,m.ownerEnd,ownerResumed,idleOwners==='parked');
  const uiAfter=await page.evaluate(()=>window.sharedUIState());
  if(process.env.PROFILE&&cdp){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${output}/${tool}-${driver}-${hz}x${batch}-${trial}.cpuprofile`,JSON.stringify(profile));}
  if(process.env.TRACE&&cdp){
   const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;let trace='';
   for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
   await writeFile(`${output}/${tool}-${driver}-${hz}x${batch}-${trial}.trace.json`,trace);
  }
  const pixels=await page.locator('#paper-canvas').evaluate(async canvas=>{const afterRelease=canvas.toDataURL();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const ctx=canvas.getContext('2d');const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let nonOpaque=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255)nonOpaque++;return{afterRelease,stable:afterRelease===canvas.toDataURL(),contextAttributes:ctx.getContextAttributes?.()||null,nonOpaque};});
  if(minimize)await page.screenshot({path:`${output}/${tool}-${driver}-${hz}x${batch}-${trial}-TREATMENT-INCOMPLETE-UI.png`});
  let minRestored=minimize?await page.evaluate(()=>window.sharedMinRestore()):null;
  const overlaysAfter=controlMode==='full'?await page.evaluate(overlayState):null;
  if(overlaysAfter&&(process.env.SCENE!=='layered'||presentation.endsWith('-hidden')))assertBlankOverlays(overlaysAfter,presentation);
  const objectsAfter=controlMode==='full'?await page.evaluate(emptyObjectsState):null;
  if(objectsAfter&&(process.env.SCENE!=='layered'||presentation==='objects-hidden'))assertEmptyObjects(objectsAfter,presentation);
  const studioPNG=await page.screenshot();
  const studioPixels=snapshotPNG('data:image/png;base64,'+studioPNG.toString('base64'));
  await writeFile(`${output}/${tool}-${driver}-${hz}x${batch}-${trial}-studio.png`,studioPNG);
  const callbackGaps=m.callbackTimes.slice(1).map((t,i)=>t-m.callbackTimes[i]);
  const leadingGap=(m.callbackTimes[0]??m.ended)-m.started,trailingGap=m.ended-(m.callbackTimes.at(-1)??m.started);
  const row={stageDuring,minimization,minRestored,timing,trial,tool,driver,objectsBefore,objectsAfter,overlaysBefore,overlaysAfter,chromeState,studioPixels,ownerBefore,ownerEnd:m.ownerEnd,ownerResumed,stage,points,uiBefore,uiAfter,box,eventHz:hz,batch,expectedEvents:240/batch,expectedSamples:240,elapsed,
   actualEvents:instrument?m.events.length:null,actualSamples:instrument?m.events.reduce((n,e)=>n+e.samples,0):null,trusted:instrument?m.events.filter(e=>e.trusted).length:null,
   callbackFrame:stats(callbackGaps),callbackCount:m.callbackTimes.length,callbackHz:m.callbackTimes.length*1000/(m.ended-m.started),leadingGap,trailingGap,maxObservedOrCensoredGap:Math.max(leadingGap,trailingGap,...callbackGaps),
   syntheticDeliveredEvents:m.delivery.length,syntheticDeliveredSamples:m.delivery.reduce((n,e)=>n+e.samples,0),
   dispatchHandler:stats(m.delivery.map(e=>e.end-e.start)),handler:stats(m.events.map(e=>e.ms)),frame:stats(m.frames),nextRAF:stats(m.nextRAF),eventStampAge:stats(m.events.map(e=>e.stampAge)),
   deadlineAge:stats(m.delivery.filter(e=>Number.isFinite(e.due)).map(e=>e.start-e.due)),
   deliveryInterval:stats((m.delivery.length?m.delivery:m.events).slice(1).map((e,i)=>e.start-(m.delivery.length?m.delivery:m.events)[i].start)),
   achievedEventHz:(m.delivery.length?m.delivery:m.events).length>1?((m.delivery.length?m.delivery:m.events).length-1)*1000/((m.delivery.length?m.delivery:m.events).at(-1).start-(m.delivery.length?m.delivery:m.events)[0].start):null,
   oldestSampleDeadlineAge:stats(m.delivery.filter(e=>Number.isFinite(e.due)).map(e=>e.start-e.due+(batch-1)*1000/(hz*batch))),
   stroke:m.stroke,releasePending:m.releasePending,displayAfterDrain:m.displayAfterDrain,canvas:m.canvas,contextAttributes:pixels.contextAttributes,nonOpaquePixels:pixels.nonOpaque,...snapshotPNG(pixels.afterRelease),stableAfterRelease:pixels.stable,raw:m};
  results.rows.push(row);console.log(JSON.stringify({...row,raw:undefined,uiBefore:undefined,uiAfter:undefined}));
  if(instrument&&(row.actualEvents!==row.expectedEvents||row.actualSamples!==240))throw Error('Delivered event/sample count mismatch');
  if(driver!=='cdp'&&m.delivery.reduce((n,e)=>n+e.samples,0)!==240)throw Error('Synthetic replay dropped samples');
  if(!pixels.stable)throw Error('Ink changed between post-release captures');
  if(controlMode==='minimal')await page.evaluate(()=>{if(!window.minimalPaint.canUndo)throw Error('Missing minimal history');window.minimalPaint.undo();});
  else await page.locator('[data-action="undo"]').first().evaluate(el=>el.click());
 }
 if(strokeCounters)results.lifecycle=await page.evaluate(async()=>{
  const paint=window.sharedBenchPaint,c=paint.canvas,box=c.getBoundingClientRect(),rows=[];
  for(const operation of ['release','cancel','destroy']){
   paint.clear();window.startSharedPerf();
   const points=[60,120,180].map(x=>({x:box.x+x*box.width/720,y:box.y+160*box.height/542,pressure:0.7}));
   window.dispatchSharedPen({type:'pointerdown',points:[points[0]]});
   window.dispatchSharedPen({type:'pointermove',points:points.slice(1)});
   const pendingBefore=window.sharedDisplayState?.()||null;
   if(operation==='release')window.dispatchSharedPen({type:'pointerup',points:[points.at(-1)]});else paint[operation]();
   const pendingAfter=window.sharedDisplayState?.()||null,immediate=c.toDataURL(),renders=window.sharedStroke.calls.render.count;
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   rows.push({operation,pendingBefore,pendingAfter,immediate,afterDrain:c.toDataURL(),extraRenders:window.sharedStroke.calls.render.count-renders});
   window.sharedPerf.enabled=false;
  }
  return rows;
 });
 results.syntheticPixelMismatches=results.rows.filter(r=>r.driver!=='cdp'&&!samePixels(r,results.rows.find(p=>p.tool===r.tool&&p.driver!=='cdp'))).map(({tool,driver,eventHz,batch,trial})=>({tool,driver,eventHz,batch,trial}));
 if(results.syntheticPixelMismatches.length)throw Error('Synthetic replay pixels differ across patterns');
 results.errors=errors;if(errors.length)throw Error(errors.join('\n'));
 results.budgetFailures=results.rows.flatMap(r=>{
  const failures=[];const key=`${r.tool}/${r.driver}/${r.eventHz}x${r.batch}/${r.trial}`;
  if(process.env.MIN_CALLBACK_HZ&&r.callbackHz<Number(process.env.MIN_CALLBACK_HZ))failures.push({key,metric:'callbackHz',value:r.callbackHz,min:Number(process.env.MIN_CALLBACK_HZ)});
  if(process.env.MIN_DELIVERY_HZ&&r.achievedEventHz<Number(process.env.MIN_DELIVERY_HZ))failures.push({key,metric:'achievedEventHz',value:r.achievedEventHz,min:Number(process.env.MIN_DELIVERY_HZ)});
  if(process.env.MAX_FRAME_P95&&(r.frame.p95>Number(process.env.MAX_FRAME_P95)||r.maxObservedOrCensoredGap>Number(process.env.MAX_FRAME_P95)))failures.push({key,metric:'frameP95OrGap',value:Math.max(r.frame.p95||0,r.maxObservedOrCensoredGap||0),max:Number(process.env.MAX_FRAME_P95)});
  return failures;
 });
 if(process.env.MAX_MOTION_RGBA_BYTES){const bytes=results.motionCanvases.reduce((sum,c)=>sum+c.rgbaBytes,0);if(bytes>Number(process.env.MAX_MOTION_RGBA_BYTES))results.budgetFailures.push({metric:'motionRGBABytes',value:bytes,max:Number(process.env.MAX_MOTION_RGBA_BYTES)});}
 if(results.budgetFailures.length){console.error(JSON.stringify({budgetFailures:results.budgetFailures}));process.exitCode=1;}
} finally {
 if(page)results.finalUI=await page.evaluate(()=>window.sharedUIState?.()).catch(e=>({error:String(e)}));
 await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));await browser?.close();await server.close();
}
