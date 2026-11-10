# Freehand display coalescing on live 0.15

Prepared HEAD9b58c29; application runtime remains e4130db, version0.15.0.
This is a desktop WebKit27.2 callback/deadline experiment, not physical iPad
latency, display presentation, or a reproduction of foreground animation loss.
No application, version, media, baseline, source-frame or audio-manager edits.

## Hypotheses and method

Ranked before testing: redundant stroke display composition limits callbacks;
full-studio geometry/sample/dab work is more expensive; ancillary studio pointer
listeners add dispatch cost. The first predicts a substantial callback recovery
when presentation requests coalesce; the other two predict distinguishable
inclusive function/listener spans in matched full/minimal attribution trials.

Benchmark-only COALESCE_DISPLAY=1 changes just handleMove's final render call for
ordinary stroke moves with Pencil/Chalk/Crayon/Marker, excluding native shapes,
native polling and timed spray rendering. Every pointerSamples/pointFor/pressure/
strokeTo/dab/tracking operation remains synchronous and unchanged. One queued RAF
presents the accumulated preview; every normal synchronous render cancels that
queued frame. Down, release, cancel and existing commit paths keep their original
render calls. Production source does not contain this experiment.

STROKE_COUNTERS=1 separately records actual source function counts, every consumed
strokeTo point with pressure, deferred requests and actual renders/compositions.
STROKE_ATTRIBUTION=1 separately adds real-clock inclusive function/geometry and
pointer-listener spans; existing INSTRUMENT=1 canvas probes accompany attribution.
Nested spans overlap. WebKit's native clock has1ms resolution: measured zero spans
are not claims of zero accumulated cost. Canvas timings cannot identify GPU time.

All quantitative lanes use INSTRUMENT=0/UI_TRACE=0, exact full-studio geometry,
options, black Pencil16, seed53 and240 chronological samples. Replay yields a task
for every delivered move, checks real deadlines, and records requested/achieved
rates separately.60x1 is four seconds;60x4 and240x1 are one second. Duration and
velocity match within each pattern across treatments. UI-idle first observes
fixed Undo1095 visible, then waits for completion, finished source motion and
quiet UI media. All source UI remains visible. Evaluate emulates user gesture;
synthetic PointerEvents remain untrusted. No physical event-age claim follows.

## Separate actual stroke attribution

One matched60x4 trial per full/minimal mode, with identical actual options, box,
consumed samples,1263 dabs and decoded ink. Inclusive totals in milliseconds:

| Actual function | Full | Minimal | Calls in each |
|---|---:|---:|---:|
| pointFor |7|1|303|
| getBoundingClientRect |7|0|303|
| pointerSamples |3|2|61|
| strokeTo |4|5|241|
| drawDab |2|4|1263|
| render |204|172|63|
| compose |204|171|63|
| handleMove |222|181|61|

The61st handleMove/sample pass is the unchanged release path; it is not another
delivered MOVE. Full studio's extra studio capture listener totals2ms, its path
capture listener0ms, and its two interaction-owner guards0ms. The paint move
listener totals223/182ms. Harness document listeners total6/1ms; these are
instrumentation, not studio work. Outer move dispatch p95 is8/6ms, worst13/7ms.
Canvas drawImage totals196/158ms across126 calls; fillRect7/11ms across63 calls.
Per-event next-RAF p95 is30/18ms (worst35/20ms).
Callback coverage remains30.95/58.25 per second in these separately instrumented
trials. These observations put most measured synchronous stroke cost in compose,
with modest full/minimal differences; they do not explain the roughly twofold
callback difference through CPU work alone or establish a compositor cause.

## Wrapper-free baseline / treatment / restored baseline

Three trials per pattern per lane, same helper/harness hashes and pinned engine.
Values are medians of per-trial statistics; samples are never pooled across lanes
or velocities. Worst includes observed and leading/trailing censored gaps.

| Pattern | Lane | callbacks/s | callback p95 ms | worst gap ms | events/s | dispatch p95 ms |
|---|---|---:|---:|---:|---:|---:|
|60x1|baseline-a|30.78|35|40|60.08|9|
|60x1|treatment|31.26|34|38|60.07|1|
|60x1|baseline-b|31.47|34|39|60.01|10|
|60x4|baseline-a|30.39|35|40|60.27|10|
|60x4|treatment|30.33|34|40|60.14|1|
|60x4|baseline-b|31.07|37|41|60.02|11|
|240x1|baseline-a|29.95|40|45|239.96|10|
|240x1|treatment|30.45|37|41|242.39|1|
|240x1|baseline-b|30.24|36|38|241.41|10|

Actual240Hz delivery is approximately achieved in these Pencil lanes. Treatment
leading/trailing maximum gaps are16/6,18/32 and17/32ms respectively; baseline-a
18/13,18/15 and16/17ms; baseline-b16/5,18/6 and16/24ms. Per-trial deadline-age
p95 medians are7.67/7.67/26.67ms before,7.67/8.67/8.67ms during treatment and
7.67/9.33/22.33ms afterward. Smaller dispatch/backlog proxies do not establish
physical latency improvement. INSTRUMENT=0 has no per-event next-RAF wrappers;
callback coverage and deadline/censored-gap proxies remain available.

All27 strokes/6480 samples pass exact geometry, options, pressure/path replay,
720x542 decoded RGBA and2732x2048 full-viewport decoded RGBA equality, plus stable
post-release pixels. Ink hash is7c8449a117a25c8f1c42f4b5baed24aa222c58ebd55ea6042f3ec5f8d69b42ca.
PNG-byte/dataURL hashes are separate from decoded pixel identity. Readback and PNG
decode occur after timing. Release and two-RAF drain both report no pending frame.

## Separate counter and terminal-operation gates

A fresh hash-matched counter phase repeats three trials per pattern per lane;
its timings are not pooled with the wrapper-free phase. Benchmark API exposure
and post-timing terminal probes make its helper/harness hashes different from the
first phase. Actual composition counts equal render counts in every timed row.

| Pattern | Original composites, each trial | Treatment requests, each trial | Treatment composites | callbacks/s before / treatment / restored |
|---|---|---|---|---|
|60x1|243|240|128,129,128|31.23 /31.62 /30.48|
|60x4|63|60|34,34,33|31.22 /31.31 /30.33|
|240x1|243|240|33,33,33|30.19 /31.07 /29.38|

Every actual pointFor/pointerSamples/strokeTo/drawDab/handleMove call count and
every consumed strokeTo point/pressure equals its matching original, including
the unchanged release pass. All27 additional strokes/6480 samples pass exact ink,
viewport, input geometry/options and source-idle gates. Across both separate
phases54 timed strokes/12,960 samples pass; attribution is additional evidence.

After timing, real full-studio public paint methods test synchronous release,
cancel and destroy with a move queued in the same task. Every treatment begins
with pending:true and ends synchronously with pending:false. Immediate canvas
pixels exactly match the original operation's decoded pixels, remain unchanged
after two callbacks, and record zero additional render calls. These are three
bounded terminal cases, not broad lifecycle acceptance. They do not validate
pending save/export, rapid recontact, load/resize/capture loss or active scenes.

counter-invariants.json records identity and summaries; counter-negative-gates.json
records seven rejected mutations: one changed pressure, one missing sample,
no actual render reduction, a surviving frame after destroy, an extra render,
changed ink pixels and changed viewport pixels. These exercise the verifier on
actual recorded callsite data, not production runtime regression tests.

## Decision and limits

Reject runtime promotion: callback coverage does not improve materially and
consistently, and the full/minimal deficit remains. A large decrease in synchronous
move dispatch time is insufficient. No production scheduler, brush behavior,
pressure/spacing/randomness, source owner, UI, completion or audio semantics change.
The retained experiment is a reusable negative control, not a runtime candidate.

Full production lifecycle, immediate save/export while a frame is pending,
selection/foreground/path/source-UI/Firehose combinations, built/live comparison,
original17 native references and physical iPad/foreground-idle behavior are not
newly accepted here. Native references remain0/17. Original release/source pixel
oracles and0.14 hover/0.15 bounded672-frame behavior are not weakened or modified.
Existing source exports compose fresh ink; this experiment has not established an
exhaustive display-flush contract for promotion. No public suite or long soak ran.
Retained allocation pressure remains a hypothesis: prior hiding kept stores
allocated, and these stroke probes neither prove nor disprove resource pressure.
No release/recreate allocation treatment was attempted in this phase.

## Reproduction and evidence

Raw files are ignored under artifacts/t3/display-coalescing. Each lane contains
results.json and full-viewport PNGs; quant-invariants.json records exact cross-lane
identity and summaries. logs retain console rows and all failed startup commands.
The initial attr-full trial is preliminary (INSTRUMENT=0), separate from the final
INSTRUMENT=1 pair. Initial baseline-a/treatment/baseline-b launches collided with
the still-running attribution server, failed strict port4341 before any row, and
are retained as *-startup-excluded. The accepted sequence ran serially afterward.

```sh
node --test scripts/shared-pen-{display-control,idle-control,pixels,studio-control}.test.mjs
PORT=4341 PERF_ROOT=artifacts/t3/display-coalescing UI_SCENARIO=quiescent \
 TOOLS=pencil DRIVERS=inpage PATTERNS=60x1,60x4,240x1 TRIALS=3 \
 INSTRUMENT=0 UI_TRACE=0 bash scripts/shared-pen-perf-webkit.sh baseline-a
# Repeat with COALESCE_DISPLAY=1 as treatment, then defaults as baseline-b.
node scripts/shared-pen-display-compare.mjs \
 artifacts/t3/display-coalescing/{baseline-a,treatment,baseline-b}/results.json
# Separate counter lane: STROKE_COUNTERS=1, same sequence and three trials.
# Attribution: STROKE_ATTRIBUTION=1 INSTRUMENT=1,60x4,TRIALS=1,
# full then CONTROL_MODE=minimal, no timing pooled with quantitative lanes.
```

Only existing read-only dependency/media links and pinned image
mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d
are used. No installs, pulls, native execution or shared/root browser work.

Validation:21/21 focused Node controls pass; JS/shell syntax and git diff checks
pass. Runtime source/package diff against exact live e4130db is empty. No runtime
candidate exists, so built/live/browser release suites were not repeated. All
owned harness/browser/container processes ended; private4341/4342 are closed and
the temporary dependency/media input links were removed. Parent owns review,
integration and publication.
