# Matched studio and minimal paint on live 0.15

Prepared HEAD cb02c6a; application runtime is live e4130db (0.15.0).
No application file, version, original media, accepted capture or baseline changed.
This phase establishes a reproducible **desktop callback** difference. Physical
Pencil latency and the reported foreground Safari animation loss remain unverified.

## Controls and gates

`CONTROL_MODE=minimal` serves a dedicated Vite fixture importing actual
`createPaint`, with includeForeground:false and normal drawing audio. It uses the
production stylesheet, ancestor hierarchy and the exact production scaling
calculation. Its only presentation override removes the studio gradient. It has
no studio animation actors, scene owner or UI media; these are explicitly absent,
not simulated. It calls actual paint Undo and verifies that history exists.
The full control retains production studio hooks, layers, background and actors.
Both use the benchmark's fixed seed53, black Pencil size16, identical options,
and all240 chronological pressure/path samples. Both warm with a small stroke
and Undo; the full control observes Undo1095 start before waiting for completion,
finished motion and completed/paused/errored UI media, without hiding or stopping
anything. This is **warmed UI-idle**, not cold startup or silence. Drawing-audio
states are recorded but do not participate in the UI-media completion gate.

The reusable fixture is a mode seam, not a generated copy of the old harness.
Full/minimal selection and history operations are explicit branches; no fake
DOM buttons or source actors are used to satisfy studio selectors. Benchmark-only
strict source transformations retain the seed/fixed Undo controls and capture
actual setOptions arguments outside drawing timing. The default full studio
runtime remains unchanged. `PRESENTATION=surface-paint` injects one benchmark-only
rule, `#surface { contain:paint }`, asserted through computed style in each row.
It is never applied to production.

Every accepted paired row passes exact equality for:

- Input bounding box: x218.9947967529297, y89.33333587646484,
  width959.9999542236328, height722.6666641235352 in pinned WebKit.
- Actual getBoundingClientRect ancestry and relevant computed layout dimensions,
  positions and transforms, including the grid-centred viewport and studio scale.
  DOMRect and Playwright boundingBox values are retained separately; their tiny
  engine rounding difference is not silently normalised.
- Actual tool options, canvas720×542, context attributes, and opaque rendered output.
- All240 samples, expected240 or60 move events for60×1 or60×4, unchanged pressure/path
  chronology (also stored explicitly in later rows), and stable post-release output.
- Exact decoded RGBA hash
  `7c8449a117a25c8f1c42f4b5baed24aa222c58ebd55ea6042f3ec5f8d69b42ca`.
  dataURL and encoded PNG hashes remain separate, not pixel-equality substitutes.
- Full-studio preconditions: hidden Undo, every recorded motion finished and UI
  media completed/paused/errored. Minimal snapshots explicitly have no source actors.

Timing retains real deadlines, per-event dispatch/delivery records, achieved rates,
callback counts, leading/trailing censored gaps and observed tails. PNG decode and
readback occur after timing. Assets pass paint readiness/image decode and warmup
before strokes; no install, download, initial application loader or media import
is deliberately included in the timed window. There is no per-request network
trace in the quiet lane. Requested rates are not inferred from configuration.
Samples and duration match **within** each pattern;60×1 takes four seconds and60×4
one second, so patterns are not interchangeable velocity controls.

## Ranked hypotheses and outcomes

1. Studio surroundings add cost: predict a faster exact-box minimal renderer.
   **Supported in this desktop environment**, including reversed run order.
2. Repeated action-state refresh adds the idle Pencil cost: predict refresh calls
   during the stroke. **Falsified for this quiescent Pencil lane** by the separate
   attribution trace; active Text/Grab/Stamp behavior is outside this finding.
3. Paint/WebKit alone accounts for the slow full-studio loop: predict similarly
   slow matched minimal paint. **Insufficient explanation here**; minimal is faster.
4. Surface paint containment helps isolate studio presentation: predict better
   full-studio cadence with computed contain:paint. **Rejected**, cadence worsens.

Sequential experiment order is full-a, minimal-a, minimal-b, full-b,
surface-paint-a, full-c. Each has three trials per pattern. Pattern order is
60×1 then60×4 for full-a/minimal-b/surface-paint-a, reversed for the others.
All quantitative rows have INSTRUMENT=0 and UI_TRACE=0. No trace timings are pooled.
The two harness revisions differ only in recording explicit points/presentation
and asserting the treatment. Raw archived harness-a/b SHA256 values match their
recorded results. The final reusable harness adds attribution-only probes and
helper source hashes; final smoke controls cover that assembled version.

Values below are medians of three per-trial statistics, not pooled frame samples.

| Lane | 60×1 RAF p95 ms | callbacks/s | 60×4 RAF p95 ms | callbacks/s |
| --- | ---: | ---: | ---: | ---: |
| full-a | 35 | 30.31 | 35 | 31.16 |
| minimal-a | 19 | 58.02 | 20 | 57.79 |
| minimal-b | 20 | 57.46 | 20 | 57.84 |
| full-b | 43 | 31.31 | 45 | 31.16 |
| surface-paint-a | 66 | 17.14 | 58 | 21.48 |
| full-c | 35 | 30.33 | 37 | 30.27 |

All quiet groups achieve about60 move events/s (median60.005–60.389), retaining
all samples. Worst observed/censored gaps are47/37ms for full-a60×1/60×4,
31/25ms for minimal-a,25/21ms for minimal-b,47/49ms for full-b,
70/70ms for containment, and39/48ms for full-c. Per-trial dispatch p95 medians
vary from5–12ms across controls; smaller dispatch time is not a presentation win.
Containment actually computes to `paint`, baseline to `none`; ancestry geometry,
pressure/path and decoded pixels still match. The later default repeat recovers
baseline cadence. This is evidence **against** this specific CSS treatment,
not proof of a GPU/compositor explanation.

The independent UI_TRACE=1 lane records three motion owners (`draw`,
`draw:18200`, `draw:18400`) receiving118 callbacks each in60×1 and31 each in60×4.
All have refreshCurrent:false. There are zero action-state-refresh calls,
motion renders, Undo ticks or DOM mutations during either timed stroke.
Individual measured refresh/step spans are0ms at WebKit's1ms clock resolution;
that does **not** prove zero accumulated cost or zero scheduler overhead.
It does rule out repeated actual source rendering and action-state calculation
as necessary explanations for this warmed Pencil control.

## Reproduction and raw evidence

All paths below are relative to this isolated worktree:
`artifacts/t3/studio-composition/`. `commands.md` records exact invocations,
including expected failures. Per-lane results.json preserves the complete rows;
summary.json/txt retains per-trial values and medians. invariants-a.json covers12
strokes; invariants-b-final.json covers24 (including minimal-b and the containment
pair). These disjoint groups total36 strokes/8640 samples, all pixel-identical.
The attribution lane is additional and separate. No previous evidence is replaced.

```sh
node --test scripts/shared-pen-studio-control.test.mjs scripts/shared-pen-pixels.test.mjs
PORT=4301 PERF_ROOT=artifacts/t3/studio-composition UI_SCENARIO=quiescent \
 TOOLS=pencil DRIVERS=inpage PATTERNS=60x1,60x4 TRIALS=3 INSTRUMENT=0 UI_TRACE=0 \
 bash scripts/shared-pen-perf-webkit.sh full
# Repeat with CONTROL_MODE=minimal; reverse run/pattern order as recorded.
# PRESENTATION=surface-paint is a rejected attribution control only.
node scripts/shared-pen-studio-compare.mjs path/to/full/results.json path/to/minimal/results.json
```

Final assembled harness callback-budget loop: add TRIALS=1 MIN_CALLBACK_HZ=45.
Full studio exits1 at30.78/31.34 callbacks/s; minimal exits0 at59.55/57.84.
Both preserve all240 samples and exact decoded pixels. This is an agent-runnable
red/green for the **lab callback difference**, not a physical latency test or a
shippable replacement UI. The six Node tests cover actual mode routing and
negative subpixel/options/sample/pixel/source-completion gates. Chromium smoke
is a separate engine/seam check, not pooled with WebKit timings.

## Handoff

No faithful runtime fix is supported, so there is no CSS or scheduling candidate
to promote. Production synchronous release/cancel/export/history, oneUndo per
stroke, neutral mouse/finger behavior, source audio gates, editable scene objects,
selection/path handles, foreground/background/effects,0.14 left hover and0.15
bounded canvases are unchanged. No new17-capture claim, built/public suite rerun,
original-reference acceptance, long idle soak or foreground-idle fix is implied.
Native references remain0/17; physical iPad validation remains outstanding.

The next single experiment should pause **only the three finished motion owners'
RAF registrations during the measured UI-idle window**, as an attribution-only
control, resuming them immediately afterward. Keep all studio DOM, presentation,
media, input delivery and source state identical; verify no motion callback runs
inside the paused window and that all three resume. Compare with the same exact
baseline/geometry/pixels and3+ reversed trials. This distinguishes finished-owner
callback scheduling overhead from static studio presentation without deleting
UI or speculating about compositor internals. It is not a proposed production
scheduler change. Parent owns integration, independent review and release gates.

Final validation:6/6 Node checks pass. Both Chromium158 full/minimal smoke strokes
pass exact geometry, context, options, pressure/path and decoded RGBA comparison
(480 additional samples); its pixel hash is engine-specific. Both pinned WebKit
assembled-harness strokes per mode pass those same identity checks (960 samples),
with the intended full-studio callback-budget failures retained. Shell/JS syntax
and git diff checks pass. All owned runtimes ended; input symlinks were removed.
Only reusable controls/tests and this audit are committed. Raw results remain
local ignored artifacts; they are not release acceptance records.
