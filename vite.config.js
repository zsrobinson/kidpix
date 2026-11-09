import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  // Cloudflare serves the original library from R2, independently of app builds.
  publicDir: mode === 'cloudflare' ? false : 'public',
  build: { outDir: mode === 'cloudflare' ? 'dist-cloudflare' : 'dist' },
  cacheDir: '.vite-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
}));
