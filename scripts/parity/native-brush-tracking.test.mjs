import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeBrushTracking, nativeBrushLine, resolveNativeBrushLineSpacing } from '../../src/native-brush-tracking.js';

const centers = (emissions) => emissions.map(({ x, y }) => [x, y]);
const p = (x, y) => ({ x, y });

test('integer half-slope paths have directed ties in all eight octants', () => {
  // Fixed pixel paths, including both signs and both major axes. These expose
  // error>=0 ties; reversing the first line does not reverse its pixel list.
  const fixtures = [
    [[6, 3], [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]]],
    [[6, -3], [[1, -1], [2, -1], [3, -2], [4, -2], [5, -3], [6, -3]]],
    [[-6, 3], [[-1, 1], [-2, 1], [-3, 2], [-4, 2], [-5, 3], [-6, 3]]],
    [[-6, -3], [[-1, -1], [-2, -1], [-3, -2], [-4, -2], [-5, -3], [-6, -3]]],
    [[3, 6], [[1, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6]]],
    [[-3, 6], [[-1, 1], [-1, 2], [-2, 3], [-2, 4], [-3, 5], [-3, 6]]],
    [[3, -6], [[1, -1], [1, -2], [2, -3], [2, -4], [3, -5], [3, -6]]],
    [[-3, -6], [[-1, -1], [-1, -2], [-2, -3], [-2, -4], [-3, -5], [-3, -6]]],
  ];
  for (const [[x, y], expected] of fixtures) {
    assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(x, y), 1)), expected);
  }
  assert.deepEqual(centers(nativeBrushLine(p(6, 3), p(0, 0), 1)),
    [[5, 2], [4, 2], [3, 1], [2, 1], [1, 0], [0, 0]]);
});

test('dominant-axis spacing emits exact endpoints and relative residuals once', () => {
  assert.deepEqual(nativeBrushLine(p(10, 20), p(16, 22), 4), [
    { x: 14, y: 21, dx: 4, dy: 1 },
    { x: 16, y: 22, dx: 2, dy: 1 },
  ]);
  assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(8, 8), 3)), [[3, 3], [6, 6], [8, 8]]);
  assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(0, -6), 3)), [[0, -3], [0, -6]]);
  assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(-6, 0), 3)), [[-3, 0], [-6, 0]]);
  assert.deepEqual(nativeBrushLine(p(2, 3), p(2, 3), 0), []);
});

test('accepted pointer segments flush remainder instead of carrying arc length', () => {
  const tracker = createNativeBrushTracking({ spacing: 3 });
  assert.deepEqual(centers(tracker.begin(p(0, 0))), [[0, 0]]);
  assert.deepEqual(centers(tracker.track(p(5, 0))), [[3, 0], [5, 0]]);
  assert.deepEqual(centers(tracker.track(p(10, 0))), [[8, 0], [10, 0]]);
  assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(10, 0), 3)), [[3, 0], [6, 0], [9, 0], [10, 0]]);
});

test('threshold accumulates from last accepted point, including corners', () => {
  const tracker = createNativeBrushTracking({ spacing: 3 });
  tracker.begin(p(0, 0));
  assert.deepEqual(tracker.track(p(2, 2)), []);
  assert.deepEqual(tracker.lastPoint, p(0, 0));
  // Euclidean length already exceeds 3 at (2,2); native axes still reject it.
  assert.deepEqual(centers(tracker.track(p(2, 3))), [[2, 3]]);
  assert.deepEqual(tracker.track(p(4, 4)), []);
  assert.deepEqual(centers(tracker.track(p(5, 4))), [[5, 4]]);
  assert.deepEqual(tracker.track(p(5, 4)), []);
});

test('release discards a sub-spacing tail; a new stroke starts with one dab', () => {
  const tracker = createNativeBrushTracking({ spacing: 5 });
  assert.equal(tracker.active, false);
  assert.deepEqual(tracker.track(p(8, 8)), []);
  tracker.begin(p(10, 10));
  assert.deepEqual(tracker.track(p(14, 13)), []);
  assert.deepEqual(tracker.end(), []);
  assert.equal(tracker.lastPoint, null);
  assert.deepEqual(tracker.track(p(15, 15)), []);
  assert.deepEqual(tracker.begin(p(14, 13)), [{ x: 14, y: 13, dx: 0, dy: 0 }]);
  const copy = tracker.lastPoint;
  copy.x = 99;
  assert.deepEqual(tracker.lastPoint, p(14, 13));
});

test('zero CFG spacing paints stationary polls and accepts short moving segments', () => {
  const tracker = createNativeBrushTracking({ spacing: 0 });
  tracker.begin(p(10, 10));
  assert.deepEqual(tracker.track(p(10, 10)), [{ x: 10, y: 10, dx: 0, dy: 0 }]);
  assert.deepEqual(tracker.track(p(10, 10)), [{ x: 10, y: 10, dx: 0, dy: 0 }]);
  assert.deepEqual(centers(tracker.track(p(11, 10))), [[11, 10]]);
  assert.deepEqual(centers(tracker.track(p(18, 10))), [[14, 10], [17, 10], [18, 10]]);
  // Effective zero, if explicitly supplied, makes the helper emit every pixel.
  assert.deepEqual(centers(nativeBrushLine(p(0, 0), p(3, 1), 0)), [[1, 0], [2, 1], [3, 1]]);
});

test('effective spacing retains tool state for CFG zero and applies Marker setup', () => {
  assert.equal(resolveNativeBrushLineSpacing({ spacing: 0 }), 3);
  assert.equal(resolveNativeBrushLineSpacing({ spacing: 0, previousLineSpacing: 7 }), 7);
  assert.equal(resolveNativeBrushLineSpacing({ spacing: 5, previousLineSpacing: 7 }), 5);
  assert.equal(resolveNativeBrushLineSpacing({ spacing: 5, marker: true }), 7);
  assert.equal(resolveNativeBrushLineSpacing({ spacing: 0, marker: true }), 4);
  const tracker = createNativeBrushTracking({ spacing: 5, lineSpacing: 7 });
  tracker.begin(p(0, 0));
  assert.deepEqual(tracker.track(p(6, 0)), []);
  assert.deepEqual(centers(tracker.track(p(14, 0))), [[7, 0], [14, 0]]);
});

test('integer/domain validation prevents silent browser rounding or native overflow guesses', () => {
  assert.throws(() => nativeBrushLine(p(0.5, 0), p(2, 0), 1), RangeError);
  assert.throws(() => nativeBrushLine(p(-32768, 0), p(32767, 0), 1), RangeError);
  assert.throws(() => createNativeBrushTracking({ spacing: -1 }), RangeError);
  assert.throws(() => createNativeBrushTracking({ spacing: 1, lineSpacing: 1.5 }), RangeError);
});
