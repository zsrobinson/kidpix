# Undo Guy fidelity audit

2026-11-09. This audit uses the supplied mounted installer at `/Volumes/Kid Pix Deluxe 3D`, its `Data/Easel.MHK` resources, the extracted i386 executable, and the supplied user guide. **The original application has not run here.** Source reconstruction and controlled Chromium tests establish authored data and web behavior; they do not establish native event-loop jitter, speaker latency, or a recorded native visual match.

## Primary evidence and reproduction

- Executable: [`artifacts/research/kidpix-original`](../../artifacts/research/kidpix-original), SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. All addresses below are virtual addresses in its i386 slice, as printed by [`disassembly-i386.txt`](../../artifacts/research/disassembly-i386.txt).
- Installer archive `Contents/Resources/Data/Easel.MHK`: decompressed SHA-256 `6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c`. Read using [`app_resources` and `mohawk`](../../scripts/import-ui.py), without launching or installing the application.
- Resource programs `tSCR` 1094–1116, bank `tBMH` 1000, registration tables `REGS` 1000/1001, and sound resources `tWAV` 1008–1027. [`mohawk-script.py`](../../scripts/mohawk-script.py) decodes the command stream from byte 26; [existing timing evidence](../reverse-engineering.md) establishes the scheduling unit.
- The supplied [user guide](../../artifacts/research/user-guide.txt), printed page 24, text lines 1098–1121, establishes face undo/redo toggling, independent arrows, Small Kids Mode restrictions, unlimited history, and the save/Flipbook boundary.
- Inspection outputs under [`artifacts/t3/undo-animation`](../../artifacts/t3/undo-animation): `source-evidence.json` includes every raw draw-group ID, yielding wait count, registered frame hash, union rectangle and sound cue; `binary-evidence.txt` retains the relevant instructions; `dispatch-evidence.json` contains jump-table targets and selection constants; `sound-evidence.json` contains source-resource/PCM hashes and exact exported WAV comparisons. These ignored research outputs are reproducible local evidence, not shipped app assets.

Re-export the existing 21 routines without changing public media:

```sh
mkdir -p artifacts/t3/undo-animation/reexport
PYTHONPATH=scripts python3 - <<'PY'
from pathlib import Path
from importlib import import_module
import json
ui = import_module('import-ui')
read = ui.app_resources(Path('/Volumes/Kid Pix Deluxe 3D'))
easel = ui.mohawk(read('Data/Easel.MHK'))
output = Path('artifacts/t3/undo-animation/reexport')
manifest = ui.export_undo_animations(easel, output)
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY
```

The browser test pins each routine's complete RGBA sequence digest, waits and cue directly from the installer reconstruction. It checks the actual public files against these pins, then checks the actual studio actor on a controlled browser clock. It does not use the application's frame-selection function as its oracle.

## Authored composition and timing

Every 1094–1114 routine has the same registered union rectangle: **`[58, 310, 56, 63]`** in the 1024×768 scene. Idle 1094 uses origin `(18,306)` and registered one-based bank IDs 100 and 149, in that draw order. The backing part is required: a 48×47 isolated face sprite cannot replace the entire composition. All 20 action routines return to exactly the same RGBA composition as idle 1094. The current `nativeButtonParts` already uses the full idle program; no idle-placement correction was necessary.

All examined programs set 100 ms intervals. Image groups, repeated waits, and terminal waits have distinct meanings:

1. A nonterminal wait yields to the next scheduled update. Repeated waits retain the same composition.
2. At `0x0015a6e4`–`0x0015a72b`, a wait immediately followed by end does not yield. The terminal image group is still rendered in this update.
3. `0x0015a304`–`0x0015a372` checks the previously set end flag on the **following** update. Finite playback can wait longer for sound channels 1/2; flag `0x100000` bypasses that gate. Undo Guy is created with flags `0xc00000` at `0x0005596b`–`0x00055992`, which includes finite bit `0x800000` and excludes the bypass.

Thus the earliest end check is **`(sum(yielding waits) + 1) × 100ms`**, even when the last group already has a positive wait count. Returning to the visually identical idle sprite early hid this discrepancy in still-image comparisons.

| Script | Draw groups | Yielding waits | End encountered at | Earliest end check | Sound resource @ tick |
| --- | ---: | ---: | ---: | ---: | --- |
| 1094 | 1 | 0 | 0 ms | 100 ms | none |
| 1095 | 27 | 34 | 3400 ms | 3500 ms | 1008 @ 1 |
| 1096 | 13 | 15 | 1500 ms | 1600 ms | 1009 @ 2 |
| 1097 | 20 | 20 | 2000 ms | 2100 ms | 1010 @ 1 |
| 1098 | 10 | 10 | 1000 ms | 1100 ms | 1011 @ 0 |
| 1099 | 19 | 19 | 1900 ms | 2000 ms | 1012 @ 0 |
| 1100 | 12 | 11 | 1100 ms | 1200 ms | 1013 @ 1 |
| 1101 | 9 | 8 | 800 ms | 900 ms | 1014 @ 1 |
| 1102 | 10 | 9 | 900 ms | 1000 ms | 1015 @ 1 |
| 1103 | 11 | 10 | 1000 ms | 1100 ms | 1016 @ 1 |
| 1104 | 10 | 13 | 1300 ms | 1400 ms | 1017 @ 2 |
| 1105 | 9 | 9 | 900 ms | 1000 ms | 1018 @ 1 |
| 1106 | 13 | 13 | 1300 ms | 1400 ms | 1019 @ 0 |
| 1107 | 10 | 9 | 900 ms | 1000 ms | 1020 @ 3 |
| 1108 | 14 | 16 | 1600 ms | 1700 ms | 1021 @ 2 |
| 1109 | 10 | 10 | 1000 ms | 1100 ms | 1022 @ 0 |
| 1110 | 10 | 9 | 900 ms | 1000 ms | 1023 @ 1 |
| 1111 | 10 | 9 | 900 ms | 1000 ms | 1024 @ 1 |
| 1112 | 9 | 9 | 900 ms | 1000 ms | 1025 @ 1 |
| 1113 | 11 | 10 | 1000 ms | 1100 ms | 1026 @ 1 |
| 1114 | 9 | 10 | 1000 ms | 1100 ms | 1027 @ 1 |

`src/native-animation.js` previously returned no frame at the summed-wait boundary. This skipped zero-wait terminal groups and completed all scripts one update early. `frameAtTick` now includes the update encountering end, and playback checks completion on the following update. Four new focused Node assertions failed before this fix; all five now pass.

Twenty exported WAV files were independently compared with the decoded `tWAV` PCM: **20/20 match exactly**, including rate and channel count. Sound 1008 begins at tick 1, not activation; 1009 begins at tick 2; 1020 begins at tick 3. Several scripts intentionally start sound at tick 0. Script numbers or a shared animation-start sound cannot substitute for these cues.

With ideal immediate playback, three source sounds extend beyond the earliest end check: script 1110's 1023 ends at approximately 1089.16 ms versus a 1000 ms check, script 1112's 1025 at 1043.31 ms versus 1000 ms, and script 1114's 1027 at 1261.68 ms versus 1100 ms. These are decoded sample lengths plus authored cue offsets, **not measured native speaker times**. The interpreter would keep checking channel completion on subsequent 100 ms updates. Browser sound completion must likewise use playback events rather than assume the animation wait sum determines sound duration.

## Activation, replacement, hover, and history

The native Easel event dispatcher at `0x00059d42` indexes the little-endian jump table at `0x0025df78` with `command - 222` (`0x00059dd2`–`0x00059de1`). Reading the actual table bytes gives:

| Command | Branch | Established behavior |
| --- | --- | --- |
|260 (`0x104`) | `0x0005d910` | Face activation: selects a 1095–1114 routine and toggles history using owner field `+0xf2`; see `0x0005d980`–`0x0005db47`. Face control creation supplies command 260 at `0x000558c4`. |
|261 (`0x105`) | `0x0005d8cc` | With event word `+0x20 == 1`, starts 1115 **only when actor `+0x58 == 0`**. Face control creation supplies 261 at `0x000558cb`. This supports an idle-hover routine without interrupting a running face action. Exact native pointer-event ordering remains unrecorded. |
|302 (`0x12e`) | `0x0005d9d9` | Undo arrow selects a face routine, resets a button state and invokes history virtual method`+0xc`. |
|303 (`0x12f`) | `0x0005da8c` | Redo arrow also selects a face routine, resets a button state and invokes history virtual method`+0x10`. |

The arrows are additionally identified by `MBTN` 75 rows 24/25, command IDs 302/303. Their state and rollover scripts are 1129–1136; they are separate actors from the face. [Button animation evidence](../button-animation.md) covers these slots, control states and rollovers. This task does not replace those control bindings.

Each activation branch calls `0x00159ca0` on the **same face actor**. It replaces the running program rather than appending another actor. Replacement stops matching-owner sound at `0x00159d70`–`0x00159d7a` through `0x00152aee`. The sound-owner scan masks the high bit and matches the animation ID (`0x00152b20`–`0x00152b30`). This supports canceling the interrupted actor's cue, without stopping unrelated UI or picture sounds.

The selection arithmetic is also recovered: the random-float result is rounded through single precision, multiplied by the float **19.0** at `0x0025e1ec`, added to **0.5** at `0x0025c29c`, truncated and offset by 1095 (`0x0005d918`–`0x0005d96d`, repeated for both arrows). This differs from the current web `floor(random × 20)` buckets. The random-float helper is `0x00016812`: it can consume buffered floats or call imported `random` and multiply by its object's scale at `+0x10`. Reproducing the original random-number generator itself is outside this audit; the observed index calculation is sufficient to identify the bucket mismatch.

Script 1115 is a silent six-group 100 ms face routine; 1116 is a silent three-group blink. Both end in the same neutral composition. They are absent from `undoAnimations` today. The binary directly supports dispatch of 1115 on the 261 idle path; **a caller or scheduling policy for 1116 has not been established**, so it must not be assigned an invented periodic blink timer.

Browser history checks cover face undo/redo toggling, two independent undo steps, redo, exhausted undo, and a replacement edit invalidating redo. New edits and tool changes currently leave a running face routine's progress intact. The browser test records this continuity while verifying history coherence. Static tracing found dedicated actor destruction at `0x0005f34e`–`0x0005f360` and `0x0005f672`–`0x0005f684`, but has not established a native rule canceling this face actor for **every new edit or tool selection**. No such cancellation was added merely as a UX preference.

## Helper API and parent integration

The existing API remains `createNativeAnimation(layer, idleImage, playSound) → { play(clip, tickMs), stop() }`. Generation guards invalidate both pending decode completion and pending scheduled work. Explicit `stop()` and a replacement `play()` hide the actor, restore idle and pause sounds owned by this instance. Decode failure leaves idle intact and can retry on the next activation.

The callback can now return the Audio/EventTarget handle it starts: **`playSound(soundResourceId, sourceChannel) → audio | undefined`**. A returned handle needs `pause()` and `addEventListener()`; `ended`/`error` release its completion gate. Pending channels 1/2 delay finite completion. Another cue on the same source channel pauses the previous handle. A callback returning no handle preserves the previous cue-only behavior, because sound completion cannot be inferred. The helper now exposes `data-frame` alongside `data-script` for observable authored progress.

Integration follow-up: dedicated audio ownership, redo activation, float32 selection arithmetic and built/live app-suite coverage are now wired. The four helper-module fixtures remain development-only. The remaining integration requirements are idle-hover dispatch and owner teardown; the original audit requirements follow for traceability:

- **Dedicated audio callback:** The current `main.js:playUiSound` returns nothing and uses a shared global player. Supply a dedicated Undo Guy callback that returns its own Audio handle, sets the existing volume, and turns a rejected `audio.play()` promise into an `error` event (or otherwise releases ownership). The helper owns cancellation; unrelated UI playback must not silently pause this handle and leave its completion gate pending forever.
- **Redo activation:** Make the redo command start `animateUndoGuy()` as undo and face activation already do. Native command 303 proves this is an omitted behavior, not an aesthetic request.
- **Selection arithmetic:** Apply the observed 19×random+0.5 truncation for the 20 routines, retaining explicit separation from reproducing the native RNG stream. Exact single-precision operations correspond to `Math.trunc(Math.fround(Math.fround(Math.fround(r) * 19) + .5))` for the supplied random float `r`.
- **Idle hover 1115:** Export 1115 separately from the 20 random action routines, and dispatch it from the face's idle-hover path only while the dedicated actor is inactive. The helper currently has no public active/loading query; either let parent integration own that state or extend the interface deliberately when wiring hover. Do not append 1115/1116 to the random undo list. 1116 still needs caller evidence.
- **Lifecycle:** Call `stop()` when actually disposing/replacing the studio owner. Do not infer blanket cancellation on ordinary edits or tool changes from the teardown evidence.
- **Suite integration:** Add `undo-animation.spec.js` to the parent's build-browser config list. This task did not edit that shared config or `main.js`.

The guide's unlimited undo and save/Flipbook boundary also differ from the web's 32-entry history cap and current save behavior. These broader history policies are outside this helper's ownership; passing the targeted history cases does not establish those policies are native-equivalent. Small Kids Mode and Slide Show history were not exercised here.

## Verification and limits

Commands use isolated 4185 and write only under `artifacts/t3/undo-animation`:

```sh
node --test scripts/parity/animation.test.mjs
npx playwright test -c artifacts/t3/undo-animation/playwright.config.mjs
```

- Five focused Node tests: end encounter versus completion, terminal zero-wait image, zero-wait idle, shared-update draw order, empty timeline.
- Twenty actual-app browser cases: all authored routines; pinned source RGBA sequences, rectangle, 100 ms intervals, every pose and repeated wait, source cue onset within one delivered browser RAF, final composition, earliest end check and idle restoration. Every authored pose is checked for visible opaque source pixels in the actual studio screenshot, including stacking.
- Eight additional browser cases: complete idle composition; source-channel sound completion and explicit stop; delayed-decode cancellation/replacement; rapid face reactivation canceling an unreached cue; new-edit/tool continuity; face/arrow/history semantics; replacement of a playing owned cue plus a stale completion event; decode failure/retry. Audio errors release the completion gate.

Sound-event checks use controlled Audio handles and browser time. They verify scheduling and ownership, not actual audio output. Browser RAF may deliver an update up to the next display frame; the tests sample each source tick with 20 ms delivery allowance. Decode loading deliberately starts the web timeline only after images are ready. The adapter now advances one source tick per delivered 100 ms callback, preserving intermediate poses under stalls and holding the terminal composition until the following update. A focused Node regression supplies delayed callbacks and verifies every pose. Nominal source timing remains subject to browser scheduling latency. The source scheduler normally sets the next due time from its current millisecond clock (`0x0015a2ed`–`0x0015a301`); its alternate cumulative-clock flag is absent from Undo Guy's creation flags. Native first-use loading latency, native audio backend completion semantics, face hover feel and interruption ordering still need a running original. No native capture or native runtime comparison is claimed.
