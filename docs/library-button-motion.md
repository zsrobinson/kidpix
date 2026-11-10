# Easel library button motion

The four main library controls now bind their existing rest/tracking programs as
well as their separate auxiliary rollovers. Version remains 0.17. This is static
source-backed browser implementation, with no native execution or wall-clock
comparison. Physical iPad/Pencil latency and foreground idle remain unproved;
native evidence remains 0/17. The enlarged vacuum actor remains disabled.

## Source contract

The Mac installer cache used for verification is
`artifacts/t3/secondary-motion/extracted/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources`
in the input checkout. The portable installer reader reads only `Data/Easel.MHK`
from Archive.zp/Archive.zplist. Its SHA-256 is
`6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c`.
The existing Windows Easel archive hashes to
`9859ed0223e0436a2b56f32fffe2a5b762011eae766bb5d8cbea364dc3bf479b`;
that build is distinct and is not used as Mac evidence.

MBTN 75 rows 2/0/1/3 bind Backgrounds/Stickers/Animations/Media respectively.
Their script triplets are 1000/1001/1002, 1003/1004/1005, 1006/1007/1008,
and 1009/1010/1011. Slots 1, 2 and 3 reference the middle script. Slot 2 exists,
so construction at i386 0x31155–0x31177 chooses mode 1. Hotspot kind 2 instead
selects MRGN construction; regions are 375/1003/1006/1009. Group is 1;
auxiliary words 11/12 are 1/0 (repeat/cancel on leave).

The state dispatch at 0x30ce0 and same-script bypass at 0x30b25–0x30b47 are
summarized in [button-animation.md](button-animation.md). Draw replacement at
0x30bf5–0x30c4a distinguishes script replacement from callback-only continuity.
No owner-specific callback blocker was found for these twelve complete programs.
The four rest/tracking programs each render three images at ticks 0/1/2, with
end-check tick 3. Rollovers render four images, end-check tick 4. All intervals
are 100 ms. Tracking alone starts cue 1000 on channel 1 at tick 0. Registration
is one-based and signed; the Media rollover's third draw also changes raw x.

`scripts/verify-library-motion.py` independently parses these small programs,
checks raw MBTN and MRGN values, and reconstructs all 40 frames in memory with
the existing archive/bitmap codecs. It compares every RGBA byte with the existing
PNG files. It does not invoke the animation exporter, execute original software,
or export/change artwork. The small fixture contains hashes, draw IDs, source
coordinates, tick/cue pins and required media keys, not original program payloads.

## Implementation and adaptations

`attachLibraryMotion(manifest, root, sprites, layer, hooks)` owns only these four
controls. Its API exposes `names`, `ready(name)`, `ownsCue(action)`, `cancel(name)`,
`cancelGroup(group, exceptName)` and `dispose()`. Main coordinates these with the
existing auxiliary owner and uses `ownsCue` solely for the four tray activation
cues. No global sound function changes. Static bindSprite remains installed.

Images use the full source clip rectangle without stretching to hit geometry.
The decoded-image cache is shared with rollovers. Existing fallback auxiliary
actors remain enabled until the corresponding main owner has decoded all its
own scripts; failures retain static controls and auxiliary hover. Entry retries
failed decodes. Successful ownership transfer preserves current hover intent.
Only these twelve programs add state-frame loading; there is no unrelated state
preload or second hover decode cache.

The stream keeps script identity through pointerup/latch, preserving timing and
cue ownership. It resumes backing progress after auxiliary cancellation and
retains finite final images without scheduling further frames once end gates
clear. Channels 1/2 use playUiAudio/observeUiAudio; initial paused/pending play
never releases a gate. Owned interruptions unsubscribe before pausing. Stale
terminal events cannot complete a replacement handle.

Application tray selection remains authoritative. In particular the browser's
existing selected tray does not toggle away merely because native mode 1 can
toggle in an owner-specific activation branch. This preserves existing semantic
selection/input/history behavior. Pointer capture commits one existing control
click at release-inside, then suppresses its physical compatibility click.
New pointerdown clears that disposition. The shared document interaction owner
retains first-contact ownership through secondary contacts and late clicks.
Keyboard and semantic clicks use the same stream; lifecycle cancellation drops
pending decode generations, tracking, captures, auxiliaries and owned sounds.

## Validation and oracle changes

The prior rollover tests now inspect the running base image in place of static
art, and explicitly inspect the original static sprite while disabled. Their
existing timing, repeat, suppression, group cleanup and retained-Firehose intent
and thresholds are unchanged. The new pixel tests pin full registered bounds,
hash source PNG RGBA against independent Mac pins, and compare opaque source
pixels in actual studio screenshots for all 40 frames. No baseline was accepted.
The static-binding delta test fails because the held Backgrounds screenshot does
not advance; the candidate passes the same assertion.

Artifacts, private configs, cache, build, dry-run bundle, logs and results live
under `artifacts/t3/easel-library-motion/`. Dev/built ports are strictly 4431/4432.
No release suite, native CI, installer execution, media upload, push or deployment
is part of this work. No performance improvement is claimed.

The complete required existing media list is the fixture's `mediaKeys` (also
`artifacts/t3/easel-library-motion/media-keys.txt`): UI metadata, cue 1000, sixteen
static fallback images, and all forty frames of scripts 1000–1011. Parent must
independently verify public hashes before release. Other already-published
chrome/media dependencies remain outside this change.

### Recorded checks

- `npm test`: 253 passed. `npm run verify:assets`: 4,343 items / 9,751 files.
- Independent Mac verification: 12 raw programs, four MBTN/MRGN records,
  all 40 frame RGBA buffers exact; report `oracle-final.json`.
- Chromium 158 dev: 77 passed / one BFCache skip / one obsolete disabled-art
  assertion in `chromium-validation.log`. Corrected rollover suite: 9 passed in
  `chromium-rollover-final.log`, resolving that assertion (78 distinct passing
  tests plus the existing skip across those runs).
- Chromium built: 20 passed plus that same disabled assertion before correction;
  the corrected rollover + lifecycle run passed all 15 tests. The additional
  pending-decode/disposal actor fixture passed two tests (`chromium-owner-final2.log`).
  Together these cover 29 distinct built tests with final passing results.
- Pinned WebKit 27.2 built: 21 passed (`webkit-built-validation.log`), six
  cancellation/Space tests passed (`webkit-built-lifecycle.log`), two pending
  owner/disposal tests passed (`webkit-owner-final2.log`).
- Pinned WebKit dev: 34 passed / two platform skips (`webkit-dev-validation.log`).
- Private Cloudflare-mode Vite build and Worker `--dry-run` passed; no upload.
- Static-binding delta: expected failure in `static-red.log`, candidate pass in
  `candidate-green.log`; subsequent dev/built delta tests also pass both engines.

Exploratory runs are retained. Early failures exposed missing group cleanup,
static-versus-animated assertions, an auxiliary helper shadowed by an image
variable, and compatibility-click suppression surviving into another control's
next gesture; these were corrected. Initial new clock tests used 110 ms, which
could miss the next RAF at a 100 ms deadline; new tests use 120 ms, matching the
prior rollover first-frame allowance. No existing timing threshold changed.
Some runs were stopped/replaced during fixes; initial setup failures included
wrong artifact-relative paths, result-directory permissions after Docker root,
and a strict-port collision. The isolated pending-owner fixture initially lacked
visible fallback artwork and depended on its test-only hover geometry; it now
waits for decoder completion and delivers an explicit entry event. Actual studio
entry/retry remains covered by both engines.

The exploratory WebKit adjacent run recorded two CDP-only test failures, one
navigation-context interruption, one superseded tracking failure, and a primary
Drawing pixel mismatch at native coordinates beginning `(169,654)`. A separate
static-library binding control reproduced that same primary mismatch in
`webkit-primary-baseline.log`; it is outside this four-button slice. That test
and its pixel threshold were not changed. The applicable final library/audio/
lifecycle runs pass. Native execution, physical hardware, and full release gates
remain parent responsibilities.

### Reproduction

With existing dependencies/media linked, private configs in the artifact folder
use these commands from the worktree (no default release-port config):

```sh
npm test
npm run verify:assets
npx playwright test -c artifacts/t3/easel-library-motion/playwright.config.mjs \
  library-motion.spec.js library-motion-delta.spec.js button-rollovers.spec.js \
  ui-audio-recovery.spec.js ipad-input.spec.js ipad-lifecycle-deferred.spec.js \
  tool-motion-integration.spec.js
node node_modules/vite/bin/vite.js build --configLoader runner \
  --config artifacts/t3/easel-library-motion/vite.config.mjs --mode cloudflare
node node_modules/wrangler/bin/wrangler.js deploy --dry-run \
  --assets artifacts/t3/easel-library-motion/build \
  --outdir artifacts/t3/easel-library-motion/worker
npx playwright test -c artifacts/t3/easel-library-motion/playwright.built.config.mjs \
  library-motion.spec.js library-motion-delta.spec.js library-motion-lifecycle.spec.js \
  library-motion-owner.spec.js button-rollovers.spec.js
```

The WebKit commands use the same configs with `MOTION_ENGINE=webkit` inside
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`,
`--pull never`, caller UID/GID, host networking, source/dependencies/media mounted
read-only, and only this slice's artifact folder mounted writable. Dev WebKit
omits the Chromium-CDP-only iPad tests; source primary pixel failure is recorded
separately above. No browser panels or release ports are used.
