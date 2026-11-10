// Source-gated attribution only. Installed in BOTH measured lanes, never production.
export function idleOwnerTransform(code) {
 const replace=(from,to)=>{if(code.split(from).length!==2)throw Error(`Idle owner seam changed: ${from}`);code=code.replace(from,to);};
 replace('  let raf;',`  let raf;
  let sharedParked = false, sharedCallbacks = 0;
  const sharedState = () => ({ id: owner?.canvas.dataset[canvasAttribute] + ':' + manifestPath,
    active: Boolean(owner), parked: sharedParked, callbacks: sharedCallbacks, ready: Boolean(owner && !pending),
    finished: Boolean(owner && owner.controller.snapshot().every(s => s.finished)),
    snapshot: owner?.controller.snapshot().map(({script, tick, frameIndex, finished}) => ({script,tick,frameIndex,finished})) });
  (view.sharedIdleOwners ??= []).push({ state: sharedState,
    park() { const s=sharedState(); if(!s.ready || !s.finished || sharedParked)throw Error('Owner not finished/ready'); view.cancelAnimationFrame(raf); sharedParked=true; return sharedState(); },
    resume() { if(!sharedParked)throw Error('Owner not parked'); sharedParked=false; raf=view.requestAnimationFrame(animate); return sharedState(); }
  });`);
 replace('  function animate(time) {\n    if (!owner) return;',`  function animate(time) {
    sharedCallbacks++;
    if(sharedParked)throw Error('Parked owner callback');
    if (!owner) return;`);
 return code;
}
export function assertOwnerWindow(before, end, resumed, parked) {
 if(before.length!==3||end.length!==3||resumed.length!==3)throw Error('Expected all three owners');
 for(let i=0;i<3;i++){
  const b=before[i], e=end[i], r=resumed[i];
  if(!b.ready||!b.finished||b.parked!==parked||e.parked!==parked||b.id!==e.id||e.id!==r.id)throw Error('Owner treatment drift');
  if(parked && e.callbacks!==b.callbacks)throw Error('Callback inside parked window');
  if(!parked && e.callbacks<=b.callbacks)throw Error('Default owner did not run');
  if(r.parked||r.callbacks<=e.callbacks)throw Error('Owner did not resume');
 }
}
