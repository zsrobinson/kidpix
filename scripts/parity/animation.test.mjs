import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAtTick } from '../../src/native-animation.js';

test('animation holds repeated source waits and stops at the end of the script', () => {
  const frames = [{ ticks: 1 }, { ticks: 3 }, { ticks: 1 }];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 100].map(tick => frameAtTick(frames, tick)), [0, 1, 1, 1, 2, -1, -1]);
});
