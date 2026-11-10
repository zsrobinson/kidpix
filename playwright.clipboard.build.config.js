// Deferred acceptance: private built app, no source-helper cases.
import { defineConfig } from '@playwright/test';
import base from './playwright.clipboard.config.js';
export default defineConfig({
  ...base, grepInvert: /@module/,
  outputDir: 'artifacts/t3/text-clipboard-runtime/browser-build',
  use: { ...base.use, baseURL: process.env.CLIPBOARD_BASE_URL || 'http://127.0.0.1:4232' },
  webServer: process.env.CLIPBOARD_BASE_URL ? undefined : {
    command: `node --input-type=module -e 'import { createBrowserBuildServer } from "./scripts/serve-browser-build.mjs"; const s=createBrowserBuildServer({buildRoot:"artifacts/t3/text-clipboard-runtime/build"}); s.listen(4232,"127.0.0.1"); for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>s.close());'`,
    url: 'http://127.0.0.1:4232', reuseExistingServer: false,
  },
});
