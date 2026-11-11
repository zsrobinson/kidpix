import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actionManifest,actionProfile,actionStates,actionTarget} from '../../src/native-action-motion.js';
import {createActionStateController} from '../../src/native-action-state.js';
const source=JSON.parse(readFileSync(new URL('../../tests/fixtures/hand-navigation-source.json',import.meta.url)));
const data={tables:{926:{buttons:source.rows}},scripts:source.programs,sprites:source.sprites};
const manifest=()=>actionManifest(data,{table:926,rows:[5,10]});
test('exact navigation ownership excludes Hand row11 and preserves clipboard/reorder',()=>{
 assert.deepEqual(actionProfile({tray:'grab',selected:'grab'}).rows,[2,3,4,5,6,7,8,9,10]);
 assert.deepEqual(actionProfile({tray:'grab',selected:'scissors'}).rows,[2,3,4,11]);
 const m=manifest();assert.deepEqual(m.restorationRects,[[491,648,40,83]]);
 assert.deepEqual(m.buttons.map(b=>b.action),['navigate:1','navigate:-1']);
 assert.deepEqual(actionStates(m,{navigationAvailable:true}).map(s=>s.disabled),[false,false]);
 assert.deepEqual(actionStates(m,{navigationAvailable:false}).map(s=>s.disabled),[true,true]);
 assert.equal(actionTarget({target:'a',navigationIdentity:'order:2'},'bold'),'a');
 assert.equal(actionTarget({target:'a',navigationIdentity:'order:2'},'navigate:1'),'order:2');
});
for(const row of [0,1])test(`row ${row}: authored single hover, cue gate, release once and cancellation`,()=>{
 let complete=false,cues=0,stops=0;
 const c=createActionStateController(manifest(),{now:()=>0,playSound:cue=>{assert.deepEqual([cue.sound,cue.tick,cue.channel],[18072,1,1]);cues++;return{isComplete:()=>complete,stop:()=>stops++}}});
 c.enter(row,0);for(let n=1;n<4;n++){c.step(n*100);assert.equal(c.snapshot()[row].auxiliary,true);assert.equal(c.snapshot()[row].tick,0)}
 c.leave(row,400);assert.equal(c.snapshot()[row].auxiliary,false);
 c.press(row,400);c.step(500);assert.equal(cues,1);c.step(600);assert.equal(c.snapshot()[row].finished,false);
 complete=true;c.step(700);assert.equal(c.snapshot()[row].finished,true);
 assert.equal(c.release(true,700).binding,row===0?'navigate:1':'navigate:-1');assert.equal(c.release(true,700),null);
 c.press(row,800);c.cancel(850);assert.equal(c.release(true,900),null);assert.ok(stops>0);
});
test('truncated or mismatched row/program metadata fails closed',()=>{
 for(const mutate of [d=>d.tables[926].buttons[0].stateScripts[2]=1,d=>d.scripts[18359].frames.pop(),d=>d.tables[926].buttons[1].region.boundsXYWH[1]++]){
  const d=structuredClone(data);mutate(d);assert.throws(()=>actionManifest(d,{table:926,rows:[5,10]}));
 }
});
