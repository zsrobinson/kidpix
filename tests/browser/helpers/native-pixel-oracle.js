import { expect } from '@playwright/test';
import { PNG } from 'pngjs';

export async function loadNativeBank(page, mode, id = '24000') {
  const response = await page.request.get(`/original/tools/${mode}-native.json`);
  expect(response.ok(), `Native ${mode} index is served`).toBe(true);
  const index = await response.json();
  const entry = index.banks[id];
  expect(entry, `Native bank ${id} is present`).toBeTruthy();
  const shardResponse = await page.request.get(`/original/${entry.manifest}`);
  expect(shardResponse.ok(), 'Selected native bank metadata is served').toBe(true);
  const shard = await shardResponse.json();
  const bank = shard.banks[id];
  expect(bank.frames).toHaveLength(bank.frameCount);
  const images = new Map();
  for (const path of new Set(bank.frames.map(frame => frame.image))) {
    const image = await page.request.get(`/original/${path}`);
    expect(image.ok(), `Native atlas ${path} is served`).toBe(true);
    images.set(path, PNG.sync.read(await image.body()));
  }
  return { bank, clips: shard.clips, images };
}

export function frameFromSourceTime(clip, age) {
  const applicable = clip.frames.filter(frame => frame.atMs <= age);
  return applicable.at(-1) ?? clip.frames[0];
}

export function movingLayers(bundle, clip, point, frame) {
  // Exported part coordinates already subtract REGS. The verified relocation
  // anchor is the first raw image point, not the header origin or bounds center.
  return frame.parts.map(part => ({
    frame: bundle.bank.frames[part.frame],
    x: point[0] - clip.firstDrawRawPosition[0] + part.x,
    y: point[1] - clip.firstDrawRawPosition[1] + part.y,
  }));
}

export function expectNativePixels(encoded, layers, images) {
  const actual = PNG.sync.read(typeof encoded === 'string' ? Buffer.from(encoded.split(',')[1], 'base64') : encoded);
  expect([actual.width, actual.height]).toEqual([720, 542]);
  const expected = Buffer.alloc(actual.width * actual.height * 4, 255);
  const coverage = new Uint8Array(actual.width * actual.height);
  for (const { frame, x: x0, y: y0 } of layers) {
    expect(Number.isInteger(x0) && Number.isInteger(y0), 'Native relocation is in integer source pixels').toBe(true);
    const image = images.get(frame.image);
    const [left, top, width, height] = frame.sourceRect ?? [0, 0, frame.width, frame.height];
    expect([width, height], 'Source images retain their authored size').toEqual([frame.width, frame.height]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x0 + x;
        const dy = y0 + y;
        if (dx < 0 || dy < 0 || dx >= actual.width || dy >= actual.height) continue;
        const from = ((top + y) * image.width + left + x) * 4;
        const alpha = image.data[from + 3];
        if (!alpha) continue;
        const to = (dy * actual.width + dx) * 4;
        for (let channel = 0; channel < 3; channel++) {
          expected[to + channel] = Math.round((image.data[from + channel] * alpha + expected[to + channel] * (255 - alpha)) / 255);
        }
        coverage[to / 4] = alpha === 255 ? 2 : 1;
      }
    }
  }
  const mismatches = { opaque: [], edge: [], background: [] };
  let opaque = 0;
  for (let offset = 0; offset < expected.length; offset += 4) {
    const kind = coverage[offset / 4];
    if (kind === 2) opaque++;
    const difference = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(actual.data[offset + channel] - expected[offset + channel])));
    // Only straight-alpha versus Canvas premultiplication rounding at source
    // edges receives tolerance. Opaque artwork and blank page pixels are exact.
    if (difference > (kind === 1 ? 2 : 0)) {
      const group = kind === 2 ? mismatches.opaque : kind === 1 ? mismatches.edge : mismatches.background;
      if (group.length < 8) group.push({ x: offset / 4 % actual.width, y: Math.floor(offset / 4 / actual.width),
        actual: [...actual.data.subarray(offset, offset + 4)], expected: [...expected.subarray(offset, offset + 4)] });
    }
  }
  expect(opaque, 'Comparison includes opaque source artwork').toBeGreaterThan(200);
  expect(mismatches, 'Picture matches the independently relocated authored image groups').toEqual({ opaque: [], edge: [], background: [] });
}
