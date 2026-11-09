import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const baseURL = 'http://127.0.0.1:4176';
export default defineConfig({
  ...base,
  testMatch: ['ipad-input.spec.js', 'pencil-pressure.spec.js', 'stamp-editor.spec.js', 'text-steppers.spec.js', 'library-readiness.spec.js', 'path-input.spec.js'],
  // These cases deliver real Chromium pen/touch through CDP. The shared
  // ownership, renderer and ordinary studio cases also run in WebKit.
  grepInvert: /browser-delivered pen capture|browser double-tap|later polygon pen contact/,
  timeout: 60_000,
  outputDir: 'artifacts/browser-webkit/results',
  reporter: [['list']],
  use: { ...base.use, browserName: 'webkit', hasTouch: true, baseURL },
  webServer: process.env.KIDPIX_WEBKIT_EXTERNAL_SERVER ? undefined : {
    ...base.webServer,
    command: 'node scripts/parity/check-assets.mjs && npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    url: baseURL,
  },
});
