// Private validation seam. Normal builds never export these bindings.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
export default defineConfig(env => mergeConfig(base(env), {
  cacheDir: 'artifacts/t3/make-sticker/cache',
  publicDir: env.command === 'build' ? false : 'public',
  build: { outDir: 'artifacts/t3/make-sticker/build', minify: false, rollupOptions: { input: { app: 'index.html', main: 'src/main.js' }, preserveEntrySignatures: 'strict', output: { entryFileNames: chunk => chunk.name === 'main' ? 'src/main.js' : 'assets/[name].js' } } },
  plugins: [{ name: 'private-sticker-tests', transform(code, id) {
    if (id.endsWith('/src/main.js')) return code + '\nexport const stickerTest = { paint, scene, state, activate, project, restoreProject, history, makeSticker, freshPicture, get undo(){return undoStack}, get redo(){return redoStack} };';
  } }],
}));
