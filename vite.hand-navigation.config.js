// Test bindings exist only in this private fixture's output.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
export default defineConfig(env => mergeConfig(base(env), {
  cacheDir: 'artifacts/t3/hand-navigation/private-cache', publicDir: env.command === 'build' ? false : 'public',
  build: { outDir: 'artifacts/t3/hand-navigation/private-build', minify: false, rollupOptions: { input: { app: 'index.html', main: 'src/main.js' }, preserveEntrySignatures: 'strict', output: { entryFileNames: chunk => chunk.name === 'main' ? 'src/main.js' : 'assets/[name].js' } } },
  plugins: [{ name: 'private-navigation-tests', transform(code, id) {
    if (id.endsWith('/src/main.js')) return code + '\nexport const navigationTest = { scene, state, activate, project, restoreProject, freshPicture, history, get undo(){return undoStack}, get redo(){return redoStack} };';
  } }],
}));
