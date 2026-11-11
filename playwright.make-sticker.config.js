import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/browser', testMatch: /make-sticker.spec.js/, timeout: 30000, workers: 1,
 outputDir: 'artifacts/t3/make-sticker/browser', reporter: 'list',
 use: { baseURL: process.env.STICKER_URL || 'http://127.0.0.1:4741', viewport: {width:1024,height:768}, hasTouch: true, trace:'retain-on-failure', screenshot:'only-on-failure' },
 projects: ['chromium','webkit'].map(browserName=>({name:browserName,use:{browserName}})),
});
