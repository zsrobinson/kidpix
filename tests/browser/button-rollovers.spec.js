import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const backgrounds = page => page.getByRole('button', { name: 'Backgrounds', exact: true });
const rollover = page => page.locator('#native-buttons [data-native-rollover="backgrounds"]');
const underlying = page => page.locator('#native-buttons [data-native-library-motion="backgrounds"]');

async function reloadRolloverPage(page, options) {
  for (const request of page.rolloverPendingRequests) page.rolloverOutgoingRequests.add(request);
  return page.reload(options);
}

test.beforeEach(async ({ page }) => {
  page.rolloverErrors = [];
  page.rolloverPendingRequests = new Set();
  page.rolloverOutgoingRequests = new WeakSet();
  page.on('request', request => page.rolloverPendingRequests.add(request));
  page.on('requestfinished', request => page.rolloverPendingRequests.delete(request));
  page.on('pageerror', error => page.rolloverErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) page.rolloverErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    page.rolloverPendingRequests.delete(request);
    const error = request.failure()?.errorText;
    // WebKit reports an intentional reload abort differently from Chromium.
    // Only requests already pending in the outgoing document qualify here.
    const outgoingCancelled = error === 'Load request cancelled' && page.rolloverOutgoingRequests.has(request);
    if (error !== 'net::ERR_ABORTED' && !outgoingCancelled) page.rolloverErrors.push(`${error} ${request.url()}`);
  });
  // Hold only Firehose's source cue open so native channel-completion gating is
  // deterministic. Other application audio continues to use real browser media.
  await page.addInitScript(() => {
    const RealAudio = window.Audio;
    window.firehoseAudio = [];
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/easel-1029\.wav(?:\?|$)|rollover-unrelated\.wav$/.test(String(src))) return new RealAudio(src);
        this.src = String(src);
        this.paused = true;
        this.pauseCalls = 0;
        this.plays = 0;
        window.firehoseAudio.push(this);
      }
      play() { this.paused = false; this.plays++; return Promise.resolve(); }
      pause() { this.paused = true; this.pauseCalls++; }
      finish(type = 'ended') { this.paused = true; this.dispatchEvent(new Event(type)); }
    };
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  const response = await ready;
  page.nativeUi = await response.json();
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(rollover(page)).toHaveCount(1);
  await expect(backgrounds(page)).toHaveAttribute('aria-pressed', 'false');
  // Decode before pausing the clock or measuring source frames.
  const record = page.nativeUi.buttonAnimations.buttons.find(button => button.name === 'backgrounds');
  page.rolloverClip = page.nativeUi.buttonAnimations.scripts[String(record.rolloverScript)];
  await page.evaluate(async frames => {
    await Promise.all(frames.map(frame => {
      const image = new Image();
      image.src = `original/ui/${frame.image}`;
      return image.decode();
    }));
  }, page.rolloverClip.frames);
  await page.mouse.move(1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
});

test.afterEach(async ({ page }) => {
  expect(page.rolloverErrors, 'Browser errors and missing native assets').toEqual([]);
});

async function moveInside(page, fraction = .5) {
  const bounds = await backgrounds(page).boundingBox();
  await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height * .5);
}

test('actual Backgrounds control uses word-10 script 1002, preserves progress inside, repeats and cancels on leave', async ({ page }) => {
  const image = rollover(page);
  expect(page.rolloverClip.script).toBe(1002);
  expect(page.rolloverClip.tickMs).toBe(100);
  await moveInside(page);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('data-script', '1002');
  await expect(image).toHaveAttribute('data-frame', '0');
  await expect(underlying(page)).toBeHidden();
  const bounds = await image.boundingBox();
  expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual(page.rolloverClip.rect);
  await page.clock.runFor(120);
  await expect(image).toHaveAttribute('data-frame', '1');
  await moveInside(page, .6);
  await expect(image).toHaveAttribute('data-frame', '1');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '2');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '3');
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '0');
  await page.mouse.move(1023, 767);
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
  const idlePath = await underlying(page).getAttribute('src');
  expect(new URL(idlePath, page.url()).pathname).toContain('/button-animations/1000-2.png');
  await page.clock.runFor(1000);
  await expect(image).toBeHidden();
});

test('actual Backgrounds press cancels rollover and selected or disabled controls suppress it', async ({ page }) => {
  const control = backgrounds(page);
  const image = rollover(page);
  await moveInside(page);
  await expect(image).toBeVisible();
  await page.mouse.down();
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(1023, 767);
  await moveInside(page);
  await page.clock.runFor(500);
  await expect(image).toBeHidden();
  await expect(underlying(page)).toBeVisible();

  const drawing = page.getByRole('button', { name: 'Drawing Tools', exact: true });
  const drawBounds = await drawing.boundingBox();
  await page.mouse.click(drawBounds.x + drawBounds.width / 2, drawBounds.y + drawBounds.height / 2);
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  // Backgrounds has no normal disabled application state. Exercise this real
  // control's accessibility state and its native binding observer directly.
  await control.evaluate(element => element.setAttribute('aria-disabled', 'true'));
  await moveInside(page);
  await page.clock.runFor(500);
  await expect(image).toBeHidden();
  await expect(page.locator('[data-native-part="backgrounds"]')).toBeVisible();
  await page.mouse.move(1023, 767);
  await control.evaluate(element => element.setAttribute('aria-disabled', 'false'));
  await moveInside(page);
  await expect(image).toBeVisible();
  await control.evaluate(element => element.setAttribute('aria-disabled', 'true'));
  await expect(image).toBeHidden();
  await expect(page.locator('[data-native-part="backgrounds"]')).toBeVisible();
});

const firehose = page => page.getByRole('button', { name: 'Firehose Screen Eraser', exact: true });
const firehoseRollover = page => page.locator('#native-buttons [data-native-rollover="firehose"]');

async function enterFirehose(page) {
  // Upper authored rectangle, outside the rectangle-union's excluded whitespace.
  await page.mouse.move(950, 340);
  await expect(firehoseRollover(page)).toBeVisible();
}

test('Firehose retains its source actor after ordinary leave and reentry replaces it', async ({ page }) => {
  const record = page.nativeUi.buttonAnimations.buttons.find(button => button.name === 'firehose');
  expect(record.rolloverParameters).toEqual([1, 294, 0]);
  expect(record.rolloverCancelsOnLeave).toBe(false);
  const image = firehoseRollover(page);
  await enterFirehose(page);
  await page.clock.runFor(220);
  await expect(image).toHaveAttribute('data-frame', '2');
  await page.mouse.move(920, 340);
  await expect(image).toBeVisible();
  await page.clock.runFor(100);
  await expect(image).toHaveAttribute('data-frame', '3');
  // Verify the actual studio composite against the independently fetched source
  // frame, including opaque pixels that overlap the painting surface.
  await image.evaluate(element => element.decode());
  const source = PNG.sync.read(await (await page.request.get(await image.getAttribute('src'))).body());
  const composite = PNG.sync.read(await page.locator('#studio').screenshot());
  const [left, top] = page.nativeUi.buttonAnimations.scripts['1091'].rect;
  let opaque = 0, mismatches = 0;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const from = (y * source.width + x) * 4;
    if (source.data[from + 3] !== 255) continue;
    opaque++;
    const to = ((top + y) * composite.width + left + x) * 4;
    if (!source.data.subarray(from, from + 3).equals(composite.data.subarray(to, to + 3))) mismatches++;
  }
  expect(opaque).toBeGreaterThan(1000);
  expect(mismatches, 'Authored opaque Firehose pixels remain visible above the real studio').toBe(0);
  await enterFirehose(page);
  await expect(image).toHaveAttribute('data-frame', '0');
});

const audioState = page => page.evaluate(() => window.firehoseAudio.map(audio => ({
  src: audio.src, paused: audio.paused, pauseCalls: audio.pauseCalls, plays: audio.plays,
})));

test('Firehose audio survives leave, gates repeat, and reentry/forced cleanup stop only its owned cue', async ({ page }) => {
  const image = firehoseRollover(page);
  await enterFirehose(page);
  expect(await audioState(page)).toMatchObject([{ paused: false, plays: 1, pauseCalls: 0 }]);
  expect((await audioState(page))[0].src).toContain('/ui/easel-1029.wav');
  const cue = await page.request.get((await audioState(page))[0].src);
  expect(cue.ok(), 'The controlled cue references a shipped native audio asset').toBe(true);
  const wav = await cue.body();
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');
  await page.mouse.move(920, 340);
  await page.clock.runFor(800);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('data-frame', '5');
  expect(await audioState(page)).toMatchObject([{ paused: false, pauseCalls: 0 }]);
  await page.evaluate(() => window.firehoseAudio[0].finish());
  await page.clock.runFor(112);
  await expect(image).toHaveAttribute('data-frame', '0');
  expect(await audioState(page)).toHaveLength(2);
  await enterFirehose(page);
  await expect(image).toHaveAttribute('data-frame', '0');
  expect(await audioState(page)).toMatchObject([{ paused: true }, { paused: true, pauseCalls: 1 }, { paused: false }]);
  await page.evaluate(() => new Audio('rollover-unrelated.wav').play());
  await page.mouse.move(920, 340);
  await firehose(page).evaluate(control => control.setAttribute('aria-disabled', 'true'));
  await expect(image).toBeHidden();
  expect(await audioState(page)).toMatchObject([{ paused: true }, { paused: true }, { paused: true, pauseCalls: 1 }, { paused: false }]);
  await firehose(page).evaluate(control => control.setAttribute('aria-disabled', 'false'));
  await enterFirehose(page);
  // A late completion from the replaced actor cannot clear this actor's sound.
  await page.evaluate(() => window.firehoseAudio[1].finish());
  await page.clock.runFor(800);
  await expect(image).toHaveAttribute('data-frame', '5');
  expect(await audioState(page)).toHaveLength(5);
  await firehose(page).dispatchEvent('pointercancel');
  await expect(image).toBeHidden();
  expect((await audioState(page))[4]).toMatchObject({ paused: true, pauseCalls: 1 });
  expect((await audioState(page))[3]).toMatchObject({ paused: false, pauseCalls: 0 });
});

test('Firehose tracking and group-zero ownership persist until browser deactivation', async ({ page }) => {
  const image = firehoseRollover(page);
  await enterFirehose(page);
  await page.mouse.down();
  await page.clock.runFor(220);
  await expect(image).toHaveAttribute('data-frame', '2');
  await expect(image).toBeVisible();
  await page.mouse.move(920, 340);
  await page.mouse.up(); // Release outside: do not trigger the erase command.
  await moveInside(page);
  await expect(rollover(page)).toBeVisible();
  await expect(image).toBeVisible();
  expect((await audioState(page))[0]).toMatchObject({ paused: false });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(image).toBeHidden();
  await expect(rollover(page)).toBeHidden();
  await expect(page.locator('#native-buttons [data-native-part="firehose"]')).toBeVisible();
  expect((await audioState(page))[0]).toMatchObject({ paused: true, pauseCalls: 1 });
  await page.clock.runFor(1000);
  await expect(image).toBeHidden();
  await page.mouse.move(920, 340);
  await enterFirehose(page);
  await expect(image).toHaveAttribute('data-frame', '0');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(image).toBeHidden();
  expect((await audioState(page))[1]).toMatchObject({ paused: true, pauseCalls: 1 });
});

test('native nonzero-group transition forces cleanup of a retained peer after leave', async ({ page }) => {
  // Resource Firehose is group 0 (covered above). This focused manifest fixture
  // puts its exceptional leave policy into Backgrounds' group to exercise the
  // shared native peer-cleanup rule without claiming a different source record.
  await page.route('**/original/ui/ui.json*', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.buttonAnimations.buttons.find(button => button.name === 'firehose').group = 1;
    await route.fulfill({ response, json: body });
  });
  await reloadRolloverPage(page);
  await expect(firehoseRollover(page)).toHaveCount(1);
  await enterFirehose(page);
  await page.mouse.move(920, 340);
  await expect(firehoseRollover(page)).toBeVisible();
  await moveInside(page);
  await expect(rollover(page)).toBeVisible();
  await expect(firehoseRollover(page)).toBeHidden();
  expect((await audioState(page))[0]).toMatchObject({ paused: true, pauseCalls: 1 });
});

for (const forceCleanup of [false, true]) {
  test(`pending Firehose image decode ${forceCleanup ? 'cannot resurrect after forced cleanup' : 'survives ordinary leave'}`, async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/original/ui/button-animations/1091-*.png*', async route => {
      await gate;
      await route.continue();
    });
    try {
      await reloadRolloverPage(page, { waitUntil: 'domcontentloaded' });
      await expect(firehoseRollover(page)).toHaveCount(1);
      // Reload replays the paused clock with a performance origin determined by
      // setup's real elapsed time. Align before entry to Playwright's 16 ms RAF
      // grid: otherwise runFor(112) can deliver its last frame only 97 ms after
      // the actor starts, short of the authored 100 ms source tick.
      const now = await page.evaluate(() => performance.now());
      await page.clock.runFor((16 - now % 16) % 16);
      await page.mouse.move(950, 340);
      await page.mouse.move(920, 340);
      await expect(firehoseRollover(page)).toBeHidden();
      if (forceCleanup) await firehose(page).evaluate(control => control.setAttribute('aria-disabled', 'true'));
      release();
      const clip = page.nativeUi.buttonAnimations.scripts['1091'];
      await page.evaluate(async frames => {
        await Promise.all(frames.map(frame => {
          const image = new Image();
          image.src = `original/ui/${frame.image}`;
          return image.decode();
        }));
      }, clip.frames);
      if (forceCleanup) {
        await page.clock.runFor(800);
        await expect(firehoseRollover(page)).toBeHidden();
        expect(await audioState(page)).toHaveLength(0);
      } else {
        await expect(firehoseRollover(page)).toBeVisible();
        await expect(firehoseRollover(page)).toHaveAttribute('data-frame', '0');
        await page.clock.runFor(112);
        await expect(firehoseRollover(page)).toHaveAttribute('data-frame', '1');
        expect((await audioState(page))[0]).toMatchObject({ paused: false });
      }
    } finally {
      release();
    }
  });
}

test('opening Slide Show releases retained Easel rollover ownership', async ({ page }) => {
  await page.mouse.move(950, 340);
  await expect(firehoseRollover(page)).toBeVisible();
  await page.mouse.move(920, 340);
  await expect(firehoseRollover(page)).toBeVisible();
  await page.getByRole('button', { name: 'Go to Slide Show', exact: true }).evaluate(control => control.click());
  await expect(page.locator('#slides')).toBeVisible();
  await expect(firehoseRollover(page)).toBeHidden();
  expect((await audioState(page))[0]).toMatchObject({ paused: true, pauseCalls: 1 });
});
