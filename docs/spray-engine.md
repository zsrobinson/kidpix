# Native spray tool behavior

Static evidence from the i386 slice of the supplied trial. Executable identity and disassembly reproduction are in [reverse-engineering.md](reverse-engineering.md); complete resource export details are in [moving-paint.md](moving-paint.md). No original application recording has yet validated platform event-loop delays.

Two different native tools implement the spray-can choices: `RCyclic` draws individual Paint Shapes from `Cyclic.MHK`, while `RSprayGun` creates moving scripts from `Anims.MHK`. Neither examined emission path applies random rotation, arbitrary size scaling, or procedural motion to each mark.

## Paint Shapes: selection, placement, cadence

`RCyclic` is identified by RTTI string `0x0024df10`, type information `0x00320ac0`, and vtable beginning `0x003209f8`. Its stamp implementation is `0x00117ff2`; random next-image selection is `0x00117f96`.

The native operation is one image, with source dimensions and registration:

```text
oneBasedImage = stored current image index
draw image from loaded bank at
    (pointer.x - REGS_x[oneBasedImage],
     pointer.y - REGS_y[oneBasedImage])
choose the next image index randomly
```

Evidence:

| Address | Observation |
| --- | --- |
| `0x00118039`–`0x00118063` | Loads current bank slot at tool `+0x102`, one-based image at `+0x100`, and passes pointer x/y to `0x00154882`. |
| `0x00154919`–`0x00154942` | Renderer subtracts the image's big-endian y/x registration values from the supplied point. |
| `0x00154945`–`0x00154971` | Looks up exactly one bitmap offset and calls the bitmap draw routine. |
| `0x00154979`–`0x0015499c` | Output rectangle uses that bitmap's width and height, without per-mark rescaling. |
| `0x00118089` | After drawing, jumps to next-image selection. |

At `0x00117fa1`–`0x00117fe3`, the next index is computed as:

```text
oneBasedImage = 1 + trunc(r * (N - 2) + 0.5)
```

`r` is the shared normalized random float obtained through `0x00148580` and `0x00016812`; the latter consumes cached floats or calls imported `random` and applies the generator's normalization scale. Literal `0.5` is stored at `0x0025c29c`.

`N` is the loaded bank's first word. Loader `0x00154641`–`0x00154648` byte-swaps the resource's first word without incrementing it. For these resources, this is the real count from byte 0 of the `tBMH` header, not the padded storage stride at byte 4. The resulting normal random range is source one-based images 1 through N−1. The last image should remain exported, but should not be included by a guessed uniform `random * frameCount` selector.

The constructor initializes the current index to 1 at `0x001180fe`. The current index subsequently persists across ordinary stroke boundaries and is replaced after each stamp; it should not be reset on every pointer event or every new stroke. This is random selection of individual images, rather than sequential frame animation or compositing every bank image together.

Bank selection explicitly resets the one-based image index to 1. The category-selection branch at `0x000f5c02` loads the new bank, stores its loaded slot at `0x000f5c67`, and writes `1` to tool `+0x100` at **`0x000f5c6e`**. This reset also occurs for an explicit reload of the same category. Activation event `0x65` allocates a new `RCyclic` instance and invokes constructor `0x001180e6` at `0x000f5b54`–`0x000f5b65`, then falls through the category-selection path. Returning to Paint Shapes through that activation path therefore starts at image 1 again. Keeping the next random index across ordinary strokes is correct; keeping it across tool reactivation or source category reload is not.

Inherited tracking handler `0x001330a0` reads the millisecond clock, compares it with tool `+0xf4`, calls the tool's draw/update method when due, then sets `next = clock + 100` (`0x001330ab`–`0x001330e9`). The comparison is strict: at the native millisecond boundary, equal is not yet due. This establishes a 100 ms tracking throttle.

**Stationary held spraying is supported by a separate idle poll.** Application idle routine `0x00049aa4` walks registered input objects and calls virtual method `+0x08` for objects whose input mask includes bit `0x08` (`0x00049add`–`0x00049aee`). `RToolMgr`'s input-object vtable at `0x00327278` maps that method to thunk `0x00138498` and handler `0x001384b8`. While a stroke is active (manager `+0x1c`) and the manager is enabled (`+0x5c`), that handler obtains the current pointer through `0x0000d324`, then calls the active tool's virtual method `+0x30` at `0x00138542`, without checking whether the coordinates changed. For `RCyclic`, that method is the 100 ms handler above. Input registration uses mask `-1` at `0x001388ef`, including the idle bit. Thus a held stationary pointer should continue producing shapes; relying solely on DOM pointer-move events would omit native behavior. Exact host idle-loop delay remains an empirical timing question.

The actual shape renderer does not read selected brush size or a random angle. The inherited constructor sets size values 0, 1, 2 (`0x001321f8`–`0x00132204`); no specific call disabling size-control UI has been established here. The source tray's omission of size-panel imagery is separate UI evidence. Preserving source-size images and omitting irrelevant size controls is consistent with the verified drawing path; claiming that this constructor explicitly disables those controls would exceed the evidence.

## Moving Paints: bank and variant selection

`RSprayGun` is identified by RTTI string `0x0024ecd0`, type information `0x00326f20`, primary vtable `0x00326e38`, and constructor `0x0013461a`. It installs its secondary timeout-listener vtable at object `+0xf0`.

The source panel computes a moving collection/start script as:

```text
start = 24000 + categoryIndex * 100
```

At `0x000f6d1c`–`0x000f6d24`, `RSpraySubPanel` multiplies the selected category by 100 and adds `0x5dc0` (24000). It loads the collection with `0x001546ed`, obtains the actual loaded script count from global state `+0x184` at `0x000f6d74`, then emits event `0xde` containing the start and count (`0x000f6ded`–`0x000f6e57`). The receiving tool-panel branch at `0x000f4d2d` stores event payload `+0x1c` and `+0x20` into the spray tool's `+0x102` and `+0x104`; it also stores the owning collection bookkeeping pointer at `+0x10c`.

Emitter `0x00134944` chooses a whole script variant:

```text
script = start + trunc(r * (count - 1) + 0.5)
```

The calculation is at `0x00134992`–`0x001349d2`. It selects from the bank's authored script variants, not the bitmap bank's first frames. The export's `clipIds` and the actual loaded count are the appropriate inputs. For example, bank 24000 has 26 scripts; bank 25900 has 99.

## Moving placement: anchor before registration

The emitter reads the current pointer through `0x0000d324`, checks it against the tool's canvas bounds, then passes that point directly to animation creator `0x0015aa8b` (`0x0013494d`–`0x0013498c`, `0x001349ad`–`0x001349e2`). The creation flags are exactly `0x800000`, meaning finite completion after the sound-completion condition.

The relocation anchor is the **first image's raw authored x/y**, before registration. It is not the script header's `sourceOrigin` and is not the union-bounds center:

1. Creator `0x0015ab64`–`0x0015ab7c` stores the supplied point at animation `+0x60/+0x62` and marks explicit relocation with `+0xc4 = 1`.
2. Initialization follows `0x00159fd3` → `0x0015a0ba` → `0x0015a0c1`; it calls anchor reader `0x0015b22a`.
3. `0x0015b29d`–`0x0015b2ab` finds the first image-group command; `0x0015b25c`–`0x0015b276` reads and negates that group's first image x/y. In the valid-bank branch, `0x0015a11e`–`0x0015a12a` stores those negatives at animation `+0x64/+0x66` while retaining the pointer in `+0x60/+0x62`.
4. Interpreter `0x0015a3df`–`0x0015a3f5` adds pointer and relocation offset; drawing-command handling adds this result to authored coordinates at `0x0015a45a`–`0x0015a479`.
5. After forming the image group, it invokes registration helper `0x00158b4e` at `0x0015a7f1`. That helper subtracts the bank's REGS offsets at `0x00158baa`–`0x00158bbe`.

For the current resource export, whose `part.x/part.y` already subtract registration and omit `sourceOrigin`, the correct placement is:

```text
particleOrigin = pointer - firstDrawRawPosition
partTopLeft = particleOrigin + part.position
```

Clip 24000 has header origin `(308,120)` and first raw draw point `(12,120)`. Its first registered part is `(11,120)`, so the first bitmap's top-left is `pointer + (-1,0)`. Clip 24001 has first raw point `(69,101)`, despite header origin `(251,139)`. Exporting the raw anchor avoids reconstructing it from the registered part or guessing from bounds.

The raw `0x8000` registration flag and one-based image indices should remain available as source metadata. No extra seven-pixel upward drift, recentering, or arbitrary rotation belongs on top of the authored trajectory.

## Moving emission and lifetime

Mouse-down handler `0x00134bee` starts the timeout timer with interval `0x96` = 150 at `0x00134c38`, then immediately sends a synthetic `TOut` event (`0x00134c43`–`0x00134ca5`). Timeout handlers `0x00134ac2` and `0x00134aea` call emitter `0x00134944`. The timer is constructed through `0x0014856a` at `0x00134d5c`; the general animation/timebase uses milliseconds as established in the clock documentation.

Mouse-up handler `0x00134b02` disables the timer and delegates stroke completion. It does not destroy active moving particles. Existing particles continue through their authored programs after pointer release.

Each created animation receives callback `0x00134a4a`, an owning collection pointer at `+0xc8`, and the source canvas clip rectangle (`0x001349f2`–`0x00134a3b`). The callback responds to completion reason `-2`:

- Decrements the collection's active-animation count (`0x00134a5c`–`0x00134a62`).
- Invalidates the current bounds, switches to the drawing context, and renders the animation's current image group through `0x00158e1f` (`0x00134a66`–`0x00134a97`). This is the native flattening step.
- Hides the live animation through `0x00159280` and marks it for deletion at `+0xd4` (`0x00134a9c`–`0x00134ab4`).

Normal completion therefore retains the final authored composition by flattening it into the drawing. It does not make the final mark disappear or immediately restart that particle.

Tool cleanup `0x00134b42` disables the timer, walks active animations belonging to the current bank, and explicitly invokes the same `-2` callback (`0x00134bc9`–`0x00134bda`). Panel collection cleanup similarly invokes the callback before unloading (`0x000f685d`–`0x000f688f`). These paths flatten the **current** frame early, rather than jumping every unfinished particle to its last frame.

## Timing and sound completion

The `tSCR` intervals are source milliseconds: moving clips use 100 or 66 ms and preserve repeated waits. The animation end marker is processed as two phases. The update rendering the final group sets end flag `+0x57`; the next scheduled update examines completion flags. Consequently the earliest finite completion time is one further source interval after the final group's event time. Active sound can extend it.

For flags `0x800000`, interpreter `0x0015a311`–`0x0015a338` waits until completion storage for channels 1 and 2 (`+0xda/+0xdc`) permits finishing, then stops animation updates and invokes `-2` (`0x0015a33e`–`0x0015a372`). The examined moving resources contain 771 channel-1 sound events and 6 channel-2 events. Flattening at the resource helper's zero-duration terminal-frame event can therefore be early by at least one interval, and sometimes by the remaining sound duration.

Each sound cue is attached to its animation ID: handler `0x0015a594`–`0x0015a5b3` obtains animation `+0x38`, applies the source channel convention, and passes ownership plus completion storage into sound playback `0x00152bae` at `0x0015a67e`. This supports overlapping particles with distinct sound ownership. Resource cue IDs and channels should be preserved, and stopping one particle should not stop every unrelated sound. Destruction calls ownership cleanup through `0x00152aee`; its matching rule and 16-channel scan are documented in [button-animation.md](button-animation.md).

## Implementation boundaries

The recovered rules support replacing the sampled renderer now: all real bank images, exact registered placement, random source selection, full moving scripts, authored intervals and sounds, finite particle completion, and current-frame flattening during tool cleanup. Remaining empirical checks are native event ordering, stationary-pointer delivery, actual timer delay under load, audio-channel allocation under heavy spraying, and drawing-layer order when several particles finish together. No overall parity percentage follows from these static rules.
