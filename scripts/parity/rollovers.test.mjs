import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolloverFrameAtTick, rolloverEndTick, rolloverEndReady } from '../../src/native-rollovers.js';

const clip = { tickMs: 100, endCheckTick: 6, frames: [
  { image: 'first.png', ticks: 1 },
  { image: 'hold.png', ticks: 3 },
  { image: 'last-held.png', ticks: 1 },
  { image: 'terminal.png', ticks: 0 },
] };

test('source holds and the zero-wait terminal image remain visible until completion', () => {
  assert.deepEqual([-1, 0, 1, 2, 3, 4, 5, 6, 20].map(tick => rolloverFrameAtTick(clip, tick)),
    [0, 0, 1, 1, 1, 2, 3, 3, 3]);
});

test('native completion/restart waits one update after the terminal image', () => {
  assert.equal(rolloverEndTick(clip), 6);
  assert.equal(rolloverEndReady(clip, 5), false);
  assert.equal(rolloverEndReady(clip, 6), true);
  assert.equal(rolloverEndTick({ ...clip, endCheckTick: undefined }), 6);
  assert.equal(rolloverEndTick({ ...clip, endCheckTick: 2 }), 6);
});

test('source audio channels one and two defer end processing without losing the terminal frame', () => {
  assert.equal(rolloverEndReady(clip, 20, [1]), false);
  assert.equal(rolloverEndReady(clip, 20, [2]), false);
  assert.equal(rolloverEndReady(clip, 20, [0]), true);
  assert.equal(rolloverFrameAtTick(clip, 20), 3);
});

test('a single terminal image lasts a complete native interval', () => {
  const still = { frames: [{ image: 'still.png', ticks: 0 }] };
  assert.equal(rolloverFrameAtTick(still, 0), 0);
  assert.equal(rolloverEndTick(still), 1);
  assert.equal(rolloverEndReady(still, 0), false);
  assert.equal(rolloverEndReady(still, 1), true);
});

test('multiple image commands without a wait render the last group at that tick', () => {
  const immediate = { frames: [{ ticks: 0 }, { ticks: 2 }, { ticks: 0 }, { ticks: 0 }] };
  assert.equal(rolloverFrameAtTick(immediate, 0), 1);
  assert.equal(rolloverFrameAtTick(immediate, 2), 3);
});
