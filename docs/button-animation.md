# Native button animations and pointer behavior

Static evidence from the supplied trial's i386 executable, identified and hashed in [reverse-engineering.md](reverse-engineering.md). Addresses below are virtual addresses in that slice. The original application has not been run, so event-loop latency and the final compositing result still need a native recording.

The implementation-relevant finding is that an `MBTN` record contains **four state scripts plus a separate rollover animation**. The fifth script, at word 10, must not be treated as generic selected/pressed art. Normal pointer hover and mouse tracking take different paths. Easel rollover scripts repeat; Stamp Editor rollover scripts use finite playback.

## Record and class identification

`MBTN` entries are 32 bytes: 16 big-endian words. The conversion wrapper at `0x00031792` calls `RButton::LoadFromCDATA` at `0x00031130`. Identification is supported by the `RButton` RTTI string at `0x0024a480`, type information at `0x0031b620`, vtable entries beginning at `0x0031b5a8`, and the `RButton::Draw` error string referenced at `0x00030c62`–`0x00030c71`.

| Word | Meaning established from code | Evidence |
| --- | --- | --- |
| 0–3 | State scripts 0–3 | `0x0003113e`–`0x00031151` copies them to button `+0x86` through `+0x8c`; Draw indexes them using state `+0x84` at `0x00030bf5`–`0x00030bf8`. |
| 4 | Hotspot construction kind | Kind 1 derives a region from rendered control imagery; kind 2 loads the region specified by word 5. Dispatch at `0x000311c2`–`0x00031202`, kind 2 path at `0x00031427`. |
| 5 | Region resource for kind 2 | Preserved as a resource ID; region bounds can be read from the `MRGN` resource. |
| 6 | Application command ID | Passed into the created control; IDs match known Easel commands such as backgrounds 224 and draw 232. |
| 10 | Separate auxiliary rollover script | Passed at `0x000315ce`–`0x000315f1` into helper `0x0006ff10`, stored at control `+0x160`. Pointer-hover setup loads this field at `0x000723ce`/`0x000723e8` and creates its animation at `0x000723fe`. |
| 11 | Rollover playback policy | Stored at `+0x162`; a nonzero value removes finite-playback flag `0x800000` at `0x0007239b`–`0x000723a9`, enabling repeat. |
| 12 | Rollover leave-cleanup policy | Stored at `+0x164`; a nonzero value skips ordinary leave cancellation at `0x0007070c`–`0x00070729`. Forced cleanup reason 3 still cancels. |
| 13 | Optional rollover enter/leave event | Stored at `+0x166`; dispatched by setup at `0x00072333`–`0x00072366` and cleanup at `0x000706a3`–`0x000706fa`. |
| 14 | Control group | Copied to control `+0x14e` at `0x00031611`–`0x00031615`; group peers are reset by `0x000700f0` and have auxiliary clips cleaned by `0x000707d0`. |

Other words remain raw in the export. Their names should not be guessed from a single resource table. Kind 2 `MRGN` header bounds are only a bounding rectangle; the complete hit region can contain a more detailed shape.

## State dispatch and ordinary hover

State dispatch enters at `0x00030ce0`; its jump table is at `0x0025d5c8`.

| Internal event | Resulting state/branch |
| --- | --- |
| `0x2000`, `0x2005` | State 1 (`0x00030d14`). |
| `0x2001` | State 0 (`0x00030e3e`). |
| `0x2002`, `0x2006` | Activation/latch branch (`0x00030d6b`). If both state slots 2 and 3 are absent, returns to state 0. Otherwise enters state 2 and latches, or enters state 3 and disables the control for mode 2. An already-latched mode-1 control can toggle back to state 0. |
| `0x2003` | State 2 when already latched, otherwise state 0 (`0x00030d22`). |
| `0x2004`, `0x2008` | State 0 and clears latch (`0x00030d3b`). |
| `0x2007` | State 3 and disables the control if slot 3 exists (`0x00030e49`). |

Mode 1 is chosen when slot 2 exists; mode 2 is chosen when slot 2 is absent and slot 3 exists (`0x00031155`–`0x00031177`). This is why slot 2 is not a universal pressed-frame field: some controls have only state 0 and state 1 plus a rollover script.

The pointer-move routine at `0x00071afc` distinguishes active tracking from an ordinary hover. When the controller's mouse-down flag `+0x60` or special tracking flag `+0x6c` is set, it calls `0x000701be`, which sends state events `0x2000`/`0x2001` according to the hit test. Thus state 1 represents the pointer-inside tracking appearance, not the complete ordinary-hover behavior.

With no active tracking, it hit-tests through `0x0007050c`, compares the hit target with the previous hover target at controller `+0x220`, and cancels the previous target's auxiliary clip through `0x0007067c`. For a newly hovered button, state 2 suppresses the rollover (`0x00071c6a`–`0x00071c7c`). Otherwise it calls auxiliary setup `0x00072310` at `0x00071c87`. The unchanged target does not restart its clip on every pointer move (`0x00071c16`–`0x00071c1b`).

`RButton::Draw` also preserves continuity when different state slots reference the same running script. At `0x00030b25`–`0x00030b47`, a changed state with the same current script ID takes callback path `0x00030c3f`, bypassing the script replacement call `0x000159ca0`. Restarting a clip on every state label change would introduce timing and sound differences.

The state slots can be replaced later through helper `0x00030784`. Therefore exported `MBTN` references describe initial configuration, not proof that every tool's selected artwork stays fixed for the entire session.

## Repeat, final frame, interruption, and sound

Rollover setup's base flags are `0x800031`, with an optional `0x800` rendering flag. When word 11 is nonzero, `0x000723a9` replaces those flags with only the optional rendering flag. The resulting absence of bit `0x800000` causes the native interpreter to repeat after reaching end:

- `0x0015a304`–`0x0015a311` checks the prior-update end flag at animation `+0x57` and creation flags at `+0x5c`.
- With bit `0x800000` set, it waits for the relevant sound-channel completion flags, stops updating the animation (`+0x58 = 0`) and issues callback `-2` (`0x0015a318`–`0x0015a372`).
- Without that bit, when channel conditions allow, it resets script offset `+0x44` to **26** and clears end flag `+0x57` (`0x0015a379`–`0x0015a3a1`). This is a runtime loop; no explicit loop opcode is needed in the resource.

The source interval command is milliseconds; these Easel button scripts use 100 ms. See the clock proof in [reverse-engineering.md](reverse-engineering.md). The trailing wait-before-end does not yield, so the final image group is rendered in the update that encounters end. However, completion/restart checks happen on the **following** scheduled update. A silent four-frame rollover rendered at ticks 0, 1, 2, 3 restarts at tick 4. A timeline's `endCheckTick` captures this extra scheduling boundary. Sound completion can delay the actual end/restart further.

For the examined Easel and Stamp Editor entries, word 12 is zero. On normal leave, `0x0007067c` clears the auxiliary-active marker, destroys the auxiliary handle through `0x000159952` at `0x0007073d`, and reenables the underlying animation if present at `0x00070742`–`0x00070757`. Forced cleanup and switching group peers use this same helper. This establishes interruption at leave rather than playing an entire hover cycle after departure.

The cancellation chain also reaches sound ownership: `0x000159952` calls `0x0001595d8` with cleanup enabled; `0x00015961a` invokes `0x000152aee` with the animation's ID. That routine scans 16 sound channels for the matching owner after masking the channel's high bit (`0x000152b20`–`0x000152b30`) and runs channel cleanup `0x00015295f`. That cleanup marks completion storage and releases channel playback objects. This supports stopping sounds owned by the interrupted auxiliary clip. It does not justify stopping every unrelated sound or background-state cue.

Exact post-completion compositing and application-specific callbacks still need care: callback `0x00070045` reacts to `-2`, optionally notifies an owning object and restores a backing animation. The helper export preserves the final frame and earliest end-check boundary without claiming every finite program displays that frame indefinitely.

## Representative initial mappings

All columns below are resource IDs, not sprite indices. Easel uses `MBTN` table 75. The Stamp Editor row demonstrates why keeping word 10 separate matters.

| Archive/control | State scripts 0, 1, 2, 3 | Rollover | Word 11 | Command |
| --- | --- | --- | --- | --- |
| Easel backgrounds, row 2 | 1000, 1001, 1001, 1001 | 1002 | 1 (repeat) | 224 |
| Easel draw, row 9 | 1012, 1013, 1013, 1013 | 1014 | 1 (repeat) | 232 |
| Easel paint, row 10 | 1015, 1016, 1016, 1016 | 1017 | 1 (repeat) | 233 |
| Easel fill, row 11 | 1018, 1019, 1019, 1019 | 1020 | 1 (repeat) | 234 |
| Easel undo, row 24 | 1129, 1130, 1129, 1131 | 1132 | 1 (repeat) | 302 |
| Easel redo, row 25 | 1133, 1134, 1133, 1135 | 1136 | 1 (repeat) | 303 |
| Stamp Editor pencil, row 0 | 14004, 14005, 0, 0 | 14006 | 0 (finite) | 19000 |

Backgrounds uses `MRGN` 375, whose header bounds are `(34, 18, 113, 61)`. Script 1002 draws registered bank-1000 sprite IDs 4, 3, 5, 3, with no sound. Its ordinary rollover should therefore repeat those images at 100 ms per update. Script 1001 instead starts sound cue 0 (resource 1000), and draws IDs 2, 1, 2 for the tracking/state path. Substituting 1001 for ordinary hover changes both the picture and the sound.

## Export and validation

[scripts/button-animation.py](../scripts/button-animation.py) exports the initial records, raw words, source-rendered frame compositions, registration-aware scene rectangles, native intervals and sound cues. It also records the rollover repeat/cancellation policy and each clip's earliest end-check tick. It can be imported for other archives with `export_button_animations(...)`.

```sh
python3 scripts/button-animation.py
PYTHONPATH=scripts python3 -m unittest scripts/test_button_animation.py
```

Default output is ignored research data at `artifacts/research/button-animation-export/`, so this does not change current published assets. The Easel export produces 27 button records and 78 supported unique script timelines. Scripts **1039** and **1128** are retained under `unsupportedScripts`: they contain additional bytes after the first end marker. Those alternate segments need explicit native dispatch analysis before support; the helper does not guess which segment should run.

For implementation, start with the complete ordinary-hover path: enter once, suppress rollover for latched state 2, use word-11 repeat policy and source timing, preserve current progress while remaining inside, and cancel the owned auxiliary clip on leave. Then wire tracking/state events without conflating them with ordinary hover. Keep comparisons for entering, remaining, leaving mid-frame, pressing, dragging outside, releasing inside/outside, and switching group peers. A running original is still needed to validate platform event ordering and subjective feel.
