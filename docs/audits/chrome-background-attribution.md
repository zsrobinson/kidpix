# Static Paint Zone background attribution

Runtime reference: live0.15.0 e4130db. Parent integrated the prior callback controls
as db7ec38 and negative audit as52554ba. No production source/version changes.

The previous finished-owner experiment verified all three actual motion owners
parked, zero timed callbacks, and resumption; no repeatable gain. Paper/surface
will-change hints worsened cadence and gradient removal did not help. The next
ranked presentation hypothesis was the full-stage static Paint Zone background.

## Control and verification

PRESENTATION=chrome-no-image adds only a benchmark stylesheet rule overriding
#paint-chrome's inline background-image. The node, dimensions, visibility, source
actors, media, input and drawing implementation remain. Computed background image
must be none in the removal lane and nonempty in default; all remaining recorded
chrome dimensions/display/visibility/placement match exactly. Studio pixels change
intentionally and their original screenshots/hashes remain. This is an attribution
control, never a visually complete production candidate.

Default-a, removed, default-b run sequentially, three trials each per60x1/60x4
pattern, later lanes reverse pattern order. INSTRUMENT=0/UI_TRACE=0/IDLE_OWNERS=off,
real-clock source-start-gated UI-idle control, seed53, Pencil16,240 chronological
pressure/path samples, all exact stage ancestry/geometry/options retained.

Medians of per-trial statistics in pinned desktop WebKit27.2:

| Lane |60x1 callbacks/s|RAF p95 ms|worst gap ms|60x4 callbacks/s|RAF p95 ms|worst gap ms|
|---|---:|---:|---:|---:|---:|---:|
|Default-a|31.13|35|38|31.19|36|50|
|Image removed|30.59|34|40|30.54|37|41|
|Default-b|30.60|44|52|30.36|43|49|

The removal does not produce a material repeatable gain. Counts and censored
endpoints remain alongside p95; baseline tails vary without a useful improvement
in callback coverage. No causal GPU/compositor claim follows.

All18 strokes/4320 samples preserve exact720x542 decoded RGBA, actual delivered
~60events/s and exact stage/options/path. The12 baseline strokes also preserve
complete2732x2048 viewport pixels. Only removal's viewport equality is exempted
explicitly in the local verifier; original result records are untouched.

## Reproduction and remaining work

Raw results, screenshots, logs, run.sh and verify.mjs remain in ignored
artifacts/t3/chrome-background-attribution/.

```sh
node --test scripts/shared-pen-idle-control.test.mjs scripts/shared-pen-studio-control.test.mjs scripts/shared-pen-pixels.test.mjs
bash artifacts/t3/chrome-background-attribution/run.sh
node artifacts/t3/chrome-background-attribution/verify.mjs
```

14 control/pixel tests pass; JS syntax and whitespace pass. Root benchmark wrapper
closed its browsers, Docker containers and4321 server for every lane. No full
browser/public rerun, native execution, media change or baseline acceptance.
Actual iPad latency, foreground animation loss and native0/17 remain unverified.

Next bounded attribution: separate the two720x542 transparent foreground/path
effect surfaces above paper from other surrounding UI. A hidden overlay control
is diagnostic only; any production candidate must retain active foreground/path
semantics and exact full-studio pixels, history/export and all source UI.
