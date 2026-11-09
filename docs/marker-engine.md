# Native Marker destination blending

The supplied i386 executable's Marker pixel override is `0x00121500`–`0x00121681`. Its vtable and binary identity are recorded in [brush-engine.md](brush-engine.md) and [reverse-engineering.md](reverse-engineering.md). This is static evidence; no running-original recording has verified the complete tool.

The override reads the brush mask byte at `0x0012150c`, then the existing destination pixel. It retains mask 255, unlike the generic routine's 255→254 normalization. Without paper, coverage is mask divided by the cached density divisor (`+0x19c`). With paper, `0x00121571`–`0x0012158d` optionally inverts the texture byte and adds its integer quotient by textureBias to the mask. The divisor gains 254. Marker CFG densityBias is 1; generic construction supplies textureBias 1.

For each channel, the source computes `destination*(1-alpha) + (paint*alpha + 0.5)` using single-precision operations in that order, truncates, and writes the candidate **only when it is darker** than the existing channel (`0x001215c8`–`0x00121659`). This is channel-wise darkening, not a luminance comparison or a fixed translucent global opacity. The original destination alpha byte is retained. The 0.5 constant at `0x0025c29c` is bytes `00 00 00 3f` in the i386 slice.

The Option flag is sampled at stroke begin: `0x00123d21` calls keyboard helper `0x001b7e1c` with 8 and stores its result at `+0x17c`. That helper's jump table maps 8 to Mac virtual key 0x3a (Option) before `GetKeys` (`0x001b7e51`–`0x001b7e7c`). The Marker texture branch uses that flag to invert the byte. A browser Alt/Option stroke must therefore remain a painting stroke rather than silently switching this native media path to eyedropper.

`src/native-marker.js` implements this channel arithmetic and a working raster for a stroke. The paint owner captures the visible opaque background and ink below scene objects, applies each original-size mask against that destination, and puts only changed pixels into the transparent stroke preview. Unchanged page pixels stay untouched. This avoids baking the whole background into the ink layer and avoids quantizing the coefficient into a Canvas alpha channel before computing Marker RGB. Repeated dabs see the preceding dab's destination, so overlapping coverage accumulates correctly. The normal history and commit paths remain responsible for the resulting preview.

Paper is the raw full-page grayscale image, sampled at page coordinates after native bitmap placement. Marker does not pass through the old paper-opacity post-mask. Generic media uses a distinct floating reciprocal texture formula, documented in [brush-engine.md](brush-engine.md). Filled-shape paths that do not invoke original bitmap dabs retain their existing implementation; this investigation does not establish their native fill semantics.

The web drawing surface is 720×542 native pixels. Browser pointer coordinates are floored at the native input boundary. Original OS fractional conversion, native random stream, color-space handling and interaction timing remain unverified. Placed scene objects remain above the ink layer; native object/paint interaction still needs a running-original comparison.

Validation includes fixed colored-destination vectors, repeated coverage, white-paint non-lightening, zero masks, paper inversion, clipping and page-relative texture lookup. Actual-app tests use controlled bitmap/paper fixtures and compare every picture pixel, including exact undo/redo and source spacing behavior.

```sh
node --test scripts/parity/native-marker.test.mjs
npx playwright test tests/browser/brush-engine.spec.js
```
