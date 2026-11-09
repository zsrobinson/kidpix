# UI audio ownership and timing audit

Audit date: 2026-11-09. Scope: the supplied Mac trial's UI audio, the pending web implementation, and an integration contract. **The original application has not run here.** Resource and executable findings below are static evidence; proposed browser policies are identified separately. No native sound-onset recording, listening comparison, or native interaction test supports a parity claim.

## Findings to implement first

1. **Replace the global `uiSound` lifetime with animation-owner lifetimes.** `main.js:playUiSound` pauses the previous global UI sound, constructs another `Audio`, drops the source channel argument, and returns no handle. Thus a tray click can truncate an unrelated Undo Guy cue; the animation controller cannot observe or cancel the cue it actually started. Native cancellation targets an animation ID, with distinct replacement rules described below. Returning an audio handle alone fixes neither global replacement nor resource-level sharing.
2. **Drive control cues from their source state scripts.** Backgrounds' ordinary hover is silent; its tracking script starts sound1000 at tick0. Drawing Tools has distinct rest/tracking cues1001/1002. Current main-action sounds run on activation and reduce these to generic tray cues. Source state entry, same-script continuity, drag-out/reentry, and actor destruction determine onset/restart/stop, not a generic `click` sound hook.
3. **Correct looping completion separately from finite completion.** Native finite playback normally checks slots1/2. The repeating branch checks them only if slot0's marker is nonzero. `rolloverEndReady` currently always waits for pending1/2. In particular, Firehose script1091 has only a channel1 cue and no slot0-setting command; its authored six-update loop can restart before that sound's end. Waiting for `ended` can lengthen the loop. This is a binary-backed discrepancy, not a measured native latency result.
4. **Prepare the small active UI sound bank before interaction.** The web creates playback objects at cue time and preloads images separately. Fetch/decode delays remain a documented first-use gap. Preparation must not play dummy/silent sounds or accumulate old hover cues for playback after activation.
5. **Expose the source's separate sound preferences.** Tool/tray sounds, attached drawing sounds, Slide Show sounds, and speech are independent settings. The current UI paths have a hardcoded `.65` gain and no corresponding tool-sounds preference. The original's subjective gain and exact mid-playback mute behavior remain unverified.

Implementation coordination belongs in `src/main.js`, `src/native-animation.js`, `src/native-rollovers.js`, `src/native-paper.js`, the future generic state player, and their focused tests. This audit changes none of them. The shared checkout was changing during this investigation; statements about these files describe the inspected working tree, not a fixed release.

## Primary evidence and reproduction

The supplied executable is [kidpix-original](../../artifacts/research/kidpix-original), SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. All hexadecimal addresses are **i386 virtual addresses**, not file offsets. The readable primary instruction evidence is [disassembly-i386.txt](../../artifacts/research/disassembly-i386.txt); regenerate without executing the application using `otool -arch i386 -tvV artifacts/research/kidpix-original`.

The mounted source is `/Volumes/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources/Archive.zp`, indexed by its compressed `Archive.zplist`. [import-ui.py:app_resources/mohawk](../../scripts/import-ui.py) supplies segment extraction and resource lookup; [mohawk-script.py](../../scripts/mohawk-script.py) supplies the strict script decoder. Resource names below are application-relative `Contents/Resources/...` paths inside that installer payload, not loose files claimed to exist on the mount.

Directly re-extracted and checked during this audit:

| Source | Check/result |
| --- | --- |
| `UserDefaults.plist` | Byte-identical to [research copy](../../artifacts/research/UserDefaults.plist); SHA-256 `70f555a969de01d5a9f4256af832425aac2b41fea004379d0a837019040a0bb3`. |
| `GlobalDefaults.plist` | Byte-identical to [research copy](../../artifacts/research/GlobalDefaults.plist); SHA-256 `cad622edb0f15687c1cbb35d189a012733c55c72aefc5d8bc09c26bfc14f6a0f`. |
| `Data/Easel.MHK` | SHA-256 `6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c`; independently read MBTN75 rows2/9/19/20/24 and scripts1000–1002,1012–1014,1052–1055,1086–1091,1095,1114,1129–1132. |
| Supported scripts in `Data/Easel.MHK` | 53 channel1 sound commands, one channel2 command; two rejected scripts retained as unsupported. No decoded channel0 sound command. |
| Supported scripts in `Data/Tools/Tp.MHK` | 134 channel1 sound commands; no script rejected by the drawing/wait/sound decoder. |

The ordinary `python3` import failed because `Foundation`/PyObjC is absent. The read-only extraction check instead used Apple's `NSUnarchiver` through JXA (`osascript -l JavaScript`), then the same installer segment rules and the actual `mohawk`/`decode_script` function ASTs. It wrote no extracted assets or runtime files. These checks do not certify unsupported opcodes or platform playback.

## What a native “channel” means

There are three separate identities; retaining all three avoids both excessive stopping and unintended overlap.

| Identity | Binary evidence | Consequence |
| --- | --- | --- |
| Animation owner | Sound command handler reads animation `+0x38` at `0x0015a594`–`0x0015a59b`. | Owner is a live animation instance, not a script resource ID, a DOM button name, or the latest sound globally. |
| Script completion slot | Sound command's BE word selects completion storage `animation+0xd8+2*channel` at `0x0015a5c2`–`0x0015a5dd`. | Slot0/1/2 is not a physical output voice index. Flags `0x100000` disable supplying completion storage (`testb $0x10,+0x5e`). |
| Physical pool entry | Global state `+0x68` points to16 records, each `0x30` bytes; scans end at16. | Native engine sound playback is bounded and shared;16 does not mean16 voices per control. |

Cue resource resolution is `script.collection + cue`, at `0x0015a56a`–`0x0015a589`; zero skips playback. The handler uses **raw owner tag** `A` for script channel1 and `A|0x8000` for other channels. The raw comparison with `$0x100` at `0x0015a5aa` occurs **before** byte swapping, so it identifies BE channel1. Preserve the original slot and derived raw-owner group separately.

Owner destruction/replacement follows these rules:

- Auxiliary destruction: `0x00159952` → `0x001595d8` → `0x0015961a` → `0x00152aee`. Script replacement also calls owner cleanup at `0x00159d70`–`0x00159d7a`; the same-script shortcut in `RButton::Draw` can bypass this replacement entirely (`0x00030b25`–`0x00030b47`, `0x00030c3f`).
- `0x00152aee` scans all16 records. For nonzero requested owner `A`, compare **`record.owner & 0x7fff` with `A`** (`0x00152b20`–`0x00152b30`). Do not mask the script channel or the sound resource. Both raw groups of this owner are canceled; other owners survive.
- Requested owner0 is a deliberate wildcard (`0x00152b1b`–`0x00152b1e`), not a safe default for missing ownership. `0x00152b47` is a separate all-slot cleanup. Neither belongs in ordinary hover/press replacement.
- Channel cleanup `0x0015295f` marks the referenced completion word nonzero before releasing playback/resource state (`0x001529b3`–`0x00152a22`). Natural completion callback `0x0015267c` clears active state and writes the sound resource ID to that storage (`0x001526c6`–`0x001526fc`). Completion is a nonzero marker, not specifically Boolean1.

### Allocation, overlap, and replacement

Playback entry `0x00152bae` does **not** index the pool by script channel:

1. Search all16 entries' `+0x06` words for the requested **sound resource ID** (`0x00152be6`–`0x00152c0b`). If found, stop/reset that entry through `0x001528b2`, including settling its old completion pointer, and reuse it. Therefore the same original resource is replaced even if requested by a different owner.
2. Otherwise choose an empty state0 slot (`0x00152c22`–`0x00152c3f`). If full, choose the least timestamp among state4 entries (`0x00152c47`–`0x00152c85`); absence of a candidate fails allocation. This is not arbitrary eviction of another actively playing owner. Do not give the web UI a blanket “stop oldest sound” rule.
3. Store pending state1, raw owner at `+0x02`, resource at `+0x06`, resource type, completion pointer and auxiliary parameters (`0x00152c92`–`0x00152d73`). Playback is dispatched later by `0x001536a8`, called from the shared update at `0x0015768d`.
4. Deferred dispatch groups pending entries by **exact raw owner** (`0x0015371e`–`0x00153758`). Before processing each group, it stops active state2 entries with that same raw owner (`0x00153766`–`0x001537a2`). **Raw owner2 bypasses this pre-cleanup.** `AX` here contains the raw owner loaded at `0x00153a5c`, not a playback-success code. The meaning/callers of reserved tag2 need further mapping before exposing it as a general UI option.

For ordinary owners, channel1 and channel2 therefore have different replacement groups; channel0 and channel2 share a group. Two *different* animation owners can overlap, subject to same-resource reuse and the pool limit. Owner teardown cancels both groups. Multiple pending cues in one dispatch and reserved owner2 are reasons not to replace these rules with a universal `Map<channel, Audio>`.

The trace proves the engine's mechanics. It does not prove that a particular pair of UI actors coexists: their owning controls can destroy/disable one another first. Scope an overlap assertion to actors whose lifetimes actually overlap.

## Source trigger and completion timing

The controller distinguishes ordinary hover from active tracking. The unchanged hover target is not restarted (`0x00071c16`–`0x00071c1b`); state2 suppresses auxiliary hover (`0x00071c6a`–`0x00071c7c`). During tracking, hit-test transitions issue `0x2000`/`0x2001` through `0x000701be`, selecting state1/state0 through `0x00030ce0`. See [button-animation.md](../button-animation.md) for the full event table and masking-chain context.

These directly decoded examples all declare100ms source intervals:

| Control/program | Authored sound | Integration consequence |
| --- | --- | --- |
| Backgrounds MBTN75 row2: state1001; auxiliary1002 | State1001:1000/channel1/tick0. Auxiliary1002: silent. | A generic hover click sound is wrong; delaying this state cue until activation changes the trigger. |
| Drawing Tools row9: rest1012; tracking1013; auxiliary1014 | Rest1012:1001/channel1/tick0. Tracking1013:1002/channel1/tick0. Auxiliary1014: silent. | Preserve two state cues; first-load sound suppression/caller flags still need checking before playing rest cues at page startup. |
| Paper tracking1053; auxiliary1054; opening1055 | Only1053 has1006/channel1/tick0. | Opening motion itself is silent. Do not add the main-action paper fallback as a second cue. |
| Firehose row19: auxiliary1091 | 1029/channel1/tick0; six draw groups; no slot0 command. | This is an authored rollover cue. `clearPicture()` also plays1029 in the web; that extra action cue needs caller evidence or removal when source playback owns it. |
| Undo Guy1095 and1114 | 1008 and1027 respectively, channel1, **tick1**. | Cue belongs100ms after timeline start, not immediately on undo activation. Preserve source order and waits. |

A source tick is intended schedule time, not a measured hardware onset. The native millisecond clock/scheduler proof is at `0x0015a2ed`–`0x0015a301`, `0x0015767d`–`0x00157682`, `0x001dfb9f`–`0x001dfbb2`. Terminal wait-before-end does not yield (`0x0015a6e4`–`0x0015a72b`); end processing happens on the next scheduled update.

Completion policy must retain the actual branch:

- Finite flag `0x800000`: if `0x100000` is absent, both `+0xda`/`+0xdc` must be nonzero before callback `-2` (`0x0015a318`–`0x0015a372`). With `0x100000`, it bypasses this sound wait.
- Repeat: **if `+0xd8 == 0`, restart without checking1/2**. Otherwise restart only when both1/2 are nonzero (`0x0015a379`–`0x0015a3a1`). Initialization sets slot0=0 and slots1/2 nonzero (`0x00159cf4`–`0x00159cfe`). Sound slot0 and the separate handler at `0x0015a6b7` can change that marker; do not extend the strict exporter to unknown commands by guessing.
- Firehose1091 uses only decoded interval/sound/draw/wait/end commands and channel1, so the slot0 exception applies to that supported program. Its earliest restart boundary is600ms; the imported1029 WAV lasts about604.2ms. The current unconditional audio wait can defer restart by another update. This is a source-rule counterexample to the existing helper's broad waiting rule; native jitter is still unknown.

Rollover cleanup has an independent policy. Word12=0 permits ordinary leave/tracking cancellation; nonzero skips it, while forced reason3 still destroys the actor (`0x0007070c`–`0x00070729`). Firehose word12=294 is such an exception. The shared checkout's newer rollover code handles that exception; do not regress it while unifying audio. General owner cleanup should execute only when the controller actually destroys/replaces the owner.

Paper currently keeps tracking sound1006 in a separate `pressAudio` set across quick release/open, then cancels it on close/dispose. The opening path clears the auxiliary configuration through `0x0006ff10` at `0x000543d5`, then calls `0x00030a44(false)` at `0x000543ea`. This reaches `0x00072636`, which forces auxiliary cleanup reason3 (`0x00072643`–`0x0007264b`) and disables hit handling; this path alone does **not** stop the backing state actor. The generic state replacement chain would stop a replaced state's owner, so release-state drawing and its ordering against the custom opening callback still need tracing before deciding whether that particular tracking cue should survive. **Its current survival is an adaptation, not verified native behavior.** Do not confuse this hit-disable path with the separate `0x00030a80` hide/stop path, which does call `0x00159280` and owner cleanup. Do not use a global UI sound stop to resolve the remaining uncertainty.

## Preferences, gain, and native loading

The installer `UserDefaults.plist` has `Tool Sounds=1`, `Play Added Music Or Sounds=1`, `Play Sounds During Slide Show=1`, and separate speech keys. `GlobalDefaults.plist` contains first-launch/login defaults, not a global sound-mute switch. The supplied [user guide](../../artifacts/research/user-guide.txt), printed pp75–76, explicitly assigns tool/tray sound effects to Drawing preferences and gives separate drawing-attached and Slide Show controls. It also describes separate speech controls. This supports per-category settings, not a single master flag standing in for all native preferences.

Binary confirmation: the `Tool Sounds` C string is at `0x0024a8c1`, its CFString at `0x00336590`. Dictionary loading at `0x0003f820`–`0x0003f869` converts value1 into settings word `+0x04`; writing at `0x0003fd4d`–`0x0003fd95` persists that value. Attached/Slide Show keys have separate CFStrings `0x003365c0`/`0x003365d0` and paths at `0x0003f8ef`–`0x0003f96b`. The final link from the tool setting to every audio caller, and whether turning it off terminates already playing sounds, remains untraced.

Do not call engine-global `+0x60` “Tool Sounds”: it gates allocator/interpreter entry but is initialized1 by engine setup (`0x00158378`), and its preference mapping has not been established. Likewise global `+0x4a` gates the entire update (`0x0015760e`) and sound dispatch (`0x00153802`); that alone is not proof of an audio mute field.

The original has lazy/reuse paths, not evidence here of a fully decoded startup UI bank. Dispatcher loader `0x00152d85` resolves resources only when needed: at `0x00153009`–`0x00153069` it checks the existing resource reference, then calls `0x00153f92` for missing data. It reuses an existing playback object when present (`0x001530bd`, `0x0015319f`), selects a different construction path for resources at least`0x6000` bytes (`0x001530c9`–`0x0015319d`), and starts through the queued dispatcher. This does not establish disk-cache warmth, eager preload coverage, codec cost, or audible latency on the original machine. CFG file-set registration is not proof of pre-decoding: [KPD3.cfg](../../artifacts/research/KPD3.cfg) `[Easel]` lists Easel/Tp/Buttons/WackyBrushSounds/Misc/Eraser archives, while its later sound tables define tool-specific start/stop/loop IDs and lifetime parameters. Do not apply those drawing-tool tables universally to UI button cues.

In the current web export,33 Easel WAVs occupy1,220,122 bytes total. Those are imported-file measurements, not a source startup preload list. `pcm_sound` writes16-bit decoded WAV data. Measuring these headers found1006≈315.3ms,1008≈2.9431s,1029≈604.2ms. The small total makes preparing the UI bank a reasonable browser implementation choice; it does not prove native preload parity or justify fetching the whole media library.

## Integration contract

This is a proposed boundary for the runtime owner to implement, not a helper created by this audit. Keep asset preparation, playback allocation, and animation lifetime separate within one UI-audio service:

| API/record | Required behavior |
| --- | --- |
| `prepare(cues)` | Deduplicate by resolved resource identity; fetch/decode and cache assets without starting playback. Return per-resource readiness/failure; permit retry. Start with current Easel cues, then selected tray assets, not every library track. |
| `activateFromGesture()` | Request audio-context activation directly from a real existing pointer/keyboard action; observe success/state. Do not wait behind image/network work before requesting it. A blocked context must not hold animation completion forever. |
| `createOwner({kind, flags})` | Return a unique live-instance token with a fresh completion-slot array and generation. Separate button state, auxiliary rollover, Undo Guy, and paper opening actors. Do not expose wildcard owner0 to ordinary callers. |
| `owner.cue({bank, sound, channel, tick})` | Retain resource ID, completion slot, owner, generation and raw replacement group; allocate using the rules above. Return a handle/status even for blocked, failed or canceled requests. Enqueue same-update cues in authored order; dispatch them together rather than inventing a `pause` per cue. |
| `owner.replaceScript(script, flags)` | Cancel that owner's groups when the native state player actually replaces its program. Skip replacement on proven same-script continuity; script ID alone is not owner identity. |
| `owner.completion(slot)` | Model the native nonzero completion marker and separate slot0 loop condition. Do not implement completion as “all Audio objects in a Set ended.” Apply finite/repeat/ignore-completion flags in the timeline controller. |
| `owner.dispose(reason)` | Invalidate pending asynchronous work and stop only this owner's groups; settle each detached completion reference once. No old load, `ended`, error or rejection callback may affect its replacement generation. |
| `setToolSoundsEnabled(enabled)` | Gate UI/tool-category playback while leaving picture music, narration, Slide Show music and speech under their own settings. Proposed browser policy: cancel active UI owners' playback on disable and settle waits; do not replay suppressed cues on enable. Mark this mid-playback policy as an adaptation pending native verification. |

Use an explicit resource namespace alongside IDs when resolving archives; the native search is by original resource ID within its registered engine context, not by a basename/DOM control. Do not silently replace a different cue merely because two files share a URL fallback. Preserve sharing when two live actors truly reference the same original registered resource.

Prepared `AudioBuffer`s with fresh source nodes per playback are a suitable implementation choice: the [Web Audio specification](https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-decodeaudiodata) separates decoding from playback and defines scheduled sources/`ended`. A buffer source is single-use; cache buffers, not already-started sources. Context activation can remain blocked pending user activation; check state and handle blocked playback as a settled browser outcome. [Chromium's autoplay guidance](https://www.chromium.org/audio-video/autoplay/) recommends resuming from a real gesture. No silent-buffer unlock, muted-play workaround, synthetic click, policy-disabling launch flag, or repeated resume polling is needed. A hover before permission may animate silently; do not replay that expired hover when the user later clicks. This is a browser constraint, not recovered native behavior.

If retaining `HTMLAudioElement` initially, centralize ownership/resource replacement anyway and return a handle with completion/rejection status. `main.js` currently passes a callback that returns `undefined` to `createNativeAnimation`; the controller's newer optional ownership support therefore cannot work at this integration point. Its existing `ended`/`error` listeners also need a play-rejection completion path. A returned `Audio` object whose `.play()` was rejected may never emit the event the timeline is waiting for.

Adapters should remove generic action cues only as the corresponding source state cue is wired, so controls do not become silent during migration or play twice. Keep library previews, picture tracks, microphone input, narration and Slide Show players out of ordinary UI-owner cleanup. Whether drawing particles ultimately share the same16-slot source engine should be integrated with the painting owner separately; this audit does not change their lifetime or claim exact mixed-tool pool saturation parity.

Use one timeline epoch for image events and source cue ticks after assets are prepared. While cold-loading, keep controls usable and prevent stale events from sounding after leave/cancel. If a required cue is unavailable at its deadline, explicitly settle/drop it and record the outcome; do not build a backlog that later plays over a different state. This responsiveness policy is an adaptation until native cold-load timing can be measured. Readiness and audible permission are distinct states.

## Prioritized validation and actual results

**P0 ownership/allocation tests:** two distinct owners/resources overlap; cancelA leavesB playing; replacingA stops both ofA's raw groups; restarting the same script via the continuity path does not replay its cue; repeating a resource fromB settles/replaces its oldA playback;0/2 share a raw group while1 uses the other; pending same-update commands retain source order; pool exhaustion never steals an arbitrary active slot. Keep a separate fixture for raw tag2 rather than making its exception the normal UI rule.

**P0 completion/error tests:** finite playback holds the final frame until slots1/2 settle on a subsequent source update; ignore-completion flag bypasses that wait; repeating slot0=0 restarts even while1 is pending; repeating slot0≠0 waits for1/2; canceled/replaced/failed/blocked audio settles once; late rejection/`ended` from an old generation cannot clear the replacement. Include real Firehose1091 data to catch the unconditional-wait bug.

**P1 actual control tests:** assert cue identity/tick/owner on Backgrounds press, drag out/in, release inside/outside, latch and group switch; assert no sound on its silent ordinary hover. Undo1095 cue begins at tick1. Firehose follows its source leave exception and forced cleanup. Paper emits1006 once on tracking and no cue for1055; preserve its documented press-lifetime uncertainty until the custom disable path is proved. Concurrent picture/narration/preview playback survives unrelated UI cancellation and the tool-sounds toggle.

**P1 loading/permission tests:** intercept/delay a cue's network response and decode, then leave/reenter/dispose; canceled cues never arrive late. Warm preparation causes no new asset request at cue time. Use a fresh normal browser profile with default autoplay policy: before activation, silent animation completes without a stuck owner; after a real click/keyboard action, supported audio can run. Exercise rejected `play()`/suspended context, missing/corrupt files, retry, mute during a pending load, and rapid tool changes. Fake audio callbacks verify lifecycle logic only; they do not establish audible onset. Browser tests need an assigned isolated port/config/output under `artifacts/t3`; no browser port was assigned or started for this audit.

**P2 empirical native verification:** record first hover before any click, press/release/drag-out, fast switching while Undo Guy speaks, paper quick release/open, same-resource retriggering, tool-sounds toggle during a long cue, cold/warm starts, and saturated moving-paint/UI overlap. Capture both audio and pointer/frame timing. A compatible original runtime is required; WebAudio scheduling precision alone cannot certify native feel.

Actual checks run here:

- Direct installer extraction/resource decoding and byte comparisons listed above: passed. Executable hash matches the existing investigation. No original execution occurred.
- Imported UI WAV inventory/header reads:33 files,1,220,122 bytes; durations above read successfully.
- `node --test scripts/parity/rollovers.test.mjs scripts/parity/animation.test.mjs`: **12 passed,0 failed** against the concurrently updated working tree. These are existing timing/policy checks, not the proposed ownership/preload tests. In particular, the existing rollover test's unconditional channel1/2 wait expectation is not proof of the native repeat branch.
- No browser test, listening test, production request, full regression suite, build, deployment, or performance measurement was run. No new runtime helper or speculative executable test was added.

Remaining source limits: reserved owner2 callers; tool preference propagation and mid-playback semantics; initial state-cue suppression; paper's precise tracking-owner lifetime through custom opening; mixed drawing/UI pool behavior; actual native cold-load/start latency and output gain. Preserve these limits in any implementation or release claim.
