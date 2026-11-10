import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const harness=readFileSync(new URL('./pencil-prediction-preview.mjs',import.meta.url),'utf8');
const plugin=Function('assert','process',harness.slice(harness.indexOf('const injection ='),harness.indexOf('const receipts ='))+'return injection;')(assert,{env:{}});
const source=readFileSync(new URL('../src/paint.js',import.meta.url),'utf8');
test('fixture traces require unique actual, random and native draw seams',()=>{
 const output=plugin.transform(source,'/src/paint.js');assert(output.includes('__predictionNativeTrace'));
 for(const seam of ['function strokeTo(current, end, targetContext = preview) {','return () => {\n    seed','    if (current.nativeMarker) {','      drawOriginalDab(preview, point, brush, dab, image, random, current.step++)']){
  assert.throws(()=>plugin.transform(source.replace(seam,''),'/src/paint.js'),/fixture seam changed/);
  assert.throws(()=>plugin.transform(source+'\n'+seam,'/src/paint.js'),/fixture seam changed/);
 }
});
