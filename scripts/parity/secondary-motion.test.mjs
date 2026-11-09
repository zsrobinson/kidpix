import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { secondaryManifest, secondaryProfiles } from '../../src/native-secondary-motion.js';
import { createMode2MotionController } from '../../src/native-drawing-motion.js';

function fixture() {
  const scripts = {};
  const buttons = Array.from({ length: 9 }, (_, index) => {
    const ids = [index * 3 + 1, index * 3 + 2, 0, index * 3 + 2];
    for (const id of [ids[0], ids[1], index * 3 + 3]) scripts[id] = { script: id, collection: 18000,
      tickMs: 100, endCheckTick: 2, sounds: id === ids[1] ? [{ tick: 1, channel: 1, sound: 61 }] : [],
      frames: [{ tick: 0, parts: [{ sprite: 1, x: index * 10, y: 0 }] }, { tick: 1, parts: [{ sprite: 1, x: index * 10 + 1, y: 0 }] }] };
    return { index: index + 4, stateScripts: ids, rolloverScript: index * 3 + 3, rolloverParameters: [0, 0, 0],
      commandArgument: 0, region: { status: 'exact', type: 'rectangle-union', boundsXYWH: [index * 10, 0, 5, 5],
        rectsLTRB: [[index * 10, 0, index * 10 + 5, 5]] } };
  });
  return { tables: { 18400: { buttons } }, scripts, sprites: { '18000:1': { image: 'test.png', argb: 'test.argb', width: 5, height: 5 } }, sounds: { 61: { src: 'test.wav' } } };
}

test('secondary adapter preserves native row identity, argument, exact region and collection-qualified artwork', () => {
  const data = fixture();
  const profile = secondaryProfiles({ tray: 'draw' })[0];
  const manifest = secondaryManifest(data, profile);
  assert.equal(manifest.buttons.length, 9);
  assert.equal(manifest.buttons[0].action, 'style:line');
  assert.equal(manifest.buttons[8].action, 'style:freehand');
  assert.equal(manifest.buttons[8].index, 12);
  assert.equal(manifest.buttons[8].commandArgument, 0);
  assert.equal(manifest.buttons[8].region, data.tables[18400].buttons[8].region);
  assert.equal(manifest.scripts[1].frames[0].parts[0].sprite, '18000:1');
  assert.equal(data.scripts[1].frames[0].parts[0].sprite, 1); // Source data is never rewritten.
});

test('unrecovered slots, regions, rollover policies and missing assets fail before replacing static art', () => {
  const profile = secondaryProfiles({ tray: 'draw' })[0];
  for (const mutate of [d => { d.tables[18400].buttons[0].stateScripts[2] = 1; },
    d => { d.tables[18400].buttons[0].region.status = 'unknown'; },
    d => { d.tables[18400].buttons[0].rolloverParameters[0] = 1; },
    d => { delete d.scripts[1]; }, d => { delete d.sprites['18000:1']; }]) {
    const data = fixture(); mutate(data);
    assert.throws(() => secondaryManifest(data, profile), /Unsupported|Missing/);
  }
  assert.equal(secondaryManifest({ tables: {} }, profile), null);
});

test('nine-row source selector retains terminal sound, shared-script release, finite hover and cancellation', () => {
  const manifest = secondaryManifest(fixture(), secondaryProfiles({ tray: 'draw' })[0]);
  let ended = false, stopped = 0;
  const controller = createMode2MotionController(manifest, { selected: 8, now: () => 0,
    playSound: () => ({ isComplete: () => ended, stop() { stopped++; } }) });
  assert.equal(controller.press(8, 0), false);
  assert.equal(controller.press(0, 0), true);
  controller.step(100);
  assert.equal(controller.snapshot()[0].frameIndex, 1);
  assert.equal(controller.release(true, 110), 0);
  controller.step(200);
  assert.equal(controller.snapshot()[0].finished, false);
  ended = true; controller.step(300);
  assert.equal(controller.snapshot()[0].finished, true);
  assert.equal(controller.snapshot()[8].state, 0);
  controller.enter(1, 300); controller.step(400); controller.step(500);
  assert.equal(controller.snapshot()[1].auxiliary, false);
  controller.press(1, 500); controller.leave(1, 510);
  assert.equal(controller.snapshot()[1].state, 0);
  controller.enter(1, 520); assert.equal(controller.snapshot()[1].state, 1);
  controller.cancel(530);
  assert.equal(controller.release(true, 540), null);
  assert.equal(controller.snapshot()[1].state, 0);
  assert.ok(stopped > 0);
  controller.dispose();
});

test('owner profiles distinguish painting mode tables, eraser shape size tables and unsupported actions', () => {
  for (const [selected, table] of [['brush', 18001], ['sound', 18002], ['spray', 18003]]) {
    assert.equal(secondaryProfiles({ tray: 'paint', selected }).find(p => p.slot === 'mode').table, table);
  }
  assert.equal(secondaryProfiles({ tray: 'eraser', selected: 'round', eraserShape: 'round' }).find(p => p.slot === 'size').table, 18200);
  assert.equal(secondaryProfiles({ tray: 'eraser', selected: 'square', eraserShape: 'square' }).find(p => p.slot === 'size').table, 18201);
  assert.deepEqual(secondaryProfiles({ tray: 'eraser', selected: 'big' }), []);
  for (const tray of ['text', 'stamp', 'grab', 'bucket']) assert.deepEqual(secondaryProfiles({ tray }), []);
});

const path = new URL('../../public/original/ui/secondary-motion/manifest.json', import.meta.url);
test('exported secondary selectors preserve complete source streams, asset hashes and clean pages', { skip: !existsSync(path) }, () => {
  const data = JSON.parse(readFileSync(path));
  const inputs = [{ tray: 'draw' }, { tray: 'paint', selected: 'brush' }, { tray: 'paint', selected: 'sound' },
    { tray: 'paint', selected: 'spray' }, { tray: 'mixer' }, { tray: 'eraser', selected: 'round' },
    { tray: 'eraser', selected: 'square', eraserShape: 'square' }];
  const hash = path => createHash('sha256').update(readFileSync(new URL(`../../public/original/ui/${path}`, import.meta.url))).digest('hex');
  for (const input of inputs) for (const profile of secondaryProfiles(input)) {
    const manifest = secondaryManifest(data, profile);
    for (const sprite of Object.values(manifest.sprites)) {
      assert.equal(hash(sprite.image), sprite.pngSha256);
      assert.equal(hash(sprite.argb), sprite.argbSha256);
    }
    for (let selected = 0; selected < manifest.buttons.length; selected++) {
      const controller = createMode2MotionController(manifest, { now: () => 0 });
      assert.ok(controller.press(selected, 0));
      const clip = manifest.scripts[manifest.buttons[selected].stateScripts[1]];
      assert.equal(clip.frames.length, 2);
      for (let tick = 1; tick < clip.endCheckTick; tick++) controller.step(tick * clip.tickMs);
      assert.equal(controller.snapshot()[selected].frameIndex, 1);
      controller.release(true, clip.endCheckTick * clip.tickMs - 1);
      assert.equal(controller.snapshot()[selected].frameIndex, 1);
      controller.step(clip.endCheckTick * clip.tickMs);
      assert.equal(controller.snapshot()[selected].finished, true);
      controller.dispose();
    }
  }
  for (const backdrop of Object.values(data.backdrops)) for (const page of backdrop.pages) assert.equal(hash(page.image), page.sha256);
});
