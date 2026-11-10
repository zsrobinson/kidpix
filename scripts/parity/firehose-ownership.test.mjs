import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Compile-time import shim only (Vite normally supplies BASE_URL). Run the
// actual controller body; no copied scheduling/ownership implementation.
const rolloverSource = readFileSync(new URL('../../src/native-rollovers.js', import.meta.url), 'utf8')
  .replace("import { original } from './library.js';", "const original = name => '/original/' + name;")
  .replace("'./ui-audio.js'", JSON.stringify(new URL('../../src/ui-audio.js', import.meta.url).href))
  .replace("'./trays.js'", JSON.stringify(new URL('../../src/trays.js', import.meta.url).href));
const { attachNativeRollovers } = await import(`data:text/javascript;base64,${Buffer.from(rolloverSource).toString('base64')}`);
import { createFirehoseOperation } from '../../src/firehose-operation.js';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function fixture(t, { fail, delayed = false, refused = false } = {}) {
  let time = 0, id = 0, commits = 0;
  const frames = new Map(), audio = [];
  const view = Object.assign(new EventTarget(), { AbortController, performance: { now: () => time },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    Image: class { decode() { return Promise.resolve(); } }, MutationObserver: class { observe() {} disconnect() {} },
    Audio: class extends EventTarget {
      constructor(src) { super(); this.src = src; this.ended = false; this.paused = true; audio.push(this); }
      play() { this.paused = refused; return refused ? Promise.reject(Error('refused')) : Promise.resolve(); }
      pause() { this.paused = true; }
      end() { this.paused = true; this.ended = true; this.dispatchEvent(new Event('ended')); }
    } });
  const context = Object.fromEntries(['save', 'restore', 'beginPath', 'rect', 'clip', 'clearRect', 'translate', 'scale', 'moveTo', 'lineTo', 'bezierCurveTo', 'closePath', 'fill', 'fillRect'].map(k => [k, () => {}]));
  const doc = Object.assign(new EventTarget(), { defaultView: view, baseURI: 'http://localhost/', hidden: false,
    createElement: () => ({ dataset: {}, style: {}, hidden: false, setAttribute() {}, remove() {}, getContext: () => context }) });
  const control = Object.assign(new EventTarget(), { dataset: { action: 'clear' }, getAttribute() { return null; }, matches() { return false; } });
  const root = { ownerDocument: doc, querySelectorAll: () => [control] };
  const sprites = new Map([['firehose', { hidden: false }]]);
  const rollovers = attachNativeRollovers({ buttons: [{ name: 'firehose', rolloverScript: 1091, rolloverLoops: true, rolloverCancelsOnLeave: false }],
    scripts: { 1091: { tickMs: 100, rect: [0, 0, 1, 1], frames: [{ image: 'hose.png', ticks: 5 }], endCheckTick: 6,
      sounds: [{ tick: 0, sound: 1029, channel: 1 }] } } }, root, sprites, { append() {} });
  const paths = Array.from({ length: 10 }, () => Array(16).fill(0));
  const manifest = { version: 1, firehose: { engine: 'RBubbleCleaner', paths, finalPath: paths[0], alpha: .3,
    initialDelayMs: 200, updateIntervalMs: 110, maximumElapsedMs: 2000, sound: { image: 'water-cleaner-7433.wav' } } };
  let resolveManifest;
  const ready = delayed ? new Promise(resolve => { resolveManifest = resolve; }) : Promise.resolve(manifest);
  const globals = { window: view, document: doc, Audio: view.Audio, fetch: () => Promise.resolve({ ok: true, json: () => ready }),
    requestAnimationFrame: view.requestAnimationFrame, cancelAnimationFrame: view.cancelAnimationFrame, performance: view.performance };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  const operation = createFirehoseOperation({ surface: { ownerDocument: doc, append() {}, setAttribute() {}, removeAttribute() {} }, canvas: { width: 720, height: 542 },
    original: path => path, suspendRollover: () => rollovers.suspend('firehose'),
    settle() { if (fail === 'settle') throw Error('settle'); },
    begin: () => { if (fail === 'begin') throw Error('begin'); return { commit() { if (fail === 'commit') throw Error('commit'); commits++; }, release() {} }; },
    composite: () => { if (fail === 'composite') throw Error('composite'); return doc.createElement('canvas'); }, onError() {} });
  t.after(() => { operation.dispose(); rollovers(); });
  return { operation, rollovers, audio, view, doc, frames, get commits() { return commits; },
    resolveManifest: () => resolveManifest(manifest), flush,
    event(type) { control.dispatchEvent(Object.assign(new Event(type), { buttons: 0 })); },
    advance(ms) { time += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); },
    async hover() { this.event('pointerleave'); this.event('pointerenter'); await flush(); },
    finish() { for (let i = 0; i < 16; i++) { audio.filter(a => !a.paused).forEach(a => a.end()); this.advance(150); } },
  };
}

test('accepted clear stops retained 1029 and prevents repeated players after wipe completion', async t => {
  const f = fixture(t);
  await f.hover(); f.event('pointerdown'); f.event('pointerleave');
  f.audio[0].end(); f.advance(700);
  assert.equal(f.audio.length, 2, 'ordinary leave really retains and repeats the source cue');
  await f.operation.play();
  assert.equal(f.audio.filter(a => a.src.includes('easel-1029.wav') && !a.paused).length, 0);
  f.event('pointerenter'); await f.flush();
  f.finish();
  assert.equal(f.commits, 1); assert.equal(f.operation.busy, false);
  const count = f.audio.length; f.finish(); assert.equal(f.audio.length, count, 'no recurring bubble callbacks');
  assert.ok(f.audio.some(a => a.src.endsWith('water-cleaner-7433.wav')));
  assert.ok(f.audio.every(a => a.paused));
  await f.hover(); assert.equal(f.audio.length, count + 1, 'fresh hover regains source cue');
});

for (const mode of ['cancel', 'settle', 'begin', 'composite', 'commit', 'pagehide', 'hidden', 'dispose']) test(`clear ${mode} releases rollover ownership without restarting it`, async t => {
  const f = fixture(t, { fail: mode }); await f.hover();
  await f.operation.play();
  if (mode === 'cancel') f.operation.cancel('escape');
  else if (mode === 'pagehide') f.view.dispatchEvent(new Event('pagehide'));
  else if (mode === 'hidden') { f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); f.doc.hidden = false; }
  else if (mode === 'dispose') f.operation.dispose();
  else f.finish();
  assert.equal(f.operation.busy, false);
  const count = f.audio.length; f.finish(); assert.equal(f.audio.length, count);
  assert.ok(f.audio.every(a => a.paused));
  await f.hover(); assert.equal(f.audio.length, count + 1);
});

test('pending decode, cancellation and rapid repeat cannot resurrect a suspended actor', async t => {
  const f = fixture(t, { delayed: true });
  f.event('pointerenter'); const first = f.operation.play();
  await f.flush(); assert.equal(await f.operation.play(), false);
  f.operation.cancel('escape'); const second = f.operation.play();
  f.resolveManifest(); await Promise.all([first, second]);
  f.finish(); assert.equal(f.commits, 1, JSON.stringify({ busy: f.operation.busy, frames: f.frames.size, audio: f.audio.map(a => a.src) }));
  assert.equal(f.audio.filter(a => a.src.includes('easel-1029.wav')).length, 0);
  await f.hover(); assert.equal(f.audio.filter(a => a.src.includes('easel-1029.wav')).length, 1);
});


test('clear preserves unrelated playback and nested suspensions release only once', async t => {
  const f = fixture(t); await f.hover();
  const unrelated = new f.view.Audio('picture-track.wav'); await unrelated.play();
  const release = f.rollovers.suspend('firehose');
  await f.operation.play();
  assert.equal(unrelated.paused, false, 'activation only stops its owned actor');
  f.operation.cancel('escape');
  await f.hover(); assert.equal(f.audio.filter(a => a.src.includes('easel-1029.wav')).length, 1);
  release(); release();
  await f.hover(); assert.equal(f.audio.filter(a => a.src.includes('easel-1029.wav')).length, 2);
  f.rollovers(); assert.equal(unrelated.paused, false, 'controller disposal leaves unrelated audio alone');
});

test('refused sound cannot strand clear or duplicate the wipe player', async t => {
  const f = fixture(t, { refused: true }); await f.hover();
  await f.operation.play(); await f.flush(); f.finish();
  assert.equal(f.commits, 1); assert.equal(f.operation.busy, false);
  assert.equal(f.audio.filter(a => a.src.includes('water-cleaner-7433.wav')).length, 1);
  const count = f.audio.length; f.finish(); assert.equal(f.audio.length, count);
  await f.hover(); assert.equal(f.audio.length, count + 1);
});
