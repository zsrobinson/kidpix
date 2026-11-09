import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
function revision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

export default defineConfig(({ mode, command }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(command === 'serve' ? `${version}-dev` : version) },
  plugins: [{
    name: 'kidpix-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, revision: revision(), builtAt: new Date().toISOString() }) + '\n' });
    },
  }],
  // Cloudflare serves the original library from R2, independently of app builds.
  publicDir: mode === 'cloudflare' ? false : 'public',
  build: { outDir: mode === 'cloudflare' ? 'dist-cloudflare' : 'dist' },
  cacheDir: '.vite-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  // Research outputs can contain Wine drive mappings and large extracted trees.
  // Keep them out of source watching and never follow their host symlinks.
  server: { watch: { ignored: ['**/artifacts/**', '**/parity/**'], followSymlinks: false } },
}));
