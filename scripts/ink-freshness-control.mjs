// Benchmark-only seams. Nothing in this module is imported by the application.
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';
export function freshnessTransform(code, delay = 0) {
 const once=(a,b)=>{if(code.split(a).length!==2)throw Error('Freshness seam changed: '+a);code=code.replace(a,b);};
 // Record consumption separately from delivery, including chronological pressure.
 once('  function strokeTo(current, end, targetContext = preview) {', `  function strokeTo(current, end, targetContext = preview) {
 if(targetContext === preview && window.sharedPerf?.enabled) (window.inkConsumed ||= []).push({...end,time:performance.now()});`);
 if(delay){
 once('  function render() {', `  const inkTimers = new Set()
  function render() {
    if (!window.sharedPerf?.enabled || window.sharedMinEvent !== 'pointermove') {
      for(const timer of inkTimers)clearTimeout(timer)
      inkTimers.clear()
      return inkRenderNow()
    }
    const copy = () => {const c=document.createElement('canvas');c.width=width;c.height=height;return c}
    const previous=copy();previous.getContext('2d').drawImage(canvas,0,0)
    inkRenderNow()
    const next=copy();next.getContext('2d').drawImage(canvas,0,0)
    display.clearRect(0,0,width,height);display.drawImage(previous,0,0)
    const timer=setTimeout(()=>{inkTimers.delete(timer);display.clearRect(0,0,width,height);display.drawImage(next,0,0)},${delay})
    inkTimers.add(timer)
  }
  function inkRenderNow() {`);
 }
 return code;
}
// A spatial lower bound: how far delivered ink trails the rightmost dark pixel.
// Monotonic black Pencil only. Brush radius makes this conservative, not exact.
export function inkExtent(png, box, scaleX, scaleY) {
 let right=null;
 const left=Math.ceil((box.x+20*box.width/720)*scaleX),end=Math.floor((box.x+710*box.width/720)*scaleX);
 for(let y=Math.ceil((box.y+240*box.height/542)*scaleY);y<Math.floor((box.y+300*box.height/542)*scaleY);y++)
 for(let x=left;x<end;x++){const i=(y*png.width+x)*4;if(png.data[i]<100&&png.data[i+1]<100&&png.data[i+2]<100&&png.data[i+3]>200)right=Math.max(right??x,x);}
 return right===null?null:(right/scaleX-box.x)*720/box.width;
}
export function staleBound(extent, delivery, points) {
 if(!delivery.length)return null;
 const latest=delivery.at(-1);
 const visible=points.map((p,i)=>({i,x:p.nativeX})).filter(p=>p.x<=(extent??-Infinity)).at(-1);
 // Use first delivery beyond observed extent. No intended deadlines as event ages.
 const firstMissing=delivery.find(d=>d.lastIndex>(visible?.i??-1));
 return {lastDelivered:latest.lastIndex,visibleThrough:visible?.i??-1,
  missingSamples:Math.max(0,latest.lastIndex-(visible?.i??-1)),
  staleMs:firstMissing?Math.max(0,latest.start-firstMissing.start):0};
}
export async function observeInk(page, output, prefix, box, enabled) {
 let stopped=false;const captures=[];
 const task=(async()=>{while(!stopped){
  if(enabled){
   const before=await page.evaluate(()=>{const time=performance.now(),c=document.querySelector('#paper-canvas'),data=c.getContext('2d').getImageData(0,240,720,60).data;let backingExtent=null;for(let y=0;y<60;y++)for(let x=20;x<710;x++){const i=(y*720+x)*4;if(data[i]<100&&data[i+1]<100&&data[i+2]<100&&data[i+3]>200)backingExtent=Math.max(backingExtent??x,x);}return {time,backingExtent,backingReadEnd:performance.now(),delivery:(window.sharedPerf.inkTrustedDelivery||window.sharedPerf.delivery).map(d=>({...d})),active:window.sharedPerf.enabled};});
   if(before.active){const png=await page.screenshot({timeout:15000});
    const after=await page.evaluate(()=>({time:performance.now(),active:window.sharedPerf.enabled}));
    const file=`${prefix}-capture-${captures.length}.png`;await writeFile(`${output}/${file}`,png);
    captures.push({before,after,file,png});}
  }
  await new Promise(r=>setTimeout(r,75));
 }})();
 return async(points)=>{stopped=true;await task;return captures.map(({png,...c})=>{
  const decoded=PNG.sync.read(png);const extent=inkExtent(decoded,box,decoded.width/1366,decoded.height/1024);
  return {...c,extent,bound:staleBound(extent,c.before.delivery,points)};
 });};
}
