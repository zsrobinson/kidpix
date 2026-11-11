import test from 'node:test';
import { getEventListeners } from 'node:events';
import assert from 'node:assert/strict';
import { trackingCue, bindStampControl } from '../../src/stamp-editor-control.js';
import { interactionOwner } from '../../src/interaction-owner.js';

class Audio extends EventTarget {
  pauses = 0;
  live = new Map();
  addEventListener(type, fn) { super.addEventListener(type, fn); this.live.set(type, fn); }
  removeEventListener(type, fn) { super.removeEventListener(type, fn); if (this.live.get(type) === fn) this.live.delete(type); }
  play() { return this.result ?? Promise.resolve(); }
  pause() { this.pauses++; this.dispatchEvent(new Event('pause')); }
}
test('tracking cue replacement and terminal events dispose exactly their own handles', () => {
  const a = trackingCue(), b = trackingCue();
  const first = new Audio(), second = new Audio(), independent = new Audio();
  a.play(first); b.play(independent); a.play(second);
  assert.equal(first.pauses, 1); assert.equal(first.live.size, 0);
  assert.equal(independent.pauses, 0);
  second.dispatchEvent(new Event('ended'));
  assert.equal(second.live.size, 0);
  a.stop(); assert.equal(second.pauses, 0);
  b.stop(); b.stop(); assert.equal(independent.pauses, 1);
});
for (const kind of ['rejection', 'throw', 'error', 'pause']) test(`tracking ${kind} releases listeners without retaining a completion handle`, async () => {
  const cue = trackingCue(), audio = new Audio();
  if (kind === 'rejection') audio.result = Promise.reject(new Error('blocked'));
  if (kind === 'throw') audio.play = () => { throw new Error('blocked'); };
  cue.play(audio);
  if (kind === 'error' || kind === 'pause') audio.dispatchEvent(new Event(kind));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(audio.live.size, 0);
  cue.stop(); assert.equal(audio.pauses, 0);
});

function fixture({ failCapture = false } = {}) {
  const window = new EventTarget(), document = new EventTarget();
  document.defaultView = window;
  const control = new EventTarget();
  control.ownerDocument = document;
  control.getAttribute = () => null;
  control.getBoundingClientRect = () => ({ left: 0, top: 0, right: 20, bottom: 20 });
  control.focus = () => {};
  let captured = false;
  control.setPointerCapture = () => { if (failCapture) throw new Error('capture unavailable'); captured = true; };
  control.hasPointerCapture = () => captured;
  control.releasePointerCapture = () => { captured = false; };
  const owner = interactionOwner(document), controller = new AbortController();
  let activations = 0, starts = 0, stops = 0;
  bindStampControl(control, { owner, signal: controller.signal, activate: () => activations++, start: () => starts++, stop: () => stops++ });
  const send = (target, type, properties = {}) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 7, button: 0, pointerType: 'pen', isPrimary: true, clientX: 10, clientY: 10, ...properties }));
  return { window, control, owner, controller, send, stats: () => ({ activations, starts, stops, captured }) };
}
test('capture failure releases owner; foreign terminals and abort cannot retire twice', () => {
  const failed = fixture({ failCapture: true });
  failed.send(failed.control, 'pointerdown');
  assert.equal(failed.owner.busy(), false);
  const f = fixture();
  f.send(f.control, 'pointerdown');
  f.send(f.control, 'pointercancel', { pointerId: 8 });
  assert.equal(f.owner.busy(), true);
  f.controller.abort(); f.send(f.window, 'pointerup');
  assert.equal(f.owner.busy(), false);
  assert.deepEqual(f.stats(), { activations: 0, starts: 1, stops: 1, captured: false });
});
test('key identity survives modifiers but never crosses control or cancellation boundaries', () => {
  const f = fixture();
  f.send(f.control, 'keydown', { key: ' ', code: 'Space' });
  f.send(f.control, 'keyup', { key: 'Enter', code: 'Enter' });
  assert.equal(f.owner.busy(), true);
  f.send(f.control, 'keyup', { key: ' ', code: 'Space', shiftKey: true });
  assert.equal(f.stats().activations, 1);
  f.send(f.control, 'keydown', { key: ' ', code: 'Space' });
  f.send(f.window, 'blur');
  f.send(f.control, 'keyup', { key: ' ', code: 'Space' });
  assert.equal(f.stats().activations, 1);
  f.controller.abort();
});
test('released-click tombstone allows a new down with reused ID but rejects the old click', () => {
  const f = fixture();
  f.send(f.control, 'pointerdown'); f.send(f.window, 'pointerup');
  assert.equal(f.stats().activations, 1);
  assert.equal(f.send(f.window, 'click', { detail: 1 }), false);
  f.send(f.window, 'pointerdown'); f.send(f.control, 'pointerdown');
  assert.equal(f.owner.busy(), true);
  f.controller.abort();
});
test('a secondary mouse button release cannot retire a primary held control', () => {
  const f = fixture();
  f.send(f.control, 'pointerdown');
  f.send(f.window, 'pointerup', { button: 2 });
  assert.equal(f.owner.busy(), true);
  f.send(f.window, 'pointerup');
  assert.equal(f.stats().activations, 1);
  f.controller.abort();
});

test('abort removes all modal listeners while preserving the shared document guard', () => {
  const f = fixture();
  assert.equal(getEventListeners(f.window, 'pointermove').length, 2);
  f.controller.abort();
  for (const type of ['pointerdown','pointerenter','pointerleave','click','keydown','keyup','blur','pointercancel','lostpointercapture']) {
    assert.equal(getEventListeners(f.control, type).length, 0, type);
  }
  assert.equal(getEventListeners(f.window, 'pointermove').length, 1);
  assert.equal(getEventListeners(f.window, 'pointerup').length, 1);
});
