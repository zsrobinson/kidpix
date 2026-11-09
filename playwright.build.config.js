import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  // Exercise shipped entry points, including URLs resolved from built CSS.
  testMatch: ['parity.spec.js', 'fidelity.spec.js', 'stamp-editor.spec.js', 'button-rollovers.spec.js', 'spray.spec.js', 'moving-spray.spec.js', 'brush.spec.js', 'brush-engine.spec.js', 'control-regions.spec.js', 'image-control-regions.spec.js', 'paper-canister.spec.js', 'interaction-ux.spec.js', 'undo-animation.spec.js'],
  // Helper-module fixtures require development source URLs; app cases run here.
  grepInvert: /@module/,
  outputDir: 'artifacts/browser-build',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...base.webServer,
    command: 'node scripts/parity/check-assets.mjs && npm run build:cloudflare && node scripts/serve-browser-build.mjs',
    url: 'http://127.0.0.1:4175',
  },
});
