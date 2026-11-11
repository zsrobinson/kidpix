import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { actionManifest, actionProfile, actionStates, actionTarget } from '../../src/native-action-motion.js';
import { prepareStickerRaster, stickerRaster } from '../../src/sticker-raster.js';
const pin=JSON.parse(fs.readFileSync('tests/fixtures/make-sticker-source.json'));
function source(){return {tables:{926:{buttons:[structuredClone(pin.row)]}},scripts:structuredClone(pin.programs),sprites:structuredClone(pin.sprites),sounds:{}}}
const profile={table:926,rows:[11]};
test('row11 owns exactly its source footprint and is Scissors-only; Hand excludes row11',()=>{
 const m=actionManifest(source(),profile);assert.deepEqual(m.restorationRects,[[493,647,61,86]]);
 assert.equal(m.buttons[0].action,'make-sticker');assert.deepEqual(actionProfile({tray:'grab',selected:'scissors'}).rows,[2,3,4,11]);
 assert.deepEqual(actionProfile({tray:'grab',selected:'grab'}).rows,[2,3,4,5,6,7,8,9,10]);
 assert.deepEqual(actionStates(m,{stickerAvailable:false}),[{active:false,disabled:true}]);
 assert.equal(actionTarget({stickerIdentity:'selection:revision'},'make-sticker'),'selection:revision');
});
for(const mutation of ['row','params','command','program','frames','cue','sprite'])test(`row11 fails closed on missing/changed ${mutation}`,()=>{
 const d=source();if(mutation==='row')d.tables[926].buttons=[];
 if(mutation==='params')d.tables[926].buttons[0].rolloverParameters=[1,0,0];
 if(mutation==='command')d.tables[926].buttons[0].command=22355;
 if(mutation==='program')delete d.scripts[18378];
 if(mutation==='frames')d.scripts[18378].frames.pop();
 if(mutation==='cue')d.scripts[18378].sounds=[];
 if(mutation==='sprite')delete d.sprites['18000:635'];
 assert.throws(()=>actionManifest(d,profile));
});
test('raster preparation rejects empty and noninteger geometry, brands opaque immutable bytes',()=>{
 const owner={};const canvas={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([1,2,3,255])})}),toDataURL:()=> 'data:image/png;base64,pixels'};
 assert.equal(prepareStickerRaster(canvas,{x:.1,y:0,width:1,height:1},owner),null);
 const token=prepareStickerRaster(canvas,{x:0,y:0,width:1,height:1},owner);
 assert.ok(Object.isFrozen(token));assert.ok(Object.isFrozen(stickerRaster(token)));assert.equal(stickerRaster({}),null);
 assert.equal(stickerRaster(token).owner,owner);
 canvas.getContext=()=>({getImageData:()=>({data:new Uint8ClampedArray(4)})});
 assert.equal(prepareStickerRaster(canvas,{x:0,y:0,width:1,height:1},owner),null);
});
// Execute the actual coordinator with explicit ownership/decode models. These
// model fault order and history only; they make no raster/browser timing claim.
import vm from 'node:vm';
function coordinator({failure,stale=false}={}){
 let releaseDecode;const decode=new Promise(r=>{releaseDecode=r});
 const main=fs.readFileSync('src/main.js','utf8');
 const code=main.slice(main.indexOf('let stickerRequest ='),main.indexOf('async function activate(action)'));
 const capture={payload:{}},state={tray:'grab',tools:{grab:'scissors'},selectionStyle:'rectangle',playing:false};
 let selected=true,valid=true;const objects=[];const undo=[],redo=['existing'];
 const context={window:{addEventListener(){}},document:{addEventListener(){}},pictureGeneration:1,loadingProject:false,firehose:{busy:false},state,canvas:{},undoStack:undo,redoStack:redo,undoFaceRedo:false,
  paint:{captureSticker:()=>selected?capture:null,validateSticker:()=>valid,consumeSticker:()=>{selected=false;return true},restoreStickerSelection:()=>{selected=true}},
  scene:{stickerIdentity:'scene:1',prepareSticker:async()=>{await decode;return {}},suspend:()=>({rollback(){objects.length=0},release(){}}),insertPreparedSticker(){objects.push('sticker');if(failure==='insert')throw Error('modeled insertion failure');return {before:[],after:['sticker']}}},
  showTray(){if(failure==='tool'&&state.tools.grab==='grab')throw Error('modeled tool failure')},remember(entry){undo.push(entry);redo.length=0;if(failure==='history')throw Error('modeled history failure')},syncHistory(){},updateActionMotion(){},showStatus(){}};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,objects,undo,redo,state,get selected(){return selected},release(){if(stale)valid=false;releaseDecode()}};
}
for(const failure of [undefined,'insert','tool','history'])test(`actual coordinator modeled ${failure??'success'} and duplicate requests`,async()=>{
 const c=coordinator({failure});const a=c.context.makeSticker(),b=c.context.makeSticker();c.release();await Promise.all([a,b]);
 assert.equal(c.objects.length,failure?0:1);assert.equal(c.selected,!!failure);assert.equal(c.state.tools.grab,failure?'scissors':'grab');assert.equal(c.undo.length,failure?0:1);assert.deepEqual(c.redo,failure?['existing']:[]);
});
test('actual coordinator rejects stale modeled paint ownership after decode',async()=>{const c=coordinator({stale:true});const p=c.context.makeSticker();c.release();await p;assert.equal(c.objects.length,0);assert.equal(c.selected,true);assert.deepEqual(c.redo,['existing'])});

test('actual coordinator rejects pending Open before extraction/history suppression',async()=>{const c=coordinator();c.context.loadingProject=true;await c.context.makeSticker();assert.equal(c.objects.length,0);assert.equal(c.selected,true);assert.equal(c.undo.length,0)});
