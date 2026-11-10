# Crayon and Marker hover geometry

An offline actual-renderer repro demonstrates excess clipping of mode9 tint pixels
in Crayon18068 and Marker18071 on baseline e904502. This patch removes that excess
clip, retaining the ordinary base clip and unchanged input regions. Physical iPad
behavior and native rendered output remain unverified. **BROWSER ACCEPTANCE NOT RUN.**

Source registrations are `origin + authored - REGS`, independently decoded from
supplied Windows `Data/Tools/Tp.MHK` (SHA256
`6423ca0c641c0015e551f020cd18079db0e68a9a84dbfefb9313316663749d41`).
All six tSCR hashes and all registered frames match the earlier independent Mac
source oracles despite the archive as a whole differing. The checked-in fixture
pins source programs, every registered part, dimensions, raw ARGB hashes and
ordinary RGBA conversion hashes; it contains no replacement artwork or web-output
reference images. Source executable SHA256 is
`a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.

| Control | Rest / tracking-selected / hover | Groups | Full registered union LTRB | Hit and ordinary auxiliary clip XYWH |
| --- | --- | --- | --- | --- |
| Crayon | 18066 / 18067 / 18068 | 16 / 16 / 6 | 246,649,339,757 | 274,648,53,109 |
| Marker | 18069 / 18070 / 18071 | 14 / 14 / 5 | 306,640,382,762 | 331,648,53,109 |

Each program in a row has the listed union. All71 poses are independently retained
in `tests/fixtures/tool-hover-source.json`; diagnostic per-pose extents are in the
checkout's `artifacts/t3/ipad-geometry/pose-extents.json`. These are full sprite
rectangles, not alpha silhouettes or permission to enlarge input targets.

The missed distinction is between the ordinary subcall and the custom callback:

- Constructor72e0f–72e46 copies region header bounds; auxiliary setup724b4–724ec
  copies them to animation+b8 and enables +c0. This is valid source clipping.
- Custom callback f73ea–f73f6 temporarily removes part1 and calls ordinary158e1f.
  Ordinary158e45–158ecd installs the auxiliary clip for part0, then
  158f79–158f92 reinstalls global+58 through1c87c6. The latter reaches current
  target virtual+40 at1c8818: clip restoration is inside the ordinary subcall.
- f7448–f74c3 creates the minimum-part-dimension temporary at part0 origin;
  f7502 copies the destination, f758a draws mode9, and f758f–f75af copies the
  rectangle back **after** ordinary clip restoration. No auxiliary+b8 intersection
  is reinstalled. Explicit-target bitmap copy1cb516 resolves target handles;
  its1cb718–1cb7e2 path builds the destination rectangle and calls CopyBits.
- The previous web callback applied the auxiliary rectangle to both parts. Its
  Canvas save/restore correctly ended ordinary clipping, but explicit mode9
  get/put bounds then wrongly reapplied it. Only those mode9 bounds changed.
  Canvas bounds and the source temporary dimensions still constrain the copy.

The offline test paints the real registered source PNG/raw assets through
`paintDrawingMotionFrame` into a software native-coordinate Canvas seam. Its
independent composer uses pinned source registrations and float32 arithmetic,
compares complete destination buffers for all71 poses and three RGB choices,
and requires actual tint changes left of both hover hit rectangles. Before the
fix four state programs passed and both hover programs failed at pose0. After the
fix all six pass. Ordinary PNG/source hashes guard against inventing expected art.
This is an offline renderer check, not a browser Canvas rounding/native oracle.

Restoration remains whole-canvas clear followed by chrome/clean-backdrop repaint
within the union of **all** script parts (`native-tool-motion.js`). Drawing has no
narrower restorationRects override. Those bounds include the off-left tint pixels;
input bindings continue to use the exact MRGN rectangles. No canvas resizing,
registration, RGB math, source art, z-order, interaction or tray overlap changed.

Source geometry and browser assumptions are separate. Static code inspection:
actor canvas is1024×768; layer canvases have no local CSS clip; #studio clips at
1024×768; #surface clips only its own descendants; #app/body clip the viewport.
All affected rectangles lie within the studio. `scaleStudio` uses the minimum
available-width/1024 and available-height/768 and applies the same unrounded scale
to viewport size and studio transform. At1366×1024 height limits scale to4/3,
with1365.333px studio width. Fractional resampling can alter edge pixels but cannot
explain a native-canvas cutoff at x274 or331. No new browser measurements were
made; the parent's prior overflow-visible observation is separate evidence.

Validation: `node --test scripts/parity/drawing-motion.test.mjs
scripts/parity/tool-motion.test.mjs scripts/parity/tool-hover-geometry.test.mjs`
passed31/31; `npm test` passed205/205 with existing assets linked read-only.
`node --check tests/browser/tool-motion-coverage.spec.js` and `git diff --check`
passed. Red/green and full-suite logs are checkout-local under the diagnostic path.

Deferred: run `tests/browser/tool-motion-coverage.spec.js`, including new
`iPad hover geometry` cases, after the performance agent releases browser resources.
Each of1024×768,1366×1024,768×1024 and820×1180 exercises all11 affected hover poses,
full native-canvas pixel comparison, visible studio comparison and leave restoration.
Scaled screenshot comparisons use constant3×3 source neighborhoods to avoid
misclassifying CSS interpolation as clipping; screenshots attach every pose for
edge review. Then repeat on actual iPad Safari/Pencil hover. No browser/server,
performance run, native execution, media export, installation or download occurred.
