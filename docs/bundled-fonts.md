# Bundled original fonts: inert module contract

The loader is not imported by main.js or scene.js. Legacy choices and the default
32px style remain unchanged. No media is exposed by this change alone.

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
requires explicit arguments; ordinary asset checks remain independent until
integration. Font-plan mode verifies first and enumerates only these 29 keys,
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
and pass, including real staging corruption controls. The module remains absent
from the application bundle because integration is deliberately deferred.

Byte fidelity and browser rendering are not native glyph fidelity. Native 0/17;
vacuum enlargement disabled, Pencil OFF; physical iPad latency, idle, audio and
IME remain unverified. No release approval, version/baseline change or deployment.
