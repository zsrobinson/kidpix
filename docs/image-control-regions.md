# Kind-1 image-derived button hit rectangles

All 20 kind-1 records in the Easel `MBTN` table 75 now export exact native hit geometry. The seven kind-2 `MRGN` records remain unchanged, giving 27 recovered records. **Kind 1 creates a rectangle from initial script image bounds. It does not create an alpha silhouette.** These findings come from the supplied executable and resources; they have not been measured in a running native application. Binary identity is recorded in [reverse-engineering.md](reverse-engineering.md).

## Control construction and hit testing

`RButton::LoadFromCDATA` (`0x00031130`) initializes the rest script from MBTN word 0 (`0x00031180`–`0x000311bc`) and branches on word 4. Kind 1 enters `0x00031202`. The temporary region created there is passed to animation initialization/update for invalidation bookkeeping; it is **not** passed as the hit-control shape.

The kind-1 path calculates a rectangle in button fields `+0xa0/+0xa2/+0xa4/+0xa6`:

1. It initializes/updates the rest animation once and copies the animation's current rectangle at `0x00031247`–`0x0003127b`.
2. If MBTN state-script word 1 is nonzero, it initializes/updates that animation once, then unions its rectangle into the preceding rectangle through `0x001e69cb` at `0x00031305`.
3. If MBTN rollover-script word 10 is nonzero, it initializes/updates that animation once, then **replaces** the preceding rectangle with its current rectangle at `0x00031397`–`0x000313cb`. This is assignment, not a union with every rollover frame.
4. It calls rectangle-control constructor `0x0003102a` at `0x0003141d`.

`0x0003102a` initializes the control descriptor through `0x00073090` → `0x00073006`, whose `+4` region pointer defaults to zero (`0x00073017`). It copies the calculated rectangle into descriptor `+8..+0x0e` (`0x0003108d`–`0x000310b5`) and creates the control through `0x00072dea` at `0x000310ef`, leaving that region pointer null. The contrasting kind-2 constructor `0x00030f4a` explicitly supplies the source region in descriptor `+4` at `0x00030fb6`–`0x00030fb9`.

Control constructor `0x00072b54` stores descriptor `+4` as control `+0x134` at `0x00072c40`–`0x00072c43`, and descriptor bounds as `+0x138/+0x13a/+0x13c/+0x13e` at `0x00072c14`–`0x00072c39`. The point test at `0x000727c4` uses a region only if `+0x134` is nonnull (`0x000727cd`–`0x000727e1`). Otherwise its comparisons at `0x000727eb`–`0x00072814` are exactly:

```text
left <= x < right && top <= y < bottom
```

There is no bitmap, alpha channel, color-key or pixel-coverage test in that rectangular branch. Thus adding an alpha-derived CSS clip would reduce the native clickable area incorrectly.

## How the initial animation rectangle is calculated

Animation update `0x0015a174` reads the first image group from the program starting at byte 26. It strips the four high flag bits from each one-based sub-bitmap ID at `0x0015a445`–`0x0015a456`. Script initialization supplies the header origin, and the interpreter adds that origin to each raw script x/y (`0x0015a3df`–`0x0015a3f5`, `0x0015a45a`–`0x0015a479`).

When the bank has registration resources, `0x00158b4e` subtracts each image's signed big-endian `REGS` x/y from its position (`0x00158baa`–`0x00158bbe`). This happens before bounds calculation. Native image bank registration is one-based: entry 0 is not the first image's registration.

The ordinary bounds branch at `0x0015a8e9`–`0x0015a9ce` initializes the animation rectangle from the first valid part's registered position plus its **full sub-bitmap width and height** (`0x0015a913`–`0x0015a94b`), then unions the remaining part rectangles through `0x001e69cb` (`0x0015a987`–`0x0015a9be`). The alternate invalidation-region branch at `0x0015a803`–`0x0015a8ce` likewise unions full image rectangles and copies their bounding rectangle. Neither branch scans bitmap pixel contents. Multiple separated parts therefore still produce one bounding rectangle, including their intervening gap.

`0x001e69cb` is rectangle union in place: an empty destination copies a nonempty source at `0x001e6a1d`; with two nonempty inputs it takes the minimum left/top and maximum right/bottom at `0x001e6a3a`–`0x001e6a7d`. It is neither intersection nor a union of bitmap silhouettes.

All affected Easel initial programs have one supported first image group preceded only by interval/sound instructions, followed by a wait or end. The exporter deliberately reads that initialization independently of later animation frames. For example, state script 1039 has a trailing alternate program that remains unsupported as a complete playback timeline, while its initial image group and hit bounds are fully recoverable. Unsupported playback is not silently treated as supported animation.

## Recovered kind-1 rectangles

Coordinates are native master-image pixels, as left/top/width/height. All listed controls except Stop and record 26 obtain their final hit rectangle from the rollover script's initial group. Stop and record 26 use the union of rest and state 1 initial bounds.

| Native record | Final source script | Rectangle |
| --- | --- | --- |
| Mixer Tools | 1023 | `75,427,56,56` |
| Grab Tools | 1032 | `20,551,56,56` |
| Eraser Tools | 1035 | `76,551,56,56` |
| Text Tools | 1029 | `76,489,56,56` |
| Rubber Stamp Tools | 1026 | `20,489,56,56` |
| Drawing Tools | 1014 | `20,365,56,56` |
| Painting Tools | 1017 | `76,365,56,56` |
| Paint Bucket Tools | 1020 | `19,427,56,56` |
| Extended Help | 1081 | `968,289,36,34` |
| Print Picture | 1050 | `954,207,55,53` |
| Play Picture | 1040 | `915,21,87,87` |
| Stop Picture | 1045 | `915,21,87,87` |
| Go to Slide Show | 1084 | `930,695,90,60` |
| Save Picture | 1037 | `899,149,55,53` |
| Close Picture | 1088 | `926,468,75,62` |
| Create New Picture | 1048 | `899,207,55,53` |
| Export to 3D | 1125 | `954,148,55,53` |
| Undo arrow | 1132 | `28,322,29,29` |
| Redo arrow | 1136 | `105,322,29,29` |
| Record 26, command 1463 | 1137 | `392,24,260,24` |

Record 26 gives particularly direct evidence: script 1137 draws Easel sub-bitmap 260, whose entire **260×24 RGBA image is transparent zero**. Native control construction nevertheless retains its rectangle at the title-field location. Its command is 1463 (`0x5b7`); the precise action has not been traced. It is not mapped to Undo Guy or another unrelated browser control.

The browser currently has 25 matching hit-control actions for the 27 records. The separate Stop record has no distinct HTML button; the Play button changes to Stop Picture during playback, and the recovered Play/Stop rectangles are identical. Record 26 remains unmapped. Color Swatch and Undo Guy are existing custom browser controls outside this recovered 27-record mapping. **Recovered record count and bound HTML control count are different claims.**

## Export and browser integration

[button-animation.py](../scripts/button-animation.py) now adds `hotspotRegion` for kind 1 using the existing `rectangle-union` schema with one rectangle. It preserves `sourceKind`, source script, `boundsSelection`, and `initialScriptBounds` for rest/state1/rollover. Each initial script entry preserves its origin, bank, raw image IDs, raw positions, registration offsets and full part rectangles, making the geometric result reviewable.

The existing [native-control-regions.js](../src/native-control-regions.js) already accepts this schema. Its CSS path clips the HTML hit target alone; it does not move or clip the separately rendered static/rollover artwork. Click, hover and leave share the recovered rectangle. No runtime geometry type or JavaScript behavior change was needed. The application can regenerate its existing UI manifest through the normal UI importer and distribute that metadata with its other source assets.

The initial-program parser rejects missing scripts/banks, incomplete registration pairs, unsupported initial instructions/continuations, missing or malformed image groups, and invalid image references. Such a button retains an explicit unsupported geometry entry and the application's existing fallback. Unknown hotspot construction kinds likewise remain unresolved. Later script playback limitations and unmapped actions remain explicit.

Validation: `PYTHONPATH=scripts python3 -m unittest scripts/test_button_animation.py` passes **13 tests**, including the existing MRGN cases. New fixtures use independent mixed-alpha and fully transparent bitmaps, disconnected parts, negative registration, a state1 bounds union, rollover replacement, and a later frame far outside the initial group. Another fixture proves a trailing alternate program can remain unsupported for playback while its known initial geometry exports exactly. A read-only export from the supplied Easel archive recovered **20 exact kind-1 + 7 exact kind-2** records; its complete-timeline results remain 78 supported scripts and two unsupported scripts.

Both actual-application checks in [image-control-regions.spec.js](../tests/browser/image-control-regions.spec.js) passed on isolated dev port 4177. They cover the changed Painting Tools boundaries and transparent corner at 1024×768 and 800×600, unchanged artwork placement, exact metadata/binding counts, and Undo excluded-strip/corner behavior with real artwork history. This isolated run overlaid the generated source `buttonAnimations` export on the served UI response while preserving every other UI field; it did not modify public assets. Normal test runs load the real served manifest, while `KIDPIX_BUTTON_REGIONS_FIXTURE` optionally selects that isolated metadata overlay. Full-suite validation against final regenerated files remains separate; native runtime boundary-rounding and event-latency parity remain unmeasured.
