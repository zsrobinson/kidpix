# Moving the web project to another machine

A committed source checkout plus the complete imported `public/original/` library
is sufficient for web development and local dev/built browser suites. No second
DMG extraction, original-app installation, Cloudflare login or fleet environment
profile is needed. The packaging command below uses Node built-ins and Git only.

## Release boundary

The Ubuntu migration checkpoint was **0.6.0**, source
`7717f68ffae02f26884cb3f17f886a9f4dd648e8`, at
<https://kidpix.zsrobinson.com>. It enables all 16 primary tool actors plus 23
secondary selector rows. Its 157 Node checks, 206 development browser cases and
195 built-browser cases passed. Public verification passed 194 behavior cases
plus the exhaustive media transport case in a separate targeted rerun.
The Ubuntu migration is complete; development and credentials live on the server
independently of the laptop. Later release and validation results belong in
[releases.md](releases.md), not in this historical transfer procedure.

Before a future transfer, finish the release checks, stage referenced media,
commit source and verify the public [version.json](https://kidpix.zsrobinson.com/version.json).
Create and verify a media-inclusive package from a clean committed tree. Keep
this machine/library until the receiver passes its own checks; credentials are
configured independently and never bundled.

The comparison suite has **17 static capture recipes and 0/17 original-runtime
references**. Source extraction and browser checks do not establish native timing,
audio latency or subjective feel. The unmodified Windows trial passes QuickTime
initialization in Wine but rejects its elevated token; the original drawing UI
has not run. A compatible original runtime is still required for native capture.

## Receiving-machine prerequisites

- Git and **Node 24**, matching `.node-version`, with npm. `package.json` permits
  Node **22.12.0+**. The transfer script was exercised with Node 24.22.2 / npm
  11.19.1 on macOS. Use a supported macOS or Linux environment for the documented
  workflow; other platforms have not been tested by this handoff.
- Network access for the first `npm ci` and Playwright browser installation, and
  enough disk for source, dependencies, the roughly 1.8 GiB imported library,
  transfer copy and test artifacts. A standalone `npm run build` also copies the
  library into `dist/`; it is unnecessary for the built browser harness.
- Install Playwright's matching Chromium **after** `npm ci`:
  `npx playwright install chromium`. On headless Ubuntu use
  `npx playwright install --with-deps chromium` to install required system
  libraries too (system package installation may need administrator privileges).
- Free ports **4174** (dev browser suite) and **4175** (built suite). Both harnesses
  own their server and refuse to reuse an existing one. Ordinary `npm run dev`
  uses Vite's default port, normally 5173.

No `.env` or `.dev.vars` is needed for these local commands. Wrangler's dry run in
`npm run check` does not need a provider login. Install credentials separately only
if later work explicitly requires deployment or media upload. Never copy fleet
profiles, provider logins, browser sessions or private keys into this package.

## Create the transfer

Run from the repository root. Substitute a real **existing parent directory** for
`/path/to/transfer`; the output package directory itself must not exist and must
be outside the checkout.

```sh
git status --short
node scripts/prepare-handoff.mjs create /path/to/transfer/kidpix-release --include-media
node /path/to/transfer/kidpix-release/prepare-handoff.mjs verify /path/to/transfer/kidpix-release
```

Omit `--include-media` for a source-only package. Such a package supports install
and asset-free checks; browser development/tests additionally need the imported
library. Do not mistake a source-only transfer for a complete media backup.

The command refuses dirty tracked or untracked source, existing outputs,
symlinks/submodules, unsupported media and known credential paths. It clones the
current clean `HEAD` through local Git file transport at depth one, then removes
remotes, hooks, templates, reflogs and host configuration. The restored `handoff`
branch retains the exact source commit, including its build revision identity,
without the source repository's history, ignored files or local configuration.
It checks `HEAD` and cleanliness again after copying and verifies the package.

Only tracked source, newly generated minimal Git metadata, the portable script
and optionally `public/original/` enter the package. `node_modules/`, build output,
DMGs, application bundles, research artifacts, personal pictures/projects,
screenshots, browser downloads, caches and unrelated home files are excluded.
The media allowlist covers the existing imported roots/formats and gzip animation
bundles. Unexpected files fail for review; there is no arbitrary include option.
Finder `.DS_Store` and AppleDouble `._*` metadata inside the imported library are
skipped. This is a bounded transfer command, not a general secret-content scanner;
keep credentials out of tracked source.

```text
kidpix-release/
  prepare-handoff.mjs       portable verify/restore command
  handoff.json              format, exact revision, version, mediaIncluded, files
  source/                   tracked source and sanitized shallow .git
  media/public/original/    present only with --include-media
```

`handoff.json` inventories every package payload file with its relative path,
byte length, executable bit and SHA-256 over the exact bytes. `verify` checks
missing, changed and extra files, forbidden paths, Git revision and cleanliness.
`restore` verifies before copying and verifies the restored bytes afterward.
An unsuccessful create/restore removes only the new output it created; it never
merges with an existing directory. Package verification disables optional Git
index writes, so checking a transferred package does not alter its inventory.

Copy the **whole package**, including `source/.git`, using a transport that
preserves executable permissions. A tar archive is convenient:

```sh
tar -czf /path/to/transfer/kidpix-release.tar.gz -C /path/to/transfer kidpix-release
```

Use a new archive name too; `tar` itself does not supply the script's overwrite
protection. Extract into a fresh parent directory on the receiving machine and
run `verify` there before restoring. Retain a trusted copy of the inventory or an
archive checksum separately. The hashes detect corruption; they do not authenticate
an untrusted package/script.

For an independent inventory of the current imported library without making a
media copy, run from the source root:

```sh
node scripts/prepare-handoff.mjs inventory-media /path/to/transfer/media-inventory.json
node scripts/prepare-handoff.mjs verify-media /path/to/transfer/media-inventory.json
npm run verify:assets
```

The first command exclusively creates the inventory; the second rehashes the
library and checks its exact file set. Media inventory paths start with
`public/original/`, so they are independent of the machine's absolute paths.
Checksums cover all accepted files, including assets beyond the older
`verify:assets` reference checks. Checksums alone do not prove that manifests or
animation compositions are semantically correct; the browser suites cover that.
During full packaging, the library is inventoried before copying, the copied
bytes are compared, and the original is inventoried again to detect changes.
Always stop writers first.

## Restore and validate

The package and destination below are distinct locations. The destination parent
must exist; `kidpix` itself must not exist, even as an empty directory.

```sh
node /path/to/kidpix-release/prepare-handoff.mjs verify /path/to/kidpix-release
node /path/to/kidpix-release/prepare-handoff.mjs restore /path/to/kidpix-release /path/to/work/kidpix
cd /path/to/work/kidpix
git rev-parse HEAD
git status --short
npm ci
npx playwright install chromium
npm run verify:assets
npm run check
npm run parity
npm run test:browser:build
```

Use the Ubuntu browser install command above if applicable. `npm run check` runs
Node tests, **builds `dist-cloudflare/`** and dry-runs Wrangler packaging. The built
browser suite also builds that directory, then serves local imported media
separately; neither command deploys or uploads media. Run those build commands on
the receiving machine after the release is finalized. Run `npm run dev` for
interactive editing; stop it when done. No extraction/import command is needed.

Open `artifacts/parity/index.html` after the dev suite and inspect any failures.
Build results stay in `artifacts/browser-build/`. A transfer deliberately carries
neither `parity/web-baselines/` nor `parity/references/`: both are ignored capture
artifacts. A fresh machine can run all suites, but will report missing comparisons
until captures are separately imported or new web baselines are explicitly
inspected/accepted. Browser/OS changes also require baseline review. Never turn a
web screenshot into a native reference. See [parity.md](parity.md).

After the release owner publishes, `npm run test:browser:live` checks the public
entry point without a local server. `KIDPIX_TEST_ORIGIN` can point it at another
explicitly chosen deployment. This does not replace the local imported-media
checks or establish native parity.

The restored branch has no remote. For continued work, configure the source
remote explicitly if needed:

```sh
git remote add origin https://github.com/zsrobinson/kidpix.git
git fetch --unshallow origin
git switch -c next-pass
```

The fetch requires network access and that the source revision has been published;
local development does not require it. Check the fetched branch before later
merging or pushing. No provider credentials are bundled.

## Asset layout and later source investigation

- `public/original/catalog.json` indexes the imported libraries: backgrounds,
  frames, ideas, movies, sounds, stamps, stickers and toons. Keep thumbnails,
  animations, stereo counterparts and occlusion layers together with their
  catalog; copying only visible previews is insufficient.
- `guide/` contains extracted guide artwork. `ui/` contains frame/tray/library
  artwork, cursors, source sprites, sound cues and their manifests. `tools/`
  contains recovered drawing resources, atlases and metadata shards.
- `ui/drawing-motion/` retains its standalone manifest, PNG/raw ARGB pairs and
  cues. The focused release uses `ui/tool-motion/manifest.json` with
  `{version:1,trays:{draw,paint,bucket,mixer,eraser}}`, preserving each per-tray
  manifest shape. Clean tray backdrops are under `tool-motion/backdrops/` and
  indexed by the manifest's top-level `backdrops` map. Transfer all applicable
  views, including nondefault tool effects.
- A tray's optional `bundle` records a relative path, `compression:'gzip'`, the
  compressed SHA-256 and decompressed byte length; per-sprite `bundleOffsets`
  locate exact ARGB/PNG payloads. Preserve the individual `image`/`argb` fallback
  files and cues too. The browser decompresses the bundle itself; future hosting
  must not add `Content-Encoding: gzip` to these bundle objects.
  The exported bundles use `.bin` filenames containing gzip bytes; compression
  comes from manifest metadata. This also avoids development servers treating
  a `.gz` suffix as automatic HTTP content encoding.

Regenerating assets is optional and separate from running the transferred web app.
It requires the original read-only mounted Mac trial, Python with Pillow and
PyObjC (`pyobjc-core`, `pyobjc-framework-Cocoa`), macOS Foundation, Poppler
(`pdfimages`), ImageMagick (`magick`), FFmpeg and WebP tools (`img2webp`). See the
Mac import commands in [README.md](../README.md). Do not rerun the broad importer
over the finalized library as a setup step. Original installer/executable,
disassembly and research artifacts are outside this package; any future deeper
reverse engineering needs those separately sourced inputs. The portable media
is enough for the documented web commands, not for running the original app.

## Checks performed for this handoff

On 2026-11-09, the script was run against a temporary clean checkout of
`8caa5334f6a4bc33e25b926c01709ae8245d79c5`. Source-only create, verify and restore
preserved the exact Git revision, clean status and working Git object graph
(`git fsck`); the restored checkout had no remotes. Refusal checks covered existing
outputs/destinations, dirty tracked and untracked source, in-checkout output,
changed/extra files, path traversal and symlinks. `npm ci` succeeded there and
`npm test` reported **137 passed, 1 skipped, 0 failed**; the skipped test requires
local original assets. A small synthetic media library additionally exercised
media-inclusive copying/restoration, raw/gzip preservation, credential and media
symlink refusal, Finder metadata exclusion, and repeated portable verification
after file timestamps changed. It was not a package of the actual library.

The actual imported library was independently inventoried and reverified:
**9,914 files / 1,861,212,095 bytes**, excluding Finder metadata. The existing asset
verifier passed **4,343 library items / 8,766 referenced files**. These are a
pre-animation-release snapshot, not a final export count. The release owner must
repeat the inventory and full-media package after the animation commit. This
handoff pass did not build `dist-cloudflare`, deploy, upload media, create a VM or
run browser suites.

## Remaining priorities

1. Complete and release the focused cross-tab tool-control animations; verify
   source hit regions, finite state scripts, shared progress, selection disabling,
   cue ownership, cancellation/retry and clean-backdrop composition in the actual
   studio. Preserve editable text selection and library dragging.
2. Make the final media-inclusive package, restore it on the next machine and run
   the complete commands above. Carry forward the final release/check record.
3. Keep Color Picker integration, font fidelity, cursor refinements, Big Eraser
   effects and broader drawing-engine work for subsequent focused passes; the
   audits describe recovered helpers versus enabled UI behavior.
4. Pursue original-runtime capture only when a compatible Mac or a supplied
   compatible guest environment becomes available. Missing legacy OS media and
   hardware remain unresolved. See [native-runtime-options.md](audits/native-runtime-options.md)
   for evidence and limits, not a claim of a working reference environment.
