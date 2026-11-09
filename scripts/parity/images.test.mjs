import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { compareImages, cropImage, drawing } from './images.mjs';

function white(width, height) {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return image;
}

test('pixel metrics separate drawing and controls without a blank page hiding changes', () => {
  const expected = white(1024, 768);
  const actual = white(1024, 768);
  for (const [x, y] of [[10, 10], [drawing.x + 10, drawing.y + 10]]) {
    const offset = (y * actual.width + x) * 4;
    actual.data.fill(0, offset, offset + 3);
  }
  const { metrics, diff } = compareImages(actual, expected, true);
  assert.deepEqual(metrics.map(m => m.changed), [2, 1, 1]);
  assert.equal(metrics[1].total + metrics[2].total, metrics[0].total);
  assert.equal(diff.data[(10 * 1024 + 10) * 4 + 3], 255);
  assert.equal(compareImages(expected, expected).metrics[0].changed, 0);
});

test('mismatched sizes cannot silently turn into parity scores', () => {
  assert.throws(() => compareImages(white(4, 4), white(8, 8)), /dimensions differ/);
});

test('native capture crops preserve pixels and reject scaling or out-of-bounds rectangles', () => {
  const source = white(8, 8);
  source.data[(3 * 8 + 2) * 4] = 17;
  const cropped = cropImage(source, { x: 2, y: 3, width: 4, height: 4 });
  assert.equal(cropped.data[0], 17);
  assert.deepEqual([cropped.width, cropped.height], [4, 4]);
  for (const rect of [
    { x: -1, y: 0, width: 4, height: 4 },
    { x: 0, y: 0, width: 9, height: 4 },
    { x: 0.5, y: 0, width: 4, height: 4 },
  ]) assert.throws(() => cropImage(source, rect), /Crop must/);
});
