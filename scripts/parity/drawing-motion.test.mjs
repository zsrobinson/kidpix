import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  blendDrawingMode9, createDrawingMotionController, drawingFrameAtTick,
  loadDrawingMotionAssets, paintDrawingMotionFrame,
} from '../../src/native-drawing-motion.js';

function fixture() {
  const scripts = {};
  const sounds = {};
  const buttons = Array.from({ length: 4 }, (_, index) => {
    const first = 18060 + index * 3;
    for (let resource = first; resource <= first + 2; resource++) {
      scripts[resource] = { script: resource, tickMs: 100, endCheckTick: 3,
        frames: [0, 1, 2].map(tick => ({ tick, parts: [] })),
        sounds: [{ tick: resource === first + 2 ? 0 : 1, sound: resource - 56, channel: 1 }] };
      sounds[resource - 56] = { src: `drawing-motion/${resource - 56}.wav` };
    }
    return { name: ['pencil', 'chalk', 'crayon', 'marker'][index], mode: 2,
      auxiliaryClipRect: [160 + index * 57, 648, 53, 109],
      commandArgument: index, stateScripts: [first, first + 1, 0, first + 1], rolloverScript: first + 2 };
  });
  return { buttons, scripts, sounds, sprites: {} };
}

function setup(options = {}) {
  let time = 0;
  const sounds = [];
  const renders = [];
  const controller = createDrawingMotionController(fixture(), {
    now: () => time, render: snapshot => renders.push(snapshot),
    playSound: (cue, owner) => {
      const handle = { cue, owner, stopped: false, complete: true,
        stop() { this.stopped = true; }, isComplete() { return this.complete; } };
      sounds.push(handle);
      return handle;
    }, ...options,
  });
  return { controller, sounds, renders, tick(value) { time = value; controller.step(value); } };
}

test('mode9 uses raw shade/tint/coverage and retains destination alpha', () => {
  const destination = new Uint8ClampedArray([100, 120, 140, 17]);
  blendDrawingMode9(destination, 0, new Uint8Array([0, 4, 176, 255]), 0, [0, 128, 255]);
  assert.deepEqual([...destination], [4, 92, 180, 17]);
  blendDrawingMode9(destination, 0, new Uint8Array([255, 0, 255, 0]), 0, [255, 0, 0]);
  assert.deepEqual([...destination], [4, 92, 180, 17]); // Source green key has coverage0.
});

test('mode9 clamps highlights, keeps channels independent and uses float32 truncation', () => {
  const destination = new Uint8ClampedArray([100, 120, 140, 255]);
  blendDrawingMode9(destination, 0, new Uint8Array([0, 200, 255, 128]), 0, [255, 0, 128]);
  assert.deepEqual([...destination], [255, 160, 234, 255]);
});

test('final zero-wait group remains visible at and beyond end', () => {
  const clip = fixture().scripts[18060];
  assert.equal(drawingFrameAtTick(clip, 1), 1);
  assert.equal(drawingFrameAtTick(clip, 2), 2);
  assert.equal(drawingFrameAtTick(clip, 100), 2);
});

test('restored selection uses state3 and cannot hover or activate itself', () => {
  const { controller, sounds } = setup();
  assert.equal(controller.snapshot()[0].state, 3);
  assert.equal(controller.snapshot()[0].script, 18061);
  assert.equal(controller.snapshot()[0].disabled, true);
  controller.enter(0, 0);
  assert.equal(controller.snapshot()[0].auxiliary, false);
  assert.equal(controller.press(0, 0), false);
  assert.equal(sounds.length, 0);
});

test('press, drag out/reenter and release preserve1→3 script progress', () => {
  const { controller, tick } = setup();
  assert.equal(controller.press(1, 0), true);
  tick(100);
  assert.equal(controller.snapshot()[1].tick, 1);
  controller.release(true, 110);
  assert.equal(controller.snapshot()[1].state, 3);
  assert.equal(controller.snapshot()[1].tick, 1);
  assert.equal(controller.snapshot()[0].state, 0);
  assert.equal(controller.snapshot()[0].disabled, false);
  assert.equal(controller.press(2, 120), true);
  controller.leave(2, 130);
  assert.equal(controller.snapshot()[2].state, 0);
  controller.enter(2, 140);
  assert.equal(controller.snapshot()[2].state, 1);
  assert.equal(controller.release(false, 150), null);
  assert.equal(controller.snapshot()[2].state, 0);
  assert.equal(controller.snapshot()[1].state, 3);
});

test('hover is finite, does not restart on remain, resumes backing with its old deadline', () => {
  const { controller, sounds, tick } = setup();
  controller.enter(1, 50);
  assert.equal(controller.snapshot()[1].script, 18065);
  assert.deepEqual(controller.snapshot()[1].clipRect, [217, 648, 53, 109]);
  controller.enter(1, 60);
  assert.equal(sounds.length, 1);
  tick(150); tick(250);
  assert.equal(controller.snapshot()[1].frameIndex, 2);
  assert.equal(controller.snapshot()[1].auxiliary, true);
  tick(350);
  assert.equal(controller.snapshot()[1].script, 18063);
  assert.equal(controller.snapshot()[1].clipRect, null);
  assert.equal(controller.snapshot()[1].tick, 0);
  controller.enter(1, 360);
  assert.equal(controller.snapshot()[1].auxiliary, false);
  tick(351);
  assert.equal(controller.snapshot()[1].tick, 1);
  controller.leave(1, 410); controller.enter(1, 420);
  assert.equal(controller.snapshot()[1].script, 18065);
});

test('hover hides/stops backing audio, leave stops auxiliary without stopping peers', () => {
  const { controller, sounds, tick } = setup();
  tick(100);
  const backing = sounds.find(sound => sound.cue.sound === 18007);
  const peer = sounds.find(sound => sound.cue.sound === 18005);
  controller.enter(1, 110);
  assert.equal(backing.stopped, true);
  const hover = sounds.at(-1);
  controller.leave(1, 120);
  assert.equal(hover.stopped, true);
  assert.equal(peer.stopped, false);
  controller.dispose();
  const before = controller.snapshot();
  tick(1000); controller.enter(2); controller.dispatch(3, 0x2006);
  assert.deepEqual(controller.snapshot(), before);
  assert.ok(sounds.every(sound => sound.stopped));
});

const sourceManifest = new URL('../../public/original/ui/drawing-motion/manifest.json', import.meta.url);
test('DMG manifest plays all12 complete timelines and preserves every exported raw-byte hash',
  { skip: !existsSync(sourceManifest) }, () => {
    const manifest = JSON.parse(readFileSync(sourceManifest));
    const counts = [11, 11, 6, 16, 16, 6, 16, 16, 6, 14, 14, 5];
    for (let index = 0; index < 4; index++) {
      for (const [role, event] of [[0, 0x2004], [1, 0x2005], [2, null]]) {
        const controller = createDrawingMotionController(manifest, { selected: null, now: () => 0 });
        if (event !== null) controller.dispatch(index, event, 0);
        else controller.enter(index, 0);
        const script = 18060 + index * 3 + role;
        const count = counts[script - 18060];
        assert.equal(controller.snapshot()[index].script, script);
        for (let tick = 0; tick < count; tick++) {
          controller.step(tick * 100);
          const state = controller.snapshot()[index];
          assert.equal(state.frameIndex, tick);
          assert.equal(state.finished, false);
          assert.equal(state.frame.parts.length, 2);
        }
        controller.step(count * 100);
        const state = controller.snapshot()[index];
        if (role === 2) assert.equal(state.auxiliary, false);
        else { assert.equal(state.finished, true); assert.equal(state.frameIndex, count - 1); }
        controller.dispose();
      }
    }
    for (const sprite of Object.values(manifest.sprites)) {
      const bytes = readFileSync(new URL(`../../public/original/ui/${sprite.argb}`, import.meta.url));
      assert.equal(bytes.length, sprite.width * sprite.height * 4);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), sprite.argbSha256);
    }
  });

test('channel1 sound delays completion, then restores backing without another cycle', () => {
  const { controller, sounds, tick } = setup();
  controller.enter(1, 0);
  sounds[0].complete = false;
  tick(100); tick(200); tick(300);
  assert.equal(controller.snapshot()[1].auxiliary, true);
  assert.equal(controller.snapshot()[1].frameIndex, 2);
  sounds[0].complete = true;
  tick(400);
  assert.equal(controller.snapshot()[1].auxiliary, false);
  assert.equal(sounds.filter(sound => sound.cue.sound === 18009).length, 1);
});

test('late callbacks advance one native update without sound bursts', () => {
  const { controller, tick } = setup();
  tick(900);
  assert.equal(controller.snapshot()[1].tick, 1);
  tick(901);
  assert.equal(controller.snapshot()[1].tick, 1);
  tick(1000);
  assert.equal(controller.snapshot()[1].tick, 2);
});

test('cancel resets tracking and stops all owned audio', () => {
  const { controller, sounds, tick } = setup();
  controller.press(2, 0); tick(100);
  controller.cancel(110);
  assert.equal(controller.snapshot()[2].state, 0);
  assert.equal(controller.release(true, 120), null);
  assert.ok(sounds.every(sound => sound.stopped));
});

test('canvas callback paints part0 then clips raw mode9 to temporary base dimensions', () => {
  const manifest = { sprites: { 1: { width: 3, height: 2 }, 2: { width: 4, height: 3 } } };
  const argb = new Uint8Array(4 * 3 * 4);
  for (let index = 0; index < argb.length; index += 4) argb.set([0, 4, 176, 255], index);
  const base = {};
  const assets = new Map([['1', { image: base }], ['2', { argb }]]);
  const calls = [];
  const context = { canvas: { width: 10, height: 10 },
    drawImage(...args) { calls.push(['draw', ...args]); },
    getImageData(...args) { calls.push(['get', ...args]); return { data: new Uint8ClampedArray([100, 120, 140, 55, 100, 120, 140, 55]) }; },
    putImageData(...args) { calls.push(['put', ...args]); },
  };
  paintDrawingMotionFrame(context, manifest,
    { parts: [{ sprite: 1, x: 1, y: 1 }, { sprite: 2, x: 2, y: 2 }] }, assets, [0, 128, 255]);
  assert.deepEqual(calls[0], ['draw', base, 1, 1]);
  assert.deepEqual(calls[1], ['get', 2, 2, 2, 1]);
  assert.deepEqual([...calls[2][1].data], [4, 92, 180, 55, 4, 92, 180, 55]);
  assert.deepEqual(calls[2].slice(2), [2, 2]);
});

test('asset failures reject cleanly and a new load retries without stale cached rejection', async () => {
  const manifest = { sprites: { 1: { image: 'drawing-motion/1.png', argb: 'drawing-motion/1.argb', width: 1, height: 1 } } };
  let ok = false;
  const paths = [];
  const options = { resolve: path => `/ui/${path}`,
    createImage: () => ({ naturalWidth: 1, naturalHeight: 1, decode: async () => {} }),
    fetch: async path => { paths.push(path); return { ok, status: 404, arrayBuffer: async () => new ArrayBuffer(4) }; } };
  await assert.rejects(loadDrawingMotionAssets(manifest, options), /404/);
  ok = true;
  const assets = await loadDrawingMotionAssets(manifest, options);
  assert.equal(assets.get('1').argb.length, 4);
  assert.deepEqual(paths, ['/ui/drawing-motion/1.argb', '/ui/drawing-motion/1.argb']);
});

test('auxiliary clipping applies to both ordinary drawing and putImageData bounds', () => {
  const manifest = { sprites: { 1: { width: 4, height: 4 }, 2: { width: 4, height: 4 } } };
  const assets = new Map([['1', { image: {} }], ['2', { argb: new Uint8Array(64) }]]);
  const calls = [];
  const context = { canvas: { width: 10, height: 10 },
    save() { calls.push('save'); }, beginPath() {}, rect(...args) { calls.push(['rect', ...args]); },
    clip() { calls.push('clip'); }, restore() { calls.push('restore'); }, drawImage() { calls.push('draw'); },
    getImageData(...args) { calls.push(['get', ...args]); return { data: new Uint8ClampedArray(8) }; },
    putImageData(...args) { calls.push(['put', ...args.slice(1)]); },
  };
  paintDrawingMotionFrame(context, manifest,
    { parts: [{ sprite: 1, x: 1, y: 1 }, { sprite: 2, x: 1, y: 1 }] }, assets, [0, 0, 0],
    { clipRect: [2, 2, 1, 2] });
  assert.deepEqual(calls, ['save', ['rect', 2, 2, 1, 2], 'clip', 'draw', 'restore',
    ['get', 2, 2, 1, 2], ['put', 2, 2]]);
});
