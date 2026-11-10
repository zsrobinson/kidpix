# Firehose page wipe integration

This bounded change integrates the recovered RBubbleCleaner page wipe with the
browser picture transaction. It does not complete original animation parity.
Native references remain **0/17**. Physical iPad behavior and native audio latency,
event delivery, antialiasing, and timing remain unverified.

## Source facts and scope

The read-only input audit is
`artifacts/t3/firehose-integration-next/{README.md,evidence.json}` in the source
checkout. The native event266 branch constructs tool139, RBubbleCleaner. The
existing `native-big-eraser.js` draws its original ten cumulative paths at
alpha0.30000001192092896, with strict elapsed >200ms and update delta >110ms,
one path per delivered callback. An accepted update after ten paths or >2000ms
issues the source opaque white terminal path and calls completion. No catch-up
burst or confirmation dialog was added. Owned activation sound is WaterCleaner7433;
ordinary Easel rollover remains independently implemented and tested.

The enlarged bank3900 actor remains disabled: transformed origin, clipping and
lifetime are unproved. This integration requests no actor PNGs, QFX or Firecracker
resources. It leaves the current Big Eraser panel behavior and labels untouched.
Those labels/indexes do not establish native identities: the recovered panel is
tools124–137/icons3701–3714; the current UI label “Vanish” is not source identity.
No unsupported panel option is routed through the new wipe.

## Browser operation and APIs

- `src/firehose-operation.js`: `createFirehoseOperation` owns `play`, `cancel`,
  `dispose`, and `busy`. It rejects reentry, including while resources load.
  Escape, blur, pagehide, hidden document, resize and explicit disposal cancel.
  Manifest/RAF callbacks are generation checked. Cancellation removes both
  canvases, stops the renderer's owned cue and releases the caller transaction.
- `src/main.js`: only the existing Firehose button in `#hit-layer` starts this
  operation. Generic menu clear and Big Eraser retain their immediate behavior.
  Settle held paint (including moving paint's delivered-frame policy), scene
  drag/path and focused Text before capture. Close pending editors and stop the
  microphone. A picture generation invalidates pending file reads, project
  restores, layered backgrounds and Idea Machine continuations.
- `src/paint.js`: `beginPageOperation` is an opaque synchronous checkpoint with
  `clear`, `rollback` and `release`. It invalidates pending paint loads and rejects
  new asynchronous paint mutations until release. Private image/history buffers
  stay private; no asynchronous public serialization acts as a checkpoint.
- `src/scene.js`: `settle` finishes drag/edit ownership; `suspend` pauses path
  progression and connected playing videos, returning a resume closure. Composite
  drawing uses actual displayed path coordinates. Picture/preview tracks pause;
  cancellation resumes their existing players, rather than starting new tracks.
  Speech is paused/resumed. GIFs may keep decoding beneath the opaque snapshot;
  they cannot change the presented wipe composite.
- `src/interaction-owner.js`: `reject` tombstones contacts begun during the
  operation through their terminal click, even if cancellation happens first.
  Window capture guards block keyboard, pointer, editing, drop and chrome
  mutation during the operation. Explicit cancel runs before releasing guards.

A frozen opaque full-picture canvas sits at z-index5 above paint, objects,
foreground and path effects. The separate cumulative transparent wipe is at6.
Both use the existing actual 720×542 picture rectangle inside the scaled surface;
CSS scales them together and the surface clips them. Bitmap coordinates do not
multiply devicePixelRatio a second time. Underlying art stays intact until commit.

The synchronous clear core makes one paint checkpoint and exactly one unified
clear entry containing scene, sound, narration and backdrop. Undo/Redo restore or
clear these together. It never uses `paint.reset`. If commit throws, the caller
explicitly restores its opaque paint checkpoint, scene/tracks/backdrop and both
history stacks before release. This matters because the source helper catches an
onCommit exception without calling onCancel. Snapshot/begin failures also release
owned guards; failed/refused sound cannot strand them.

## Deliberate browser policies

Blank activation intentionally runs the same wipe and creates one undoable clear.
Cancellation adds no clear entry; any edit settled before capture retains its
normal existing history entry. Commands including Undo/Redo are blocked while
busy; Escape cancels, after which a new command can act.

The source opaque white terminal fill is issued synchronously before commit.
The overlay is then removed; no extra white-frame hold is invented. Existing
browser clear retains the paper texture and its source identity; textures affect
paint sampling and may show according to the existing paper renderer after the
white overlay disappears. Tests explicitly retain paper across clear and
Undo/Redo and check the resulting browser white canvas. This does not establish
native paper disposal or native whole-scene ordering semantics.

## Verification and handoff

Run from this checkout (shared original media and dependencies are read-only local
symlinks):

```sh
npm test
npm run build:cloudflare
npx playwright test -c playwright.firehose.config.js firehose-integration big-eraser path-input ipad-input button-rollovers paper-canister moving-spray
```

The dedicated configuration owns strict port4220, one worker and independent
outputs in `artifacts/t3/firehose-runtime`; it does not update parity fixtures or
root reports. New studio cases use an800×600 viewport at DPR2; existing regression
cases retain1024×768/DPR1. Leaf source tests pin all ten paths, strict timing,
late-frame behavior, orientation/clipping, stale callbacks and cleanup.

The focused regression run passed71/71. The final smaller run passed13/13 and additionally checks
dispose/failed begin and late manifest delivery. Asset-free `npm test` passed193/193;
`npm run build:cloudflare` passed. Studio cases cover activation,
foreground-over-object stacking, frozen path animation/full composite, paper and
tracks, unified Undo/Redo, keyboard/secondary contact rejection, post-cancel
contact clicks, Escape/blur/pagehide/reentry, delayed project import invalidation,
focused Text settling, blank activation and injected snapshot/commit failures.
Audio playback is deliberately refused in these tests to cover failure recovery;
this is not audible-device verification. Existing moving-paint and input suites
cover their lifecycle seams, not native execution or a physical iPad.

Diagnostics: `node.log`, `build.log`, `regressions.log`, `regressions.json`, final
`browser.log`, `results.json`, and `frozen-composite.png` under the dedicated
artifact directory. Test failures from earlier fixture/configuration iterations
were corrected (versioned saved URLs; original-size regression viewport); the
final reports are the acceptance evidence.

Release remains parent-owned. Required existing media are only
`original/ui/big-eraser/manifest.json` and `water-cleaner-7433.wav`, two files,
75,554 bytes. No exports, uploads, full sync, version change, push or deployment
were performed. Parent must verify/publish those keys before release. Enlarged
actor placement, native runtime/reference capture and native paper semantics
remain objections to a full-parity claim, not reasons to enable guessed effects.
