import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawOriginalDab, nativeBrushMaskPixels, originalDab } from '../../src/paint-original.js';

const mask = values => new Uint8ClampedArray(values.flatMap(value => [value, value, value, 255]));
const pixels = data => Array.from({ length: data.length / 4 }, (_, index) => [...data.slice(index * 4, index * 4 + 4)]);
const generic = overrides => ({ density: 1, spatter: 0, blendClass: 'generic', ...overrides });

test('native grayscale mask fixtures produce the source density coverage, including 255→254 normalization', () => {
  const result = nativeBrushMaskPixels(mask([0, 127, 254, 255]), [20, 100, 240, 255], generic({ density: 2 }));
  assert.deepEqual(pixels(result), [[0, 0, 0, 0], [20, 100, 240, 64], [20, 100, 240, 128], [20, 100, 240, 128]]);
  assert.deepEqual(pixels(nativeBrushMaskPixels(mask([254, 255]), [12, 34, 56, 255], generic({ density: 0 }))),
    [[12, 34, 56, 255], [12, 34, 56, 255]]);
  assert.deepEqual(pixels(nativeBrushMaskPixels(mask([254]), [12, 34, 56, 255], generic({ density: 5 }))), [[12, 34, 56, 51]]);
});

test('source shadow/glint biases control coverage independently of normal density', () => {
  const brush = generic({ density: 9, shadowBias: 4, glintBias: 2 });
  assert.deepEqual(pixels(nativeBrushMaskPixels(mask([127, 255]), [0, 0, 0, 255], brush, 'shadow')),
    [[0, 0, 0, 32], [0, 0, 0, 64]]);
  assert.deepEqual(pixels(nativeBrushMaskPixels(mask([127, 255]), [255, 255, 255, 255], brush, 'glint')),
    [[255, 255, 255, 64], [255, 255, 255, 128]]);
});

test('Airbrush density override varies each fixture pixel instead of applying generic bias opacity', () => {
  const values = [0, .125, .375, .625, .875, 1];
  const result = nativeBrushMaskPixels(mask([255, 255, 255, 255, 255, 255]), [180, 30, 60, 255],
    { density: 4, spatter: 0, blendClass: 'airbrush' }, 'paint', () => values.shift());
  assert.deepEqual(pixels(result), [254, 127, 85, 64, 51, 51].map(alpha => [180, 30, 60, alpha]));
  assert.equal(values.length, 0);
});

test('source spatter predicate removes pixels rather than reducing rejected pixels to faint ink', () => {
  const values = [.1, .6, .3, .9];
  const result = nativeBrushMaskPixels(mask([255, 255, 127, 255]), [40, 80, 120, 255],
    generic({ spatter: 1 }), 'paint', () => values.shift());
  assert.deepEqual(pixels(result), [[40, 80, 120, 255], [0, 0, 0, 0], [40, 80, 120, 128], [0, 0, 0, 0]]);
});

test('flower and low-density source CFG entries retain separate geometric offsets and blend biases', () => {
  const flower = originalDab({ tool: 'brush', variant: 'Flower Spray', sizeIndex: 0 });
  assert.deepEqual([flower.id, flower.shadow, flower.shadowBias, flower.glint, flower.glintBias], [1052, 7, 12, 3, 1]);
  const rows = originalDab({ tool: 'brush', variant: 'Row of Dots 2', sizeIndex: 2 });
  assert.deepEqual([rows.id, rows.density, rows.shadowBias, rows.glintBias], [1057, 5, 20, 3]);
  assert.equal(originalDab({ tool: 'brush', variant: 'Air Brush', sizeIndex: 0 }).blendClass, 'airbrush');
  assert.equal(originalDab({ tool: 'marker', sizeIndex: 0 }).blendClass, 'marker');
});

// A minimal raster-surface fixture lets the real draw entry point be checked
// without a browser. It copies actual grayscale source pixels; it does not
// implement the renderer's density, bias, spatter or pass-selection formulas.
function surfaceDocument() {
  return { createElement() {
    const canvas = { width: 1, height: 1 };
    let data;
    const context = {
      canvas,
      drawImage(image) { data = new Uint8ClampedArray(image.pixels); },
      getImageData() { return { data: new Uint8ClampedArray(data), width: canvas.width, height: canvas.height }; },
      putImageData(image) { canvas.pixels = new Uint8ClampedArray(image.data); },
      clearRect() { data = new Uint8ClampedArray(canvas.width * canvas.height * 4); },
      fillRect() {
        const rgb = this.fillStyle.slice(1).match(/../g).map(value => parseInt(value, 16));
        data = new Uint8ClampedArray([...rgb, 255]);
      },
    };
    canvas.getContext = () => context;
    return canvas;
  } };
}

test('real dab entry renders black shadow, white glint, then paint at full source diagonal offsets', () => {
  const previousDocument = globalThis.document;
  globalThis.document = surfaceDocument();
  try {
    const calls = [];
    const context = { save() {}, restore() {}, drawImage(image, ...rect) {
      calls.push({ rect, alpha: this.globalAlpha, pixel: [...image.pixels.slice(0, 4)] });
    } };
    const image = { width: 2, height: 2, pixels: mask([255, 127, 254, 0]) };
    const options = { tool: 'brush', variant: 'Flower Spray', sizeIndex: 0, color: '#123456', size: 4, scale: 1 };
    drawOriginalDab(context, { x: 50, y: 50 }, options, originalDab(options), image, () => .5, 0);
    assert.deepEqual(calls, [
      { rect: [56, 56, 2, 2], alpha: 1, pixel: [0, 0, 0, 21] },
      { rect: [46, 46, 2, 2], alpha: 1, pixel: [255, 255, 255, 255] },
      { rect: [49, 49, 2, 2], alpha: 1, pixel: [18, 52, 86, 255] },
    ]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('real Airbrush entry resamples pixel density on successive dabs instead of caching a random mask', () => {
  const previousDocument = globalThis.document;
  globalThis.document = surfaceDocument();
  try {
    const rendered = [];
    const context = { save() {}, restore() {}, drawImage(image) { rendered.push([...image.pixels]); } };
    const image = { width: 1, height: 1, pixels: mask([255]) };
    const options = { tool: 'brush', variant: 'Air Brush', sizeIndex: 0, color: '#336699', size: 4, scale: 1 };
    // Two position-jitter samples, accepted spatter pixel, then pixel density.
    const values = [.5, .5, 0, 0, .5, .5, 0, 1];
    const dab = originalDab(options);
    drawOriginalDab(context, { x: 10, y: 10 }, options, dab, image, () => values.shift(), 0);
    drawOriginalDab(context, { x: 10, y: 10 }, options, dab, image, () => values.shift(), 1);
    assert.deepEqual(rendered, [[51, 102, 153, 254], [51, 102, 153, 51]]);
    assert.equal(values.length, 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
