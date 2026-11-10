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

test('promotion controls change only the selected presentation hint',()=>{
 for(const [mode,selector] of [['paper-promote','#paper-canvas'],['surface-promote','#surface']]){
  const original='<head></head><body>retained studio</body>';
  const html=studioControlPlugin('full',mode).transformIndexHtml(original);
  assert.equal(html,`<head><style>${selector}{will-change:transform}</style></head><body>retained studio</body>`);
 }
});

test('presentation comparison rejects changed whole-studio pixels even if ink matches',()=>{
 const runs=pair();runs[1].controlMode='full';runs[1].rows[0].uiBefore=structuredClone(runs[0].rows[0].uiBefore);for(const r of runs)r.rows[0].studioPixels={width:2732,height:2048,rgbaHash:'same'};
 assert.equal(compareStudioRuns(runs).strokes,2);
 runs[1].rows[0].studioPixels.rgbaHash='changed';assert.throws(()=>compareStudioRuns(runs),/Visible studio pixels differ/);
});

test('gradient removal remains an explicit attribution-only style',()=>{
 const html=studioControlPlugin('full','studio-no-gradient').transformIndexHtml('<head></head><body>studio</body>');
 assert.equal(html,'<head><style>#app #studio{background-image:none}</style></head><body>studio</body>');
});

test('minimal control retains exact ink comparison while its omitted studio is explicit',()=>{
 const runs=pair();for(const [i,r] of runs.entries())r.rows[0].studioPixels={width:2732,height:2048,rgbaHash:String(i)};
 assert.equal(compareStudioRuns(runs).strokes,2);
});

test('chrome removal affects only its background, with inline-style override',()=>{
 const original='<html><head></head><body><div id="paint-chrome" style="background-image:url(original.png)"></div></body></html>';
 const html=studioControlPlugin('full','chrome-no-image').transformIndexHtml(original);
 assert.match(html,/#app #paint-chrome\{background-image:none!important\}/);
 assert.match(html,/id="paint-chrome" style="background-image:url\(original.png\)"/);
 assert.doesNotMatch(html,/display:none|visibility:hidden/);
});

test('overlay attribution retains DOM and hides only the selected surfaces',()=>{
 for(const [mode,selector] of [['overlays-hidden','#app #foreground,#app #scene-effects'],['foreground-hidden','#app #foreground'],['effects-hidden','#app #scene-effects']]){
  const html=studioControlPlugin('full',mode).transformIndexHtml('<head></head><body>unchanged</body>');
  assert.equal(html,`<head><style>${selector}{visibility:hidden!important}</style></head><body>unchanged</body>`);
 }
});

test('blank overlay gate rejects visible ink, ineffective treatments and backing changes',async()=>{
 const {assertBlankOverlays}=await import('./shared-pen-studio-control.mjs');
 const rows=['foreground','scene-effects'].map((id,i)=>({id,width:720,height:542,nontransparent:0,display:'block',visibility:'visible',opacity:'1',zIndex:String(i+3),pointerEvents:'none'}));
 assertBlankOverlays(rows,'default');
 const hidden=structuredClone(rows);hidden.forEach(r=>r.visibility='hidden');assertBlankOverlays(hidden,'overlays-hidden');
 assert.throws(()=>assertBlankOverlays(rows,'overlays-hidden'));
 for(const mutate of [r=>r.nontransparent=1,r=>r.width=719,r=>r.display='none',r=>r.zIndex='2']){
  const bad=structuredClone(hidden);mutate(bad[0]);assert.throws(()=>assertBlankOverlays(bad,'overlays-hidden'));
 }
});

test('empty object-container control rejects children and ineffective hiding',async()=>{
 const {assertEmptyObjects}=await import('./shared-pen-studio-control.mjs');
 const row={children:0,display:'block',visibility:'hidden',zIndex:'2',pointerEvents:'none'};
 assertEmptyObjects(row,'objects-hidden');
 assert.throws(()=>assertEmptyObjects({...row,children:1},'objects-hidden'));
 assert.throws(()=>assertEmptyObjects({...row,visibility:'visible'},'objects-hidden'));
 assert.equal(studioControlPlugin('full','objects-hidden').transformIndexHtml('<head></head>'),'<head><style>#app #objects{visibility:hidden!important}</style></head>');
});

test('matched run comparison checks actual blank-overlay pixels and subpixel rects',()=>{
 const runs=pair();runs[1].controlMode='full';runs[1].rows[0].uiBefore=structuredClone(runs[0].rows[0].uiBefore);
 const overlays=['foreground','scene-effects'].map((id,i)=>({id,width:720,height:542,nontransparent:0,display:'block',visibility:'visible',opacity:'1',zIndex:String(i+3),pointerEvents:'none',rect:{x:218.9947967529297}}));
 for(const run of runs){run.rows[0].overlaysBefore=structuredClone(overlays);run.rows[0].overlaysAfter=structuredClone(overlays);}
 assert.equal(compareStudioRuns(runs).strokes,2);
 const layered=structuredClone(runs);for(const run of layered){run.scene='layered';for(const phase of ['overlaysBefore','overlaysAfter'])run.rows[0][phase][0].nontransparent=12;}
 assert.equal(compareStudioRuns(layered).strokes,2);
 for(const mutate of [r=>r.nontransparent=1,r=>r.rect.x+=.078125,r=>r.visibility='hidden']){
  const bad=structuredClone(runs);mutate(bad[1].rows[0].overlaysAfter[0]);assert.throws(()=>compareStudioRuns(bad));
 }
});
