# Firehose rollover ownership and cleanup

Static resource/binary audit and web regression checks, 2026-11-09. The original
application **has not run on this host**. This establishes resource assignments
and native branch behavior, followed by separately identified browser checks;
it does not establish native event latency, audible output, or final Mac rendering.

## Primary evidence and reproduction

The source is the mounted `/Volumes/Kid Pix Deluxe 3D` installer, read through
[`app_resources` and `mohawk`](../../scripts/import-ui.py). `Data/Easel.MHK`,
`MBTN 75`, zero-based row 19 (table byte offset 608, length 32), contains:

```text
0441 0442 0442 0441 0002 0441 010a 0001
0000 0000 0443 0001 0126 0000 0000 0000
```

This assigns state scripts `[1089,1090,1090,1089]`, region `MRGN 1089`, command
266, auxiliary script 1091, repeat word 11 = 1, cleanup word 12 = **294**, event
word 13 = **0**, and group word 14 = **0**. The source table SHA-256 is
`056f19050f392680c2076d3349bc46debaec2cdaa484ac09ad00214f397c0137`.
Script 1091 SHA-256 is
`9ec5b83b6f1bad8653452c8a7104b7dcb5edb62d774296bfc28911704ea1e498`.
Its exported timeline has six draw groups at 100 ms, a tick-zero channel-1 cue
1029, and earliest end check at tick 6. Sound completion may delay repeat.

The executable is
[`artifacts/research/kidpix-original`](../../artifacts/research/kidpix-original),
SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.
All addresses below refer to its i386 virtual addresses. Full primary
disassembly is
[`disassembly-i386.txt`](../../artifacts/research/disassembly-i386.txt).
Focused excerpts and resource identity are saved under
[`artifacts/t3/firehose`](../../artifacts/t3/firehose/):
[`evidence-disassembly.txt`](../../artifacts/t3/firehose/evidence-disassembly.txt),
[`source-identity.json`](../../artifacts/t3/firehose/source-identity.json), and
[`mbtn75-row19.bin`](../../artifacts/t3/firehose/mbtn75-row19.bin).
The directly decoded source command sequence is saved as
[`script1091-decoded.json`](../../artifacts/t3/firehose/script1091-decoded.json).
These are ignored local research artifacts. The addresses and resource identity
here allow the audit to be reproduced without those excerpts.

```sh
otool -arch i386 -tvV artifacts/research/kidpix-original
PYTHONPATH=scripts python3 - <<'PY'
from importlib import import_module
from pathlib import Path
import struct
ui = import_module('import-ui')
read = ui.app_resources(Path('/Volumes/Kid Pix Deluxe 3D'))
resources = ui.mohawk(read('Data/Easel.MHK'))
print(struct.unpack_from('>16H', resources[b'MBTN', 75], 19 * 32))
PY
```

## Native ownership trace

| Path | Primary binary evidence | Consequence |
| --- | --- | --- |
| Load | `0x315ce`–`0x315f1` passes words 10–13 to `0x6ff10`; `0x6ff1a`–`0x6ff3b` stores them at `+0x160/162/164/166`. | Word 12 and word 13 are distinct fields. |
| Leave | `0x71c29`–`0x71c39` and `0x71d1b`–`0x71d2b` call cleanup `0x7067c` with reason 0, then clear controller hover target `+0x220`. | Changing hover target does not necessarily destroy the old actor. |
| Cleanup | `0x7069a` clears hover marker `+0x12c`; `0x7070c`–`0x70729` skips handle destruction for nonzero `+0x164` unless reason is 3. | Firehose survives ordinary leave. An absent hover marker does not mean its handle is absent. |
| Press/tracking | `0x70e9e`–`0x70eae` calls the same cleanup with reason 1 for the current hover target. | Firehose's exceptional policy survives this path too. Press must not automatically be called reason 3. |
| Reentry | `0x7231c`–`0x7232a` reclaims the hover marker; `0x723b2`–`0x723bf` destroys any surviving auxiliary handle; `0x723fe` creates the replacement. | Restart from the beginning, stop the replaced actor's owned sound, and preserve the backing actor's original visibility. Remaining within a target does not restart (`0x71c16`–`0x71c1b`). |
| Peer cleanup | `0x71c8f`–`0x71cc7` emits event `0x67` only for a nonzero group. The event switch at `0x71682`–`0x7168a`, table `0x25e2a8` index 2, reaches `0x71786`–`0x71798`, then `0x707d0`. | After setup, cancel other live auxiliary handles in the same nonzero group. |
| Retained peers | `0x707f0`–`0x70818` excludes the newly entered control, compares `+0x14e`, checks auxiliary handle `+0x168`, and calls reason 3. | A peer can be force-cancelled after it has already left. Group zero is excluded, so ordinary entry into Backgrounds/group 1 does not force Firehose/group 0. |
| Disabled control | `0x72636`–`0x72650` calls reason 3 and clears enabled field `+0x12e`. RButton disable callers include `0x30a6e`, `0x30a9d`, `0x30db3`, and `0x30e65`. | Disabling an actor cancels even a retained clip. |
| Already-left forced cleanup | `0x70764`–`0x70794` destroys the auxiliary handle and reenables its backing actor for reason 3 even when `+0x12c` was already zero. | Forced cleanup cannot depend solely on current pointer ownership. |
| Controller suspension | `0x7464a`–`0x7467d` calls current-target force helper `0x70796`, then `0x7035c`; `0x70378`–`0x7038c` destroys all remaining auxiliary handles. | Owner deactivation must clear retained actors too. |

The underlying actor is reenabled at `0x70742`–`0x70757`. Destruction reaches
owned sound cleanup through `0x159952` → `0x1595d8` → `0x152aee`, detailed in
[`button-animation.md`](../button-animation.md). Cleanup is scoped to the
destroyed actor, rather than all application sound.

### What does 294 dispatch?

In this path **294 is a nonzero cleanup field**, with no custom dispatch from
word 12. The only field dispatched by rollover enter/leave is word 13:
`+0x166`, enter `0x72333`–`0x72366`, leave `0x706a3`–`0x706fa`. Firehose's word
13 is zero. No event 294 should be synthesized from its ordinary leave.

There is a separate application event 294. Dispatcher `0x59d63`–`0x59de1`
indexes the table at `0x25df78` by event minus 222. Entry 72 at `0x25e098`
targets `0x5a9b7`: payload `+0x20 == -1` calls controller cleanup `0x7035c`
at `0x5a9cc`; the other branch calls `0x56b16` and rollover reinitialization
`0x72576` at `0x5a9f6`. Reinitialization clears the current marker and reruns
setup (`0x72590`–`0x725a2`). This independently confirms an owner-wide stop/reset
path; it does not establish word 12 as an event source. Firehose's activation
command 266 is a different table entry (`0x25e028` → `0x5aae1`). Its full erase
effect/state choreography is outside this rollover change.

The older statement in `button-animation.md` that the examined Easel entries
all had zero word 12 must be read with this row-19 exception. Its ordinary
Backgrounds cancellation findings remain valid.

## Web behavior and integration API

[`native-rollovers.js`](../../src/native-rollovers.js) now honors exported
`rolloverCancelsOnLeave`, falling back to rollover parameter 1/raw word 12 for
older manifests. Ordinary leave and pointer tracking retain exceptional actors;
reentry replaces them and cancels their old audio. Nonzero-group entry force-cleans
peers even after leave. Disabled/selected/hidden state and pointer cancellation
force cleanup. Pending image decode is invalidated by cleanup/replacement,
while an ordinary retained leave remains eligible to finish loading.

Window blur, page hiding, and hidden-document visibility force cleanup as a
**browser lifecycle adaptation**. These event names and their ordering are not
claimed to have been measured in the original application.

The existing return value remains a callable disposer, with owner hooks:

```js
const rollovers = attachNativeRollovers(manifest, hitRoot, sprites, layer, options);
rollovers.cancel('firehose');       // Force-clean one actor, even after leave.
rollovers.cancel();                 // Suspend all owned auxiliary actors.
rollovers.cancelGroup(1, 'draw');    // Force-clean group peers except this name.
rollovers();                       // Abort listeners, stop audio, remove actors.
```

Existing `excludeNames` support is preserved, including Paper Canister ownership.
Calling a cleanup hook does not restart an actor while the pointer stays still;
new ordinary entry starts it again. `cancelGroup(0)` does nothing, as in native
peer cleanup. Hooks apply to supported actors created by this binding.

**Cross-file integration for the owner:** `main.js` currently ignores the
returned disposer. Capture it when implementing in-app controller suspension,
modal/screen ownership changes, or replacing the native layer; call `cancel()`
at genuine owner suspension and the disposer before replacement. Native event
294's full stop/reset protocol also includes controller flags and current-hover
reinitialization; these hooks only provide the auxiliary cleanup part. Do not
force-cancel Firehose merely because an unrelated group is entered, or relabel
the native reason-1 tracking path as forced cleanup. This task does not edit
`main.js` or implement Firehose's full erase sequence.

## Checks and limits

The first new actual-app regression failed before the fix: script 1091 reached
frame 2, then ordinary leave made its actor hidden. It passes after the change.

```sh
node --check src/native-rollovers.js
node --test scripts/parity/rollovers.test.mjs
npx playwright test -c artifacts/t3/firehose/playwright.config.mjs
```

Results: syntax check passed; **7 Node cases passed**; **11 Chromium actual-app
cases passed** on isolated port **4181**. The browser config, output and traces
are confined to `artifacts/t3/firehose`. No Cloudflare build or deployment ran.

Coverage includes ordinary Backgrounds repeat/leave/press/selected/disabled
behavior; Firehose leave progression and reentry restart; real-studio opaque
source-image pixel matching; its source WAV URL/header; channel completion
gating; replaced/stopped cue ownership and late completion; press/drag-outside;
group-zero persistence; nonzero-group forced peer cleanup using an explicitly
modified manifest fixture; browser deactivation; delayed image loading with
ordinary leave versus forced cancellation; and native hit-region/selection/drag
checks at both studio scales. The previous region test's generic leave-stop
assertion is replaced with independent pointer-region and retained-actor checks.

Firehose audio completion is controlled by a selective Audio test double. These
tests validate playback calls, owned interruption and timing policy, not audible
output or native media latency. The group fixture changes only the test manifest;
it is not presented as the source Firehose group. Deferred loading starts its
browser timeline after decode, an adaptation rather than measured native time.
Full production-build regression belongs to the coordinating task. Native
runtime recording, complete erase-command choreography, and owner-wide modal
stop/reset integration remain unverified or outside these owned files.
