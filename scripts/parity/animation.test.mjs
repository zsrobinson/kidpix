import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAnimation, frameAtTick } from '../../src/native-animation.js';

test('animation holds repeated source waits through end and stops at the following update', () => {
  const frames = [{ ticks: 1 }, { ticks: 3 }, { ticks: 1 }];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 100].map(tick => frameAtTick(frames, tick)), [0, 1, 1, 1, 2, 2, -1, -1]);
});

test('terminal zero-wait source composition is drawn before the end check', () => {
  assert.deepEqual([0, 1, 2, 3].map(tick => frameAtTick([{ ticks: 1 }, { ticks: 1 }, { ticks: 0 }], tick)), [0, 1, 2, -1]);
});

test('neutral script1094 with no yielding waits still has one rendered update', () => {
  assert.equal(frameAtTick([{ ticks: 0 }], 0), 0);
  assert.equal(frameAtTick([{ ticks: 0 }], 1), -1);
});

test('draw groups sharing an update resolve to the last composition in source order', () => {
  assert.deepEqual([0, 1, 2].map(tick => frameAtTick([{ ticks: 0 }, { ticks: 1 }, { ticks: 0 }], tick)), [1, 2, -1]);
});

test('empty timeline has no terminal composition', () => {
  assert.equal(frameAtTick([], 0), -1);
});

test('delivered updates preserve each pose and the terminal hold after a stall', async t => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  t.after(() => { globalThis.document = previousDocument; globalThis.Image = previousImage; });
  const image = { style: {}, dataset: {} };
  globalThis.document = { createElement: () => image };
  globalThis.Image = class { async decode() {} };
  const callbacks = [];
  const idle = {};
  const animation = createNativeAnimation({ append() {} }, idle, () => {}, {
    schedule(callback, delay) { assert.equal(delay, 100); callbacks.push(callback); }, cancel() {}, url: path => path,
  });
  await animation.play({ script: 1095, rect: [0, 0, 56, 63], sounds: [], frames: [
    { image: 'a.png', ticks: 1 }, { image: 'b.png', ticks: 1 }, { image: 'c.png', ticks: 0 },
  ] }, 100);
  assert.equal(image.dataset.frame, '0');
  callbacks.shift()(350);
  assert.equal(image.dataset.frame, '1');
  callbacks.shift()(1000);
  assert.equal(image.dataset.frame, '2');
  assert.equal(image.hidden, false);
  callbacks.shift()(1100);
  assert.equal(image.hidden, true);
  assert.equal(idle.hidden, false);
});
