// Deferred acceptance: do not run while the Pencil profiler owns browser access.
// No fake clock: these are fresh, decoded-page tests, not cold-network probes.
import { test, expect } from '@playwright/test';

async function loaded(page) {
  await page.addInitScript(() => {
    window.ipadProbe = { raf: { requested: 0, delivered: 0, pending: 0 }, errors: [], lifecycle: [], sounds: [] };
    const p = window.ipadProbe;
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.requestAnimationFrame = callback => {
      p.raf.requested++;
      const id = request(time => { pending.delete(id); p.raf.pending = pending.size; p.raf.delivered++; callback(time); });
      pending.add(id); p.raf.pending = pending.size; return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); p.raf.pending = pending.size; cancel(id); };
    window.addEventListener('error', e => p.errors.push(String(e.error?.stack ?? e.message)));
    window.addEventListener('unhandledrejection', e => p.errors.push(String(e.reason?.stack ?? e.reason)));
    for (const type of ['blur', 'focus', 'pagehide', 'pageshow']) window.addEventListener(type, e => p.lifecycle.push({ type, persisted: e.persisted, time: performance.now() }));
    for (const type of ['visibilitychange', 'freeze', 'resume']) document.addEventListener(type, () => p.lifecycle.push({ type, hidden: document.hidden, time: performance.now() }));
    document.addEventListener('contextlost', e => p.lifecycle.push({ type: e.type, target: e.target.dataset?.nativeToolMotion }), true);
    document.addEventListener('contextrestored', e => p.lifecycle.push({ type: e.type, target: e.target.dataset?.nativeToolMotion }), true);
    const Audio = window.Audio;
    window.Audio = function (...args) {
      const audio = new Audio(...args); const entry = { src: String(args[0]), events: [] }; p.sounds.push(entry);
      for (const type of ['playing', 'pause', 'ended', 'error', 'waiting', 'stalled', 'suspend']) audio.addEventListener(type, () => entry.events.push({ type, time: performance.now(), currentTime: audio.currentTime, paused: audio.paused, ended: audio.ended, readyState: audio.readyState }));
      return audio;
    };
  });
  await page.goto('/');
  await expect(page.locator('[data-native-tool-motion="draw"]')).toBeVisible();
}
async function hoverProgress(page) {
  await page.mouse.move(0, 0);
  // Resolve via data-action without relying on the tray container's id.
  const target = page.locator('[data-native-motion-index][data-action="tool:crayon"]');
  await expect(target).toHaveCount(1);
  await target.hover();
  const actor = page.locator('[data-native-tool-motion="draw"]');
  await expect.poll(() => actor.evaluate(c => JSON.parse(c.dataset.motionSnapshot).some(s => s.name === 'crayon' && s.auxiliary && s.frameIndex > 0))).toBe(true);
  expect(await page.evaluate(() => window.ipadProbe.errors)).toEqual([]);
}

test('fresh loaded page accepts fresh hover after delivered pagehide/pageshow cleanup', async ({ page }) => {
  await loaded(page); await hoverProgress(page);
  await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide')); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })); });
  await hoverProgress(page);
});

test('Chromium protocol freeze/resume preserves fresh-entry animation', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP lifecycle protocol only; not Safari suspension');
  await loaded(page); await hoverProgress(page);
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await hoverProgress(page);
  } finally { await cdp.detach(); }
});

test('real BFCache return must report persisted before testing fresh hover', async ({ page }) => {
  test.skip(process.env.IPAD_REAL_BFCACHE !== '1', 'requires a BFCache-capable launch; navigation alone is not evidence');
  await loaded(page); await hoverProgress(page);
  await page.goto('about:blank'); await page.goBack();
  await expect.poll(() => page.evaluate(() => window.ipadProbe?.lifecycle.some(e => e.type === 'pageshow' && e.persisted === true))).toBe(true);
  await hoverProgress(page);
});

test('clear stops recurring 1029 calls after a real prior hover; fresh entry restores cue', async ({ page }) => {
  await loaded(page);
  // Completion refusal still exercises the repeating controller, without claiming audible verification.
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function () { window.ipadProbe.sounds.push({ play: this.src }); return Promise.reject(Error('refused')); }; });
  const firehose = page.locator('#hit-layer [data-action="clear"]');
  await firehose.hover();
  const count = () => page.evaluate(() => window.ipadProbe.sounds.filter(s => s.play?.includes('easel-1029.wav')).length);
  await expect.poll(count).toBeGreaterThan(1);
  await firehose.click();
  await expect(page.locator('.firehose-wipe')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page.locator('.firehose-wipe')).toHaveCount(0);
  const before = await count();
  // Observe delivered browser frames over multiple source repeat boundaries.
  await page.evaluate(() => new Promise(resolve => {
    const start = performance.now(); function frame(now) { if (now - start >= 1400) resolve(); else requestAnimationFrame(frame); } requestAnimationFrame(frame);
  }));
  expect(await count()).toBe(before);
  await firehose.hover(); await expect.poll(count).toBeGreaterThan(before);
});

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await testInfo.attach('ipad-lifecycle-probe.json', { body: JSON.stringify(await page.evaluate(() => window.ipadProbe ?? null)), contentType: 'application/json' });
});
