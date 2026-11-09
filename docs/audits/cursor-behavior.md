# Cursor resource and dispatch audit

2026-11-09. Evidence is static analysis of the supplied mounted trial and its i386 executable. **The original application has not run here.** Resource pixels, binary rules, and source-rule reconstructions below are not native screenshots or native UX verification.

The cursor exporter now decodes 31 of General.MHK's 32 `tCUR` resources into 36 component PNGs. Five previously unsupported color cursors are recovered. Resource **10024 remains unsupported** because two pixels require undefined colored XOR behavior. Five IC cursors contain a base plus a color-transform component; their two components are **not animation frames**.

## Primary evidence and reproduction

- Installer: `/Volumes/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources/Archive.zplist` and `Archive.zp`, read through the existing `app_resources()`/`mohawk()` functions in [import-ui.py](../../scripts/import-ui.py). Extracted archive: [General.MHK](../../artifacts/t3/cursors/General.MHK), SHA-256 `d58b41d7fbfdcf1f43ea09e10713b6e561a503e01b949357139cf99b742a7c43`.
- Executable: [kidpix-original](../../artifacts/research/kidpix-original), SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. All addresses below are i386 virtual addresses, not universal-file offsets.
- [disassembly-i386.txt](../../artifacts/research/disassembly-i386.txt), SHA-256 `d1130230e50b57bebdeebc9ef7496fb6d4fd9332b35b52fe86836dd75bf19963`.
- Apple's [Inside Macintosh: Imaging With QuickDraw, Cursor Utilities](https://developer.apple.com/library/archive/documentation/mac/pdf/Imaging_With_QuickDraw/Cursor_Utilities.pdf), printed pages 8-18–8-20 and 8-34–8-36. This defines color cursor records, masks, hotspots, and destination-dependent behavior. The local Apple SDK's `MacOSX14.5.sdk/.../QD.framework/Versions/A/Headers/Quickdraw.h`, lines 65–104, supplies the `ColorSpec`, `ColorTable`, and `PixMap` declarations.
- [verification.json](../../artifacts/t3/cursors/verification.json) records resource hashes, pixel hashes, constructor/RTTI addresses, and check counts. [verify-corpus.py](../../artifacts/t3/cursors/verify-corpus.py) reproduces independent source-pixel, legacy-pixel, compiled arithmetic, and constructor-byte comparisons. These are local ignored research artifacts.

Focused checks with the isolated environment created for this task:

```sh
PYTHONPATH=scripts TMPDIR="$PWD/artifacts/t3/cursors" \
  KIDPIX_CURSOR_FIXTURES=artifacts/t3/cursors \
  artifacts/t3/cursors/venv/bin/python -m unittest scripts/test_native_cursor.py -v
cc -O0 -ffp-contract=off artifacts/t3/cursors/transform-oracle.c \
  -o artifacts/t3/cursors/transform-oracle
artifacts/t3/cursors/venv/bin/python artifacts/t3/cursors/verify-corpus.py
```

The 11 synthetic tests require Pillow only. Two additional corpus tests run when `KIDPIX_CURSOR_FIXTURES` names the directory containing the extracted `10012.tCUR` etc. The corpus verification script also needs the importer's PyObjC dependency and the compiled `transform-oracle` built from its adjacent C file. No browser server, build, shared UI regeneration, or original application execution is involved.

## Native decoder dispatch

| Address | Observed behavior |
| --- | --- |
| `0x001c9cc9–0x001c9d20` | Tries IC recognition, then color recognition, then the monochrome path. |
| `0x001cd012–0x001cd022` | Compares the first word with little-endian `0x4349`, the bytes `IC`. |
| `0x001cd035–0x001cd05c` | Recognizes raw bytes `80 01` using little-endian comparison `0x0180`; requires the allocated color-cursor buffer. |
| `0x001cd023–0x001cd034` | For a color record's monochrome fallback, advances 20 bytes to its 1-bit planes. |
| `0x001cd060–0x001cd288` | Copies the color record's monochrome planes/hotspot, PixMap, indexed pixels and color table into native objects, then calls the wrapper that reaches `SetCCursor`. |
| `0x001cd296–0x001cd2d6` | Alternates two allocated color-cursor buffers after installation. This is buffer reuse, not evidence of animation. |
| `0x001cd613–0x001cd690` | Allocates 96-byte color cursor handles, PixMap, pixel storage and color table; installs native type `0x8001`. |
| `0x001b5860–0x001b5885`, `0x001b3a54–0x001b3a85` | Wrapper/virtual dispatch and imported `SetCCursor`. |
| `0x001b5888–0x001b58ad`, `0x001b3a86–0x001b3ab7` | Monochrome wrapper and imported `SetCursor`. |

No timer-driven cursor component sequencing was recovered in these decoder paths. This finding does not rule out higher-level application cursor changes or tracking overlays.

## Recovered `0x8001` records

All six source records have a 96-byte cursor header, a 50-byte PixMap at `0x60`, 256 indexed pixels at `0x92`, and a sparse color table at `0x192`. The mask occupies bytes 52–83; the hotspot is signed `(vertical, horizontal)` at bytes 84–87. Export metadata uses `[horizontal, vertical]`. The PixMap is uncompressed indexed-8, bounds `(0,0,16,16)`, rowBytes `0x8010`. Each source palette channel repeats its high byte, so 16-to-8-bit conversion has no rounding ambiguity.

| Resource | Bytes | Palette entries | Hotspot `[x,y]` | Result |
| --- | --- | --- | --- | --- |
| 10012 | 466 | 7 | `[7,9]` | Color PNG recovered |
| 10016 | 490 | 10 | `[2,3]` | Color PNG recovered |
| 10018 | 442 | 4 | `[8,8]` | Color PNG recovered |
| 10022 | 442 | 4 | `[7,7]` | Color PNG recovered |
| 10024 | 546 | 17 | `[11,11]` | Unsupported destination-dependent display |
| 10026 | 458 | 6 | `[6,6]` | Color PNG recovered |

Palette entries use their `ColorSpec.value` indices, not their ordinal positions. For example, 10012 uses indices `0,35,245,248,251,253,255`. Interpreting the seven entries as indices 0–6 corrupts its pixels.

Apple documents that color pixels inside the 1-bit mask replace the destination. Outside the mask, white leaves the destination unchanged, black inverts it, and other colors yield unpredictable results. The five recovered resources use only white outside their color masks. Resource 10024 has outside-mask RGB `(187,187,187)` at `(6,1)` and `(153,102,153)` at `(7,2)`; exporting either as transparent would discard source behavior. Its hotspot and both operations remain in `unsupported[]`. None of these six color records requests black outside-mask inversion. The five supported records also have no monochrome fallback inversion bits; 10024's separate monochrome fallback inverts `(7,2)`. The exporter records that count independently, including for 10024.

The implementation deliberately rejects other layouts, packed pixels, depths other than indexed-8, duplicate/missing palette values, and non-repeated 16-bit channels. Those cases have not been proven against this application.

## IC components and selected-color arithmetic

IC hotspots come from big-endian words at offsets 2 and 4. A `tBMH` bank starts at offset 8. The five two-component resources are `10000`, `10001`, `10002`, `10003`, and `10015`; the remaining IC resources have one component.

The ordinary IC display path `0x001cd44e–0x001cd508` draws component zero, then, for count ≥2, draws component one through `0x001ca702` using current color bytes from global state `+0xe8`. The drawing-tool setter repeats this sequence at `0x001361de–0x00136266`, reading the selected color through global pointer `0x003510d0`. This independently connects the transform to drawing-tool colors.

At `0x001ca94d–0x001caa39`, source bytes `[ignored, add, weight, coverage]` transform each destination RGB channel `d` using selected-color channel `c`:

```text
inv = float32(1/255)   # binary constant 0x3b808081 at VA 0x002603a0
target = float32(float32(float32(c*inv)*weight) + add)
result = float32(d + float32(float32(target-d)*float32(coverage*inv)))
out = min(255, truncate_to_integer(result))
```

Destination alpha is retained. Each operation follows SSE single-precision rounding; the helper `colorize_cursor(cursor, rgb)` reconstructs that arithmetic on the source's premultiplied base and returns straight RGBA. The mask's decoded PNG channels are `R=add`, `G=weight`, `B=coverage`, `A=ignored`. The source masks all have ignored byte 255. Consequently a seemingly pure-green mask pixel represents zero coverage, not visible green and not a conventional green-key image. Component one must not be unpremultiplied as ordinary artwork.

This establishes the channel rule. The native CoreGraphics base-image draw, color management, scaling, and final cursor presentation have not been compared against a running original. Python reconstruction exports under `artifacts/t3/cursors/*-color-*.png` are research results, not reference screenshots.

## Constructor-backed class bindings

For each row, the constructor installs the listed vtable. Its `vtable[-1]` points to RTTI carrying the native class name; `vtable[0x20/4]` points to the activation routine containing the cursor-ID store; `vtable[0x98/4]` points to `0x00135ea8`. That setter resolves the ID as `tCUR` at `0x00135fd6–0x0013603e`. All nine chains were checked against machine bytes and pointer values, not inferred from the cursor glyphs.

| Native class | Cursor ID | Constructor vtable store | Vtable | Activation cursor-ID store |
| --- | --- | --- | --- | --- |
| `RChalk` | 10000 | `0x0011c4d0` | `0x003214e0` | `0x0011c468` |
| `RCrayon` | 10001 | `0x0011d016` | `0x00321740` | `0x0011cfae` |
| `RMarker` | 10002 | `0x0012193e` | `0x00323cd8` | `0x001218d6` |
| `RCircle` | 10003 | `0x00115ba0` | `0x00320478` | `0x00115ad8` |
| `REraserTool` | 10005 | `0x00127f4e` | `0x003253a0` | `0x00127eec` |
| `RFill` | 10007 | `0x00127fb0` | `0x00325480` | `0x00128d3d` |
| `RCutFree` | 10013 | `0x00116cd1` | `0x00320728` | `0x00116ddb` |
| `RRealBrush` | 10015 | `0x001220e6` | `0x00323e08` | `0x0011d088` |
| `RSprayGun` | 10017 | `0x00134643` | `0x00326e38` | `0x00134cac` |

The record names the native class, not a complete web-tool equivalence. In particular, `RCircle → 10003` does not prove that every web Pencil mode should use 10003. Other mappings, including eyedropper and text, retain visual-only status in the exporter. An additional RTTI-backed activation lead is `RWackyBrush` vtable `0x00325270`, activation `0x00127824`, ID store `0x00127850 → 10011`; its constructor chain was not completed, so it is not promoted into `ENGINE_BINDINGS`.

## Parent integration API and remaining work

`export_cursors(archive, output, source=...)` keeps its signature and existing `items`, `frames`, `hotspot`, and `preferredFrame` fields. Additions in `schemaVersion: 2`:

- Manifest `nativeRuntimeVerified: false`.
- Item `pngUsable`: use a static PNG only when true. The five two-component IC entries have false because the base alone omits selected-color rendering.
- Frame `role`: `base` or `color-transform`. The historical field name `frames` is retained for compatibility; it does not imply animation.
- Item `colorTransform`: component indices, raw channel roles, evidence addresses, and runtime status. `colorize_cursor(decode_cursor(data), (r,g,b))` is the Python reference for the recovered arithmetic. Preserve the original premultiplied base for exact byte arithmetic; round-tripping the unpremultiplied PNG through browser Canvas can lose low-alpha precision.
- Item `engineBindings`: class, constructor vtable-store address, vtable, cursor-ID store, setter and slot. `mappingEvidence` distinguishes these bindings from visual labels.
- Item `animation.kind: "none-in-decoder"`, with runtime status false.
- Color item `monochromeFallbackInversionPixels`: identifies the separate low-depth fallback limitation.
- Recognized unsupported color records include `encoding`, `hotspot`, and `pixelOperations` in `unsupported[]`; no misleading static PNG is emitted.

The parent owns changes to `src/native-ui.js`/`src/main.js` and shared UI generation. Their current consumer ignores `pngUsable`; it should honor that field before enabling new class bindings, and compose the IC components when selected-color support is implemented. Schema-v1 manifests can retain their existing compatibility policy. Regeneration will add five color PNGs; no shared assets were regenerated in this task. The older inventory document's 26-resource/31-PNG count now describes the pre-audit exporter and needs a parent-owned update.

Actual validation: **13 focused Python tests pass**, including the two mounted-source corpus tests. **36/36 component PNGs** match independent source decoding; **31/31 legacy component PNGs** remain byte-identical; **30/30 color reconstructions** match a compiled transcription of the recovered source rule; **9/9 constructor bindings** pass machine-byte/RTTI checks. The C transcription is an independent implementation check, not an original-runtime oracle. Browser tests and full-suite integration remain parent-owned. Native event timing, scaling/color management, higher-level cursor state changes, and 10024's two colored XOR pixels remain unverified.
