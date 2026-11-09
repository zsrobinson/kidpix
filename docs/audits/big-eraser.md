# Big Eraser and activated Firehose

The recovered implementation supports **Firehose's page wipe engine** and **Vanish**. Firehose's enlarged hose actor is exported but disabled pending placement recovery. The other named Big Eraser effects remain unsupported; selecting them must not silently run Vanish or the Firehose wipe. No original-app runtime verification has occurred on this host.

Primary evidence is the mounted installer at `/Volumes/Kid Pix Deluxe 3D`, its extracted [original executable](../../artifacts/research/kidpix-original), [i386 disassembly](../../artifacts/research/disassembly-i386.txt), [KPD3.cfg](../../artifacts/research/KPD3.cfg), and [user guide](../../artifacts/research/user-guide.txt), printed page23 (text lines1049–1083). Executable SHA-256: `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. Addresses below are virtual addresses in its i386 slice. The exporter parses Mach-O segments, including the separate file offsets of `__TEXT` and `__DATA`; these are not universal-file offsets.

## Activation and panel mapping

The guide describes clicking Firehose to clear the drawing area. Big Eraser instead requires selecting an effect, then clicking the picture or double-clicking the effect. Mini Eraser is a separate drag tool and cannot erase stickers, animations, movies, or text boxes. The helper has no Mini Eraser behavior.

`Data/Easel.MHK`, `MBTN75`, row19 contains the16words `(1089,1090,1090,1089,2,1089,266,1,0,0,1091,1,294,0,0,0)`. Activation dispatches event266 (`0x10a`); word12=294 is the separate rollover cleanup parameter. Event266 routes through the jump table at `0x25df78` to `0x5aae1` (`0x59dd2–0x59de1` subtracts222 before indexing). The ordinary rollover script1091 has six100ms draws, cue29 in collection1000 (1029), and repeat configuration. It does not encode the page wipe. This task does not alter ordinary rollover ownership or leave handling.

The eraser panel's main controls are `Data/Tools/Tp.MHK`, `MBTN18500`, rows0/1, with action events18500/18501 (`0x4844`/`0x4845`). The panel handler at `0xf01a3–0xf01ee` selects the panel branch; `0xefd44–0xeff60` initializes its tool/option list. The Big Eraser branch iterates **124 through137**, inclusive (`0xefeb8–0xeff05`), constructing a temporary engine instance and calling virtual `+0x3c` for each bitmap. `0xf029c–0xf02be` processes an option selection; a negative selection event also invokes the tool at the picture center (`0xf02c3–0xf032c`), consistent with the guide's double-click activation.

The factory at `0xef80e–0xef8d3` selects Firecracker for123, QuickTime for124–136, and FullCut for137. The public panel has14choices, with bitmap IDs3701–3714, and no Firecracker entry in this construction loop. QuickTime's bitmap method is `toolId + 3577` (`0x17570–0x17582`); FullCut uses the same arithmetic (`0x12a422–0x12a435`). Firecracker independently returns3700 (`0x118ec2–0x118ecb`).

| Panel index | Bitmap | Engine tool | Engine name | Configured cue | QFX file |
|---:|---:|---:|---|---:|---|
| — |3700|123|Firecracker|7219|procedural engine|
|0|3701|124|ClockFace|7227|Clock Face.qfx|
|1|3702|125|IrisHeart|7234|Iris Heart.qfx|
|2|3703|126|IrisStar|7218|Iris Star.qfx|
|3|3704|127|Windmill|7244|Windmill.qfx|
|4|3705|128|PageTear|7243|Page Tear.qfx|
|5|3706|129|SquareSpiral|7224|Spiral.qfx|
|6|3707|130|Implode|7232|Implode.qfx|
|7|3708|131|Engulf|7228|Engulf.qfx|
|8|3709|132|Fade|7230|Fade.qfx|
|9|3710|133|Explode|7229|Explode.qfx|
|10|3711|134|Kaleidoscope|7237|Kaleidoscope.qfx|
|11|3712|135|Waterfall|7226|Waterfall.qfx|
|12|3713|136|WipeRight|7247|Wipe Right.qfx|
|13|3714|137|Vanish|none|single rectangle fill|

Names are read through the engine-name table at `0x3273c0`, whose accessor is `0x1391a7–0x1391c0`. QFX names come from13records at `0x33e730 + n*0x204`; their stored IDs equal `toolId + 1`, matching `0x176e9–0x176f3`. Sound IDs come from the matching `NAME + Snd` config sections, as implemented by `0x1684f0–0x168618`. They are not inferred from thumbnail order. The source contains `Spiral.qfx` even though it is absent from the localized slideshow transition list.

**Shared-file integration correction:** `scripts/import-ui.py` currently imports3701–3716, while `src/trays.js` attaches a Firecracker-first15-name list. This shifts every recovered name relative to its bitmap and creates two extra options. Use `manifest.panel.toolIds`, `manifest.panel.bitmapIds`, and the matching effect names to rebuild these14choices before wiring effect selection. Do not use the current title string or its index14 “Vanish” as native identity. The standalone helper accepts an explicit native tool/bitmap ID and rejects unknown IDs.

## Firehose page wipe: recovered RBubbleCleaner

The activation branch loads bank3900 (`0x5ad51–0x5ad78`), saves/replaces animation state (`0x5ad86–0x5ae18`), and constructs the separate tool at `0x5ae1d–0x5ae37`. Its constructor `0x16323e–0x16327f` passes tool139 and installs vtable `0x3280b0`. RTTI `0x328130` names it `RBubbleCleaner`; it is not Firecracker. Setup calls virtual `+0x38` with the picture rectangle (`0x5ae50–0x5ae90`).

`0x16309c–0x163149` initializes the start/last-update times and path index0. Its mouse event handler is `0x162d3a`, which returns0 without changing the erasure state. This establishes no pointer-leave or Escape rollback semantics.

`0x163036–0x16309a` updates only when **elapsed >0.2seconds** and **time since last update >0.11seconds**; both comparisons are strict. Constants are binary doubles at `0x2608c0` and `0x2608c8`. Each accepted update records the current timestamp and advances once. A late frame does not replay missed paths.

`0x162fca–0x163033` draws ten consecutive64-byte path records at `0x2608d0–0x260b4f`. Each record has16float32 values: move point, line point, and two cubic curves. The fill is white with alpha `0.30000001192092896`, taken directly from the immediate operand at `0x163005`. These fills accumulate on the existing picture. The implementation exports the actual control points, including coordinates slightly beyond1; it does not create a replacement wave or ease the motion.

After ten updates, or when elapsed **>2seconds** (double at `0x2608b8`), the next accepted update fills the final path at `0x260b50–0x260b8f` at alpha1, then calls virtual completion slot `+0x48`. That path covers the picture rectangle. On a hypothetical regular111ms delivery schedule the first path appears at201ms, ten paths end at1200ms, and final completion occurs at1311ms. These are scheduling examples, not fixed authored completion times; actual delivery determines completion.

The drawing routine `0x162de0–0x162fc9` obtains the picture CGContext, translates by `(left, windowHeight-bottom)`, scales by picture width/height, emits the path, closes it, sets white RGB plus supplied alpha, fills, and invalidates the rectangle. The helper converts y-up CGContext coordinates to a top-down Canvas with `translate(left, top+height)` and `scale(width,-height)`. It explicitly clips to the supplied picture rectangle, including points exceeding the normalized range. Native CGContext edge coverage/antialiasing has not been compared to Canvas.

Tool139's engine name is `WaterCleaner`; `[WaterCleanerSnd]` specifies7433. Its original `Data/Tools/WackyBrushSounds.MHK/tWAV7433` is decoded losslessly to `water-cleaner-7433.wav`. Cue1029 belongs to ordinary rollover and must not substitute for this cue. Exact native sound tail and device latency remain unverified; the browser helper releases its owned audio handle at completion/cancellation.

Completion is `0x162d42–0x162dd7`: remove the temporary event handler, call generic completion `0x1686a6`, and dispatch event1333 (`0x535`) to the owner. The owner branch `0x59e00–0x59ef7` restores controls, destroys the temporary tool, forwards the event, and refreshes picture state. The helper's `onCommit` boundary models completion, while whole-scene/background/audio/history mutation remains the caller's responsibility. The exact native disposal ordering for every library-object and audio type has not been fully traced.

## Firehose actor: evidence export, disabled playback

`Data/Eraser.MHK` has `tSCR3900`, `tBMH3900`, and `REGS3900/3901`. The script declares collection3600, but the activation caller separately loads bank3900; collection-header identity alone is insufficient to select that image bank. The archive contains11direct-color453×493 poses and all-zero registration values. The script emits pose1 at tick0 through pose11 at tick10, at100ms intervals, with no sound commands. Its raw header rectangle is `[-100,500,376,1020]`. This is not the page-wipe path table.

All11PNG poses and their unmodified script metadata are exported. The native replacement path uses retained animation state, the layout transformation at `0x15418a–0x154291`, and callback `0x538ac–0x5395c`. The final screen placement, bounds/clip interpretation, and persistence relative to BubbleCleaner completion are unresolved. `actor.enabled=false` prevents presenting the raw header as a verified screen rectangle. Playing these11poses alone does not erase the page.

## Vanish and remaining engines

`RFullCutEraser` is linked by RTTI `0x325920` / name `0x24e9a0` and vtable `0x3258a0`. The constructor `0x12a3dc–0x12a420` captures the paint surface and tool ID. Its action `0x12a2b0–0x12a343` starts generic stroke tracking, selects/locks the surface, obtains the white paint value from `0x3225c`, fills the stored picture rectangle through `0x1c9e1a`, unlocks/restores the surface, invalidates, and calls the completion slot. `0x1cfacc–0x1cfb7c` reaches `_PaintRect`. There is no timed motion or configured Vanish cue. The helper therefore fills/commits synchronously with no invented fade.

QuickTime (`0x172b0`, `0x17332`, and `0x175e2–0x17ab00`) constructs a white target GWorld and invokes the transition renderer with the original QFX parameter bytes. The13relevant QFX files are exported with hashes; no Canvas renderer is claimed. `Fade` is included in this restriction despite its familiar name. Firecracker has its own class (`0x320b80` RTTI, action/update methods around `0x1181aa–0x118ecb`) and particle rendering; it is not implemented here. These effects require further algorithm/component recovery rather than a shared procedural approximation.

## Integration API

Generate assets with `python3 scripts/native-big-eraser.py`. Output is isolated under `public/original/ui/big-eraser/`, including `manifest.json`; shared `ui.json` is untouched. Load this manifest through the project's ordinary asset URL helper and pass `createNativeBigEraser` a dedicated transparent overlay context and its picture rectangle. Caller owns overlay sizing/stacking and freezes edits to the underlying composite during playback.

```js
const eraser = createNativeBigEraser({
  manifest, context: overlayContext, rect: [0, 0, 720, 542],
  onBegin: ({ effect }) => capturePictureTransaction(effect),
  onCommit: ({ effect, token }) => clearPictureTransaction(token, effect),
  onCancel: ({ token, reason }) => releasePictureTransaction(token, reason),
  playSound: cue => playOwnedSound(cue.soundId, cue.image),
  onUnsupported: ({ effect }) => showUnavailableEffect(effect),
});
eraser.play({ trigger: 'firehose' });
eraser.play({ trigger: 'big-eraser', bitmapId: 3714 }); // Vanish
eraser.cancel('escape');
eraser.dispose();
```

`play` returnsfalse for unsupported/unknown effects without mutating the picture or replacing a running supported effect. Supported activation returns true; Vanish completes during the call. `onBegin` returns an opaque transaction token passed to completion/cancellation. `onCommit` must synchronously apply one atomic picture clear and undo entry, including scene/backdrop/audio state as appropriate to the application's clear contract. Do not clear art at `onBegin`, add intermediate fills to history, or call the existing cue1029-playing `clearPicture()` unchanged. It needs a transaction-oriented integration split in `main.js`. The paint hook already passes the brush; retain its selected native effect identity. Tray double-click activation also needs parent integration.

The helper owns the wipe overlay and scheduled callbacks. It removes the overlay on completion/cancel, prevents stale callbacks from committing, and pauses its owned sound. Cancellation/disposal/replacement leave the underlying picture untouched and create no undo entry. These are explicit browser lifecycle policies, not a claim that original Escape/blur behaved identically. Do not cancel this activated operation from Firehose's ordinary pointer-leave handler. FullCut has already committed before a subsequent cancel; undo belongs to application history.

No changes were made to `main.js`, `paint.js`, `scene.js`, shared tray/UI metadata, or rollover code. Parent integration must decide whether to expose the recovered Firehose wipe before its actor is solved, and must keep that limitation visible in fidelity reporting.

## Checks and limits

Focused Node checks cover strict timing, one advance per delivered frame, complete ten-path progression, final commit exactly once, unsupported effects, native selection identity, Vanish, replacement/cancellation/disposal, audio refusal, errors, and clipping/coordinate conversion. Python checks read the binary path/timing/name tables directly and validate the export's disabled actor and unsupported QFX flags. Browser checks use an isolated overlay harness on port4184; they exercise real Chromium Canvas alpha accumulation, intermediate pixels, y orientation, clipping, final clear/undo boundary, cancellation, late delivery, and unsupported choices.

Actual checks in this task:

- `python3 scripts/native-big-eraser.py`: succeeded;26files/743,429bytes, including11PNG poses,13QFX files, one WAV and the manifest.
- `node --test scripts/parity/big-eraser.test.mjs`:8passed.
- `PYTHONPATH=scripts python3 -m unittest scripts/test_big_eraser.py`:3passed.
- `node_modules/.bin/playwright test -c artifacts/t3/big-eraser/playwright.config.mjs`:3passed on isolated4184; JSON report at `artifacts/t3/big-eraser/results.json`. The first run exposed the harness working-directory setting; a subsequent pixel assertion was corrected to Chromium's observed alpha130 after two cumulative fills. Final run passed all3cases.
- `node --check src/native-big-eraser.js`:passed. Focused whitespace check passed.

These are helper and resource/binary conformance checks. They do not verify integration with the actual studio history/scene, native Mac rendering, native sound synchronization, enlarged hose placement, or the other14engine effects. Full application regression and native reference screenshots remain outstanding.
