# Loaded-page iPad idle animation diagnosis, 2026-11-10

Baseline e904502 /0.13. No browser, server, trace, installation, media export or
physical-device run was used in this investigation. Parent's Pencil profiler
owns initial browser access. The request was read from the root's ignored
`artifacts/t3/ipad-feedback/request.md`; this checkout owns all outputs below.
Clipboard80a0661 is untouched. Original Windows EULA is still pending consent;
no native execution occurred. Native references remain0/17.

## Proven boundary, not a Safari fix

No idle runtime patch is justified by the evidence so far. Finite source auxiliary
animation ending is normal; acceptance must test **fresh entry** into another
unselected tool, not merely expect a stationary hover to animate forever.

`native-tool-motion.js` owns one rAF chain per prepared owner. Each callback
refreshes authoritative state, calls controller.step, then schedules its successor.
An uncaught error before that last call ends that chain. Updating the same owner
repaints but does not restart it. Tray reset increments generation, aborts pending
loads, cancels rAF and disposes streams; option/color/size update preserves it.
The shared adapter also drives action motion; a failure there may be independent
of the primary layer. Rollovers have separate, generation-checked rAF chains.

Blur/pagehide/hidden call cancel, stopping base/auxiliary owned cues and clearing
hover/tracking/capture. Those paths do not cancel the adapter's rAF. No explicit
pageshow/freeze/resume/context-restoration handlers exist in this adapter.
That absence does not prove Safari requires any particular recovery handler.
Async load exceptions leave static controls with motionError; this is different
from an already decoded owner losing animation after idle.

The actual timeline Node probes demonstrate: a12-hour clock gap advances once,
with no cue burst; unresolved channel1 completion holds a terminal auxiliary pose
while step calls continue; cancelling clears sound ownership and tracking, and a
fresh entry advances. These are model results, not Safari/OS suspension evidence.

## Ranked falsifiable hypotheses

1. A callback throws after resume, killing one adapter rAF chain. Prediction:
   pageerror/exception stack coincides with loss; independent heartbeat continues,
   but source canvas state stops changing even on fresh entry; changing trays
   recreates the failed owner. Capture the exact exception before adding recovery.
2. Safari leaves an Audio handle unresolved after interruption, holding the
   terminal end gate. Prediction: frame delivery continues, the affected actor
   reaches its terminal pose, and its channel1/2 has neither ended nor errored;
   leave/cancel then fresh entry clears the hold. If all fresh hover animations
   fail to advance their early frames, this explanation alone is insufficient.
3. A missed terminal pointer/cancel event leaves tracking/hover ownership stale.
   Prediction: fresh pointerover does not call enter due to tracking or same-hover
   checks, whereas delivered blur/pagehide cleanup restores fresh entry. Record
   pointerId, capture/lostcapture, target identity and controller cancel at failure.
4. Safari drops canvas contents or loses/restores its2D context while source
   snapshots/RAF continue. Prediction: dataset snapshots advance despite static
   pixels; context events or a same-owner repaint restore art. Compare pixels and
   snapshots; do not restart timelines or audio merely to repaint.
5. The page is still frozen/hidden or the WebContent process was discarded.
   Prediction: independent heartbeat also stops, lifecycle/visibility shows the
   transition, or a reload creates a new probe/navigation identity. Compare real
   foreground idle with tab-switch/lock runs. A fake time jump cannot test this.

Cold bundle delivery remains a separate issue. All cases below first wait for a
visible decoded native drawing canvas. No evidence links partial cold network
responses to loss of a loaded owner's animation.

## Deferred acceptance and instrumentation

`tests/browser/ipad-lifecycle-deferred.spec.js` is syntax-checked, **not run**.
Parent can use its isolated browser configuration and outputs after profiling:

```sh
npx playwright test -c playwright.firehose.config.js ipad-lifecycle-deferred
```

The spec observes real source progress on fresh crayon entry, delivered synthetic
pagehide/pageshow cleanup (not real OS suspension), Chromium CDP frozen/active
round trip (not Safari), real prior-hover1029 repetition followed by clear and
multiple repeat boundaries, and fresh hover recovery. It collects rAF delivery
and pending counts, page errors/rejections, audio events/state, lifecycle and
canvas context events. Audio is real in the lifecycle tests; the bubbling test
refuses playback and validates calls, not audible output. Existing Firehose
integration tests should then cover full picture/Undo/Redo/input regressions.

The optional BFCache test requires `IPAD_REAL_BFCACHE=1`, an engine/launch that
enables BFCache (Chromium automation defaults may disable it), and **asserts
pageshow.persisted===true** after navigation/back. A failure to get persisted is
an unavailable BFCache test, never a passing suspension reproduction.

Physical iPad acceptance still required: start a fresh loaded Safari page with
this probe, verify normal fresh tool entry, leave foreground idle for the user's
observed duration, test fresh entry, then repeat separately across tab switching
and device lock/unlock. Capture the event/audio states and frame/pixel distinction
at failure before clicking/reloading away evidence. Record device/iPadOS/Safari,
idle duration, Pencil versus touch, audible1029 versus7433 and whether audio
continued while locked. Do not infer lock behavior from dispatched DOM events.

If a precise callback failure is recovered, patch that failure at its owner seam
with a red test. Do not add a silent catch/finally rAF loop, create duplicate
schedulers, bypass source audio end gates, replay missed cues or reactivate a
held contact on resume. A recovered2D context should repaint current state only.

## Local verification

```sh
node --test scripts/parity/firehose-ownership.test.mjs scripts/parity/idle-motion-probe.test.mjs scripts/parity/rollovers.test.mjs scripts/parity/tool-motion.test.mjs scripts/parity/action-motion.test.mjs
```

53 cases:51 pass,2 imported-asset skips,0 failures. Source/spec syntax checks and
`git diff --check` pass. Private Vite Cloudflare build passes (47 modules), with
`--outDir artifacts/t3/ipad-lifecycle/build`; no root dist/report output. The only
dependency symlink created here was removed. Logs are in this checkout's ignored
`artifacts/t3/ipad-lifecycle/{baseline-red,node,build}.log`. No browser or audible
hardware verification is represented by these results.
