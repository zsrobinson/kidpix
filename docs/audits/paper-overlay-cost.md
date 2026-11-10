# Blank studio overlay attribution

Prepared controls:1b0a47a. Runtime remains live0.15.0 e4130db. This is a pinned
desktop WebKit27.2 callback experiment, not actual iPad latency or a reproduction
of foreground animation loss. No production code, version, media or baseline edits.

## Matched control

Benchmark-only PRESENTATION=overlays-hidden applies visibility:hidden to just
#foreground and #scene-effects. Individual foreground-hidden/effects-hidden controls
separate the surfaces without assuming their costs add. Nodes, backing stores,
source owners, input delivery, media, DOM and layout remain allocated and unchanged.
No alpha, scheduler, audio, pressure, spacing or randomness treatment is applied.

Before and after each stroke the harness scans actual overlay alpha bytes outside
timing, asserting both720x542 stores contain zero nontransparent pixels. It records
computed display/visibility/opacity/z-order/pointer-events and exact subpixel rects.
Default expects visible/block; selected treatments expect hidden/block. The local
verifier compares every other overlay property exactly and rejects drift.

All quantitative runs use INSTRUMENT=0/UI_TRACE=0, warmed source-start-gated UI-idle
(Undo1095 must become visible before completion), real task-yield replay and all240
seed53 pressure/path samples. 60x1 and60x4 differ in duration/velocity; statistics
remain separate. Actual options, context, ancestry, geometry and decoded ink must
match. Entire2732x2048 viewport RGBA must also match, without exemptions/tolerances.
Readback, PNG decode and screenshots occur outside timing. The before readback is
identical in default/treatments; it is an explicit limitation of this matched probe.

Evaluate emulates user gesture; JavaScript PointerEvents are untrusted. These
measure callback coverage/deadline proxies and achieved replay events/s, not real
Pencil event age, display presentation or photon latency. No CPU/GPU cause follows.

## Results

Three trials per pattern per repeated lane. Values are medians of per-trial
statistics; callback samples and different velocities are never pooled.

| Phase1 lane |60x1 callbacks/s|RAF p95 ms|worst gap ms|60x4 callbacks/s|RAF p95 ms|worst gap ms|
|---|---:|---:|---:|---:|---:|---:|
|Default-a|30.50|35|42|30.45|36|41|
|Both hidden|27.64|44|45|27.48|39|47|
|Reversed default-b|30.30|35|40|30.48|36|43|
|Foreground only|33.71|32|38|33.20|33|38|
|Effects only|34.77|32|43|34.99|40|42|
|Default-c|30.85|36|45|30.36|37|41|
|Effects repeat|25.83|41|55|27.18|41|51|
|Reversed default-d|31.48|34|40|31.43|36|38|

Both hidden is slower by about9–10%. Effects-only initially improves callback
coverage by about14–15%, but reverses to a14–18% loss in the repeat, between
otherwise stable defaults. This is an inconclusive/nonrepeatable effect, not a
performance win. No engine-layer or GPU allocation explanation is established.
Foreground-only's initial roughly9–11% improvement needs the separate repeat below.

Phase2 adds only an empty-objects container probe/gate and preserves the existing
SCENE=layered diagnostic lane: actual foreground pixels are allowed in default,
while hidden attribution modes still reject them. Helper/harness hashes therefore
differ from phase1; each phase has fresh matched defaults and is verified separately.
The production source is identical throughout. No rows across hashes are pooled.

| Phase2 lane |60x1 callbacks/s|RAF p95 ms|worst gap ms|60x4 callbacks/s|RAF p95 ms|worst gap ms|
|---|---:|---:|---:|---:|---:|---:|
|default-e|31.77|34|41|31.43|36|38|
|foreground-repeat|32.59|32|39|32.42|36|39|
|objects-hidden|31.49|34|48|31.43|35|48|
|default-f|30.85|34|41|30.57|35|41|

Foreground-repeat's improvement is smaller: roughly3% against its preceding default
and6% against its following default. The direction is positive, but the size varies
and most of the full/minimal deficit remains. This modest signal is recorded rather
than called a uniform negative or promoted as a repeatable material fix. Empty
#objects hiding adds no useful gain; its node has zero children before/after and
retains display, subpixel geometry, pointer-events and z-order. The next unresolved
seam is ancillary full-studio input listeners versus other source UI surfaces.

The final MIN_CALLBACK_HZ=45/TRIALS=1 control remains red for full studio:
31.22/31.04 callbacks/s, p95=34/37ms, worst41/38ms (60x1/60x4), exit1 with exactly
two expected callback-budget failures. Exact-box minimal remains green:
56.45/56.59 callbacks/s, p95=20/20ms, worst23/23ms, exit0. The local verifier checks
the expected failures before comparing copies; original result files are unchanged.

The disjoint phases cover76 strokes/18,240 samples with exact decoded ink/options/
path/geometry/context and release stability. All74 full-studio strokes additionally
preserve exact whole viewport RGBA; minimal explicitly lacks studio source UI.
Both phases retain achieved replay rates near60events/s, with per-trial rate and
deadline tails in summary files. None of these proxies implies actual60Hz display.

Raw evidence and exact commands are retained in ignored
artifacts/t3/paper-overlay-cost/, including measured-source/ and phase2-source/
copies, run.sh, singles.sh, repeat.sh, phase2.sh, per-lane logs/results/screenshots,
verify.mjs, summary-phase1.json and summary.json. Callback timestamps/counts,
leading/trailing censored gaps, dispatch/deadline tails, delivered events/s and all
pressure/path samples remain in original result records. No successful/failed row
is silently dropped. The unapplied effects-presence test draft is retained as an
artifact and was never executed or committed as an application regression test.

```sh
node --test scripts/shared-pen-idle-control.test.mjs scripts/shared-pen-studio-control.test.mjs scripts/shared-pen-pixels.test.mjs
PORT=4331 PERF_ROOT=artifacts/t3/paper-overlay-cost UI_SCENARIO=quiescent \
 TOOLS=pencil DRIVERS=inpage PATTERNS=60x1,60x4 TRIALS=3 INSTRUMENT=0 UI_TRACE=0 \
 PRESENTATION=overlays-hidden bash scripts/shared-pen-perf-webkit.sh both-hidden
# Repeat default / foreground-hidden / effects-hidden / objects-hidden,
# following recorded run and reversed pattern orders. Default IDLE_OWNERS=off.
node artifacts/t3/paper-overlay-cost/verify.mjs default-a both-hidden default-b foreground-only effects-only default-c effects-repeat default-d
node artifacts/t3/paper-overlay-cost/verify.mjs default-e foreground-repeat objects-hidden default-f full-budget minimal-budget
```

Node18/18 checks pass, including rejection of nonblank backing pixels, wrong computed
visibility/display, missing dimensions, subpixel overlay drift and changed complete
studio output. Syntax/whitespace checks pass. No other browser/performance suite ran
concurrently; short host Node/syntax checks ran during wrapper lifetimes. This is
not hardware-isolated execution. No application source change warrants a dev/built
full-browser repeat, new17-capture acceptance, install, image pull or original-media
operation. Owned Docker/browser/server lifetimes close through wrapper/finally;
4332 is unused and read-only input links are removed at handoff.

## Decision and limits

No runtime optimization is justified by the joint-overlay result. Semantic changes
to foreground/path visibility have not been made. Active foreground/object overlaps,
recorded path lifecycle, selection, background, Firehose failures, export/history,
17 static captures and affected dev/built browser acceptance would all be required
before a runtime candidate. They are not claimed by blank-scene equality.

The live0.14 left-hover repair,0.15 bounded672 source frames, synchronous delivered
ink at release/cancel/export/history, oneUndo per stroke and neutral mouse/finger
behavior remain unchanged source. Physical iPad latency, foreground-idle recovery
and native0/17 remain unverified. Parent owns integration, review and release.
