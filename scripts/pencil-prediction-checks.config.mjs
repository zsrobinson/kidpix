import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '../tests/browser', workers: 1, fullyParallel: false, timeout: 45000,
  outputDir: `${process.cwd()}/${process.env.PENCIL_PREVIEW_OUTPUT || 'artifacts/t3/pencil-prediction-preview'}/checks`, reporter: 'list',
  use: { browserName: process.env.ENGINE || 'chromium', baseURL: `http://127.0.0.1:${process.env.PENCIL_PREVIEW_PORT || '4691'}`, hasTouch: true, viewport: { width: 1024, height: 768 }, trace: 'retain-on-failure' },
})
