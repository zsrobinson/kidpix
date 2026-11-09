# Primary tool control motion

The original application has not run here. Resource extraction and i386 callback
tracing establish the contracts below; native timing, audio latency and visual
parity remain unverified.

## Integration contract

`ui/tool-motion/manifest.json` is `{version:1,trays:{draw,paint,bucket,mixer,eraser},backdrops}`.
Each tray preserves the existing drawing manifest shape: `buttons`, `scripts`,
`sprites`, `sounds`, source hashes, exact registered coordinates, MRGN hit union,
and `auxiliaryClipRect`. Paths are relative to `ui/`.

Rendering is source-dependent. Drawing retains its existing rendering fields.
Painting and Bucket use `renderMode:'mode9'`: two-part frames use the existing
ordinary part 0 + raw mode9 part 1 callback; **one-part frames use ordinary bitmap
rendering** (the callback's zero-second-part branch). Mixer and Eraser use
`renderMode:'ordinary'`: draw every registered part normally, with no color tint.
All groups retain mode2 dispatch and finite, leave-cancelled auxiliary playback.
The Painting/Bucket single-part controls still contain all authored poses.

`buttons[].commandArgument` preserves native word 8; it is NOT a general row
index. Use `buttons[].index`/`name` to map browser choices and `command` plus the
argument for native dispatch. Eraser source row 0 is Big Eraser (`big`, right),
row 1 Mini Eraser (`round`, left). Other names match existing web tool values.

Each tray has `bundle:{path,compression:'gzip',sha256,byteLength}`. Decompress
once; `byteLength` is the uncompressed length; SHA-256 covers compressed bytes.
`sprites[id].bundleOffsets.argb/png` are `[offset,length]` into the uncompressed
concatenation. Raw/PNG fallback paths remain available. Serve the gzip as an
opaque application payload without HTTP Content-Encoding. Sounds remain WAVs.
Bundle filenames end in `.bin` because Vite automatically assigns HTTP
Content-Encoding to `.gz` filenames, causing Fetch to decompress before the
application sees the bytes and invalidating the compressed-hash contract.

`backdrops[viewArt]` has `{rect:[113,608,817,168],pages:[{image,...}]}` in the
same page order as `trays.json`. Clean pages omit only the controlled primary
state scripts and retain background, options, size, mode, arrows and row digits.
Switch to a clean page only after that owner's actors/assets are ready. Restore
the clean page and paint the complete active snapshot on every update; preserve
controller progress across same-owner page/effect/size/color rerenders. Drawing
continues using drawingOptions with the old four drawingTools sprites omitted.

DOM observation remains `data-native-tool-motion='<tray>'` on the actual actor
canvas and `data-motion-snapshot` JSON on render, as specified in the handoff.
App/runtime integration is owned separately from this exporter.

## Source callback tracing

The common loader `0x000f72f8` calls virtual slots +0x6c/+0x70, and only installs
callback `0x000f73b4` for their inclusive row range (`0x000f732e–0x000f7396`).
The callback draws ordinary art when the second image ID is zero
(`0x000f763f–0x000f7645`). It does not require two images in every program.

| Owner / MBTN | Vtable | +0x48 loader | Callback range functions | Range |
| --- | --- | --- | --- | --- |
| Drawing / 18400 | 0x0031f4a0 | 0x000f72f8 | 0x000f2c84 / 0x000f2c8c | 0–3 |
| Painting / 18000 | 0x0031f5a0 | 0x000f72f8 | 0x000f3b0a / 0x000f3b12 | 0–2 |
| Bucket / 18300 | 0x0031f268 | 0x000f72f8 | 0x000f0b9c / 0x000f0ba4 | 0–2 |
| Mixer / 18600 | 0x0031f380 | 0x000f1e42 | 0x000f71d2 / 0x000f71dc | -1 / -1: none |
| Eraser / 18500 | 0x0031f148 | 0x000f72f8 | 0x000f71d2 / 0x000f71dc | -1 / -1: none |

Mixer's loader calls the common loader then enables state-change notifications
for states 0 and 1 via `0x000307a6` (`0x000f1e63–0x000f1ed4`). Those flags live
at control +0x8e; the script slots remain at +0x86 and are unchanged.
`0x00030b79–0x00030bec` dispatches owner event 0x2009 before switching scripts.
Mixer handles it at `0x000f2474–0x000f2564` by sending studio events 0x122/0x123;
it does not replace the tool art or change its render mode.

## Source state mapping and complete poses

All controls use state slots `[rest,press,0,press]`, so native selected state 3
shares the state 1 program and must preserve progress on 1→3. All rollover
parameter triplets are `[0,0,0]`: finite, cancelled on leave. Each program
declares 100 ms; end checks can wait for owned sound completion. The source
record's command argument is retained even when every row has the same argument.

| Tray / row names in source order | Rest / press=selected / hover programs | Frame groups |
| --- | --- | --- |
| draw: pencil, chalk, crayon, marker | 18060–18071, consecutive triplets | 11/11/6; 16/16/6; 16/16/6; 14/14/5 |
| paint: brush, sound, spray | 18072–18080, consecutive triplets | 4/11/4; 6/13/9; 11/11/5 |
| bucket: bucket, gradient, pattern | 18081–18089, consecutive triplets | 13/13/8; 7/11/5; 11/11/5 |
| mixer: mega, wand | 18090–18095, consecutive triplets | 11/11/7; 11/11/7 |
| eraser: big, round | 18137/18138/18139; 18134/18135/18136 | 7/7/9; 10/10/8 |

Bucket hover programs 18086 and 18089 have five image groups but earliest end
tick7. Their extra source waits hold the final pose for another 200 ms; do not
calculate completion from frame count. Total retained poses: **404 image groups**.
Painting's Brush/Sound and Bucket's Single Color controls have two-part frames;
Spray and the other two Bucket controls have one ordinary part. The callback
range still covers all three rows in both owners.

Default selection is row 0 except Eraser row 1 (Mini Eraser). Painting restores
row from owner+0xbe, Bucket from +0xb8, Mixer from +0xc0; Eraser restores saved
command minus 18500. These defaults/restores are established by the owner
addresses above, not the first pose or page artwork. Command IDs are 18400 with
arguments 0–3 for Drawing; 18000–18002 with argument 0 for Painting; 18300–18302
with argument 1 for Bucket; 18600–18601 with argument 0 for Mixer; 18500–18501
with argument 0 for Eraser.

Every region remains the exact source MRGN rectangle union, separate from full
sprite bounds. Auxiliary clipping uses the MRGN header bounds, following the
shared kind2 construction documented in [drawing-tool-motion.md](drawing-tool-motion.md).
State poses retain full registered bounds and are not cropped to their hit area.
The common state creation flags remain 0xC08000 and auxiliary flags 0x800031.

## Assets and clean-page coverage

| Owner | Programs | Sprites (PNG + raw pairs) | WAV files | Gzip bundle bytes | Uncompressed bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| draw | 12 | 146 | 12 | 1,299,564 | 7,043,032 |
| paint | 9 | 101 | 9 | 943,837 | 5,951,396 |
| bucket | 9 | 70 | 6 | 1,458,755 | 5,068,566 |
| mixer | 6 | 33 | 6 | 842,304 | 2,997,398 |
| eraser | 6 | 27 | 6 | 392,089 | 2,262,311 |

Five bundles total 4,936,549 compressed bytes for 23,322,703 decompressed bytes.
The 39 exported WAV entries preserve the source cue resources, rates, PCM sample
frames and hashes; repeated Bucket cues remain repeated resource references.
No generic click substitution or inferred audio looping is introduced.

Clean pages cover paint 4, wacky 6, sound 2, hands-free 2, spray 3,
moving-spray 4, bucket 6, gradient 9, pattern 7, mixer 4, mixer-wand 2 and eraser 4:
**53 pages**. `omittedPrimaryScripts` and `retainedScripts` record the exact
source composition boundary. No alpha patch or guessed rectangular erasure is
used. PNG SHA-256 is retained for every clean page and every sprite; raw ARGB,
script, MBTN, MRGN, registration banks, bitmap bank and source WAV hashes remain
available in the tray metadata.

## Reproduce and validate

```sh
# Existing Drawing fallback assets are a prerequisite and remain separately owned.
python3 scripts/native-drawing-motion.py
python3 scripts/native-tool-motion.py
# Five pure fixture tests: no Pillow, PyObjC, ignored media or mounted source.
PYTHONPATH=scripts python3 -m unittest test_tool_motion.ToolMotionTests -v
# All eleven tests: six extra source tests run only when the installer is mounted.
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p test_tool_motion.py -v
node scripts/verify-assets.mjs
node --test scripts/parity/drawing-motion.test.mjs scripts/parity/tool-motion.test.mjs
```

The exporter writes only `tool-motion/`. Drawing fallback bytes must match the
existing independent export; neither those files nor its manifest are rewritten.
The new index is written after payloads. Its clean compositor reuses the existing
strict raw-channel helpers, bytecode decoder and resource readers; it does not
introduce another interpretation of uncertain bitmap/script flags.

All 11 Python tests passed, including every source pose/registration/cue tick,
all 377 raw/PNG pairs, all 39 WAV payloads and all five exact bundle roundtrips.
An independent replay of `import-ui.export_trays`, restricted to the 12 applicable
views in a temporary directory and suppressing only the source primary programs,
matched every pixel of all 53 clean pages. The existing shared importer was not
modified. The mounted executable hash and i386 vtable pointers independently
bind callback ranges to this binary. The fixture suite separately rejects changed
dispatch and unknown bytecode and tests deterministic zero-mtime gzip bytes.

The parent asset verifier passed with 9,313 referenced files. All 24 focused Node
controller/renderer/bundle checks passed against the current shared integration.
A temporary Vite server on 4192 served all five `.bin` bundles as
`application/octet-stream`, with no Content-Encoding; Fetch-received bytes matched
each compressed SHA-256. The server was closed after the check.

This is the exporter stopping point for machine transfer. Generated media remains
ignored and requires the parent handoff/media process. No application integration,
release build, commit, push, upload or deployment is part of this export. Browser
stacking/interaction verification belongs to the integrator and cross-tab verifier;
native runtime fidelity is still unverified. Other authored controls (Drawing
styles, Painting modes, sizes, Eraser shapes, Grab, Stamp and Text) are outside
this assigned primary-material-control pass.
