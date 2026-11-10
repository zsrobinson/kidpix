// Diagnostic-only, after real owners finish. Nodes/actors remain registered.
export async function applyMinimization(page, treatment) {
 return page.evaluate(async treatment => {
  if(window.sharedMinRestore)throw Error('Treatment still installed');
  const outside=[...document.querySelector('#paint-zone').children].filter(n=>n.id!=='surface');
  const outer=[...document.querySelector('#studio').children].filter(n=>n.id!=='paint-zone');
  const inside=[...document.querySelector('#surface').children].filter(n=>n.id!=='paper-canvas');
  const chrome=[...outside,...outer];
  const sources=chrome.filter(n=>n.querySelector('canvas')||n.matches('canvas')||n.id==='native-tool-motion');
  const staticNodes=chrome.filter(n=>!sources.includes(n));
  const groups={all:[...outside,...outer,...inside],chrome,surface:inside,sources,static:staticNodes,'source-surface':[...sources,...inside],'static-surface':[...staticNodes,...inside],cursor:[]};
  const visibleChrome=chrome.filter(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none');
  Object.assign(groups,{'visible-all':[...visibleChrome,...inside],'visible-chrome-foreground':[...visibleChrome,...inside.filter(n=>n.id==='foreground')],'visible-chrome-effects':[...visibleChrome,...inside.filter(n=>n.id==='scene-effects')]});
  let nodes=['none','release-blank','no-display','fresh','fresh-all','detach-all','detach-chrome','detach-surface','release-ui-blank','release-all-blank','fresh-detach','fresh-chrome','fresh-surface','fresh-sources','fresh-static','fresh-source-surface','fresh-static-surface','cursor-all','fresh-all-native'].includes(treatment)?[]:groups[treatment];
  if(!nodes)throw Error('Unknown minimization: '+treatment);
  const before={owners:window.sharedUIState(),canvases:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,w:c.width,h:c.height})),nodes:nodes.map(n=>n.id)};
  const marked=[];function hiddenCSS(nodes){return nodes.map(n=>{let i=marked.indexOf(n);if(i<0){i=marked.length;marked.push(n);n.setAttribute('data-shared-min-index',i);}return `[data-shared-min-index="${i}"],[data-shared-min-index="${i}"] *{visibility:hidden!important}`}).join('\n');}
  const style=document.createElement('style');style.textContent=hiddenCSS(nodes);document.head.append(style);
  const restores=[];
  const retainedCanvases=[...document.querySelectorAll('canvas')];
  if(treatment.startsWith('detach-')||treatment==='fresh-detach'){
   const targets=groups[treatment==='fresh-detach'?'all':treatment.slice(7)],undo=[...document.querySelectorAll('.native-animation')],motion=[...document.querySelectorAll('[data-motion-snapshot]')],original=window.sharedUIState;
   window.sharedUIState=()=>({...original(),undo:undo.map(n=>({hidden:n.hidden,src:n.src,...n.dataset})),motion:motion.map(n=>({...n.dataset}))});
   const positions=targets.map(n=>({n,parent:n.parentNode,next:n.nextSibling}));targets.forEach(n=>n.remove());
   // Reverse order restores adjacent siblings through their saved next sibling.
   restores.push(()=>{for(const {n,parent,next} of positions.reverse())parent.insertBefore(n,next);window.sharedUIState=original;});
   if(treatment==='detach-all'||treatment==='fresh-detach')style.textContent+='#studio{background:none!important}';
  }

  if(treatment==='fresh'||treatment.startsWith('fresh-')){
   const old=document.querySelector('#paper-canvas'),fresh=old.cloneNode(false),options=structuredClone(window.sharedPaintOptions);
   old.replaceWith(fresh);
   const {createPaint}=await import('/src/paint.js');const paint=createPaint(fresh,{includeForeground:false});
   await paint.setOptions(options);fresh.setPointerCapture=()=>{};fresh.releasePointerCapture=()=>{};if(treatment==='fresh-all-native')fresh.style.cursor=old.style.cursor;
   restores.push(()=>{paint.destroy();fresh.replaceWith(old);});
   if(treatment!=='fresh-detach'&&treatment!=='fresh'){nodes=groups[treatment==='fresh-all-native'?'all':treatment.slice(6)];style.textContent=hiddenCSS(nodes);}
  }

  if(treatment==='cursor-all'){nodes=groups.all;style.textContent=hiddenCSS(nodes);const c=document.querySelector('#paper-canvas'),cursor=c.style.cursor;c.style.cursor='crosshair';restores.push(()=>{c.style.cursor=cursor;});}
  if(treatment.startsWith('release-'))for(const c of retainedCanvases.filter(c=>treatment==='release-blank'?['foreground','scene-effects'].includes(c.id):treatment==='release-ui-blank'?c.id==='color-picker-actor':['foreground','scene-effects','color-picker-actor'].includes(c.id))){
   const id=c.id||c.className,x=c.getContext('2d'),w=c.width,h=c.height,transform=x.getTransform(),bitmap=x.getImageData(0,0,w,h),data=bitmap.data;
   let nonblank=false;for(let i=3;i<data.length;i+=4)if(data[i]){nonblank=true;break;}
   if(nonblank&&!c.closest('[hidden]'))throw Error('Nonblank visible store '+id);
   const attrs=Object.fromEntries(['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation','imageSmoothingEnabled','imageSmoothingQuality','lineWidth','lineCap','lineJoin','miterLimit','lineDashOffset','font','textAlign','textBaseline','direction','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','filter'].filter(k=>k in x).map(k=>[k,x[k]])),dash=x.getLineDash();
   const css=c.getAttribute('style');c.style.width=w+'px';c.style.height=h+'px';c.width=1;c.height=1;
   restores.push(()=>{c.width=w;c.height=h;x.putImageData(bitmap,0,0);Object.assign(x,attrs);x.setLineDash(dash);x.setTransform(transform);const after=x.getImageData(0,0,w,h).data;for(let i=0;i<data.length;i++)if(data[i]!==after[i])throw Error('Restored bitmap differs '+id);if(css===null)c.removeAttribute('style');else c.setAttribute('style',css);});
  }
  const snapshot=()=>({retainedCanvases:retainedCanvases.map(c=>({id:c.id,w:c.width,h:c.height,connected:c.isConnected})),nodes:nodes.map(n=>({id:n.id,tag:n.tagName,className:n.className,connected:n.isConnected,visibility:getComputedStyle(n).visibility})),canvases:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,w:c.width,h:c.height})),owners:window.sharedUIState()});
  if(nodes.some(n=>getComputedStyle(n).visibility!=='hidden'))throw Error('Selected presentation branch still visible');
  window.sharedMinRestore=()=>{const during=snapshot();style.remove();marked.forEach(n=>n.removeAttribute('data-shared-min-index'));restores.forEach(r=>r());window.sharedMinRestore=null;return{before,during,after:snapshot()};};
  return {before,during:snapshot()};
 },treatment);
}

// Concurrent wall timers observe cadence; they never drive drawing or replace RAF.
export async function timingDiagnostic(page, duration=2000) {
 return page.evaluate(async duration=>{
  const start=performance.now(),dateStart=Date.now(),frames=[],timers=[];let ended=false;
  function frame(stamp){if(ended)return;frames.push({stamp,wall:performance.now()});requestAnimationFrame(frame);}requestAnimationFrame(frame);
  function timer(){if(ended)return;timers.push(performance.now());setTimeout(timer,10);}setTimeout(timer,10);
  await new Promise(r=>setTimeout(r,duration));ended=true;
  return {start,end:performance.now(),dateElapsed:Date.now()-dateStart,frames,timers,visibility:document.visibilityState,focus:document.hasFocus(),animations:document.getAnimations().map(a=>({state:a.playState})),timelineMaximum:document.timeline.maximumFrameRate??null};
 },duration);
}
