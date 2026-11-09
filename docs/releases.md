# Public releases

The current public build identifies its version, source revision and build time at [version.json](https://kidpix.zsrobinson.com/version.json). About also displays the version. Release validation includes the built-app browser suite and a repeat against the public site.

## 0.3.0

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
