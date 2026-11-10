# Easel tool-tab state motion

The eight main tool tabs previously used static press/selected bindings and
auxiliary hover animation. They now render the authored rest and tracking
programs, with selection owned by the committed application tray. This is UI
feature work; it makes no performance or original-runtime timing claim.

## Source and scope

Mac Easel MBTN75 rows4–11 identify Mixer237, Grab227, Eraser228, Text229,
Stamp236, Draw232, Paint233 and Fill234. All are kind1/mode1/group1. Their
24 complete initial programs1012–1035 contain80 registered56×56 frames at100ms.
Rest/tracking have three frames, end-check3 and cue1001/1002 on channel1 at tick0.
Auxiliary has four frames, end-check4, no cue, repeats and cancels on leave.
States1/2/3 share a script. Same-script state changes retain progress and audio.

The independent fixture [tool-tab-motion-source.json](../../tests/fixtures/tool-tab-motion-source.json)
records raw row words/hashes, complete-program hashes, signed origins/coordinates/
registrations, geometry,80 RGBA hashes and116 required media file hashes. It was
reduced from the completed read-only source audit, independently of production
metadata. No raw program hex or original disassembly payload is published.
The verifier parses the small programs directly, uses the existing portable Mac
archive/bitmap codecs, composes in memory and compares existing PNGs. It neither
runs the executable nor exports media. The original four-library verifier and
its40 frame pins are unchanged.

Kind1 geometry uses the initial auxiliary group's rectangle, replacing the
rest/tracking initial union; these rows happen to agree throughout. Hit tests
remain left/top inclusive and right/bottom exclusive. All eight selected static
images equal their authored tracking terminals. No static baseline change is
intended. The conservative116-key dependency set comprises80 frames,32 static
fallbacks, two metadata files and two WAVs;48 state frames are newly loaded.
The parent has separately verified public bodies; this work makes no new public
verification or release claim.

## Adaptation and policies

`attachLibraryMotion` keeps its existing API and defaults. Its stream/input
machinery is shared through `attachMode1Motion`; `attachToolTabMotion` supplies
explicit bindings, authoritative selection and terminal-adoption policy. It does
not duplicate the library manager. Legacy rollover callable disposal, suspension,
fallbackNames and enabled wrappers remain available. Group1 cleanup coordinates
all12 controls and cancels only auxiliary peers on hover.

- **Hydrate/adopt:** own all frames only after decoding every state/aux frame.
  Seed the current tray's terminal tracking or rest frame, finished, silently,
  with no audio handles. Failure keeps static and auxiliary fallback; entry
  retries. A held fallback contact defers ownership until after its browser
  release/default-click transaction. A bounded adoption task is cleared on
  cancellation; generations and disposal reject stale decoding.
- **Live selection:** `showTray` synchronously calls `updateSelection` after
  committing the tray. A→B starts only A's rest and B's tracking, once. An
  incoming held tracking stream retains its deadline, frame and sound handle.
  Repeated showTray/ARIA writes and selected repress preserve the unchanged
  script; repress does not restart its cue. Programmatic Grab selection follows
  the same hook. Object placement, stamp choice and text focus are not selection
  sources. A no-op/rejected command restores the authoritative terminal silently.
- **Cancellation:** interruption restores authoritative terminals silently;
  actual deselection remains audible. Aux leave/group cleanup restores the
  backing stream's saved remaining deadline without cue replay or wall-time
  catchup. Sound observers are retired before pausing owned audio; unrelated
  streams are never globally stopped. Pending playback, including initially
  paused audio, holds the finite end gate. Actual pause/error/ended releases it.
- **Input:** shared document first-contact arbitration covers canvas, libraries,
  tabs and secondary controls. Keyboard contacts participate in the same guard;
  only physical pointer IDs are passed to pointer capture APIs. Capture, exact
  rectangular drag-out/in, once-only semantic dispatch, WebKit touch/mouse
  compatibility IDs, fresh input disposition, Enter/Space, repeats and cancelled
  key defaults retain the existing browser policies. Semantic detail0 clicks
  remain usable after cancellation.

The adapter exposes `names`, `ready`, `ownsCue`, `updateSelection`,
`completeActivation`, `cancel`, `cancelGroup` and `dispose`. Selection updates use
`liveSelection` for authored transitions; `hydrate`, `adopt` or `cancel` updates
restore terminal state silently. Main completes each tool activation synchronously
so legacy1002 suppression applies only while that exact ready stream owns the
activation. Library1000, secondary tools, stamp assets and text/audio routes are
unchanged. Finite completed actors retain their terminal and stop requesting RAF.
Canvas bounds, pressure, sampling and history code are unchanged.

## Verification

Use existing dependencies/media, with private artifacts and strict4471/4472
servers. Source-helper cases carry `@module` and are excluded from built-app
checks; actual app checks exercise the production bundle.

```sh
npm test
npm run verify:assets
PYTHONDONTWRITEBYTECODE=1 "$PIL_PYTHON" scripts/verify-tool-tab-motion.py \
  --resources "$MAC_RESOURCES" --media public/original
PYTHONDONTWRITEBYTECODE=1 "$PIL_PYTHON" scripts/verify-library-motion.py \
  --resources "$MAC_RESOURCES" --media public/original
node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/tool-tab-motion/configs/dev.mjs tool-tab-*.spec.js
node node_modules/vite/bin/vite.js build --configLoader runner \
  --config artifacts/t3/tool-tab-motion/configs/vite.mjs --mode cloudflare
node node_modules/wrangler/bin/wrangler.js deploy --dry-run \
  --assets artifacts/t3/tool-tab-motion/build --outdir artifacts/t3/tool-tab-motion/worker
```

The static-binding delta runs the identical visible tracking assertion with
`TOOL_TAB_STATIC_BASELINE=1`, replacing only the adapter in development. It fails
at the intended unchanged-frame assertion; the implementation must pass it.
Pixel checks cover all80 frames over the actual studio and independently hash
the source PNG RGBA. Ownership fixtures cover every initial selection in both
forward/reverse decode order, cancellation/disposal during decoding and transient
selection commits. Actual-app tests cover readiness before/after fallback release,
failure/retry, touch document-bubble activation counts, stream continuity, finite
sound gates, cancellation and fresh input. Existing40 library frames, rollover,
audio, primary/secondary/action/stamp, geometry and input tests remain regressions.

Validation passed262 Node checks, asset verification, independent80-frame raw
verification and the unchanged40-frame library verifier. Chromium's broad built
run passes179 cases. Its development run recorded219 passes and one overbroad
repress sound-count assertion; the corrected exact-handle/frame assertion and
lifecycle/delta recheck pass16 cases. Pinned WebKit27.2 passes104 development and
83 built cases. The final private rebuild passes35 Chromium and18 WebKit smoke
cases. No assertion thresholds or static baselines changed.

Exact commands, final run counts and any interrupted/failed attempts are recorded
in the private `artifacts/t3/tool-tab-motion/HANDOFF.md` and logs.


## Fallback keyboard review correction

Independent review reproduced a slow-decode ownership race in Chromium and
WebKit development and built apps. Releasing Shift while fallback Paint still
held Space ended the fallback keyboard contact, allowing another pointer to
select Grab before Space-up. The document keyup listener now finishes only when
its key matches the held activation key. Explicit cancellation and the normal
release/default-click transaction retain their existing paths.

The actual-app regression blocks a Paint frame, holds Space, optionally presses
and releases Shift, then completes decoding and attempts a competing Grab click.
The control without Shift passes before the fix; the Shift case fails at the
ownership assertion. After correction, artwork remains deferred, Grab stays
unselected, and no tray activation occurs until Space-up. That release selects
Paint exactly once, silently adopts the terminal art, and permits a fresh Grab
press. No source program, cue, deadline, geometry or shared-audio helper changed.

## Limits

Native references remain0/17. First-display native sound suppression/order,
transient owner callbacks/compositing, later alias/virtual slot replacements,
wall-clock timing, physical iPad/Pencil latency, audible behavior and foreground
idle remain unproved. This supports the audited initial programs with explicit
browser hydration/adoption and terminal-retention policies. Enlarged vacuum stays
disabled. Clipboard work, release captures, baseline approval, public verification,
versioning and deployment remain parent responsibilities. Version remains0.18.0.
