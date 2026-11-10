# Display context read-frequency experiment

2026-11-10. Source `bdd43d2` (verified live 0.21.0). Bounded experiment in the
isolated display-context checkout. Production source is unchanged. Parent owns
review, integration and full release gates.

The single treatment removes `willReadFrequently:true` from createPaint's first
**display** context creation. Art, preview, work, sample, snapshot, native drawing
engines and readback targets retain their original settings. Returned attributes
confirm the requested setting only; they do not identify a renderer backend.
No alpha, desynchronization, containment, promotion, scheduling, actor suppression,
prediction or coalescing treatment is combined with it.

The archived existing harness uses matched full studio and bare actual createPaint,
seed53, black Pencil16, 240 chronological moves and the unchanged release path.
Patterns240×1 and60×4 each span about one second but retain different event batching;
results are compared within each pattern. Each move yields a task and rechecks
real deadlines. Actual dispatches, samples, native consumed points/pressures,
geometry, options, backing dimensions and achieved delivery are recorded.
Full studio observes Undo1095 start before waiting for completion, all recorded
motion finished and UI media paused/ended/errored. Drawing audio is recorded,
not bypassed or assumed silent. Bare deliberately lacks studio actors.

Quantitative lanes have no canvas timing wrappers, source-owner instrumentation,
trace, screenshot, screencast or intermediate readback. A tiny identical seam
records actual strokeTo consumption; public paint exposure allows after-timing
checks. Readbacks, save/export/Undo/redo checks and PNG decoding run after timing.
Whole-studio screenshots are omitted entirely. Source/helper hashes are retained.
Baseline → treatment → restored baseline uses three trials per pattern/mode in
WebKit; Chromium repeats the same controls with one trial per pattern/mode.

Timing is synchronous dispatch wall time and browser callback/deadline coverage,
not CPU utilization, GPU time, rendered frame rate or input-to-photon latency.
No renderer backend is inferred from speed or settings.45Hz is only the inherited
lab callback detector. Headless Linux WebKit27.2 is not physical iPad Safari.

## WebKit outcome: NO-GO

Medians of three per-trial values; callback samples are not pooled. Baseline-a,
treatment, baseline-b ran in that order for each mode. Dispatch p95 is inclusive
synchronous event wall time. Gaps include leading/trailing censored intervals.

| Mode / lane |240×1 callbacks/s|60×4 callbacks/s|240×1 dispatch p95 ms|60×4 dispatch p95 ms|240×1 callback p95 ms|60×4 callback p95 ms|
|---|---:|---:|---:|---:|---:|---:|
|Full baseline-a|29.27|30.10|8|9|37|38|
|Full treatment|20.33|21.38|1|1|67|53|
|Full baseline-b|30.16|30.45|9|8|38|36|
|Bare baseline-a|53.61|55.23|6|7|22|20|
|Bare treatment|48.83|54.08|1|1|22|21|
|Bare baseline-b|52.94|55.06|6|6|22|20|

The setting reduces synchronous dispatch time, but full-studio callback coverage
falls about29–33%, then recovers on restoration. Full treatment worst callback
or censored gaps are69/63ms versus baseline46/43ms and restored45/40ms.
Full treatment median dispatch totals fall from594/190ms to38/21ms for240×1/60×4;
these are dispatch spans, not rendering CPU totals or proof of less total work.
Native WebKit clocks have1ms resolution, so1ms is a coarse measurement.
No CPU utilization/profile or GPU timing was collected, and no asynchronous
render cost was measured. Reduced time before dispatch returns cannot establish
reduced complete rendering cost or fresher ink.

Full-studio45Hz detector is red for every baseline and treatment. Bare baseline
is green for every trial; treatment is green in all60×4 trials, with the240×1
trial results retained individually. No full-studio callback recovery occurs.
Bare240×1 treatment is slightly slower and60×4 is effectively similar. The
Pencil result does not warrant the conditional textured/native extension.

## Exact pixel and behavior gates

All WebKit36 strokes pass:240 delivered move samples,240 or60 move events,
241 actual strokeTo points including release, exact native geometry and pressure
chronology across batching, exact tool options and actual ancestry dimensions,
720×542 backing stores, opaque display and stable final decoded RGBA. Delivered
rate medians are239.72–241.17/s for240×1 and59.96–60.39/s for60×4. These are
actual dispatch timestamps, not configuration-derived rates.

The decoded WebKit display/export hash remains
`7c8449a117a25c8f1c42f4b5baed24aa222c58ebd55ea6042f3ec5f8d69b42ca`.
Canonical transparent source-art hash remains
`ce5cb2767b089386fbd3bee5c345462b7cff49fb36d897890faa9c26d09add15`.
Each stroke verifies one Undo removes the only history entry and restores exact
prior art and display; redo restores exact stroke art/display and availability.
Canonical save art and normal renderTo export are decoded after timing and
compared exactly across treatment/baselines and full/bare. The separately traced
functional probes additionally invoke actual download, capturing its anchor URL,
and require exact identity with the normal composition export. No expected pixel
is modified and no tolerance is introduced.

The reusable studio comparator still enforces all original input, options,
geometry, stable RGBA and source-idle gates. Only the treatment's expected
read-frequency boolean is normalized in comparison copies, after independently
asserting each original returned boolean and exact equality of every other
context attribute. Original receipts remain intact. Whole-studio visual equality
is not claimed, since no screenshots were taken.

## Chromium control and cross-engine differences

Host Chromium158.0.8127.18, one trial per pattern per lane, sequential. These
short controls do not provide a repeatability estimate. Full callbacks/s for
240×1 /60×4: baseline60.53/59.87, treatment59.92/59.89, restoration59.64/59.99.
Bare:53.85/57.00,57.13/57.01,56.92/57.02. Dispatch p95 remains0.20ms for240×1
and0.30–0.40ms for60×4. No material full-studio gain appears in Chromium either.
All12 strokes pass the same exact within-engine gates as WebKit.

Chromium source-art hash is
`18d711db3719e563abfb51f9610316b2189eb85c1c7374cbcddb6dd66a31860a`;
display/export hash is
`c5478c88c0dd10ff38b18fda5503875d40fe338602bb9a4e12e48f958fef2067`.
These differ from WebKit in **both baseline and treatment**. Exact decoded
cross-engine comparison finds4259 differing pixels in source art and4259 in
display/export, maximum channel delta119. Source differences occupy4259 channels;
opaque output differs in12777 channels. They are not called pixel-equivalent.
Both backing dimensions match, but actual CSS box widths differ:
WebKit959.9999542236328 vs Chromium960.0000762939453. The recorded input/native
chronology is exact within each engine; no invented cross-engine geometry or
rasterizer equivalence is asserted. No pixel tolerance, expected fixture update,
forced backend label or opaque-alpha assumption is used to hide the difference.

## Reproduction, exclusions and handoff

Raw evidence and executable copies are in ignored
`artifacts/t3/display-read-frequency/`. `manifest.json`, `source-sha256.txt`,
`experiment.patch`, per-lane logs/results and per-stroke history records preserve
exact source, clocks, seed, version, deviceScaleFactor2, viewport1366×1024,
720×542 backing, input samples and original encoded/decoded identities.
`final-receipt.json` checks all48 quantitative strokes/11520 move samples and
11568 consumed points. `cross-engine-pixels.json` retains exact differing counts.
Callback failures are preserved in individual callback counts and45Hz detector
summaries, rather than made into functional failures or discarded trials.

```sh
# Create only these temporary links in the experiment checkout if absent:
ln -s /home/zsrobinson/code/kidpix/node_modules node_modules
ln -s /home/zsrobinson/code/kidpix/public public
bash artifacts/t3/display-read-frequency/run.sh wk-full-a webkit full 1 \
  > artifacts/t3/display-read-frequency/wk-full-a.log 2>&1
bash artifacts/t3/display-read-frequency/remaining.sh \
  > artifacts/t3/display-read-frequency/matrix.log 2>&1
node artifacts/t3/display-read-frequency/compare.mjs \
  wk-full-a wk-full-t wk-full-b wk-bare-a wk-bare-t wk-bare-b \
  cr-full-a cr-full-t cr-full-b cr-bare-a cr-bare-t cr-bare-b
node artifacts/t3/display-read-frequency/cross-engine.mjs
bash artifacts/t3/display-read-frequency/functional-matrix.sh \
  > artifacts/t3/display-read-frequency/functional-matrix.log 2>&1
node --test scripts/shared-pen-pixels.test.mjs scripts/shared-pen-studio-control.test.mjs
```

The runner holds `flock /var/tmp/kidpix-ui-validation.lock` for every complete
browser/container lifetime. Lock waiting is outside input timing. Port4671 is
owned only for each run,4672 reserved/unused. Vite source serving with private
artifact caches avoids a build and media copy. Temporary existing dependencies
and media are read-only inputs. WebKit uses the already-present pinned image
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`
with `--pull never --cap-drop ALL --network host`, host UID/GID, read-only
source/dependencies/media, own writable artifacts and512MiB shm. Chromium uses
the existing host binary. All runs are sequential; there is no wide fanout.

Only the audit is retained in tracked source. No runtime candidate, install,
download, original-software execution/EULA, credential, version, baseline, media,
push, deployment, root build or parent full suite is involved. The parent dirty
SERVER_HANDOFF, Clipboard80a0661, separate Pencil prototype and other worktrees
remain untouched. Owned runtimes close in finally/traps and temporary links are
removed at handoff. No rejected controls are repeated beyond the specified
read-frequency setting. No failures or excluded performance lanes are hidden;
functional-traced runs are explicitly excluded from quantitative comparisons.

**NO-GO:** synchronous dispatch returns sooner in WebKit, but there is no
repeatable overall lab benefit and full-studio callbacks worsen. Stop this
experiment; retain the original production display setting. Native remains0/17,
enlarged vacuum disabled. Physical Pencil latency, foreground idle and audible
feel remain unverified. No hardware fix or overall release approval follows.

Coverage is procedural Pencil only; this does not certify all tools. The
textured/native lane was conditional on a material Pencil gain and was not run.
Existing focused pixel/studio/display-control tests pass18/18; archived module
syntax and shell syntax checks pass. No broad suite is needed to promote this
rejected, source-unchanged experiment. Quantitative runs all exit0 for functional
invariants; callback detector failures remain explicit rather than mislabeled
as app correctness failures.

All four separate full-app functional probes (both engines, original/treatment)
exit0 and pass actual-download, exact source/display/export, oneUndo, redo,
consumption and studio gates. `functional-receipt.json` retains their comparison.
Playwright traces use screenshots:false, are retained only on failure, and all
successful traces are discarded. No failed startup or functional lane occurred.
