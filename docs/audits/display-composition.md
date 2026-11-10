# Display composition controls on live 0.15

Prepared application reference: e4130db7a0ecbcab3cac47f2db1082408a6e853b.
This investigation concerns desktop callback/input-delivery proxies. It cannot
reproduce physical Pencil latency or Safari losing animation while foregrounded.
No runtime, version, original media, accepted capture or source-audio gate changes.

## Corrected controls

The shared harness defaults to `UI_SCENARIO=legacy-undo`: its original warmup
stroke, Undo, and 150 ms wait remain a **random-source busy-UI** workload. New
runs also include browser mouse/keyboard warmup, so they are separately labeled
from historical trials. `quiescent` waits for the Undo image to become hidden,
all primary/secondary motion snapshots to report finished, and UI media to be
paused, ended or errored, then allows 200 ms. It neither stops an actor nor hides
UI. This is a warmed UI-idle stroke, not cold application startup.

`fixed-undo` pins only the benchmark-served Undo clip selection to source script
1095 (34 ticks, 100 ms authored tick period, source sound 1008). It waits for that
visible source actor then 150 ms. A four-second stroke can outlast this actor;
a one-second stroke overlaps it. `tool-selection` first waits for UI idle, selects
an alternate tool and waits again, then selects the measured tool with a browser
click immediately before replay. Its motion/media states are reported explicitly;
it is not an assumed equivalent to a physical pen leaving a tool button.

Every row retains before/after source IDs, frame indices, finished flags, media
ready/error/time/paused/ended state, user activation where exposed and recent
input trust. `UI_TRACE=1` is a **separate attribution lane**: native motion renders,
Undo source ticks and pending audio channels, and DOM animation attribute changes
are recorded during timing. Do not pool these timings with trace-off results.
`INSTRUMENT=0` removes canvas and move-handler timing wrappers; activation event
listeners and the media registry remain in both controls.

Installed Playwright 1.65 source (`playwright-core/lib/coreBundle.js`,
`CRExecutionContext.evaluateWithArguments`, around line 37344) sends
`userGesture:true`; `WKExecutionContext.evaluateWithArguments`, around line 50715,
sends `emulateUserGesture:true`. Thus evaluate is **not** a no-activation control.
Activation read by evaluate can itself reflect that emulation. Browser-generated
mouse/keyboard events are trusted; JavaScript PointerEvent replay remains
untrusted. Neither is physical Pencil input. Sequential per-event awaited trusted
CDP delivery remains rate-limited as documented in shared-pen-performance.md.

The first attempted all-media idle gate timed out after five successful WebKit
cells: a Pencil begin sound remained `paused:false`, `ended:false`, time zero,
readyState 2. Failed results/log remain under `webkit-quiet`. The corrected gate
specifically covers UI media (`/ui/`), while **all drawing-audio states remain
recorded**. This condition is UI-idle, not silent or proof of all media completion.
No production completion gate was bypassed or changed.

## Pixel identity and opaque display probe

`scripts/shared-pen-pixels.mjs` decodes PNG only after timing. It retains the old
dataURL hash, PNG-byte hash, color type and length separately from dimensions,
RGBA length and a hash of all decoded RGBA bytes. Synthetic pattern consistency
now uses exact decoded RGBA identity. A positive fixture compares RGB and RGBA
encodings of identical opaque pixels; changing one channel by one is rejected.
No visual tolerance or accepted baseline changes.

`DISPLAY_ALPHA=0` is benchmark-only and changes just createPaint's first display
getContext request. Art/preview/work/sample/snapshot/UI contexts are unchanged.
Post-timing snapshots record actual context attributes where supported and count
all non-opaque pixels; requesting a flag is not evidence it took effect.
The [HTML canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-alpha)
defines opaque black initialization/clear behavior when alpha is false. Existing
contexts retain their originally chosen settings. A future production candidate
must prove fresh/precreated context behavior and white-paper repaint after reset
and restoration; no speculative recovery loop is warranted.

Source inspection: compose saves state, fills white, then draws background, art,
preview, moving actors and optional foreground; selection outlines are subsequent
source-over draws. Eraser-without-background removes art on a separate transparent
work surface before drawing that onto the white display. Only drawing tools can
enter the shape branch; ordinary eraser contact is type stroke and uses that work
surface branch. This supports a **bounded experiment**, not exhaustive acceptance
of all lifecycle, moving, selection or scene semantics for a runtime change.

## Reproduction and retained evidence

All raw outputs are in ignored `artifacts/t3/display-composition/`, with private
4291 and Vite caches under each run. No installs, media modifications, native
execution or public suite reruns. Existing read-only dependency/media input links
are removed at completion. Host Node is 24.22.2; the pinned WebKit image reports
its bundled Node 26.13.0. Browser engine is pinned WebKit 27.2; engine/Node details
are preserved rather than pooled with Chromium.

```sh
node --test scripts/shared-pen-pixels.test.mjs
PORT=4291 PERF_ROOT=artifacts/t3/display-composition UI_SCENARIO=quiescent \
 TOOLS=pencil DRIVERS=inpage PATTERNS=60x1,120x1,240x1,60x2,60x4 \
 TRIALS=3 INSTRUMENT=0 bash scripts/shared-pen-perf-webkit.sh quiet-final
# Repeat with fixed-undo / tool-selection and separate labels.
# Repeat quiet/fixed Undo with DISPLAY_ALPHA=0 and separate labels.
```

All 240 chronological seed53 pressure/path samples, corrected task yields, actual
delivered rates, complete callback counts and leading/trailing censored gaps are
retained. Duration/velocity match within each pattern before/after, not across
all patterns. No fake timing clocks. Requested 240 Hz is never called achieved
without checking delivery. Readback and PNG decode happen after timing.

A second control failure was caught by inspecting source snapshots: the first
`quiet-final` row still showed visible Undo1095 frame2. The wait had observed
`hidden=true` during asynchronous image decode, before playback started. That
entire lane is excluded from paired acceptance; its successful replay/pixel data
and raw summaries are retained. The corrected control first observes the selected
source actor **visible**, then waits for completion. An additional pre-replay
assertion rejects visible Undo or unfinished motion in the quiescent lane.
`busy-final` remains historical evidence; matched comparisons use the new
`*-start-gated` labels. `selection-final` was allowed to finish after the parent
queue was stopped, retaining its evidence without starting opaque probes early.

The accepted source-start-gated matrix uses one identical harness hash for its
three UI lanes and both display-setting requests. Every quiet row begins with Undo
hidden and all motion finished; every fixed-Undo row begins at script1095 frame1;
every selection row begins with unfinished source motion and no visible Undo.
The selection lane includes missed requested rates and large tails; it is not
pooled with quiet or fixed-Undo p95 values. The motion stores remain254×147,
36×79 and373×75 (272,628 nominal RGBA bytes) in every treatment.

WebKit's getContextAttributes reports colorSpace, desynchronized and
willReadFrequently here, but omits alpha. Therefore the separate semantic probe
also clears the actual context and records decoded bytes before repainting;
transparent versus opaque clear/reset output determines whether the setting took
effect. Neither an omitted attribute nor a fully white initial render establishes
opaque allocation by itself.

## Main repeated results

Medians of three **per-trial** percentiles, Pencil, same host/engine/workload and
source UI program within each display pair; these are not pooled frame samples.
The raw `summary.json`/`summary-main.txt` preserve p50/p95/worst dispatch, callback
coverage, worst observed/censored gaps, achieved rates and deadline-age proxies.
Uninstrumented rows intentionally have no capture-to-bubble handler/event-age
measurements; separate instrumented attribution rows retain them.

| Events × samples | UI-idle RAF p95, default / alpha:false request ms | Fixed Undo RAF p95, default / alpha:false request ms | Selection RAF p95 ms |
| --- | ---: | ---: | ---: |
| 60×1 | 44 / 36 | 37 / 39 | 42 |
| 120×1 | 37 / 39 | 37 / 39 | 53 |
| 240×1 | 37 / 38 | 39 / 43 | 55 |
| 60×2 | 38 / 39 | 39 / 41 | 56 |
| 60×4 | 40 / 42 | 38 / 39 | 79 |

UI-idle callback medians span27.04–30.62/s by pattern, fixed Undo29.56–30.19/s,
selection23.13–28.43/s. Selection240×1 achieves196.22 events/s; selection60×4
achieves49.08 events/s, with a191ms worst callback gap and2,130ms worst intended
sample-deadline backlog in that group. All240 samples remain. These results do
not turn requested rates into received rates, or infer physical event age.

Alpha:false-request UI-idle dispatch p95 ranges5–7ms versus6–7ms default. In fixed Undo it is
5–7ms versus7–9ms, while callback coverage falls to27.94–28.86/s and p95 gets
worse. This reinforces that smaller synchronous dispatch time alone is not an
acceptable presentation improvement. UI-idle60×1's apparent between-run p95 difference is not
representative of the whole matrix; a reversed-order repeat is retained separately.
No runtime change is accepted; the byte-level context probe below shows the requested treatment is ineffective in this WebKit environment.


## Treatment verification and final decision

**Pinned WebKit27.2 ignores the requested opaque setting in these tests.** The
actual fresh context still initializes/clears to transparent RGBA, with or without
willReadFrequently. This was verified independently on a bare two-by-two canvas,
not inferred from createPaint's white render or an omitted context attribute.
`context-probe-webkit.json` preserves exact options, attributes and actual bytes.
Chromium158's fresh alpha:false canvas instead initializes/clears to opaque black;
a context precreated with default settings stays transparent in both engines.
Consequently all WebKit before/after timings above compare requests whose opaque
semantics **did not differ**. Their variation is not evidence for an opacity gain.
No CPU/GPU/compositor explanation is established by these measurements.

The reversed-order UI-idle repeat (opaque request first, default second) gives
60×1 RAF p95=34/44ms, but callback coverage31.30/31.24 per second; 60×4 gives
36/44ms with identical31.43 callbacks/s. Dispatch p95 is8/12ms and11/12ms.
These apparently favorable tails coexist with earlier opposite coalesced tails
and the ineffective treatment. They are preserved, not accepted as a runtime win.

Semantic probes on Chromium and pinned WebKit each collect96 snapshots across
fresh/default-precreated contexts, default/alpha:false requests, and24 states.
All rendered states have identical exact decoded RGBA and no transparent pixels:
initial white paper, held/released Pencil, erasing with/without background,
foreground, selection create/move, clear, undo/redo, save/restore, moving-paint
initial hold/release/cancel-flush, and render after clear/reset. The two raw
clear/reset states intentionally differ in Chromium's genuinely opaque fresh
context; after paint.render white paper matches again. Moving audio uses real
production handles and cancellation; no sound gate is mocked or bypassed.
These probes do not claim context-loss/restoration or exhaustive scene acceptance.
There is no candidate runtime change requiring such promotion gates here.

Separate instrumented60×4 source attribution retains60 events/240 samples in all
four UI scenarios. UI-idle records0 motion renders/0 Undo ticks/0 mutations;
fixed Undo records11 source1095 updates (ticks2–12), pending channel1,0 motion
renders and22 DOM mutations; selection records9 motion renders,0 Undo ticks and
9 mutations. Legacy randomized Undo is separately retained. These traces are not
pooled with wrapper-free timing lanes.

The trusted Chromium240Hz-request delivery gate fails at60.005 received events/s
(exit1, MIN_DELIVERY_HZ=200), while corrected in-page replay passes at240.830/s
(exit0); both retain240 samples. This is replay-fidelity red/green, not physical
latency red/green. The two PNG fixtures pass: encoding-only differences accepted,
one changed channel and changed dimensions rejected. Syntax and diff checks pass.

`invariants.json` covers87 accepted matrix/reversal strokes (20,880 samples),
identical harness hash, exact CSS box, decoded720×542 RGBA hash, stable snapshots,
actual source-state preconditions and unchanged272,628-byte motion stores.
The initial failed/excluded lanes remain separate. The final dimensions check in
the reusable helper was added after these timed lanes; it changes only post-timing
pixel validation, and a final smoke run covers the assembled harness.

No application file changed, so production pressure/spacing/randomness, neutral
mouse/finger behavior, layering, history/release/cancel/export, v0.14 hover repair
and v0.15 bounded source buffers remain exactly the live reference implementation.
No public/full browser suite, long idle soak or baseline update was repeated.
Version stays0.15.0; native references remain0/17. No physical iPad latency or
foreground-idle fix is claimed.

Next practical experiment: compare source-start-gated full studio against minimal
createPaint using the **exact measured stage box** (including x218.9947967529297),
with matching UI-idle and source-selection workload definitions. If full studio
alone retains the cost, isolate one stage/surface compositing rule at a time,
with active Undo/object/path/foreground overlap proofs before any CSS promotion.
The current ineffective WebKit alpha option is not a useful performance treatment.
