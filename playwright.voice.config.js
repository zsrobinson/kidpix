import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: /(text-voice|text-steppers|action-motion).spec.js/,
  workers: 1, reporter: 'list', outputDir: 'artifacts/t3/text-voice-runtime/browser',
  use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, baseURL: 'http://127.0.0.1:4224' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4224 --strictPort', url: 'http://127.0.0.1:4224', reuseExistingServer: false },
});
