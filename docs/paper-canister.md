# Native paper canister and picker

The supplied Easel archive contains the complete ordinary paper-canister motion. The browser previously revealed its static page immediately. The implementation now recovers the opening program, selected page/texture substitution and persistent closed canister from the i386 executable and `Data/Easel.MHK`. A native recording is still needed to compare actual event-loop latency and subjective feel.

## Source dispatch

`RTexturePicker` is identified by RTTI at `0x0031dbb0` and its vtable at `0x0031db38`. Easel opens it at `0x00054358`–`0x0005443a`, disables the ordinary paper control and invokes begin `0x0008ec16` with the current selected texture ordinal. Begin creates **script1055** using flags `0x800031` at `0x0008ed60`–`0x0008ed7f`. These flags request finite playback. It installs draw callback `0x0008e89c` and completion callback `0x0008eb3a`.

The callback performs important substitutions after the interpreter resolves source registration:

- Animation image parts begin at `+0xde` and consist of `(int16 imageID, int16 x, int16 y)` records. Renderer `0x00158ef9`–`0x00158f5c` walks those records.
- `0x0008e89c` copies picker `+0x7a` to the **first** image ID `+0xde`, and picker `+0x78` to the **third** image ID `+0xea`. The middle roller frame and all resolved positions remain unchanged.
- Begin obtains the selected canister bitmap via vector lookup `0x0008f11e`. The vector comes from the single image group in **script1119**, whose21 entries are sprites218–238.
- Begin divides the selected ordinal by7 and obtains its page from the script1122 lookup at `0x0008ec83`–`0x0008ecb7`. The first three entries are page sprites242,243,244. The fourth entry67 is a canister part, not another page.

Scripts1119–1122 are lookup data; treating the images in their single draw group as an animation would be incorrect. Script1055 uses placeholder201 to establish page placement and217 to establish canister placement. Their registration must be resolved **before** replacing their image IDs.

## Timing and clipping

Script1055 uses a100ms interval and six draw groups. Its page positions are:

| Start time | Page top-left | Roller sprite |
| --- | --- | --- |
| 0ms | (799,540) | 68 |
| 100ms | (718,540) | 69 |
| 200ms | (637,540) | 70 |
| 300ms | (556,540) | 68 |
| 400ms | (475,540) | 69 |
| 500ms | (394,540) | 70 |

Times in this table are nominal earliest updates. The actor flags omit the sign bit tested at `0x0015a2de`; the applicable `0x0015a2ed` branch schedules the next update from current framework time plus the interval. A delayed callback therefore advances one group and schedules the next 100ms hold, preserving intermediate poses and the terminal dwell. The web adapter follows that delivered-update policy rather than skipping to an elapsed-time frame.

The roller stays at `(883,524)` and the selected textured cylinder at `(883,533)`. The final image is held until the next scheduled end check at600ms. There is no embedded sound in script1055. Source interval units, terminal waits and next-update completion semantics are established in [button-animation.md](button-animation.md).

The opening actor sets `+0xc0=1` at `0x0008ed92`, enabling clipping through its `+0xb8` rectangle at `0x00158e79`–`0x00158ec3`. Constructor `0x001586bb`–`0x0015870f` initializes this from the zero rectangle reached through import pointer `0x00351270` → BSS `0x0034a640`. First-load flag `+0x56=1` is set at `0x00158783`; loading `0x0015a07c`–`0x0015a0ac` byte-swaps the script header rectangle and unions it into the initially empty clip. The union routine is `0x001e69cb`. This produces the source clip `(394,499,539,134)`, preventing the entering page from extending beyond the canister at x933.

Completion callback `0x0008eb3a` creates the live picker through `0x0008e912` and clears the animation's completion callback. It does **not** immediately destroy the opening actor; its owner retains the actor at `+0x50`, destroying it later at `0x0008ee2c`–`0x0008ee41`. The final opening pose therefore remains under the live picker. The browser already uses the complete page bitmap for its live popup, so its adapter removes only the duplicated page part at completion, preserving final roller70 and the selected cylinder. This avoids drawing translucent page edges twice.

## Closed, tracking and rollover art

Easel's paper button has state scripts1052/1053 and auxiliary rollover1054 in MBTN75. Source setup `0x000575da`–`0x00057615` installs custom draw callback `0x00053fb6` on this button. That callback reads the current selected ordinal at owner `+0xdc`, resolves the selected canister image through its lookup vector and substitutes the **second** image ID at animation `+0xe4`.

The callback also applies to auxiliary rollovers: `0x000316b6` propagates the callback with its final flag1 through `0x000722b2`; rollover creation installs the stored callback at `0x0007243f`–`0x00072460`. Thus static, tracking and rollover must all retain the selected textured canister. A fixed source217 canister would discard that selection when an ordinary hover starts.

Script1053 supplies cue6 on channel1, corresponding to Easel sound1006. The browser emits this cue synchronously on entry to tracking, preserving real pointer activation even if a first-use image decode is pending. The owned press sound survives a quick pointerup and is cleaned up on close/dispose. Exact native sound lifetime across state-script replacement remains unverified. Script1054 repeats the three authored roller groups at100ms and cancels on pointer leave according to MBTN word11/12; no reverse motion is inferred.

## Closing and integration

Pointer handler `0x0008e57e` tests the point against the popup rectangle. An outside point synchronously dispatches close event `0xd80` at `0x0008e5ac`–`0x0008e5e3`, then returns0; inside delegates to the live picker and returns1. Escape dispatches the same close event at `0x0008e74e`–`0x0008e78b`. Whether the outer native window redispatches that same outside click has not been established; the web application's pass-through policy is an explicit adaptation. No authored closing/reverse timeline has been found, so close cancels the opening and restores the closed selected canister immediately.

[scripts/native-paper.py](../scripts/native-paper.py) exports the six-frame source template, three state templates, lookup tables and unique sprite parts. [src/native-paper.js](../src/native-paper.js) exposes:

```js
createNativePaperPicker({
  manifest: nativeUi.paperAnimations, control, layer, staticSprite,
  onReady, onError,
}) // → {open(selectedId, onReadyOverride), close(), setSelected(id), dispose(), state}
```

IDs are original paper IDs12300–12320. `control.dataset.paperState` is `closed`, `loading`, `opening` or `open`. `data-paper-ready` indicates the first canister art has decoded. The canvas records its script, frame and selected paper. The helper owns closed canister pointer states and opening art; callers exclude paper from old fixed-sprite/rollover bindings, reveal live controls only onReady, handle Escape/outside dismissal, update live page arrows directly, then call setSelected/close after selection. Opening again derives its page from the selected paper, as native begin does.

The native canvas uses z-index4 so the entering page crosses above the artwork/foreground and below the palette/menus. Source placement alone would be insufficient if that canvas were painted behind the opaque drawing canvas.

## Indexed images and scope

The canister sprites218–238 are indexed8-bit images, not grayscale RGB. The Easel bank has24 such sprites:200–202 and218–238. Existing UI imports reject this encoding rather than silently decoding it incorrectly; the previously exported direct-color UI images are unaffected. Standalone Easel bitmaps7002/7003 also use flags2 but are outside this workflow.

The exporter now decodes the archive's authored palette rather than interpreting indices as grayscale. [ScummVM's Mohawk GraphicsManager::setPalette](https://github.com/scummvm/scummvm/blob/master/engines/mohawk/graphics.cpp#L103) independently establishes the tPAL format: big-endian start index/count, followed by RGBx entries. Easel tPAL1000 therefore installs254 entries beginning at1. Its animation blitter skips index0. Reserved index255 is black in both Apple's standard8-bit color and inverse-grayscale CLUTs, verified locally through the QD framework's GetCTable(8) and GetCTable(40). The canister sprites never use index1, so their only white/transparent boundary is index0; index255 is used for black detail. The PNG exports preserve source dimensions, every declared palette RGB value and zero-index transparency.

There remains a narrower **native Mac port palette uncertainty**. Source fallback drawing uses the active port palette (`0x001d1f04`–`0x001d1f1d`); internal draw mode8 maps through table `0x0026142c` to QuickDraw mode36, with white background (`0x001d21c5`–`0x001d21dc`) and CopyBits at `0x001d25b1`. Offscreen creation `0x001ce120` passes a null color table into QTNewGWorld at `0x001ce2af` or QTNewGWorldFromPtr at `0x001ce20f`. No archive tPAL installation into that Mac port has yet been established. Source tPAL is grayscale but differs from standard Mac color CLUT8 and from inverse-grayscale CLUT40 (it omits shades169 and83). Thus these assets recover the provided archive colors; they do not prove which palette the running Mac application displays. This distinction is preserved in manifest field `palette.nativeMacPortStatus`.

Ignored research files under `artifacts/research/native-paper-indexed/` retain the raw palette,21 original indexed bitmap payloads, header metadata and actual host Apple CLUT8/40 dumps for further analysis. The initially incorrect grayscale renderings are confined there and are not published. No unrelated indexed UI media was regenerated.

Focused checks:

```sh
PYTHONPATH=scripts python3 -m unittest scripts/test_native_paper.py
node --test scripts/parity/native-paper.test.mjs
```

These verify registration before substitution, all authored page steps and holds, clipping, selected page/cylinder mapping, finite completion, cancellation during load/playback, stale asynchronous work, quick press cues, retry after failed image loads and persistent resting selection. Actual browser tests must also check the composed studio pixels, not only the helper canvas in isolation.
