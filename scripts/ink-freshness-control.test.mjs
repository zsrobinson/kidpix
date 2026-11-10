import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshnessTransform,inkExtent,staleBound} from './ink-freshness-control.mjs';
import {readFileSync} from 'node:fs';
test('production render seam is strict and render is unchanged without display fault',()=>{
 const source=readFileSync(new URL('../src/paint.js',import.meta.url),'utf8');
 assert.ok(freshnessTransform(source,150).includes('},150)'));
 assert.ok(!freshnessTransform(source,0).includes('inkRenderNow'));
 assert.throws(()=>freshnessTransform('missing',150),/seam changed/);
});
test('extent scans only paper stroke strip, handles white and one dark pixel',()=>{
 const png={width:720,height:542,data:Buffer.alloc(720*542*4,255)},box={x:0,y:0,width:720,height:542};
 assert.equal(inkExtent(png,box,1,1),null);
 png.data.fill(0,(270*720+200)*4,(270*720+200)*4+3);
 png.data.fill(0,(400*720+600)*4,(400*720+600)*4+3);
 assert.equal(inkExtent(png,box,1,1),200);
});
test('same delivered/final samples can reject stale intermediate ink',()=>{
 const points=Array.from({length:241},(_,i)=>({nativeX:60+i*2.5}));
 const delivery=Array.from({length:60},(_,i)=>({start:i*1000/60,lastIndex:(i+1)*4}));
 assert.equal(staleBound(660,delivery,points).staleMs,0);
 assert.ok(staleBound(560,delivery,points).staleMs>=149);
 assert.equal(staleBound(560,delivery,points).lastDelivered,240);
 assert.equal(staleBound(660,[],points),null);
});
test('consumption recording excludes disposable predicted continuations',()=>{
 const source='  function strokeTo(current, end, targetContext = preview) { return targetContext }';
 const window={sharedPerf:{enabled:true}},preview={},predicted={};
 const stroke=Function('window','preview',freshnessTransform(source)+';return strokeTo')(window,preview);
 assert.equal(stroke({}, {x:1}),preview);
 assert.equal(stroke({}, {x:2},predicted),predicted);
 assert.equal(stroke({}, {x:3},preview),preview);
 assert.deepEqual(window.inkConsumed.map(p=>p.x),[1,3]);
});
