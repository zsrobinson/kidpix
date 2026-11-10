# Finished motion-owner callback attribution

Runtime reference is live0.15 e4130db; prepared controls start at789ffbf.
This is a pinned desktop WebKit27.2 lab experiment, not a reproduction of physical
iPad latency or Safari animation stopping while foregrounded. No production
source, version, media, accepted baseline or source completion/audio gate changes.

## Finished-owner control

`IDLE_OWNERS=default|parked` installs identical benchmark-only source hooks and
callback counters in createNativeToolMotion. Off remains the harness default.
The live owner closure exposes its actual controller snapshot, pending-load state,
canvas identity and callback count. Inactive registered instances are excluded;
exactly three active owners must be present, ready and finished before timing.
Park cancels only their registered RAF handles. Paint, replay and independent RAF
sampler remain live. No DOM, canvas, media or input is hidden/removed/frozen.

At the end of timing the harness captures all owner counters, immediately
re-registers each parked owner in that same evaluate job, then waits two RAFs.
All three must have run again. Default must show callback coverage; parked must
show zero callbacks across the entire measured window. Owner identity must remain
stable. This is intentional suppression for attribution, not a production scheduler.
No claim of faithful input/state wakeups is made or needed for a rejected control.

Both quantitative lanes use INSTRUMENT=0/UI_TRACE=0, fixed source Undo1095 and the
same source-start-before-idle gate. Playwright evaluate emulates user gesture;
JavaScript pen replay is untrusted, not hardware input or a no-activation test.
240 chronological seed53 pressure samples, all native coordinates/base spacing,
options and random sequence remain. 60×1 delivers240 moves over4s; 60×4 delivers60
moves over1s. Duration matches within each pattern, not between patterns.

The first two startup attempts (`default-a`, `default-b`) were rejected before
any timed stroke: inactive registrations broke the count, then a missing transform
return prevented hook installation. Their results/logs remain in raw evidence.
Accepted phase1 uses one identical harness/helper hash and archived source.

## Reproduce

Read-only input symlinks point to existing public/node_modules. No installs or
image pulls. Exclusive private4311 is owned only for each command's lifetime.

```sh
node --test scripts/shared-pen-idle-control.test.mjs scripts/shared-pen-studio-control.test.mjs scripts/shared-pen-pixels.test.mjs
PORT=4311 PERF_ROOT=artifacts/t3/idle-callback-cost IDLE_OWNERS=default \
 UI_SCENARIO=quiescent TOOLS=pencil DRIVERS=inpage PATTERNS=60x1,60x4 \
 TRIALS=3 INSTRUMENT=0 UI_TRACE=0 bash scripts/shared-pen-perf-webkit.sh default-c
# Change IDLE_OWNERS=parked, label=parked-a. Reverse patterns for default-reversed.
node scripts/shared-pen-studio-compare.mjs path/to/default/results.json path/to/parked/results.json
```

Raw evidence is local ignored `artifacts/t3/idle-callback-cost/`, including exact
commands, archived phase1 source, all per-trial callback timestamps/counts/tails,
leading/trailing censored gaps, achieved delivery rates, before/end/resumed owner
snapshots/counters and old encoded PNG hash plus exact decoded RGBA hash.
Parent owns independent review/integration/releases.

## Parking result

Three trials per pattern, run order default-c → parked-a → default-reversed.
Values are medians of per-trial statistics, never pooled callback samples.

| Lane | 60×1 callbacks/s | RAF p95 ms | worst gap ms | 60×4 callbacks/s | RAF p95 ms | worst gap ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default | 30.07 | 36 | 39 | 30.51 | 39 | 41 |
| Parked | 30.54 | 36 | 42 | 31.25 | 39 | 43 |
| Reversed default | 30.55 | 36 | 40 | 31.16 | 38 | 39 |

Parking changes callback rate by+1.55%/+2.42% versus the first default, but
−0.05%/+0.29% versus reversed default. It produces no material repeatable gain,
no favorable p95 change, and slightly worse maximum gaps. This rejects finished
motion-owner callback scheduling as the explanation for the roughly2× matched
full/minimal difference in this quiet Pencil workload. It does not prove zero
aggregate CPU cost, or say anything about active action/Text/Grab owners.

All18 timed strokes/4320 samples pass exact stage ancestry, subpixel geometry,
options, pressure chronology, context attributes and decoded720×542 RGBA identity.
Every parked stroke verifies zero callbacks in each owner; each resumes with2–3
callbacks after timing. The controller source scripts/ticks/frames remain available
in before/end/resumed snapshots. All three default owners show timed callbacks.

## Presentation attribution controls

After the negative parking experiment, benchmark-only PRESENTATION=paper-promote
and surface-promote set only the selected node's `will-change:transform` hint.
Every row verifies its actual computed value; this proves the CSS hint applied,
not an engine GPU-layer allocation. Neither changes layout, explicit transform,
DOM visibility or source presentation. The source hooks/counters remain enabled
in default mode in every presentation lane, with identical harness/helper hashes.
Phase2 adds a full viewport PNG after all timing and resumes, plus decoded identity
checking for the complete visible studio. Screenshots are1366×1024 at DPR2.

Paper promotion worsens cadence despite unchanged entire visible studio pixels.
It cannot be a runtime candidate. Static screenshot equivalence is narrower than
active Undo/source-control/object/path/foreground overlap or the17 canonical
static cases; those acceptance gates have **not** been claimed or bypassed.
No production CSS change is proposed based on a blank-paper ink hash.

| Lane | 60×1 callbacks/s | RAF p95 ms | worst gap ms | 60×4 callbacks/s | RAF p95 ms | worst gap ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Phase2 default | 30.03 | 35 | 39 | 30.27 | 36 | 37 |
| Paper hint | 17.90 | 68 | 76 | 22.40 | 58 | 66 |
| Surface hint | 20.63 | 53 | 63 | 20.89 | 58 | 71 |

Paper hint lowers callback rate by40.4%/26.0%; surface hint by31.3%/31.0% versus
its phase2 default. Their unchanged complete viewport hash is
`1b861731f8b5d409` (prefix of SHA256; full value in raw rows). Ink remains exact
`7c8449a117a25c8f1c42f4b5baed24aa222c58ebd55ea6042f3ec5f8d69b42ca`.
This is evidence against those two hints, not a general proof of a compositor,
GPU, alpha, readback or containment cause. Previously rejected controls were not
retested. No callback timestamps have been interpreted as actual presentation.

The reversed phase2 default recovers30.32/29.15 callbacks/s (p95=35/37ms,
worst41/48ms). Its lower60×4 median includes one25-callback trial; raw counts and
censored tails are retained, not discarded. Promotions remain substantially slower.
All24 phase2 strokes/5760 samples pass exact ink/geometry/options and entire
2732×2048 decoded viewport identity. This does not establish active overlap gates.

The first gradient-removal control failed the computed-style gate **before any
timing**: the later application background shorthand overrode the treatment style.
The excluded `gradient-removed` evidence is retained. A stronger benchmark selector
`#app #studio` fixes the cascade; a new matched default is measured separately.
No failed or incompatible harness lanes are pooled into accepted timings.

## Gradient attribution

The corrected gradient-removal lane changes only computed studio background-image
from the authored radial-gradient to none. Full viewport pixels **differ**, as
expected; original PNGs and hashes are retained. Exact decoded ink, stage ancestry,
options and all240 samples still match. The artifact verifier explicitly excludes
whole-studio identity for this removal comparison, without changing any image
comparison tolerance or claiming UI acceptance. It is never a shipping candidate.

| Lane | 60×1 callbacks/s | RAF p95 ms | worst gap ms | 60×4 callbacks/s | RAF p95 ms | worst gap ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Matched default | 30.98 | 34 | 40 | 31.31 | 35 | 38 |
| Gradient removed | 30.79 | 35 | 40 | 31.37 | 36 | 37 |
| Reversed default | 31.27 | 44 | 47 | 30.39 | 45 | 49 |

There is no repeatable material cadence gain from gradient removal. Reversed
baseline tails vary despite a similar callback rate, reinforcing the need to
retain counts and censored endpoints alongside p95. This phase adds18 strokes/
4320 samples. The unpaired earlier gradient-default-a is retained but not pooled
across different helper hashes.

## Handoff and remaining seam

No runtime candidate is justified. There is no scheduler/CSS/paint change to
integrate. Tool version stays0.15.0; `git diff e4130db -- src package.json` is empty.
Thus0.14 Crayon/Marker left art,0.15 bounded672 source frames, synchronous ink
release/cancel/export/history, source audio gates, oneUndo per stroke, neutral
mouse/finger semantics and editable scene behavior remain the live source.
They have not been re-proven by this performance experiment. No built/full public
suite, public soak, media upload, baseline edit or native run was performed.
Active Undo/source UI/object/path/foreground overlaps and17 static acceptance
cases remain required before **any** future production CSS candidate.
Actual iPad latency, foreground-idle failure and native references remain unverified
(native0/17). No physical sampling, compositor presentation or Pencil-to-photon
measurement is available here. WebKit CPU/GPU attribution remains unavailable.

The residual lab cost is now narrower: the three finished-owner registrations and
studio gradient do not account for it; paper/surface transform hints worsen it.
A next single attribution control is to remove **only** the static
`#paint-chrome` background image, retaining the node, geometry, source UI actors,
media, input and every ink sample. Verify actual computed removal and explicitly
record changed whole-studio pixels; retain/reverse exact default trials. That
would test one remaining full-stage static image. It is not permission to remove
chrome or ship a visually incomplete studio. No global RAF freeze, hidden canvas,
alpha/readback/containment retry, sample dropping or audio bypass is warranted.

## Final verification

13/13 Node controls/pixel checks pass; JS/shell syntax and diff checks pass.
The final assembled harness retains the lab callback-budget red/green:
`MIN_CALLBACK_HZ=45 IDLE_OWNERS=off TRIALS=1 PATTERNS=60x1,60x4` exits1 for full
studio and0 for exact-box minimal createPaint. This is a desktop callback proxy,
not physical latency acceptance or a proposed replacement UI. Every final stroke
retains240 pressure samples and exact decoded ink. The single full60×1 trial is
slower than the repeated matrix; it is retained rather than pooled or discarded.

`invariants-final.json` and its reproducible local `verify.mjs` cover64 accepted
strokes/15,360 samples across the disjoint phases. The verifier explicitly expects
the final full-studio callback budget failures, checks that minimal has none, and
leaves original results unchanged. It also verifies parked controller
script/tick/frame snapshots are exactly unchanged before/end/resumed, beyond the
zero-callback and actual-resumption gates. Whole-studio pixel equality is checked
for the promotion controls; gradient removal is explicitly outside that claim.
Raw startup failures/exclusions, unpaired control, all achieved rates and complete
tails/counts/censored intervals remain available. Raw outputs are ignored local
artifacts, not release or baseline records.

Final full/minimal callback rates are23.73/58.60 for60×1 and32.16/57.56 for60×4;
p95 is45/19ms and36/21ms, worst gaps47/23ms and37/22ms respectively.
Owned server/container lifetimes ended through wrapper/finally cleanup; input
symlinks are removed at handoff.4312 was not used. No other worktree/service or
root dirty handoff/isolated Clipboard work was edited. Parent retains integration,
independent review and release responsibility.
