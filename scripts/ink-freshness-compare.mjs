import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root=process.env.INK_ROOT||'artifacts/t3/ink-freshness';
const prefix=process.env.INK_PREFIX||'final';
const names=['full-green-a','full-red-a','full-red-b','full-green-b','minimal-green-a','minimal-off-a','full-off-a','full-off-b','minimal-off-b','minimal-green-b'];
const runs=await Promise.all(names.map(async name=>({name,...JSON.parse(await readFile(`${root}/${prefix}-${name}/results.json`,'utf8'))})));
const reference=runs[0].rows[0];
const receipts=[];
for(const run of runs){
 assert.equal(run.rows.length,1);assert.deepEqual(run.errors,[]);
 const r=run.rows[0],fault=run.name.includes('red');
 assert.equal(run.harnessSha256,runs[0].harnessSha256);
 assert.deepEqual(run.helperHashes,runs[0].helperHashes);
 assert.deepEqual(r.box,reference.box);assert.deepEqual(r.stage.options,reference.stage.options);assert.deepEqual(r.stage.canvas,reference.stage.canvas);
 assert.deepEqual(r.points,reference.points);assert.equal(r.syntheticDeliveredSamples,240);assert.equal(r.syntheticDeliveredEvents,240);
 assert.equal(r.inkConsumed.length,241);
 for(let i=0;i<240;i++){
  const p=r.points[i+1],q=r.inkConsumed[i];
  assert.ok(Math.abs(q.x-p.nativeX)<.0001);
  assert.ok(Math.abs(q.y-270)<.0001);
  assert.ok(Math.abs(q.pressure-p.pressure)<.000001);
 }
 assert.deepEqual(r.inkConsumed.map(({time,...p})=>p),reference.inkConsumed.map(({time,...p})=>p));
 assert.equal(r.rgbaHash,reference.rgbaHash);assert.ok(r.stableAfterRelease);
 if(run.controlMode==='full'){
  assert.equal(r.studioPixels.rgbaHash,reference.studioPixels.rgbaHash);
  assert.equal(r.uiBefore.motion.length,3);assert.equal(r.uiBefore.undo.length,1);
  assert.deepEqual(r.uiBefore.motion.map(c=>c.nativeToolMotion||c.nativeSecondaryMotion),['draw','draw:18200','draw:18400']);
  assert.ok(r.uiBefore.media.every(a=>!a.error));
  assert.ok(r.uiBefore.undo.every(a=>a.hidden));
  assert.ok(r.uiBefore.motion.every(c=>JSON.parse(c.motionSnapshot).every(a=>a.finished)));
 }else{assert.equal(r.uiBefore.motion.length,0);assert.equal(r.uiBefore.undo.length,0);}
 const failures=run.budgetFailures;
 if(fault){assert.ok(failures.length>0);assert.ok(failures.every(f=>f.metric==='intermediateInkStaleLowerBoundMs'));}
 else assert.deepEqual(failures,[]);
 const valid=r.inkCaptures?.filter(c=>c.after.active&&c.before.delivery.length>8)||[];
 receipts.push({name:run.name,delivered:r.syntheticDeliveredSamples,consumed:r.inkConsumed.length,rate:r.achievedEventHz,callbackHz:r.callbackHz,dispatchP95:r.dispatchHandler.p95,deadlineP95:r.deadlineAge.p95,captures:valid.length,maxStaleLowerBoundMs:valid.length?Math.max(...valid.map(c=>c.bound.staleMs)):null,captureBrackets:valid.map(c=>c.after.time-c.before.time),backingReadMs:valid.map(c=>c.before.backingReadEnd-c.before.time),inkRGBA:r.rgbaHash,viewportRGBA:run.controlMode==='full'?r.studioPixels.rgbaHash:null,failures});
}
await writeFile(`${root}/receipts.json`,JSON.stringify({invariants:'PASS: same options, box, chronological pressure/consumption, input/ink, complete full-studio viewport and source-ready preconditions; red failures only for stale intermediate ink',receipts},null,2));
console.log(JSON.stringify(receipts,null,2));
