import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  // Module-isolated experiments are exercised in dev; this suite covers the
  // shipped entry points and catches asset URLs resolved from built CSS.
  testMatch: ['parity.spec.js', 'fidelity.spec.js'],
  outputDir: 'artifacts/browser-build',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...base.webServer,
    command: 'node scripts/parity/check-assets.mjs && npm run build:cloudflare && node scripts/serve-browser-build.mjs',
    url: 'http://127.0.0.1:4175',
  },
});
