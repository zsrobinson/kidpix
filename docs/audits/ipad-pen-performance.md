# Warm pen performance: isolated 0.13 follow-up

Measured 2026-11-10 from published root `e90450293cb4ae6f5102af32f12a278e5d28661e` in the isolated `t3-604bb74f` checkout. No Clipboard integration, publication, native runtime job, or asset/export changes. Original runtime references remain **0/17**. Physical Pencil-to-photon latency remains **unverified**.

Two narrow changes have measured support:

- Cache the immutable source raster of native brush images, while recalculating every random and paper coefficient for every dab. This reduces Chalk handler CPU in Chromium; it does **not** materially improve the measured WebKit workload.
- Accumulate native Marker dirty regions and upload once before preview composition/commit. Destination blending still executes for every dab in original order. The factory retains immediate uploads by default; the studio opts into deferred uploads. This reduces WebKit handler tails; observed WebKit frame cadence remains too slow.

Neither change establishes a fix for the friend's actual iPad lag. Pencil's own paced handler path was already inexpensive in this desktop Chromium lab.

## Environment and boundaries

Host: Linux x86_64, AMD Ryzen 5 3600, 12 logical CPUs, Node24.22.2, Playwright1.65.0, Chromium158. Desktop WebKit27.2 ran in the already-present image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`. Container Node26.13.0. No downloads or installs.

The viewport is1366×1024, DPR2, with touch enabled. This is engine coverage with an iPad-sized viewport, not iPad hardware or a mobile Safari timing model. Chromium uses an explicit4× CDP CPU slowdown. Alternating calibration runs of a fixed integer loop produced median10.2ms at1× and about41.8–41.9ms at4×, roughly4.1× on this host. This calibrates the stress setting only. [Chrome documents why CPU throttling cannot truly simulate mobile CPU architecture](https://developer.chrome.com/docs/devtools/performance/reference#throttle-the-cpu-while-recording).

All painting runs were sequential on private4241. Built checks used4242 and a private build directory. No shared preview was opened. Dependencies and media were linked as input; the container mounted them read-only. The initial Vite bundled-config loader attempted transient writes under `node_modules/.vite-temp`; it was replaced with `configLoader: 'runner'`. No temporary files remained in that directory. Subsequent read-only container runs passed. Cache, build, traces and outputs belong to this checkout.

Metrics are instrumented API observations, not zero-overhead field telemetry:

- Handler: document capture to bubble for each paper `pointermove`; includes actual studio listeners and synchronous rendering. Pointerdown/history snapshot and release work are in stroke canvas totals, not move percentiles.
- Next RAF: handler-entry-to-next-RAF callback proxy. It excludes hardware sampling, OS input delivery and compositor presentation. It is **not** pencil-to-photon latency or a confirmed paint timestamp.
- Frames: RAF callback intervals. Goals are16.67ms at60Hz and8.33ms at120Hz; headless Chromium's observed cadence is60Hz, so counting16.7ms intervals over the120Hz budget does not establish dropped120Hz frames.
- Canvas counts/times instrument `getImageData`, `putImageData`, `drawImage`, clears and fills across the stroke, including live UI animation work. They do not establish bytes copied internally, GPU cost, or compositor latency. Heap/CDP metrics are cumulative snapshots, not allocation counts. Long-task observation is conditional on browser support; absent entries do not imply no expensive work.

## Workload and feedback loop

`scripts/pen-perf.mjs` drives the real studio entry point, selects tools/sizes through UI actions, awaits paint readiness and image decoding, draws/undoes a warmup stroke, then runs100 move events over approximately1.67 seconds with real clocks. The selected source brush is warm. Background UI animation callbacks remain enabled. Optional idle/tool-hover phases are recorded separately; their startup intervals are not painting measurements.

Pencil, native Chalk/Crayon and Marker were explored at medium/large sizes with120/240Hz-shaped coalesced delivery and browser-delivered CDP pen events. Slow5px/batch and fast25px/batch triangle/sine paths cover approximately300/1500 native pixels per second. Pressure varies smoothly. Coalesced replay delivers2/4 chronological interpolated samples per60Hz event batch; replay is synthetic and shims only pointer capture. CDP delivers trusted pen input with real capture,100 moves per stroke. Neither is physical Pencil input. Final repeated comparisons pin only the existing brush PRNG seed to53 via a benchmark-server transform; clocks and scheduling remain real.

The original slow/fast Chromium sweep did not reproduce sustained pen lag. Before optimization, ranked falsifiable hypotheses were: dynamic mask readback/tint cost scales with dab count; composition cost scales across tools with page composition count; or delivery/scheduling stalls increase RAF gaps while handlers stay short. The retained Chalk CPU profile attributes about104ms to `getImageData`, versus21ms in mask arithmetic, supporting removal of repeated immutable-source readback. WebKit then exposed a different signal: Marker `putImageData` accounted for roughly half a second per stroke despite already using dirty rectangles. Combining uploads tests that specific cost without dropping dabs.

Red/green checks:

- `native-mask-cache.spec.js` passed exact random/paper pixel assertions but failed with8 readbacks before the fix; after caching it passes with5 (one source raster plus four existing CSS color reads).
- The deferred Marker Node test failed before implementation, then passed: multiple overlapping/clipped dabs produce the exact immediate-upload pixels, one dirty-union upload, no duplicate flush and no stale upload after reset.
- The perf harness can fail on `MAX_HANDLER_MS`, `MAX_READBACKS` or `MAX_UPLOADS`. Set `MAX_UPLOADS=200` for the fixed Marker replay below: baseline strokes have901 uploads (941 with first-stroke UI work), versus101 (141 with that same UI work) after batching. This is a rendering-work regression bound, not an iPad latency acceptance threshold.

## Repeated comparisons

Each cell is the median of three per-trial statistics, except **worst**, which is the maximum of all three trial maxima. All times in milliseconds. Same host/workload/seed/engine/throttle on each side. Raw individual trials, canvas totals and sample counts are retained; first-stroke UI work is included rather than hidden.

| Tool / lane | Handler p50 before→after | Handler p95 before→after | Worst before→after | RAF p95 before→after | RAF worst before→after | Next-RAF p95 before→after |
|---|---:|---:|---:|---:|---:|---:|
| Chalk medium, Chromium4× replay240 |2.5→1.9|3.2→2.6|4.0→3.4|16.7→16.7|33.4→33.4|6.0→5.8|
| Chalk large, Chromium4× replay240 |2.9→2.4|3.7→3.1|4.7→3.7|16.7→16.8|16.8→16.8|6.4→6.1|
| Chalk medium, Chromium4× CDP pen |1.8→1.3|2.4→2.1|3.2→3.2|16.8→16.7|16.8→16.8|2.6→2.3|
| Chalk large, Chromium4× CDP pen |2.1→1.6|2.7→2.2|3.5→2.7|16.7→16.8|16.8→16.8|2.9→2.6|
| Marker medium, WebKit replay240 |4→4|22→13|37→27|44→41|59→63|41→37|
| Marker large, WebKit replay240 |5→4|20→11|38→15|42→40|57→56|40→37|

Chalk's source readbacks fall from1603 to802 per warm replay stroke; corresponding native mask uploads remain801 on both sides. CDP strokes retain100 trusted moves and all100 samples; coalesced replay retains100 moves and all400 samples. Marker batching retains these same input counts and executes every destination blend; only upload count changes. Marker Chromium4× p95 is essentially unchanged: medium replay1.9→2.0, large replay2.2→2.2, medium CDP1.5→1.7, large CDP1.9→1.8ms. Do not claim a uniform improvement across engines or percentiles.

WebKit Chalk large p95 remained24ms before/after caching in the exploratory single trial. Steady WebKit Marker frame median remains36ms after batching. Smaller handler tails therefore do not establish a smooth60Hz stroke, let alone120Hz presentation. Some worst RAF gaps increase. Chromium has no observed long tasks in these repeated warm strokes. WebKit long-task entries are not used to infer absence of work.

## Checks and source fidelity

- 200 Node tests passed; the final dirty-union rectangle assertion also passed separately.
- 20 focused Chromium browser checks passed after both changes.
- 19 focused pinned-container WebKit checks passed, with1 expected Chromium-CDP-only skip.
- 8 built Chromium checks passed on private4242, including actual Marker blending/paper/spacing, held-stroke history, Airbrush behavior, Dry Brush source coverage and studio pen pressure undo/redo.
- 432 exact comparisons against the retained baseline `paint-original.js` passed: real source mask sizes, Chalk/Crayon/Marker-approximation/Dry Brush, three colors, paper/no paper, inversion, three pressure-scale transforms, overlapping and clipped placements. Destination-dependent Marker is covered separately by the actual studio brush-engine tests and deferred/immediate unit comparison.
-Pressure tests compare whole canvases for neutral pen/mouse equality, coalesced versus separate samples, release pressure, interpolated dabs, foreign pointer rejection and exact undo/redo. No sample filtering, prediction API or base-spacing change.

The0.8 source-only validation was read as the historical reference boundary (185 pass/6 skip,17 web captures unchanged, native0/17). This task does not manufacture new native comparisons or claim a fresh17-capture release run. UI animation lifecycle, Pencil hover clipping, audio and public delivery issues belong to the parent/other workstreams. These commits do not touch their modules.

## Reproduction and artifacts

First provide local read-only input links `node_modules` and `public` to the existing dependency/media trees. The harness never installs assets. Record a source baseline before applying fixes:

```sh
mkdir -p artifacts/pen-perf
git show e90450293cb4ae6f5102af32f12a278e5d28661e:src/paint-original.js > artifacts/pen-perf/paint-original-reference.js
git show e90450293cb4ae6f5102af32f12a278e5d28661e:src/native-marker.js > artifacts/pen-perf/native-marker-reference.js

# Full exploratory matrix; MAX_HANDLER_MS enables a configurable time budget.
TRIALS=1 SPEED=25 CPU=4 PERF_OUT=artifacts/pen-perf/sweep node scripts/pen-perf.mjs

# Repeat each command sequentially with its reference variable omitted for after.
TOOLS=chalk TRIALS=3 SPEED=25 MODES=replay240,cdp CPU=4 REFERENCE_SOURCE=artifacts/pen-perf/paint-original-reference.js PERF_OUT=artifacts/pen-perf/chalk-before node scripts/pen-perf.mjs
TOOLS=marker TRIALS=3 SPEED=25 MODES=replay240,cdp CPU=4 REFERENCE_MARKER_SOURCE=artifacts/pen-perf/native-marker-reference.js PERF_OUT=artifacts/pen-perf/marker-before node scripts/pen-perf.mjs

# Profile separately; do not mix profiled measurements into timing comparisons.
TOOLS=chalk SIZES=16 TRIALS=1 SPEED=25 MODES=replay240 CPU=4 PROFILE=1 PERF_OUT=artifacts/pen-perf/profile node scripts/pen-perf.mjs
REFERENCE_SOURCE=artifacts/pen-perf/paint-original-reference.js node scripts/pen-perf-compare.mjs
node scripts/pen-perf-summary.mjs artifacts/pen-perf/final-before/results.json artifacts/pen-perf/final-after/results.json
npm test
node node_modules/@playwright/test/cli.js test -c scripts/pen-perf-tests.config.mjs native-mask-cache pencil-pressure brush-engine brush.spec
BUILT=1 node node_modules/@playwright/test/cli.js test -c scripts/pen-perf-tests.config.mjs brush-engine brush.spec pencil-pressure --grep-invert @module
```

For WebKit, use the retained `artifacts/pen-perf/run-webkit.sh`: it runs the same harness inside the pinned image with read-only source/input mounts and private writable artifacts. `TOOLS=marker TRIALS=3 REFERENCE_MARKER_SOURCE=artifacts/pen-perf/native-marker-reference.js bash artifacts/pen-perf/run-webkit.sh marker-webkit-before`; omit the reference variable for after. `PHASES=1` in that wrapper records separate idle and tool-hover windows. The initial idle window contains engine/UI startup gaps (~376ms) and is not a warmed idle latency result; subsequent hover windows p95≈42–43ms show that this WebKit environment also schedules unevenly without a painting gesture.

Raw outputs are **in the isolated checkout**, under `artifacts/pen-perf/` (ignored by Git):

- `final-before/results.json`, `final-after/results.json`, `chalk-summary.json`: authoritative fixed-seed Chalk comparison with evenly interpolated coalesced samples.
- `marker-chromium-{before,after}/results.json`, `marker-chromium-summary.json`.
- `marker-webkit-{before,after}/results.json`, `marker-webkit-summary.json`.
- `profile/chalk-16-replay240-0.cpuprofile`: exploratory CPU sampling evidence; its initial RAF gap includes profiler setup and is excluded from timing conclusions.
- `exact-pixels.json` (432/0), `cache-red.log` (8 vs5 reads), `marker-red.log`, `node-final.log`, `marker-final-node.log`, `browser-final.log`, `webkit-final.log`, `built-final.log`.
- `upload-red.log` (exit1), `upload-green.log` (exit0), `calibration.json`, `calibrate.mjs`, baseline source snapshots, and the read-only Docker wrapper.

Earlier `preflight`, `baseline`, `fast-baseline`, `repeated-*`, `seeded-*` and single-trial `webkit-*` runs are exploratory. Preflight failed before the capture shim was corrected; the final comparison corrects its coalesced sample interpolation and fixes the PRNG seed. Do not pool these datasets.

## Remaining acceptance

Confirm on the friend's actual iPad: model, iPadOS/Safari/Pencil, affected tools/sizes, light/heavy and fast/slow strokes, coalescing/delivery counts if instrumentation can be captured, idle/app-switch/lock recovery, mixed tool strokes, layers/foreground/export and one undo/redo per stroke. The parent should benchmark the combined branch after resolving ordinary conflicts and decide publication. The immutable-raster cache retains two small pixel arrays per live brush-image key; it assumes loaded brush images remain immutable, as existing tint caches already do. The Marker change adds an explicit flush boundary before every composition/commit; future callers opting into deferred uploads must honor it. No shared UI scheduling change was attempted.
