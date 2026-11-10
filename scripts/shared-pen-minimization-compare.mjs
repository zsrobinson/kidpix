import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareStudioRuns} from './shared-pen-studio-compare.mjs';
const runs=await Promise.all(process.argv.slice(2).map(async file=>JSON.parse(await readFile(file,'utf8'))));
assert(runs.length>=2);
const summary=[];
for(const run of runs){
 assert.deepEqual(run.errors,[]);
 assert(run.rows.length>=3,'Need at least three strokes');
 const failures=run.rows.filter(r=>r.callbackHz<45);
 assert.equal(run.budgetFailures.length,failures.length);
 assert(run.budgetFailures.every(b=>b.metric==='callbackHz'&&b.min===45));
 if(run.minimize==='none'&&run.controlMode==='full')assert.equal(failures.length,run.rows.length,'Full control no longer consistently red');
 else if(run.controlMode==='minimal')assert.equal(failures.length,0,'Minimal control no longer green');
 for(const row of run.rows){
  assert.deepEqual(row.stageDuring.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry})),row.stage.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry})));
  const r=row.minRestored;
  assert.deepEqual(r.after.canvases,r.before.canvases);
  assert.deepEqual(r.during.owners.motion,r.before.owners.motion);
  const ownerCount=run.controlMode==='minimal'?0:3;assert.equal(r.before.owners.motion.length,ownerCount);assert.equal(r.during.owners.motion.length,ownerCount);
  assert.equal(r.during.owners.undo.length,r.before.owners.undo.length);
  if(run.controlMode==='full')assert(r.during.owners.undo.length>0);else assert.equal(r.during.owners.undo.length,0);
  assert(r.during.owners.undo.every(a=>a.hidden));
  assert(r.during.owners.motion.every(c=>JSON.parse(c.motionSnapshot).every(a=>a.finished)));
  assert(r.during.owners.media.filter(a=>a.src.includes('/ui/')).every(a=>a.paused||a.ended||a.error));
  assert(r.during.nodes.every(n=>n.connected&&n.visibility==='hidden'));
  if(run.minimize!=='none')assert(r.during.nodes.length>0);
  assert(row.callbackCount>=20);
  assert(Math.abs(row.timing.dateElapsed-(row.timing.end-row.timing.start))<100);
 }
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 summary.push({mode:run.controlMode,treatment:run.minimize,budgetState:failures.length===0?'green':failures.length===run.rows.length?'red':'mixed',patterns:Object.fromEntries([...new Set(run.rows.map(r=>r.eventHz+'x'+r.batch))].map(p=>{const rows=run.rows.filter(r=>r.eventHz+'x'+r.batch===p);return[p,{callbackHz:median(rows.map(r=>r.callbackHz)),idleHz:median(rows.map(r=>r.timing.frames.length*1000/(r.timing.end-r.timing.start))),dispatchP95:median(rows.map(r=>r.dispatchHandler.p95)),achievedHz:median(rows.map(r=>r.achievedEventHz)),worstGap:Math.max(...rows.map(r=>r.maxObservedOrCensoredGap))}]}))});
}
// Verify original files before passing copies with explicitly expected budget failures cleared.
const accepted=runs.map(r=>({...r,budgetFailures:[]}));
console.log(JSON.stringify({invariants:compareStudioRuns(accepted),summary},null,2));
