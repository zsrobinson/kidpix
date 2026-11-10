# UI audio interruption completion, 2026-11-10

Parent baseline: 1fd088f. Reported live runtime: 0.15 e4130db. This investigation
reproduces a browser audio interruption bug; it does **not** establish the cause
of Safari animations stopping after foreground idle, or physical Pencil lag.
Native remains 0/17. No physical iPad, speaker/audible or native validation.

## Red loop and bounded causal finding

The actual application starts Undo source1098 and its real HTMLAudio easel1011.
The test deliberately loops real media to keep it playing beyond the authored
finite actor. It verifies `playing`, advances the source clock to its terminal
pose, calls the owned Audio's real `pause()`, verifies delivery of `pause`, and
requires the actor to finish and a fresh action to advance source frames.

Against the baseline, Undo stays visible at frame9 indefinitely. ColorPicker
stays `opening` after its real opening audio is paused. Chalk keeps its auxiliary
hover actor; secondary Line keeps its selected script unfinished; Firehose cannot
restart its source1091 loop after source1029 is externally paused. All five
matching original-code tests fail, and the candidate passes.

The first harness revision accidentally selected an unrelated UI sound. Its
failure alone was insufficient evidence. `red-exact.log` selects easel1011
explicitly; `red-controls.log` covers the other source owners. Early harness
30-second timeouts were also invalid evidence (disabled Undo click and waiting
on an event task while the clock was paused); these were corrected before the
causal finding. The final loop is seconds, with no idle soak or performance matrix.

Original play rejection already reached Undo/Picker through **synthetic error
events**; it was not a swallowed-rejection hang at these callers. The replacement
contract carries the actual play promise in a WeakMap while preserving Audio
return values and legacy Audio-like event-only consumers. It produces no fake
DOM media errors. A resolved play promise means playback started, never finished.
Initial `paused:true` with pending play continues holding the gate.

## Adaptation

`ui-audio.js` observes ended/error/pause/abort/emptied and owned play rejection.
Completion removes all terminal listeners and calls the owner once. Cancellation
removes listeners before pausing; late rejection/events cannot clear a replacement.
Tool handles retain their stop/isComplete API; Undo/rollovers retain channel maps;
Picker retains its finite source program API. Completed Picker audio is released
rather than paused again on later disposal (the existing Node assertion now
checks this ownership distinction). The Firehose Node module import shim resolves
the newly imported helper without copying controller code.

No authored script, audio cue, frame/tick timing, channel1/2 end check, mode0/1/2,
retained-hover policy, drawing/pressure path, CSS, source media, source pins,
baselines, version, Clipboard80a0661 or SERVER_HANDOFF change. No timeout,
watchdog, visibility recovery, cue bypass or blanket RAF catch.

## Verification and reproduction

Private outputs/config/cache/build/logs: `artifacts/t3/ui-audio-recovery/`.
Existing dependency/media inputs were symlinked read-only by convention and
removed on completion. Host Node24.22.2, Chromium158.0.8127.18. Docker's bundled
Node26.13.0, pinned WebKit27.2, using existing image only:
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`.
No installation/download/pull. Private dev4361, built4362, stopped at completion.

```sh
# Private config uses external4361, one worker, no existing public server.
UI_AUDIO_BASELINE=1 node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/ui-audio-recovery/playwright.config.mjs \
  --grep 'Undo real media pause|ColorPicker real pause'
UI_AUDIO_BASELINE=1 node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/ui-audio-recovery/playwright.config.mjs \
  --grep 'primary real|secondary real|Firehose real'
node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/ui-audio-recovery/playwright.config.mjs
TEST_URL=http://127.0.0.1:4362 node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/ui-audio-recovery/playwright.config.mjs
SOURCE_CHECK=1 node node_modules/@playwright/test/cli.js test \
  -c artifacts/t3/ui-audio-recovery/playwright.config.mjs \
  --grep 'authored Undo Guy 1098|chalk: actual controls|studio source programs render all|bounded backing stores'
npm test
npm run build:cloudflare -- --outDir artifacts/t3/ui-audio-recovery/build
```

Baseline mode serves unmodified source from git1fd088f through request routes;
it never rewrites baseline files. The committed spec can also run under the
repo's ordinary browser configuration when the parent owns that server.

Final acceptance: 11 lifecycle tests in dev and built app, in each engine.
Coverage includes playing gates, genuinely pending/rejected play, real pause
and emptied after playing, real abort during a deliberately held network load,
replacement/stale terminal delivery, fresh action/hover frames, Picker selection,
static fallback, and Firehose clear suspension without recurring1029 resurrection.
Abort after established playback is not separately isolated: load/reset can also
emit emptied. Node tests independently exercise every terminal event, listener
cleanup, idempotent cancellation, legacy stubs, and independent channel1/2 gates
through the actual finite animation helper. Stale events are explicitly synthetic
ownership tests; real lifecycle cases are labeled separately.

Four source acceptance cases pass per engine: all672 bounded compositions have
zero differences, all14 Picker poses match, Undo1098 has every authored pose/cue
and end check, Chalk preserves source selection timing/cue/terminal hold. No
accepted screenshots or image thresholds changed. Node suite:232 pass. Private
Cloudflare build and git diff --check pass. No full public browser suite/soak.

One warm dev run during this investigation recorded InvalidStateError at
setPointerCapture with plain and timestamped module URLs. A fresh Vite process
passes all11 with pageerror assertions; built app passes all11 too. The stack is
retained in webkit-final.log, separate from successful webkit-cold.log. No claim
that this input-handler exception kills RAF, or explains physical Safari idle.

Final logs: red-exact.log, red-controls.log, chromium-final.log,
webkit-cold.log, built-chromium-final.log, built-webkit-final.log,
source-chromium.log, source-webkit.log, node.log, build.log.

## Remaining device boundary

Real foreground-idle failure, physical Pencil latency, audible timing, OS audio
interruption after sustained playback, and the full release suite belong to
parent/device acceptance. A useful next functional test is capturing exact owned
Audio state/events and source snapshot/pixels on the affected foreground iPad
before reload; determine whether RAF still advances and whether a real terminal
media event coincides with a source end gate remaining held. This patch is a
browser interruption adaptation, not a proven reported Safari idle fix.
