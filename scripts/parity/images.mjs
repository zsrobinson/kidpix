import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const pixelThreshold = 0.1;
export const frame = { width: 1024, height: 768 };
export const drawing = { x: 164, y: 67, width: 720, height: 542 };

export function cropImage(image, rect) {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > image.width || y + height > image.height) {
    throw new Error('Crop must be an integer rectangle inside the source image.');
  }
  const result = new PNG({ width, height });
  PNG.bitblt(image, result, x, y, width, height, 0, 0);
  return result;
}

export function compareImages(actual, expected, splitDrawing = false) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`Image dimensions differ: web ${actual.width}×${actual.height}, reference ${expected.width}×${expected.height}. Crop the application frame; do not resize it.`);
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const options = { threshold: pixelThreshold, includeAA: false, diffMask: true };
  const changed = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, options);
  const metric = (name, count, total) => ({ name, changed: count, total, percent: 100 * count / total });
  const metrics = [metric('Application frame', changed, actual.width * actual.height)];
  if (splitDrawing) {
    // Count the same full-frame diff mask in each region. This keeps the region
    // totals additive, including anti-alias classification at the page edge.
    cropImage(actual, drawing); // Validate that the region fits.
    let onPage = 0;
    for (let y = drawing.y; y < drawing.y + drawing.height; y++) {
      for (let x = drawing.x; x < drawing.x + drawing.width; x++) {
        if (diff.data[(y * actual.width + x) * 4 + 3]) onPage++;
      }
    }
    const pagePixels = drawing.width * drawing.height;
    metrics.push(metric('Drawing area', onPage, pagePixels));
    metrics.push(metric('Controls and frame', changed - onPage, actual.width * actual.height - pagePixels));
  }
  return { diff, metrics };
}
