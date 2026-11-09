# Native brush tracking and integer line stepping

The supplied trial's i386 executable establishes the following behavior for the `RRealMedia` brush family. Binary identity and extraction details are in [reverse-engineering.md](reverse-engineering.md); blending is covered separately in [brush-engine.md](brush-engine.md). [native-brush-tracking.js](../src/native-brush-tracking.js) implements the verified integer coordinate and stroke state rules. It does not schedule browser events or render brush masks.

## Dispatch and configuration scope

The examined class vtables share tracking slot `+0x30 = 0x001223f4`, line slot `+0x50 = 0x00137556`, and recenter slot `+0x54 = 0x00135456`. The generic initial stroke routine is `0x00123d0a` and generic release routine is `0x00123ccc`.

| Class | Vtable | Setup `+0x18` | Begin `+0x20` | End `+0x28` |
| --- | --- | --- | --- | --- |
| RealBrush | `0x00323e08` | `0x00123e5a` | `0x0011d05c` | `0x0011d034` |
| Airbrush | `0x00321150` | `0x00123e5a` | `0x0011d05c` | `0x0011d034` |
| BristleBrush | `0x003213b0` | `0x00123e5a` | `0x0011d05c` | `0x0011d034` |
| ExtrusionBrush | `0x003238d0` | `0x0011fd3a` | `0x0011f14c` | `0x0011d034` |
| Marker | `0x00323cd8` | `0x001214a0` | `0x001218aa` | `0x00123ccc` |
| Chalk | `0x003214e0` | `0x00123e5a` | `0x0011c43c` | `0x00123ccc` |
| Crayon | `0x00321740` | `0x00123e5a` | `0x0011cf82` | `0x00123ccc` |
| CustomBrush1–16 | listed below | `0x00123e5a` | `0x0011d05c` | `0x0011d034` |

The CustomBrush vtable addresses, in numerical class order 1–16, are `0x003219a0`, `0x00322320`, `0x00322450`, `0x00322580`, `0x003226b0`, `0x003227e0`, `0x00322910`, `0x00322a40`, `0x00322b70`, `0x00321ad0`, `0x00321c00`, `0x00321d30`, `0x00321e60`, `0x00321f90`, `0x003220c0`, and `0x003221f0`. These were checked through the binary's class RTTI references and initialized vtable pointers.

Keep the **configured spacing** field `+0x184` distinct from the **effective line spacing** field `+0x60`:

- Tool construction writes 3 to `+0x60` at `0x00137f46`.
- Generic setup `0x00123eb1`–`0x00123ebd` copies configured spacing to `+0x60` only when the configured value is nonzero. Configured zero retains the existing effective field, rather than writing zero.
- Marker setup calls generic setup, then multiplies the unsigned effective field by the float **1.5** at `0x0025ff50`, truncates, and writes the low 16 bits back (`0x001214ce`–`0x001214e2`). Repeated setup with configured zero therefore acts on retained state. An unconditional `spacing || 3` reset would lose that behavior.
- Extrusion setup calls generic setup at `0x0011fd60`, then allocates its separate 33×33 bitmap; it does not change spacing. The other setup entries in the table use generic setup directly.

`resolveNativeBrushLineSpacing({ spacing, previousLineSpacing = 3, marker = false })` implements this setup rule. Use the retained tool field as `previousLineSpacing` when recreating native setup on a reused object. Brush size ordinal and bitmap dimensions do not multiply spacing in these routines.

## Pointer acceptance

Tracking method `0x001223f4` receives an integer point and compares it with `+0x20/+0x22`, the last **accepted** point.

For nonzero configured spacing, a repeated point returns immediately (`0x00122431`–`0x00122434`). A moved point is accepted only if either absolute x displacement or absolute y displacement reaches the effective spacing (`0x0012243a`–`0x00122462`). Smaller samples leave the accepted point unchanged. This is a square threshold, not Euclidean distance, and it accumulates from the last accepted point rather than every raw pointer sample.

An accepted point calls the line method with `(lastPoint, newPoint, region, 0)` at `0x0012246f`–`0x0012248c`. Only after that call does it update the accepted point (`0x0012248f`–`0x0012249a`). Source brush oscillation changes emitted mask placement separately; it does not change this input point.

Configured zero bypasses the displacement threshold. Every moved sample calls the line method, even when the movement is shorter than effective spacing. A stationary sample calls the dab method directly with `(0,0)` at `0x001224a0`–`0x001224ba`.

## Integer line and endpoint rules

Line helper `0x00137556` first calls virtual `+0x54` with the start point (`0x001375b9`–`0x001375c7`) to recenter the brush rectangle. This does not emit a start dab. It calculates signed direction steps and doubled absolute deltas at `0x001375ca`–`0x0013761d`, choosing x-major only when `abs(dx) > abs(dy)` (`0x00137620`–`0x00137623`). Equality takes the y-major branch.

For each pixel of the dominant axis, its integer error accumulator starts at `2 * minorLength - majorLength`. An error of **zero or greater** steps the minor axis, subtracts `2 * majorLength`, then adds `2 * minorLength`. Each iteration steps the dominant axis once. This directed tie rule means reversing a half-slope segment can choose different pixels; smoothing or rounding interpolated floats would lose it.

The x-major loop is `0x00137673`–`0x00137706`, and the y-major loop is `0x00137746`–`0x001377e2`. Each accumulates x/y deltas since the preceding emission and tests **dominant-axis distance** against the unsigned effective spacing. On reaching it, virtual `+0x4c` receives those relative deltas and the accumulators reset to zero (`0x001376b5`–`0x001376f1`, or `0x0013778d`–`0x001377c6`). Zero effective spacing, if present, emits every pixel step.

At the endpoint, a nonzero remaining x or y delta is emitted unconditionally (`0x00137639`–`0x0013763f` → `0x0013771e`–`0x0013773e`). Consequently:

- A nonempty accepted segment excludes its start and emits its exact endpoint once.
- An endpoint shorter than the spacing after the preceding dab still emits.
- No spacing remainder survives the accepted segment. The next segment starts with empty local accumulators.
- A zero-length line emits nothing. Stationary configured-zero painting occurs in the tracking handler instead.

For example, with spacing 3, one horizontal input from x=0 to x=10 emits x=`3,6,9,10`. Two accepted inputs x=5 then x=10 emit x=`3,5,8,10`. The native output therefore depends on the accepted sample boundaries. It is not a continuous arc-length sampler.

The helper returns each emission as `{ x, y, dx, dy }`: `x/y` is the absolute unoscillated center, while `dx/dy` is the native relative movement since the preceding emission in this segment. Consumers rendering by absolute coordinates should use `x/y`. A direct port of a native delta renderer must also perform the segment-start recenter described above.

## Stroke boundaries and stationary input

Generic begin stores the initial point into `+0x20/+0x22` (`0x00123de8`–`0x00123df3`), positions the brush rectangle (`0x00123df7`–`0x00123e19`), and calls the dab method with `(0,0)` (`0x00123e33`–`0x00123e4f`). The begin wrappers in the class table all reach this method. Extrusion does additional buffer setup after calling `0x0011d05c` at `0x0011f170`.

Generic end clears state, calls virtual `+0xd0`, and delegates to `0x001377e8` (`0x00123ccc`–`0x00123cfc`). The checked family uses the no-op `0x001223ee` for `+0xd0`. Base completion does not interpolate to its release-position argument. The input manager likewise dispatches release directly through tool `+0x28` (`0x00138634`–`0x0013864c`) without first tracking that position. A final sub-spacing tail can remain undrawn. Starting another stroke resets its accepted point and emits its own initial dab.

Native input includes stationary polls: `RDisplayWindow` idle entry **`0x00049aa2`** walks registered input objects with mask bit `0x8` at `0x00049add`–`0x00049aee`; the tool manager thunk `0x00138498` reaches `0x001384b8`. While a stroke is active and enabled, the manager obtains the current pointer and calls active tool `+0x30` at `0x00138542`, without requiring coordinate movement. This proves the configured-zero stationary branch can run during a held stroke. Its timer setup is recovered below; actual delivered wall-clock poll frequency has not been measured. The 100ms throttle documented for static spray belongs to a different tool.

## Idle scheduling: a requested 5ms wakeup

The framework explicitly creates a repeating **0.005-second** Core Foundation timer. This is a source constant, not a fitted timing value or a measurement of an executing native application.

At `0x001e2d90`, timer setup prepares a `CFRunLoopTimerContext` whose `info` is the scheduler state. `CFAbsoluteTimeGetCurrent` supplies the initial fire date at `0x001e2dc5`. The two interval words written at `0x001e2dea` and `0x001e2df2` form IEEE-754 double `0x3f747ae147ae147b`, which decodes to **0.005**. The call at `0x001e2e0a` is imported `CFRunLoopTimerCreate(allocator, fireDate, interval, flags, order, callback, context)`, with zero flags/order and callback `0x001e2ec2` (`0x001e2d9e + 0x124`). The imported API signature was checked against the local Apple SDK's `CoreFoundation/CFRunLoop.h`.

The timer is added to the current run loop at `0x001e2e30`, using **`kCFRunLoopCommonModes`**, resolved through import address `0x003512b8` (`0x001e2d9e + 0x16e51a`; also present in [imports.txt](../artifacts/research/imports.txt)). It is stored in scheduler field `+0x44`. Callback `0x001e2ec2` obtains the framework clock, guards its callback state, and calls scheduler `0x001e054d` with its second argument zero at `0x001e2eef`.

The exact callback-to-brush route is:

| Address | Action |
| --- | --- |
| `0x001b8953`–`0x001b8968` | Application setup calls task registration `0x001e10da`, callback `0x001b785c`, application pointer as callback data, **task interval 0**. The callback address is PIC expression `0x001b87f8 - 0xf9c`. |
| `0x001e1240`–`0x001e124c` | Registration stores task signature `ITsk`, callback at `+0x10`, data at `+0x14`, and interval at `+0x18`; it links the task into the scheduler list. |
| `0x001dfdc1`–`0x001dfdc9`, `0x001e009f` | Interval-zero setup writes task deadline `+0x20 = 0`; it does not unlink the task. |
| `0x001e0912`–`0x001e0940` | Scheduler visits each task once per pass, checks its deadline unless forced, and calls its function pointer with task/data. Deadline zero is always due in the ordinary clock domain. |
| `0x001e0943`–`0x001e095d`, `0x001e0917` | A surviving interval-zero task resets deadline to zero and advances to the next task. It has no extra brush/window delay and no loop replaying missed deadlines. |
| `0x001b785c`–`0x001b787c` | Idle task reads global mouse/modifier state and calls `0x001b727a`. |
| `0x001b7296`–`0x001b72b4` | Iterates the global window list and dispatches each window's virtual `+0xd0`. |
| `0x0031b928 + 0xd0` | `RDisplayWindow` vtable resolves that method to `0x001c2b2a`. |
| `0x001c2b3e` → `0x001f0420` | Window idle wrapper calls generic view idle `0x001f0410`, which invokes virtual `+0x70`. |
| `0x0031b928 + 0x70` | Resolves to display-window idle broadcaster `0x00049aa2`. |
| `0x00049add`–`0x00049aee` | Dispatches registered input-object idle handlers whose mask includes bit `0x8`. |
| `0x00327278 + 0x8` | Tool manager's input-object vtable resolves to thunk `0x00138498`, then handler `0x001384b8`. |
| `0x001384c3`–`0x001384dd` | Requires an active tool, active stroke and enabled manager. |
| `0x001384e3`–`0x00138542` | Reads the current pointer and calls brush tracking `+0x30`; configured-zero stationary input reaches the direct dab branch. |

There is a second scheduling source. The main application loop calls `0x001b899a` at `0x001b8b64`. That function calls `WaitNextEvent` at `0x001b8a25`, then calls the same idle scheduler at **`0x001b8a40` regardless of whether an event was received**. Its force argument is 1 for no event and 0 for a received event. The interval-zero window task is due in both cases. Thus native window/brush polls can also follow event processing, beyond the periodic timer callbacks.

Scheduling is gated: scheduler `0x001e0649` returns when disabled, and `0x001e0731`–`0x001e073f` prevents recursive scheduler execution. Enable/disable function `0x001e1522` stores enabled state at `+0x58`, creates/enables the timer through `0x001e2f07`, or removes it through `0x001e2eae` (`0x001e17e5`–`0x001e17f7`). Timer teardown invalidates and removes the stored timer at `0x001e2e53`–`0x001e2e9f`. Application activation/deactivation passes through `0x001b8192` to this enable function at `0x001b81a7`. The display window additionally checks its enabled virtual method before broadcasting (`0x00049aab`–`0x00049ab9`).

The established source claim is therefore **a requested repeating 5ms wakeup, with one eligible window poll per delivered scheduler pass and additional event-loop passes**. It does not establish exactly 200 stationary dabs per second. Timer delivery, rendering work, event processing, disabled state and the reentrancy guard affect observed intervals. No fixed 100ms brush throttle is present in this chain, and it is not tied to display refresh.

A browser implementation can request a 5ms timeout while a configured-zero stroke is held and process one current-position sample per delivered callback, stopping on release/cancel/deactivation. It can coalesce presentation into `requestAnimationFrame` while applying each delivered dab to the preview. That preserves the recovered requested wakeup and per-pass work model, but recursive browser timeout delivery and frame presentation remain an explicit scheduling adaptation. Replaying a burst of synthetic dabs for missed callbacks is not supported by this native task loop. Direct browser pointer-event samples are also an adaptation unless mapped to native event-loop scheduler passes; the investigated native tracking path is the idle poll, rather than a proven separate brush-drag callback.

## Integration API and validation

```js
const lineSpacing = resolveNativeBrushLineSpacing({ spacing, marker });
const tracking = createNativeBrushTracking({ spacing, lineSpacing });
renderDabs(tracking.begin(integerImagePoint));
renderDabs(tracking.track(nextIntegerImagePoint));
tracking.end();
```

Create or configure tracking for the selected tool, preserving native setup state where applicable. Keep the tracker through one stroke. Feed integer image-coordinate samples in their actual order; avoid inserting float-spaced dabs or resampling a line first. `begin()` emits one initial dab; `track()` returns zero or more; `end()` clears the state and returns no dabs. Calls to `track()` outside a stroke return no dabs. The caller still owns history, rendering, pointer capture, cancellation, and scheduling. The requested 5ms wakeup is source-backed; identical observed native/browser sample timing has not been established.

The helper rejects fractional coordinates: conversion from browser/display coordinates belongs at the input boundary. The original OS-to-image conversion and fractional rounding policy have not been verified. The implementation also rejects segments whose x or y span exceeds 16383 pixels, avoiding an invented model of the source helper's doubled signed-16-bit overflow. The native 720×542 page fits this verified domain. Modifier behavior, native event frequency/coalescing, and brush renderer state remain separate fidelity questions.

Run `node --test scripts/parity/native-brush-tracking.test.mjs`. Eight passing tests cover independently fixed paths in all octants, directed half-slope ties, dominant-axis spacing and relative residuals, accepted-segment boundary effects, square threshold accumulation, release without tail flushing, fresh stroke dabs, configured-zero stationary/short-movement behavior, retained effective spacing, Marker setup, and explicit integer-domain limits. These are pure source-rule tests; application integration and visual parity remain for the caller to verify.
