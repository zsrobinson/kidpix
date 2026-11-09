import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const control = page => button(page, 'Paper Texture Canister');
const actor = page => page.locator('canvas.native-paper-canister');
const picker = page => page.locator('#paper-picker');
const decode = data => PNG.sync.read(Buffer.from(data.split(',')[1], 'base64'));

// Independent source-image oracle: never import the application's substitution,
// registration or compositing helpers. Exported coordinates already contain REGS.
function sourceFrame(page, frame, selected = 12300, opening = true) {
  const { paper, sprites } = page.paperSource;
  const rgba = new Float64Array(1024 * 768 * 4);
  const exact = new Uint8Array(1024 * 768);
  const index = selected - 12300;
  const [cx, cy, cw, ch] = opening ? paper.clipRect : [0, 0, 1024, 768];
  for (const [partIndex, part] of frame.parts.entries()) {
    const id = opening && partIndex === 0 ? paper.pageSprites[Math.floor(index / 7)]
      : partIndex === (opening ? 2 : 1) ? paper.textureSprites[index] : part.sprite;
    const image = sprites.get(id);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const dx = part.x + x, dy = part.y + y;
      if (dx < cx || dy < cy || dx >= cx + cw || dy >= cy + ch || dx < 0 || dy < 0 || dx >= 1024 || dy >= 768) continue;
      const from = (y * image.width + x) * 4;
      const alpha = image.data[from + 3] / 255;
      if (!alpha) continue;
      const to = (dy * 1024 + dx) * 4;
      for (let channel = 0; channel < 3; channel++) rgba[to + channel] = image.data[from + channel] * alpha + rgba[to + channel] * (1 - alpha);
      rgba[to + 3] = image.data[from + 3] + rgba[to + 3] * (1 - alpha);
      exact[to / 4] = alpha === 1 ? 1 : 0;
    }
  }
  return { rgba, exact };
}

async function expectFrame(page, frame, selected = 12300, opening = true) {
  const expected = sourceFrame(page, frame, selected, opening);
  const actual = decode(await actor(page).evaluate(canvas => canvas.toDataURL()));
  expect([actual.width, actual.height]).toEqual([1024, 768]);
  const mismatch = { opaque: [], edge: [], blank: [] };
  let opaque = 0;
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    const alpha = actual.data[offset + 3];
    const targetAlpha = expected.rgba[offset + 3];
    const kind = expected.exact[offset / 4] ? 'opaque' : targetAlpha ? 'edge' : 'blank';
    if (kind === 'opaque') opaque++;
    const differences = [Math.abs(alpha - targetAlpha)];
    for (let channel = 0; channel < 3; channel++) {
      differences.push(Math.abs((kind === 'opaque' ? actual.data[offset + channel] : actual.data[offset + channel] * alpha / 255) - expected.rgba[offset + channel]));
    }
    // PNG straight-alpha to Canvas premultiplication can round edge channels.
    // Authored opaque pixels and all blank space must remain exact.
    if (Math.max(...differences) > (kind === 'edge' ? 2 : 0) && mismatch[kind].length < 8) {
      mismatch[kind].push({ x: offset / 4 % 1024, y: Math.floor(offset / 4 / 1024), actual: [...actual.data.subarray(offset, offset + 4)], expected: [...expected.rgba.subarray(offset, offset + 4)] });
    }
  }
  expect(opaque, 'Comparison contains visible authored artwork').toBeGreaterThan(3000);
  expect(mismatch, 'Every actor pixel follows source parts, registration, selected substitutions and clipping').toEqual({ opaque: [], edge: [], blank: [] });
  return expected;
}

test.beforeEach(async ({ page }) => {
  page.paperErrors = [];
  page.on('pageerror', error => page.paperErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) page.paperErrors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') page.paperErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.addInitScript(() => {
    const RealAudio = window.Audio;
    window.paperSounds = [];
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/\/ui\/easel-1006\.wav(?:\?|$)/.test(String(src))) return new RealAudio(src);
        this.src = String(src); this.paused = true; this.plays = 0;
        window.paperSounds.push(this);
      }
      play() { this.paused = false; this.plays++; return Promise.resolve(); }
      pause() { this.paused = true; }
    };
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/original/ui/ui.json') && response.ok());
  await page.goto('/');
  const ui = await (await ready).json();
  expect(ui.paperAnimations, 'Verified native paper export is integrated').toBeTruthy();
  page.paperSource = { paper: ui.paperAnimations, sprites: new Map(), ui };
  for (const [id, sprite] of Object.entries(ui.paperAnimations.sprites)) {
    const response = await page.request.get(`/original/ui/${sprite.image}`);
    expect(response.ok()).toBe(true);
    page.paperSource.sprites.set(Number(id), PNG.sync.read(await response.body()));
  }
  await expect(actor(page)).toBeVisible();
  await expect(actor(page)).toHaveAttribute('data-script', '1052');
  await page.mouse.move(1023, 767);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
});
test.afterEach(async ({ page }) => { expect(page.paperErrors, 'Browser errors and missing paper assets').toEqual([]); });

async function open(page) {
  await control(page).click();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'opening');
  await expect(actor(page)).toHaveAttribute('data-script', '1055');
}
async function finish(page) {
  await page.clock.runFor(608);
  await expect(control(page)).toHaveAttribute('data-paper-state', 'open');
  await expect(picker(page)).toBeVisible();
}

async function delayTexture(page, id) {
  await page.evaluate(id => {
    const BaseImage = window.Image;
    window.slowPaperLoaded = false;
    window.Image = class extends BaseImage {
      constructor(...args) {
        super(...args);
        this.addEventListener('load', () => {
          if (new URL(this.src, document.baseURI).pathname.endsWith(`/paper/${id}.png`)) window.slowPaperLoaded = true;
        });
      }
    };
  }, id);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = 0;
  await page.route(url => url.pathname.endsWith(`/original/tools/paper/${id}.png`), async route => {
    requested++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  return { release, requested: () => requested,
    loaded: () => expect.poll(() => page.evaluate(() => window.slowPaperLoaded)).toBe(true) };
}

test('an out-of-order canceled texture cannot replace the current selection or close a newly opened picker', async ({ page }) => {
  const delayed = await delayTexture(page, 12301);
  await open(page);
  await finish(page);
  await button(page, 'Paper texture 1').click();
  await expect.poll(delayed.requested).toBe(1);
  await button(page, 'Paper texture 2').click();
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12302');
  await open(page);
  delayed.release();
  await delayed.loaded();
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12302');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'opening');
  await finish(page);
  await expect(button(page, 'Paper texture 2')).toHaveAttribute('aria-pressed', 'true');
});

test('undo invalidates a pending texture choice without a stale canister or popup update', async ({ page }) => {
  const delayed = await delayTexture(page, 12301);
  await open(page);
  await finish(page);
  await button(page, 'Paper texture 2').click();
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12302');
  await open(page);
  await finish(page);
  await button(page, 'Paper texture 1').click();
  await expect.poll(delayed.requested).toBe(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12300');
  delayed.release();
  await delayed.loaded();
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12300');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await open(page);
  await finish(page);
  await expect(button(page, 'Smooth Paper')).toHaveAttribute('aria-pressed', 'true');
});

test('fallback texture rows remain usable through persistent animation decode failure', async ({ page }) => {
  const pages = new Set(page.paperSource.paper.pageSprites.map(id => `/original/ui/${page.paperSource.paper.sprites[String(id)].image}`));
  let requested = 0;
  await page.route(url => pages.has(url.pathname), async route => {
    requested++;
    await route.fulfill({ body: Buffer.from('invalid page fixture'), contentType: 'image/png' });
  });
  await control(page).click();
  await expect(page.getByRole('status')).toHaveText('Could not load the paper animation.');
  await expect(button(page, 'Smooth Paper')).toBeVisible();
  await button(page, 'Next texture row').click();
  await expect(button(page, 'Paper texture 7')).toBeVisible();
  await button(page, 'Next texture row').click();
  await expect(button(page, 'Paper texture 16')).toBeVisible();
  await button(page, 'Previous texture row').click();
  await expect(button(page, 'Paper texture 7')).toBeVisible();
  await button(page, 'Next texture row').click();
  expect(requested, 'Live row changes do not retry the failed opening').toBe(1);
  await button(page, 'Paper texture 16').click();
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12316');
  await control(page).click();
  await expect(button(page, 'Paper texture 16')).toBeVisible();
  await button(page, 'Previous texture row').click();
  await expect(button(page, 'Paper texture 7')).toBeVisible();
  expect(requested).toBe(2);
});

test('authored six opening frames match source pixels and cover paint before controls become live', async ({ page }) => {
  const { paper } = page.paperSource;
  expect([paper.script, paper.tickMs, paper.endCheckTick, paper.frames.length]).toEqual([1055, 100, 6, 6]);
  await open(page);
  await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(picker(page)).toBeHidden();
  await expectFrame(page, paper.frames[0]);
  let elapsed = 0;
  for (const [index, time] of [112, 208, 304, 400, 512].entries()) {
    await page.clock.runFor(time - elapsed);
    elapsed = time;
    await expect(actor(page)).toHaveAttribute('data-frame', String(index + 1));
    const expected = await expectFrame(page, paper.frames[index + 1]);
    await expect(picker(page)).toBeHidden();
    if (index === 1) {
      // The sheet passes over the opaque white drawing surface. Testing only
      // its own canvas would miss a wrong stacking order underneath #surface.
      const composite = PNG.sync.read(await page.locator('#studio').screenshot());
      const checked = [];
      for (let y = 545; y < 606; y += 7) for (let x = 650; x < 875; x += 11) {
        const offset = (y * 1024 + x) * 4;
        if (expected.exact[offset / 4] && expected.rgba[offset] < 240) {
          expect([...composite.data.subarray(offset, offset + 4)], `Visible sheet at ${x},${y}`).toEqual([...expected.rgba.subarray(offset, offset + 4)]);
          checked.push([x, y]);
        }
      }
      expect(checked.length, 'Actual studio composite includes opaque moving sheet pixels').toBeGreaterThan(10);
    }
  }
  await page.clock.runFor(599 - elapsed);
  await expect(control(page)).toHaveAttribute('data-paper-state', 'opening');
  await expect(picker(page)).toBeHidden();
  await page.clock.runFor(9);
  await expect(control(page)).toHaveAttribute('data-paper-state', 'open');
  await expect(button(page, 'Smooth Paper')).toBeVisible();
});

test('closed hover and tracking use selected source art, press cue starts once and chosen texture reopens its page', async ({ page }) => {
  const { paper } = page.paperSource;
  await expectFrame(page, paper.states.rest.frames[0], 12300, false);
  await control(page).hover();
  await expect(actor(page)).toHaveAttribute('data-script', '1054');
  await expectFrame(page, paper.states.hover.frames[0], 12300, false);
  await page.clock.runFor(112);
  await expect(actor(page)).toHaveAttribute('data-frame', '1');
  await expectFrame(page, paper.states.hover.frames[1], 12300, false);
  await page.mouse.down();
  await expect(actor(page)).toHaveAttribute('data-script', '1053');
  await expectFrame(page, paper.states.tracking.frames[0], 12300, false);
  expect(await page.evaluate(() => window.paperSounds.map(sound => sound.plays))).toEqual([1]);
  await page.mouse.move(1023, 767);
  await page.mouse.up();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await expect(picker(page)).toBeHidden();
  await expect(actor(page)).toHaveAttribute('data-script', '1052');
  await open(page);
  expect(await page.evaluate(() => window.paperSounds.reduce((sum, sound) => sum + sound.plays, 0))).toBe(2);
  await finish(page);
  await button(page, 'Next texture row').click();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'open');
  await expect(button(page, 'Paper texture 7')).toBeVisible();
  await button(page, 'Next texture row').click();
  await expect(button(page, 'Paper texture 16')).toBeVisible();
  await button(page, 'Paper texture 16').click();
  await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12316');
  await expectFrame(page, paper.states.rest.frames[0], 12316, false);
  await open(page);
  await expectFrame(page, paper.frames[0], 12316);
  await finish(page);
  await expect(button(page, 'Paper texture 16')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Smooth Paper')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await expectFrame(page, paper.states.rest.frames[0], 12316, false);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12300');
  await expectFrame(page, paper.states.rest.frames[0], 12300, false);
  await open(page);
  await finish(page);
  await expect(button(page, 'Smooth Paper')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Paper texture 16')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(actor(page)).toHaveAttribute('data-selected-paper', '12316');
  await open(page);
  await expectFrame(page, paper.frames[0], 12316);
  await finish(page);
  await expect(button(page, 'Paper texture 16')).toHaveAttribute('aria-pressed', 'true');
});

test('Escape, outside press and fast reopen cancel stale animation callbacks without a ghost popup', async ({ page }) => {
  await open(page);
  await page.clock.runFor(208);
  await page.keyboard.press('Escape');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await page.clock.runFor(1000);
  await expect(picker(page)).toBeHidden();
  await open(page);
  await page.clock.runFor(112);
  await page.mouse.click(150, 300);
  await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await open(page);
  await page.clock.runFor(304);
  await expect(picker(page)).toBeHidden();
  await control(page).click();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await open(page);
  await finish(page);
  await expect(page.getByRole('group', { name: 'Paper textures', exact: true })).toHaveCount(1);
  await expect(actor(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.clock.runFor(1000);
  await expect(picker(page)).toBeHidden();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
});

test('canceling a delayed first-use page decode cannot reopen the popup and a subsequent open succeeds', async ({ page }) => {
  const path = page.paperSource.paper.sprites[String(page.paperSource.paper.pageSprites[0])].image;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = 0;
  await page.route(url => url.pathname.endsWith(`/original/ui/${path}`), async route => {
    requested++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await control(page).click();
  await expect.poll(() => requested).toBe(1);
  await expect(control(page)).toHaveAttribute('data-paper-state', 'loading');
  await page.keyboard.press('Escape');
  release();
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await page.clock.runFor(1000);
  await expect(picker(page)).toBeHidden();
  await expect(actor(page)).toHaveAttribute('data-script', '1052');
  await open(page);
  await finish(page);
  await expect(button(page, 'Smooth Paper')).toBeVisible();
});

test('a failed first-use image decode exposes a usable fallback and retries the source asset on reopen', async ({ page }) => {
  const path = page.paperSource.paper.sprites[String(page.paperSource.paper.pageSprites[0])].image;
  let requested = 0;
  await page.route(url => url.pathname.endsWith(`/original/ui/${path}`), async route => {
    if (++requested === 1) {
      await route.fulfill({ body: Buffer.from('invalid PNG fixture'), contentType: 'image/png' });
    } else await route.continue();
  });
  await control(page).click();
  await expect(page.getByRole('status')).toHaveText('Could not load the paper animation.');
  await expect(control(page)).toHaveAttribute('data-paper-state', 'closed');
  await expect(button(page, 'Smooth Paper')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker(page)).toBeHidden();
  await open(page);
  await expect.poll(() => requested).toBe(2);
  await expectFrame(page, page.paperSource.paper.frames[0]);
  await finish(page);
  await expect(button(page, 'Smooth Paper')).toBeVisible();
});
