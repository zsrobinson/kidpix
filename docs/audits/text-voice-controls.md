# Text voice controls

Bounded implementation above 6c22219 / application Firehose fixes 1bde44b; package version remains 0.11.0. No media, exporter, speech owner, release, upload or deployment change.

## Recovered source facts

The completed `text-voice-read-next` audit independently checked MBTN9383 and Mac/Windows program bytes. `tests/fixtures/text-voice-source.json` preserves its complete rows 16–18, programs, registrations, events, cue/end gates and sprite hashes, rather than deriving expectations from the runtime manifest.

| Row | Command | Rest | Tracking | Disabled | Hover | Hit XYWH |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | 231 | 18241 | 18284 | none | 18285 | 616,659,115,62 |
| 17 | 236 | 18242 | 18243 | 18313 | 18244 | 731,659,43,31 |
| 18 | 237 | 18245 | 18246 | 18314 | 18247 | 731,690,43,31 |

Rows 17/18 are explicitly bound as independent boundary actions, not exclusive siblings. All source frames, 100ms authored ticks, two tracking groups, sound cues 66/67 (18066/18067) and end-check gates are retained through the existing controller. There is one activation per accepted gesture, with no repeat cadence inferred from art. Both groups happen to draw the same sprite; their timing and cue events still matter. The clean retained backdrop restores exactly [731,659,43,62], separate from the live select and other Text footprints.

**Popup scope:** row 16 remains a real static browser select. Its three one-pose source programs are independently checked, but its source hover/tracking chrome is not bound or claimed as runtime acceptance. The action-button adapter captures pointers/prevents native clicks; using that for a native select would break menu accessibility and input behavior. No popup opening animation is invented. Font/size popups, Read, clipboard and unrelated modes remain outside the profile. The select is narrowed to leave the arrow footprint clear of its text and focus decoration.

## Browser adaptation and authoritative API

`src/text-voices.js` exports `createVoiceCatalog`, `voiceStep`, `voiceOptions` and `VOICE_STEPPERS`. It reads actual `speechSynthesis.getVoices()` in raw order on initialization and every `voiceschanged`. Names are labels only. Each notification advances a generation even when values are equal. No product fake voices or platform catalog snapshots are saved.

Voice URI is the only saved identity. Default (`''`) is an explicit separate option with no arrow index; both arrows remain disabled until an explicit unique URI is selected. Empty/loading and singleton catalogs disable both steps. Missing saved URIs remain visibly unavailable and return under the same identity when the platform supplies them again. Duplicate names are allowed; a duplicate selected URI or ambiguous destination disables the corresponding step. An empty URI is never a catalog step destination. API absence leaves an operable Default select. This is not a native OS menu/order, font/voice equivalence or hardware speech claim.

`scene.actionState.textStyle.voice` supplies the selected object's URI (legacy absence means Default). `Scene.restore(snapshot, {textTarget})` optionally retains an existing text target for Undo/Redo, allowing all style values to synchronize immediately. Ordinary project restore still clears selection; selecting the restored text object restores its own voice. Existing new-text/default style behavior remains. Object snapshots/history/project JSON contain the URI string only. Catalog notifications update controls/art without calling `setTextStyle`, creating history, altering objects or touching speech.

Focused voice selects retain the same DOM node and their option children through catalog refresh; options reconcile after blur. Native focus, keyboard menu choice and Escape remain browser-owned. A focused select cannot commit a choice to a changed target, or commit an unavailable/ambiguous URI. The range keeper captures real select focus loss and preserves directional UTF-16 text offsets. Arrow pointer actions retain editor focus; direct select changes retain select focus.

Voice gestures use a token containing scene target ID, authoritative URI and catalog generation. The shared motion adapter accepts an action-specific gesture identity; unrelated formatting and Grab actions retain the scene identity alone. Both source-art and fallback releases re-read the appropriate identity before accepting a gesture, including before RAF. Catalog changes cancel held voice proposals without dropping accepted Bold, size or Cut input. Target/voice changes, Escape, blur, lost capture and interruption cancel the relevant proposals. Static input retains first-pointer ownership when another pointer contacts another stepper. No stale numerical catalog index is retained.

Native-select interaction sessions retain their control, target and prior URI through blur until commit. A deferred change cannot write to a different target, even after focus leaves the select; the regression constructs this ordering and does not claim an observed native-browser corruption path. New pointer/keyboard interactions establish a fresh session. Selection and history synchronously update both values and source artwork, avoiding a one-frame discrepancy between control metadata and the rendered state.

## Validation and independent media requirements

Private commands/configurations use strict port 4224 and `artifacts/t3/text-voice-runtime`; no parent server/report output is used. Browser tests retain original platform wrappers strongly across asynchronous test-model events. These models are test-only.

- `npm run check`: 195 Node cases, production build and deployment dry run passed; version unchanged.
- `npx playwright test -c playwright.voice.config.js`: all67 related Chromium action/Text/voice cases passed, including catalog updates during unrelated held input, deferred select changes, and synchronous artwork/state restoration.
- An additional47 Chromium primary-motion, secondary-selector and Stamp regression cases passed. These use separate outputs and the same private development server.
- `playwright.voice.webkit.config.js`: all25 voice cases passed against the existing pinned Docker image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`, external private server on4224. No browser/host-package downloads.

Voice cases cover empty/asynchronous/reordered catalogs, Default, duplicates, disappearance/return, restored missing URI, no refresh history, selected-object save/restore and Undo/Redo, forward/backward/collapsed ranges, direct native select editing/focus/DOM retention, first-pointer ownership, held pointer/Space catalog and target cancellation, static failure/retry, exact rows/programs/events/registrations, all independent sprite pins and actual studio rest/hover/both tracking/disabled/cleared footprint pixels. PNG pixels are independently checked against pinned premultiplied source bytes. Chromium uses an integer source-over oracle; WebKit composes the same pinned PNG layers in its own Canvas to account for its known translucent-edge rounding. Runtime rendering/media are unchanged by that test adaptation.

Required existing public keys, listed from the independent audit (no new media):

- `ui/secondary-motion/manifest.json`
- `ui/secondary-motion/backdrops/text-1.png` (decoded RGBA SHA256 `455373eaa3f21b2246f50fa7f398abdc4dcfdefc040d6891183220b3eb92d654`)
- `ui/secondary-motion/sprites/18000-{451,452,453,454,455,456,730,731}.{png,argb}` for arrows
- `ui/secondary-motion/sprites/18000-{448,611,612}.{png,argb}` for independently checked, unbound popup source states
- `ui/secondary-motion/sounds/{18066,18067}.wav`

Brace lists denote every individual key, not a URL. The parent should verify these existing public keys before publishing; this work performs no upload or shared media edit. Existing Text action/backdrop/primary tray dependencies remain necessary.

## Limitations and release boundary

Read stays static with its existing behavior. Native Read uses a selected range, otherwise the current text box; current `Scene.speak()` queues whole-picture text and has no per-request TextRead speech owner. Read motion requires that separate scope/lifecycle implementation. Play and SlideShow keep their existing whole-picture speech semantics and ownership; voice UI changes do not start, stop or cancel speech.

Native references remain **0/17**; actual iPad untested. Browser reconstruction and Docker WebKit do not establish native timing, audible cue latency, native popup internals, speech availability/pronunciation, Safari device interaction or OS voice ordering. Popup motion is deliberately deferred; public media verification and parent release gates remain parent-owned.

## Local handoff

Source integration points are `main.js`, `scene.js`, `native-action-motion.js`, `native-action-state.js`, `stepper-input.js` and the new `text-voices.js`. Tests/configurations are `text-voices.test.mjs`, the existing action profile assertion/Text pixel oracle, `text-voice.spec.js`, independent `text-voice-source.json`, and private `playwright.voice{,.webkit}.config.js`. No Read or speech submission method was modified. Static selection/history synchronization is event-driven as well as RAF-driven, so optional-art failure does not leave authoritative voice values stale.

Logs: `node.log`, `build.log`, `chromium-final.log`, `static-final.log`, `ownership-final.log`, `webkit-final.log` under `artifacts/t3/text-voice-runtime`. Earlier diagnostic logs include corrected test selector/oracle failures and an interrupted inefficient per-pixel assertion loop; final checks use bounded buffer comparisons and independent source pins. These private artifacts are not committed. Servers are stopped and only temporary dependency/media symlinks are removed before the local commit. No version bump, push, PR, deployment or parent report change.
