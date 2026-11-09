# Native control regions

The Easel's `MBTN` table 75 distinguishes image-derived regions (kind 1) from explicit `MRGN` resources (kind 2). The export now keeps source hit geometry separately from the rendered script/artwork rectangle. The original application has not been run; these findings come from its resources and i386 executable.

## Explicit source regions

The seven referenced kind-2 regions are single `RGN ` blocks. Each block contains signed big-endian left/top/right/bottom bounds at byte 4, an unlabelled source word at byte 12, the rectangle count at byte 14, and that many eight-byte left/top/right/bottom rectangles starting at byte 16. The header is a bounding box; the list describes the region. The unlabelled word is preserved as `rawWord12`, rather than inferred to be the count from the coincidentally equal values in these resources.

| Control | MRGN | Source rectangles, left/top/right/bottom |
| --- | --- | --- |
| Backgrounds | 375 | 34, 18, 113, 61 |
| Stickers | 1003 | 41, 90, 120, 133 |
| Animations | 1006 | 45, 155, 127, 198 |
| Sounds & Movies | 1009 | 17, 226, 101, 269 |
| Paper Texture Canister | 1054 | 895, 548, 932, 629 |
| Firehose Screen Eraser | 1089 | 910, 355, 1005, 455 **and** 938, 330, 973, 356 |
| Add Picture to Slide Show | 1082 | 933, 592, 1012, 687 |

Firehose is the important multi-rectangle example. Its bounding box includes empty space beside the narrow upper nozzle. Point `(920, 340)` is outside both source rectangles, while `(950, 340)` hits the nozzle and `(920, 400)` hits the body.

## Executable evidence

Addresses refer to the i386 slice identified in [reverse-engineering.md](reverse-engineering.md). The related button state and rollover paths are documented in [button-animation.md](button-animation.md).

- `RButton::LoadFromCDATA` at `0x00031130` dispatches on MBTN word 4 at `0x000311c2`. Kind 2 enters `0x00031427`, reads word 5, requests resource tag `MRGN` at `0x0003143a` and loads it through `0x0020914a` at `0x00031441`.
- The resulting data reaches region conversion routine `0x0015cad0` through the call at `0x000314e8`. That routine reads the count at byte `0x0e` (`0x0015cafe`), reads the first rectangle at byte `0x10` (`0x0015cb8e`–`0x0015cbaa`), then iterates the remaining rectangles at eight-byte strides (`0x0015cc05`–`0x0015cc26`). The serialized block size is `0x10 + count * 8` at `0x0015ccbb`; it does not stop after the header bounds.
- Generic pointer target selection at `0x0007050c` calls each candidate's virtual point test at vtable offset `0x2c` (`0x000705a0`–`0x000705b8`). The ordinary rollover path uses that hit target, so hover and activation must share the authored region rather than independent broad boxes.

## Browser implementation and limits

`src/native-control-regions.js` places each supported hit button at the source bounds and applies a CSS path with one same-winding subpath per rectangle. Filled subpaths form a union, retaining both the Firehose nozzle and body while excluding the surrounding whitespace. The browser's hit testing therefore drives click, enter and leave through the same geometry. Keyboard activation and focus semantics remain native HTML button behavior. The independently positioned native sprite and rollover layers are never clipped or moved to the hit rectangle.

Malformed, missing and unsupported multi-block records keep their existing hit-box fallback. The remaining 20 kind-1 image-derived controls have now been traced: native construction uses full registered initial-image **bounding rectangles**, including transparent pixels and gaps, rather than alpha silhouettes. Their rest/state1/rollover bounds selection, source evidence, metadata and unmapped-action limits are documented in [image-control-regions.md](image-control-regions.md). CSS-path support is checked before applying recovered geometry, so an unsupported browser also retains the fallback.

Chrome text is not document-selectable, and images suppress native image dragging. Inputs, textareas and editable text explicitly retain text selection. Library tiles retain their explicit HTML drag behavior and application drop handling.

Validation covers byte-14 count interpretation, preservation of every rectangle and the unlabelled field, rejection of malformed geometry, actual Backgrounds hover/leave/action, unchanged art placement, and Firehose excluded-space/nozzle/body behavior at 1024×768 and 800×600. Browser tests also drag across chrome, edit/select title and picture text, and drag a real library tile onto the picture. No native runtime recording has yet verified platform-specific boundary rounding or event latency.

```sh
PYTHONPATH=scripts python3 -m unittest scripts/test_button_animation.py
npx playwright test tests/browser/control-regions.spec.js
```
