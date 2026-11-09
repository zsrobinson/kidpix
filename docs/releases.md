# Public releases

The current public build identifies its version, source revision and build time at [version.json](https://kidpix.zsrobinson.com/version.json). About also displays the version. Release validation includes the built-app browser suite and a repeat against the public site.

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
