# Native UI animation coverage audit

Audit of the supplied trial resources and current web implementation, 2026-11-09. This is a recovery plan based on local primary evidence, not a claim that a running original has been visually matched. Paper Canister and palette-color tracing are already assigned separately; this audit inventories their known programs without duplicating that investigation.

The strongest next improvement is **animated tool-tray controls**. Their complete motion and sound programs already decode, their button tables identify rest/tracking/rollover slots, and the web currently reduces them to static artwork. Completing generic Easel state playback is similarly valuable. Big Eraser has a larger functional discrepancy, but recovering its wipe algorithms requires more than playing an image sequence.

## Reproducible workflow and evidence boundaries

1. Read installer payload files through `scripts/import-ui.py:app_resources`, then parse each `.MHK` with `mohawk`. This avoids installation and preserves archive/resource IDs. `KPD3.cfg` identifies archive sets; in particular `[Easel]` loads Easel, Tp, Buttons, WackyBrushSounds, Misc and Eraser, while `[Picker]` loads Picker, Thumbinf, TimerSettings, PickerUndo and TransitionSounds.
2. Decode each `tSCR` with `scripts/mohawk-script.py:decode_script`. Count **draw groups**, yielding waits and sound events separately. A wait immediately before end is terminal and does not add a native update. Do not infer duration from sprite count. Preserve the declared interval: it is not universally 100 ms.
3. Parse `MBTN` as 32-byte records. Keep all four state-script references, word-10 auxiliary rollover, repeat/cleanup parameters, group and command ID. A script number alone does not identify the user action or its trigger. Resolve those through the table, source config/help or caller disassembly.
4. Render each group's parts using the script origin, one-based bitmap IDs and signed `REGS` offsets. Preserve the source draw order and clipping. A bank contact sheet is useful for inspection but cannot replace the script's motion or prove an effect name.
5. Trace the owner before integrating: creation flags, dynamic state replacements, callback cleanup, sounds and hit testing can change how the same program is used. Existing evidence in [button-animation.md](button-animation.md) and [image-control-regions.md](image-control-regions.md) covers the shared button constructor, state dispatch and hit geometry.
6. Add actual-application browser cases with controlled time and source-image oracles, covering enter, remain, leave, press, drag outside, release, selected/disabled states, loading failure and cancellation. Check the actual studio composite as well as an isolated actor; a perfectly rendered actor underneath the paper is still invisible. Browser timeout/RAF delivery is an adaptation, not measured native latency.

The read-only inventory generated during this audit is local at `artifacts/research/ui-animation-audit-inventory.json`. It records every decoded script's bank, interval, draw groups, waits, sounds and raw draw events, plus rejected programs. `artifacts/research/audit-KPD3.cfg` is an extracted source copy. Recreate these through the functions above rather than treating ignored artifacts as shipped inputs.

| Archive | Source tSCR count | Fully decoded | Programs with multiple draw groups | Existing complete-timeline decoder failures |
| --- | ---: | ---: | ---: | --- |
| `Data/Easel.MHK` | 138 | 136 | 85 | 1039, 1128: trailing data after first end |
| `Data/Tools/Tp.MHK` | 380 | 380 | 125 | None |
| `Data/Picker.MHK` | 290 | 290 | 57 | None |
| `Data/BigPicker.MHK` | 6 | 6 | 2 | None |
| `Data/LittlePicker.MHK` | 3 | 3 | 0 | None |
| `Data/Eraser.MHK` | 1 | 1 | 1 | None |
| `Data/GFXTransitions.MHK` | 1 | 1 | 0 | None |

These are inventory counts, not independently animated features. Lookup tables and repeated identical drawings also use script records. “Fully decoded” means this command subset parses the entire record; it does not establish caller lifecycle or platform compositing.

## Priority 1: tool-tray control motion

`Tp.MHK` bank 18000 contains the material-tool motion and its source sounds. `MBTN` 18400 rows 0–3 directly assign these programs; they are not guessed from sprite order. The control's rest/state-1/rollover roles use the shared button dispatch already traced for Easel. Familiar Pencil/Chalk/Crayon/Marker labels below follow the existing source-layout mapping in the UI exporter and registered control positions; callers still need checking before claiming complete selected-state behavior.

| Drawing control | State 0 | State 1 | Word-10 rollover | Draw groups in those programs | Declared interval |
| --- | --- | --- | --- | --- | --- |
| Pencil-position control | 18060 | 18061 | 18062 | 11 / 11 / 6 | 100 ms |
| Chalk-position control | 18063 | 18064 | 18065 | 16 / 16 / 6 | 100 ms |
| Crayon-position control | 18066 | 18067 | 18068 | 16 / 16 / 6 | 100 ms |
| Marker-position control | 18069 | 18070 | 18071 | 14 / 14 / 5 | 100 ms |

The corresponding cue offsets are 4–15 in source bank 18000, giving sound resources 18004–18015. Each of these programs has its own cue; replacing them with one generic click loses authored behavior. Pencil programs, for example, compose two registered parts per frame and occupy source bounds `(132,635)` through `(227,755)` across the sequence.

The web's `src/native-ui.js:renderNativeDrawing` currently selects extracted `drawingTools` PNG variants, applies a CSS color filter and swaps on hover/press/selection. It does not play these tSCR timelines. `scripts/import-ui.py:render_script` explicitly takes only the **first image group** when assembling other tool trays, so multi-frame programs are also baked down to stills there.

Next scope: export the four verified MBTN records and their complete registered parts/timelines, then add a state-aware controller. Preserve the difference between ordinary hover and pointer tracking; word-10 is not a generic selected sprite. Start with one drawing control and prove switching, drag-out/reentry, selected state and owned-sound interruption before extending the same mechanism to the other controls.

The next tables are already recoverable with the same decoder:

| Tp table | Proven state/rollover assignments | Visible web gap |
| --- | --- | --- |
| `MBTN 18000`, rows 0–2 | 18072/18073/18074, 18075/18076/18077, 18078/18079/18080 | Painting tray's three main controls have 4–13-group source programs; web tray artwork and hit overlays are static. |
| `MBTN 18500`, rows 0–1 | 18137/18138/18139 and 18134/18135/18136 | Eraser tray's two main controls have 7/7/9 and 10/10/8 draw groups at 100 ms; web changes a still tray. |
| `MBTN 18300`, rows 0–2 | 18081–18089, in three triplets | Bucket controls have authored motion and distinct cues; web exports first groups. |
| `MBTN 18600`, rows 0–1 | 18090/18091/18092 and 18093/18094/18095 | Mixer controls likewise have complete motion absent from static tray rendering. |

Avoid assuming that selecting a tray causes the entire tray to slide. Scripts 18035 and 18036 have four groups and distinct cues, and 18038 has five groups, but their dispatch and purpose have not been established. Their registered bounds alone do not identify a transition. Locate their actual callers before giving them a tray-opening label.

## Priority 2: full Easel state sequences and cleanup policy

Ordinary supported rollover programs already run through `src/native-rollovers.js`. Undo Guy has its own 20 source routines and idle composition. The recovered hit geometry is separate from image placement. The main remaining generic gap is that `src/native-ui.js:bindSprite` still represents rest/hover/down/selected as static PNG indices rather than playing the four source state scripts.

For example, Backgrounds (`MBTN 75`, row 2) assigns state slots `[1000,1001,1001,1001]` and auxiliary rollover 1002. State 1001 has three registered groups and sound resource 1000; ordinary rollover 1002 has four groups and no cue. Drawing Tools assigns `[1012,1013,1013,1013]` plus rollover 1014, with distinct rest/tracking cues. The existing main-action cue does not reproduce their timed frame sequences.

Implement generic playback from source slots after checking the owner’s dynamic replacements. Do not restart an unchanged script on every state-label transition: the native Draw path explicitly preserves continuity when adjacent state slots reference the same running script, as documented in [button-animation.md](button-animation.md).

**Concrete cleanup discrepancy:** Firehose row 19 exports word 12 = 294 and `rolloverCancelsOnLeave=false`. The native cleanup branch at `0x0007070c`–`0x00070729` skips ordinary leave cancellation for nonzero word 12; forced reason 3 still cancels. The current web rollover handler unconditionally stops on `pointerleave`, and its animation step also stops whenever `inside` is false. Current Firehose browser coverage verifies that web behavior, not the source exception. Trace the owner’s forced cleanup and the meaning of parameter 294 before changing persistence, then revise the browser expectation to the established native lifecycle. Do not simply make every rollover survive leave.

Two complete Easel programs remain deliberately unsupported:

| Program | Proven owner/reference | Why not play a guessed timeline | Next trace |
| --- | --- | --- | --- |
| 1039 | Play control state slot 1; row 15 has `[1041,1039,1041,1042]` | A complete first program ends before additional image instructions. Treating the rest as automatic continuation invents dispatch. | Follow the Play tracking callback and any explicit script-offset/alternate-segment selection. |
| 1128 | Add Picture to Slide Show auxiliary rollover; row 23 | Three draw groups reach an end, followed by `80 08 01 ec 01 18 01 02 00 02`. Opcode/continuation semantics are unimplemented. | Trace the interpreter's `0x80` command and the owning completion path before enabling this rollover. |

Initial geometry for these scripts can be exact while complete playback remains unsupported; those are separate claims. Play also has a separate Stop record with initial script 1045 and identical source hit bounds. The web currently relabels one Play button; its visual state should eventually follow the actual source Play/Stop actors.

## Priority 3: Slide Show animated controls and characters

`Picker.MHK` is the Slide Show archive, not the color palette. Its `MBTN` 888 contains 28 records. The web imports static `slideShow` sprites and uses static state binding; it does not export or play Picker's button-script timelines.

Useful directly assigned examples are row 1, state 5005/5006 and rollover 5004 (word-11 repeat enabled), and row 2, state 5025/5026 and rollover 5027. Script 5006 has 11 groups and cue 5004; 5026 has nine groups and cue 5007. These are concrete source programs with source control references, unlike arbitrary sprite sweeps. Row 1 also has nonzero leave-cleanup parameter 1364, so the shared player needs the same policy audit as Firehose before reuse.

Long character programs are also recoverable. Scripts 5245/5246 begin with registered sprite 18 at `(860,204)`, matching the web's existing dog art placement, and contain 31/18 groups at 100 ms. Script 5248 begins with sprite 128 at `(775,406)`, matching the existing girl art, and has 60 groups at 100 ms. Script 5257 begins with sprite 34 at `(869,406)`, matching the boy art, and has 61 groups at 100 ms. This establishes the artwork relationship, **not** when those routines should trigger. Other programs 5249–5255 and 5258–5264 contain 13–39-group sequences whose caller selection remains untraced. Script 5247 declares 200 ms, an explicit reason not to impose a global 100 ms interval.

Next scope: export MBTN-bound Slide Show controls first, then trace character idle/hover/action selection. Avoid assigning idle loops merely because a sequence is long. Keep Slide Show scene playback separate from chrome actors so picture transitions cannot erase a still-running button or character layer.

## Priority 4: Big Eraser behavior and transition data

The web currently routes every Big Eraser invocation through `onBigErase: () => clearPicture()`, discarding the selected effect passed by the paint controller. This immediately clears picture state and uses the Firehose cue. The available effect titles and thumbnails therefore do not imply implemented native wipe motion.

There are several distinct native sources to recover rather than one universal sprite movie:

- `Data/Eraser.MHK` has one program, tSCR **3900**, bank **3600**, with 11 sequential registered draws at 100 ms. Its declared origin is `(-100,500)` and its header bounds are `(-100,500,376,1020)`. The source config includes this archive in Easel's loaded set. The binary starts script 3900 through animation replacement at `0x0005adf2`–`0x0005adfa` and then changes its update state at `0x0005ae18`. The owner and callback must be traced before claiming that playing those 11 poses performs the actual page erasure.
- The executable identifies `REraserPanel`, `RFullCutEraser`, `RQuickTimeEraser` and `RDFirecracker` classes. These are leads for procedural or QuickTime-backed rendering, not evidence that every effect is an image sequence.
- `KPD3.cfg` supplies separate named erase/effect cues, such as `[FirecrackerSnd]` 7219, `[ClockFaceSnd]` 7227, `[FadeSnd]` 7230 and `[PageTearSnd]` 7243. Preserve source names and mappings; do not derive them from preview indices.
- `Data/Quicktimefx/` contains 30 named `.qfx` files plus `tEFX.rsrc`; `English.lproj/Transitions.plist` lists matching graphics-transition names and independent sound-transition choices. `GFXTransitions.MHK` contains preview bitmaps 7500–7531 and a single empty drawing program 7500. Those previews do **not** encode the wipe renderer. The `.qfx` parameter structures and the native QuickTime component/caller need decoding before matching those effects in Canvas.

Next scope: distinguish native full-cut/Firecracker handling from QuickTime effects, identify effect-ID-to-source-parameter mapping, reproduce one proven simple operation and its sound, and test intermediate frames plus one undo boundary and cancellation. Do not ship all source thumbnails under one instantaneous clear and describe them as recovered native effects. Slide Show's current generic opacity animation likewise does not implement the named source transitions.

## Already active work; do not duplicate

Paper Canister uses Easel 1055, with six poses beginning at 0/100/200/300/400/500 ms and the earliest completion check at 600 ms. Lookup programs 1119/1122 supply selected-texture/page substitutions and are not independent motion layers. Rest/tracking/hover are 1052/1053/1054. That dedicated recovery now has five passing actual-app tests: exact opaque source pixels, edge-compositing tolerance, actual studio stacking, controls activation, hover/tracking cue, selection/undo/redo page persistence, fast cancellation and asset retry. Remaining native Mac port palette-installation uncertainty stays explicit in the generated metadata; tests compare exported source-authored assets, not a running Mac port.

BigPicker's source programs 1500/1501 contain seven registered groups each. The first declares **30 ms**, the second **100 ms**, with different cue offsets. Their order is opposing, but caller tracing must establish opening/closing and interruption semantics. The current web palette simply toggles a static `color-picker.png` and live hit targets. This is a high-value motion gap already under separate investigation. LittlePicker has only three single-group scripts, so an invented opening animation would have no support from that archive alone.

## Implementation order and review gates

1. Resolve Firehose's leave exception and generic Easel state playback, without loosening recovered hit geometry or rewriting the already working ordinary rollover timing.
2. Recover Tp MBTN 18400 drawing-tool timelines end to end; then apply the tested controller to painting, bucket, mixer and eraser controls. These are the broadest currently omitted authored UI motions with fully decoded programs.
3. Add Picker MBTN 888 chrome playback, then source-dispatched character routines. Keep untraced idle/action selection explicitly disabled.
4. Implement Big Eraser from traced renderer/parameter evidence, starting with one native effect rather than speculative coverage of every label.

For each scope, require source archive/program IDs, frame/registration export, caller lifecycle evidence, browser pixel and interruption tests, and a statement of what still needs a native runtime recording. No static audit can establish exact Mac event-loop jitter, audio latency or subjective feel by itself.

## Four main library controls

The historical static main-state gap is now addressed for Backgrounds, Stickers,
Animations and Sounds & Movies only. See [library-button-motion.md](library-button-motion.md)
for Mac source pins, browser adaptations, validation and remaining native limits.
Other Easel controls and unsupported alternate programs remain outside this slice.
