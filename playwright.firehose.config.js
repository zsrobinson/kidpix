import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 30000,
  outputDir: 'artifacts/t3/firehose-runtime/results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/t3/firehose-runtime/results.json' }]],
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4220', viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4220 --strictPort',
    url: 'http://127.0.0.1:4220', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 1000 } },
});
