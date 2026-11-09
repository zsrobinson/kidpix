import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createDrawingMotionController, loadDrawingMotionAssets, paintDrawingMotionFrame } from '../../src/native-drawing-motion.js';
import { toolRegionContains } from '../../src/native-tool-motion.js';

function group(count) {
  const scripts = {};
  const buttons = Array.from({ length: count }, (_, index) => {
    for (let id = index * 3 + 1; id < index * 3 + 4; id++) scripts[id] = {
      script: id, tickMs: 100, endCheckTick: 2, frames: [{ tick: 0, parts: [] }, { tick: 1, parts: [] }], sounds: [],
    };
    return { name: `row-${index}`, mode: 2, commandArgument: 0,
      stateScripts: [index * 3 + 1, index * 3 + 2, 0, index * 3 + 2], rolloverScript: index * 3 + 3 };
  });
  return { buttons, scripts };
}

for (const count of [2, 3, 4]) test(`${count}-row source groups preserve state dispatch and shared-script continuity`, () => {
  const actor = createDrawingMotionController(group(count), { now: () => 0 });
  assert.equal(actor.snapshot()[0].disabled, true);
  assert.equal(actor.press(count - 1, 0), true);
  actor.step(100);
  assert.equal(actor.release(true, 110), 0); // Native arguments may be identical for every row.
  assert.deepEqual(actor.snapshot().map(item => item.state), [0, ...Array(count - 2).fill(0), 3]);
  assert.equal(actor.snapshot().at(-1).frameIndex, 1);
  actor.step(200);
  assert.equal(actor.snapshot().at(-1).finished, true);
  actor.dispose();
});

test('unsupported source mode and unproven group sizes remain rejected', () => {
  assert.throws(() => createDrawingMotionController(group(1)), /mode2/);
  assert.throws(() => createDrawingMotionController(group(5)), /mode2/);
  const manifest = group(2); manifest.buttons[0].mode = 1;
  assert.throws(() => createDrawingMotionController(manifest), /mode2/);
});

test('ordinary callbacks paint every registered part; mode9 single-part branch is ordinary', () => {
  const calls = [];
  const context = { drawImage: (...args) => calls.push(args), save() {}, beginPath() {}, rect() {}, clip() {}, restore() {} };
  const first = {}, second = {};
  const assets = new Map([['1', { image: first }], ['2', { image: second }]]);
  const parts = [{ sprite: 1, x: -5, y: 20 }, { sprite: 2, x: 8, y: 30 }];
  paintDrawingMotionFrame(context, { renderMode: 'ordinary' }, { parts }, assets, [0, 0, 0]);
  paintDrawingMotionFrame(context, { renderMode: 'mode9' }, { parts: parts.slice(0, 1) }, assets, [255, 0, 255]);
  assert.deepEqual(calls, [[first, -5, 20], [second, 8, 30], [first, -5, 20]]);
  assert.throws(() => paintDrawingMotionFrame(context, { renderMode: 'unknown' }, { parts }, assets, [0, 0, 0]), /Unsupported/);
});

test('pointer release uses every exact source rectangle and excludes holes/right/bottom edges', () => {
  const region = { status: 'exact', type: 'rectangle-union', rectsLTRB: [[10, 20, 15, 30], [20, 20, 25, 30]] };
  assert.equal(toolRegionContains(region, 10, 20), true);
  assert.equal(toolRegionContains(region, 22, 25), true);
  for (const point of [[17, 25], [15, 25], [22, 30], [9, 25]]) assert.equal(toolRegionContains(region, ...point), false);
  assert.equal(toolRegionContains({ ...region, status: 'uncertain' }, 10, 20), false);
});

function bundleFixture() {
  const argb = Buffer.from([0, 4, 176, 255]);
  const png = Buffer.from([10, 20, 30]);
  const bytes = Buffer.concat([argb, png]);
  const compressed = gzipSync(bytes);
  const manifest = { bundle: { path: 'tool-motion/test.bin.gz', compression: 'gzip', byteLength: bytes.length,
    sha256: createHash('sha256').update(compressed).digest('hex') },
    sprites: { 1: { width: 1, height: 1, image: '1.png', argb: '1.argb', bundleOffsets: { argb: [0, 4], png: [4, 3] } } } };
  const paths = [];
  return { manifest, paths, options: {
    createImage: () => ({ naturalWidth: 1, naturalHeight: 1, decode: async () => {} }),
    fetch: async path => { paths.push(path); return new Response(path.endsWith('.gz') ? compressed : argb); },
  } };
}

test('opaque gzip bundle verifies compressed hash and decodes one transfer with exact raw ranges', async () => {
  const { manifest, options, paths } = bundleFixture();
  const assets = await loadDrawingMotionAssets(manifest, options);
  assert.deepEqual([...assets.get('1').argb], [0, 4, 176, 255]);
  assert.match(assets.get('1').image.src, /^blob:/);
  assert.deepEqual(paths, [manifest.bundle.path]);
});

test('bad bundle hashes/ranges/lengths reject, and a corrected invocation retries', async () => {
  const { manifest, options } = bundleFixture();
  const hash = manifest.bundle.sha256;
  manifest.bundle.sha256 = '00';
  await assert.rejects(loadDrawingMotionAssets(manifest, options), /hash/);
  manifest.bundle.sha256 = hash;
  manifest.bundle.byteLength++;
  await assert.rejects(loadDrawingMotionAssets(manifest, options), /length/);
  manifest.bundle.byteLength--;
  manifest.sprites[1].bundleOffsets.argb = [4, 999];
  await assert.rejects(loadDrawingMotionAssets(manifest, options), /range/);
  manifest.sprites[1].bundleOffsets.argb = [0, 4];
  assert.equal((await loadDrawingMotionAssets(manifest, options)).size, 1);
});

test('HTTP-decoded gzip and unavailable decompression retain separate-file fallback', async () => {
  const { manifest, options, paths } = bundleFixture();
  const fetch = options.fetch;
  options.fetch = async path => {
    if (!path.endsWith('.gz')) return fetch(path);
    paths.push(path); return new Response(new Uint8Array(7), { headers: { 'Content-Encoding': 'gzip' } });
  };
  assert.equal((await loadDrawingMotionAssets(manifest, options)).size, 1);
  assert.deepEqual(paths, [manifest.bundle.path, '1.argb']);
  const stream = globalThis.DecompressionStream;
  try {
    globalThis.DecompressionStream = undefined; paths.length = 0;
    assert.equal((await loadDrawingMotionAssets(manifest, options)).size, 1);
    assert.deepEqual(paths, ['1.argb']);
  } finally { globalThis.DecompressionStream = stream; }
});

test('aborted bundle load cannot start an actor and a fresh load succeeds', async () => {
  const { manifest, options } = bundleFixture();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(loadDrawingMotionAssets(manifest, { ...options, signal: abort.signal }), /abort/i);
  assert.equal((await loadDrawingMotionAssets(manifest, options)).size, 1);
});
