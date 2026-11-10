# Bounded motion-canvas experiment

Prepared source is cdea196, whose runtime matches live0.14 (8cce3df).
This is a desktop rendering experiment, not physical iPad latency or evidence
about the reported Safari foreground animation loss. Version remains0.14.

## Reusable controls

The corrected shared replay now supports `MOTION_REVISION`: only
`native-tool-motion.js` and `native-drawing-motion.js` are served from that Git
revision, leaving the replay, studio and assets unchanged. Source hashes identify
this control. The WebKit wrapper mounts the Git common directory read-only when
needed (including linked worktrees). `PERF_ROOT` and `PORT` isolate outputs and
servers. No install, image pull, media import or original reference creation occurs.

`motionCanvases` records backing dimensions and nominal RGBA bytes, not actual
GPU/engine allocation. `MAX_MOTION_RGBA_BYTES` is an optional shared work/storage
bound. Synthetic delivered events/samples and dispatch wall times remain available
with canvas/event probes disabled. Dispatch timing includes synthetic dispatch
machinery and synchronous application listeners; it is not hardware event latency.
RAF coverage includes callback counts, observed gaps and censored endpoints.

```sh
PERF_ROOT=artifacts/t3/bounded-ui-canvas PORT=4271 INSTRUMENT=0 \
 DRIVERS=inpage TOOLS=pencil TRIALS=3 PATTERNS=60x1,60x4,240x1 \
 MAX_FRAME_P95=25 bash scripts/shared-pen-perf-webkit.sh bounded
# Add MOTION_REVISION=cdea196 for the original source control.
# MAX_MOTION_RGBA_BYTES=300000 tests the allocation bound independently of cadence.
```

Raw commands, private runner/configs, source-control exports, failed diagnostics
and full JSON results are retained in this checkout under
`artifacts/t3/bounded-ui-canvas/`. They are not release reports or native references.
The initial prototype and repeated controls use the same corrected replay,
seed53,240 samples, size16,1366x1024/DPR2 and pinned WebKit27.2 image. No test
pretends that a requested event rate was achieved without measuring delivery.

## Representation and measured result

The prototype allocates each motion canvas to all source script parts plus
restoration rectangles, clamped to the native frame, with a two-native-pixel
sampling fringe. CSS reconstructs native placement. A translated context retains
native chrome, backdrop, ordinary clipping and registration coordinates. Mode9
reads/writes subtract the explicit target origin, while source indexing and
float32 color math retain native coordinates. The default renderer origin is0.
There is no dimension proxy, retained full-size presentation copy or UI masking.
Owner replacement/disposal owns the viewport together with its existing canvas.

Three Drawing owners change from three1024x768 surfaces (9,437,184 nominal RGBA
bytes) to254x147,36x79 and373x75 (272,628 bytes, about97.1% smaller). This is
width×height×4, assuming one RGBA8 store per canvas. It excludes engine copies,
backdrop images, alignment, GPU allocations and all drawing/document canvases.

Sequential pinned-WebKit controls preserve exactly240 samples per stroke and
stable per-tool hashes across60/120/240 requested events/s and60x2/60x4 batches.
The initial three-trial Pencil source/candidate comparison gives median RAF p95
44→36ms at60x1 and callback coverage28.60→32.31/s. At60x4 p95 is46→44ms; at240x1
42→41ms. These weaker tail improvements must accompany the stronger callback
coverage result, rather than being omitted.

A second three-trial,20-cell matrix runs the candidate and then the original
source control. The table shows medians of per-trial metrics at60x1; it does not
pool frame intervals between trials or assert a physical display rate.

| Tool | Original RAF p95 ms | Bounded RAF p95 ms | Original callbacks/s | Bounded callbacks/s |
| --- | ---: | ---: | ---: | ---: |
| Pencil | 55 | 39 | 26.42 | 33.26 |
| Chalk | 55 | 41 | 25.31 | 33.06 |
| Crayon | 56 | 38 | 25.32 | 33.08 |
| Marker | 56 | 39 | 25.57 | 33.21 |

Read exact trial values in `comparison.json` rather than treating rounded table
values as raw measurements. It contains p50/p95/worst dispatch, RAF and callback
intervals, censored endpoint gaps, counts, achieved event rates and hashes for
all patterns. Callback coverage improves across the matrix; p95 barely changes
or worsens slightly in some coalesced cases. Original controls sometimes deliver
less than requested240Hz; candidate matrix deliveries span238.05–241.66Hz.
This is a material lab representation/work reduction, not a60Hz solution.

WebKit's ordinary software-compositor oracle has pre-existing small channel
mismatches. The original source and bounded target both fail Drawing18200 at
25 channels with the identical first eight differing coordinates/values
(`baseline-pixels.log`, `diagnostic-pixels.log`). No tolerance is relaxed.
Primary source/visible-stack checks and direct same-engine full/cropped frame
comparisons provide separate evidence; Chromium retains the ordinary source
oracle. Copying canonical PNG bytes avoids introducing an additional browser
Canvas conversion during test reconstruction. Source geometry and CSS/backing
sizes are checked independently of the live renderer's viewport.

## Confirmation and correctness

A final one-trial20-cell candidate reversal retains the callback gain; its
requested240Hz Chalk delivery is237.34Hz, so requested frequency is not assumed.
A separate red/green command uses `MIN_CALLBACK_HZ=30` and
`MAX_MOTION_RGBA_BYTES=300000` with60x1 Pencil. The original source exits1 at
28.76 callbacks/s and9,437,184 bytes; bounded exits0 at33.22/s and272,628 bytes.
Both have a53ms maximum observed/censored gap. RAF p95 is39 versus40ms in that
particular pair. The gate proves its explicit coverage/storage bounds, not smooth
60Hz presentation. The initial25ms frame-and-gap budget fails for both versions.

One-trial layered-picture controls include normal imported background/foreground
and two tools, with all source/candidate settled hashes identical. Pencil RAF p95
at60x1/240x1/60x4 is43/57/44ms original versus33/33/33ms bounded; Marker is
56/44/44 versus37/40/35ms. These are representative probes, not repeated scene
complexity acceptance. All172 controlled strokes retain240 chronological samples
(41,280 total), with one hash per tool/scene, stable after release. `invariants.json`
and `comparison.json` retain every confirming row, not just favorable percentiles.

Validation in this checkout:

- 223/223 Node cases, including full source registration/color pins, independent
 Crayon/Marker cropped-pixel targets, raw mode9 origin/edge clipping and source
 state/restoration union bounds.
- 59/59 primary WebKit motion cases, including all source poses, owner rerenders,
 retry/async cancellation, capture/audio/lifecycle, actual object interaction,
 full native and visible studio comparisons, and four Crayon/Marker viewports.
- 660 distinct primary/secondary/action/Stamp source frames are byte-identical on
 full and bounded WebKit targets. This compares representation directly rather
 than relaxing the pre-existing ordinary software oracle.
- Chromium motion:108/109 on the combined run; the one fake-clock cue assertion
 observed frame0 instead of1. Its isolated unchanged rerun passes1/1. Every source
 pixel/visible-stack case passes, including all ordinary selectors, Text, Grab,
 Stamp, registrations and vacated pixels. This timing flake remains recorded.
- 48/48 focused Chromium pressure/ownership/path/shared-history cases.
- 26/26 built-entry cases, including Marker blending/spacing/paper, Airbrush
 release/export/history/blur and studio pen pressure/undo/redo, plus captures.
- All eight intentional old-left-clip visible-stack negatives fail as required:
 Crayon and Marker separately at each of the four viewports, bypassing the
 native-canvas assertion. A one-pixel CSS-origin corruption is independently
 rejected by the canonical-frame source viewport check. Positive tests restored.
- 17 static captures:16 are pixel-identical to the accepted older web captures;
 Text differs by254 pixels at maximum channel difference1. A freshly built
 original-source Text capture is byte-identical to the candidate and has the
 same older-reference difference. No new presentation difference is attributed
 to cropping, and no baseline/reference is accepted or generated.

The canonical browser oracle derives each union from installer source manifests
whose registrations/bytes are separately pinned, verifies CSS placement and
actual backing dimensions, and copies PNG bytes into a canonical1024x768 frame.
It does not trust a renderer-provided origin to align output. Existing pixel
thresholds, visible-source neighborhoods and negative clipping checks remain.

No stroke input, pressure chronology, randomness, base spacing, release/cancel,
export/history, source audio gates, hit regions or frame scheduler is changed.
No actual iPad/Safari presentation or foreground-animation-loss reproduction is
available. Native reference acceptance remains0/17. Parent review/integration and
physical-device validation remain separate from this lab-supported candidate.


## Combined confirmation

A separate probes-off three-trial source/candidate pair on the combined branch
retains all240 samples per stroke and matching per-tool hashes. At60 single-sample
move events/s, Pencil RAF p95 medians are54 to39ms, Marker54 to40ms; callback
coverage medians are27.00 to32.86/s and26.44 to33.23/s. Four-sample batches give
Pencil43 to42ms and Marker43 to40ms, with some maximum callback gaps worsening.
These are additional desktop trials, not a physical-device result or a uniform
presentation gain. Raw combined receipts are under artifacts/t3/bounded-parent-confirmation/.

Text Read, voice and stepper pixel helpers also reconstruct the canonical frame;
reading their old fixed offsets directly from a cropped PNG could yield undefined
channels rather than a valid comparison. The source geometry, placement assertions,
expected pixels and tolerances remain unchanged.
