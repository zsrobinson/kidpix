import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { paintDrawingMotionFrame } from '../../src/native-drawing-motion.js';

// Read-only source pins: tSCR + REGS + tBMH from supplied Windows Tp.MHK.
// All six programs/registered frames also match the independent Mac source audit.
const pins = JSON.parse(readFileSync(new URL('../../tests/fixtures/tool-hover-source.json', import.meta.url)));
const root = new URL('../../public/original/ui/', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (r, x, y) => !r || x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];

// Native-coordinate software Canvas seam: actual application renderer, no DOM,
// browser, GPU or server. Opaque destination makes source-over rounding exact.
class Pixels {
  constructor() {
    this.canvas = { width: 1024, height: 768 };
    this.data = new Uint8ClampedArray(1024 * 768 * 4).fill(255);
  }
  save() { this.saved = this.region; }
  beginPath() {}
  rect(...r) { this.path = r; }
  clip() { this.region = this.path; }
  restore() { this.region = this.saved; }
  drawImage(image, left, top) {
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (!inside(this.region, left + x, top + y)) continue;
      const s = (y * image.width + x) * 4, d = ((top + y) * 1024 + left + x) * 4;
      const a = image.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) this.data[d + c] = Math.round(image.data[s + c] * a + this.data[d + c] * (1 - a));
    }
  }
  getImageData(x, y, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) data.set(this.data.subarray(((y + row) * 1024 + x) * 4, ((y + row) * 1024 + x + w) * 4), row * w * 4);
    return { data, width: w, height: h };
  }
  putImageData(image, x, y) {
    for (let row = 0; row < image.height; row++) this.data.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * 1024 + x) * 4);
  }
}

const path = new URL('tool-motion/manifest.json', root);
for (const [id, source] of Object.entries(pins.scripts)) test(`source full-pose geometry ${id}, including off-left mode9 coverage`, { skip: !existsSync(path) }, () => {
  const manifest = JSON.parse(readFileSync(path)).trays.draw;
  assert.equal(manifest.scripts[id].sourceSha256, source.sha256);
  const assets = new Map();
  for (const frame of source.frames) for (const part of frame.parts) {
    const info = manifest.sprites[part.sprite], pin = pins.sprites[part.sprite];
    const image = PNG.sync.read(readFileSync(new URL(info.image, root)));
    const argb = readFileSync(new URL(info.argb, root));
    assert.equal(digest(argb), pin.rawSha256);
    assert.equal(digest(image.data), pin.rgbaSha256);
    assert.deepEqual([image.width, image.height], [pin.width, pin.height]);
    assets.set(String(part.sprite), { image, argb });
  }
  const hover = ['18068', '18071'].includes(id);
  const clip = Number(id) < 18069 ? [274, 648, 53, 109] : [331, 648, 53, 109];
  let outsideChanges = 0;
  for (const [i, frame] of source.frames.entries()) {
    assert.deepEqual(manifest.scripts[id].frames[i].parts.map(({ sprite, x, y }) => ({ sprite, x, y })), frame.parts);
    for (const color of [[0, 0, 0], [0, 128, 255], [245, 64, 129]]) {
      const actual = new Pixels(), expected = new Pixels();
      // Independent callback: ordinary subcall clips part0 and restores target
      // clip before the min-dimension temporary mode9 copy (f73f6/f758f).
      const [base, tint] = frame.parts;
      expected.region = hover ? clip : null;
      expected.drawImage(assets.get(String(base.sprite)).image, base.x, base.y);
      expected.region = null;
      const b = pins.sprites[base.sprite], t = pins.sprites[tint.sprite];
      const raw = assets.get(String(tint.sprite)).argb, f = Math.fround, reciprocal = f(1 / 255);
      const x0 = Math.max(base.x, tint.x), y0 = Math.max(base.y, tint.y);
      const x1 = Math.min(tint.x + t.width, base.x + Math.min(b.width, t.width));
      const y1 = Math.min(tint.y + t.height, base.y + Math.min(b.height, t.height));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const s = ((y - tint.y) * t.width + x - tint.x) * 4, d = (y * 1024 + x) * 4;
        for (let c = 0; c < 3; c++) {
          const old = expected.data[d + c];
          const target = f(f(f(color[c] * reciprocal) * raw[s + 2]) + raw[s + 1]);
          expected.data[d + c] = Math.min(255, Math.trunc(f(f(f(target - old) * f(raw[s + 3] * reciprocal)) + old)));
          if (hover && x < clip[0] && expected.data[d + c] !== old) outsideChanges++;
        }
      }
      paintDrawingMotionFrame(actual, manifest, manifest.scripts[id].frames[i], assets, color, { clipRect: hover ? clip : null });
      assert.equal(digest(actual.data), digest(expected.data), `${id} pose ${i} color ${color}: complete destination including off-left/vacated pixels`);
    }
  }
  if (hover) assert.ok(outsideChanges > 0, 'Source mask really paints left of hit/ordinary clip');
});
