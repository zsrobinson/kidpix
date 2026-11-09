import { defineConfig } from '@playwright/test';
import built from './playwright.build.config.js';

export default defineConfig({
  ...built,
  outputDir: 'artifacts/browser-live',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  webServer: undefined,
  use: {
    ...built.use,
    baseURL: process.env.KIDPIX_TEST_ORIGIN || 'https://kidpix.zsrobinson.com',
  },
});
