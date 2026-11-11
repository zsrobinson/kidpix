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

## Parent split-view and input correction

The first integration review found that studio scaling reduced the experimental switch to13.9px high with6.4px text at507×1024. Expanded menus now use a manual browser popover outside the studio's transformed clipping, while retaining the original DOM, delegated command routes and closed native chrome. Menu controls are44px high with16px text, the adjacent description is14px, viewport margins are8px, and short views scroll. Close, command activation and Escape keep visibility and aria-expanded synchronized. ResizeObserver and visual viewport events reposition open content; unsupported popover APIs retain the existing menu path. This follows the HTML popover standard's top-layer semantics: https://html.spec.whatwg.org/multipage/popover.html .

The original split-view regression fails at the effective font-size assertion. The initial popup run passed9 cases and caught one bounds assertion before the queued details resize settled; its screenshot shows final placement corrected. A popup ResizeObserver and explicit placement-readiness checks now cover expansion/rotation. Those earlier logs/traces remain retained, not counted as clean acceptance. The warning is adjacent to its switch so short viewports show it before opting in.

A new actual WebKit regression exposed a compatibility-click loophole: rejected touch down/up used pointer2, but its browser click arrived as mouse pointer1 while pen77 still owned the paper. Window-capture tracing confirmed ownership was still active and no cancellation occurred. The shared guard now rejects physical clicks while a contact is owned, independent of remapped identity. Release handlers retire ownership before legitimate physical clicks; semantic detail-zero commands remain available. Two Node controls fail before this change; four pass after it, including mouse-ID reuse, semantic availability and the original owner's release. The traced WebKit app case also fails before and passes after. No input sampling, prediction, native rendering or history algorithm changed.

Retained browser regressions cover four tablet viewports, rotation and lower-menu reachability, readable ON plus quota write failures, zero estimate-property access while OFF, competing physical switch touches and fresh recovery. Broader final validation and independent correction review remain pending.

## Correction recheck and final positioning

Independent correction review found no remaining release objection in the popup/global ownership scope. It passed48 committed browser checks,24 independent assertions and4 ownership unit tests; the font-size and remapped-click negative controls remain red. Four independent probe failures exposed one nonblocking P3: at1024×768 the tall popup covered the original Show menus trigger. The report and failures are retained under `artifacts/t3/release-0220/menu-final-review.txt` and the isolated correction review.

The parent reproduced that overlap with an unchanged center-hit assertion, then reserved space on the roomier side of the trigger and capped popup height to that space. The original trigger can close/reopen the menu while Close/Escape and viewport scrolling remain available. All13 current menu/preference cases pass in each Chromium/WebKit development/built lane (52 total); the small positioning change was verified by the parent. Earlier renderer proof remains340 assertions plus28 UI cases on the same renderer/input code. Broader ownership regressions pass90/67 Chromium development/built and87/65 WebKit development/built (309 total). Node294 and source-only266 with28 imported-asset skips, build and dry-run pass before final positioning; full frozen release gates and public acceptance follow separately.

## Frozen 0.22 release validation

Frozen source9e7b03f8638a1bacac985ab31ce463d97caff264 passes294 Node checks, source-only266 with28 imported-asset skips, assets4,343 items/9,751 references, build and Worker dry run. Full development775/1 explicit skip, built690/1 skip and pinned WebKit542/3 skips pass. All17 static RGBA captures are identical to0.21, with zero web comparison/regression failures, no baseline update and no new media.

The initial concurrent Chromium runs each had one ENOSPC error at browserContext.close/trace finalization, while WebKit passed completely. Both affected cases then pass in isolation with unchanged assertions/tracing. Complete serial Chromium reruns pass cleanly, retaining at least3,363,520,512/3,468,795,904 available filesystem bytes at ten-second sampling points. That sampled minimum is not an instantaneous peak guarantee. Original failed JSON/results/traces and initial parity report remain retained; they are superseded as release gates, not relabeled passes. Source/tracing/assertions remained unchanged and no original evidence was deleted.

The setting remains explicitly experimental and OFF for a fresh profile. It is a browser adaptation rather than a demonstrated physical Pencil accuracy/latency fix. Native accepted references remain0/17 and the enlarged vacuum stays disabled. Publication revision/checks and selected live browser acceptance are recorded separately in artifacts/t3/release-0220/.
