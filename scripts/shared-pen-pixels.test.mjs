import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { snapshotPNG, samePixels } from './shared-pen-pixels.mjs';
const encode = (data,colorType,width=2,height=1) => 'data:image/png;base64,'+PNG.sync.write({width,height,data:Buffer.from(data)},{colorType}).toString('base64');
test('decoded equality permits encoding differences but rejects one channel',()=>{
 const data=[255,255,255,255,12,34,56,255];
 const rgba=snapshotPNG(encode(data,6)),rgb=snapshotPNG(encode(data,2));
 assert.notEqual(rgba.pngHash,rgb.pngHash);assert.notEqual(rgba.pngColorType,rgb.pngColorType);
 assert.equal(samePixels(rgba,rgb),true);assert.equal(rgba.rgbaBytes,8);
 data[4]++;assert.equal(samePixels(rgba,snapshotPNG(encode(data,6))),false);
});

test('equal RGBA byte sequences with different dimensions are different images',()=>{
 const data=[255,255,255,255,12,34,56,255];
 assert.equal(samePixels(snapshotPNG(encode(data,6,2,1)),snapshotPNG(encode(data,6,1,2))),false);
});
