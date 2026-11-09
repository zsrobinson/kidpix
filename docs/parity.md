# Local testing and original-application parity

The workflow has two independent references: accepted web captures prevent regressions, and captures from a running original measure visual differences. A passing browser test is not evidence of native parity. Native reference files are never created from web screenshots or from the extracted artwork.

## Run locally

Use Node 22.12+ and the imported trial library in `public/original/`:

```sh
npm ci
npx playwright install chromium
npm run parity
open artifacts/parity/index.html
```

On a headless Ubuntu machine, install the browser's system dependencies with `npx playwright install --with-deps chromium`. Copy the already imported `public/original/` library separately; a Git checkout does not contain it. Download `artifacts/parity/` to inspect the report locally. The report embeds its images and can be opened directly without a server.

The suite starts its own Vite server on `127.0.0.1:4174` and stops it afterward. It refuses to reuse a server on that port. It uses real imported media without contacting production, and does not copy the media library into a build. Missing local assets produce an import instruction. Run `npm run verify:assets` if the import appears incomplete.

Before publishing, also run `npm run test:browser:build`. It builds the actual Cloudflare bundle and serves it on `127.0.0.1:4175`, with original media streamed separately from the local import. This catches differences between development and built URLs, including cursor URLs consumed by stylesheets under `assets/`. It does not copy the media library into the build. Results stay under `artifacts/browser-build/` and do not replace the comparison report.

`npm run test:browser:headed` shows the browser as it runs. Failure screenshots, downloads and Playwright traces are in `artifacts/browser/`. Open a failure trace with `npx playwright show-trace /path/to/trace.zip`. `artifacts/parity/results.json` records the revision, uncommitted-change flag, browser/OS environment, successful captures, comparison errors and pixel counts. Filter a test with `npm run test:browser -- --grep pencil-line`; a filtered run produces a partial report and cannot be accepted as a complete baseline.

The browser suite covers:

- Eight comparison states: empty Paint Zone, pencil straight line, filled box, painting tray, large Air Brush selection, background tray, placed sticker and Slide Show with one picture.
- Drawing, exact canvas undo/redo, saving a picture containing ink and a sticker, clearing it, reopening it, and checking exported PNG dimensions and an ink pixel.
- Drawing at an 800×600 viewport to verify pointer-to-page coordinate mapping.
- Undo Guy face toggling, independent history arrows, animation placement/completion and restoration of the idle composition.
- Native tool/size/effect selection artwork, stroke-size behavior, and removal of stale baked-in option highlights.
- Eyedropper preview/cancel/commit, picking a placed image above blank ink, and the recovered cursor/hotspot.

Browser exceptions, failed asset requests and HTTP errors fail the tests. Captures wait for manifests, library rendering, visible images, backgrounds and fonts. Screenshots use a 1024×768 frame at device scale 1, a fixed locale/timezone and a seeded web random generator. The seed makes our own captures repeatable; it does not reproduce the original's random effects. The first scenarios deliberately use static states.

The cursor and scripted-animation checks require the updated UI import. With the trial mounted, run `python3 scripts/import-ui.py` using the Python environment configured for the original import. `npm run test:import` checks the standalone animation command and cursor decoders; the cursor tests require Pillow. These local import tests are separate from the asset-free Node/Cloudflare checks.

## Accept web regression baselines

Inspect the comparison screenshots after a successful complete run, then:

```sh
npm run parity:baseline
npm run parity
```

The baseline command deliberately replaces only `parity/web-baselines/`. Subsequent runs fail if pixels differ from an accepted web baseline. An OS release, CPU architecture or browser-version change also fails comparison; compare on the original environment or inspect and explicitly accept a new baseline. Baseline acceptance can accept an intentional visual change after the browser behavior tests pass. It cannot modify native references.

Baseline files, native screenshots and generated reports are local and ignored by Git because they contain original artwork. A clean checkout begins with no screenshot baselines. The normal `npm run check` remains asset-free: it runs deployment and comparison-engine tests, builds Cloudflare output, and dry-runs packaging. Browser checks are a separate local command because they require the imported library. No browser screenshot job is enabled in CI yet.

## Capture the original

The supplied installer is the Mac edition. The original is a 32-bit Intel/PowerPC application, so it needs a compatible legacy Mac environment. Installing the web suite on Ubuntu does not make that executable run. An Intel/AMD Ubuntu server could host an x86 guest for investigation, but a compatible guest OS installer and a working original app session are still needed. No guest image or VM has been provisioned by this workflow.

Capture the application client area at exactly **1024×768 physical pixels**, without OS menus, title bars, window borders or display scaling. Keep the default English labels and specified titles. Do not resize screenshots to fit; resizing blurs and shifts the artwork. On a larger desktop, crop the exact application rectangle when importing.

Every capture recipe is in `tests/browser/scenarios.js` and is repeated in the report. Start each recipe from a new picture. Coordinates are relative to the 720×542 drawing page whose top-left is application (164, 67). Keep timing and pointer positions consistent. For pixel-exact drawing comparisons, replay the specified endpoints; hand-drawn strokes will add input differences to engine differences. Preserve the raw full-screen screenshot separately if a crop was necessary.

For example, after reproducing `paint-empty` in the running original:

```sh
npm run parity:reference -- paint-empty /path/to/native-empty.png \
  --source "Kid Pix Deluxe 3D trial, app version, guest OS version, capture details"
```

For a full desktop screenshot with the application's top-left at (100, 80):

```sh
npm run parity:reference -- paint-empty /path/to/native-desktop.png \
  --crop 100,80,1024,768 \
  --source "Kid Pix Deluxe 3D trial, app version, guest OS version, capture details"
npm run parity
```

The importer accepts PNG only, validates the dimensions and crop, records the source/recipe/import timestamp, and refuses to overwrite an existing native reference without `--replace`. Record the actual capture date in `--source` if it differs from import time. Use the scenario IDs listed in `tests/browser/scenarios.js`. The original pictures and web `.kidpix-web` files are different formats; this workflow compares screenshots, not native project interchange.

## Read the report and improve parity

Each available reference gets side-by-side images, an opacity slider overlay, a red pixel difference mask and counts for the whole application frame. Paint Zone captures also report the drawing area and the surrounding controls separately, so a large white page cannot conceal interface differences.

Pixelmatch uses threshold 0.1 and excludes classified anti-alias differences. This is a visual diagnostic, not a percentage of features implemented. Native differences do not fail the run while we are establishing fidelity; invalid reference files or incompatible web baselines do. Missing native references remain explicitly missing. No native comparison is inferred from a web baseline.

Choose one discrepancy at a time: reproduce the recipe, inspect overlay/diff, change the implementation, rerun, then inspect and accept the intended web baseline change. Extend the scenarios with background occlusion, stamps, brush masks, gradients, paper, text and animation once matching native captures are available. Audio, motion timing, recording, native project interchange and movie export need behavioral or timed-media references beyond these still-image comparisons.

Static reverse engineering has already recovered the original wait interval, frame order, registration offsets and sound-cue mapping for the 20 Undo Guy routines. The browser follows those records, including repeated waits and the immediate terminal wait. See [the binary evidence](reverse-engineering.md) for reproducible addresses and [the DMG inventory](resource-inventory.md) for further authored animation material. No native runtime recording has yet verified interruption behavior, event-loop jitter or audio latency. Several cursor-to-tool assignments are based on visual glyph identification, explicitly recorded in the generated cursor manifest; undecoded cursor encodings remain unsupported.
