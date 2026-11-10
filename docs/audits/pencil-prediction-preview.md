# Opt-in disposable Pencil prediction preview

2026-11-10, prepared root `f5d7495208df25bac5454e0400b5dc416e24b750`
(published 0.20.0 plus Pencil API audit). Functional prototype only. Default OFF:
`createPaint(canvas, { pencilPredictionPreview: true })` explicitly enables it.
Production `main.js`, UI, profiles, native engines and version are unchanged.
Parent owns integration and the decision whether usefulness justifies enabling it.
This is not a demonstrated Pencil latency fix or SourceParity claim.

## Scope and isolation

Only an owned pen freehand procedural Pencil stroke is eligible. Chalk, Crayon,
Marker, shapes, native images/dabs/tracking, timed tools, wacky mode, mouse and
finger are excluded. The actual current studio default Pencil is procedural and
eligible; the private fixture injects the hook into the served/built entry point
without editing it. It also exposes existing APIs for checks, not production UI.

Every actual/coalesced sample still enters the original renderer in order.
Prediction lists are read separately after actual consumption, never appended to
actual input. The existing `strokeTo` spacing, remainder and pressure interpolation
and pure Pencil `drawBrushDab` run against a shallow stroke clone with a copied
last point and validated future point objects. PressureInput.sample and its
last-positive pressure are never invoked for estimates. Eligible Pencil consumes
no RNG; native engines are neither cloned nor adapted.

Prediction pixels are confined to the existing disposable `work` surface. Each
predicted display composition clears it, copies the actual preview once, extends
that copy, then passes it privately to display composition in the original ink
position, below moving paint/foreground. No additional permanent full-stage
canvas, per-sample image copy, image readback, frame observer or RAF is added.
At 720x542, one existing RGBA scratch raster is 1,560,960 bytes; the extra work is
one full-preview drawImage plus at most 4096 estimated dabs per composition and
at most 16 point objects and a shallow stroke clone. This describes operations,
not allocated GPU memory, throughput or photon latency.

Canonical compose/renderTo, art, actual preview, visibleInk, save, sampling,
clipboard and export never select the predicted surface. Midstroke save/export
retain baseline semantics: an uncommitted procedural actual stroke is not yet
saved either. Treating all visible actual preview as saved would be incorrect.

## Validity and lifetime

Accept only finite coordinates/pressure in [0,1], pen identity matching the owner,
strictly increasing timestamps later than the dispatch, actual/coalesced samples
and current performance.now(). Reject batches over 16, over 4096 spacing-derived
dabs, or over 100ms from dispatch. Dispatch timestamps must be finite, no older
than 100ms, not in the future and not before this gesture's consumed chronology.
The 100ms bounds are conservative work/clock policy, not a claimed useful horizon
or latency improvement. Different/invalid timestamp clock domains fall back.
Zero predicted pressure models the existing move fallback .5 without changing
actual release-pressure memory. No velocity extrapolation is invented.

A new actual owner move first discards the prior list, even if the replacement
is empty, missing, throwing, invalid or reversed. Expiry is scheduled from the
last accepted UA timestamp; synchronous render also checks expiry. Event-loop
suspension can delay timers and display, so no presentation deadline is promised.
Up/cancel/capture loss, Escape, blur/hidden/pagehide/resize, option changes,
layer/document/history actions and destroy clear prediction. Generation and
stroke identity guards prevent stale callbacks drawing into a later stroke or
recreated instance. Secondary contacts do not replace the owner.

## Functional receipts and limits

The fixture uses actual PointerEvent constructor predicted lists in Chromium and
WebKit, with explicitly modeled future timestamps and a synthetic capture shim.
Coalesced lists use an explicit method shim; actual consumption is traced.
It compares predicted RGBA against a separate real Pencil renderer extended
through identical future points. Each oracle has its own document/input owner.
The iframe's initial browser resize is settled before timed lifecycle checks.

Checks cover actual coalesced consumption/pressure/last/step/remainder traces,
zero Pencil RNG draws, temporary wrong tails and correction, exact final RGBA,
project art, PNG serialization, clipboard, one undo/redo, authoritative midstroke
sampling/composition, foreground occlusion, default-off/excluded contacts/tools,
API fallback, expiry without fresh input, interruptions and destroy/reuse with
late callbacks. Actual studio default Pencil is checked via private hook injection.
The studio scene export remains canonical while a predicted stroke is displayed.
Final receipts: 52 functional assertions in each of Chromium/WebKit dev/built
(208 total), 27 focused Node passes, 33 Chromium regression passes and 32 WebKit
regression passes with one existing CDP-only skip. The regression subset is
pencil-pressure, brush-engine and tool-tab-lifecycle. Private Cloudflare builds
pass. These are functional assertions, not 208 independent hardware trials.

A negative control disables eligibility only in the private server transform:
`red.log` exits 1 at `temporary tail is visible`. It passes the earlier canonical
checks, then fails because the expected disposable tail is absent. Initial
fixture failures (shared document ownership, iframe initial resize, clock setup,
and a throwing-API receipt helper) remain separately labeled, not pooled.

A short trusted Chromium CDP pen receipt delivered eight trusted pen moves:
counts `[0,0,0,0,1,1,0,0]`. Two nonempty browser prediction lists are established
under this automation, independently of the modeled functional oracle. They do
not establish physical Pencil delivery, accuracy, supported iPad hardware,
usefulness, or input-to-photon latency. The receipt is preserved and reused on
reruns rather than repeatedly probing. Pinned WebKit is Linux automation, not
physical Safari. See `pencil-api-capabilities.md` for primary API references.

## Reproduction and handoff

Use existing read-only dependencies/media links only; no install or download:

```sh
node --test scripts/pencil-prediction.test.mjs scripts/parity/pointer-samples.test.mjs scripts/parity/native-brush-tracking.test.mjs scripts/parity/native-brush.test.mjs
PENCIL_PREVIEW_FAULT=disable bash scripts/pencil-prediction-preview.sh # expected exit 1
bash scripts/pencil-prediction-preview.sh
PENCIL_CHECKS=1 bash scripts/pencil-prediction-preview.sh
```

All browser phases hold host flock `/var/tmp/kidpix-ui-validation.lock` across
the entire container/server/browser lifetime. Private ports are 4611/4612.
Existing pinned image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`,
`--pull never`, dropped capabilities, host UID/GID/network, shm512m, read-only
source/dependencies/media and only own artifacts writable. The private Cloudflare
build disables public media copies. Traces persist on failure only.

Ignored receipts/build/logs and exact commit HANDOFF are in
`artifacts/t3/pencil-prediction-preview/`. No main.js/native command/core edit,
original software/EULA, push, deploy, production enabling, baseline change,
release gate or broad performance experiment. Parent dirty SERVER_HANDOFF,
Clipboard80a0661, original media/history/source animation/audio and other
worktrees remain untouched. Native0/17, physical Pencil benefit,
foreground-visible idle and audible feel remain unverified; vacuum stays disabled.

## Independent review corrections

The initial fixture’s 208 assertions were not clean acceptance: both Marker controls could throw `Native Marker requires original bitmap dimensions` and still compare equal. Preserve those original logs as superseded implementation evidence. The fixture now fails on any browser page error, uses explicit empty originalTools for procedural exclusions, and separately exercises native Chalk/Crayon/Marker with supported 720×542 geometry and loaded original assets. Native controls must actually change pixels before prediction-enabled/disabled comparisons and committed-ink checks.

An injected uncaught page-error negative control fails at the new acceptance gate. The corrected four Chromium/WebKit development/built lanes each pass61 assertions with zero page errors (244 total). The existing benchmark instrumentation is updated at its strict strokeTo/drawDab/compose signatures, forwards optional target arguments, and excludes disposable predicted continuation from actual-consumption/sample counters. All35 focused Node checks pass; new executable wrapper checks validate argument forwarding and actual/predicted recording separation. Older transform guards fail against the original prototype as recorded by independent review.

Private output directories are selectable without replacing original evidence. The first regression rerun used an old fixed output directory on the read-only mount and failed before a browser launched; that setup failure remains retained. The regression config now uses its selected private output path. The corrected regression run passed33 Chromium checks and32 WebKit checks with one explicit skip. A subsequent independent review found the remaining cold-load seam and native fallback acceptance gaps below. No runtime code, main.js, source artwork, version or default enablement changed in these corrections. Physical Pencil accuracy and latency remain unverified.

## Cold-load and native-path acceptance correction

A second review found an additional strict consumer, cold-drawing-load.mjs, still matching the former two-argument strokeTo signature. Its instrumentation now delegates to coldPaintTransform, with strict unique-seam checks and actual-preview-only sample logging. Executable controls test missing/duplicate seams, optional-target forwarding, exclusion of prediction records, and actual cold-plugin delegation. A repository-wide script/source scan found no other old declaration seams; ordinary two-argument function calls remain valid.

The previous native fixtures could accept procedural fallback after asset failures. Native setup now requires the returned image, successful decode, complete/nonzero dimensions, and no onError reports. Private strict instrumentation records entry into the actual native Marker or original-dab branch with the expected decoded brush source and ID; both controls must use it before pixel comparisons count as native coverage. All four fixture injection seams reject absent or duplicated matches. Blocked-native-asset negative controls and four clean browser lanes are queued; their results and a new independent recheck remain pending. The prior244 assertions with zero page errors did not establish fail-closed native-path acceptance. All39 focused Node checks pass. These changes remain confined to diagnostic scripts/tests; production runtime and default-OFF policy are unchanged.

## Reviewed default-off integration

The final correction review found no remaining default-off integration objection. It independently passed39 Node tests,28 seam controls,8 native-setup controls,292 clean browser assertions and320 combined-instrumentation assertions. All12 expected negative lanes reject blocked assets, parent/iframe errors, disabled prediction and procedural native-branch bypass; traces remain retained. Parent validation separately passes292 assertions with zero page errors and rejects blocked native assets in both engines. Temporary input links are removed. Exact review evidence remains in `/home/zsrobinson/.t3/worktrees/kidpix/t3-cee19558/artifacts/t3/pencil-final-review/`.

This clears the reviewed default-off renderer and diagnostic corrections for integration. It does not establish physical Pencil accuracy or input-to-photon improvement. An explicit experimental browser setting requires separate application integration, user-flow review and release checks; automatic enablement remains out of scope. The display read-frequency experiment is rejected independently and the existing presentation-context setting remains unchanged.
