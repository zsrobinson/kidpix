import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeMovingPaint } from '../../src/native-moving-paint.js';

function bundle(sounds = []) {
  const images = new Map([['native.png', { source: 'native' }]]);
  const frames = [
    { atMs: 0, durationMs: 100, parts: [{ frame: 0, x: 7, y: 16 }] },
    { atMs: 100, durationMs: 100, parts: [{ frame: 0, x: 17, y: 26 }] },
    { atMs: 200, durationMs: 0, parts: [{ frame: 0, x: 27, y: 36 }] },
  ];
  return {
    bank: { clipIds: [24000], frames: [{ width: 12, height: 23, image: 'native.png' }] },
    clips: { 24000: { id: 24000, firstDrawRawPosition: [10, 20], frames, sounds, durationMs: 200, minimumCompletionMs: 300 } },
    images, imageFor: path => images.get(path),
  };
}

function clock() {
  let time = 0;
  let next = 1;
  const callbacks = new Map();
  return {
    now: () => time,
    schedule: callback => { const id = next++; callbacks.set(id, callback); return id; },
    cancel: id => callbacks.delete(id),
    at(value) { time = value; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); },
    set(value) { time = value; },
    get scheduled() { return callbacks.size; },
  };
}

function audioHarness() {
  const handles = [];
  return { handles, play(cue, actor) {
    let finish;
    const handle = { cue, actorId: actor.id, stops: 0,
      finished: new Promise(resolve => { finish = resolve; }),
      finish() { finish(); }, stop() { this.stops++; finish(); },
    };
    handles.push(handle);
    return handle;
  } };
}

test('emits immediately and every150ms at the current integer point, then continues actors after release', () => {
  const time = clock();
  const commits = [];
  const controller = createNativeMovingPaint({ ...time, random: () => 0, playSound: () => null,
    onCommit: (actor, frame) => commits.push({ actor, frame, activeDuringCommit: controller.active }),
  });
  const source = bundle();
  const first = controller.begin({ x: 100.9, y: 200.8 }, source);
  assert.deepEqual(first.point, { x: 100, y: 200 });
  const calls = [];
  const context = { drawImage: (...args) => calls.push(args) };
  assert.equal(controller.drawTo(context), 1);
  assert.deepEqual(calls[0].slice(1), [97, 196, 12, 23]);
  time.at(149);
  assert.equal(controller.drawTo({ drawImage() {} }), 1);
  controller.move({ x: 300.7, y: 400.9 });
  time.at(150);
  calls.length = 0;
  assert.equal(controller.drawTo(context), 2);
  assert.deepEqual(calls[1].slice(1), [297, 396, 12, 23]);
  controller.end();
  assert.equal(controller.active, true);
  time.at(299);
  assert.equal(commits.length, 0);
  time.at(300);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].frame, source.clips[24000].frames[2]);
  assert.equal(commits[0].activeDuringCommit, true);
  time.at(450);
  assert.equal(commits.length, 2);
  assert.equal(controller.active, false);
  assert.equal(time.scheduled, 0);
});

test('finite completion waits for both owned source channels and does not stop another actor audio', async () => {
  const time = clock();
  const audio = audioHarness();
  const commits = [];
  const source = bundle([{ atMs: 0, channel: 1, src: 'one.wav' }, { atMs: 100, channel: 2, src: 'two.wav' }]);
  const controller = createNativeMovingPaint({ ...time, random: () => 0, playSound: audio.play,
    onCommit: actor => commits.push(actor.id),
  });
  const first = controller.begin({ x: 0, y: 0 }, source);
  time.at(100);
  time.at(150);
  controller.end();
  assert.equal(audio.handles.length, 3);
  audio.handles[0].finish();
  await Promise.resolve();
  time.at(300);
  assert.deepEqual(commits, []);
  audio.handles[1].finish();
  await Promise.resolve();
  time.at(301);
  assert.deepEqual(commits, [first.id]);
  assert.equal(audio.handles[2].stops, 0);
  controller.discard();
});

test('new cues replace only the same actor channel and failed sounds do not stall completion', async () => {
  const time = clock();
  const audio = audioHarness();
  const source = bundle([{ atMs: 0, channel: 1 }, { atMs: 100, channel: 1 }]);
  const controller = createNativeMovingPaint({ ...time, random: () => 0, playSound: audio.play });
  controller.begin({ x: 0, y: 0 }, source);
  controller.end();
  time.at(100);
  assert.equal(audio.handles[0].stops, 1);
  assert.equal(audio.handles[1].stops, 0);
  audio.handles[1].finish();
  await Promise.resolve();
  time.at(300);
  assert.equal(controller.active, false);

  const failed = createNativeMovingPaint({ ...time, random: () => 0, playSound: () => { throw new Error('audio unavailable'); } });
  failed.begin({ x: 0, y: 0 }, source);
  failed.end();
  time.at(600);
  assert.equal(failed.active, false);
});

test('flush commits the current authored frame while discard removes particles without a commit', async () => {
  const time = clock();
  const audio = audioHarness();
  const source = bundle([{ atMs: 0, channel: 1 }]);
  const commits = [];
  const controller = createNativeMovingPaint({ ...time, random: () => 0, playSound: audio.play,
    onCommit: (actor, frame) => commits.push(frame),
  });
  controller.begin({ x: 0, y: 0 }, source);
  time.set(120);
  assert.equal(controller.flush(), 1);
  assert.equal(commits[0], source.clips[24000].frames[1]);
  assert.equal(audio.handles[0].stops, 1);
  assert.equal(controller.active, false);
  assert.equal(time.scheduled, 0);
  await Promise.resolve();
  assert.equal(time.scheduled, 0);
  controller.begin({ x: 0, y: 0 }, source);
  assert.equal(controller.discard(), 1);
  assert.equal(commits.length, 1);
  assert.equal(audio.handles[1].stops, 1);
  await Promise.resolve();
  assert.equal(controller.active, false);
  assert.equal(time.scheduled, 0);
});

test('a delayed callback emits one current particle instead of inventing a catchup burst', () => {
  const time = clock();
  const controller = createNativeMovingPaint({ ...time, random: () => 0, playSound: () => null });
  controller.begin({ x: 0, y: 0 }, bundle());
  time.at(1000);
  assert.equal(controller.drawTo({ drawImage() {} }), 1);
  controller.discard();
});

test('captured pointers outside the canvas suppress emission without consuming a variant choice', () => {
  const time = clock();
  let choices = 0;
  const controller = createNativeMovingPaint({ ...time, random: () => { choices++; return 0; }, playSound: () => null,
    containsPoint: point => point.x >= 0 && point.y >= 0 && point.x < 720 && point.y < 542,
  });
  controller.begin({ x: 100, y: 100 }, bundle());
  controller.move({ x: -0.5, y: 100 });
  time.at(150);
  assert.equal(choices, 1);
  controller.move({ x: 800, y: 100 });
  time.at(300);
  assert.equal(choices, 1);
  controller.move({ x: 400, y: 200 });
  time.at(450);
  assert.equal(choices, 2);
  assert.equal(controller.drawTo({ drawImage() {} }), 1);
  controller.discard();
});

test('rejected owned audio finishes the channel and invalid clips do not leave emission active', async () => {
  const time = clock();
  const controller = createNativeMovingPaint({ ...time, random: () => 0,
    playSound: () => ({ finished: Promise.reject(new Error('audio failed')), stop() {} }),
  });
  const source = bundle([{ atMs: 0, channel: 1 }]);
  controller.begin({ x: 0, y: 0 }, source);
  controller.end();
  await Promise.resolve();
  time.at(300);
  assert.equal(controller.active, false);
  const invalid = bundle();
  delete invalid.clips[24000].minimumCompletionMs;
  assert.throws(() => controller.begin({ x: 0, y: 0 }, invalid), /source timing/);
  assert.equal(controller.active, false);
  assert.equal(time.scheduled, 0);
});
