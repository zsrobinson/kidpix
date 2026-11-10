import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pencilPredictions } from '../src/pencil-prediction.js'
const point = { pointerId: 7, pointerType: 'pen', timeStamp: 120, clientX: 30, clientY: 10, pressure: .8 }
const event = { ...point, timeStamp: 100, type: 'pointermove', getPredictedEvents: () => [point] }
const settings = { now: 105, after: 100, pointFor: e => ({ x: e.clientX, y: e.clientY }), start: { x: 10, y: 10 }, spacing: 1 }
const read = (e = event, s = settings) => pencilPredictions(e, s)
test('UA points retain pressure, horizon and coordinates without changing input', () => {
  assert.deepEqual(read(), { expires: 120, points: [{ x: 30, y: 10, pressure: .8 }] })
  assert.equal(point.pressure, .8)
})
test('reject absent/empty/throwing API and unsafe clocks', () => {
  for (const getPredictedEvents of [undefined, () => [], () => { throw Error() }]) assert.equal(read({ ...event, getPredictedEvents }), null)
  for (const timeStamp of [NaN, Infinity, 106, -100]) assert.equal(read({ ...event, timeStamp }), null)
  for (const now of [NaN, 120, 121, 400]) assert.equal(read(event, { ...settings, now }), null)
})
test('reject identity, stale/duplicate time, malformed geometry/pressure and excess work', () => {
  for (const changes of [{ pointerId: 8 }, { pointerType: 'mouse' }, { timeStamp: 100 }, { timeStamp: 201 },
    { clientX: Infinity }, { clientY: NaN }, { pressure: -.1 }, { pressure: 2 }, { clientX: 100000 }]) {
    assert.equal(read({ ...event, getPredictedEvents: () => [{ ...point, ...changes }] }), null)
  }
  assert.equal(read({ ...event, getPredictedEvents: () => Array(17).fill(point) }), null)
  assert.equal(read({ ...event, getPredictedEvents: () => [point, point] }), null)
  assert.equal(read(event, { ...settings, after: 101 }), null)
})
