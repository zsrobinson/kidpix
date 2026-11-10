import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingMotionController } from '../../src/native-drawing-motion.js';

// Actual state/timeline core, modeled clock and sound. This cannot model Safari suspension.
function fixture() {
  let time = 0;
  const handles = [];
  const clip = script => ({ script, tickMs: 100, endCheckTick: 3,
    frames: [0, 1, 2].map(tick => ({ tick, parts: [] })), sounds: [{ tick: 0, sound: 1, channel: 1 }] });
  const manifest = { buttons: [0, 1].map(i => ({ name: `row-${i}`, mode: 2, stateScripts: [1, 2, 0, 2], rolloverScript: 3 })),
    scripts: { 1: clip(1), 2: clip(2), 3: clip(3) } };
  const core = createDrawingMotionController(manifest, { now: () => time, playSound() {
    const handle = { stopped: false, complete: false, stop() { this.stopped = true; }, isComplete() { return this.stopped || this.complete; } };
    handles.push(handle); return handle;
  } });
  return { core, handles, step(at) { time = at; core.step(at); } };
}

test('a long delivered-frame gap advances source once without burst cues or deadline overflow', () => {
  const f = fixture(); f.core.enter(1); const count = f.handles.length;
  f.step(12 * 60 * 60 * 1000);
  assert.equal(f.core.snapshot()[1].tick, 1);
  assert.equal(f.handles.length, count);
  f.core.dispose(); assert.ok(f.handles.every(h => h.stopped));
});

test('an unresolved audio completion holds the terminal pose while RAF steps keep arriving', () => {
  const f = fixture(); f.core.enter(1);
  [100, 200, 300, 400, 500].forEach(f.step);
  assert.equal(f.core.snapshot()[1].tick, 2);
  assert.equal(f.core.snapshot()[1].auxiliary, true);
  f.handles.forEach(h => { h.complete = true; }); f.step(600);
  assert.equal(f.core.snapshot()[1].auxiliary, false);
  f.core.dispose();
});

test('owner cancellation clears unresolved sound and hover/tracking so fresh input can animate', () => {
  const f = fixture(); f.core.enter(1); f.core.press(1);
  f.core.cancel(); assert.ok(f.handles.every(h => h.stopped));
  assert.equal(f.core.release(true), null, 'cancelled contact cannot activate');
  f.core.enter(1); f.step(100);
  assert.equal(f.core.snapshot()[1].auxiliary, true);
  assert.equal(f.core.snapshot()[1].tick, 1);
  f.core.dispose();
});
