# Pending UI performance audit

Measured 2026-11-09 against the uncommitted checkout, using the imported DMG assets. Public version remains 0.4.0. No application runtime files were edited, no build was produced, and nothing was deployed.

The reproducible bottleneck is **large Marker input with widely separated samples**. Ordinary paced strokes, held Airbrush, paper opening, and rapid tray switching remained smooth in this desktop lab. An allocation-free Marker pixel-loop prototype matched the tested output and substantially reduced isolated kernel time. Integration follow-up: the scalar per-pixel loop is now in `src/native-marker.js`. Three separate post-integration sparse-input trials reduced ordinary-CPU pointermove dispatch p95 from the original 31–44 ms range to 4.5–8.8 ms, with zero page errors. The original measurements remain intact; new raw trials are under `artifacts/t3/performance-postfix/stress-results.json`. These are local headless Chromium measurements, not native timing or a whole-application speedup claim.

## Evidence and reproducibility

All measurement files live in [artifacts/t3/performance](../../artifacts/t3/performance/). Run these sequentially from the repository root; each browser harness owns and shuts down only `127.0.0.1:4187`:

```sh
node artifacts/t3/performance/audit.mjs
node artifacts/t3/performance/stress.mjs
node artifacts/t3/performance/kernel-experiment.mjs
node artifacts/t3/performance/summarize.mjs
```

For a separate diagnostic CPU profile of sparse input, run `PERF_PROFILE=1 node artifacts/t3/performance/stress.mjs`; it overwrites that harness's result file. Retained profiled measurements are named `stress-profiled-results.json`; use the unprofiled `stress-results.json` for timing conclusions.

- [results.json](../../artifacts/t3/performance/results.json): three complete baseline trials, resource timing, image decoding, DOM frame transitions, RAF intervals, event observations, timer samples, CDP metrics, errors, loaded-source hashes, and heap measurements.
- [stress-results.json](../../artifacts/t3/performance/stress-results.json): three **unprofiled**, real-time sparse-input trials at normal CPU and explicit 4× CPU slowdown, plus a 40-stroke history memory sweep.
- [summary.json](../../artifacts/t3/performance/summary.json): calculated per-trial statistics. Percentiles use sorted samples at `floor(n*p)`; ranges below span trial statistics, not confidence intervals.
- [summary.html](../../artifacts/t3/performance/summary.html): comparison chart. [validation.json](../../artifacts/t3/performance/validation.json): successful data-integrity checks, stable loaded modules, complete frame sequences and observed errors/tasks.
- `marker-0.cpuprofile` through `marker-2.cpuprofile`, and `sparse-marker-{trial}-{rate}.cpuprofile`: diagnostic samples readable in Chrome's Performance panel.
- [kernel-experiment.mjs](../../artifacts/t3/performance/kernel-experiment.mjs) and [its result](../../artifacts/t3/performance/kernel-experiment.json): prototype and synthetic benchmark; **not application changes**.
- [native-resource-evidence.json](../../artifacts/t3/performance/native-resource-evidence.json) and [native-binary-evidence.txt](../../artifacts/t3/performance/native-binary-evidence.txt): source resource bytes, decoded programs, hashes, and relevant i386 instruction excerpts.

Environment: Apple M2 Pro, 10 logical CPUs, 16 GiB RAM, macOS arm64, Node 24.22.2, Playwright Chromium 158.0.8127.18 headless, viewport 1024×768 at device scale 1. Vite serves pending source and local imported assets, with HMR disabled and `watch:null`. No Cloudflare build, shared preview tab, production requests, or ports 4174/4175 were used.

The final baseline ran 09:27:03–09:28:12 UTC. Start/end hashes for all eight tracked source/manifest files matched, and original source-map content hashes for all 24 captured source modules matched across trials. The full source identity is in `results.json`. Browser contexts are fresh for cold cache and reused for warm reload; Vite and the browser process can remain warm. Other work shared this machine, so cold elapsed-time variation is reported rather than assigned to a single cause.

`discarded-preflight.json` is excluded: its initial capture probe did not span full dispatch, strokes overlapped previous ink, and unrelated HTML artifact writes triggered Vite reloads. `results-source-mutation.json` is also excluded from final baseline conclusions because a parallel rollover edit changed its source hash. The retained final baseline corrects all three issues, imports a fresh blank project before each painting phase, and captures loaded module hashes.

## Real-time browser results

Each baseline trial holds Airbrush stationary for approximately 2.2 seconds per size and draws Marker for 3 seconds using 180 trusted pointer moves over six rows. Rapid switching performs 20 clicks across Drawing Tools, Painting Tools, Backgrounds, and Stickers, completing its action sequence and settle period in roughly one second. Values below exclude the separately instrumented CPU-profile/canvas diagnostic phase.

| Scenario, three trials | RAF gap p95 | Largest RAF gap | Pointer-move dispatch p95 | Long tasks |
| --- | ---: | ---: | ---: | ---: |
| Idle | 16.7–16.8 ms | 16.8 ms | — | 0 |
| Background rollover | 16.7 ms | 16.8 ms | — | 0 |
| Paper first/repeat opening | 16.7–16.8 ms | 16.8 ms | — | 0 |
| Rapid tool/library switching | 16.7–16.8 ms | 16.8 ms | — | 0 |
| Small/Large stationary Airbrush | 16.7–16.8 ms | 16.8 ms | — | 0 |
| Small paced Marker | 16.7 ms | 16.8 ms | 0.6–1.3 ms | 0 |
| Large paced Marker | 16.7 ms | 16.8 ms | 1.4–3.0 ms | 0 |

No page errors or HTTP responses ≥400 occurred in the three final baseline trials. All nonempty image URLs were complete with nonzero natural width at capture. No page errors occurred in the sparse-input trials. RAF cadence and DOM changes establish browser scheduling behavior; they do **not** prove compositor presentation, visual pixel parity, a hardware-to-photon latency, or native timing.

The dispatch probe measures document capture through document bubble for the same event. It includes synchronous canvas handling and event propagation, and excludes subsequent presentation. Trusted Playwright events are automated browser input, not physical hardware samples. Paced Marker's timestamp-to-capture p95 was 12.8–15.6 ms, largely reflecting frame-aligned input delivery. Event Timing entries during the ordinary interactive phases were generally 32–40 ms at p95. The Event Timing threshold/quantization means neither absent short entries nor a pointer-move probe is a field INP measurement. This audit does not rate LCP, CLS, INP, TBT, or production Core Web Vitals.

## Material finding: sparse large Marker samples

Reproduction: start a blank picture, select Drawing Tools → Marker → Large, hold at page `(50,60)`, and alternate x between 660 and 50 over 24 samples, increasing y by 18 each time. The harness pauses 25 ms after each delivered move; synchronous work increases actual elapsed time. This intentionally adverse case models a large pointer jump or sparse input stream, rather than a normal 60 Hz path. It uses real clocks and trusted browser input, with no fake timers.

| Sparse-input condition | Move dispatch p95 across trials | Maximum dispatch | RAF gap p95 | Long tasks per trial |
| --- | ---: | ---: | ---: | ---: |
| Normal CPU | 31.4–44.0 ms | 47.3 ms | 33.4 ms | 0 |
| Explicit simulated 4× CPU slowdown | 140.7–150.3 ms | 151.6 ms | 133.4–150.0 ms | 24 |

The normal case misses the observed ~16.7 ms RAF cadence even though it stays below the Long Tasks observer's 50 ms reporting boundary. The 4× case yields 72 long tasks across three trials, with maxima 146–155 ms. Event Timing maxima were 48–56 ms normally and 160–176 ms under slowdown. CPU slowdown is a stress tool; these numbers are not predictions for a particular device or the original app.

The call chain is `handleMove` → `strokeTo` → native integer line emissions → `drawDab` → `createNativeMarkerStroke.draw`. A 610-pixel move emits approximately 204 dabs at effective spacing three. Large Marker uses the original 16×32 mask, so one event can visit about 104,000 mask positions. [native-marker.js](../../src/native-marker.js) currently constructs a destination subarray view, returns a mapped RGB typed array, evaluates an equality callback, and constructs a spread array for changed pixels. That repeated work occurs synchronously for every dab.

Diagnostic profiles consistently locate most active sampled JavaScript in the Marker pixel loop and its RGB helper. For example, `sparse-marker-1-1.cpuprofile` sampled approximately 599 ms in `draw` itself, 108 ms in `nativeMarkerRGB`, and 34 ms in its channel callback. Garbage collection was only about 10 ms in that profile: the evidence supports optimizing loop work and allocations, not claiming that GC pauses dominate. Timing conclusions above use the subsequent **unprofiled** repeat, rather than this profile.

### Concrete fix and integration API

Implement scalar channel reads/writes inside `createNativeMarkerStroke.draw`, preserving the existing `Math.fround` operation order, truncation, channel darkening, clamping, texture lookup/inversion, clipping, and dab order. Keep the public `nativeMarkerRGB(destination, color, mask, options)` helper for fixed-vector tests if useful. The owner-facing API can remain unchanged:

```js
const stroke = createNativeMarkerStroke(baseImageData, previewContext, options);
stroke.draw(maskImageData, originalPlacement);
stroke.reset();
stroke.used;
```

The artifact prototype compares every overlay byte in **36 cases**: all three actual source mask sizes, three paint colors, with/without page texture, both inversion modes, repeated overlap, and clipped placements. All comparisons passed against the current implementation. It does not replace the full suite or prove arbitrary input equivalence.

In an isolated foreground-page microbenchmark, 2,448 large-mask emissions across 12 horizontal segments took these times after discarding the first warmup repetition (seven samples each, alternating order):

| Synthetic kernel | Median | Range |
| --- | ---: | ---: |
| Current implementation | 351.0 ms | 347.5–357.8 ms |
| Scalar candidate, existing per-dab uploads | 23.5 ms | 23.3–24.0 ms |
| Scalar candidate, one dirty upload per segment | 22.8 ms | 22.1–23.6 ms |

This is a **synthetic workload measured with real `performance.now()`**, not a paced interaction or native scheduler measurement. It establishes a promising loop implementation and a ~15× isolated kernel difference; it does not establish a 15× application improvement. Batching added only 0.7 ms to the median gain over 12 segments, so retain the simpler per-dab upload initially. The parent owns any edit to `src/native-marker.js` and subsequent actual-app remeasurement. Preserve exact brush geometry and all delivered dabs; reducing input samples or changing source spacing would change fidelity.

## Cold/warm asset readiness and animation

Three local cold navigations took **125–347 ms** for `goto(load)` plus paint-ready, compared with **93–152 ms** for same-context warm reload. These are host elapsed observations, not earliest-paint timings. Each initial capture recorded 166 resources, including 138 `/original/` requests. Cold transfer was about **4,720 KiB** total, including **3,052 KiB** original assets; warm transfer was about **49 KiB** through local cache/revalidation. The 82 intercepted image decodes completed by 133–294 ms navigation time cold and 81–134 ms warm. Decode completion is not a guarantee that all possible tool/library assets have been preloaded.

These totals include unbuilt Vite code, client code, and inline source maps. Do not quote them as production bundle size, R2 latency, or production cache effectiveness. The sample is local, unthrottled and desktop-only. The fallback guide PNGs, full UI manifest and catalog are visible contributors, but this audit found no reproducible material local first-use stall that justifies changing fallback or lazy-loading policy.

The background rollover delivered every observed source frame in order and repeated. Paper opening delivered all six authored frame indices in every first/repeat run. First-use paper decoding added **13.8–15.7 ms** before opening; repeat use added **0–0.1 ms**. From the observed `opening` transition, controls became live **612.9–616.0 ms** later. Source completion is due at 600 ms; the extra delay is within the observed browser frame scheduling boundary. It is not evidence that the original app takes the same time. No invented closing motion or shorter duration is recommended.

`attachNativeRollovers` eagerly decodes the bound hover frames. The paper helper waits for required parts before beginning its timeline and caches them for reopening. Current measurements support preserving those readiness gates. A slow-network or failed-decode UX evaluation remains separate work; no artificial network delay was used in the reported results.

## Held Airbrush: requested 5 ms versus delivered callbacks

The source establishes a requested 0.005-second framework wakeup, not 200 rendered dabs per second. In these browser trials, held Airbrush delivered approximately **153–164 callbacks/second**. The requested 5 ms timeout arrived after a median **6.2–6.3 ms**, with p95 **7.0–7.8 ms**; callback work itself had p95 **0.2–0.6 ms**. There were 336–359 callbacks per approximately 2.2-second phase, with no long tasks and no material RAF gaps. Browser rendering remained coalesced through RAF.

The browser's recursive timeout includes callback execution and scheduling delay. Changing it to force exactly 200 dabs/s, replaying missed callbacks in a burst, or capping drawing to one dab per display frame is not justified by these measurements or the recovered native scheduler. Keep one eligible current-position sample per delivered callback and stop on release/blur, as the pending implementation does. Timer wrappers add small instrumentation overhead; the reported rates are observed under that instrumentation.

## Memory

After forced Chrome garbage collection, 40 separate Small Marker clicks produced this backing-storage progression:

| Completed strokes | Backing storage | Used JS heap |
| ---: | ---: | ---: |
| 0 | 1.65 MiB | 4.42 MiB |
| 8 | 13.56 MiB | 4.51 MiB |
| 16 | 25.47 MiB | 4.51 MiB |
| 32 | 49.29 MiB | 4.54 MiB |
| 40 | 49.29 MiB | 4.52 MiB |

Each full 720×542×4 snapshot is 1,560,960 bytes (1.489 MiB), matching the observed growth and the default 32-entry history limit in [paint.js](../../src/paint.js). The plateau agrees with bounded retained history. It does not measure complete process/GPU/image memory or prove absence of other leaks. This was one controlled memory sweep, not a statistical leak test. Preserve history fidelity; dirty-region/delta history is a larger optional design change, with no measured urgent need here.

## Native source boundary and primary references

The original app **has not run** on this host. Source scripts and executable instructions are primary static evidence; the browser audit measures the reimplementation. The extracted binary SHA-256 is `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.

- DMG `Data/Easel.MHK`, `tSCR` 1002: 100 ms background rollover interval; 1055: 100 ms paper opening with six draw groups. Saved raw bytes, archive/script hashes and decoded events are in `native-resource-evidence.json`.
- i386 `0x0015a52c–0x0015a54d`: interval operand installation; `0x001dfaa5` and `0x001dfb9f–0x001dfbb2`: native microsecond clock conversion. The latter clock chain is documented in [reverse-engineering.md](../reverse-engineering.md).
- i386 `0x001e2dea`, `0x001e2df2`: words forming `0x3f747ae147ae147b` = 0.005; `0x001e2e0a`: `CFRunLoopTimerCreate`. The task/window path and its additional event-loop passes are documented with addresses in [brush-tracking.md](../brush-tracking.md).
- i386 `0x00121500–0x00121681`, especially `0x001215c8–0x00121659`: source Marker channel arithmetic. `KPD3.cfg` `[Marker]` supplies brush ID 1010/density 1; `[Airbrush]` supplies brush ID 1001/spacing 0/density 4. Arithmetic scope is documented in [marker-engine.md](../marker-engine.md).
- [Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference): recording and interpreting lab traces. [CDP Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/), [Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) and [Runtime heap usage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage): instrumentation interfaces.
- [WHATWG animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames): browser animation callbacks. [W3C Event Timing](https://www.w3.org/TR/event-timing/): timing/reporting semantics. [W3C Long Tasks](https://www.w3.org/TR/longtasks-1/): the implemented observer's reporting boundary; that document is currently marked a discontinued draft.

Native event ordering, native delivered timer frequency, sound-device timing, physical input latency, compositor presentation, cross-browser/mobile behavior, production payload/latency, prolonged-session memory, paper palette/current-port CLUT selection, and runtime visual parity remain unverified. No browser result here resolves those gaps.
