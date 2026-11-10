import { defineConfig } from '@playwright/test';
import base from './playwright.voice.config.js';
export default defineConfig({ ...base, testMatch: 'text-voice.spec.js',
  use: { ...base.use, browserName: 'webkit' },
  outputDir: 'artifacts/t3/text-voice-runtime/webkit', webServer: undefined,
});
