# Hierarchical studio minimization

Prepared HEAD22b1cc3; application source remains live e4130db, version0.15.0.
No runtime candidate is proposed. Parent owns review, integration and publication.
This investigates a desktop headless WebKit27.2 callback gap, not physical iPad
latency or the reported foreground-visible animation loss. Native acceptance
remains0/17. No baseline, original media, root handoff or Clipboard work changed.

## Independent timing audit

The initial full-studio diagnostic observed62.0 idle RAF callbacks/s followed by
29.58/s while replaying actual Pencil drawing. The page reports visible/focused;
a concurrent10ms timer records168 callbacks over2000ms, and Date.now agrees with
performance.now. The no-move-display diagnostic reaches61.97/s with dispatch
p95=1ms, versus full6ms, while retaining240 delivered pressure/path samples and
identical final decoded ink. It intentionally skips move-time display composition
and still renders on release; it is not a usable runtime fix or ink-freshness win.
Idle RAF stamps and callback wall times are retained individually, rather than
inferring rates from three-callback percentiles. Drawing retains complete callback
counts/times, timestamp gaps, censored endpoints, dispatch/deadline distributions
and achieved delivery rates. The experiment never uses timers to replace RAF.

[WebKit's explainer](https://webkit.github.io/explainers/animation-frame-rate/)
describes content and power-dependent scheduling. Current upstream
[AnimationFrameRate.h](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/AnimationFrameRate.h)
lists visually-idle, viewport, power and thermal reasons and15/30ms intervals.
Neither source identifies an active policy in the pinned binary. Its exact source
revision is not established here. No existing public Playwright WebKit diagnostic
for active throttling reasons was found; no power override, debugger installation
or guessed private protocol command was used. These observations weaken a fixed
page-wide30Hz-cap explanation, but cannot exclude adaptive browser policy or
compositor scheduling during changing content. Headless WebKit is not real Safari.

## Controls and what they actually change

`MINIMIZE` operates only in the benchmark, after source1095 has visibly started
and finished and all registered motion/UI media satisfy the original idle gate.
The production renderer, audio, history, input chronology and seed remain actual.
`none` installs no presentation change. `all` hides every sibling branch along
the paper ancestry, retaining all nodes, registered owners, media and canvas
stores; the paper and its ancestors stay visible at exactly the original box.
`chrome` selects siblings outside#surface; `surface` selects its three other
children. `sources` classifies chrome branches containing a canvas, with the
remaining branches in`static`; unions are explicitly named. All selected nodes
must compute to hidden. Per-node markers support generated branches without IDs.
Source states are read from real registered DOM owners, not replaced with empty
query results. Detached diagnostics retain explicit node references for snapshots.

`fresh*` temporarily places actual createPaint on a clone of the paper in the
loaded full environment. It keeps the original full renderer/resources alive,
uses the actual captured options, and restores the old paper after collecting
ink. Its restored whole-studio image therefore is not an ink-equivalent viewport
acceptance capture. It is an environment-attribution probe, not a replacement UI.
`no-display` suppresses only render calls during delivered pointermove dispatch.
It does not suppress samples or synchronous release rendering. Every intentionally
incomplete UI capture is separately labeled`TREATMENT-INCOMPLETE-UI.png`.

`release-blank` resets only proved-blank foreground/effect canvas stores to1×1,
keeping CSS dimensions. The later UI-store lane adds only the proved-blank
1024×768 color-picker canvas. Exact byte restoration and dimensions/context
transforms/styles are checked outside timing. This verifies canvas buffer resets,
not GPU-memory release; there are no invented GPU-memory numbers. The overlay
release screens33.07/s, color-picker-only30.08/s, all three33.76/s. Neither closes
the gap. The visible nonblank paper-canister canvas was refused by the resource
probe and never included in an accepted release lane. No active UI was reset.

## Failed assumptions and excluded evidence

All raw lanes, commands, logs, source copies/hashes, PNGs and results remain in
ignored`artifacts/t3/studio-minimization/`; failures are not silently discarded.

- The first ID-based grouped stylesheet omitted generated branches without IDs.
  Thus early`screen-all`, chrome and fresh/split interaction screens do not prove
  the intended complete-group ablation. Their actual node snapshots remain. A
  three-trial partial fresh/all screen reached53.27/53.69/54.19/s with exact ink,
  but cannot establish the originally intended all-group interaction. The final
  control uses marker selectors and a computed-visibility assertion.
- Initial fresh-all failed the post-treatment overlay-visibility assertion before
  recording a result row. Restoration now precedes that check; the intentionally
  incomplete screenshot is taken separately before restoration.
- Original-paint detach-all causes a missing Undo-face lookup in the real release
  hook. Its timing is invalid as an accepted comparison. It is retained with the
  actual error. Fresh paint avoids those full-studio hooks; it does not prove they
  are irrelevant for every production interaction.
- Repeated fresh-detach initially restored the ancestor's serialized inline style,
  rounding its scale. The box changed by about0.0002 CSS pixels and decoded ink
  changed from7c8449… to4bc72e…. That complete lane is excluded despite apparently
  favorable callback rates. The diagnostic now uses a removable background rule,
  and every treatment records and checks paper ancestry geometry during timing.
- Resource-v2 attempts correctly refused nonblank paper-canister pixels. The first
  v2 log path was inadvertently reused; its original empty-row result and exact
  failure text were copied to`excluded-release-ui-blank-v2/`. The next refusal's
  full log remains. Later v3 restricts the reset targets to proved-blank stores.
- An attempted interaction run failed on owned4351 before browser launch while
  the preceding owned child was finishing. No concurrent timing lane ran. The
  unused launcher was terminated, and later runs were sequential.
- The cursor-all draft accidentally selected a fresh-mode group that did not exist;
  it failed before timing. This is not evidence about cursor cost.

A current coarse all-group screen reached51.74/s versus chrome27.86/s and
surface27.81/s; the source/surface and static/surface splits reached33.29 and
38.73/s. Filtering to branches with client rectangles reached33.10/s. These short
screens motivate repeated controls but are not pooled, accepted improvements or
proof of one load-bearing element. Some early helper revisions were not archived
per lane; those are screening evidence only. Final comparisons archive sources
per lane and require identical helper/harness hashes.

## Interpretation and remaining hypotheses

A45Hz callback budget is useful as a sharp red/green detector for this particular
lab workload. It is neither a Safari requirement nor a physical presentation or
Pencil-to-photon acceptance test. Lower synchronous dispatch cost alone does not
prove fresher ink. No queued/consumed sample count is called a presented sample.
Final-release pixel equality also cannot establish intermediate ink freshness.

Ranked next explanations, conditional on the final repeated controls:

1. Interacting studio presentation surfaces or browser layer retention. A valid
   grouped ablation should change cadence at fixed geometry/resources; restoring
   its load-bearing subgroup should reproducibly restore the deficit.
2. Retained decoded assets/context classes or additional full-environment owners.
   Fresh paint in a loaded studio can remain slower than the bare fixture. The
   bounded blank-store resets did not explain the bulk gap; no broader resource
   reclamation or speculative production disposal is justified.
3. Content-dependent WebKit scheduling or phase interactions. Idle/no-op cadence
   differs from actual drawing, but active browser-policy reasons are unavailable.
   A validated engine diagnostic or device trace would discriminate this from
   rendering cost. No fixed policy claim follows from an approximately30Hz rate.

No application change means no new dev/built/17-static acceptance claim, long
soak, foreground-idle fix or physical iPad acceptance. Runtime pressure, spacing,
randomness, every source frame, native coordinates/audio/end gates, synchronous
release/cancel/save/export/history, oneUndo, neutral mouse/finger, source UI,
0.14 hover,0.15 bounded672-frame buffers and active scene tools remain unchanged.

## Final repeated evidence and reproduction

Final accepted sequence:`final-full-a`, `final-all-a`, `final-all-b`,
`final-full-b`; three Pencil60×1 strokes in each lane, sequential and reversed.
The controls share exact harness/helper hashes. Every one of12 strokes/2880
samples passes actual options, pressure/path chronology, input box, backing
size/context, opacity, stable decoded ink and complete **restored** viewport RGBA.
The treated UI screenshots intentionally omit branches and are not full visual
acceptance. Stage geometry is also asserted while the treatment is installed.
Every full source owner remains registered/connected and finished; Undo remains
hidden, real UI media idle, with identical before/during motion snapshots. No
source renderer or media owner is falsely treated as finished because removed
queries return no actors. All selected branches, including those without IDs,
compute to hidden. Buffer dimensions are unchanged in these presentation lanes.

Medians of three per-trial values; all strokes deliver240 samples at about60
actual move events/s, not an assumed requested rate:

| Lane | callbacks/s | idle callbacks/s | dispatch p95 ms | worst callback/censored gap ms |45Hz budget|
|---|---:|---:|---:|---:|---|
|Full-a|30.08|62|5|39|all red|
|All hidden-a|33.87|62|6|33|all red|
|All hidden-b|53.01|62|5|36|mixed:33.35/53.83/53.01|
|Full-b|30.51|62|9|44|all red|

`final-pair-invariants.json` records exact successful pixel/input/source checks.
The classifier keeps expected callback-budget failures in original files and
passes copies to the older pixel comparator only after independently checking
those failures. It does not accept mixed performance as a successful treatment.
The arbitrary45Hz budget does not convert those two faster ablation trials into
physical or production acceptance. The broad treatment is not repeatably green,
so **no load-bearing minimal group has been established**. The smallest reliable
red/green difference remains full studio versus the matched bare createPaint
fixture, which intentionally lacks the full studio environment.

Existing local dependencies/public inputs and the pinned existing image are
required; the runner never installs, pulls or downloads anything:

```sh
bash scripts/shared-pen-minimization.sh
# Own4351, three full/minimal60×1 trials each, MIN_CALLBACK_HZ=45.
# Full exits1 for callback-budget failures; minimal exits0; wrapper verifies
# exact ink/options/geometry/240 samples, true source states and expected budgets.
node scripts/shared-pen-minimization-compare.mjs \
 artifacts/t3/studio-minimization/final-full-a/results.json \
 artifacts/t3/studio-minimization/final-all-a/results.json \
 artifacts/t3/studio-minimization/final-all-b/results.json \
 artifacts/t3/studio-minimization/final-full-b/results.json
node --test scripts/shared-pen-{studio-control,idle-control,display-control,pixels}.test.mjs
```

The minimization runner uses4351 only;4352 is unused. All caches/build/logs/output
stay under the private artifact root. No built/browser release suite is warranted
because no application file changed. Final focused Node checks pass21/21;
JavaScript/shell syntax and whitespace checks pass. Owned wrappers close their
browser/server/container through finally/traps; temporary input links are removed
at handoff. Root still has its original dirty SERVER_HANDOFF.md and the isolated
Clipboard branch remains80a0661. No push, deployment, publication or version bump.

Final assembled one-command run completed successfully: `budget-full` exits1 with
three expected callback failures (30.99–31.10/s; median31.07), `budget-minimal`
exits0 with58.17/s median (all three green). Both have62/s idle callback medians.
The wrapper exits0 only after checking the budgets and actual invariants. Its
raw console output is`budget-command.log`. `final-invariants.json` jointly verifies
all18 final strokes/4320 samples with exact decoded RGBA
`7c8449a117a25c8f1c42f4b5baed24aa222c58ebd55ea6042f3ec5f8d69b42ca`,
exact CSS ancestry/options/path/context and stable release pixels. The15 full
studio strokes also have identical complete restored viewport RGBA; the three
bare-fixture strokes explicitly lack studio actors/UI and have no such claim.
Actual delivered-rate medians remain60.02–60.10events/s across the final groups.
No physical presentation, affected device, intermediate ink-freshness or new
foreground-idle acceptance follows. No runtime fix is supported by this phase.
