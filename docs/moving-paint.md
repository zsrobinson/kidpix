# Recovering complete native spray motion

The current browser engine uses up to eight sampled images per spray choice. For Moving Paints it cycles those images every 65 ms, adds a procedural seven-pixel upward drift and settles after an arbitrary 320 ms. Those values and the sampled frame order are not the authored motion in the trial.

## Recovered source

The new `scripts/native-spray.py` helper reads the complete original collections and scripts:

| Source | Banks | Sprite images | Scripts |
| --- | ---: | ---: | ---: |
| `Data/Tools/Anims.MHK` | 20 | 7,112 | 752 |
| `Data/Tools/Cyclic.MHK` | 15 | 935 | 0 |

All 752 moving-paint scripts are handled by the known decoder subset: interval, image group, wait, sound and end. They contain 10,676 image groups and 777 sound events referencing all 144 source sound resources. Of these scripts, 643 set a 100 ms interval and 109 set a 66 ms interval. Their visible timelines reach the last image group at 858 to 4,700 ms after preserving repeated waits and excluding a terminal wait immediately before end. Earliest completion is one further interval later; active sound can extend it.

These are finite authored clips. The subsequent [engine investigation](spray-engine.md) verifies their creator flag `0x800000`, first-raw-image pointer anchoring, 150 ms emitter timer, rounded variant selection, and final-frame flattening. Tool cleanup flattens the current frame early. Overlapping particle completion/layering, actual timer delay and platform event delivery still need empirical comparison.

The first source clip, 24000, lasts 1,700 ms and moves its artwork upward by the source's registered coordinates. Its first image group's local position is `(11, 120)`; its last group's local position is `(42, 0)`. Reusing eight numeric images with a seven-pixel procedural lift cannot reproduce that sequence.

## Exporter API

The helper does not modify the application or regenerate public media when imported. It accepts an already parsed Mohawk archive:

```python
spray = import_module("native-spray")
manifest = spray.export_native_spray(
    archive,
    original_media_root,
    mode="moving-spray",  # or "spray" for Cyclic.MHK
    bitmap_decoder=bitmap,
    sound_decoder=decode_sound,
    layout="atlas",       # production: shared lossless PNG atlases
    shard=True,           # production: fetch only the selected bank's JSON
)
```

The bitmap callback has the existing `import-original.bitmap` signature `(extension, encoded_bytes, width, height)`. The sound callback has the existing `import-original.decode_sound` signature `(sample_rate, channels, PCM16_bytes)`. Moving-paint exports require the sound decoder rather than silently discarding sound cues. Static Cyclic exports do not require it.

`analyze_native_spray(archive, mode)` returns the same structural manifest without writing any files. `NativeSprayArchive(archive, mode)` caches each decompressed bank once; its `.export(...)` method writes frames/audio, then publishes the manifest last.

Outputs are relative to the original-media root:

- `tools/moving-spray/native/BANK-INDEX.png`
- `tools/moving-spray/native/sounds/ID.wav`
- `tools/moving-spray-native.json`
- `tools/spray/native/BANK-INDEX.png`
- `tools/spray-native.json`

The example uses the production atlas layout. Each bank is packed into one or more PNGs no larger than 2048×2048, without resizing. A frame's `image` points to its atlas and `sourceRect` is `[x,y,width,height]`; its original width, height, registration and index remain intact. Pasting uses no alpha mask, which preserves translucent pixels exactly. The complete source packs into **21 moving-paint atlases and 15 static-shape atlases**, rather than 8,047 individual image requests.

With `shard=True`, `tools/MODE-native.json` is a small bank index. `banks[ID].manifest` points to `tools/MODE/native/ID.json`, containing that bank's frames and clips. A bank can therefore load without fetching every other effect's timeline. The 144 original sound cues remain individual WAV files; atlas packing changes image layout, not sound ownership or encoding.

The default `layout="frames", shard=False` retains the individual-image research export and full manifest. Do not copy the individual research-export directory into a production atlas directory: generate the selected layout directly. Exports do not delete older files automatically.

The frame index is zero-based; the source script's one-based image IDs are resolved explicitly. Each bank's ordered `frames` array includes dimensions, original registration and image path. Each clip includes `sourceOrigin`, `sourceBounds`, `firstDrawRawPosition`, ordered frames with `atMs`, `durationMs` and image parts, sound cues with source channel and time, `durationMs`, `minimumCompletionMs`, and `terminalFrame`. Image parts preserve native layering and positions relative to `sourceOrigin`, after registration offsets are subtracted. They are not resized, recentered, randomly rotated or given an invented trajectory.

Zero-duration final image groups are retained as `terminalFrame` rather than lost. For an active frame, draw every part in source order at `(pointer - firstDrawRawPosition + part.position)`. `sourceOrigin` is provenance, not the relocation anchor. A source sound channel can postpone completion past `minimumCompletionMs`; the timeline sampler retains the terminal group until its caller performs the native flattening step.

## Runtime helpers and verified native rules

`src/native-spray-runtime.js` is pure JavaScript with no DOM or asset-loading dependency:

- `selectNativeShape(bank, random, first)` starts at bank frame zero; later choices use the source one-based rule `1 + trunc(random() * (N - 2) + 0.5)`. The endpoint buckets have half the width of interior buckets, and the final bank frame is not normally selected.
- `drawNativeShape(context, point, frame, image)` draws at pointer minus source registration, at native dimensions. Atlas sources use the original `sourceRect` with the nine-argument `drawImage`; individual PNGs remain supported.
- `selectNativeSprayClip(bank, random)` chooses the whole source clip using `trunc(random() * (clipCount - 1) + 0.5)`.
- `nativeSprayFrameAt(clip, elapsedMs)` samples authored frame event times and retains the terminal group without an invented loop.
- `drawNativeSprayFrame(context, point, clip, bank, frame, imageFor)` applies the verified first-raw-image anchor and preserves each image group's layer order. `imageFor` resolves a source image path to an already loaded image.

The owning tool must preserve its selected static index across marks and advance after each draw. Static tracking is throttled by a strict `clock > next` comparison with 100 ms intervals; moving emission begins immediately and then follows its 150 ms timer. Neither renderer adds random rotation, scaling or jitter. Native evidence includes static image rendering `0x00154882`, selection `0x00117f96`, tracking `0x001330a0`, moving emission `0x00134944`, first-position relocation `0x0015b22a`, and flattening callback `0x00134a4a`. Full instruction-level context is in [spray-engine.md](spray-engine.md).

## Validation and format findings

All 8,047 sprite images and all 144 moving-paint sound resources were successfully exported to the ignored `artifacts/research/inventory-spray-complete/` directory. No public media was regenerated during this investigation. The complete export took approximately 13 seconds on this Mac. Two source clips are also rendered as local WebP previews at `artifacts/research/inventory-spray-24000.webp` and `artifacts/research/inventory-spray-24001.webp`.

The bank's first 16-bit word is its real image count. The word at byte 4 is a padded storage stride and can be larger. The decompressed offset table contains the real count, not that padded stride; for example, bank 24300 has 594 real frames with stride 596, and its first bitmap starts immediately after 594 offsets. The helper validates those relationships, the decompressed byte count, offsets, dimensions, registration references, script image references and sound references. Unknown commands or encodings stop export with a specific error.

Run the standalone structural tests with:

```sh
PYTHONPATH=scripts python3 -m unittest scripts/test_native_spray.py
```

They cover source registration versus unregistered placements, repeated holds, interval changes, sound onset, terminal frames, storage-stride padding, missing references, unknown commands, complete asset export and exact atlas pixel round-trips. The companion Node tests in `scripts/parity/native-spray.test.mjs` cover rounded source distributions, original dimensions, pointer anchoring, source holds and atlas rectangles. They do not replace a running-original comparison.
