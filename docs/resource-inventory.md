# What the trial DMG contains

Inventory taken directly from the mounted `Kid Pix Deluxe 3D` trial and its installer index on 2026-11-09. Counts describe this supplied trial, not other releases or a complete retail distribution. The raw machine-readable inventory is local at `artifacts/research/inventory-resources.json`.

## Recoverable application material

The installer index has 508 application entries: 381 regular files, 100 directories and 27 symbolic links. Their declared sizes total 243,560,097 bytes. The main executable reports version 2.2, build 615 and contains i386 and PowerPC slices. These are recoverable from the installer without running it.

Forty-one embedded Mohawk archives account for 204,212,169 bytes and expose these typed records:

| Resource | Count | What it gives us |
| --- | ---: | --- |
| `tSCR` | 2,107 | Drawing, animation and sound-cue programs; not all command semantics are decoded yet |
| `tBMH` | 63 banks / 10,562 sprites | Native UI states and animation artwork, with source registration offsets |
| `tBMP` | 746 | Individual images, masks, previews and backgrounds |
| `tWAV` | 828 | UI, tool, transition and spoken-help sound records |
| `MBTN` | 35 | Structured control definitions and script references |
| `MRGN` | 85 | Native hit regions, including regions made from multiple rectangles |
| `tCUR` | 33 | Original cursors, including their hotspots |
| `REGS` | 129 | Sprite registration data |
| `tCNT` | 77 | Resource collection descriptors |
| `tPAL` | 13 | Palette records |
| `STRL` | 5 | String lists |
| `grad` | 1 | Gradient definitions |

These counts exclude the separate media-library archives under the disc's `Libraries/` directory. In the already imported catalog, those libraries contribute 4,343 items in 165 categories:

| Library | Categories | Items |
| --- | ---: | ---: |
| Backgrounds | 57 | 750 |
| Rubber stamps | 20 | 2,240 |
| Stickers | 40 | 901 |
| Sounds | 13 | 112 |
| Movies | 12 | 100 |
| Animations | 20 | 220 |
| Frames | 3 | 20 |

The imported directory measured 9,023 files / 1,810,536,774 bytes during this inspection. That is a point-in-time output count: regenerated UI exports can add files, and a library item can produce several files, such as left/right images, foreground layers, thumbnails or animation variants.

## Motion and feel: the strongest next targets

`Easel.MHK` contains 138 scripts and 260 sprites; `Picker.MHK` contains 290 scripts and 251 sprites. The old web implementation's numbered-sprite sweep is not equivalent to their scripted animation sequences. The source routines supply frame order, registration offsets, repeated waits and sound cues. The accompanying [binary investigation](reverse-engineering.md) establishes a 100 ms interval for the examined Undo Guy routines; record ordering alone would not establish elapsed time.

The moving-paint source is especially richer than the current small frame sampler: `Tools/Anims.MHK` contains 752 scripts and 7,112 sprites across 20 banks. `Tools/Cyclic.MHK` contains another 935 sprites across 15 banks. Recovering the scripts, registration offsets, loops and complete frame sets should improve moving spray behavior more than inventing procedural replacements. The original painting engine is still needed to establish the full particle behavior.

Thirty-two original cursors are in `General.MHK`; one additional `tCUR` is in `SYSTEM.MHK`. The new `scripts/native-cursor.py` helper decodes the known IC and classic QuickDraw Cursor encodings without resizing. For `General.MHK`, 26 cursors yield 31 PNG frames. Six resources with the different `0x8001` encoding are reported as unsupported rather than guessed. IC cursor hotspots come from header offsets 2/4; their bitmap bank begins at offset 8. Every supported IC frame was compared byte-for-byte with the existing UI sprite decoder's output.

Some two-frame cursors contain pure-green pixels in their second frame; the first frame may also be a colorizable mask rather than a ready-made tool icon. The exporter preserves those pixels and records their count. It does not silently apply a green key or infer tool IDs from resource ordering. High-confidence visual identifications include eyedropper 10006, scissors 10013, spray can 10017, text 10019 and crosshair 10029. These are glyph identifications, not binary-proven tool-dispatch mappings. The contact sheet is local at `artifacts/research/inventory-cursors-zero.png`.

`StampEd.MHK` has 36 sprites, 32 scripts, 11 sounds and a nine-record button table. This is a concrete source for replacing the custom web stamp-editor appearance and interactions. `TimerSettings.MHK` has 49 sprites and 42 scripts. `GFXTransitions.MHK`, `Soundfx/TransitionSounds.MHK`, and the transition-name plist expose native selection artwork, previews and sound choices; their images alone do not establish the rendering algorithm of each transition.

The installer also includes original fonts, help text/settings, spoken-help recordings, Cocoa nibs and XIBs, and user defaults. Verified bundled defaults include Chalkboard at size 48, a Slide Show interval of 7 seconds, and a path-closing radius of 10. The current web defaults should be checked against these records before inventing replacements.

## Structured controls: evidence and remaining uncertainty

`Easel.MHK`'s `MBTN` 75 is exactly 27 records of 32 bytes, interpreted as 16 big-endian words each. `ExtendedHelp.plist` links its row order to help-entry IDs. For example, the Backgrounds control is row 2:

```text
1000 1001 1001 1001  2 375 224 1  0 0 1002 1  0 0 1 0
```

The first four words and word 10 reference existing `tSCR` programs. Word 4 is 2 for controls whose next word references a custom `MRGN`; for this row, `MRGN` 375 stores the rectangle `(34, 18, 113, 61)`. Other records use multiple region rectangles, which can recover hit shapes more accurately than the web's current broad boxes.

The evidence does **not** yet establish which of those script columns corresponds to each pointer or activation event. The executable contains the strings `RButton::LoadFromCDATA` and `RButton::Draw`, giving concrete disassembly anchors. Recover the field/event semantics there before wiring all scripts to guessed hover/down/up events.

## Decompilation's role

The supplied executable and bundled frameworks are extractable. Static analysis can answer questions that art extraction cannot: button-event dispatch, exact scheduler clock units, cursor dispatch, easing, brush behavior and project serialization. A decompiler produces an approximation of the compiled logic, with varying usefulness where symbols are absent. It does not restore original source or establish native visual parity by itself.

Use resource extraction first for exact authored material, disassembly/decompilation for the engine rules around it, then a running original for behavior and timing verification. Keeping those evidence levels separate prevents a plausible animation from being mistaken for a verified reproduction.
