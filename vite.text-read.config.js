import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
export default defineConfig(env => mergeConfig(base(env), {
  cacheDir: 'artifacts/t3/text-read-runtime/cache',
  build: { outDir: 'artifacts/t3/text-read-runtime/build' },
}));
