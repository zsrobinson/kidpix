import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: /(text-read|text-voice|text-steppers|action-motion|firehose-integration).spec.js/,
  timeout: 60000, workers: 1, reporter: 'list', outputDir: 'artifacts/t3/text-read-runtime/browser',
  use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, baseURL: 'http://127.0.0.1:4228' },
  webServer: { command: 'npm run dev -- --config vite.text-read.config.js --host 127.0.0.1 --port 4228 --strictPort', url: 'http://127.0.0.1:4228', reuseExistingServer: false },
});
