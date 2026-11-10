# Selected text Read

Implemented against main `6bcec54342d9a09159524ae94e99a730671aba6f` (0.12 candidate). No version, shared media, exports, voice catalog identities, native input owner, or Firehose transaction contract is replaced.

## Source facts

The independent `artifacts/t3/text-voice-read-next/{README.md,evidence.json,native-excerpts.txt}` audit and raw archives establish MBTN9383 row15: command232, slots18238/18239/18239/0, hover18240, mode1, hit493,647,61,86. There are three distinct programs, four authored frames, and three distinct sprite images. Tracking→running shares program18239 without resetting progress. Active Read remains interactive; there is no disabled art or exclusive sibling state. Authored100ms updates, cue66→18066 and terminal sound gates remain interpreter-owned.

Command232 copies the directional selection's normalized span, falling back on collapsed/empty selection to the current text box. It never selects all scene text. Owner+fc represents submitted/running, not audible start. A second command resets; callback ff573→15d9 clears running through e0e62. The stop-event receiver chain, special19/20 recipients and native failure behavior remain unknown.

`tests/fixtures/text-read-source.json` is copied from the independent audit, not the runtime manifest. It includes complete Read program events/frames/cues/deadlines, raw row, registrations and resource/pixel hashes. The original audit checker was executed with its ROOT explicitly pointing to read-only root inputs and its output beside a private copy under `artifacts/t3/text-read-runtime`; all four rows,14 programs,14 sprites, cues, dispatch/vtable bytes and Windows byte comparisons pass. No original executable ran.

## Browser adaptations

`createSpeechCoordinator(engine, Utterance, changed)` exclusively owns queue-wide synthesis calls for TextRead, PicturePlay and SlideSpeech. It retains immutable payload snapshots and utterances; request identity plus pending utterance membership rejects duplicate/late callbacks. Queued and started are separate states. End/error completes a request, without timers. Cancellation retires the request before calling the engine and clears UI even if cancel throws. Submission exceptions leave no running token. An unavailable engine/constructor never enables Read.

Read rejects paused/external busy synthesis and picture/slide ownership. Play/slides explicitly retire previous speech before taking over. Picture speech retains whole-picture y/x order, empty-box skipping, each object's selected URI, missing-URI fallback to platform default, and generic audio tracks. Read requires a nonempty browser catalog even for explicit Default (`''`); a saved nonempty URI must resolve uniquely at submission. Missing/ambiguous URI, empty catalog and paused engine disable input without inventing disabled source art. Actual platform voices are re-resolved before constructing/submitting utterances and never mutated after submission. Pure catalog reorder does not cancel Read; selected URI loss cancels only Read.

`scene.textReadTarget` exposes current text ID/revision/authoritative voiceURI; `textRange.payload(target)` adds immutable canonical plaintext, directional UTF16 offsets, range revision and extracted Unicode text. Both live DOM endpoints must belong to the current editor. A saved range is reused only for the same ID and text; stale other-object selections cannot supply text. BR/block line breaks have explicit plaintext mapping; extraction expands surrogate-splitting boundaries. Ranges, revisions, engines and running state never enter project/history snapshots. Original direction/focus is restored across formatting. Style/font changes preserve Read when payload is unchanged; explicit voice changes cancel it.

Input/selection/scene changes synchronize authoritative artwork synchronously. Read gesture identity includes payload and speech generation, separately from voice-arrow catalog generation. Source and static controls validate on release without requiring RAF; an ended Stop press cannot become a new Read. Native select behavior and unrelated formatting/Grab gestures retain their own identity scope.

Read retires on target/text/range/voice change, restore, fresh/clear, tray exit, blur/pagehide/hidden lifecycle. Firehose settles Read before page mutation; it deliberately does not resurrect Read on cancellation. PicturePlay retains its original synthesis queue and players through canceled/failed wipe, with the pre-existing pause/resume policy; committed clear stops it. No speech queue is restarted during rollback. These lifecycle policies are browser adaptations, not recovered native equivalence.

## Handoff

Product files: `src/{speech-coordinator,editor-text,text-range,scene,main,native-action-state,native-action-motion,native-tool-motion}.js`. Scene's former side-effectful `speak()` is replaced by `speechPayloads()`; main submits that immutable ordered queue with its explicit owner. Read never calls the whole-picture path. No external API or project format changes.

Private configs: `playwright.read.config.js` uses strict4228 and private outputs; `vite.text-read.config.js` keeps cache/build output private. `wrangler.text-read.jsonc` is a local dry-run check using that build, with no production route/account. No public upload is needed.

Exact additional existing public keys to check (prefix `original/ui/`): `secondary-motion/manifest.json`, `paint-empty.png`, `secondary-motion/backdrops/text-1.png`, `secondary-motion/sprites/18000-{604,605,606}.png` and matching `.argb` audit payloads, `secondary-motion/sounds/18066.wav`. Existing font/voice controls retain their existing dependencies; cue18067 is independently pinned but is not used by Read.

Validation commands/results are recorded below. Browser synthesis tests model deterministic ownership/events, not audible hardware. Source art tests compare the actual studio and motion canvas to independently pinned source pixels for rest, hover, both tracking frames, running, stop and completion, including shared-script progress.

Native accepted references remain0/17. Actual iPad, audible output, pronunciation and native timing remain unverified. Native special-mode recipients and native error semantics remain release limits. Parent must integrate, perform public media checks and decide release; no deployment, upload, push or PR was performed here.

## Local validation

- `npm test`:199 passed (`node-final.log`).
- `npx playwright test -c playwright.read.config.js`:108 related Chromium cases passed (`verified-browser.log`), covering Read, existing voice controls/steppers/action motion, and Firehose integration. The private config allows60s for the full pixel compositor case; the final run completes that case in under7s. Earlier private logs preserve diagnostic failures corrected before this run.
- `npx vite build --mode cloudflare --config vite.text-read.config.js`:passed (`build-final.log`), producing only the private build directory.
- `npx wrangler deploy --dry-run --config wrangler.text-read.jsonc --outdir artifacts/t3/text-read-runtime/worker`:passed (`check-final.log`); no remote writes.
- Read-only raw archive/executable checker:passed (`source.log`, `source-check.json`).
- `git diff --check`:passed. No WebKit/Docker/native/iPad/audible run was performed for this tranche. The deterministic coordinator tests cover SlideSpeech ownership; a full real slideshow/audio device run remains a parent release check.

Logs, build and cache are private ignored artifacts under `artifacts/t3/text-read-runtime`. Temporary dependency/media symlinks were removed after checks; the strict4228 test server was stopped. No use of parent ports or parent reports/dist.

## Range restoration review fix

Independent review reproduced a backward selection through the trailing BR in
`a<br>b<br>` changing from `b\n` to `b` after Tab/Shift+Tab, canceling Read.
The inverse mapping ignored exact element boundaries and replaced its fallback
with the last traversed point. It now preserves exact element endpoints when no
exact text endpoint exists, and uses the closest mapped offset for fallback.

Three new regressions failed before the fix and pass afterward: canonical
endpoint/caret roundtrips across trailing BR and block elements, and actual-app
backward-selection Read through keyboard focus with source art and static controls.
The roundtrip checks retain directional offsets and cover out-of-range/nearest
fallback. No speech cancellation policy changed.

Parent validation after the fix:

- 199 Node tests passed; production build and Worker dry run passed.
- 111 related Chromium cases passed. After the test-only source oracle adaptation,
  all29 Read cases passed again in Chromium.
- All29 Read cases passed in the pinned Playwright WebKit Docker image. The first
  WebKit source-pixel run retained five channel differences above the existing
  tolerance. Its final oracle uses the same independently pinned layers with
  WebKit Canvas compositing, as the existing voice/stepper fixtures do; no runtime
  renderer import or tolerance change. Chromium retains its integer oracle.
- Source-URL helper cases are marked `@module` for exclusion from built/public
  runs; actual-app range, ownership and pixel cases remain included.
- `git diff --check` passes, including correction of the original test whitespace.

Evidence: `artifacts/t3/text-read-runtime/{br-before,br-after,node-after-br,
chromium-after-br,read-final-chromium,webkit-after-br,webkit-final,
build-after-br,dryrun-after-br}.log`. Earlier failed probes remain intact.
Native references stay0/17; these are browser/model checks, not physical iPad,
audible speech, or native runtime acceptance. Root integration and final review
remain pending.
