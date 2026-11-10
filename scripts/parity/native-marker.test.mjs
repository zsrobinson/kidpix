import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeMarkerStroke, nativeMarkerRGB } from '../../src/native-marker.js';

test('native Marker rounds its half-mask RGB and darkens each destination channel independently', () => {
  assert.deepEqual(nativeMarkerRGB([255, 255, 255], [120, 20, 180], 127), [188, 138, 218]);
  assert.deepEqual(nativeMarkerRGB([30, 150, 90], [120, 20, 180], 127), [30, 85, 90]);
  assert.deepEqual(nativeMarkerRGB([200, 40, 100], [120, 20, 180], 127), [160, 30, 100]);
  assert.deepEqual(nativeMarkerRGB([160, 30, 100], [120, 20, 180], 127), [140, 25, 100]);
  assert.deepEqual(nativeMarkerRGB([30, 150, 90], [255, 255, 255], 254), [30, 150, 90]);
  assert.deepEqual(nativeMarkerRGB([255, 200, 128], [0, 0, 0], 255), [0, 0, 0]);
});

test('Marker texture follows its source coefficient and Option inversion, with zero masks excluded', () => {
  assert.deepEqual(nativeMarkerRGB([255, 255, 255], [0, 0, 0], 127, { texture: 0 }), [191, 191, 191]);
  assert.deepEqual(nativeMarkerRGB([255, 255, 255], [0, 0, 0], 127, { texture: 254 }), [64, 64, 64]);
  assert.deepEqual(nativeMarkerRGB([255, 255, 255], [0, 0, 0], 127, { texture: 0, invertTexture: true }), [63, 63, 63]);
  assert.deepEqual(nativeMarkerRGB([30, 40, 50], [0, 0, 0], 0, { texture: 255 }), [30, 40, 50]);
});

function surface(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return { data, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    clearRect() { data.fill(0); }, putImageData(image) { data.set(image.data); } };
}

test('working Marker strokes accumulate destination changes without baking unchanged page pixels', () => {
  const overlay = surface(3, 2);
  const base = { width: 3, height: 2, data: new Uint8ClampedArray(24).fill(255) };
  base.data.set([30, 150, 90, 255], 4);
  const stroke = createNativeMarkerStroke(base, overlay, { color: [120, 20, 180] });
  const mask = { width: 2, height: 1, data: new Uint8Array([127, 127]) };
  stroke.draw(mask, { x: 0, y: 0, width: 2, height: 1 });
  assert.deepEqual([...overlay.data.slice(0, 12)], [188, 138, 218, 255, 30, 85, 90, 255, 0, 0, 0, 0]);
  stroke.draw(mask, { x: 0, y: 0, width: 2, height: 1 });
  assert.deepEqual([...overlay.data.slice(0, 8)], [154, 79, 199, 255, 30, 53, 90, 255]);
  assert.equal(stroke.used, true);
  assert.deepEqual([...base.data.slice(0, 4)], [255, 255, 255, 255]);
  stroke.reset();
  assert.equal(stroke.used, false);
  assert.ok(overlay.data.every(value => value === 0));
  stroke.draw(mask, { x: 0, y: 0, width: 2, height: 1 });
  assert.deepEqual([...overlay.data.slice(0, 4)], [188, 138, 218, 255]);
});

test('Marker clips original-size masks and samples paper by page position rather than local dab coordinates', () => {
  const overlay = surface(2, 1);
  const stroke = createNativeMarkerStroke({ width: 2, height: 1, data: new Uint8ClampedArray(8).fill(255) }, overlay,
    { color: [0, 0, 0], texture: { width: 2, height: 1, data: new Uint8Array([0, 254]) } });
  stroke.draw({ width: 3, height: 1, data: new Uint8Array([127, 127, 127]) }, { x: -1, y: 0, width: 3, height: 1 });
  assert.deepEqual([...overlay.data], [191, 191, 191, 255, 64, 64, 64, 255]);
  assert.throws(() => stroke.draw({ width: 1, height: 1, data: [127] }, { x: 0, y: 0, width: 2, height: 1 }), /original bitmap/);
});

test('deferred Marker uploads preserve every dab and flush a single dirty union before composition', () => {
  const base = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
  const immediate = surface(8, 8), deferred = surface(8, 8);
  let uploads = 0;
  const rectangles = [];
  const put = deferred.putImageData;
  deferred.putImageData = (image, ...rectangle) => { uploads++; rectangles.push(rectangle); put(image); };
  const a = createNativeMarkerStroke(base, immediate, { color: [20, 40, 60] });
  const b = createNativeMarkerStroke(base, deferred, { color: [20, 40, 60], deferUploads: true });
  const mask = { width: 2, height: 2, data: new Uint8ClampedArray(4).fill(127) };
  for (const x of [0, 1, 3, 7]) {
    const placement = { x, y: 2, width: 2, height: 2 };
    a.draw(mask, placement); b.draw(mask, placement);
  }
  assert.equal(uploads, 0);
  b.flush();
  assert.equal(uploads, 1);
  assert.deepEqual(rectangles, [[0, 0, 0, 2, 8, 2]]);
  assert.deepEqual(deferred.data, immediate.data);
  b.flush(); assert.equal(uploads, 1);
  b.draw(mask, { x: 2, y: 2, width: 2, height: 2 });
  b.reset(); b.flush();
  assert.equal(uploads, 1);
  assert.ok(deferred.data.every(channel => channel === 0));
});
