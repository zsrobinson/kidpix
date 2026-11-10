import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayControlTransform} from './shared-pen-display-control.mjs';
const source=readFileSync(new URL('../src/paint.js',import.meta.url),'utf8');
test('default control is byte-identical; strict seams fail closed',()=>{
 assert.equal(displayControlTransform(source),source);
 assert.throws(()=>displayControlTransform(source.replace('function render() {','function different() {'),{coalesce:true}),/seam changed/);
});
test('benchmark changes only final ordinary move display request',()=>{
 const transformed=displayControlTransform(source,{coalesce:true});
 assert(transformed.includes("event.type === 'pointermove' && current.type === 'stroke'"));
 assert(transformed.includes('current.nativePoll === undefined'));
 const samples='for (const entry of pointerSamples(event)) {';
 assert.equal(transformed.slice(transformed.indexOf(samples),transformed.indexOf(samples)+420),source.slice(source.indexOf(samples),source.indexOf(samples)+420));
 assert(transformed.includes('cancelAnimationFrame(sharedDisplayFrame)'));
});
test('counter and attribution transformations assemble with treatment',()=>{
 for(const coalesce of [false,true])for(const attribution of [false,true]){
  const code=displayControlTransform(source,{coalesce,counters:true,attribution});
  assert(code.includes('m.samples.push({...args[1]})'));
  assert(code.includes('function sharedOriginal_handleMove(event)'));
 }
});
test('wrappers forward display targets while excluding prediction work from actual ink records',()=>{
 for(const attribution of [false,true]){
  const code=displayControlTransform(source,{counters:true,attribution});
  const window={sharedPerf:{enabled:true},sharedStroke:{calls:{},samples:[]}},preview={},predicted={};
  for(const name of ['strokeTo','drawDab','compose']){
   const start=code.indexOf(`function ${name}(...args) {`),end=code.indexOf(`function sharedOriginal_${name}(`,start);
   assert(start>=0&&end>start);
   const forwarded=[],original=(...args)=>{forwarded.push(args);return args[2]};
   const wrapper=Function('window','preview',`sharedOriginal_${name}`,`return (${code.slice(start,end).trim()})`)(window,preview,original);
   assert.equal(wrapper({}, {x:1},preview),preview);
   assert.equal(wrapper({}, {x:2},predicted),predicted);
   assert.equal(wrapper({}, {x:3}),undefined);
   assert.equal(forwarded.length,3);assert.equal(forwarded[1][2],predicted);
   assert.equal(window.sharedStroke.calls[name].count,name==='compose'?3:2);
  }
  assert.deepEqual(window.sharedStroke.samples.map(p=>p.x),[1,3]);
 }
});
