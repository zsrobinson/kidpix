# Intermediate ink freshness experiment

2026-11-10. Prepared published 0.19.1 main
`505b033e8646c127ee084b25e447c49db2f20bac`, isolated
`t3-3b794c12`. **NO runtime fix.** Only reusable benchmark controls, tests and
this audit change. Parent owns review and any future publication; focused checks
do not approve or publish a candidate. Native references remain **0/17**. Implementation commit:
`3912b3922168a412513f3a0da1c69e4b1037bb81`.

## What is now red-capable

`scripts/ink-freshness-matrix.sh` drives the current full studio and actual
`createPaint` fixture through the existing real-clock shared pen harness. An
opt-in monotonic black Pencil path makes the rightmost dark pixel a conservative
spatial bound on ink progress. Screenshots cover the complete viewport; analysis
scans only the paper's blank stroke strip. All 240 chronological pressure samples
are retained, with a separate 241-point `strokeTo` entry trace including release.
No predicted points, downsampling, source animation suppression or audio bypass.

The benchmark-only 150 ms fault copies each newly rendered display into a queued
canvas, restores the previous display, then applies that snapshot after a real
timer. Release cancels timers and renders synchronously. This deliberately adds
copies and changes scheduling; it is a fault injector, not a candidate renderer
or calibrated latency source. All faults have the same final decoded ink,
consumption trace and complete studio screenshot as their green controls.

Both fault runs exit 1 specifically for stale intermediate ink. Both adjacent
full-studio green runs exit 0. This rejects a class of changes that passes
final-pixel/sample-count checks while showing old ink during a held stroke.
The fixed 75 ms gate is a lab fault-discrimination threshold, not a Safari target.
A green verdict means no above-threshold lag in the sampled eligible captures;
it does not prove continuously fresh ink between captures.

## Observables and limits

1. **Delivery:** actual dispatch start/end, event/sample counts and real intended
   deadlines. Synthetic PointerEvents are untrusted and use a capture shim.
   Requested frequency is not measured frequency. Coalesced replay is separate
   from trusted Chromium CDP pen delivery and physical Pencil input.
2. **Consumption:** actual `strokeTo` entry points, native coordinates, pressures
   and real timestamps. This is application execution, not a visible frame.
3. **Backing pixels:** a 720×60 `getImageData` strip read immediately before each
   screenshot, with read start/end and rightmost dark pixel retained. It can
   force work and is part of the observer treatment, not passive telemetry.
4. **Browser capture:** actual decoded full-viewport Playwright PNGs. Each has a
   browser-clock bracket before request/after return and the delivery snapshot
   at its start. The rightmost visible extent is mapped to chronological input.
   Reported stale milliseconds are the interval from the first delivery beyond
   that extent to the latest delivery before capture request. Brush width and
   ink arriving during screenshot acquisition make this bound conservative.
   It is neither an exact visible sample index nor an exact capture timestamp.
5. **Presentation:** physical scanout/photons, OS/hardware sample age, and the
   friend's iPad are unobservable. Neither RAF, backing readback nor screenshot
   return is called a presented frame. Screenshots may force rendering and miss
   transient stale ink. No screen-to-Pencil latency is inferred.

Tool discovery found no passive Safari presentation trace tool. The direct
WebKit capability probe returned exactly `CDP session is only available in Chromium`. Public
Playwright WebKit offers screenshots but no public CDP frame stream. Existing
Chromium CDP timeline tracing can attribute work; CDP screencast is available
as a potential frame source, but neither is a validated physical presentation
oracle here. The Chromium about:blank probe accepted screencast and produced one frame
with protocol timestamps; it was not validated on ink. Its category query
returned no matching timeline/frame/screenshot categories. No passive trace
or frame-based ink oracle was validated. No guessed private WebKit protocol
or installed tracing tool.
The strongest validated proxy is therefore **bracketed screenshot ink extent
versus previously delivered input**, with a backing strip observation alongside.
It helps reject stale intermediate output that identical release pixels conceal.
It cannot choose between small runtime freshness improvements in this lab.

## Current-runtime controls

Pinned existing WebKit 27.2 image, container Node 26.13.0, Linux Ryzen 5 3600;
1366×1024 landscape viewport, DPR2, touch enabled, native paper 720×542.
Both modes use the exact measured CSS paper box, scale, options (Pencil size16,
black, freehand), seed53, path and pressure. No browser/device emulation claim.
Full studio observes Undo script1095 start before waiting for completion, all
three real motion owners (`draw`, `draw:18200`, `draw:18400`) finished, Undo
hidden, image decode and finite UI media settled. No media errors in accepted
preconditions. Bare paint explicitly has no studio source actors or UI media;
it uses actual history and has no whole-studio visual-equivalence claim.

The sequence is full green-a, fault-a, fault-b, green-b, minimal green-a,
minimal observer-off-a, full off-a, full off-b, minimal off-b, minimal green-b.
Timing lanes are sequential; controls reverse order. These are two trials each,
not population statistics. Raw observations, not pooled percentiles:

| WebKit lane | Delivered events/s a / b | RAF callbacks/s a / b | Eligible captures a / b | Largest sampled stale lower bound a / b |
| --- | ---: | ---: | ---: | ---: |
| Full, observer on, green |60.92 / 62.86|5.71 / 5.39|4 / 3|0 / 0 ms|
| Full, observer on, 150 ms fault |16.19 / 18.67|6.53 / 5.57|14 / 13|119 / 120 ms|
| Bare, observer on, green |61.50 / 62.11|19.03 / 20.42|12 / 12|0 / 0 ms|
| Full, observer off |60.17 / 60.11|31.08 / 31.47|0 / 0|unobserved|
| Bare, observer off |59.99 / 60.01|58.31 / 57.64|0 / 0|unobserved|

Eligible screenshot brackets span 847–919 ms for full studio and 224–257 ms
for bare. Those are acquisition/return brackets, not camera exposure or GPU
costs. Strip readback durations remain individually recorded at WebKit's clock
resolution. The observer has a large effect on callback scheduling and deadline
backlog. Fault snapshot copying also substantially changes delivery. These
controls rule out interpreting observed cadence or the fault's measured stale
bound as undisturbed physical latency. Observer-off still reproduces the old
full/bare callback gap on actual 0.19.1; it does not establish a freshness gap.

No runtime hypothesis was promoted or tested: screenshot perturbation prevents
a defensible small freshness comparison, and both green modes are below the
coarse sampled fault threshold. Repeating rejected opacity, containment,
promotion, chrome/gradient, blank-overlay, finished-RAF, display-coalescing or
loader-cap treatments would add no new discriminating evidence. An expensive
brush would not repair this measurement limitation, so only low-cost Pencil
was used in this bounded experiment.

## Exact receipts and reproduction

`artifacts/t3/ink-freshness/receipts.json` checks all ten accepted WebKit strokes:
2400 delivered chronological samples and 2410 consumed points; exact
coordinates/pressure across full, bare, observer on/off and fault; identical
options, paper geometry/backing and final RGBA; complete full-studio screenshot
equality in all six full lanes. Expected fault failures must contain only
`intermediateInkStaleLowerBoundMs`, never a missing-capture or unrelated error.
Green observer lanes require at least three eligible intermediate captures.

Accepted WebKit final ink SHA-256:
`adc7c422e53346ab2ccdca03e3a576ff025d83c55ea592c2c43dd15012c75acd`.
Complete full-studio RGBA SHA-256:
`c2baacb0b61279e444f0c9987ababa0fb6139e63a7d3c626e0936609497e1ebb`.
Source harness/helper hashes and full before/after source-owner states are in
every results.json. Encoded PNG hashes are distinct from decoded RGBA identity.

Existing dependency/media symlinks are temporary read-only inputs. No install,
image pull, original software execution, build copy, baseline edit, version bump,
push, deploy or public/full-release gate. Only strict private4541 is used;
4542 is reserved and unused. Dev serves current source; no built-runtime claim.
Container source/dependencies/media are read-only, own artifacts writable,
UID/GID preserved, host network, capabilities dropped, shm512m, `--pull never`.

```sh
ln -s /home/zsrobinson/code/kidpix/node_modules node_modules
ln -s /home/zsrobinson/code/kidpix/public public
# Fresh labels are required: wrappers refuse to overwrite evidence.
INK_PREFIX=repeat bash scripts/ink-freshness-matrix.sh
# Initial accepted sequence used the default prefix final.
node scripts/ink-freshness-compare.mjs
node --test scripts/ink-freshness-control.test.mjs \
 scripts/shared-pen-pixels.test.mjs scripts/shared-pen-studio-control.test.mjs \
 scripts/shared-pen-display-control.test.mjs
```

Supplemental current-runtime input receipts (`input-receipts.json`) pass:
trusted Chromium requested240 Hz, actually **60.002/s observer off** and
**15.335/s observer on**, with all240 trusted moves and241 consumed points in
both. Both exit1 solely for the requested-delivery gate (<200/s); sampled ink
freshness passes. Same Chromium final ink RGBA
`154b3ea3991bb1a7092e76403e19f9316ec7b1bb99d64f8101278345666f0f59`.
WebKit synthetic **60×4 coalesced replay**, observer off, actually60.143 events/s:
60 delivered events,240 samples,241 consumed points and exact accepted WebKit
ink/pressure chronology. That lane has no intermediate visibility claim.

```sh
# Repeat sequentially with INK_OBSERVE=1 and =0, separate fresh PERF_OUT labels.
INK_FRESHNESS=1 INK_OBSERVE=1 TOOLS=pencil PATTERNS=240x1 DRIVERS=cdp \
 TRIALS=1 INSTRUMENT=1 UI_SCENARIO=quiescent PORT=4541 MIN_DELIVERY_HZ=200 \
 PERF_OUT=artifacts/t3/ink-freshness/trusted-chromium \
 node scripts/shared-pen-perf.mjs # expected exit1, delivery gate only
PATTERNS=60x4 INK_OBSERVE=0 \
 bash scripts/ink-freshness-webkit.sh coalesced-webkit-off
node artifacts/t3/ink-freshness/verify-inputs.mjs
node scripts/ink-freshness-capabilities.mjs
# Same capabilities script ran ENGINE=webkit in the pinned read-only container.
```

21/21 focused Node controls pass; syntax/whitespace checks pass. No full release
gates were run. Source/helper hashes match across the ten final matrix rows.

Early Chromium replay red/green, a too-short 60×4 lane with inadequate coverage,
and the initial arithmetic-test boundary failure are retained separately, not
pooled into accepted WebKit results. Screenshot PNGs, logs and results live only
in this checkout's ignored artifact root; they are evidence, not release baselines.

Production drawing, neutral mouse/finger pixels, synchronous release/cancel,
undo/export, readiness/fallback ownership, source motion and audio are unchanged;
this benchmark does not newly certify those runtime semantics or audible feel.
Enlarged vacuum remains disabled. Physical iPad latency, foreground-visible idle
failure and audible feel remain unverified; native **0/17**. Parent dirty
SERVER_HANDOFF, deferred Clipboard80a0661, original media and unpublished history
remain untouched. Only owned browsers/containers/servers are stopped and temporary
links removed at handoff. No runtime candidate is approved or published.
