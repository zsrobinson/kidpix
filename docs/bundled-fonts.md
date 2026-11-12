# Bundled original fonts: loader and product contract

The product imports the inert-on-import loader from main.js and scene.js. Legacy
choices and the default 32px style remain unchanged. Fonts load only on demand.

## Parent interface

Import from `src/bundled-fonts.js`. A style is `{font, bold, italic}`; `font` is the
exact persisted `cssFamily` alias from `bundledFaces`, without quotes or fallback
suffixes. Unknown strings, including all four legacy values, resolve to null.

- `bundledFaces`: frozen exact face records from the source JSON catalog. `family`
  is the original label; `cssFamily` is the stable isolated CSS alias. Source names
  inside TTFs are unchanged. `source` is a relative recovery key for staging only;
  `key` is the runtime media key, with length and SHA-256 pins.
- `resolveBundledFace(style|string)`: synchronous metadata or null. Schoolhouse
  resolves the actual 400/700 normal/italic face; single-face families resolve
  their one face and permit browser synthesis as an explicit adaptation.
- `ensureFace(style|face, {signal, timeoutMs=10000})`: Promise of registered
  FontFace, or synchronous null for unknown/legacy values. Concurrent callers
  share one attempt. Each caller has its own cancellation/deadline. Neither
  cancellation nor a caller deadline poisons another waiter or cached success.
  The underlying shared attempt has its own 10-second deadline covering fetch,
  exact length/hash, FontFace load, registration, DOM layout and two frames.
  Failures are recorded and the next call retries; failed registrations and
  hidden settlement nodes are removed. The URL includes the full pinned hash.
- `bundledFaceStatus(style|face)`: `legacy`, `unloaded`, `pending`, `loaded`, or
  `failed`. `assertBundledFaceReady(style|face)` throws unless loaded or legacy.
- `ensureTextFonts(snapshot, options)`: accepts the scene's array of objects,
  awaits distinct faces on `kind: 'text'` objects, or returns synchronous null if
  there are none. `assertTextFontsReady(snapshot)` is the synchronous raster gate.
- `applyCanvasFont(context, cssFontString, style)`: assert readiness, invalidate
  the reused context's font selection on each loader generation using unrelated
  measured serif/monospace sentinels, then assign the requested font string.
  Does not reset/resize the canvas or change pixels, transforms, paint state or
  other drawing properties. Call at the existing Canvas font-assignment seam.
  Setting `context.font` directly is insufficient on WebKit after registration.
- `createBundledFontLoader(environment)` is an isolated instance/test seam. Optional
  dependencies: fetch, crypto, FontFace, document, requestAnimationFrame, baseURL,
  loadTimeoutMs. Production uses the default exports and document-relative Vite
  base. No fetch, DOM mutation, or readiness work occurs on import.

Readiness is runtime state, never serialized history. The parent must capture
immutable editor intent before awaiting and validate it after awaiting before
committing choices/defaults. The module does not implement selection/document
ABA guards, history, focus/range restoration or pending UI. For raster outputs,
preflight the captured snapshot with ensureTextFonts, revalidate the document
revision, assertTextFontsReady, and use applyCanvasFont in synchronous drawing.
No font loading belongs in a per-stroke path. JSON saves retain alias identity
without raster preflight. Integration is still required for all raster consumers.

## Strict staging and explicit plan

From the repository, with an explicit local recovered font source:

```sh
mkdir -p artifacts/staged
node scripts/bundled-font-assets.mjs stage "$FONT_SOURCE" artifacts/staged/font-module
node scripts/bundled-font-assets.mjs verify artifacts/staged/font-module
node scripts/sync-media.mjs --dry-run --font-stage artifacts/staged/font-module
FONT_TEST_SOURCE="$FONT_SOURCE" npm run check
```

Staging refuses an existing output root, any linked path components, malformed
catalogs and wrong source bytes. Only the exact 28 pinned TTFs plus canonical
catalog go under `original/fonts`. A size/hash/key receipt goes beside `original`.
Verification rejects missing/extra files, links, noncanonical catalog bytes,
wrong lengths/hashes, duplicate descriptors, Tabloid and Chalkboard. The CLI
requires explicit arguments; normal asset checks require the exact staged font inventory. Font-plan mode verifies first and enumerates only these 29 keys,
never scans unrelated unsupported media. No publication was performed.

## Evidence and reproduction

Private stage in this checkout: `artifacts/staged/font-module`; 28 TTFs,
25 families, four real Schoolhouse faces, 1,630,980 payload bytes. Canonical
catalog size/hash and all keys are in `font-receipt.json`. No dfont or Tabloid.
Private evidence: `artifacts/t3/bundled-font-module` (logs, browser receipts,
source before/after inventories). Raw font bytes are not committed.

Standalone browser fixture:

```sh
DOCKER_HOST=unix:///run/user/1000/docker.sock \
flock /var/tmp/kidpix-ui-validation.lock \
docker run --rm --pull never --init --cap-drop ALL --shm-size 512m --user 0:0 \
  --mount type=bind,src="$PWD",dst=/repo,readonly \
  --mount type=bind,src="$FONT_SOURCE",dst=/fonts,readonly \
  --mount type=bind,src="$FONT_DEPS",dst=/deps/node_modules,readonly \
  --mount type=bind,src="$PWD/artifacts/t3/bundled-font-module",dst=/out \
  mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
  node /repo/scripts/bundled-font-browser.cjs
```

The fixture's HTTP server runs in the same default-network container, never on
the host; engines run serially. It serves the actual module with only the JSON
import replaced by a literal for standalone browser import (no product build).
Chromium 158.0.8127.18 and WebKit 27.2 each pass 100 cases: all 28 real faces,
all four Schoolhouse styles, and normal/bold/italic/bold-italic synthesis for
24 single-face families. Every case checks nonempty pixels, difference from
preload fallback, equality to an independently registered alias/fresh context,
fresh/reused DOM widths, and context state/pixel preservation. A separate
WebKit strict red control retains fallback after direct reassignment and two
frames; the helper matches fresh pixels. Real-loader browser controls pass for
hash mismatch, HTTP 503, cancellation with surviving shared waiter, cached
success, timeout and retry, and zero eager requests on import.

Earlier fixture attempts and check failures are retained. The first two fixture
runs compared the old path after other font registration had already invalidated
the cache; their strict red assertion failed despite the 100 correct helper
cases. The third isolated the original sequence. The first npm check found the
sync-media test copies only that module into a temporary tree; lazy importing
the verifier only in explicit font-plan mode preserved that standalone use.
Final npm check passes: 378 tests, 350 pass, 28 skip, zero failures, Cloudflare
build and Wrangler dry run. The five focused font tests run with explicit source
and pass, including real staging corruption controls. At that module-only stage, it remained absent from the application bundle;
the product integration below supersedes that boundary.

Byte fidelity and browser rendering are not native glyph fidelity. Native 0/17;
vacuum enlargement disabled, Pencil OFF; physical iPad latency, idle, audio and
IME remain unverified. No release approval, version/baseline change or deployment.

## Product integration

The product imports the loader lazily in use (module import itself remains inert).
The catalog appends 25 source families after the exact four legacy entries;
Chalkboard and 32px remain defaults. Aliases are persisted verbatim. FifthAve is
its actual family label. Unknown saved strings remain extra options, with disabled
font arrows. Catalog order is browser policy. Schoolhouse uses four real faces;
other families allow browser bold/italic synthesis. None of this establishes
native glyph, line wrapping or menu equivalence.

`scene.captureTextStyleTarget`, `validTextStyleTarget`, `commitTextStyle` and
`cancelTextStyleIntent` form the scene-owned transaction. Capture accepts the
intended style and privately clones/freezes it; commit accepts only the token. Capture flushes typing,
checks ownership across that callback and freezes a request handle. A private
WeakMap retains the actual object/editor, document epoch, navigation, scene and
range revisions, selected owner, mode, playback/suspension and exact object state.
Only that token may commit. Commit updates CSS in place without replacing editors,
focusing, moving the range or invoking callbacks before the journal. Thus native
select focus and directional/collapsed editor ranges survive. No delayed focus
restoration can steal newer focus. Typing flush is its own existing history entry;
a valid style change adds one entry. Pending/failure/cancellation adds none.

Main keeps pending requests separate from defaults. It captures the intended
patch once, including arrow destinations, and also guards the tool/default style,
tray, request and active focus. Pointer/key/input/focus activity, inactive windows,
hidden pages, commands and newer requests retire pending choices. Scene mutation,
selection ABA, range ABA, formatting, restore/history and mode changes independently
invalidate tokens. Loaded/legacy choices commit synchronously. Error messages invite
retry through the same controls; restored identities are never coerced. Restore
prepares referenced fonts in the background, with retired restore generations
suppressing stale errors. Editable DOM may show fallback while pending; raster
success is prohibited. No readiness fields enter snapshots, history or JSON.

Raster consumer audit:

- `scene.draw` asserts all text faces before touching the context and uses
  `applyCanvasFont` at the existing assignment. `createComposite` asserts before
  resizing or painting; both remain synchronous.
- PNG, print and Flipbook capture call `prepareRaster`, preflighting only distinct
  faces in the captured scene. At these explicit commands, a full project/paint
  snapshot plus scene navigation/document identity detects ordinary stroke changes
  as well as New/Open/scene changes across the wait. This serialization occurs
  only at explicit commands, never on pointer moves/strokes.
- Stereo uses that same guard after font readiness, after right-eye image decoding,
  and after foreground layer decoding, before downloading. A stale run produces
  no mixed-document output.
- Sampling performs a synchronous readiness check and declines with a visible
  message; the eyedropper ignores the declined null result. It initiates no fetch.
  Firehose's existing synchronous composite gate throws into its transaction's
  existing rollback/error path. Retry the font choice or an output command to
  prepare failed restored fonts outside these hot paths.
- Slide playback freezes its deck and awaits only each picture's referenced faces
  before restoring DOM or starting picture audio/speech. Stop/restart generations
  cancel late advancement. Failure stops with a retry message. Existing captured
  slide preview export/print uses its already-ready pixels without redrawing.
- JSON save does not wait on fonts. Background-layer canvases contain images only;
  paint/sticker canvases contain no scene text. No flatten command exists.

Normal `verify:assets` now requires the strict font stage verifier. It resolves the
explicit media-root link once and verifies its real parent, retaining rejection of
linked font directories/leaves, extra payloads, noncanonical catalog, changed
lengths/hashes and descriptor membership. No source pins or font bytes changed.
Publication still requires verification of the actual root and constrained media
delivery by the parent. Native references remain 0/17; vacuum enlargement disabled,
experimental Pencil OFF; physical iPad latency, foreground idle, audio and IME
remain unverified. No baseline, version or publication acceptance is implied.

Restore errors are checked per face against the current scene, not just the
restore generation. Replacing the last reference suppresses that retired face's
failure. A different object using the same face still receives the error, and
retiring one face does not hide a separate pending face's failure. The regression
controls hold real requests across a successful Serif choice, then return HTTP
errors; the old restore-wide handler fails both retired-reference assertions in
Chromium and WebKit, in development and built entries.

Browser fixtures compare family identity with optional CSSOM quotes: Chromium
serializes these aliases quoted, while WebKit returns an unquoted family. Saved
JSON remains the same exact alias on both engines.

## Integration validation

The focused product suite is `playwright.fonts.config.js` (build privately before
running it). Final pinned-engine coverage: dev Chromium 36, dev WebKit 36, built
Chromium 35, built WebKit 35; all 142 pass. It includes cold/warm choices and all
Schoolhouse styles, synthesis, timeout/failure/retry, owner/range/history and
output cancellation. The independent loader Canvas/DOM fixture passes 100 cases
per engine, including the strict WebKit fallback control. Normal Node tests pass
378/378 with `FONT_TEST_SOURCE` supplied; assets, private Cloudflare build and
Wrangler dry run pass. Failed fixture attempts and the earlier legacy runs are
retained under `artifacts/t3/bundled-font-product`; this is integration evidence,
not parent release or native acceptance.

The restore-error correction passes the complete 158-case focused product/output
suite across Chromium/WebKit dev/built, including 16 new reference-lifecycle
checks. The prior source fails eight intended retired-reference assertions while
eight current-reference controls pass. Host Node tests pass 378/378, zero skipped;
strict asset verification passes. Parent release and public gates remain pending.

## Full local release validation

Frozen 0.30.0 source `c4040492f5c517525544f919e75ba557e4683e39`
passes 949 development, 860 built and 725 WebKit cases, with the existing
1/1/3 skips. All 17 static captures are RGBA-identical to accepted 0.28.1;
no baseline or tolerance changed. Host checks pass 378/378; source-only checks
pass 349 with 29 expected asset skips, build and Worker dry run. The correction
recheck adds 48 independent browser and five Node passes without a remaining
finding within its scope. Media publication and selected public acceptance are
separate gates recorded against the final published revision.
