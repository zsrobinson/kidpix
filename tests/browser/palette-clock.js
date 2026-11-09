import { expect } from '@playwright/test';

// Palette cue completion is controlled independently of the frozen tool clocks.
// The studio palette suite separately tests held real-source cue gates.
export async function installPaletteClockAudio(page) {
  await page.addInitScript(() => {
    const RealAudio = window.Audio;
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!String(src).includes('/color-picker-motion/')) return new RealAudio(src);
        this.src = String(src); this.ended = true; this.paused = true; this.currentTime = 0;
      }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
      removeAttribute() {}
      load() {}
    };
  });
}

export async function openClockPalette(page) {
  await page.locator('#color-button').dispatchEvent('click', { detail: 0 });
  const palette = page.locator('#palette');
  await expect(palette).toHaveAttribute('data-phase', /^(opening|open)$/);
  for (let tick = 0; tick < 24 && await palette.getAttribute('data-phase') !== 'open'; tick++) await page.clock.runFor(32);
  await expect(palette).toHaveAttribute('data-phase', 'open');
}

export async function closeClockPalette(page) {
  await page.keyboard.press('Escape');
  const palette = page.locator('#palette');
  for (let tick = 0; tick < 16 && await palette.getAttribute('data-phase') !== 'closed'; tick++) await page.clock.runFor(112);
  await expect(palette).toHaveAttribute('data-phase', 'closed');
}
