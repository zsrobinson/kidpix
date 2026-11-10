# Drawing-tool control motion

Recovered from the supplied trial installer on `/Volumes/Kid Pix Deluxe 3D`, specifically `Data/Tools/Tp.MHK` and the i386 slice of [kidpix-original](../../artifacts/research/kidpix-original). **The original application has not run here.** This is resource and binary evidence, with extraction and standalone runtime tests; it is not a native visual or audio comparison. The standalone extraction is now integrated into the web studio as described below; the shared UI importer and `ui.json` remain unchanged.

## Reproduce and identify the evidence

```sh
python3 scripts/native-drawing-motion.py
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_drawing_motion.py'
node --test scripts/parity/drawing-motion.test.mjs
```

The extractor reads the installer through `import-ui.app_resources` and parses the archive with `mohawk`. Default output is confined to `public/original/ui/drawing-motion/`: one standalone `manifest.json`, 146 ordinary PNG views, 146 raw `.argb` channel arrays and 12 decoded PCM WAVs. The PNG view of a mode9 data part is **not** its runtime rendering. The raw files are necessary: ordinary PNG decoding/unpremultiplication would change encoded blend parameters. The generated directory is about7.5MB and is ignored media; parent publication/sync is separate.

The binary SHA-256 is `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`, matching [reverse-engineering.md](../reverse-engineering.md). Addresses below are i386 virtual addresses in [disassembly-i386.txt](../../artifacts/research/disassembly-i386.txt). The manifest retains per-program SHA-256, raw sprite-channel SHA-256, source sound SHA-256, registrations, source image flags, source cue offsets and original table words. Tests compare all146 generated raw assets with those hashes.

## Owner and dispatch

The drawing owner loads **MBTN18400**, rather than deriving roles from the18060-series numbering. Its startup at `0x000f33ae–0x000f3445` calls virtual slot+`0x48` with18400. Vtable`0x0031f4a0+0x48` resolves to`0x000f72f8`. That loader calls`0x000745a0`, then installs callback`0x000f73b4` for the inclusive row range returned by slots+`0x6c`/`0x70`: `0x000f2c84` returns0 and`0x000f2c8c` returns3. Installation is at`0x000f732e–0x000f7396`, using`0x000316b6` for the backing **and auxiliary** actor and`0x0003165e` for callback data. Auxiliary setup copies the callback at`0x0007243f–0x0007246b`.

The four table rows have command18400, group18400, mode2, and command argument0/1/2/3 (word8). The handler at`0x000f3578–0x000f35aa` stores that argument and maps it to tool ID99+argument. The familiar Pencil/Chalk/Crayon/Marker positions are corroborated by the original [user guide](../../artifacts/research/user-guide.txt), “Using Drawing Tools,” printed page15. The documentation's figure labels and existing extraction positions support these labels; no selected/pressed meaning is inferred from sprite ordering.

| Control | State slots0 /1 /2 /3 | Auxiliary hover | Groups0 /1 /hover | Earliest end0 /1 /hover |
| --- | --- | --- | --- | --- |
| Pencil |18060 /18061 /0 /18061 |18062 |11 /11 /6 |1100 /1100 /600ms |
| Chalk |18063 /18064 /0 /18064 |18065 |16 /16 /6 |1600 /1600 /600ms |
| Crayon |18066 /18067 /0 /18067 |18068 |16 /16 /6 |1600 /1600 /600ms |
| Marker |18069 /18070 /0 /18070 |18071 |14 /14 /5 |1400 /1400 /500ms |

Every program declares100ms. Its final group appears one interval before its earliest end check. The final wait immediately preceding end does not yield. Sound-channel completion can postpone the end check's effect. All four hover parameter triplets are`[0,0,0]`: **finite playback and cancellation on leave**, unlike Easel's repeating hover programs.

The shared state dispatch at`0x00030ce0–0x00030e9b` establishes the following specifically for these mode2 controls (slot2 absent, slot3 present; mode selection at`0x00031155–0x00031177`):

| Internal event | State and effect |
| --- | --- |
|`0x2000`, `0x2005` | State1: pointer-inside tracking/press. |
|`0x2001`, `0x2003`, `0x2004`, `0x2008` | State0. Mode2 has no mode1 latch to restore to state2. |
|`0x2002`, `0x2006` | State3; disables that control; group event resets peers to state0. |
|`0x2007` | State3 and disables that control, without the group event. Used for initial/restored selection. |

Saved/default selected row is dispatched with`0x2007` at`0x000f2f80–0x000f2fd2`; default row0 is written at`0x000f2ef6`. State3 is therefore established selection behavior, not a guessed fourth sprite. Already-selected controls do not accept ordinary pointer hover/press because the native control is disabled. The owner should still render this as a selected choice in browser accessibility semantics, rather than making the whole tool group unavailable.

Tracking hit changes send`0x2000`/`0x2001` at`0x000701be–0x000702d9`. Native Draw preserves running progress when different state labels share a script (`0x00030b25–0x00030b47`). In particular, **release-inside1→3 must not restart the selection animation or cue**. Group-peer reset is`0x000700f0–0x00070148`. Source mode2 state does not toggle off on another click.

Backing actors are created with flags`0xC08000` at`0x000746ef–0x0007471c`. Auxiliary actors use the finite base flags`0x800031`, optionally combined with rendering flag`0x800` (`0x0007238f–0x000723fe`). End handling is the shared interpreter at`0x0015a304–0x0015a3a1`; see [button-animation.md](../button-animation.md). The helper retains final state artwork and restores the underlying actor after finite auxiliary completion. This is supported by the backing pointer installed at`0x000f7388–0x000f7396` and completion restoration at`0x000700b2–0x000700e4`.

Auxiliary setup hides the backing at`0x00072519–0x00072536` via`0x00159280`. That helper immediately calls owned-sound cleanup`0x00152aee` (`0x00159289–0x00159293`). Therefore starting hover stops the backing actor's cue as well as hiding its picture. Leave cancels the auxiliary and restores backing visibility through`0x0007067c`; it does not restart the old backing program. Unhide`0x001591c2–0x00159274` does not alter the scheduled deadline, so resumed backing may be due on the next delivered update. No unrelated peer sound is stopped by that local leave operation. These details are tested separately from page/window cancellation, which deliberately cancels all sounds owned by this controller as a browser lifecycle adaptation.

## Complete registered compositions and color callback

Each of these12 programs has exactly two parts per frame in bank18000. The extractor retains the script origin, authored coordinates, one-based sprite ID and signed REGS18000/18001 offsets separately, then resolves:

```text
part.x = origin.x + authored.x - registration.x
part.y = origin.y + authored.y - registration.y
```

The interpreter masks image IDs with`0x0fff` at`0x0015a445–0x0015a456`. Registration subtraction is independently established at`0x00158b4e–0x00158bcd`; all referenced flags here are`0x8000`. The exporter rejects any changed flags or additional parts instead of assigning speculative behavior. The drawing control unions are Pencil`[132,635,95,120]`, Chalk`[183,621,97,143]`, Crayon`[246,649,93,108]`, Marker`[306,640,76,122]` in native1024×768 coordinates. The separately exported MRGNs1184/2184/3184/4184 are109px-tall rectangles53px wide, beginning at x160/217/274/331 and y648. **Do not replace hit geometry with sprite bounds or alpha silhouettes.**

For these kind2 controls, the MRGN bounds are also the independently traced **auxiliary clip rectangle**. `0x00030fb6–0x00030fb9` places the region pointer in constructor data+4; `0x00072c40–0x00072c43` stores it at control+`0x134`. Constructor wrapper`0x00072dea` then copies that region's header bounds (offsets4/6/8/10) into control+`0x138`/`0x13a`/`0x13c`/`0x13e` (`0x00072e0f–0x00072e46`). Auxiliary setup copies those bounds into animation+`0xb8` through+`0xbe` and enables clipping (`0x000724b4–0x000724ec`). The runtime exports this as `snapshotItem.clipRect` only for auxiliary frames; state-frame snapshots use null. The entire source sprite rectangle must still be retained for registered placement and state animations.

Callback`0x000f73b4–0x000f7650` does not substitute selected-color image IDs:

1. Save second-part ID at actor+`0xe4`, temporarily zero it, and call ordinary rendering`0x00158e1f` (`0x000f73d5–0x000f73f6`). That draws **part0** with normal bitmap alpha.
2. Resolve the second-part payload and the first-part dimensions (`0x000f740a–0x000f7448`). Allocate a32-bit temporary destination with width/height equal to the minimum of the two part dimensions, copying the current destination at the **first-part registered origin** (`0x000f7448–0x000f7502`).
3. Draw the **second part** through`0x00149565` with mode9 and current color from`0x003510d0` (`0x000f7507–0x000f758a`). Its local offset is max(second origin−first origin,0) per axis. The ordinary allocation path clips it to the copied temporary rectangle. Copy the result back, restore the second-part ID (`0x000f758f–0x000f7636`). The allocation-failure branch directly draws mode9 (`0x000f75dc–0x000f762b`); reproducing native allocation failure is not a browser requirement.

Mode9 dispatch is`0x00149571–0x00149596` →`0x00149a02–0x00149a2c` →`0x001ca702`. Its input is **raw source ARGB bytes**, interpreted as`[ignored, shade, tintWeight, coverage]`. Green-key bytes`[255,0,255,0]` have zero coverage. Ordinary image unpremultiplication or removing green and hue-rotating the image loses this encoding.

The source multiplies the current RGB color by the float at`0x002603a0` (bytes`81 80 80 3b`, float32 reciprocal255), then computes each destination channel with SSE single-precision operations in this order (`0x001ca7cd–0x001ca806`, `0x001ca94d–0x001caa39`):

```text
paint = float32(colorByte * reciprocal255)
target = float32(float32(paint * tintWeight) + shade)
alpha = float32(coverage * reciprocal255)
result = truncate(float32(float32(float32(target - destinationByte) * alpha) + destinationByte))
write min(255, result); preserve destination alpha
```

`blendDrawingMode9` implements those operations without Canvas global-alpha quantization. It ignores the source's first byte exactly as the native routine does. For example, raw`[0,4,176,255]` over RGB`[100,120,140]` with selected color`[0,128,255]` yields`[4,92,180]`, retaining destination alpha. There are no new palette-installation claims: all these referenced sprites are direct32-bit source payloads, unlike the separately investigated indexed paper assets.

## Sounds

The following are actual tWAV resource IDs, not a shared click effect. All declared script channels are1. Source timing is preserved in the manifest; WAV duration, rate, sample count and source hash are included on export.

| Tool | State0 sound@tick | State1/3 sound@tick | Hover sound@tick |
| --- | --- | --- | --- |
| Pencil |18004@2 |18005@1 |18006@0 |
| Chalk |18007@5 |18008@0 |18009@1 |
| Crayon |18010@0 |18011@0 |18012@0 |
| Marker |18013@2 |18014@0 |18015@0 |

Sound ownership matters on replacing scripts, hiding backing, cancelling hover, switching peers and disposing the tray. `playSound` must return a handle with`stop()` and`isComplete()`; completion/error/autoplay rejection must mark it complete. The helper replaces only its own previous sound on the same declared channel, gates program completion on channels1/2, and stops its own handles. Parent audio infrastructure remains responsible for native global channel arbitration; no hardware-channel contention has been verified here.

## Parent integration API

Exports from [native-drawing-motion.js](../../src/native-drawing-motion.js):

- `loadDrawingMotionAssets(manifest, {resolve, fetch, createImage, signal})`: load/decode all assets before creating actors; returns Map keyed by string sprite ID with `{image,argb}`. A failure rejects without a persistent failed cache; call again to retry. `resolve(path)` receives paths relative to`public/original/ui`, including`drawing-motion/`.
- `createDrawingMotionController(manifest, {render,playSound,now,selected})`: synchronous state/timing engine. Default selected row0; `null` suppresses initial restoration. `render(snapshot)` receives all four current frames, scripts, tick/frame index, state, disabled/auxiliary/finished flags and auxiliary `clipRect`. No internal timers, fetches or DOM listeners.
- Controller: `step(now)`, `enter(index,now)`, `leave(index,now)`, `press(index,now)`, `release(inside,now)`, `dispatch(index,event,now)`, `cancel(now)`, `repaint()`, `snapshot()`, `dispose()`. `release` returns the source command argument on activation, otherwise null. For authoritative external selection, dispatch`0x2006`, which resets peers;`0x2007` is the source restore event without peer reset.
- `paintDrawingMotionFrame(context,manifest,frame,assets,[r,g,b],{clipRect})`: draw registered part0 normally, then apply raw mode9 to part1 using the recovered temporary destination intersection. Pass `item.clipRect` from the snapshot; it clips ordinary bitmap drawing. The custom mode9 temporary copy follows after ordinary target-clip restoration; see [hover geometry correction](ipad-tool-hover-geometry.md). Context must address native1024×768 coordinates. The parent must restore the backdrop before every composite, and paint all four actors from the supplied snapshot.
- `blendDrawingMode9(...)`, `drawingFrameAtTick(...)`: low-level byte blend and frame lookup for independent renderer integration/testing.

Minimal setup, with the app's existing original-media URL helper:

```js
const response = await fetch(original('ui/drawing-motion/manifest.json'));
if (!response.ok) throw new Error('Drawing motion manifest unavailable');
const manifest = await response.json();
const assets = await loadDrawingMotionAssets(manifest, {
  resolve: path => original(`ui/${path}`),
});
const actor = createDrawingMotionController(manifest, {
  selected: ['pencil', 'chalk', 'crayon', 'marker'].indexOf(state.tools.draw),
  playSound: createOwnedSoundHandle,
  render(snapshot) {
    restoreTrayBackdrop(context);
    for (const item of snapshot) {
      paintDrawingMotionFrame(context, manifest, item.frame, assets, selectedRGB,
        { clipRect: item.clipRect });
    }
  },
});
// Existing RAF owner calls actor.step(timestamp). Repaint after a color change.
// Wire actual source-region hit results into pointer helpers; dispose on teardown.
```

The parent must remove the existing static drawingTools actors and CSS color filter when installing this helper; retain the tray backdrop and unrelated options. Keep this controller alive across color/style changes: rebuilding `renderNativeDrawing` on every state render would restart programs and sounds. Update selected color then call`repaint`; update external tool selection through`dispatch`. Handle asset failures before hiding the current usable UI. On pointer cancellation, lost capture, window blur, pagehide and teardown, cancel/dispose appropriately. Pointer capture release-inside must use the recovered hit-region union, not DOM pointerenter alone. Preserve keyboard activation through the same command/state path and selected accessibility attributes.

`render` owns whole-frame restoration because translucent source parts and destination-dependent mode9 cannot be repeatedly painted onto their previous frame. It also owns placement above the studio's opaque canvas/foreground. The helper exports header bounds, full part bounds, MRGN bounds and the traced auxiliary clip separately. Canvas `putImageData` ignores Canvas clip paths, and the custom source callback copies its temporary after ordinary clip restoration, so mode9 read/write bounds retain the source temporary and canvas limits without reapplying the auxiliary clip rectangle. The parent should use an identity-transform native-resolution canvas with default source-over/globalAlpha1 for these actors; CSS can scale the whole canvas afterward. Integrating with an additional transformed or clipped context requires corresponding pixel-coordinate handling.

Timing uses one source update per eligible delivered`step`, then schedules the next deadline at delivered time+interval (scheduler`0x0015a2ed–0x0015a302`). A late RAF therefore advances once instead of replaying a burst of missed frames/cues. Browser initial frame delivery and pointer event ordering remain adaptations pending a native recording.

## Actual checks and remaining limits

Seven focused Python tests pass, including mounted-DMG table/regions, all12 full counts and sound ticks, registration, strict rejection of changed mode/unknown opcode, raw compression/stride and complete isolated export. Fourteen Node tests pass, covering raw mode9, highlight clamping/alpha, source final groups, selected-disabled behavior, press/drag-out/reentry/release, shared1→3 progress, finite hover, backing deadline restoration, sound gating/ownership, cancellation/disposal, delayed updates, callback clipping, explicit auxiliary clipping and loading retry. The generated-manifest Node case plays **all12 actual programs** through every frame and verifies all146 raw sprite hashes. These are source-rule/helper tests, not actual-app or running-original parity tests.

The original standalone pass did not start a browser/server or build the app. Actual studio integration and its focused checks now follow below. Global native sound-channel arbitration still has not been verified. The ordinary base-image Canvas alpha path can differ from native Mac rounding and remains explicitly unverified; mode9 byte arithmetic is separately tested. Native timer jitter, audio latency, renderer color-space behavior and subjective feel require a running original. No claim of complete DMG-backed native fidelity follows from this standalone implementation.


## Studio integration status — 2026-11-09

The actual studio now uses the shared `ui/tool-motion/manifest.json` for Drawing,
Painting, Bucket, Mixer and Eraser primary controls. The source controller only
relaxes its four-control restriction to the recovered two/three/four-row mode2
groups; its delivered-update scheduler, state dispatch, end holds, sound gates,
auxiliary clipping and shared-script progress remain intact. Painting/Bucket
`renderMode:'mode9'` supports the source callback's ordinary one-part branch;
Mixer/Eraser `renderMode:'ordinary'` paints all registered parts without tint.
Drawing retains its exact raw mode9 callback and byte arithmetic.

[`native-tool-motion.js`](../../src/native-tool-motion.js) owns loading, the
native-resolution actor canvas, source hit unions, keyboard/pointer bindings and
owned audio. Each ready actor canvas exposes `data-native-tool-motion='<tray>'`
and `data-motion-snapshot` JSON containing exactly `name`, `script`, `frameIndex`,
`state`, `auxiliary` and `finished` per row. At most the current owner's canvas is
visible. Finite programs retain their final poses; source terminal wait updates
are preserved even when no new picture is authored.

The owner survives same-tray color, size, style, effect, alternate-mode and row
renders. Rebinding transfers active pointer capture before old controls disappear;
pointer release commits by row identity exactly once. Native command arguments
are retained by the source controller but are deliberately not used as unique row
keys: several recovered groups repeat the same argument on every row. Space held
across a rerender retains logical focus/progress and commits once on keyup. Enter,
Space and accessibility clicks share the same source selection path. Already
selected controls retain `aria-pressed` and reject ordinary hover/press replay.

Drawing keeps `drawingOptions` and removes its four old tinted static tool sprites
only after the motion assets decode. Other trays switch the visible page to its
matching source-authored clean backdrop only when both actors and that page are
ready. Every paint clears the old canvas and restores authored chrome/backdrop
pixels before compositing all actors, including translucent/raw mode9 parts.
The actor layer sits above the actual drawing surface and below the tray hit
controls; editable text and library drag code are untouched.

Actual owner changes dispose streams/audio, release capture, abort loading and
invalidate late completions. Failed first-use art leaves existing static choices
usable; subsequent updates or tray reentry retry. Window blur/page hiding cancel
tracking and owned cues. Future cues stay muted until a new control interaction;
no native global/hardware audio-channel equivalence is claimed.

The optional gzip bundle path validates compressed SHA-256, decompressed byte
length, byte ranges and decoded sprite dimensions, then uses blob-backed PNGs
and exact raw channel arrays. No bundle or unavailable `DecompressionStream`
uses the separate-file paths. A server that incorrectly HTTP-decodes `.gz` also
uses those paths. The exporter now writes opaque gzip payloads as `sprites.bin`,
which avoids Vite's automatic `.gz` Content-Encoding. Sounds remain source WAVs.

Focused verification at this stopping point:

- `node --test scripts/parity/drawing-motion.test.mjs scripts/parity/tool-motion.test.mjs`:
  **24 passed**, including all original source-controller tests and new group-size,
  ordinary/single-part composition, exact hit-union, gzip integrity/range,
  HTTP-decoded fallback, unsupported-decompression and cancellation/retry cases.
- `npx playwright test -c artifacts/t3/tool-motion-integration/playwright.config.mjs`:
  **15 passed** on isolated port **4191**. Actual-app checks cover every Drawing
  selection pose/end hold, source delivered-update timing, press/drag/reentry,
  shared release continuity, keyboard/held-Space behavior, live studio pixel
  composition, all five tray row identities and persistent rerenders, finite
  hover/blur, opaque cold loads, static failure fallback and delayed cancellation.
  The opaque cold-load case observes exactly five sprite-bundle requests and zero
  individual PNG/raw sprite requests when visiting all five groups.
- Config, Playwright results and the inspected studio screenshot are confined to
  `artifacts/t3/tool-motion-integration/`. No shared browser output was overwritten.

All five primary groups and the shared clean-backdrop/bundle contracts are wired;
no primary tray data is pending for this integration. Parent work remains media
publication, final full regression, release build and built/public verification.
This pass did not build `dist-cloudflare`, change package/config/version files,
commit, push or deploy. Native execution remains unavailable: browser controlled
clocks validate delivered source updates, not native timer jitter, audio latency,
Mac bitmap rounding/color-space behavior, or subjective motion feel.
