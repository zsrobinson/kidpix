import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectNativeShape, selectNativeSprayClip, drawNativeShape, nativeSprayFrameAt, drawNativeSprayFrame } from '../../src/native-spray-runtime.js';

const bankOf = count => ({ frameCount: count, frames: Array.from({ length: count }, (_, index) => ({ index })) });

test('static spray starts at source image one and uses native rounded selection boundaries', () => {
  const bank = bankOf(6);
  assert.equal(selectNativeShape(bank, () => { throw new Error('First image must not sample RNG'); }, true).index, 0);
  const values = [0, 0.124999, 0.125, 0.374999, 0.375, 0.624999, 0.625, 0.874999, 0.875, 0.999999, 1];
  assert.deepEqual(values.map(value => selectNativeShape(bank, () => value).index), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  assert.equal(selectNativeShape(bankOf(1), () => 0.99).index, 0);
  assert.equal(selectNativeShape(bankOf(2), () => 0.99).index, 0);
  assert.throws(() => selectNativeShape(bank, () => -0.1), /Random value/);
});

test('static source distribution has half-width endpoint buckets and excludes the last frame', () => {
  const bank = bankOf(6);
  const counts = Array(6).fill(0);
  for (let index = 0; index < 800; index++) counts[selectNativeShape(bank, () => (index + 0.5) / 800).index]++;
  assert.deepEqual(counts, [100, 200, 200, 200, 100, 0]);
});

test('moving spray chooses a whole authored clip with the native rounded variant rule', () => {
  const bank = { clipIds: [24000, 24001, 24002] };
  assert.deepEqual([0, 0.24999, 0.25, 0.74999, 0.75, 0.99999].map(value => selectNativeSprayClip(bank, () => value)), [24000, 24000, 24001, 24001, 24002, 24002]);
});

test('static drawing keeps native size and registration without procedural transforms', () => {
  const calls = [];
  const image = { source: 'native image' };
  const context = { drawImage: (...args) => calls.push(args) };
  const frame = { registration: [7, 11], width: 12, height: 23 };
  assert.deepEqual(drawNativeShape(context, { x: 50, y: 80 }, frame, image), { x: 43, y: 69, width: 12, height: 23 });
  assert.deepEqual(calls, [[image, 43, 69, 12, 23]]);
});

test('moving paint uses authored hold times and retains the terminal image without looping', () => {
  const frames = [
    { atMs: 0, durationMs: 200 }, { atMs: 200, durationMs: 66 }, { atMs: 266, durationMs: 0 },
  ];
  const clip = { frames };
  assert.deepEqual([-10, 0, 199, 200, 265, 266, 5000].map(time => frames.indexOf(nativeSprayFrameAt(clip, time))), [0, 0, 0, 1, 1, 2, 2]);
});

test('atlas drawing selects only the source rectangle while retaining source dimensions and hotspot', () => {
  const calls = [];
  const context = { drawImage: (...args) => calls.push(args) };
  const atlas = { source: 'atlas' };
  const frame = { registration: [7, 11], width: 12, height: 23, sourceRect: [100, 200, 12, 23] };
  drawNativeShape(context, { x: 50, y: 80 }, frame, atlas);
  assert.deepEqual(calls, [[atlas, 100, 200, 12, 23, 43, 69, 12, 23]]);
});

test('moving paint subtracts the first raw source position and preserves image-group order', () => {
  const bank = { frames: [
    { image: 'one.png', width: 12, height: 23 }, { image: 'two.png', width: 8, height: 9 },
  ] };
  const clip = { sourceOrigin: [300, 100], firstDrawRawPosition: [10, 20] };
  const frame = { parts: [{ frame: 0, x: 7, y: 16 }, { frame: 1, x: -7, y: 8 }] };
  const calls = [];
  const context = { drawImage: (...args) => calls.push(args) };
  const images = new Map([['one.png', { id: 1 }], ['two.png', { id: 2 }]]);
  assert.equal(drawNativeSprayFrame(context, { x: 100, y: 200 }, clip, bank, frame, path => images.get(path)), 2);
  assert.deepEqual(calls, [[images.get('one.png'), 97, 196, 12, 23], [images.get('two.png'), 83, 188, 8, 9]]);
  assert.throws(() => drawNativeSprayFrame(context, { x: 0, y: 0 }, {}, bank, frame, path => images.get(path)), /relocation anchor/);
});
