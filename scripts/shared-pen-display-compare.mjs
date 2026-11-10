import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {snapshotPNG,samePixels} from './shared-pen-pixels.mjs';
import {compareStudioRuns} from './shared-pen-studio-compare.mjs';
export function compareDisplayRuns(runs) {
 const identity=compareStudioRuns(runs);
 assert.equal(runs.length,3,'baseline/treatment/restored baseline required');
 assert.deepEqual(runs.map(r=>r.coalesceDisplay),[false,true,false]);
 for(const run of runs)if(run.strokeCounters){
  assert.equal(run.lifecycle?.length,3,'Missing terminal lifecycle probes');
  for(const [i,row] of run.lifecycle.entries()){
   assert.equal(row.extraRenders,0,'RAF render after synchronous terminal operation');
   assert(samePixels(snapshotPNG(row.immediate),snapshotPNG(row.afterDrain)),'Post-terminal pixels changed');
   assert(samePixels(snapshotPNG(row.immediate),snapshotPNG(runs[0].lifecycle[i].immediate)),'Immediate terminal pixels differ');
   if(run.coalesceDisplay){assert.deepEqual(row.pendingBefore,{pending:true});assert.deepEqual(row.pendingAfter,{pending:false});}
  }
 }
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const summaries=runs.map(run=>({coalesce:run.coalesceDisplay,groups:[...Map.groupBy(run.rows,r=>`${r.eventHz}x${r.batch}`)].map(([pattern,rows])=>{
  assert(rows.length>=3,'Three trials required per pattern');
  for(const row of rows){
   if(run.coalesceDisplay){assert.deepEqual(row.releasePending,{pending:false});assert.deepEqual(row.displayAfterDrain,{pending:false});}
   if(run.strokeCounters){
    const base=runs[0].rows.find(r=>r.eventHz===row.eventHz&&r.batch===row.batch);
    assert.deepEqual(row.stroke.samples,base.stroke.samples,'Consumed pressure/path drift');
    for(const name of ['pointFor','pointerSamples','strokeTo','drawDab','handleMove'])assert.equal(row.stroke.calls[name].count,base.stroke.calls[name].count,name+' call count drift');
    if(run.coalesceDisplay){assert.equal(row.stroke.requests,row.expectedEvents);assert(row.stroke.calls.render.count<base.stroke.calls.render.count,'No actual render reduction');}
   }
  }
  return {pattern,trials:rows.length,callbacks:median(rows.map(r=>r.callbackHz)),p95:median(rows.map(r=>r.callbackFrame.p95)),worst:Math.max(...rows.map(r=>r.maxObservedOrCensoredGap)),leading:Math.max(...rows.map(r=>r.leadingGap)),trailing:Math.max(...rows.map(r=>r.trailingGap)),eventHz:median(rows.map(r=>r.achievedEventHz)),dispatchP95:median(rows.map(r=>r.dispatchHandler.p95)),deadlineP95:median(rows.map(r=>r.deadlineAge.p95)),requests:rows.map(r=>r.stroke.requests),renders:rows.map(r=>r.stroke.calls.render?.count??null)};
 })}));
 return {identity,summaries};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(JSON.stringify(compareDisplayRuns(await Promise.all(process.argv.slice(2).map(async p=>JSON.parse(await readFile(p,'utf8'))))),null,2));
}
