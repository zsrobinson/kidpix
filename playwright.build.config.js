import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  // Exercise shipped entry points, including URLs resolved from built CSS.
  testMatch: ['menu-viewport.spec.js', 'pencil-preview.spec.js', 'owner-command-contact.spec.js', 'owner-command-delta.spec.js', 'owner-command-frames.spec.js', 'owner-command-policy.spec.js', 'owner-command-readiness.spec.js', 'owner-command-state.spec.js', 'easel-command-semantic.spec.js', 'easel-command-motion.spec.js', 'easel-command-readiness.spec.js', 'easel-command-delta.spec.js', 'easel-command-owner.spec.js', 'tray-motion-readiness.spec.js', 'tool-tab-motion.spec.js', 'tool-tab-lifecycle.spec.js', 'tool-tab-delta.spec.js', 'tool-tab-owner.spec.js', 'tool-tab-readiness.spec.js', 'library-motion.spec.js', 'library-motion-delta.spec.js', 'library-motion-lifecycle.spec.js', 'library-motion-owner.spec.js', 'text-clipboard.spec.js', 'ui-audio-recovery.spec.js', 'ipad-lifecycle-deferred.spec.js', 'text-read.spec.js', 'text-voice.spec.js', 'firehose-integration.spec.js', 'studio-color-picker.spec.js', 'parity.spec.js', 'fidelity.spec.js', 'stamp-editor.spec.js', 'button-rollovers.spec.js', 'spray.spec.js', 'moving-spray.spec.js', 'brush.spec.js', 'brush-engine.spec.js', 'control-regions.spec.js', 'image-control-regions.spec.js', 'paper-canister.spec.js', 'interaction-ux.spec.js', 'undo-animation.spec.js', 'tool-motion-integration.spec.js', 'tool-motion-coverage.spec.js', 'secondary-motion.spec.js', 'action-motion.spec.js', 'stamp-motion.spec.js', 'ipad-input.spec.js', 'pencil-pressure.spec.js', 'text-steppers.spec.js', 'library-readiness.spec.js', 'path-input.spec.js'],
  // Helper-module fixtures require development source URLs; app cases run here.
  grepInvert: /@module/,
  outputDir: 'artifacts/browser-build',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...base.webServer,
    command: 'node scripts/parity/check-assets.mjs && npm run build:cloudflare && node scripts/serve-browser-build.mjs',
    url: 'http://127.0.0.1:4175',
  },
});
