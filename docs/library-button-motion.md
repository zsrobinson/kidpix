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

### Integration correction and focused verification

A real-app regression found that a held pointer survived Escape when focus had
moved from the captured library button to Picture title. The key event no longer
crossed the hit layer, so pointer release still selected the library. Escape
cleanup now listens on document capture; other key handling remains scoped to
the controls. The regression fails before this change and passes afterward,
including a fresh successful press. No source timeline or sound gate changed.

After that correction,28 focused Chromium development cases pass, including all
40 visible source frames and existing rollover checks. All seven lifecycle cases
pass in pinned WebKit development, pinned WebKit built and Chromium built apps.
The existing source verifier, run with
`artifacts/t3/secondary-motion/venv/bin/python`, reproduces the checked fixture
exactly. The system Python lacks Pillow; no installation was performed.
`npm run check` passes253 Node cases, assets, build and Worker dry run again.

The two pending-decode/disposal fixtures explicitly import source modules into
a synthetic document. They are now marked `@module`: development and WebKit
source checks retain them, while the full built-app gate will exclude them.
Their assertions are unchanged. Earlier child-built totals include those two
source fixtures and should not be interpreted as shipped-entry coverage.

All59 required public response bodies match local SHA256 values. Integration
evidence is retained in `artifacts/t3/release-0180/`, including the Escape failure
and correction. Independent review and full release suites remain pending;
public0.17 is unchanged.

### Readiness and cancelled-key review fixes

The first independent review reproduced two P2 issues in Chromium and WebKit,
including production bundles: artwork readiness could replay cue1000 after a
fallback selection, and cancelled Space tracking left all later semantic clicks
blocked. The original report and its failing probes are retained under
`artifacts/t3/release-0180/initial-review.md` and the matching review JSON files.

Readiness now marks the already-consumed tick0 cue when adopting a selected
fallback control. It does not skip future cues or suppress a fresh tracking
stream. A second regression covers decoding between pointerdown and pointerup:
an untracked physical click that becomes source-ready enters the source state
before main chooses the activation cue owner. A pending decode cannot start an
auxiliary hover during the held fallback press. Semantic and physical activations
also perform the same group-peer cleanup. Source frames, registrations, intervals,
end checks and fresh audio completion gates are unchanged.

Keyboard cancellation records the cancelled key and prevents that keyup's default
activation, including after focus moves. It no longer blocks later semantic
clicks. Actual-app tests cover Escape, focus loss and blur followed by a semantic
activation, plus both delayed-readiness timings and a fresh subsequent pointer
selection. All five regressions fail before their corresponding correction and
pass afterward. The older failures remain retained; no assertion was weakened.

Chromium and pinned WebKit development each pass35 focused cases after these
corrections. Built-app checks and final independent recheck remain release gates.
No new media, version change, public deployment, performance or hardware claim
is implied by this integration checkpoint.

Both engines' development suites passed35 focused cases after the complete
readiness/key fixes. Chromium built passed33. WebKit built passed32, with the
remaining rollover case's body passing but its error collector rejecting an
outgoing Drawing audio request cancelled by the test's intentional reload.
No library frame, cue, input or cleanup assertion failed in that run.

A controlled server delay reproduced that collector failure with the exact
outgoing Request identity recorded. The rollover fixture now snapshots pending
Requests before its explicit reloads and excludes WebKit's cancellation message
only for those outgoing requests. HTTP errors, page errors and current-document
request failures remain checked. A negative control creates and cancels a new
media request after reload: it remains classified as current and correctly fails
the asset-error assertion. The first negative setup attempt did not create a
pending request and is retained as an excluded fixture failure. Debug logging and
delay injection live only in the diagnostic artifact copy, not tracked tests.

The corrected nine-case rollover suite passes in Chromium/WebKit development and
built apps. Together with the earlier results, all33 distinct built cases have
passing focused evidence; that is not a clean full release-suite claim. Exact
commands, logs, controlled reload and negative fixtures are retained under
`artifacts/t3/release-0180/`. Final independent recheck and full release gates
remain pending, and public0.17 remains unchanged.

### WebKit touch compatibility correction

The next independent recheck confirmed both original P2 fixes and the reload
classification controls. It also found that WebKit touch could dispatch two
application activations per tap. Actual browser input produced touch pointerup
with ID2, the bridge's semantic click, then a trusted mouse compatibility click
with ID1. The existing same-ID guard missed that last event; playback stayed
once-only, but the library rebuilt twice. This was present in the initial bridge,
not introduced by the readiness fixes. The report and trace are retained as
`release-0180/second-review.md` and `touch-trace-before.json`.

The released disposition now keeps the original pointer type and recognizes a
mouse compatibility click from the consumed touch on the same control. A fresh
pointerdown clears the disposition; zero-detail semantic clicks remain usable.
No timer, global click suppression, frame or audio change was added.

A real touchscreen regression fails on the old bridge in WebKit and passes after
the correction. It taps all four libraries, repeats a tap, then uses mouse and
semantic activation, counting application clicks as well as cues. Another case
cancels a browser-delivered touch through an injected blur and verifies no ghost
activation, followed by a successful fresh tap. These two cases plus both
readiness and all three keyboard regressions pass in Chromium/WebKit development
and built apps (seven cases per lane). `npm run check` again passes253 Node
checks, assets, build and Worker dry run. Full release gates and independent
touch-fix recheck remain pending. This is browser input evidence; physical iPad
and Apple Pencil delivery, latency and audible feel remain unverified.

### Release capture and hit-region fixtures

The full Chromium gate exposed an old geometry assertion reading the hidden
static Backgrounds sprite. It now reads the visible source base actor, waits
for readiness, and retains the same artwork rectangle and exact MRGN corner,
outside-hit, hover and activation assertions. The focused geometry/capture run
passes20 cases. No runtime or hit geometry changed.

Static recipes now wait for all four finite library state streams and their
owned completion gates to settle while Paint Zone is visible. The17 complete
captures pass their behavior checks. Sixteen are pixel-identical to0.17;
Backgrounds' selected appearance changes3,771 pixels within x32–120/y15–68.
The importer previously used zero-based bitmap4 (native bitmap5) for its static
selected fallback. Raw MBTN75 instead selects script1001 for state2; it ends on
native bitmap2. The fallback bitmap is a pose from auxiliary1002, not the
selected-state program. The new pose is therefore an intentional source-backed
web baseline change. Raw source pins and all40 frame comparisons are unchanged.

Only that reviewed Backgrounds web baseline is accepted; prior baselines and
the initial interrupted Chromium outputs are preserved under `release-0180/`.
Original-runtime references remain untouched at0/17. The full303-case WebKit
gate passes with three explicit skips; the corrected Chromium suites must finish
before publication. This capture/helper correction changes no application code.

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
