import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testMatch: ['bundled-font-product.spec.js', 'bundled-font-output.spec.js'],
  reporter: [['list']],
  outputDir: 'artifacts/browser-fonts',
  projects: ['dev', 'built'].flatMap(mode => ['chromium', 'webkit'].map(browserName => ({
    name: `${mode}-${browserName}`,
    grepInvert: mode === 'built' ? /@module/ : undefined,
    use: { ...base.use, browserName, baseURL: `http://127.0.0.1:${mode === 'dev' ? 4174 : 4175}` },
  }))),
  webServer: [
    { ...base.webServer, command: 'npm run dev -- --configLoader runner --host 127.0.0.1 --port 4174 --strictPort' },
    { ...base.webServer, command: 'node scripts/serve-browser-build.mjs', url: 'http://127.0.0.1:4175' },
  ],
});
