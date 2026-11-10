# Shared drawing latency: corrected delivery experiment

Prepared source: live0.14.0, `8cce3df7e9fd06cb9c99b4bed5ddf3b0e7b76a87`.
The physical report concerns **all drawing tools**, and Safari remained visible
when animations stopped. This experiment does not reproduce or resolve either
physical-device symptom. No production scheduling or rendering change is justified
by the results below. Original runtime references remain0/17.

## Reusable loop

`scripts/shared-pen-perf.mjs` runs the real studio, real clocks, warm brush assets,
blank picture, fixed seed53, size16 and240 chronological pressure samples along
one fixed path. It compares in-page synthetic replay (one protocol call for the
whole gesture), protocol-paced synthetic replay (one awaited call per event),
and trusted Chromium CDP pen input. Synthetic replay shims pointer capture and
explicitly supplies coalesced samples; it is not browser or hardware input.

The matrix distinguishes **move events** from samples:60/120/240 requested events
per second with one sample, and60 events/s with2/4 samples. Every case has240
samples; event counts are240/120/60. Thus intended durations differ:4/2/1 seconds
for individual events,2/1 seconds for coalesced batches. This preserves path,
spacing, pressure chronology and total work, while making event-rate and
sample-rate differences explicit. It does not hold stroke velocity constant
across every matrix cell. Compare240x1 with60x4 for equal duration/sample rate,
or120x1 with60x2. Delivered intervals, achieved average event frequency and
sample counts are retained; requested frequency is never treated as achieved.
Real timer jitter and catch-up bursts remain visible in raw delivery records.

Blank-page and warmed-app idle RAF windows precede strokes. All scene assets are
local; cold network loading is outside this experiment. `SCENE=layered` imports a
generated editable picture with background and partially occluding foreground
through the existing file input. These fixture images are generated in memory;
no original media or web capture reference is changed.

Canvas probes report synchronous method wall time/counts, not GPU/compositor
cost or internal copied bytes. Capture-to-bubble pointermove timing includes
synchronous application listeners. Native event timestamp age, intended replay
deadline age, oldest sample's *modelled* deadline age, and next-RAF callback delay
are separate proxies. Synthetic timestamps are construction timestamps, not
hardware sampling timestamps. No physical event/sample age can be recovered.
`INSTRUMENT=0` installs neither canvas wrappers nor pointer timing listeners;
it retains the independent RAF sampler and replay delivery bookkeeping.
`PROFILE=1` and `TRACE=1` collect separate Chromium CPU/timeline evidence.

Pixels are hashed after the protocol release returns and compared again after
subsequent RAF callbacks. These assert settled replay consistency, not an atomic
release/export boundary. In-page and protocol synthetic hashes must match across
patterns/trials for each tool. Delivered sample counts are asserted. The harness
makes no new runtime buffering change, so there is no new asynchronous boundary
to prove. Existing cancellation/history/pressure source tests remain applicable.

`MIN_DELIVERY_HZ` fails delivery-fidelity regressions. `MAX_FRAME_P95` is an
optional lab RAF budget, not a physical-device acceptance criterion. A16.67ms
60Hz goal and8.33ms120Hz goal concern presentation; RAF callbacks do not prove
presentation. These desktop engines do not establish120Hz panel behavior.
Viewport1366x1024, DPR2 and optional Chromium CPU4x are stress/coverage settings,
not an iPad model. WebKit27.2 uses the pre-existing pinned Playwright container;
Chromium158 uses the host browser. No installs/downloads are required.

## Ranked hypotheses and outcomes

1. Protocol pacing limits delivery: compare achieved rate with the in-page loop.
2. Environment/application scheduling limits RAF: compare blank and warm idle.
3. Per-event composition dominates: compare240x1 and60x4, preserving all samples.
4. Instrumentation dominates: compare wrapper/listener-free control.

Detailed results and a rejected context-allocation probe follow below. All raw
outputs and exact commands are under the isolated checkout's ignored
`artifacts/t3/shared-pen-performance/`; they are not root release artifacts.

## Reproduction

Provide read-only input symlinks to existing `node_modules` and `public`. The
harness owns4251 and its output/cache; focused built checks used4252. Run lanes
sequentially on a quiet host. The harness closes its browser and server in
`finally`, including failed budgets. The prepared container wrapper with exact
read-only mounts and image digest is retained with the raw evidence.

```sh
TOOLS=pencil TRIALS=3 PERF_OUT=artifacts/t3/shared-pen-performance/pencil node scripts/shared-pen-perf.mjs
TOOLS=chalk,crayon,marker DRIVERS=inpage,protocol TRIALS=3 PERF_OUT=artifacts/t3/shared-pen-performance/textures node scripts/shared-pen-perf.mjs
INSTRUMENT=0 DRIVERS=inpage PATTERNS=60x1,240x1,60x4 PERF_OUT=artifacts/t3/shared-pen-performance/off node scripts/shared-pen-perf.mjs
PROFILE=1 TRACE=1 TOOLS=pencil,marker DRIVERS=inpage PATTERNS=240x1 TRIALS=1 PERF_OUT=artifacts/t3/shared-pen-performance/profile node scripts/shared-pen-perf.mjs
node scripts/shared-pen-perf-summary.mjs artifacts/t3/shared-pen-performance/pencil/results.json
```

## Initial repeated results

Each reported percentile below is the median of three trial percentiles; worst
values are explicitly maxima where used. The repeated Pencil matrix included
39 Chromium strokes and30 WebKit strokes; the texture matrix adds90 per engine.
All samples are retained. All synthetic patterns/trials within each engine/tool
have one identical settled pixel hash. Engine hashes need not match each other.

- Chromium1x Pencil: in-page handler p95 is0.2–0.5ms, RAF p95≈16.7–16.8ms.
  At requested240Hz, in-page delivery takes≈1.014s for240 moves, while sequential
  awaited trusted CDP takes≈4.008s (≈60 delivered events/s). All trusted CDP
  strokes retain240 events/samples; requested120Hz is similarly limited.
  Protocol-synthetic replay itself reaches the requested rate in this engine.
- WebKit Pencil: blank-page RAF p95=17ms; warm-app idle p95=33ms. In-page
  drawing median RAF p50=34–36ms and p95=43–48ms, handler p95=10–11ms.
  At requested240Hz, in-page delivery reaches median238.05events/s while
  protocol-synthetic reaches187.60events/s. Protocol removal improves delivery
  fidelity, but does not restore stable60Hz RAF cadence.
- WebKit instrumentation-off Pencil: blank RAF p95=17ms; warm-idle p95=43ms.
  Drawing RAF p95=40/44/39ms for60x1/240x1/60x4, with median achieved rates
  60.05/239.72/60.08events/s. These results reject instrumentation as the sole
  cause of slow drawing cadence in this testbed.
- Rejected benchmark-only display probe (`DISPLAY_READ_FREQUENTLY=0`): default
  context allocation lowers Pencil handler p95 to1ms in WebKit, but RAF p95
  worsens to50/95/54ms for60x1/240x1/60x4. Pixels remain identical. This is not
  a runtime improvement and must not be adopted based on handler time alone.

The replay change corrects measurement; it is not an application optimization.
CPU1x measurements are not pooled with the earlier CPU4x combined-root trials,
whose100event/400sample workload also differs from this fixed240sample matrix.
Raw method timings can include deferred work/stalls inside a method call. They
cannot identify a GPU/OS/compositor cause. Slow warm-idle tails make a pure brush
explanation insufficient, but do not prove that all delay is environmental.

WebKit textured-tool in-page results reinforce the shared signal: Chalk RAF p95
40–56ms, Crayon40–55ms and Marker40–54ms across the five delivery patterns.
Their handler p95 values span11–24ms. Chromium1x texture RAF p95 remains≈16.7–16.8ms;
in-page texture handler p95 spans0.3–1.1ms. These ranges describe different
workloads; they are not a before/after optimization score.

The delivery gate reproduced the driver's specific limitation:

```sh
TOOLS=pencil DRIVERS=cdp PATTERNS=240x1 TRIALS=1 MIN_DELIVERY_HZ=200 PERF_OUT=artifacts/t3/shared-pen-performance/delivery-red node scripts/shared-pen-perf.mjs
# exit1: achievedEventHz60.0005 <200
TOOLS=pencil DRIVERS=inpage PATTERNS=240x1 TRIALS=1 MIN_DELIVERY_HZ=200 PERF_OUT=artifacts/t3/shared-pen-performance/delivery-green node scripts/shared-pen-perf.mjs
# exit0; exact240 samples and same settled Pencil hash
```

This red/green concerns replay delivery fidelity. It cannot turn a desktop
callback proxy into a physical iPad symptom regression. No such physical-device
regression command exists in this environment.

## Overdue replay correction and censored intervals

CPU4x exposed a second harness error. The original in-page loop awaited timers
only while ahead of its deadline. Once behind, it could dispatch many moves in
one uninterrupted JavaScript job. This is not a faithful sequence of separately
delivered input tasks. In these trials only2–3 completed RAF intervals were
recorded over≈1.3seconds; a completed-interval percentile near16.7ms hid the long
uncompleted interval. Those `chromium-cpu4` and `chromium-cpu4-off` results are
**invalid presentation summaries**, retained as negative evidence, not60Hz passes.
Their event counts, pixels and deadline backlog still expose the replay failure.

The corrected loop posts a MessageChannel task for each move, even when late.
It preserves every sample and permits other work between overdue deliveries.
It does not pretend to recover a missed deadline: achieved frequency and deadline
age remain explicit. RAF callback wall-clock gaps, leading/trailing censored gaps,
callback count and effective callback frequency accompany RAF timestamp intervals.
The optional frame budget now checks observed/censored gaps as well as p95;
`MIN_CALLBACK_HZ` can reject callback starvation that an interval percentile misses.
`LEGACY_SYNC_CATCHUP=1` exists only to reproduce this measured harness defect.

Separate repeated task-yield trials are retained under `chromium-cpu4-task-yield`,
`chromium-cpu4-off-task-yield`, `chromium-final`, and `webkit-final`. Initial1x
and WebKit matrices did deliver normal callback counts; nevertheless final
240x1/60x4 comparisons use the corrected loop. First Chromium Pencil trials also
precede the small metrics-drain correction: the final pending next-RAF callback
could be absent from those early next-RAF arrays. No old/new timing lanes are pooled.

## Attribution and validation

Separate Chromium1x CPU profiles and timeline traces cover basic Pencil and
Marker; CPU4x instrumentation-off Pencil has another independent profile/trace.
The1x traces record one Layout per stroke (≈0.11ms inclusive) and two style updates
(≈0.15–0.17ms), rather than one forced layout per input sample. Profiled Pencil
geometry reads account for≈2.1ms at1x and≈3.2ms in the old CPU4x catch-up probe;
those samples do not support a coordinate-conversion optimization. Native canvas
copy/restore calls and event dispatch dominate the identifiable old CPU4x profile;
the synchronous-loop artifact prevents extrapolating that attribution to physical
input. Profiles contain substantial unattributed engine time. Canvas call wall
timing, CPU sampled self-time and inclusive trace durations are different measures.

WebKit has canvas call counters/wall timing and RAF/event records here, but no
exposed CPU-profiler API. This evidence cannot separate its engine raster/copy
pipeline from compositor visibility. The display-context probe demonstrated that
lower main-thread handler time can coincide with worse callback delivery.
No presentation scheduling, asynchronous ink buffer, sample filtering, spacing,
pressure, randomness, export/history policy or original source pixels changed.

Focused built-app validation passed7 cases: Marker exact destination blending,
spacing, held history and paper behavior; stationary Airbrush export/history and
blur cleanup; and trusted studio Pencil pressure/Undo/Redo. The layered WebKit
fixture adds background/foreground through normal picture import: corrected-path
initial trials retain matching pixels across patterns, with handler p95=10/11ms
and RAF p95=45/42ms for240x1/60x4. This is a representative layered probe, not an
exhaustive scene-complexity sweep. The20ms WebKit RAF gate independently fails
at45ms; the60Hz presentation target remains unmet in that testbed.

## Next agent-runnable experiment

Keep the corrected input sequence/seed/pressure/CSS box/DPR and compare four
locally served pages sequentially on the pinned WebKit engine: the full studio;
a minimal page importing the same `createPaint` with identical options and warm
assets; a bare canvas reproducing just the same full-size fill/art/preview copies;
and blank-page RAF. Include wrapper-free controls and callback coverage/censored
gaps. Preserve exact settled pixels for full studio versus minimal paint; the
bare-copy lane is an attribution control, not replacement paint behavior. If only
full studio is slow, isolate its motion/composition owners next. If minimal paint
or bare copies are equally slow, investigate the headless engine pipeline before
changing application presentation scheduling. This experiment needs no user reply,
new package, native runtime, secret or physical-device claim.

Physical hardware sampling, iPadOS input delivery, real Safari foreground-idle
failure, compositor presentation and Pencil-to-photon remain unmeasurable here.
No foreground-idle cause is claimed and no five-minute soak was repeated.

## Final corrected-loop checkpoint

Three repeated corrected-loop240x1/60x4 trials per tool retain all240 samples and
the exact settled per-engine/tool hashes from the initial matrices. This change
in replay scheduling itself changes callback delivery, so it must not be called
an application performance gain. MessageChannel tasks are still synthetic tasks;
their scheduling priority is not established as equivalent to trusted pen input.

- Chromium1x corrected240x1 reaches≈239.6–240.4events/s, but callback frequency
  medians are45.5–52.9/s and RAF timestamp p95≈33.3–33.4ms. Corrected60x4 reaches
  ≈60events/s with54.96–58.11callbacks/s. Maximum observed/censored callback gaps
  span39.7–77.9ms. This differs from initial timer-only replay despite inexpensive
  handlers and equal pixels, demonstrating driver/scheduler sensitivity.
- Corrected WebKit240x1 achieves239.72events/s for Pencil,175.61 for Chalk,217.27
  for Crayon and217.67 for Marker. Their callback frequencies are19.94–21.63/s,
  RAF p95=55–61ms. Corrected60x4 reaches≈60events/s,28.29–28.74callbacks/s and
  RAF p95=45–49ms. The requested240Hz rate is **unattained** for three tools.
- CPU4x corrected Pencil240x1 reaches172.23events/s instrumented versus232.54
  with canvas/event probes removed; callback frequencies are57.61 versus59.41/s.
  Median per-trial deadline-age p95 is410.73 versus48.23ms. Instrumentation is
  therefore material in stressed replay throughput, even though it does not
  explain the uninstrumented WebKit slow-cadence signal. All240samples remain.
- Callback-starvation regression: legacy synchronous catch-up fails
  `MIN_CALLBACK_HZ=45` at3.17callbacks/s (exit1); corrected replay passes at59.53/s
  (exit0), identical settled Pencil hash. The corrected trial delivers148.73moves/s,
  not240, and has621.37ms deadline-age p95. It passes the *callback-starvation*
  regression, not a delivery-fidelity or latency acceptance test.
- Fresh focused development checks pass48 cases covering exact neutral/mouse
  source pixels, chronological/coalesced pressure, release pressure, foreign input,
  ownership, cancel/capture loss/lifecycle, recorded paths and shared history.
  Built checks remain7/7. These are source-preservation checks, not device latency
  proof. Original reference comparisons remain0/17; no web capture baseline changed.

Raw files include every trial's p50/p95/worst handler/event-age/RAF proxies,
delivered counts, canvas call totals and per-event records. `*-summary.json`
files preserve medians plus trial counts/worsts. Separate `profile*` directories
contain CPU profiles/timeline traces; their timings are not pooled with controls.
`commands.md` records commands, startup failures, wrapper failure and corrections.

The remaining diagnosis is bounded: sequential trusted CDP is delivery-limited;
overdue synthetic catch-up can starve rendering; instrumentation and synthetic
task selection affect stress results; warmed WebKit has slow callback delivery
with inexpensive/basic tools as well as textures. This does **not** identify an
actual iPad shared-path bottleneck. Before the minimal-renderer experiment above,
a useful additional trusted-input control is deadline-paced CDP sends whose
acknowledgements are collected after delivery rather than awaited per move.
Record received/coalesced counts and order; if that browser path coalesces or loses
samples, report that outcome instead of treating sends as delivered input.
