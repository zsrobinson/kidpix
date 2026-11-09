# Native brush configuration and blending

Static evidence from the supplied trial's i386 executable; executable identity is recorded in [reverse-engineering.md](reverse-engineering.md). The browser now implements the scoped mask, density and offset rules described below. This does not establish complete reproduction of the brush engine, including paper textures, mask accumulation, dry-out and every subclass override.

## Configuration fields

The `RRealMedia` family reads the named CFG keys into signed 16-bit fields. Parser `0x00122690` uses the key-pointer table at `0x00340c88` through `0x00340cb8`; each lookup calls `0x001e6fb4` with the destination field. The key strings remain in the executable.

| CFG key | Object field |
| --- | --- |
| `brushID` | `+0x182` |
| `spacing` | `+0x184` |
| `spatter` | `+0x186` |
| `densityBias` | `+0x188` |
| `textureBias` | `+0x18a` |
| `smearBias` | `+0x18c` |
| `dryOutRate` | `+0x18e` |
| `dryOutThreshold` | `+0x190` |
| `oscillation` | `+0x192` |
| `shadowOffset` | `+0x194` |
| `shadowBias` | `+0x196` |
| `glintOffset` | `+0x198` |
| `glintBias` | `+0x19a` |

This distinction matters: a CFG shadow offset is a geometric displacement, while shadow bias is its blend divisor. The current browser's fixed shadow/glint opacity constants do not represent these source bias fields.

## Generic density and per-pixel blend

Generic density method `0x0012231e` returns:

```text
densityDivisor = 254 * (densityBias == 0 ? 1 : densityBias)
```

At `0x00122327`–`0x0012234c`, it reads `+0x188`, returns the constant 254 when zero, and otherwise multiplies the configured value by the single-precision constant 254 at `0x0025feec`.

Generic pixel routine `0x00123ecc` skips mask zero and converts mask byte 255 to 254 (`0x00123ed8`–`0x00123ef0`). For an ordinary paint pass with no texture input, it obtains the virtual density divisor through method `+0xfc` at `0x00123f4c`, then divides the mask value by it at `0x00123fb1`–`0x00123fba`:

```text
m = maskByte == 255 ? 254 : maskByte
a = m / densityDivisor
outRGB = trunc(destinationRGB * (1 - a) + paintRGB * a)
outAlpha = destinationAlpha
```

The no-extra-color branch reads paint RGB from object `+0x110/+0x111/+0x112` at `0x001240eb`–`0x00124159`. It truncates each resulting component rather than adding a blanket rounding constant. Native arithmetic is single-precision; exact cross-platform pixel matching may require matching its intermediate rounding too.

For the generic method, full mask coverage with density bias 1 is opaque; bias 2 gives 50%, bias 3 gives approximately 33.3%, and bias 5 gives 20%. This contradicts the browser approximation `1 / (1 + density * 0.13)`.

When a texture input exists, the generic routine takes a separate path at `0x00123f6e`–`0x00123faa`: it optionally inverts the texture byte, adds `textureByte / textureBias` to the mask contribution, and divides by `densityDivisor + 254`. Dropping the texture input and applying the untextured formula is still a partial renderer.

## Subclass scope: do not apply a universal opacity

The virtual methods were checked directly in the identified class vtables:

| Class | Vtable | Density method `+0xfc` | Pixel method `+0x108` |
| --- | --- | --- | --- |
| `RRealBrush` | `0x00323e08` | `0x0012231e` | `0x00123ecc` |
| `RAirbrush` | `0x00321150` | **`0x0011b876`** | `0x00123ecc` |
| `RBristleBrush` | `0x003213b0` | `0x0011c2d4` | `0x00123ecc` |
| `RExtrusionBrush` | `0x003238d0` | `0x0012231e` | `0x00123ecc` |
| `RMarker` | `0x00323cd8` | `0x0012231e` | **`0x00121500`** |
| `RChalk` | `0x003214e0` | `0x0012231e` | `0x00123ecc` |
| `RCrayon` | `0x00321740` | `0x0012231e` | `0x00123ecc` |
| `RCustomBrush1`–`RCustomBrush16` | e.g. `0x003219a0` for 1, `0x00322b70` for 9, `0x003221f0` for 16 | `0x0012231e` | `0x00123ecc` |

Bristle's override at `0x0011c2d4` implements the same `254 * (bias || 1)` formula. Its other setup and texture/smear behavior can still differ.

**Airbrush is different:** method `0x0011b876` obtains a normalized random float, multiplies it by density bias, adds 0.5, truncates, adds 1 and multiplies by **255** (`0x0011b880`–`0x0011b8b9`, constant `0x0025d0ac`). Its divisor is:

```text
airbrushDivisor = 255 * (1 + trunc(randomFloat * densityBias + 0.5))
```

The generic pixel method invokes this virtual method for each ordinary pixel blend. Airbrush opacity therefore varies per pixel; applying one `1 / densityBias` global alpha to the whole Airbrush dab would be incorrect. For CFG density bias 4, the divisor can be 255, 510, 765, 1020 or 1275.

`RRealBrush` also uses a distinct paint/coverage-composition path (`+0x4c = 0x001219ba`), while CustomBrush1–16, Chalk and Bristle use `+0x4c = 0x00122f7c`. Marker has its own pixel method. The generic divisor is a proven parameter rule, not proof that a single `drawImage` with that alpha reproduces all those tools.

## Shadow and glint: exact source offsets and bias

The generic dab routine `0x00122f7c` processes shadow, glint and ordinary paint separately:

- A nonzero `shadowOffset` at `+0x194` shifts **both x and y by the full positive offset** at `0x001232ba`–`0x001232f7`. It selects the shadow RGB provider through virtual method `+0xd8` at `0x00123367`; the generic provider `0x00122136` returns `(0,0,0)`. Pixel calls pass mode 1 at `0x0012350b`–`0x0012351b`.
- A nonzero `glintOffset` at `+0x198` shifts **both x and y by the full negative offset** at `0x00123639`–`0x00123679`. It selects the glint RGB provider through `+0xdc` at `0x001236e9`; the generic provider `0x0012214e` returns `(255,255,255)`. The corresponding pixel pass uses mode 2.
- The ordinary paint-color provider is called through `+0xd4` at `0x0012399c`, after the offset passes.

Pixel method `0x00123ecc` uses `mask / (254 * shadowBias)` for mode 1 (`0x00123f0f`–`0x00123f33`) and `mask / (254 * glintBias)` for mode 2 (`0x00123f38`–`0x00123f42`). These modes bypass the ordinary density divisor. The source parameters are already in native image-coordinate units; view/display scaling is a separate transform.

Consequently fixed opacities 0.18/0.28 and offsets `shadow/3`, `shadow/2` and `glint/2` cannot reproduce these branches. A narrow improvement can use the source offset and bias values for the generic passes, while retaining explicit gaps for texture, smear and subclass-specific behavior. Generic shadow is black rather than the browser's approximate dark red.

## Spatter and spacing leads

The generic spatter predicate at `0x00124246` obtains a normalized random float and accepts a mask pixel when `trunc(randomFloat * spatter + 0.5) == 0`. The dab loop invokes it for each nonzero mask pixel through virtual method `+0x100` (`0x00123b3d`–`0x00123b84`). Airbrush's predicate `0x0011b8c8` has the same formula. This is a random per-pixel acceptance test, not a deterministic coordinate hash that merely lowers some pixels to 10% opacity.

CFG spacing is copied to tool `+0x60` when nonzero at `0x00123eb1`–`0x00123ebd`; zero uses a separate tracking branch at `0x0012242c`–`0x001224ba`, including stationary painting. For nonzero spacing, the tracking handler first compares absolute x/y displacement against the threshold (`0x0012243a`–`0x00122462`) and calls line helper `0x00137556` when due. That helper follows an integer line path and measures steps along the dominant axis: it compares accumulated signed dominant-axis distance with `+0x60` at `0x001376b5`–`0x001376e9` or `0x0013778d`–`0x001377be`. This differs from uniformly stepping Euclidean arc length. Endpoint and stroke-boundary behavior should be retained if porting this helper; replacing only its distance formula would not reproduce the complete native interpolation.

## Implemented scope and remaining differences

[paint-original.js](../src/paint-original.js) now uses source mask normalization and the generic density divisor; its Airbrush path samples the verified random divisor for each accepted mask pixel. Dynamic Airbrush/spatter masks are not cached. It applies the verified random pixel-acceptance predicate, including the CFG Chalk value 1 rather than the previous hardcoded value 2.

The generic offset passes now draw black shadow at `(offset, offset)` and white glint at `(-offset, -offset)`, with source bias opacity. Their order is shadow, glint, then ordinary paint, matching native routine `0x00122f7c`. All examined built-in/material and CustomBrush1–16 vtables retain generic black/white providers at slots `+0xd8/+0xdc`.

The formerly omitted bias fields are copied from the supplied **KPD3.cfg**, with no fitted opacity constants:

| CFG section | Shadow bias | Glint bias |
| --- | --- | --- |
| RealBrush | 0 | 0 |
| Airbrush | 7 | 0 |
| BristleBrush | 10 | 0 |
| ExtrusionBrush | 0 | 0 |
| CustomBrush1 | 12 | 1 |
| CustomBrush2 | 7 | 2 |
| CustomBrush3 | 30 | 3 |
| CustomBrush4 | 1 | 1 |
| CustomBrush5 | 2 | 0 |
| CustomBrush6 | 3 | 0 |
| CustomBrush7 | 5 | 1 |
| CustomBrush8 | 3 | 2 |
| CustomBrush9 | 15 | 1 |
| CustomBrush10 | 7 | 1 |
| CustomBrush11 | 3 | 1 |
| CustomBrush12 | 20 | 3 |
| CustomBrush13 | 0 | 0 |
| CustomBrush14 | 2 | 0 |
| CustomBrush15 | 4 | 1 |
| CustomBrush16 | 0 | 0 |

Zero entries above are omitted CFG keys retaining the native constructor's zero bias defaults (`0x001245e9`–`0x001245f3`); their corresponding offset pass is absent. Every active shadow/glint pass in these records has an explicit positive source bias.

The renderer still paints into a transparent preview and lets Canvas composite its colored masks. It therefore quantizes coverage into an 8-bit alpha channel rather than duplicating the native floating-point RGB loop byte for byte. The native destination-dependent Marker override is explicitly excluded from the generic mask path: it retains its previous approximation until the renderer can access the underlying artwork for darken-only blending. Marker should not be described as fixed by this change.

Other remaining differences include texture input and inversion, smear feedback, RealBrush coverage accumulation, Bristle-specific smear/setup, exact dry-out dissipation, native circular oscillation instead of existing rectangular jitter, native random-number-stream consumption, material-size scaling, and dominant-axis integer stroke interpolation. Existing dry-out and jitter approximations were not changed. The masked blend correction does not make a paper-textured brush equivalent to its untextured rendering.

Run the focused source-fixture checks with:

```sh
node --test scripts/parity/native-brush.test.mjs
```

They exercise mixed grayscale masks and expected RGBA pixels, density-zero fallback, separate shadow/glint bias, Airbrush random coverage, spatter rejection, real CFG entries, pass ordering/geometry, and fresh random masks on successive Airbrush dabs. The raster-surface fixture copies source pixels without implementing density/bias/spatter formulas, so the real draw entry point is checked as well as the pure mask conversion.

The actual-application browser case in [brush.spec.js](../tests/browser/brush.spec.js) also passed: the real Painting Tools → Dry Brush → Small flow requests source bitmap 1022, supplied by a deterministic 2×2 grayscale fixture. Its committed pixels match the expected half-coverage/opaque/zero-mask samples exactly, only three page pixels change, and undo/redo restores exact canvas snapshots. This checks the implemented mask-coverage path; it does not validate total native Dry Brush behavior.
