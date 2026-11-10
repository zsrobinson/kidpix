import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertOwnerWindow } from './shared-pen-idle-control.mjs';
import { assertBlankOverlays, assertEmptyObjects } from './shared-pen-studio-control.mjs';
import { samePixels } from './shared-pen-pixels.mjs';

export function compareStudioRuns(runs) {
 assert(runs.length>=2,'Need matched controls');
 const reference=runs[0], first=reference.rows[0];
 assert(first,'Missing rows');
 let strokes=0;
 for(const run of runs){
  for(const key of ['engine','browser','harnessSha256','instrument','uiTrace','seed','samples','scene','uiScenario','displayAlpha','displayReadFrequently','cpu','helperHashes','strokeCounters','strokeAttribution'])assert.deepEqual(run[key],reference[key],key);
  assert.equal(run.uiScenario,'quiescent');assert.equal(run.instrument,false);assert.equal(run.uiTrace,false);
  assert.equal(run.idleOwners==='off'||!run.idleOwners,reference.idleOwners==='off'||!reference.idleOwners,'Owner instrumentation mismatch');
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.budgetFailures,[]);
  for(const row of run.rows){
   assert.deepEqual(row.box,first.box,'Input box drift');
   if(first.points)assert.deepEqual(row.points,first.points,'Pressure/path chronology drift');
   assert.deepEqual(row.contextAttributes,first.contextAttributes,'Context attribute drift');
   assert.equal(row.nonOpaquePixels,first.nonOpaquePixels,'Opacity drift');
   assert.deepEqual(row.stage.canvas,first.stage.canvas,'Backing size drift');
   assert.deepEqual(row.stage.options,first.stage.options,'Tool options drift');
   assert.deepEqual(row.stage.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry})),first.stage.chain.map(({tag,id,rect,geometry})=>({tag,id,rect,geometry})),'Stage geometry drift');
   assert(samePixels(row,first),'Decoded RGBA mismatch');assert(row.stableAfterRelease,'Unsettled pixels');
   assert.equal(row.syntheticDeliveredSamples,240);assert.equal(row.syntheticDeliveredEvents,240/row.batch);
   assert.equal(row.raw.delivery.reduce((n,e)=>n+e.samples,0),240);
   if(row.overlaysBefore){
    for(const overlays of [row.overlaysBefore,row.overlaysAfter]){
     if(run.scene!=='layered'||run.presentation?.endsWith('-hidden'))assertBlankOverlays(overlays,run.presentation);
     if(first.overlaysBefore)assert.deepEqual(overlays.map(({visibility,...rest})=>rest),first.overlaysBefore.map(({visibility,...rest})=>rest),'Overlay geometry/backing drift');
    }
   }
   if(row.objectsBefore)for(const objects of [row.objectsBefore,row.objectsAfter]){
    if(run.scene!=='layered'||run.presentation==='objects-hidden')assertEmptyObjects(objects,run.presentation);
    if(first.objectsBefore){const {visibility,...actual}=objects,{visibility:ignored,...expected}=first.objectsBefore;assert.deepEqual(actual,expected,'Object container drift');}
   }
   const state=row.uiBefore;
   assert(state.undo.every(a=>a.hidden),'Visible Undo');
   assert(state.motion.every(c=>JSON.parse(c.motionSnapshot).every(a=>a.finished)),'Unfinished motion');
   assert(state.media.filter(a=>a.src.includes('/ui/')).every(a=>a.paused||a.ended||a.error),'Active UI media');
   if(run.controlMode==='full'){assert(state.undo.length>0);assert(state.motion.length>0);}else{assert.equal(state.undo.length,0);assert.equal(state.motion.length,0);}
   if(row.ownerBefore)assertOwnerWindow(row.ownerBefore,row.ownerEnd,row.ownerResumed,run.idleOwners==='parked');
   if(first.studioPixels && reference.controlMode==='full' && run.controlMode==='full'){assert(row.studioPixels,'Missing whole studio pixels');assert(samePixels(row.studioPixels,first.studioPixels),'Visible studio pixels differ');}
   strokes++;
  }
 }
 return {strokes,samples:strokes*240,box:first.box,rgbaHash:first.rgbaHash,geometry:'exact ancestry rects/computed layout/transform',options:first.stage.options};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const files=process.argv.slice(2);const runs=await Promise.all(files.map(async f=>JSON.parse(await readFile(f,'utf8'))));
 console.log(JSON.stringify(compareStudioRuns(runs),null,2));
}
