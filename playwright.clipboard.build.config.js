// Private built-app clipboard acceptance; source-helper cases run in dev.
import { defineConfig } from '@playwright/test';
import base from './playwright.clipboard.config.js';
export default defineConfig({
  ...base, grepInvert: /@module/,
  outputDir: 'artifacts/t3/text-clipboard-current/browser-build',
  use: { ...base.use, baseURL: process.env.CLIPBOARD_BASE_URL || 'http://127.0.0.1:4412' },
  webServer: process.env.CLIPBOARD_BASE_URL ? undefined : {
    command: `node --input-type=module -e 'import { createBrowserBuildServer } from "./scripts/serve-browser-build.mjs"; const s=createBrowserBuildServer({buildRoot:"artifacts/t3/text-clipboard-current/build"}); s.listen(4412,"127.0.0.1"); for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>s.close());'`,
    url: 'http://127.0.0.1:4412', reuseExistingServer: false,
  },
});
