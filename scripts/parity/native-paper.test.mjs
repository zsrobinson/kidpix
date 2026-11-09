import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativePaperPicker, nativePaperFrameAtTick, nativePaperParts, drawNativePaperFrame } from '../../src/native-paper.js';
import { paperFixture as manifest } from './fixtures/paper.mjs';

const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

function fixture(overrides = {}) {
  let time = 0;
  let counter = 0;
  const callbacks = new Map();
  const draws = [];
  const sounds = [];
  const images = [];
  const context = { save() {}, restore() {}, beginPath() {}, rect(...rect) { this.clipRect = rect; }, clip() {},
    clearRect() { draws.length = 0; }, drawImage(image, x, y) { draws.push({ image: image.path, x, y }); } };
  const canvas = { style: {}, dataset: {}, hidden: false, setAttribute() {}, getContext: () => context, remove() {} };
  const control = new EventTarget();
  control.dataset = {};
  const document = { baseURI: 'http://localhost/', defaultView: { AbortController }, createElement: () => canvas };
  const layer = { ownerDocument: document, append() {} };
  const staticSprite = { hidden: false };
  const ready = [];
  const errors = [];
  const picker = createNativePaperPicker({ manifest, layer, control, staticSprite,
    now: () => time, schedule: callback => { callbacks.set(++counter, callback); return counter; },
    cancel: id => callbacks.delete(id), loadImage: async path => { images.push(path); return { path }; },
    playSound: cue => { const audio = Object.assign(new EventTarget(), { pause() { this.paused = true; } }); sounds.push({ cue, audio }); return audio; },
    onReady: () => ready.push(time), onError: error => errors.push(error), ...overrides });
  return { picker, canvas, control, draws, sounds, images, ready, errors, staticSprite,
    advance(ms) { time += ms; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); },
    event(name, buttons = 0) { const event = new Event(name); event.buttons = buttons; control.dispatchEvent(event); },
  };
}

test('authored paper opening has six100ms positions, source registration and substitution after placement', () => {
  assert.deepEqual(manifest.frames.map(frame => frame.tick), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(manifest.frames.map(frame => frame.parts[0].x), [799, 718, 637, 556, 475, 394]);
  assert.equal(manifest.endCheckTick * manifest.tickMs, 600);
  assert.equal(nativePaperFrameAtTick(manifest, 4.99), 4);
  assert.equal(nativePaperFrameAtTick(manifest, 5), 5);
  assert.deepEqual(nativePaperParts(manifest, manifest.frames[0], 12307).map(({ sprite, x, y }) => [sprite, x, y]),
    [[243, 799, 540], [68, 883, 524], [225, 883, 533]]);
  assert.throws(() => nativePaperParts(manifest, manifest.frames[0], 12321), RangeError);
});

test('rendering preserves source part order and clips only the opening actor', () => {
  const calls = [];
  const context = { save() {}, restore() {}, beginPath() {}, rect(...rect) { calls.push(['rect', ...rect]); },
    clip() { calls.push(['clip']); }, drawImage(image, ...point) { calls.push([image, ...point]); } };
  drawNativePaperFrame(context, manifest, manifest.frames[0], 12300, path => path);
  assert.deepEqual(calls, [['rect', 394, 499, 539, 134], ['clip'], ['paper-canister/242.png', 799, 540],
    ['paper-canister/68.png', 883, 524], ['paper-canister/218.png', 883, 533]]);
  calls.length = 0;
  drawNativePaperFrame(context, manifest, manifest.states.rest.frames[0], 12320, path => path, false);
  assert.equal(calls[1][0], 'paper-canister/238.png');
  assert.equal(calls.some(call => call[0] === 'clip'), false);
});

test('opening starts after decoding, holds terminal frame, then gives page ownership to live popup at600ms', async () => {
  const f = fixture();
  await settle();
  assert.equal(await f.picker.open(12314), true);
  assert.equal(f.control.dataset.paperState, 'opening');
  assert.equal(f.canvas.dataset.frame, '0');
  for (let index = 0; index < 5; index++) f.advance(100);
  f.advance(99);
  assert.equal(f.canvas.dataset.frame, '5');
  assert.deepEqual(f.ready, []);
  f.advance(1);
  assert.equal(f.picker.state, 'open');
  assert.deepEqual(f.ready, [600]);
  assert.deepEqual(f.draws, [{ image: 'paper-canister/70.png', x: 883, y: 524 }, { image: 'paper-canister/232.png', x: 883, y: 533 }]);
  assert.match(f.canvas.style.cssText, /z-index:4/);
  f.picker.dispose();
});

test('delayed delivered updates preserve every authored pose and the terminal hold without catchup', async () => {
  const f = fixture();
  await settle();
  await f.picker.open();
  const presented = [f.canvas.dataset.frame];
  for (const delay of [350, 300, 500, 170, 400]) {
    f.advance(delay);
    presented.push(f.canvas.dataset.frame);
    assert.equal(f.picker.state, 'opening');
    assert.deepEqual(f.ready, []);
  }
  assert.deepEqual(presented, ['0', '1', '2', '3', '4', '5']);
  f.advance(99);
  assert.equal(f.picker.state, 'opening');
  assert.equal(f.canvas.dataset.frame, '5');
  f.advance(1);
  assert.equal(f.picker.state, 'open');
  assert.deepEqual(f.ready, [1820]);
  f.picker.dispose();
});

test('close cancels pending opening and restores selected resting canister without replaying opening', async () => {
  const f = fixture();
  await settle();
  await f.picker.open(12303);
  f.advance(200);
  f.picker.setSelected(12320);
  f.picker.close();
  await settle();
  f.advance(1000);
  assert.equal(f.picker.state, 'closed');
  assert.deepEqual(f.ready, []);
  assert.equal(f.canvas.dataset.script, '1052');
  assert.equal(f.draws[1].image, 'paper-canister/238.png');
  f.picker.dispose();
  assert.equal(f.staticSprite.hidden, false);
});

test('normal quick press plays cue synchronously and pointerup does not cancel its owned sound', async () => {
  const f = fixture();
  f.event('pointerenter');
  f.event('pointerdown', 1);
  assert.equal(f.sounds.length, 1);
  assert.equal(f.sounds[0].cue.sound, 1006);
  f.event('pointerup');
  assert.equal(f.sounds[0].audio.paused, undefined);
  await settle();
  assert.equal(f.sounds.length, 1);
  f.picker.close();
  assert.equal(f.sounds[0].audio.paused, true);
  f.picker.dispose();
});

test('closing during first-use image loading prevents stale completion; failed image loads can retry', async () => {
  let release;
  let fail = true;
  const f = fixture({ loadImage: path => path.endsWith('/243.png')
    ? fail ? Promise.reject(new Error('offline')) : new Promise(resolve => { release = () => resolve({ path }); })
    : Promise.resolve({ path }) });
  await settle();
  assert.equal(await f.picker.open(12307), false);
  assert.equal(f.errors.length, 1);
  fail = false;
  const pending = f.picker.open(12307);
  await settle();
  assert.equal(f.picker.state, 'loading');
  f.picker.close();
  release();
  assert.equal(await pending, false);
  f.advance(1000);
  assert.deepEqual(f.ready, []);
  assert.equal(f.picker.state, 'closed');
  f.picker.dispose();
});
