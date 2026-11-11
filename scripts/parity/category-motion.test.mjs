import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { actionManifest } from '../../src/native-action-motion.js';
import { categoryProfile, categoryStates, createCategoryIdentity } from '../../src/native-category-motion.js';
import { createActionStateController } from '../../src/native-action-state.js';
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/library-category-source.json'));
const manifest = () => actionManifest(structuredClone(fixture), categoryProfile);
for (const [index,count,programs] of [[0,3,[18315,18293]],[1,3,[18290,18293]],[2,3,[18290,18316]],[0,1,[18315,18316]],[-1,3,[18315,18316]],[9,3,[18315,18316]],[0,0,[18315,18316]],[NaN,2,[18315,18316]]]) {
  test(`category boundary ${index}/${count}`, () => {
    const m=manifest(), c=createActionStateController(m,{now:()=>0,authoritative:categoryStates(m,{categoryIndex:index,categoryCount:count})});
    assert.deepEqual(c.snapshot().map(s=>s.script),programs);
    c.snapshot().forEach((s,i)=>{assert.equal(c.press(i),!s.disabled);c.cancel();});c.dispose();
  });
}
test('two identical tracking groups keep delayed cue and ordinary release, no exclusive group',()=>{
  const m=manifest(),cues=[],c=createActionStateController(m,{now:()=>0,playSound:cue=>cues.push(cue),authoritative:categoryStates(m,{categoryIndex:1,categoryCount:3})});
  assert.equal(c.press(0),true);assert.equal(cues.length,0);c.step(99);assert.equal(cues.length,0);
  c.step(100);assert.equal(cues.length,1);assert.equal(cues[0].sound,18003);
  c.setAuthoritativeState(0,{active:false,boundary:false,disabled:false});c.step(150);assert.equal(cues.length,1);
  assert.equal(c.release(true).binding,'category-step:-1');assert.deepEqual(c.snapshot().map(s=>s.state),[0,0]);
  c.setAuthoritativeState(0,{boundary:true,disabled:true});assert.equal(c.press(0),false);
  c.setAuthoritativeState(0,{boundary:false,disabled:false});assert.equal(c.press(0),true);c.cancel();c.dispose();
});
for(const mutation of ['slot','truncate','registration','cue'])test(`source red control ${mutation}`,()=>{
  const f=structuredClone(fixture);
  if(mutation==='slot')f.tables[18901].buttons[0].rawWords[3]=0;
  if(mutation==='truncate')f.scripts[18291].frames.pop();
  if(mutation==='registration')f.scripts[18291].frames[0].parts[0].registrationXY[0]++;
  if(mutation==='cue')f.scripts[18291].sounds=[];
  assert.throws(()=>actionManifest(f,categoryProfile));
});
test('identity ignores filtered allocation; rejects list/order/tab/library/category replacement',()=>{
  const identity=createCategoryIdentity(),a={},b={},source=[a,b];
  const state={key:'backgrounds',tab:'',source,categories:[a,b],categoryIndex:0};
  const initial=identity(state);assert.equal(identity({...state,categories:[a,b]}),initial);
  for(const change of [{categories:[b,a]},{source:[a,b]},{tab:'maps'},{key:'stickers'},{categoryIndex:1}])assert.notEqual(identity({...state,...change}),initial);
});
