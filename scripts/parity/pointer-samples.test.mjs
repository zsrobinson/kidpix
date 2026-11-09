import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointerSamples, createPressureInput, pressureFactor, interpolatePressure, nativePressurePoint } from '../../src/pointer-samples.js';

test('coalescing consumes the chronological list once and never appends parent', () => {
  const entries = [{ pointerId: 0, timeStamp: 1 }, { pointerId: 0, timeStamp: 2 }];
  const parent = { pointerId: 42, getCoalescedEvents: () => entries };
  assert.deepEqual(pointerSamples(parent), entries);
  for (const getCoalescedEvents of [undefined, () => [], () => { throw Error('unsupported'); }]) {
    const event = { getCoalescedEvents };
    assert.deepEqual(pointerSamples(event), [event]);
  }
});
test('only finite pen contact pressure changes the factor; up zero retains last positive', () => {
  const pen = { pointerType: 'pen', pressure: .1 };
  const input = createPressureInput(pen);
  assert.equal(pressureFactor(input.sample(pen)), .25);
  assert.equal(pressureFactor(input.sample({ ...pen, pressure: .9 })), 1.5);
  assert.equal(input.sample({ ...pen, type: 'pointerup', pressure: 0 }), .9);
  for (const pressure of [undefined, null, NaN, Infinity, -1, 2, 0, .5]) {
    assert.equal(pressureFactor(input.sample({ ...pen, pressure })), 1);
  }
  for (const pointerType of ['mouse', 'touch', undefined]) {
    for (const pressure of [.1, .9, 0, undefined]) {
      const event = { pointerType, pressure };
      assert.equal(pressureFactor(createPressureInput(event).sample(event)), 1);
    }
  }
  assert.equal(createPressureInput(pen).sample({ pressure: .8 }, pen), .8);
});
test('interpolation restores metadata to integer native emissions, including stationary polls', () => {
  const start = { x: 10, y: 20, pressure: .1 };
  const end = { x: 30, y: 20, pressure: .9 };
  assert.equal(interpolatePressure(start, end, .5), .5);
  assert.deepEqual(nativePressurePoint({ x: 20, y: 20, dx: 10, dy: 0 }, start, end),
    { x: 20, y: 20, dx: 10, dy: 0, pressure: .5 });
  assert.equal(nativePressurePoint(start, start, { ...start, pressure: .9 }).pressure, .9);
});
