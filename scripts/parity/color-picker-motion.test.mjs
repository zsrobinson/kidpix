import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorPickerHit, colorPickerContains, drawColorPickerFrame, createNativeColorPickerMotion } from '../../src/native-color-picker-motion.js';

// Source-derived fixture intentionally does not require ignored imported assets.
const frame = (sprite, x = 38, y = 426, tick = 0) => ({ tick, parts: [{ sprite, x, y }] });
const clip = (script, tickMs, sprites, sound) => ({ script, tickMs, clipRect: [-80, 411, 427, 457],
  frames: sprites.map((sprite, tick) => frame(sprite, sprite < 4 ? [-78, -46, -7][sprite - 1] : 38,
    sprite < 4 ? [559, 510, 470][sprite - 1] : 426, tick)), endCheckTick: sprites.length,
  sounds: sound === undefined ? [] : [{ tick: 0, sound, channel: 1 }] });
const manifest = { colorChangeCue: { sound: 31504, exported: false }, clips: {
  opening: clip(1500, 30, [1, 2, 3, 4, 5, 6, 7], 1501),
  closing: clip(1501, 100, [7, 6, 5, 4, 3, 2, 1], 1500),
  dropperRest: clip(1503, 100, [9]), dropperTracking: clip(1504, 100, [10], 1502),
  dropperHover: clip(1505, 100, [11]),
}, sounds: { 1500: { audio: 'big-1500.wav' }, 1501: { audio: 'big-1501.wav' } },
  hitMask: { x: 114, y: 509, width: 12, height: 12, rows: Array.from({ length: 12 }, () => [[3, 9]]) },
  hitSearch: { radii: [1, 2, 3], offsetOrder: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] },
  retentionRegion: { rectsLTRB: [[85, 568, 170, 698], [40, 658, 125, 748], [110, 468, 290, 678]] },
};
function fixture(options = {}) {
  let time = 0, id = 0;
  const tasks = new Map(), paints = [], cues = [], ready = [], closed = [], previews = [], selections = [], errors = [];
  const picker = createNativeColorPickerMotion({ manifest, now: () => time,
    schedule: fn => { tasks.set(++id, fn); return id; }, cancel: key => tasks.delete(key),
    render: value => paints.push(value), onReady: () => ready.push(time), onClosed: () => closed.push(time),
    onPreview: c => previews.push(c), onSelect: c => selections.push(c), onError: e => errors.push(e),
    readColor: (x, y) => `${x},${y}`, playSound: c => { cues.push(c); return null; }, ...options });
  return { picker, paints, cues, ready, closed, previews, selections, errors,
    advance(ms) { time += ms; const work = [...tasks.values()]; tasks.clear(); work.forEach(fn => fn()); },
    async opened() { await picker.open(); for (let i = 0; i < 7; i++) this.advance(30); },
  };
}

test('opening holds each authored pose for30ms and installs controls only after terminal check', async () => {
  const f = fixture(); await f.picker.open();
  assert.equal(f.picker.state, 'opening'); assert.equal(f.paints.at(-1).frameIndex, 0);
  for (let i = 1; i < 7; i++) { f.advance(29); assert.equal(f.paints.at(-1).frameIndex, i - 1); f.advance(1); assert.equal(f.paints.at(-1).frameIndex, i); }
  assert.deepEqual(f.ready, []); f.advance(30);
  assert.deepEqual(f.ready, [210]); assert.equal(f.picker.state, 'open');
  assert.equal(f.cues.length, 1); assert.equal(f.cues[0].sound, 1501);
});

test('sound completion gates readiness at scheduled boundaries, audio failure releases gate', async () => {
  const audio = Object.assign(new EventTarget(), { ended: false, pause() { this.paused = true; } });
  const f = fixture({ playSound: () => audio }); await f.picker.open();
  for (let i = 0; i < 20; i++) f.advance(30);
  assert.deepEqual(f.ready, []); assert.equal(f.paints.at(-1).frameIndex, 6);
  audio.dispatchEvent(new Event('error')); f.advance(29); assert.deepEqual(f.ready, []);
  f.advance(1); assert.deepEqual(f.ready, [630]);
  f.picker.dispose(); assert.equal(audio.paused, true);
});

test('delayed RAF delivers one native pose and schedules the next from delivery', async () => {
  const f = fixture(); await f.picker.open(); f.advance(5000);
  assert.equal(f.paints.at(-1).frameIndex, 1); assert.deepEqual(f.ready, []);
  f.advance(29); assert.equal(f.paints.at(-1).frameIndex, 1);
  f.advance(1); assert.equal(f.paints.at(-1).frameIndex, 2);
});

test('close interrupts opening with full authored closing and blocks reopening until completion', async () => {
  const f = fixture(); await f.picker.open(); f.advance(30);
  assert.equal(f.picker.close(), true); assert.equal(f.paints.at(-1).frame.parts[0].sprite, 7);
  assert.equal(await f.picker.open(), false); assert.equal(f.picker.close(), false);
  for (let i = 1; i < 7; i++) f.advance(100);
  assert.equal(f.picker.state, 'closing'); f.advance(100);
  assert.equal(f.picker.state, 'closed'); assert.deepEqual(f.ready, []);
  assert.equal(f.paints.at(-1).frame, null); assert.equal(await f.picker.open(), true);
});

test('load cancellation, stale promises, retries and disposal cannot resurrect the popup', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ prepare: () => pending }); const open = f.picker.open();
  f.picker.close(); release(); assert.equal(await open, false); f.advance(1000);
  assert.equal(f.picker.state, 'closed'); assert.deepEqual(f.cues, []);
  let attempts = 0; const retry = fixture({ prepare: async () => { if (++attempts === 1) throw Error('decode'); } });
  assert.equal(await retry.picker.open(), false); assert.equal(retry.errors.length, 1);
  assert.equal(await retry.picker.open(), true); retry.picker.dispose(); retry.advance(1000);
  assert.equal(retry.picker.state, 'closed'); assert.deepEqual(retry.ready, []);
});

test('retention is a rectangle union with half-open edges, not the artwork bounding box', () => {
  assert.equal(colorPickerContains(manifest.retentionRegion, 40, 658), true);
  assert.equal(colorPickerContains(manifest.retentionRegion, 40, 657), false);
  assert.equal(colorPickerContains(manifest.retentionRegion, 289, 677), true);
  assert.equal(colorPickerContains(manifest.retentionRegion, 290, 678), false);
});

test('hit search follows native neighboring pixels and strict top/left exclusion', () => {
  assert.equal(colorPickerHit(manifest, 114, 515), null);
  assert.equal(colorPickerHit(manifest, 119, 509), null);
  assert.deepEqual(colorPickerHit(manifest, 119, 515), { x: 120, y: 515 });
  assert.deepEqual(colorPickerHit(manifest, 115, 515), { x: 117, y: 515 });
  const centerOnly = structuredClone(manifest); centerOnly.hitMask.rows = Array.from({ length: 12 }, () => []);
  centerOnly.hitMask.rows[6] = [[5, 6]];
  assert.equal(colorPickerHit(centerOnly, 119, 515), null, 'the native search never tests center');
});

test('ordinary hover keeps current color; held drag previews and release commits without closing', async () => {
  const f = fixture(); await f.opened();
  f.picker.move(119, 515); assert.deepEqual(f.previews, []);
  f.picker.pointerDown(119, 515); assert.deepEqual(f.previews, ['120,515']);
  f.picker.move(120, 516); assert.equal(f.picker.previewColor, '121,516');
  f.picker.pointerUp(120, 516); assert.deepEqual(f.selections, ['121,516']);
  assert.equal(f.picker.state, 'open'); assert.equal(f.picker.color, '121,516');
  f.picker.move(50, 700); assert.equal(f.picker.state, 'open');
  f.picker.move(50, 640); assert.equal(f.picker.state, 'closing');
});

test('drag cancellation restores committed color; dropper previews screen and commits on click', async () => {
  const f = fixture({ color: '#123456' }); await f.opened();
  f.picker.pointerDown(119, 515); f.picker.move(119, 530);
  assert.equal(f.picker.previewColor, '#123456'); assert.equal(f.picker.pointerUp(119, 530), false);
  f.picker.setDropper(); f.picker.move(700, 200);
  assert.equal(f.picker.previewColor, '700,200'); assert.equal(f.picker.color, '#123456');
  assert.equal(f.picker.escape(), true); assert.equal(f.picker.previewColor, '#123456');
  assert.equal(f.picker.state, 'open'); assert.equal(f.picker.escape(), false);
  f.picker.setDropper(); f.picker.pointerDown(700, 200);
  assert.deepEqual(f.selections, ['700,200']); assert.equal(f.picker.state, 'closing');
});

test('dropper state scripts are finite single poses with tracking-only source cue', async () => {
  const f = fixture(); await f.opened();
  f.picker.setDropperState('hover'); assert.equal(f.paints.at(-1).clip.script, 1505);
  assert.equal(f.paints.at(-1).overlay, true); assert.equal(f.cues.length, 1);
  f.picker.setDropperState('tracking'); assert.equal(f.cues.at(-1).sound, 1502);
  assert.equal(f.picker.setDropperState('tracking'), false); assert.equal(f.cues.length, 2);
});

test('renderer retains source clip and scene placement without a CSS scale tween', () => {
  const commands = [], context = { save() {}, restore() {}, beginPath() {}, clip() { commands.push('clip'); },
    rect(...args) { commands.push(args); }, drawImage(...args) { commands.push(args); } };
  drawColorPickerFrame(context, { sprites: { 1: { image: 'big-1.png' } } }, manifest.clips.opening,
    manifest.clips.opening.frames[0], path => path);
  assert.deepEqual(commands, [[-80, 411, 427, 457], 'clip', ['big-1.png', -78, 559]]);
});


test('mouse-down color-change cue is independent of the animation completion gate', async () => {
  const samples = [];
  const f = fixture({ onSampleSound: cue => samples.push(cue) }); await f.opened();
  f.picker.pointerDown(119, 515); f.picker.pointerUp(119, 515);
  assert.deepEqual(samples, [{ sound: 31504, exported: false, x: 119, y: 515 }]);
  f.picker.pointerDown(119, 515); assert.equal(samples.length, 1);
  f.picker.close(); for (let i = 0; i < 7; i++) f.advance(100);
  assert.equal(f.picker.state, 'closed');
});
