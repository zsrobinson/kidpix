import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'../tests/browser',workers:1,fullyParallel:false,timeout:45000,
 outputDir:'../artifacts/pen-perf/checks',reporter:'list',
 use:{browserName:process.env.ENGINE||'chromium',baseURL:`http://127.0.0.1:${process.env.BUILT?4242:4241}`,viewport:{width:1024,height:768}},
 webServer:{cwd:new URL('..',import.meta.url).pathname,command:'node scripts/pen-perf-server.mjs',url:`http://127.0.0.1:${process.env.BUILT?4242:4241}`,reuseExistingServer:false},
});
