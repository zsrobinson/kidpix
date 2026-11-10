import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coldPaintTransform} from './cold-drawing-control.mjs';
const source=readFileSync(new URL('../src/paint.js',import.meta.url),'utf8');
const seed='makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))';
const seams=[seed,'function setOptions(next) {','function cancel() {','function strokeTo(current, end, targetContext = preview) {','function render() {'];
test('cold instrumentation matches current paint once and rejects absent or duplicate seams',()=>{
 assert(coldPaintTransform(source,{instrument:true}).includes('if (targetContext === preview) window.coldLog'));
 for(const seam of seams){
  assert.throws(()=>coldPaintTransform(source.replace(seam,''),{instrument:true}),/seam/);
  assert.throws(()=>coldPaintTransform(source+'\n'+seam,{instrument:true}),/seam/);
 }
 assert(!coldPaintTransform(source).includes('window.coldLog'));
});
test('cold actual sample recording excludes predicted targets and forwards the original target',()=>{
 const code=coldPaintTransform(source,{instrument:true}),start=code.indexOf('function strokeTo('),line=code.slice(start,code.indexOf('\n',start));
 const window={coldLog:[]},preview={},predicted={},contact=7;
 const fn=Function('window','preview','contact',`return ${line} return targetContext; }`)(window,preview,contact);
 assert.equal(fn({}, {x:1}),preview);assert.equal(fn({}, {x:2},predicted),predicted);assert.equal(fn({}, {x:3},preview),preview);
 assert.deepEqual(window.coldLog.map(r=>r.end.x),[1,3]);assert(window.coldLog.every(r=>r.kind==='sample'&&r.contact===7));
});
test('actual cold-load plugin delegates to the tested paint transform',()=>{
 const harness=readFileSync(new URL('./cold-drawing-load.mjs',import.meta.url),'utf8');
 const plugin=Function('assert','instrument','process','coldPaintTransform',harness.slice(harness.indexOf('const patch='),harness.indexOf('let server,browser;'))+'return plugin;')(assert,true,{env:{}},coldPaintTransform);
 assert.equal(plugin.transform(source,'/src/paint.js'),coldPaintTransform(source,{instrument:true}));
});
