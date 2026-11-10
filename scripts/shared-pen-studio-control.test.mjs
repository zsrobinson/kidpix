import test from 'node:test';
import assert from 'node:assert/strict';
import { studioControlPlugin } from './shared-pen-studio-control.mjs';
import { compareStudioRuns } from './shared-pen-studio-compare.mjs';

test('minimal route serves actual paint fixture; full route passes through',async()=>{
 for(const mode of ['full','minimal']){
  let handler,html,passed=false;
  studioControlPlugin(mode).configureServer({middlewares:{use(fn){handler=fn;}},transformIndexHtml:async(_,s)=>s});
  await handler({url:'/'},{setHeader(){},end(s){html=s;}},()=>{passed=true;});
  assert.equal(passed,mode==='full');
  if(mode==='minimal'){assert.match(html,/createPaint\(c,\{includeForeground:false\}\)/);assert.doesNotMatch(html,/data-native-tool-motion|native-animation/);}
 }
 assert.throws(()=>studioControlPlugin('fake'));
 assert.throws(()=>studioControlPlugin('full','fake'));
});
const pair=()=>{
 const state={undo:[{hidden:true}],motion:[{motionSnapshot:'[{"finished":true}]'}],media:[]};
 const row={box:{x:218.9947967529297},stage:{canvas:{width:720,height:542},options:{tool:'pencil'},chain:[{tag:'CANVAS',id:'paper-canvas',rect:{x:218.9947967529297},geometry:{transform:'none'}}]},width:720,height:542,rgbaBytes:1560960,rgbaHash:'same',stableAfterRelease:true,syntheticDeliveredSamples:240,syntheticDeliveredEvents:60,batch:4,raw:{delivery:[{samples:240}]},uiBefore:state};
 const full={controlMode:'full',uiScenario:'quiescent',instrument:false,uiTrace:false,errors:[],budgetFailures:[],rows:[row]};
 const minimal=structuredClone(full);minimal.controlMode='minimal';minimal.rows[0].uiBefore={undo:[],motion:[],media:[]};return[full,minimal];
};
test('matched control gates accept exact geometry and pixels',()=>assert.equal(compareStudioRuns(pair()).samples,480));
test('control gates reject original subpixel mismatch, dropped samples, and changed RGBA',()=>{
 for(const mutate of [r=>r.box.x+=.078125,r=>r.stage.chain[0].rect.x+=.078125,r=>r.syntheticDeliveredSamples--,r=>r.rgbaHash='changed',r=>r.stage.options.tool='marker']){
  const runs=pair();mutate(runs[1].rows[0]);assert.throws(()=>compareStudioRuns(runs));
 }
});
test('control gates reject a source actor not completed or media still playing',()=>{
 for(const mutate of [s=>s.undo[0].hidden=false,s=>s.motion[0].motionSnapshot='[{"finished":false}]',s=>s.media.push({src:'/ui/sound.wav',paused:false,ended:false})]){
  const runs=pair();mutate(runs[0].rows[0].uiBefore);assert.throws(()=>compareStudioRuns(runs));
 }
});
