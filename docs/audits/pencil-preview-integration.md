# Experimental Pencil preview browser preference

Implemented on 2026-11-10 from 813458c, following the default-off renderer review
in pencil-prediction-preview.md and the final pencil-final-review/REVIEW.txt.

## User and setting contract

Paint Zone offers “Pencil preview (experimental)”, a native button with switch
semantics, aria-checked, a visible empty/checked indicator and described help.
Native click activation handles touch, Enter, Space and assistive clicks once.
The existing menu dismissal and control ownership remain in charge. No new
modal, CSS, artwork, studio geometry, keyboard shortcut or release profile.

The description reads: “Temporary browser estimates for supported pen/freehand
Pencil only. May shift or do nothing without estimates.” No hardware speed,
physical accuracy or latency claim is made.

src/pencil-preview-preference.js owns the browser-only key
kidpix.pencil-preview. Only the exact string true enables a fresh instance;
absent or malformed values mean OFF. The initial read and explicit writes catch
storage access/method failures. A blocked write keeps the explicit choice for
the current instance; reload defaults OFF if no prior readable preference exists.
There is no cross-tab live synchronization. This setting is deliberately absent
from document state, project serialization, New/Open and history.

The createPaint hooks object exposes a pure live pencilPredictionPreview getter.
It reads the in-memory boolean only: no storage, pressure, sample, RNG, spacing,
native or history operations. Enabling needs no reload. The renderer's existing
stroke-start eligibility prevents enabling an already ineligible stroke.
Disabling uses existing setOptions({}): it clears/renders disposable prediction
synchronously, copies unchanged options and refreshes the cursor, then returns
through the empty-options early return without loading native assets, ending the
stroke or recording history. No renderer algorithm or display readback change.

## Validation

Evidence: artifacts/t3/pencil-ui-integration/ (ignored, retained locally).

- npm test: 289 pass, no failures/skips (baseline286 plus two preference tests and
  one strict production-entry fixture control).
- verify:assets: 4,343 items / 9,751 referenced files verified.
- Corrected Chromium158 and pinned WebKit27.2 dev and private-built lanes:
  five user-path tests each (20 total), plus85 renderer assertions per lane
  (340 total), zero page errors. Versions are separately recorded in versions.log.
- User tests cover default OFF/closed menu, keyboard/assistive/touch once-only
  changes, checked state, reload persistence, denied/malformed storage, actual
  Save/New/Open/Undo/Redo, no preference in saved project, and exact restored ink.
- Existing constructor-modeled/explicit coalesced shims retain the strict actual
  consumption, pressure/spacing/sample, continuation/RNG, native decoded asset
  and branch witnesses, export/PNG/clipboard, Undo/Redo and lifecycle oracles.
  Additional real studio checks cover OFF, enabling an ineligible held stroke,
  missing/empty/throwing API, mouse/touch neutrality, immediate OFF during a
  visible tail with unchanged saved art/history, and subsequent correction.
- Six negative dev lanes exit1 as expected: disabled eligibility fails temporary
  tail visibility, blocked native brush1002 fails asset setup, and uncaught page
  errors fail the page-error gate, separately in Chromium and WebKit. Failure
  traces retained. Independent prior built-native negative evidence remains in
  the renderer review; this integration reruns these faults in dev only.
- Private ordinary Cloudflare build and Wrangler deploy --dry-run pass using an
  isolated config/assets/output path. No deployment or root build performed.
- Source diff leaves paint.js, prediction algorithm, native/source engines,
  presentation context settings, media, baselines, package/version and profiles
  unchanged. Closed-menu content is hidden; no layout/CSS change.
- All browser lifetimes hold /var/tmp/kidpix-ui-validation.lock. Only ports4691/
  4692; pinned image, pull never, cap-drop ALL, host UID/GID/network, shm512MiB,
  read-only source/dependencies/media and private writable artifacts.

The initial UI run failed one strict locator: Save Picture matched both native
chrome and the dialog button. Its original log and trace remain in first/.
The test now scopes Save/New confirmation to #dialog-actions. No product fix or
pixel expectation changed for that setup correction. Corrected results live
separately in corrected/. No blind retry or relaxed pixel oracle.

## Reproduce and remaining ownership

Temporarily link the existing dependencies and imported public media (read-only
container mounts); no install/download. From this worktree:

    npm test
    npm run verify:assets
    PENCIL_PREVIEW_OUTPUT=artifacts/t3/pencil-ui-integration/recheck bash scripts/pencil-prediction-preview.sh

The harness now activates the real menu path, requires unique production getter/
createPaint seams, and only privately exposes existing APIs. It never inserts a
boolean option overriding the production getter. Production builds contain no
fixture globals. Private checks config targets4691/4692 and a touch-capable
context. Fault runs use PENCIL_PREVIEW_FAULT=disable, missing-assets or pageerror
with PENCIL_PREVIEW_ENGINE=chromium or webkit and a separate output directory.
The retained build-check.mjs records the exact private build/dry-run procedure.

Parent owns independent integration/user-flow review, version0.22, profile
inclusion, full release gates and publication. No broad release/performance
sweep, physical Pencil trial or source parity acceptance is asserted here.
Native remains accepted0/17; enlarged vacuum remains disabled; physical Pencil
benefit, audible behavior and foreground-visible idle remain unverified.
