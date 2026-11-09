# Bounded Text font and size steppers

Implemented from parent ffcd5d8. MBTN9383 rows 2–5 are newly enabled; rows 6–11 retain their existing behavior. Rows 0/1 remain real browser value controls without source popup animation. No voice, Read, clipboard, font-file or B/I capability expansion.

## Value policy

`src/text-values.js` owns the portable browser catalog in its existing order: Chalkboard (`Chalkboard, sans-serif`), Serif, Sans Serif, Monospace. This is not a native host-font inventory or a font-fidelity claim. The initial size remains 32. Unknown saved family strings remain selected as extra options, with both font arrows disabled. Empty and singleton catalogs explicitly disable unavailable directions.

The 23 source presets are 7, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72, 96, 120, 144, 168, 192, 240, 288, 336. Stepping is bounded without wrap. Direct numeric edits accept 7–336; out-of-range edits clamp on committed change and empty/invalid edits do not mutate the saved value. Saved values are not coerced during restoration. A typed 42 is retained and steps to 48/36: this is an explicit browser adaptation, not recovered native custom-size behavior. No held-arrow repeat cadence is invented.

## Source scope and restoration

| Row | Binding | Rest | Tracking (two poses) | Disabled | Hover |
| --- | --- | --- | --- | --- | --- |
| 2 | font-step:-1 | 18098 | 18099 | 18309 | 18100 |
| 3 | font-step:1 | 18101 | 18102 | 18310 | 18103 |
| 4 | font-size-step:1 | 18104 | 18105 | 18311 | 18106 |
| 5 | font-size-step:-1 | 18107 | 18108 | 18312 | 18109 |

All 16 programs retain source frames, registration, 100ms ticks, decoded end-check ticks and cue ownership. The existing controller handles pointer release, cancellation, keyboard activation, repeated-key rejection and target identity. Static arrow buttons remain available before/after asset failures, with later updates/reentry retrying source art. The fallback also rejects held-key repeats.

Font arrows restore only `[257,643,43,62]`; size arrows restore only `[334,643,43,62]`. The separate existing alignment/style footprint remains independent. The numeric field is moved into `[300,660,34,28]`, clear of the arrows, and its built-in browser spinners are hidden. Full source sprite bounds and exact recovered hit regions remain unchanged.

**Staged media delta: zero added, zero modified, zero removed.** No exporter correction was necessary. Independently composing source programs 18049 + 18034 reproduces the existing clean Text backdrop byte-for-byte in decoded RGBA pixels; it contains no baked arrow sprites. Pixel SHA-256: `455373eaa3f21b2246f50fa7f398abdc4dcfdefc040d6891183220b3eb92d654`.

`check_text_stepper_source.py` verifies original archive identity, raw row words, all 16 program hashes/events and staged frames/cues/deadlines against the prior independent `remaining-control-states/rows-and-programs.json`. It creates only the explicitly supplied private output directory, including source-composed backdrop evidence.

## Integration and validation

`src/text-range.js` extends the existing text-offset range strategy with retained anchor/focus direction across genuine select/numeric focus. Arrow pointer activation retains editor focus; direct value changes do not steal control focus. Returning to the editor restores its range, guarded by object ID. Native select/input events remain operable. State refresh updates values, boundaries and style accessibility attributes in place, including selected-object changes and undo/redo, without rebuilding focused controls.

Changes in `scene.actionState` are additive: expose `font` and `size` alongside the existing text style and action capabilities. On integration with the parent's later work, retain all additional parent getter fields, animations, menus, range behavior and tablet fixes. This checkout does not contain or replace the parent's 0.8 configuration or later P2 changes. Paint, input ownership, editors, pressure, lifecycle, main Escape and path routing are untouched.

Checks completed in this isolated checkout:

- `npm test`: 193 passing, including all 23 presets, numeric bounds, custom 42, portable catalog order/empty/singleton/unknown.
- `npm run build:cloudflare`: pass; version unchanged.
- `npx playwright test -c playwright.text.config.js`: private port 4210, list reporter and private artifact directory. 29 tests passed together, then two additional tests passed separately (31 total). Includes prior action regressions, all four arrows' rest/hover/two tracking/disabled poses and vacated pixels in actual studio, independent source composition, pointer and keyboard cancellation, repeated keys, held target changes, same-tray rerender, manifest/PNG/ARGB failure and retry, directional/collapsed ranges, continued typing, numeric/select focus, unknown saved family, selected-object and undo/redo sync.
- Source audit: pass against read-only recovery inputs. Private evidence under `artifacts/text-controls/source/`; logs under `artifacts/text-controls/`.
- `git diff --check`: pass.

Original native references remain **0/17**. No native runtime timing, original font rasterization, Safari/iPad hardware acceptance, native popup interior or rich-text/custom-size equivalence is claimed. Shared media and dependencies are reused through local symlinks; neither is committed or modified. No version, push or deployment occurred.

## Parent integration

Integrated above published 0.8.0, retaining its path/input fixes and scene getters.
Readiness binds Text art without replacing the live font/select/number controls.
`stepper-input.js` retains static Space and pointer gestures through asynchronous
art binding, validates the original target, and cancels on Escape/interruption.
Its click handling requires the recorded physical press; it does not infer a
press from a later compatibility click.

The parent also keeps Stamp library tiles and the category select intact during
art readiness. Deterministic focus/DOM checks failed before that change and pass
afterward; 24 consecutive quick local drags delivered drops and changed ink. The
prior public intermittent drop failure remains unproven until public verification.

WebKit's Canvas source-over rounding differs from Chromium at some translucent
edges. The Text pixel tests retain the independent integer oracle for Chromium
and independently compose the same pinned PNGs in WebKit Canvas for that engine.
Both compare source placement/restoration and visible pixels with the existing
tolerance; no rendering algorithm or media was changed to satisfy this test.
