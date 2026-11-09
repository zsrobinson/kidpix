import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: /(text-steppers|action-motion).spec.js/,
  workers: 1, reporter: 'list', outputDir: 'artifacts/text-controls/browser',
  use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, baseURL: 'http://127.0.0.1:4210' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4210 --strictPort', url: 'http://127.0.0.1:4210', reuseExistingServer: false },
});
