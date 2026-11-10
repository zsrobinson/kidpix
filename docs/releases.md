# Public releases

The current public build identifies its version, source revision and build time at [version.json](https://kidpix.zsrobinson.com/version.json). About also displays the version. Release validation includes the built-app browser suite and a repeat against the public site.

## 0.15.0 (candidate)

- Bounded tool-animation backing stores to every source pose and restoration region, with a transparent sampling fringe. Drawing's three motion canvases use 272,628 nominal RGBA bytes instead of 9,437,184; this estimate excludes engine copies, images and other canvases.
- Preserved native coordinates, mode9 color arithmetic, source clipping and hit regions while keeping large transparent animation surfaces off the drawing area. Stroke sampling, pressure, randomness and history remain unchanged.
- Repeated desktop WebKit controls show improved callback coverage across Pencil, Chalk, Crayon and Marker; gains vary by input pattern and do not establish a 60 Hz or physical iPad latency fix. See [bounded-canvas measurements](audits/bounded-ui-canvas.md).
- Canonical pixel checks verify backing dimensions and CSS placement against independently recovered geometry. Full and bounded WebKit targets match across 660 source frames, and the existing wrong-origin and old-hover-clipping negatives still fail. Native references remain 0/17; the reported foreground idle failure remains unproved.

## 0.14.0

- Restored the full Crayon and Marker hover artwork by removing an excess clip from the tinted source copy. Ordinary base clipping and hit regions remain unchanged; every hover pose and restoration passes at four desktop/tablet viewport sizes in Chromium and WebKit.
- Clear stops Firehose's retained bubbling rollover while preserving the separate wipe sound. Completion, cancellation, failure and fresh hover retain their own audio ownership.
- Reused immutable brush rasters and batched Marker uploads before preview composition and commit. Repeated measurements reduce expensive canvas work while preserving delivered samples, pressure, source pixels and history. Desktop WebKit frame cadence and physical iPad latency remain open; see [performance measurements](audits/ipad-pen-performance.md).
- Verified 221 Node checks, 407 development cases and 357 built cases with one opt-in BFCache skip in each browser lane; 72 focused pinned WebKit cases passed with two explicit skips. Source-only validation passed 209 checks with 12 imported-asset skips, build and deployment dry run. All 17 static captures are pixel-identical to 0.13; no baseline changed. All 15 required existing media keys match public checksums, with no upload. Independent review found no release blockers.
- Added loaded-page lifecycle and clear-audio acceptance probes. The reported idle Safari failure is not yet reproduced or claimed fixed. Original hose placement remains unproved and its large actor stays disabled. Native references remain 0/17.

## 0.13.0

- Read speaks the selected range in the current text box, falling back to that box when the caret is collapsed. Whole-picture Play retains its existing ordered text queue and each object's voice.
- Restored Read's three original programs and four poses, including shared tracking/running progress, source sound gates and completion artwork. Enabled secondary scope is 49 rows, 155 programs and 207 poses.
- Owned speech requests prevent late completion callbacks and held Stop gestures from affecting replacement requests or other playback. Selection, text, voice, object and browser interruption retire the appropriate request.
- Preserved directional UTF-16 ranges, surrogate boundaries, multiline text and exact trailing-break caret/selection positions through focus changes. No media upload is needed; all ten required existing keys match public checksums.
- Verified 199 Node checks, 399 development cases, 350 built cases and 163 WebKit cases with one explicit Chromium-only skip. Source-only validation passed 193 cases with six asset-dependent skips, build and deployment dry run. Final independent review found no objections; all 17 captures pass existing web comparisons without changing baselines. Native references remain 0/17; physical iPad and audible speech delivery are unverified.

## 0.12.0

- Public verification covered all 323 cases across 315 initial passes and eight unchanged rechecks. The initial full run failed eight loading/navigation cases; its cause remains unresolved. All 17 live captures pass the existing web comparison rules; no native reference was accepted.

- Animated Text's previous/next voice arrows with eight source programs and ten poses, including both tracking groups, source cues and disabled boundaries. Enabled secondary scope is now 48 rows, 152 programs and 203 poses; the voice popup remains a native select.
- Preserved saved voice URIs across asynchronous catalog updates, reordered lists, missing voices and duplicate identities. Selection, save/restore and Undo/Redo synchronize the selected text object's voice without silently choosing another voice.
- Kept catalog changes scoped to voice gestures, preserving unrelated held formatting and Grab actions. Native-select sessions retain their target through blur, and selection/history update control values and artwork together.
- Verified 195 Node checks, 370 development cases, 323 built cases and 134 WebKit cases with one explicit Chromium-only skip. Source-only checks passed 189 cases with six asset-dependent skips, plus build and deployment dry run. Reviewed all 17 static captures: Text's intentional change is confined to the voice select/arrows; the other 16 captures are pixel-identical. The accepted web report has zero comparison/regression errors.
- No new media is needed; all 26 referenced keys are publicly checksum-verified. Read's selected-range speech ownership, native popup behavior, original runtime feel and physical iPad acceptance remain separate work; native references stay 0/17.

## 0.11.0

- Restored Firehose's original cumulative page-wipe paths and WaterCleaner sound, with the recovered delay and update gates. The picture freezes while the wipe runs; no extra confirmation or guessed large hose placement was added.
- Kept the clear as one Undo/Redo operation across ink, objects, background and picture tracks. Escape and browser interruption cancel without clearing the picture; contacts begun during the wipe cannot activate controls after cancellation. Existing paper preservation remains a browser policy.
- Canceled pending Stamp Editors during the wipe and protected partial-start and failed-commit cleanup. Failed commits retain the original scene clock and playback handles; Stop still controls resumed tracks.
- Verified 193 Node checks, 345 development cases, 298 built cases, 39 affected Chromium cases and 109 WebKit cases with one explicit Chromium-only skip. Source-only checks passed 187 cases with six asset-dependent skips, plus build and deployment dry run. All 17 static captures remain pixel-identical to 0.10; both required media files were publicly checksum-verified before code publication.
- The large hose actor, other Big Eraser engines, native runtime feel and physical iPad acceptance remain unverified; native references stay 0/17.

## 0.10.0

- Restored the Color Picker's seven opening poses at 30 ms and seven closing poses at 100 ms, exact clipping and source sound completion gates. Interrupted opening plays the full closing program; controls become live when opening finishes.
- Added source-mask color sampling, preview/selection separation and Eye Dropper rest/hover/tracking artwork. Pointer ownership, keyboard/custom-color access, scaled input, cancellation and failed-art retry preserve usable controls.
- Fixed recorded paths when Cut, Undo, Delete or Paste changes their target. Capture and preview clear before the edit; deleted or replaced objects cannot receive a stray path or history entry.
- Verified 193 Node checks, 330 development cases, 285 built cases, assets and build/dry run. Source-only checks passed 187 cases with six asset-dependent skips; all 17 static captures remain pixel-identical to 0.9. WebKit passed 94 cases with one explicit Chromium-only delivery skip. All 17 new media objects were publicly checksum-verified before code publication.
- Actual iPad hardware acceptance and original-program runtime feel remain unverified; native references remain 0/17.

## 0.9.0

- Animated Text's previous/next font and larger/smaller size arrows with 16 source programs and 20 poses, including tracking and boundary-disabled artwork. The enabled secondary scope is now 46 source rows, 144 programs and 193 poses.
- Added the 23 recovered size presets, bounded at 7–336. Retained the existing four browser font families, custom typed sizes, unknown saved font names, and directional text selections. Original font rasterization and native popup interiors remain outside this release.
- Kept font, numeric and Stamp library controls intact when optional animation art finishes loading. Static keyboard/pointer presses remain owned through art binding and cancel on Escape, interruption or target changes.
- Preserved library tiles through Stamp readiness and covered category focus, an active drag and later placement. Regression coverage includes category focus, immediate drags and dragging while art becomes ready.
- Verified 193 Node checks, 303 development cases and 262 built cases. The final field-spacing/capture updates also passed 45 affected cases per Chromium lane and 26 WebKit cases. Reviewed all 17 static captures; the accepted report has zero web comparison/regression errors. Source-only checks passed with six asset-dependent skips. No new media files were required.
- Expanded the WebKit lane to Text controls and library readiness: 67 cases passed with one Chromium-only delivery skip. Actual iPad hardware testing and original-runtime timing/feel remain unverified; native references stay 0/17.

## 0.8.0

- Added shared gesture ownership for drawing, objects, recorded paths and both Stamp Editors. Secondary contacts cannot take over or activate controls, including late clicks and browser-generated double-taps after the first contact releases.
- Recovered from capture loss, blur, backgrounding, resize and teardown while preserving each tool's history policy. Discrete paint actions and every polygon/curve contact release correctly; recorded paths release the canvas's actual capture on interruption or Escape.
- Added optional pressure for freehand pen Pencil, Chalk and Crayon with chronological coalesced sampling and per-dab interpolation. Mouse/finger, Marker, shapes and timed tools retain their behavior.
- Added built/public studio checks for pen pressure, capture cleanup, path interruption and mixed undo/redo. Verified 191 Node checks, 277 development cases, 236 built cases, 99 focused integration cases and four DPR2 mapping/resize cases; all 17 accepted captures remain pixel-identical.
- WebKit 27.2 passed 41 input/renderer/editor cases using the pinned Playwright container; one Chromium-only delivery case is explicitly skipped. Source-only checks pass with six asset-dependent skips. Actual iPad/Safari hardware acceptance remains separate. See [tablet input](tablet-input.md).

## 0.7.0

- Animated 19 more secondary controls using 59 complete source programs and 81 authored poses: Text alignment and independent Bold/Italic/Underline, Grab clipboard/ordering actions, and Stamp category arrows, sizes and editor entry.
- Synchronized animation state with actual text styles, selection, clipboard and category bounds. Held actions cancel when their target changes, including changes before the next animation frame; formatting preserves the direction and active end of text selections.
- Restored Stamp artwork within three separate footprints so arrows, sizes, editor controls, library tiles and the category popup coexist. Independently verified 29 source compositions and 123 restoration transitions; fixed baked arrow contamination in the clean backdrop.
- Preserved static Grab object-navigation arrows by restoring clipboard and ordering artwork within separate source footprints. Their web actions remain follow-up work.
- Kept Path, Loop Path and Play Object available in the Paint Zone menu while preserving the native Grab tray layout.
- Optional animation failures retain usable static controls. Browser coverage includes source pixels, pointer/keyboard cancellation, asset retry, editor entry, library dragging and boundary-disabled states.
- Verified 188 Node checks, 237 development browser cases, all 226 public-site cases, 226 built-browser cases and 13 exporter checks. Reviewed and accepted all 17 Ubuntu web captures; the resulting comparison report has zero web regressions/errors. Source-only checks pass with six asset-dependent cases skipped.
- iPad input hardening is the next focused milestone. Original runtime timing, sound latency and feel remain unverified; native references remain 0/17.

## 0.6.0

- Restored all 16 primary tool actors across Drawing, Painting, Bucket, Mixer, Eraser and Grab, retaining 48 source programs and 453 authored poses, exact hit regions and source sound cues.
- Animated 23 secondary selector rows: Drawing styles, Painting modes, applicable sizes and Mini Eraser shapes. Their 69 complete programs retain 92 authored poses, shared selection progress and finite rollovers.
- Preserved actor ownership through option rerenders, keyboard/pointer capture and cancellation. Optional asset failure leaves static choices usable and supports hover retry after a failed backdrop change.
- Added portable Linux source extraction, source-pixel browser coverage, checksummed sprite/audio/backdrop verification and static capture recipes across all eight tool tabs.
- Verified 157 Node checks, all 206 development browser cases and all 195 built-browser cases. Reviewed and accepted 17 Ubuntu web baselines while preserving the previous macOS baselines separately; native references were not changed.
- Stamp/Text/Grab secondary actions and original-runtime feel remain follow-up work. Native references remain 0/17; Windows source extraction provides matching artwork/sounds but does not establish runtime parity.

## 0.5.0

- Restored the paper canister's selected-texture artwork, six authored opening poses, clipping and control readiness. Delayed updates preserve every pose and its terminal hold; canceled texture loads and failed-animation fallback navigation stay coherent with history.
- Recovered native bitmap-brush spacing, integer placement, paper sampling and Marker destination-pixel math. Removed per-pixel allocations from Marker strokes; three local sparse-input trials reduced dispatch p95 from 31–44 ms to 4.5–8.8 ms while preserving tested pixels.
- Corrected source control hit regions and Firehose rollover retention, reentry and owner cleanup. Undo Guy retains every authored update, owns its cues independently, uses source rounded selection and also animates redo.
- Prevented accidental chrome text selection and native image dragging, preserved editable text selection, stopped object movement after lost capture or blur, and synchronized menu accessibility state on Escape.
- Added source-pixel and interaction regression coverage. Recovered standalone Color Picker, drawing-control and Big Eraser helpers, cursor metadata and bundled-font extraction are retained for subsequent integration; those new helpers are not enabled by this release.
- Native runtime captures remain unavailable. Resource/binary reconstruction and browser checks establish the implemented source rules, while original-app timing, palette installation and subjective feel still need a compatible running Mac environment.

## 0.4.0

- Replaced sampled Moving Paints loops with all authored clips, registered placement, source holds and sound-gated finite completion. Stationary spraying emits every 150 ms; releasing stops emission while live particles continue.
- Included live paint in snapshots, saving and PNG export; tool cleanup freezes the current pose and stops owned sounds. Fixed unified undo history when undoing a held moving stroke.
- Corrected verified grayscale mask density, random per-pixel Airbrush coverage, spatter rejection and CFG shadow/glint offsets, biases and pass order. Marker, texture, smear and stroke interpolation remain documented gaps.
- Added actual-app moving-paint and brush pixel comparisons, reusable public-site browser checks and a full-layout resize wait for Stamp Editor tests.

## 0.3.0

- Source revision `d452afb928f93d442a719d06992fda1829fdc485`; all 25 browser checks passed against the public site.

- Restored the complete Paint Shapes banks and native selection, dimensions, registration, stationary spraying and reset behavior. Removed procedural rotation/scaling from that renderer.
- Restored source button rollover sequences, timing, looping and cancellation.
- Replaced the custom Stamp Editor with the native frame, controls and palette, while preserving editable pixels, transformations, undo and saved-stamp placement.
- Improved small-screen stamp editing, duplicate-modal prevention and failed-load recovery.
- Added full-canvas source-pixel comparisons, native editor workflows and two additional comparison captures.
- Recovered complete Moving Paints data and a tested lifecycle controller; the new moving renderer is not enabled in this release.

## 0.2.1

- Corrected native cursor URLs that were resolved relative to the production stylesheet's `assets/` directory.
- Added a local built-app browser harness, with the media library streamed separately.
- Verified 13 browser checks against the public site; source revision `a04da4a593b010e46d8dc4188be5993341c7fa8f`.

## 0.2.0

- Restored native tool/size/effect selection artwork, cursors, Undo Guy expressions and source-derived 100 ms timing.
- Corrected Undo Guy face toggling and eyedropper preview/picking across placed objects.
- Added repeatable browser scenarios, a local comparison report and native-reference import support.
- Source revision `845d4090545818533f5e6604c6a2f7ca41524d6f`. The production-only cursor URL issue found during live verification was corrected in 0.2.1.
