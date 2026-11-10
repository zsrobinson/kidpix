import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { createDrawingMotionController, loadDrawingMotionAssets, paintDrawingMotionFrame } from '../../src/native-drawing-motion.js';
import { motionCanvasBounds, toolRegionContains } from '../../src/native-tool-motion.js';

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

const toolIndexPath = new URL('../../public/original/ui/tool-motion/manifest.json', import.meta.url);
test('exported Grab source streams retain all six timelines, cue gates, kind1 clipping and row identity',
  { skip: !existsSync(toolIndexPath) }, () => {
    const manifest = JSON.parse(readFileSync(toolIndexPath)).trays.grab;
    assert.ok(manifest, 'Run native-tool-motion.py with the mounted source');
    assert.deepEqual(manifest.buttons.map(button => [button.name, button.command, button.commandArgument, button.mode]),
      [['scissors', 22300, 0, 2], ['grab', 22301, 0, 2]]);
    assert.deepEqual(manifest.buttons[1].region.boundsXYWH, [149, 643, 109, 112]);
    for (const [index, rest, counts] of [[0, 18131, [9, 9, 6]], [1, 18128, [8, 8, 9]]]) {
      for (let phase = 0; phase < 3; phase++) {
        let time = 0;
        const cues = [];
        const actor = createDrawingMotionController(manifest, { selected: 1 - index,
          now: () => time, playSound(cue) {
            const handle = { complete: false, stop() { this.complete = true; }, isComplete() { return this.complete; } };
            cues.push({ cue, handle, time }); return handle;
          } });
        if (phase === 1) actor.press(index);
        if (phase === 2) actor.enter(index);
        const script = rest + phase, clip = manifest.scripts[script];
        assert.equal(clip.frames.length, counts[phase]);
        assert.ok(clip.frames.every(frame => frame.parts.length === 1));
        for (let tick = 0; tick < clip.endCheckTick; tick++) {
          if (tick) actor.step(time = tick * 100);
          const current = actor.snapshot()[index];
          assert.equal(current.script, script);
          assert.equal(current.frameIndex, tick);
          assert.deepEqual(current.clipRect, phase === 2 ? manifest.buttons[index].auxiliaryClipRect : null);
          assert.deepEqual(cues.filter(value => value.cue.sound === clip.sounds[0].sound).map(value => value.time),
            clip.sounds.filter(cue => cue.tick <= tick).map(cue => cue.tick * 100));
        }
        actor.step(time += 100);
        assert.equal(actor.snapshot()[index].finished, false, 'Owned sound gates final end check');
        if (phase === 1) {
          const before = actor.snapshot()[index];
          assert.equal(actor.release(true), 0);
          assert.equal(actor.snapshot()[index].frameIndex, before.frameIndex);
          assert.equal(actor.press(index), false, 'Selected control is disabled');
        }
        cues.forEach(({ handle }) => handle.complete = true);
        actor.step(time += 100);
        if (phase !== 2) assert.equal(actor.snapshot()[index].finished, true);
        else assert.equal(actor.snapshot()[index].auxiliary, false);
        actor.dispose();
        assert.ok(cues.every(({ handle }) => handle.complete));
      }
    }
  });


test('bounded motion canvas includes every script/state and opaque restoration, clamped with fringe', () => {
  const manifest = { sprites: { a: { width: 9, height: 8 } }, scripts: {
    rest: { frames: [{ parts: [{ x: 200, y: 650, sprite: 'a' }] }] },
    hover: { frames: [{ parts: [{ x: -1, y: 760, sprite: 'a' }] }] },
    disabled: { frames: [{ parts: [{ x: 1018, y: 640, sprite: 'a' }] }] },
  }, restorationRects: [[100, 620, 30, 20]] };
  assert.deepEqual(motionCanvasBounds(manifest), [0, 618, 1024, 150]);
  delete manifest.restorationRects;
  assert.deepEqual(motionCanvasBounds(manifest), [0, 638, 1024, 130]);
  assert.deepEqual(motionCanvasBounds({ scripts: {}, sprites: {} }), [0, 0, 1024, 768]);
});
