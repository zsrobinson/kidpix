# KID PIX 3D web feasibility build

The Paint Zone and Slide Show run in the browser. The build uses static files, and the app loads original artwork and media on demand. The installer stays local.

## Run it

Use Node.js 22.12 or newer. If `public/original/catalog.json` is already present, the trial assets have been imported.

```sh
npm ci
npm run dev
```

Open [the local Paint Zone](http://localhost:5173/). Use the arrow above the editor to open the File, Edit, Paint Zone, and Help menus. The paint tools run immediately. The original library buttons open their category and item trays. Select a thumbnail, then double-click it, press Return, or drag it onto the page. Select a rubber stamp and click the page to stamp it.

## Import the trial on macOS

The import needs Python with Pillow and PyObjC, plus Poppler, ImageMagick, FFmpeg, and WebP tools. On a Mac with Homebrew:

```sh
brew install poppler imagemagick ffmpeg webp
python3 -m venv .venv
source .venv/bin/activate
python -m pip install Pillow pyobjc-core pyobjc-framework-Cocoa
hdiutil attach -readonly KPD3DMac.dmg
npm run import:original
```

If macOS mounts the image under another name, use `npm run import:original -- "/Volumes/Name of mounted volume"`. The import reads the disc and the installer’s resource archive directly. It decodes the installer resources and Mohawk library records, converts the original media into browser formats, and writes the files and catalog to `public/original/`. PNG, JPEG, SVG, WebP, FLAC, and MP4 load directly in the browser. The generated directory is ignored by Git.

## Build for static hosting

```sh
npm run build
npm run preview
```

Serve the contents of `dist/`. Asset paths are relative, so the output can live under a path prefix. The build checks the imported catalog and tray references before bundling. The current output is about 1.7 GiB and the largest movie is 61.3 MiB. Library media loads on demand. For recording, use localhost or serve the app over HTTPS. Confirm that the company has cleared the trial assets for the intended audience before sharing a build.

## Cloudflare deployment

Production uses `https://kidpix.zsrobinson.com`, with source in [zsrobinson/kidpix](https://github.com/zsrobinson/kidpix). The `kidpix` Worker serves the app through Workers Static Assets and reads `/original/*` from the private `kidpix-media` R2 bucket. The browser sees one origin, so canvas drawing and PNG export do not need cross-origin media configuration. The Worker only exposes media reads.

```sh
npm ci
npm run check
```

`check` runs the deployment tests, builds the app, and dry-runs Wrangler packaging. It needs no Cloudflare credentials or imported media. `build:cloudflare` writes only the app to `dist-cloudflare/`; the original library stays out of Git and the static upload. `npm run build` still makes the complete standalone build and verifies the locally imported media.

To populate or update R2, first run `npm run verify:assets` and `npm run media:plan` on the machine with the imported library. Supply `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` through a protected environment, then run `npm run media:sync`. Use an R2 Object Read & Write key scoped to `kidpix-media`. The uploader streams files, preserves the `original/` prefix, checks SHA-256 metadata to skip unchanged objects, retries temporary failures, and never deletes remote objects. Interrupted uploads can be resumed with the same command. Upload media before deploying code that references it. Rerunning the sync checks every object and confirms the upload is complete.

For the first deployment, create the `kidpix-media` bucket, sync the media, and run `npm run deploy` with an authenticated Wrangler session. The custom domain, R2 binding, compatibility date, and observability settings live in `wrangler.jsonc`.

[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) connects the repository with these settings:

- Production branch: `main`; root directory: `/`.
- Build command: `npm test && npm run build:cloudflare`.
- Deploy command: `npx wrangler deploy`.
- Node.js: 24, matching `.node-version`.
- Non-production branch deployments: disabled until an isolated preview configuration is added.

GitHub Actions runs `npm run check` for pushes to `main` and pull requests. Cloudflare Workers Builds handles production deployments from `main`; GitHub Actions does not need Cloudflare credentials. Build and deploy credentials are separate from the bucket-scoped key used for local media uploads. A fresh GitHub checkout never needs the trial installer or media library.

The application receives only its static-assets and R2 bindings, with no Cloudflare API credentials in the browser or Worker environment. Keep R2 public access disabled: the Worker exposes the imported library through read-only routes. Saved pictures, imported personal media, and recordings stay in the browser or downloaded project files; this deployment has no upload endpoint.

After deployment, check `/`, `/original/catalog.json`, a library thumbnail, and a movie byte-range request. Missing media must return 404, and media writes must return 405. Smoke-test drawing, media placement, save/reopen, PNG/stereo export, video seeking, and camera/microphone recording over HTTPS. Media cache lifetimes are one hour, with five minutes for JSON manifests; allow those periods or purge caches when replacing existing files. Worker rollbacks do not roll back R2 objects.

## Fidelity and verification

Tool-control motion includes all 16 primary actors and 52 secondary source rows:
Drawing styles, Painting modes, sizes, Mini Eraser shapes, Stamp controls, Text
formatting/font/size/voice arrows, Read, character clipboard controls, and Grab
clipboard/ordering actions. The secondary rows retain 164 complete programs and
219 authored draw groups. Backgrounds, Stickers, Animations and Sounds & Movies
also use their original rest, press, selected and hover programs, as do all eight
tool-tab buttons. Source recovery runs on Linux using the supplied Mac DMG; see
[secondary control motion](docs/audits/secondary-control-motion.md),
[Text Read](docs/audits/text-read.md), [Text clipboard](docs/audits/text-clipboard.md),
[library button motion](docs/library-button-motion.md) and
[tool-tab motion](docs/audits/easel-tool-tabs.md).
Native popup interiors, additional font faces, rich-text clipboard behavior and
remaining Grab navigation remain follow-up work. The Color Picker uses its seven
authored opening and seven closing poses, source hit sampling and dropper artwork.
Source reconstruction and browser pixel checks do not establish original-runtime
timing or feel; accepted native references remain 0/17. Physical iPad/Pencil
latency and foreground animation loss remain unverified.

Run `npx playwright install chromium` once, then `npm run parity` to run the local browser checks and generate `artifacts/parity/index.html`. The report supports accepted web regression baselines and separately imported original-application screenshots, with overlays and pixel differences. See [the parity workflow](docs/parity.md) for setup, capture recipes and reference import commands. Original-application references are not bundled; missing captures are explicitly reported.

The resource-based parity work restores native selection artwork, original cursors and hotspots, Undo Guy's scripted expressions/sound cues, face undo/redo toggling, and eyedropper preview/picking across paint and placed objects. It also restores native button rollovers, the Stamp Editor artwork/palette, complete Paint Shapes banks, and authored Moving Paints with source selection, registration and timing. Brush masks use recovered density and shadow/glint rules while retaining documented gaps in texture, interpolation and subclass behavior. The original scheduler and rendering code have been inspected to replace timing and placement approximations. See [the resource inventory](docs/resource-inventory.md), [executable findings](docs/reverse-engineering.md), [spray-engine evidence](docs/spray-engine.md), and [brush-engine scope](docs/brush-engine.md).

Tablet input and WebKit checks are documented in [tablet-input.md](docs/tablet-input.md). `npm run test:browser:webkit` runs the optional WebKit lane; the server can use its pinned Docker setup without installing extra host libraries.

With the trial mounted, use `npm run import:ui` and `npm run import:tools` to regenerate those assets without reconverting the media libraries. `npm run test:import` checks the resource decoders; `npm run verify:assets` checks the referenced files. Updated media must be synced before deploying code that uses it. UI/tool asset requests include the app version to avoid stale browser artwork. Published builds expose their version and source revision at `/version.json` and show the version in About.

- The native Paint Zone and Slide Show artwork, sound effects, library ordering, and catalog media come from the supplied trial. The editor uses the original 720×542 drawing area and the original foreground occlusion for layered backgrounds.
- The canvas engine is a browser reimplementation. It uses recovered brush and paper masks, pattern and gradient definitions, and spray imagery where available. The procedural effects, timing, and edge cases still need comparison against a running original.
- Browser pictures and slides use the editable `.kidpix-web` format. PNG and red/cyan still export are available. Native Kid Pix project interchange and original movie and Slide Show export formats remain open work.
- Chrome verification covered drawing and undo, background replacement and occlusion, stamps and paper, text, path playback, camera and microphone recording with synthetic input, framed movies, save and reopen, Flipbook playback, and stereo PNG export.
- The trial executable is 32-bit Intel/PowerPC. The local Apple Silicon Mac could extract its assets but could not run the original. The reference for this build is the bundled Mac user guide, the installer resources and configuration, and browser verification. A compatible Mac or legacy macOS VM is needed for a side-by-side parity pass.
