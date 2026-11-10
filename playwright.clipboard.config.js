// Deferred parent acceptance only. Never run alongside frozen public acceptance.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: /text-clipboard.spec.js/,
  timeout: 60000, workers: 1, reporter: 'list', outputDir: 'artifacts/t3/text-clipboard-runtime/browser',
  projects: ['chromium', 'webkit'].map(browserName => ({name:browserName,use:{browserName}})),
  use: { viewport: { width: 1024, height: 768 }, baseURL: process.env.CLIPBOARD_BASE_URL || 'http://127.0.0.1:4231' },
  webServer: process.env.CLIPBOARD_BASE_URL ? undefined : {
    command: 'npm run dev -- --config vite.text-clipboard.config.js --host 127.0.0.1 --port 4231 --strictPort',
    url: 'http://127.0.0.1:4231', reuseExistingServer: false,
  },
});
