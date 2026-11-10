import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const baseURL = 'http://127.0.0.1:4176';
export default defineConfig({
  ...base,
  testMatch: ['easel-command-semantic.spec.js', 'easel-command-motion.spec.js', 'easel-command-readiness.spec.js', 'easel-command-delta.spec.js', 'easel-command-owner.spec.js', 'tray-motion-readiness.spec.js', 'tool-tab-motion.spec.js', 'tool-tab-lifecycle.spec.js', 'tool-tab-delta.spec.js', 'tool-tab-owner.spec.js', 'tool-tab-readiness.spec.js', 'button-rollovers.spec.js', 'library-motion.spec.js', 'library-motion-delta.spec.js', 'library-motion-lifecycle.spec.js', 'library-motion-owner.spec.js', 'text-clipboard.spec.js', 'ui-audio-recovery.spec.js', 'bounded-motion.spec.js', 'ipad-lifecycle-deferred.spec.js', 'text-read.spec.js', 'text-voice.spec.js', 'firehose-integration.spec.js', 'ipad-input.spec.js', 'pencil-pressure.spec.js', 'stamp-editor.spec.js', 'text-steppers.spec.js', 'library-readiness.spec.js', 'path-input.spec.js', 'studio-color-picker.spec.js'],
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
