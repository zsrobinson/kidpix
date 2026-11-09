# Color Picker: source motion and interaction recovery

The ordinary Paint Zone palette has authored opening **and closing** motion. The correct archives are `Data/BigPicker.MHK` and `Data/LittlePicker.MHK`. `Data/Picker.MHK` has 290 scripts and is Slide Show; none of those programs is used by this helper. [KPD3.cfg](../../artifacts/research/KPD3.cfg) lines 33–46 explicitly distinguish `[ColorPicker]`, `[SmallPicker]`, and `[Picker]`. The [user guide](../../artifacts/research/user-guide.txt)'s printed pages 22–23 describes hover-to-open, selecting a color without immediately closing, leaving to dismiss, and Eye Dropper screen sampling.

This is resource and i386 binary evidence, plus browser verification of the new standalone helper. **The original application has not run here.** No native screenshot, recording, audio-latency or subjective-feel comparison has been made. The studio integration described below now uses this source helper; native runtime evidence remains absent.

## Primary evidence

- Installer on the mounted `/Volumes/Kid Pix Deluxe 3D`; extracted with existing `scripts/import-ui.py:app_resources()` and `mohawk()`. BigPicker has6 tSCR,4 tWAV,2 MRGN,2 REGS,1 tBMH,1 tBMP,1 tCNT,1 tPAL. LittlePicker has3 tSCR,2 REGS,2 tBMP,1 tBMH,1 tCNT,1 tPAL. These counts were read directly, not inferred from archive names.
- Executable `artifacts/research/kidpix-original`, SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. All addresses below are virtual addresses in its i386 slice; readable [disassembly](../../artifacts/research/disassembly-i386.txt) is saved locally.
- `RColorPicker`: RTTI name `0x24a770`, type info `0x31b7d0`, vtable `0x31b748`; constructor `0x3e2e0`. `RSmallColorPicker`: name `0x24b640`, type info `0x31d6c0`, vtable `0x31d638`; constructor `0x857d2`. SmallPicker's type info explicitly references the base ColorPicker type.
- Generated `public/original/ui/color-picker-motion/manifest.json` includes source resource SHA-256 values, dispatch addresses, exact rectangles, original bitmap-mask runs and all decoded timelines. This standalone manifest does not modify `ui.json`.

## Authored motion and dispatch

`RColorPicker` open `0x3dd74–0x3df10` guards owner `+0x84`, attaches the pointer handler, destroys a preceding actor and creates script**1500**, flags**0x4800031**, callback**0x3dd48**, owner stored at animation`+0xcc`. It enables source-rectangle clipping via animation`+0xc0`. Completion reason`-2` invokes `0x3dcf2` to create the live control manager and eyedropper button. Controls therefore become live at completion, not when the first pose appears.

| Program | Source role | Authored interval | One-based sprites | Cue |
| --- | --- | --- | --- | --- |
|1500|Opening|30ms|1,2,3,4,5,6,7|1501, channel1|
|1501|Closing|100ms|7,6,5,4,3,2,1|1500, channel1|
|1502|Geometry lookup|100ms declaration; one group|7 and12|none|
|1503|Eye Dropper rest|100ms declaration; one group|9|none|
|1504|Eye Dropper tracking|100ms declaration; one group|10|1502, channel1|
|1505|Eye Dropper auxiliary hover|100ms declaration; one group|11|none|

Opening placements are `(-78,559)`, `(-46,510)`, `(-7,470)`, then four poses at`(38,426)`. Closing reverses the corresponding sprite/placement pairs. Every opening/closing sprite is an authored307×307 image containing its own scale/shape; a CSS scale or sliding tween would not reproduce it. Their source clipping rectangle is`[-80,411,427,457]` (XYWH), additionally cropped by the scene viewport. All BigPicker REGS entries are0. Registration is still decoded rather than assumed, because LittlePicker's entries are nonzero.

`0x3ccf6–0x3cef4` starts closing by **replacing the current actor's program with1501**, callback`0x3c94e`, replacement flag1. It deletes the live eyedropper control and control manager immediately. Thus close is a complete source program starting at sprite7, even if opening was interrupted: there is no evidence for a smooth reversal starting at an arbitrary current pose. Close completion`0x3c94e–0x3c9de` resets`+0x84=0`, detaches actor ownership and reports event`0x44f2`. Open remains guarded until that completion. Repeated requests for the current script use the interpreter's unchanged-script path; the helper avoids restarting it.

The installed draw callback`0x3cce0` sets the **second image ID** at actor`+0xe4` to0 then calls the normal renderer. It does not recolor the palette, replace hues, or turn green pixels transparent. The two-part1502 program is used through `0x15b3ab` to recover geometry at`0x3d94d–0x3da99`; it is not an extra animated swatch layer.

## Timing and sound ownership

The script interval command sets milliseconds at`0x15a539–0x15a54d`. End checks happen on a subsequent update, after the last image/terminal-wait update, at`0x15a304–0x15a374`. The seven poses therefore have nominal script boundaries0,30,…180ms and an earliest opening end check at210ms; closing boundaries are0,100,…600ms with earliest end check700ms. These are authored scheduling boundaries, not a recording of native first-event or presentation latency.

**Sound completion is material:** flags0x4800031 include finite-playback0x800000 and do not bypass channel completion with0x100000. Completion therefore also waits for the owned sound channel. Exact source PCM durations:

| Resource | Use | PCM |
| --- | --- | --- |
|1501|Opening|13433 mono samples /22050Hz =609.206ms|
|1500|Closing|14262 mono samples /22050Hz =646.803ms|
|1502|Dropper tracking|3813 mono samples /22050Hz =172.925ms|
|31504 (Misc.MHK)|Changed color on mouse-down|1402 mono samples /22050Hz =63.583ms|

With sound starting at nominal0 and updates delivered every30ms, opening controls become live at630ms, not210ms. Native first-load/update phase, playback startup and actual event delivery can shift this; the helper gates on the returned sound's real completion event, not a hardcoded630ms delay. Closing normally finishes at700ms because its seven-pose timeline outlasts its cue. Sound-disabled playback can finish opening at210ms. Stalled browser updates deliver one pose at a time and schedule the next from actual delivery, consistent with the native non-catch-up `now+interval` branch`0x15a2ed–0x15a301`.

Script replacement cancels the preceding actor's owned sound (`0x159d70–0x159d7a` → `0x152aee`). The helper stops owned sounds on replacement, load cancellation and disposal. Cue31504 (`0x7b10`) is separately dispatched when a mouse-down samples a different color, at`0x3d4bf–0x3d537`; it includes pointer position and is not an animation-owned completion gate. A scan of all 41 installer MHK archives locates its exact primary resource at **Data/Misc.MHK tWAV31504**. It is exported as `misc-31504.wav`; `onSampleSound` reports its ID, relative audio path and position for independent playback. The scan inventory is saved under `artifacts/t3/color-picker-motion/cue31504-search.json`. BigPicker1503 exists as audio data but is not referenced by the recovered programs or these callers; it is deliberately not assigned a speculative role.

## Regions, sampling and color state

BigPicker MRGN1501 is this exact **retention union** in native LTRB coordinates:

- `[85,568,170,698]`
- `[40,658,125,748]`
- `[110,468,290,678]`

The separate live swatch rectangle is`[114,509,266,655]`, recovered from the second part of1502 (sprite12,152×146). It also retains the popup even over a masked gap. Pointer handlers`0x3d270–0x3d2c9` and`0x3d3ea–0x3d45a` test that rectangle, then the MRGN union; outside both starts closing. A rectangular307×307 CSS popup boundary is not equivalent. Eye Dropper uses MRGN1500`[119,462,164,507]`, with source rest/hover/tracking art placed at`(118,461)`.

The swatch hit bitmap is tBMP1500,152×146,stride152,indexed flags2. It contains only0 and255, with8939 black/accepted pixels. `0x3cf00–0x3d0db` checks the bitmap through `0x1d5890` against black`0xff000000`, with point-in-rect helper`0x3c780`. The latter excludes the top/left edges as well as the right/bottom boundaries. The original search **does not test the center**: it checks radii1,2,3 in this order (jump table`0x25d770`): right,left,down,up,down-right,up-left,up-right,down-left. It returns the first accepted point. The helper preserves that behavior instead of inventing hexagon bounding boxes or using alpha silhouettes.

Ordinary pointer motion leaves the selected color alone. Mouse-down`0x3d3ea` resolves a hit, reads the screen color (`0x1c9886`, conversion`0x1cb4b4`), reports preview event`0x44ee`, and sets tracking`+0x80=1`. Held motion`0x3d270` changes the preview; invalid gaps restore the committed color. Mouse-up`0x3d10e` commits a valid sample through`0x3c8b2`, updates global color`0x340420` and emits`0x44ef`; it clears tracking without closing. Invalid release restores the committed preview. The Easel owner consumes these events at`0x5d418–0x5d484` to update its current color and invalidate the visible swatch. These are **color-state substitutions**, not replacement/tinting of the authored palette pixels.

Eye Dropper command4 toggles mode`+0x82` at`0x3d6c2–0x3d8b7`, changes the tracking controller through`0x3c7d2`, and bypasses swatch hit testing. Pointer motion previews screen samples; a click commits and starts closing (`0x3d5ba–0x3d5de`). Escape`0x3cb8e` cancels Eye Dropper and restores the committed preview while keeping the palette open. It does not establish a generic Escape-to-close policy for the ordinary palette. Keyboard2 also cancels this special mode through`0x3ca08`; a parent may map that only after its key representation is established. Outside-click pass-through to the underlying art has not been established and is left to the adapter.

## LittlePicker and limits

SmallPicker is a distinct subclass. Its open virtual`0x85838` attaches its handler and snapshots the committed color; its load`0x85878` creates static script1500 with flags0x8000, then invokes base loading. Its three source programs each have one image group. There is no authored multi-pose opening to play from this archive. Parent selection between the two picker classes is explicit at`0x5449a–0x54575`. The present helper implements the ordinary BigPicker workflow; LittlePicker scripts are decoded as evidence, not dispatched as BigPicker frames. Full SmallPicker dialog integration and its drawing-port/indexed-color behavior remain outside this implementation.

All12 exported BigPicker parts decode through existing `import-ui.sprite`, which accepts the proven direct-color ARGB formats0x2005/0x2305 and preserves alpha. No indexed paper palette assumptions enter their export. Mask255 is used as a hit decision, not rendered as grayscale palette art. Recoloring the authored greens would destroy selectable colors.

A native recording is still required for event ordering during opening, exact initial scheduler phase, audio startup/latency, first-load presentation, composition against the Mac window, color-profile differences in screen sampling, and subjective feel. Browser tests below establish the helper's authored frames/coordinates and explicit lifecycle; they do not establish that the original app ran. The later studio checks below cover integration separately.

## Source helper integration API

The parent can export assets independently, without altering existing import output:

```sh
PYTHONPATH=scripts python3 scripts/native-color-picker.py \
  --output public/original/ui/color-picker-motion
```

Fetch `original('ui/color-picker-motion/manifest.json')`; sprite/audio paths are relative to that folder. Load and decode the12 PNGs before `prepare()` resolves. Create a1024×768 canvas positioned at scene origin above the art and below menus, with pointer-events:none. Preserve source coordinates while the studio container scales. Canvas z-order against the actual studio still needs parent verification.

```js
import {
  createNativeColorPickerMotion, drawColorPickerFrame, colorPickerContains,
} from './native-color-picker-motion.js';

const picker = createNativeColorPickerMotion({
  manifest,
  prepare: decodeImages, // cached; reject on failure, allow retry
  render({ clip, frame, overlay }) {
    // Clear previous actor pixels. For a dropper overlay, restore the final
    // opening pose first, then draw the single rest/hover/tracking pose.
    // drawColorPickerFrame(ctx, manifest, clip, frame, path => images.get(path));
    // A null frame means fully closed and should clear the actor.
  },
  playSound(cue) { /* cue.audio → owned Audio-like object, or null if disabled */ },
  readColor(x, y) { /* sample composed scene/screen; return '#rrggbb' or null */ },
  onReady() { /* enable live swatches and eyedropper; preserve final actor */ },
  onState(phase) { /* closed/loading/opening/open/closing; hide controls unless open */ },
  onPreview(color) { /* update displayed swatch, without committing document color */ },
  onSelect(color) { /* commit current tool color; ordinary palette stays open */ },
  onSampleSound(cue) { /* positional31504, with its exact Misc.MHK audio path */ },
  onClosed() { /* clear hover ownership; allow another open */ },
  onError(error) { /* retryable decode error */ },
  color: currentColor,
});
```

Methods: `await open()`, `close()`, `move(x,y)`, `pointerDown(x,y)`, `pointerUp(x,y)`, `setDropper(active=true)`, `setDropperState('rest'|'hover'|'tracking')`, `escape()`, `setColor(color)`, `dispose()`. Read-only getters: `state`, `color`, `previewColor`, `eyedropper`. The DOM adapter supplies native scene coordinates; it uses `colorPickerContains(manifest.dropperRegion,x,y)` to route Eye Dropper button events, calls state setters according to the native button states, and activates `setDropper()` after button release/activation. Do not interpret hovering that button as choosing a color. Keep the initiating control eligible for reentry only after `onClosed`.

`playSound` must report completion through `ended`/`error` (or true `.ended`/`.error`). If `audio.play()` rejects, dispatch/mark completion or return null: browser autoplay denial on hover must not strand the opening forever. Native sound-disabled behavior can complete at the source end check. The callback owns URL resolution, volume and user activation. `onSampleSound` is separate because that cue is not actor-owned.

The parent must replace the old static `#palette` background and immediate `openPalette()` reveal, keep controls disabled until ready, replace tiny estimated chip hit boxes with `colorPickerHit` sampling, route leave by the exact retention geometry, preserve preview versus committed color, avoid duplicate dropper art, and ensure owned sound completion/cancellation. Existing custom HTML color input is an adaptation with no recovered native counterpart. No shared main/native-ui/style/paper file was edited here.

## Initial source-helper checks

- `PYTHONPATH=scripts python3 scripts/color-picker-motion.test.py`: **6 passed**, including live mounted-source timing/registration, mask/geometry, direct-color format checks, static SmallPicker, exact Misc31504 PCM and strict malformed mask rejection.
- `node --test scripts/parity/color-picker-motion.test.mjs`: **12 passed**; asset-free source-rule fixture tests cover timing, sound gate, late updates, full closing interruption, reentry guard, stale loads, retry, disposal, exact retention/search, drag preview/commit, Eye Dropper/Escape and finite button state cues.
- `npx playwright test -c artifacts/t3/color-picker-motion/playwright.config.mjs`: **3 passed** on isolated4183. All14 poses match an independent native-coordinate composition pixel-for-pixel; actual decoded source colors can be selected while retaining/dismissing the popup; original opening WAV decodes and controlled completion waits until630ms. Browser WAV resampling is allowed at most one output sample of duration rounding. Browser context is a standalone helper fixture, not the integrated studio or native app.

Temporary Playwright config/output and exploratory resource dumps live only under `artifacts/t3/color-picker-motion`. The browser test supplies its own minimal page and imports the source module; run it against Vite on4183, not a production build. Shared4174/4175 ports and root reports were not used. No full regression, build, deployment, commit or push was performed.

## Studio adapter — isolated integration on 9236d56

`src/studio-color-picker.js` now connects the unchanged source controller to
`main.js`. A transparent1024×768 scene canvas above the art/trays and below menus
renders the exact source clipping rectangle, including negative scene coordinates;
CSS only positions the canvas. It never interpolates, rescales individual poses,
recolors source art or generates intermediate frames. Program1500 uses all seven
30ms poses;1501 uses all seven100ms poses even when opening was interrupted.
The terminal update and owned audio completion gates still belong to the helper.
Repeated open during closing is rejected; there is no queued automatic reopening.
Live DOM controls are hidden until opening completes and hidden immediately when
closing begins. Source mask/search sampling replaces estimated DOM swatch hits
for physical pointers. Dropper1503/1504/1505 overlays restore the final opening
pose before drawing rest/tracking/hover.1502 remains geometry evidence, never an
extra animated layer.

Adapter API: `createStudioColorPicker({studio,palette,trigger,original,getColor,
renderControls,fallback,select,preview,eyedropper})` returns `open()`, `close()`,
`reset()`, `setColor(color)` and read-only `active`. `main.js` routes opening and
closing through it, synchronizes committed color, and resets on tray selection.
The adapter uses `interactionOwner` for a captured physical contact, preserves
foreign-contact rejection and converts client coordinates through the scaled
studio bounds. Preview updates the chip; release commits a valid source sample
without closing. It releases ownership before hiding controls. Pending manifest
and PNG fetches use an AbortController and generation guard; object URLs are
revoked after decode. Only a completely decoded asset set is cached. Failures
restore the existing static palette; dismissal permits a fresh decode attempt.
Source cues are owned Audio objects; autoplay rejection reports error completion
rather than leaving the actor permanently gated. Interruption pauses owned audio.
No new media exports were needed and no imported media was edited.

Explicit modern browser adaptations:

- Existing keyboard/assistive chip commands and Custom HTML color input remain
  available after opening completion. Keyboard chip commands retain their prior
  choose-and-dismiss behavior; physical source swatches choose-and-stay-open.
  Focus in palette controls suppresses mouse-leave dismissal for accessibility.
- Eye Dropper button artwork/hits use source programs/region. Activation starts
  the source close program and transfers to the existing studio eyedropper,
  which samples the composed drawing and objects. It does not attempt native
  whole-desktop screen sampling. Escape retains studio cancellation/dismissal
  behavior, rather than the native dropper-only Escape policy.
- Touch/pen open by explicit activation; only mouse hover opens automatically.
  Passive pen motion cannot open or dismiss the palette. Synthetic mapping tests
  tolerate missing browser pointer capture; real contacts use pointer capture.
- Blur, pagehide, document hidden, resize and tray changes immediately dispose the
  actor, abort pending loads, stop audio and restore committed preview. They allow
  a fresh open afterward. Ordinary Escape/leave/close still play the full closing
  program. These lifecycle cancellations are browser policy, not recovered native
  closing behavior. A stalled source update never skips authored poses.

### Media required before parent publication

All paths below are relative to `public/original/ui/color-picker-motion/`, served
at `/original/ui/color-picker-motion/`. The adapter decodes the complete exported
sprite set, including geometry-only sprites, before enabling source playback:

- `manifest.json`
- `big-1.png`, `big-2.png`, `big-3.png`, `big-4.png`, `big-5.png`, `big-6.png`,
  `big-7.png`, `big-8.png`, `big-9.png`, `big-10.png`, `big-11.png`, `big-12.png`
- `big-1500.wav`, `big-1501.wav`, `big-1502.wav`, `misc-31504.wav`

The existing fallback additionally uses `ui/color-picker.png`; current studio
swatch/cursor and other UI media dependencies are unchanged. Public HEAD probes
on2026-11-09 returned **404 for all17 picker objects** at
`https://kidpix.zsrobinson.com/original/ui/color-picker-motion/`.
Receipts and exact URLs are in private
`artifacts/t3/color-picker-integration/media-public.json`. Parent must upload and
verify payload bytes/content types before publishing this integration, with the
manifest last. No upload, deployment, version change or root checkout edit was
performed. Local media/dependencies were read through symlinks only.

### Studio verification boundary

`tests/browser/studio-color-picker.spec.js` exercises shipped entry points without
importing any application renderer. Its pixel oracle independently composes source
PNGs with explicit placements and clipping: all14 open/close poses and the three
dropper overlays. Tests also cover controls/end gates, cue completion/error,
interrupted opening/full close, blocked reentry, decode failure/retry, delayed
load cancellation, held preview cancellation, foreign-contact rejection, lifecycle
reset/reopen and scaled mouse/touch/pen mask sampling against an independent
source pixel. Real mouse capture is covered; touch/pen mapping and foreign-contact
checks use synthetic PointerEvents, not physical tablet delivery.

The helper fixture tests now carry `@module`; they remain development-source-only.
The studio file is included in `playwright.build.config.js`, inherited by public
configuration. The existing object-eyedropper regression explicitly waits for
owned close completion before reentry. Selected Dry Brush, source control-region,
object-eyedropper and edited-picture popup regressions exercise adjacent behavior.
Private configs/logs/output live only under
`artifacts/t3/color-picker-integration/`; development and built servers use4217,
without shared reporters or baseline writes. Native captures remain **0/17**;
source/browser success establishes neither native timing/audio latency nor feel.
WebKit and physical iPad/Pencil delivery were not run for this change.

Final isolated checks: `npm test` **193/193**; `npm run build:cloudflare`
passed; focused private Chromium development **22/22** and built **19/19**.
Commands use the private `playwright.config.mjs` and
`playwright.built.config.mjs` in the artifact directory, selecting
`studio-color-picker`, source `color-picker-motion` (dev only), `brush`, `fidelity`,
`control-regions`, and `interaction-ux` with the focused grep recorded in the
private handoff. No full browser suite, shared report, public runtime test,
WebKit run, deployment dry run or publish was performed for this integration.
When merging onto the parent's later release work, retain its version, readiness,
input/history fixes and other source changes; this branch starts at9236d56 and
changes only the listed palette hooks plus the narrow test/audit additions.
