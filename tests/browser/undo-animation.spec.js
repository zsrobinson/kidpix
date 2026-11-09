import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

// Pinned directly from installer Data/Easel.MHK; see docs/audits/undo-guy.md.
// Each digest covers concatenated straight RGBA bytes in authored draw order.
const source = [
  {"script":1094,"ticks":[0],"sound":null,"rgba":"f38002e64ab95545b9b173c429cacec9152bc50763b8f74bb427c611ccf8c309"},
  {"script":1095,"ticks":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,1,1,1,1,1,1,2,4,2,1,1,0],"sound":{"tick":1,"sound":1008,"channel":1},"rgba":"2149617a23f78b817cef2a08ec1ca822d1e8b43fa02151d16fea3821f20c96aa"},
  {"script":1096,"ticks":[1,1,1,1,1,1,1,1,1,4,1,1,0],"sound":{"tick":2,"sound":1009,"channel":1},"rgba":"a88007c35fd0fa7bd375bd468ae31de4a776c41b3070be6ac1e23aca59194670"},
  {"script":1097,"ticks":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,0],"sound":{"tick":1,"sound":1010,"channel":1},"rgba":"348bc17dcd0a6b256d2eb7fcbdeadda3259b5db0d568da3f9a135f3968219e58"},
  {"script":1098,"ticks":[1,1,1,1,1,1,2,1,1,0],"sound":{"tick":0,"sound":1011,"channel":1},"rgba":"048b49f65d6bbd9a311948339db36d4928771a40ddc85512e3bba2b9811af549"},
  {"script":1099,"ticks":[1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,1,0],"sound":{"tick":0,"sound":1012,"channel":1},"rgba":"37f3ea8d1a40ea27f33640c1fcc61c63690d746a324e901a5cf8d35f615089e9"},
  {"script":1100,"ticks":[1,1,1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1013,"channel":1},"rgba":"a7e6a6fc9d44dab873223d604b99d54f271bc657279b0c27b1e5a5c4ef8a6f59"},
  {"script":1101,"ticks":[1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1014,"channel":1},"rgba":"6f930eed9450bccd4a8b8e980dce83fc5a2adfa2a24d117dd4a74d56545439dc"},
  {"script":1102,"ticks":[1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1015,"channel":1},"rgba":"998cc11552a32f2deb5440212818fb7a574360da2d06ff1dea95086a53a836ce"},
  {"script":1103,"ticks":[1,1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1016,"channel":1},"rgba":"f25f47e1540885c40b817a70e750a55ff9c19c3bdd558b471f0ad7427aa0f780"},
  {"script":1104,"ticks":[1,1,1,1,1,1,1,4,1,1],"sound":{"tick":2,"sound":1017,"channel":1},"rgba":"e9fc80e6567fb569b3a02fb942fdfe1506a99b2fd05b4239481610c0fa9b94ea"},
  {"script":1105,"ticks":[1,1,1,1,1,2,1,1,0],"sound":{"tick":1,"sound":1018,"channel":1},"rgba":"6ec23664a456643120c0664850ab8495507bc981660486a36d714391dd993b96"},
  {"script":1106,"ticks":[1,1,1,1,1,1,1,1,1,2,1,1,0],"sound":{"tick":0,"sound":1019,"channel":1},"rgba":"097f069fb6a42547d29d8fca8b41ec2abb10b0b286942636e130572467d8cf14"},
  {"script":1107,"ticks":[1,1,1,1,1,1,1,1,1,0],"sound":{"tick":3,"sound":1020,"channel":1},"rgba":"f12a93b19bee99f65517824c031ccb6ff97a5528ef85bd0f84ce750cb5b27661"},
  {"script":1108,"ticks":[1,1,1,1,1,1,1,1,2,1,2,1,1,1],"sound":{"tick":2,"sound":1021,"channel":1},"rgba":"e145f3534c05667f1d10166535ba988043a4fcc64f38709158bb002396a9dcb6"},
  {"script":1109,"ticks":[1,1,1,1,1,1,1,1,1,1],"sound":{"tick":0,"sound":1022,"channel":1},"rgba":"80cf40772fa46ed0eed9b1ec59ffa115e1673817c6d142fcd15151ce8a756cc2"},
  {"script":1110,"ticks":[1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1023,"channel":1},"rgba":"5e9fd43b11c4c79e9735406da499c455c23c25be4196d62c98a6097adeb1786f"},
  {"script":1111,"ticks":[1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1024,"channel":1},"rgba":"69f0c8ffa9a8ad14a30cc5c519a14704894376b3b76c036da760937f9c5e3f74"},
  {"script":1112,"ticks":[1,1,1,1,1,1,1,1,1],"sound":{"tick":1,"sound":1025,"channel":1},"rgba":"614d69f039c5424b102a814dba4bdfd3d99fa9eb2ac3b617a8559aed191a7de4"},
  {"script":1113,"ticks":[1,1,1,1,1,1,1,1,1,1,0],"sound":{"tick":1,"sound":1026,"channel":1},"rgba":"ad00de8ac2253bd20f92c53c56a1d246f7f7ff51991579bfce70eadd19e223ee"},
  {"script":1114,"ticks":[1,1,1,1,1,1,1,1,2],"sound":{"tick":1,"sound":1027,"channel":1},"rgba":"132b3074be7f41aff76af48f0f347a45f8ea733163b957bb99b1ecf0a3712eb6"},
];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const actor = page => page.locator('#native-buttons .native-animation');
const idle = page => page.locator('#native-buttons [data-native-part="undo-face"]');
const ink = page => page.locator('#paper-canvas').evaluate(canvas => canvas.toDataURL());
const decode = bytes => PNG.sync.read(bytes);

async function activate(page, script, name = 'Undo Guy') {
  await page.evaluate(index => { Math.random = () => (index + .5) / 20; }, script - 1095);
  await button(page, name).evaluate(control => control.click());
  await expect(actor(page)).toHaveAttribute('data-script', String(script));
  await expect(actor(page)).toBeVisible();
  return page.evaluate(() => performance.now());
}

async function advanceTo(page, start, ms) {
  const now = await page.evaluate(() => performance.now());
  if (start + ms > now) await page.clock.runFor(start + ms - now);
}

async function stroke(page, y = 100) {
  const box = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.move(box.x + 100, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + y, { steps: 4 });
  await page.mouse.up();
}

async function expectComposite(page, image, expected) {
  // The screenshot includes the actual studio stacking and opaque source pixels.
  const shot = decode(await image.screenshot({ animations: 'allow' }));
  expect([shot.width, shot.height]).toEqual([56, 63]);
  let count = 0;
  const mismatch = [];
  for (let i = 0; i < expected.data.length; i += 4) {
    if (expected.data[i + 3] !== 255) continue;
    count++;
    if (!shot.data.subarray(i, i + 3).equals(expected.data.subarray(i, i + 3)) && mismatch.length < 5) mismatch.push(i / 4);
  }
  expect(count).toBeGreaterThan(500);
  expect(mismatch, 'Authored pixels remain visible in the studio composite').toEqual([]);
}

test.beforeEach(async ({ page }) => {
  page.undoErrors = [];
  page.on('pageerror', error => page.undoErrors.push(error.message));
  await page.addInitScript(() => {
    window.undoSounds = [];
    const RealAudio = window.Audio;
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/\/easel-10(?:0[8-9]|1\d|2[0-7])\.wav(?:\?|$)/.test(String(src))) return new RealAudio(src);
        this.src = String(src); this.ended = false; this.paused = true;
        window.undoSounds.push(this);
      }
      play() { this.paused = false; this.started = performance.now(); return Promise.resolve(); }
      pause() { this.paused = true; }
    };
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  page.undoUi = await (await ready).json();
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(idle(page)).toBeVisible();
  await page.mouse.move(1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
});

test.afterEach(async ({ page }) => {
  expect(page.undoErrors, 'No uncaught animation errors').toEqual([]);
});

for (const evidence of source.slice(1)) {
  test(`authored Undo Guy ${evidence.script}: every pose, repeated wait, sound cue and end check`, async ({ page }) => {
    const clip = page.undoUi.undoAnimations.clips.find(item => item.script === evidence.script);
    expect(clip.rect).toEqual([58, 310, 56, 63]);
    expect(clip.tickMs).toBe(100);
    expect(clip.frames.map(frame => frame.ticks)).toEqual(evidence.ticks);
    expect(clip.sounds).toEqual([evidence.sound]);
    const images = [];
    const digest = createHash('sha256');
    for (const frame of clip.frames) {
      const response = await page.request.get(`/original/ui/${frame.image}`);
      expect(response.ok()).toBe(true);
      const image = decode(await response.body());
      images.push(image); digest.update(image.data);
    }
    expect(digest.digest('hex'), 'All compositions match the independently extracted DMG bank and REGS').toBe(evidence.rgba);
    await page.evaluate(async frames => {
      await Promise.all(frames.map(frame => { const image = new Image(); image.src = `/original/ui/${frame.image}`; return image.decode(); }));
    }, clip.frames);
    // A real history entry exercises the face command, rather than a test-only actor.
    await stroke(page);
    const start = await activate(page, evidence.script);
    await expect(idle(page)).toBeHidden();
    expect(await actor(page).boundingBox()).toEqual({ x: 58, y: 310, width: 56, height: 63 });
    let tick = 0;
    for (let index = 0; index < clip.frames.length; index++) {
      await advanceTo(page, start, tick * 100 + 20);
      await expect(actor(page)).toHaveAttribute('data-frame', String(index));
      await expect(actor(page)).toHaveAttribute('src', new RegExp(`/ui/undo/${evidence.script}-${index}\\.png(?:\\?|$)`));
      await expectComposite(page, actor(page), images[index]);
      // Sample every held update, so repeated waits cannot collapse to one frame.
      for (let held = 1; held < evidence.ticks[index]; held++) {
        await advanceTo(page, start, (tick + held) * 100 + 20);
        await expect(actor(page)).toHaveAttribute('data-frame', String(index));
      }
      tick += evidence.ticks[index];
    }
    await advanceTo(page, start, tick * 100 + 20);
    await expect(actor(page)).toBeVisible();
    await expect(actor(page)).toHaveAttribute('data-frame', String(clip.frames.length - 1));
    const sounds = await page.evaluate(() => window.undoSounds.map(audio => ({ src: audio.src, started: audio.started })));
    expect(sounds).toHaveLength(1);
    expect(sounds[0].src).toMatch(new RegExp(`easel-${evidence.sound.sound}\\.wav`));
    expect(sounds[0].started - start).toBeGreaterThanOrEqual(evidence.sound.tick * 100);
    expect(sounds[0].started - start).toBeLessThan(evidence.sound.tick * 100 + 17);
    // End the controlled channel before measuring the earliest native end check.
    // Actual speaker latency is deliberately outside this browser clock oracle.
    await page.evaluate(() => window.undoSounds.forEach(audio => { audio.ended = true; audio.dispatchEvent(new Event('ended')); }));
    await advanceTo(page, start, (tick + 1) * 100 + 20);
    await expect(actor(page)).toBeHidden();
    await expect(idle(page)).toBeVisible();
  });
}

test('idle is the complete registered script1094 composition, including its backing part', async ({ page }) => {
  const clip = page.undoUi.undoAnimations.idle;
  expect(clip.script).toBe(1094);
  expect(clip.rect).toEqual([58, 310, 56, 63]);
  const response = await page.request.get(`/original/ui/${clip.frames[0].image}`);
  const image = decode(await response.body());
  expect(createHash('sha256').update(image.data).digest('hex')).toBe(source[0].rgba);
  await expectComposite(page, idle(page), image);
});

async function helperFixture(page) {
  await page.evaluate(async clip => {
    const { createNativeAnimation } = await import('/src/native-animation.js');
    const layer = document.createElement('div'); layer.id = 'undo-helper-test';
    const idle = document.createElement('img'); layer.append(idle); document.body.append(layer);
    window.helperSounds = [];
    window.helperClip = clip;
    window.helper = createNativeAnimation(layer, idle, (sound, channel) => {
      const audio = Object.assign(new EventTarget(), { sound, channel, paused: false, ended: false, pause() { this.paused = true; } });
      window.helperSounds.push(audio); return audio;
    });
    await Promise.all(clip.frames.map(frame => { const image = new Image(); image.src = `/original/ui/${frame.image}`; return image.decode(); }));
  }, page.undoUi.undoAnimations.clips.find(clip => clip.script === 1107));
}
const helperActor = page => page.locator('#undo-helper-test .native-animation');

test('owned channel1 sound holds the terminal composition until completion, explicit stop pauses only its handle', { tag: '@module' }, async ({ page }) => {
  await helperFixture(page);
  const start = await page.evaluate(async () => { await window.helper.play(window.helperClip, 100); return performance.now(); });
  await advanceTo(page, start, 1500);
  await expect(helperActor(page)).toBeVisible();
  await expect(helperActor(page)).toHaveAttribute('data-frame', '9');
  await page.evaluate(() => { const audio = window.helperSounds[0]; audio.ended = true; audio.dispatchEvent(new Event('ended')); });
  await page.clock.runFor(120);
  await expect(helperActor(page)).toBeHidden();
  await page.evaluate(async () => { await window.helper.play(window.helperClip, 100); });
  await page.clock.runFor(350);
  await page.evaluate(() => window.helper.stop());
  expect(await page.evaluate(() => window.helperSounds.map(audio => audio.paused))).toEqual([false, true]);
  await page.clock.runFor(2000);
  await expect(helperActor(page)).toBeHidden();
});

test('stop and replacement during delayed decode cannot resurrect old poses or old sound cues', { tag: '@module' }, async ({ page }) => {
  await helperFixture(page);
  await page.evaluate(async clip => {
    const { createNativeAnimation } = await import('/src/native-animation.js');
    const decode = Image.prototype.decode;
    window.releaseUndoDecode = [];
    Image.prototype.decode = function () {
      const decoded = decode.call(this);
      if (!this.src.includes('/undo/1107-')) return decoded;
      return decoded.then(() => new Promise(resolve => window.releaseUndoDecode.push(resolve)));
    };
    const layer = document.querySelector('#undo-helper-test');
    window.helper = createNativeAnimation(layer, layer.firstChild, sound => window.helperSounds.push(sound));
    window.pendingUndoPlay = window.helper.play(window.helperClip, 100);
    window.replacementClip = clip;
  }, page.undoUi.undoAnimations.clips.find(clip => clip.script === 1098));
  await expect.poll(() => page.evaluate(() => window.releaseUndoDecode.length)).toBe(10);
  await page.evaluate(() => window.helper.stop());
  await page.evaluate(async () => { await window.helper.play(window.replacementClip, 100); window.releaseUndoDecode.forEach(resolve => resolve()); await window.pendingUndoPlay; });
  const newest = helperActor(page).last();
  await expect(newest).toHaveAttribute('data-script', '1098');
  await page.clock.runFor(400);
  await expect(newest).toHaveAttribute('data-script', '1098');
  expect(await page.evaluate(() => window.helperSounds)).toEqual([1011]);
  await page.evaluate(() => window.helper.stop());
  await page.clock.runFor(2000);
  await expect(newest).toBeHidden();
});

test('rapid face activation replaces the actor and cancels an unreached source cue', async ({ page }) => {
  await stroke(page);
  const first = await ink(page);
  const start = await activate(page, 1107); // sound at300ms
  await advanceTo(page, start, 120);
  await activate(page, 1098); // sound at0ms
  expect(await ink(page)).toBe(first);
  await page.clock.runFor(500);
  await expect(actor(page)).toHaveAttribute('data-script', '1098');
  const sounds = await page.evaluate(() => window.undoSounds.map(audio => audio.src));
  expect(sounds).toHaveLength(1);
  expect(sounds[0]).toContain('easel-1011.wav');
});

test('new edits and tool changes preserve history and do not restart an in-flight routine', async ({ page }) => {
  const blank = await ink(page);
  await stroke(page);
  const first = await ink(page);
  const start = await activate(page, 1095);
  expect(await ink(page)).toBe(blank);
  await advanceTo(page, start, 420);
  await button(page, 'Painting Tools').evaluate(control => control.click());
  await button(page, 'Drawing Tools').evaluate(control => control.click());
  await stroke(page, 150);
  const replacement = await ink(page);
  expect(replacement).not.toBe(first);
  await expect(button(page, 'Redo')).toHaveAttribute('aria-disabled', 'true');
  await expect(actor(page)).toHaveAttribute('data-script', '1095');
  await expect(actor(page)).toHaveAttribute('data-frame', '4');
  await activate(page, 1098);
  expect(await ink(page)).toBe(blank);
  await activate(page, 1099);
  expect(await ink(page)).toBe(replacement);
});

test('face toggles, independent arrows and exhausted history retain their documented semantics', async ({ page }) => {
  const blank = await ink(page);
  await stroke(page, 100); const first = await ink(page);
  await stroke(page, 150); const second = await ink(page);
  await activate(page, 1098); expect(await ink(page)).toBe(first);
  await activate(page, 1099); expect(await ink(page)).toBe(second);
  await button(page, 'Undo').evaluate(control => control.click()); expect(await ink(page)).toBe(first);
  await button(page, 'Undo').evaluate(control => control.click()); expect(await ink(page)).toBe(blank);
  await expect(button(page, 'Undo')).toHaveAttribute('aria-disabled', 'true');
  await button(page, 'Undo').evaluate(control => control.click()); expect(await ink(page)).toBe(blank);
  await button(page, 'Redo').evaluate(control => control.click()); expect(await ink(page)).toBe(first);
  await activate(page, 1098); expect(await ink(page)).toBe(blank);
  await activate(page, 1099); expect(await ink(page)).toBe(first);
});

test('replacement pauses its playing cue and a stale ended event cannot finish the new owner', { tag: '@module' }, async ({ page }) => {
  await helperFixture(page);
  await page.evaluate(async () => { await window.helper.play(window.helperClip, 100); });
  await page.clock.runFor(350);
  await page.evaluate(async () => { await window.helper.play(window.helperClip, 100); });
  await page.clock.runFor(350);
  expect(await page.evaluate(() => window.helperSounds.map(audio => audio.paused))).toEqual([true, false]);
  await page.evaluate(() => window.helperSounds[0].dispatchEvent(new Event('ended')));
  await page.clock.runFor(1500);
  await expect(helperActor(page)).toBeVisible();
  // A failed or rejected playback must release the completion gate as well.
  await page.evaluate(() => window.helperSounds[1].dispatchEvent(new Event('error')));
  await page.clock.runFor(120);
  await expect(helperActor(page)).toBeHidden();
});

test('failed first decode keeps idle visible and a later activation can retry', { tag: '@module' }, async ({ page }) => {
  await helperFixture(page);
  await page.evaluate(async () => {
    const decode = Image.prototype.decode;
    let fail = true;
    Image.prototype.decode = function () {
      if (fail && this.src.includes('/undo/1107-0.')) { fail = false; return Promise.reject(new Error('test decode failure')); }
      return decode.call(this);
    };
    await window.helper.play(window.helperClip, 100);
  });
  await expect(helperActor(page)).toBeHidden();
  expect(await page.evaluate(() => document.querySelector('#undo-helper-test').firstChild.hidden)).toBe(false);
  expect(await page.evaluate(() => window.helperSounds.length)).toBe(0);
  await page.evaluate(async () => { await window.helper.play(window.helperClip, 100); });
  await expect(helperActor(page)).toBeVisible();
  await page.clock.runFor(350);
  expect(await page.evaluate(() => window.helperSounds.map(audio => audio.sound))).toEqual([1020]);
});

for (const [random, script] of [[.04, 1096], [.96, 1113]]) {
  test(`source rounded selection and redo dispatch: ${random}`, async ({ page }) => {
    await stroke(page);
    await button(page, 'Undo').evaluate(control => control.click());
    await page.evaluate(value => { Math.random = () => value; }, random);
    await button(page, 'Redo').evaluate(control => control.click());
    await expect(actor(page)).toHaveAttribute('data-script', String(script));
    await expect(actor(page)).toBeVisible();
  });
}
