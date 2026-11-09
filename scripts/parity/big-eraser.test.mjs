import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeBigEraser, drawNativeBigEraserPath, nativeBigEraserPanelChoice, nativeBigEraserEffect } from '../../src/native-big-eraser.js';

// Asset-free npm test: this fixture spells the binary scheduling thresholds and
// deliberately uses distinguishable paths; DMG byte checks live in Python.
const paths = Array.from({ length: 11 }, (_, index) => Array(16).fill(index));
const manifest = { version: 1, panel: { toolIds: Array.from({ length: 14 }, (_, index) => 124 + index) },
  effects: Array.from({ length: 15 }, (_, index) => ({ toolId: 123 + index, bitmapId: 3700 + index,
    engine: index === 14 ? 'RFullCutEraser' : index === 0 ? 'RDFirecracker' : 'RQuickTimeEraser' })),
  firehose: { engine: 'RBubbleCleaner', toolId: 139, initialDelayMs: 200, updateIntervalMs: 110,
    maximumElapsedMs: 2000, paths: paths.slice(0, 10), finalPath: paths[10], alpha: Math.fround(.3), sound: { soundId: 7433 } } };

function fixture(extra = {}) {
  let time = 0, id = 0;
  const pending = new Map(), draws = [], events = [], sounds = [];
  const context = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
    moveTo(x) { this.path = x; }, lineTo() {}, bezierCurveTo() {}, closePath() {},
    fill() { draws.push([time, this.path, this.globalAlpha]); }, fillRect() { draws.push([time, 'vanish', this.globalAlpha]); },
    clearRect() {} };
  const eraser = createNativeBigEraser({ manifest, context, rect: [3, 4, 100, 80], now: () => time,
    schedule: callback => { pending.set(++id, callback); return id; }, cancel: key => pending.delete(key),
    playSound: cue => { const audio = { pause() { this.paused = true; } }; sounds.push({ cue, audio }); return audio; },
    onBegin: ({ effect }) => { events.push(['begin', effect.toolId]); return 'snapshot'; },
    onCommit: ({ token }) => events.push(['commit', token]), onCancel: ({ reason, token }) => events.push([reason, token]), ...extra });
  return { eraser, draws, events, sounds, pending,
    at(ms) { time = ms; const calls = [...pending.values()]; pending.clear(); calls.forEach(fn => fn(time)); } };
}

test('Big Eraser panel maps its fourteen source choices without aliasing Firecracker or extra icons', () => {
  assert.equal(nativeBigEraserPanelChoice(manifest, 0).toolId, 124);
  assert.equal(nativeBigEraserPanelChoice(manifest, 13).bitmapId, 3714);
  assert.equal(nativeBigEraserPanelChoice(manifest, 14), null);
  assert.equal(nativeBigEraserEffect(manifest, { bitmapId: 3714 }).toolId, 137);
  assert.equal(nativeBigEraserEffect(manifest, { toolId: 137, bitmapId: 3714 }), null);
  assert.equal(nativeBigEraserEffect(manifest, { trigger: 'rollover' }), null);
});

test('Firehose honors strict 200/110ms thresholds and advances once per delivered callback', () => {
  const f = fixture();
  assert.equal(f.eraser.play({ trigger: 'firehose' }), true);
  f.at(200); assert.deepEqual(f.draws, []);
  f.at(201); assert.deepEqual(f.draws, [[201, 0, Math.fround(.3)]]);
  f.at(311); assert.equal(f.draws.length, 1);
  f.at(312); assert.equal(f.draws.length, 2);
  f.at(1500); assert.equal(f.draws.length, 3);
  assert.deepEqual(f.events, [['begin', 139]]);
  f.at(2000); assert.equal(f.draws.at(-1)[1], 3);
  f.at(2111); assert.deepEqual(f.draws.at(-1), [2111, 10, 1]);
  assert.deepEqual(f.events, [['begin', 139], ['commit', 'snapshot']]);
  assert.equal(f.sounds[0].cue.soundId, 7433);
  assert.equal(f.sounds[0].audio.paused, true);
});

test('Firehose normally emits all ten cumulative paths before final clear and one history callback', () => {
  const f = fixture(); f.eraser.play({ trigger: 'firehose' });
  for (let index = 0; index < 10; index++) f.at(201 + index * 111);
  assert.deepEqual(f.draws.map(draw => draw[1]), Array.from({ length: 10 }, (_, index) => index));
  assert.equal(f.events.length, 1);
  f.at(1311);
  assert.equal(f.draws.at(-1)[1], 10);
  assert.equal(f.events.filter(event => event[0] === 'commit').length, 1);
  assert.equal(f.pending.size, 0);
  assert.equal(f.eraser.state, 'idle');
});

test('Vanish fills and commits immediately, without Firehose sound or delayed clear', () => {
  const f = fixture(); f.eraser.play({ bitmapId: 3714 });
  assert.deepEqual(f.draws, [[0, 'vanish', 1]]);
  assert.deepEqual(f.events, [['begin', 137], ['commit', 'snapshot']]);
  assert.equal(f.sounds.length, 0); assert.equal(f.pending.size, 0);
});

test('unsupported effect preserves picture and ongoing operation; it never falls back to immediate clear', () => {
  const unsupported = [], f = fixture({ onUnsupported: value => unsupported.push(value) });
  for (const bitmapId of [3700, 3701, 3715, 3716]) assert.equal(f.eraser.play({ bitmapId }), false);
  assert.equal(unsupported.length, 4); assert.deepEqual(f.events, []);
  f.eraser.play({ trigger: 'firehose' });
  assert.equal(f.eraser.play({ toolId: 124 }), false);
  assert.equal(f.eraser.state, 'running');
});

test('cancel, replacement and disposal invalidate captured callbacks and release owned sound', () => {
  const f = fixture(); f.eraser.play({ trigger: 'firehose' });
  const stale = [...f.pending.values()][0];
  f.at(201); f.eraser.cancel('escape'); stale(3000);
  assert.deepEqual(f.events, [['begin', 139], ['escape', 'snapshot']]);
  assert.equal(f.sounds[0].audio.paused, true);
  f.eraser.play({ trigger: 'firehose' }); f.eraser.play({ trigger: 'firehose' });
  assert.ok(f.events.some(event => event[0] === 'replace'));
  f.eraser.dispose(); f.at(5000);
  assert.equal(f.eraser.play({ toolId: 137 }), false);
  assert.equal(f.events.some(event => event[0] === 'commit'), false);
});

test('render failures cancel without commit; audio refusal still permits completion', () => {
  const errors = [], f = fixture({ onError: error => errors.push(error), onBegin() { throw Error('snapshot'); } });
  assert.equal(f.eraser.play({ trigger: 'firehose' }), false);
  assert.equal(f.eraser.state, 'idle'); assert.equal(errors.length, 1);
  const silent = fixture({ playSound() { throw Error('blocked'); } });
  silent.eraser.play({ trigger: 'firehose' }); silent.at(2001);
  assert.deepEqual(silent.events.at(-1), ['commit', 'snapshot']);
});

test('source path transform flips normalized y, clips picture geometry and restores canvas state', () => {
  const calls = [], context = Object.fromEntries(['save', 'restore', 'beginPath', 'rect', 'clip', 'translate', 'scale',
    'moveTo', 'lineTo', 'bezierCurveTo', 'closePath', 'fill'].map(name => [name, (...args) => calls.push([name, ...args])]));
  drawNativeBigEraserPath(context, [10, 20, 720, 542], Array.from({ length: 16 }, (_, index) => index / 16), .3);
  assert.deepEqual(calls.slice(0, 7), [['save'], ['beginPath'], ['rect', 10, 20, 720, 542], ['clip'],
    ['translate', 10, 562], ['scale', 720, -542], ['beginPath']]);
  assert.equal(calls.filter(call => call[0] === 'bezierCurveTo').length, 2);
  assert.deepEqual(calls.at(-1), ['restore']);
  assert.throws(() => drawNativeBigEraserPath(context, [0, 0, 0, 10], paths[0]), RangeError);
});
