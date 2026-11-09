# DMG fidelity coverage and remaining workflow gaps

Source audit dated 2026-11-09 against the mounted **Kid Pix Deluxe 3D** trial and the current shared checkout (base `1970780642186211f64affbfd6f257213ae12ddd`, public package version 0.4.0 plus uncommitted work). This audit does not change application code or imported media. The original application has **not** run here. No native screenshot, timing, audio or interaction comparison was performed.

The most useful additional work, beyond the separately active UI investigations, is to restore **deletion puffs, authored Drippy Paint motion, help content/audio, bundled fonts, and per-slide playback options**. These are visible workflow differences supported by resource, guide or binary evidence. Asset recovery alone is not implementation or native parity.

The companion [machine-readable inventory](../../artifacts/t3/dmg-coverage.json) contains every archive's SHA-256, every logical resource ID/type/byte offset/size/hash, all 233 button rows, all script decode results, font face names, source settings, recovery paths and a prioritized integration index. Archive offsets below refer to the **uncompressed MHK**, not the installer payload. IDs are archive-scoped: `TransSound:tSCR7000` and `SlideShow:tSCR7000` are different programs.

## Evidence and reproducibility

Primary inputs are the mounted installer index/payload, the bundled [user-guide text](../../artifacts/research/user-guide.txt), [KPD3.cfg](../../artifacts/research/KPD3.cfg), the extracted [executable](../../artifacts/research/kidpix-original) and its [i386 disassembly](../../artifacts/research/disassembly-i386.txt), and the current repository source. There are no secondary technical sources behind the findings. Binary SHA-256 is `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`; installer/guide/archive hashes are in the JSON.

Read through [app_resources and mohawk](../../scripts/import-ui.py), independently check each MHK offset using [Library.directory](../../scripts/import-original.py), then run [decode_script](../../scripts/mohawk-script.py) on every `tSCR`. The audit read all 41 embedded archives afresh rather than extrapolating from the earlier subset inventory. It also parsed all `.dfont` resource maps and SFNT name tables without installing fonts. The JSON records inspection-time source hashes because parallel work can subsequently change the shared checkout.

Evidence labels used below:

- **Resource/guide:** authored bytes, tables, settings or documented workflow, recovered directly.
- **Binary:** an inspected instruction/data address; intended execution rules, not measured platform behavior.
- **Web source:** what the inspected code/imports implement; no browser run in this task.
- **Inference/open:** caller, lifecycle, compositor or preference precedence still needs tracing or native verification.

The shared interpreter reads declared intervals at i386 `0x0015a52c–0x0015a54d`, adds the collection/base to sound cues at `0x0015a56a–0x0015a589`, and treats a wait immediately before end as completion in the same update at `0x0015a6e4–0x0015a6f8`. The clock-to-millisecond chain is documented with addresses in [reverse-engineering.md](../reverse-engineering.md). Consequently, draw-group count is not a guessed frame duration, and a terminal wait does not add a visible hold. Fully decoded means the supported command subset consumed the entire record; it does not establish dispatch or compositing.

## Complete embedded archive inventory

**41 MHKs, 204,212,169 archive bytes, 4,122 logical resource records.** Totals: 2,107 `tSCR`; 63 `tBMH` banks / 10,562 sprite entries; 746 `tBMP`; 828 `tWAV`; 35 `MBTN` tables / 233 rows; 85 `MRGN`; 129 `REGS`; 77 `tCNT`; 13 `tPAL`; 33 `tCUR`; 5 `STRL`; 1 `grad`. These exclude the disc's separate `Libraries/*.klb` media and include `SYSTEM.MHK` outside `Data/`.

The table shows source inventory, **not completed features**. `SCR ok/multi` counts complete subset decodes and programs with more than one draw group; duplicate images or lookup records may also occur.

| Archive under Contents/Resources | Bytes | Records | SCR total/ok/multi | BMH banks/sprites | BMP | WAV | MBTN tables/rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Data/About.MHK` | 482,682 | 5 | 1/1/1 | 1/19 | 0 | 0 | 0/0 |
| `Data/AutoHelp.MHK` | 90,464 | 7 | 4/4/0 | 1/20 | 0 | 0 | 0/0 |
| `Data/BigPicker.MHK` | 565,539 | 18 | 6/6/2 | 1/12 | 1 | 4 | 0/0 |
| `Data/Buttons.MHK` | 88,052 | 36 | 32/32/0 | 1/32 | 0 | 0 | 0/0 |
| `Data/Easel.MHK` | 5,493,629 | 234 | 138/136/85 | 1/260 | 26 | 33 | 1/27 |
| `Data/EaselHelp.MHK` | 27,979,201 | 171 | 3/1/0 | 1/28 | 0 | 165 | 0/0 |
| `Data/EnterName.MHK` | 64,429 | 19 | 12/12/0 | 1/13 | 0 | 2 | 1/2 |
| `Data/EnterSnd.MHK` | 54,917 | 16 | 11/11/0 | 1/12 | 0 | 0 | 1/2 |
| `Data/Eraser.MHK` | 836,104 | 4 | 1/1/1 | 1/11 | 0 | 0 | 0/0 |
| `Data/GFXTransitions.MHK` | 97,679 | 35 | 1/1/0 | 0/0 | 32 | 0 | 0/0 |
| `Data/General.MHK` | 122,740 | 32 | 0/0/0 | 0/0 | 0 | 0 | 0/0 |
| `Data/LittlePicker.MHK` | 27,335 | 10 | 3/3/0 | 1/3 | 2 | 0 | 0/0 |
| `Data/Misc.MHK` | 229,235 | 8 | 0/0/0 | 0/0 | 2 | 5 | 0/0 |
| `Data/Picker.MHK` | 10,157,324 | 347 | 290/290/57 | 1/251 | 1 | 16 | 1/28 |
| `Data/PickerHelp.MHK` | 2,393,160 | 18 | 0/0/0 | 0/0 | 0 | 18 | 0/0 |
| `Data/PickerUndo.MHK` | 1,010,107 | 46 | 23/23/22 | 1/57 | 0 | 20 | 0/0 |
| `Data/PuffEffect.MHK` | 29,691 | 2 | 1/1/1 | 1/7 | 0 | 0 | 0/0 |
| `Data/RABCTextDlg.MHK` | 1,448,120 | 19 | 14/14/0 | 1/18 | 0 | 0 | 1/2 |
| `Data/RDlgLogin.MHK` | 177,393 | 75 | 64/64/0 | 1/52 | 0 | 5 | 2/7 |
| `Data/RFlattenDlg.MHK` | 64,342 | 18 | 13/13/0 | 1/14 | 0 | 0 | 1/3 |
| `Data/RPickBgColorDlg.MHK` | 64,755 | 40 | 35/35/0 | 1/38 | 0 | 0 | 1/23 |
| `Data/RPronounceDlg.MHK` | 114,262 | 24 | 19/19/0 | 1/21 | 0 | 0 | 1/4 |
| `Data/SlideShow.MHK` | 133,860 | 28 | 20/20/5 | 1/27 | 0 | 3 | 1/5 |
| `Data/Soundfx/TransitionSounds.MHK` | 5,448,024 | 131 | 33/32/0 | 0/0 | 64 | 31 | 0/0 |
| `Data/Splash.MHK` | 4,329,946 | 9 | 2/2/1 | 1/68 | 1 | 2 | 0/0 |
| `Data/StampEd.MHK` | 530,551 | 49 | 32/32/0 | 1/36 | 1 | 11 | 1/9 |
| `Data/StartupMovie.MHK` | 54,617,473 | 18 | 13/12/10 | 1/391 | 1 | 1 | 0/0 |
| `Data/StarySky.MHK` | 2,611,473 | 11 | 2/2/2 | 1/10 | 6 | 0 | 0/0 |
| `Data/Thumbinf.MHK` | 8,265 | 54 | 42/42/0 | 0/0 | 10 | 0 | 0/0 |
| `Data/TimerSettings.MHK` | 171,375 | 51 | 42/42/10 | 1/49 | 0 | 3 | 1/10 |
| `Data/Tools/Anims.MHK` | 26,080,645 | 996 | 752/752/752 | 20/7112 | 20 | 144 | 0/0 |
| `Data/Tools/Brushes.MHK` | 26,424 | 61 | 0/0/0 | 0/0 | 60 | 0 | 0/0 |
| `Data/Tools/CutRgns.MHK` | 134,794 | 25 | 0/0/0 | 0/0 | 14 | 0 | 0/0 |
| `Data/Tools/Cyclic.MHK` | 7,718,254 | 75 | 0/0/0 | 15/935 | 15 | 0 | 0/0 |
| `Data/Tools/FeltPenSnds.MHK` | 569,096 | 8 | 0/0/0 | 0/0 | 0 | 8 | 0/0 |
| `Data/Tools/Icons.MHK` | 2,797,237 | 201 | 40/40/40 | 2/236 | 142 | 0 | 0/0 |
| `Data/Tools/TextureMaps.MHK` | 8,195,550 | 21 | 0/0/0 | 0/0 | 21 | 0 | 0/0 |
| `Data/Tools/Tp.MHK` | 15,210,813 | 878 | 380/380/125 | 1/788 | 327 | 119 | 21/107 |
| `Data/Tools/WackyBrushSounds.MHK` | 23,835,990 | 234 | 0/0/0 | 0/0 | 0 | 234 | 0/0 |
| `Data/TransSound.MHK` | 201,099 | 87 | 78/78/28 | 1/42 | 0 | 4 | 1/4 |
| `SYSTEM.MHK` | 140 | 1 | 0/0/0 | 0/0 | 0 | 0 | 0/0 |

**2,101/2,107 scripts decode completely; 1,142 contain multiple draw groups.** Six exceptions remain explicit:

| Archive | tSCR ID | Existing decoder rejection |
| --- | --- | --- |
| `Data/Easel.MHK` | 1039, 1128 | Trailing data after first end |
| `Data/EaselHelp.MHK` | 20001, 20002 | Unsupported `0b02` at resource byte 76 / 54 |
| `Data/Soundfx/TransitionSounds.MHK` | 12033 | Trailing data after first end |
| `Data/StartupMovie.MHK` | 11000 | Trailing data after first end |

Neither truncating at the first end nor appending the remaining instructions as an automatic continuation is established behavior. `0b02` likewise needs interpreter/caller tracing. The existing decoder is deliberately conservative.

## Additional high-impact gaps

### F01 — Deletion puff: documented workflow and unused authored actor

**Resource/guide:** `Data/PuffEffect.MHK:tSCR1250` at **`0x7359`** uses bank `tBMH1250` at `0x1c`, seven sprite entries, seven draw groups and a declared 100 ms interval, with no embedded sound cue. The guide explicitly says deleting a sticker or animation produces a puff of smoke (printed pp37,39; text lines 1825–1827 and 1906–1908). **Binary:** `0x0015e392` references the `PuffEffect` string at `0x0024fa3a`; `0x0015e3c5–0x0015e3f2` loads resource/script `0x4e2` (1250). This links an authored actor to a guide-documented effect without naming frames by appearance.

**Web source:** [createScene.edit](../../src/scene.js) removes the object with `splice` and immediately renders; no PuffEffect importer or actor is connected. Deleting a sticker is therefore a concrete workflow target. Do not automatically attach the puff to Cut, text deletion, library deletion or Clear: those event mappings are untraced.

**Integration:** export the actual timeline and source part coordinates, then add a transient effect at the removed object's visual location. Keep the existing history mutation atomic. Trace native placement/scale, clipping, actor completion and interruption before declaring parity. Entry points: `scripts/import-ui.py:export_ui`, `src/scene.js:createScene.edit/render`, `src/main.js:doEdit` and the effects layer.

### F02 — Drippy Paint uses 40 authored programs absent from the renderer

**Resource:** `Data/Tools/Icons.MHK:tSCR3200–3239`, all completely decoded, contain 2–9 draw groups at 100 ms and reference `tBMH3200` (174 sprite entries, bank at `0xe4d`). Program 3200 begins at **`0x2a8f67`**; every remaining offset and referenced one-based sprite ID is in the JSON. The separate bank 2350 has 62 sprites. There are no sound instructions inside these 40 programs.

**Binary:** constructor `0x0011a5fe` installs vptr **`0x00320fc8`**. Its preceding type-info pointer is `0x00321120`, whose name pointer is `0x0024e000`, the RTTI string `N9Rembrandt7RDrippyE`. At `0x0011aa9d–0x0011aae7`, the state word at `+0x15c` selects base 3200/range8, base3208/range16, or base3224/range16. At `0x0011a838–0x0011a880`, emission adds a variant to that base and passes the resulting script to `0x0015aa8b`. This is a binary-backed class/resource relationship, not a sprite-order label. The meaning of the selector word remains open.

**Web source:** [export_trays](../../scripts/import-ui.py) reads selected Icons `tBMP` previews, but exports neither those script programs nor bank3200. [paint-brushes.js](../../src/paint-brushes.js) aliases Drippy Paint to `drips` and draws procedural circles with random vertical offsets. `KPD3.cfg:[DrippySnd]` separately specifies loop7343 and specialFx7380; [paint-audio.js](../../src/paint-audio.js) reduces the available policy to begin/loop/end/direction arrays.

**Integration:** recover the actual script family/registered parts and trace tint/blend operation, state selector, emission rate, completion and residual drips. Reuse timeline infrastructure only after those actor semantics are known. The masks may be recolored at runtime; directly displaying extracted pixels is not yet justified. This is separate from Tp's animated tool buttons and from Anims/Cyclic spray emission.

### F03 — Help is a workflow and audio subsystem, not a button title

**Resource/guide:** `EaselHelp.MHK` has 165 `tWAV`, three scripts and 28 sprites; `PickerHelp.MHK` has 18 `tWAV`. All **183 exact sound IDs** are in the inventory. `AutoHelp.MHK:tSCR22000–22003` begins at `0x1602a/0x16054/0x1607e/0x160a8`, using a 20-sprite bank. `AutoHelp.plist` and `ExtendedHelp.plist` each provide 24 table mappings / 161 entries; `CoachingTags.plist` gives contextual coaching records. `English.lproj/HelpSounds.strings` maps help IDs to sound offsets and explicitly uses **777 for missing/unavailable entries**. Do not turn that sentinel into a resource20777 or substitute another clip. Existing mappings need caller/base validation before asserting every sound lookup.

`HelpTextSettings.plist` specifies **Jester14 for AutoHelp and Jester16 for ExtendedHelp**. `UserDefaults.plist` enables automatic help tags, disables automatic tag speech and coaching by default, specifies speech delay5 and coaching delay15. Those are different controls; coaching should not be enabled merely because its artwork exists. The guide (p13) describes Extended Help as read/listen, repeat after a few seconds, disappear on leave, and click anywhere to exit; preferences pp75–76 describe the separate policies.

**Web source:** [main.js](../../src/main.js) toggles `extendedHelp`, shows the hovered button's `title` in status, and exits on Escape; Slide Show Help displays one fixed sentence. The inspected click handler still activates controls in help mode. These are source differences from the guide's interaction contract; no click-consumption claim is made beyond the guide's stated exit action. The importers do not export the 183 help sounds, mapping graph, help panels or Jester font.

**Integration:** map control row → help entry → content/sound through source tables, preserving missing entries. Add owned help audio, dwell/repeat, leave cancellation, click-to-exit, keyboard focus and preference gates. Decode the two unsupported help scripts before playing their panel lifecycle. Keep help audio separate from ordinary tool audio so owner cleanup can be tested.

### F04 — 26 font files contain 29 faces; fallback typography changes pictures

**Resource:** all 26 `.dfont` files were read through the installer and their SFNT name tables inspected. There are **29 faces**, because Schoolhouse supplies Regular/Bold/Bold Italic/Italic. Full source paths, SFNT resource IDs/offsets and family/full/PostScript names are in `font_files` in the JSON. For example, `FifthAvenue.dfont`'s actual full name is `FifthAve Regular`; filenames alone are not the font-selection API.

Bundled families are Catchup, Cuckoo, Diploma, Eurasia, Expose, FifthAve, Flat Brush, Franciscan, Gremlin, Jester, Jolt, Keira Condensed, Market, Patrick, Pegasus, Rococo, Schoolhouse, Socket, Storybook, Tabloid, Tarzana, Techno, Teletype, Tubular, Vogel and Yankee. Consult the exact name records before assigning CSS family strings.

**Web source:** [main.js](../../src/main.js) offers Chalkboard plus generic serif/sans-serif/monospace and initializes size**32**; there is no bundled-font export or `@font-face`. [scene.js](../../src/scene.js) uses the chosen family in both DOM and canvas, so a missing font changes document appearance, line wrapping and exported pixels. Chalkboard is a host dependency here, not one of the recovered bundled files.

**Default boundary:** `UserDefaults.plist` says Chalkboard48; `English.lproj/TextObjects.plist` says Arial Black16/style1/alignment34. The guide p75 describes preference defaults for the first text box. Current32 matches neither source record, but **native precedence between48 and16 has not been traced**. Do not globally replace both defaults based on one plist. The i386 strings are at `0x0024fb98` (Default Font Name) and `0x0024d676` (Default Font Size), useful next xref targets.

**Integration:** lossless web-font conversion with source-name metadata; preserve Schoolhouse's actual styles; use the same loaded face for DOM/canvas, and await font readiness before export. Trace default precedence separately. The audit installed/converted no fonts.

### F05 — Per-slide timing, transition and audio controls are missing

This finding covers **playback settings and dialogs**; Picker chrome/character animation remains assigned elsewhere.

**Resource/guide:** `TimerSettings.MHK` provides **MBTN1889,10 rows; tSCR17000–17041; bank17000,49 sprites; tWAV17000–17002**. MBTN begins at `0x1c`; script17000 at `0x25409`. Rows preserve their exact state/rollover IDs in the JSON; e.g. row2 `[17002,17003,0,17003]` plus17004, and row9 `[17039,17040,17040,17040]` plus17041. Do not attach human option names from row order alone.

`TransSound.MHK` provides MBTN777/four rows, scripts7000–7077,42 sprites and four sounds; `SlideShow.MHK` is the separately configured **AudioOptionsDialog** archive (KPD3.cfg), MBTN777/five rows, scripts7000–7019,27 sprites and three sounds. `Thumbinf.MHK` has scripts6500–6541,10 bitmaps and STRL12000 for source per-thumbnail material. These archives are not interchangeable with Picker.MHK.

The guide pp67–70 explicitly defines **per-slide** seconds, mouse click, key press, text completion, or audio completion, with Apply to all. It also defines per-slide visual/sound transition choice and preview, independent Play Sound/Play Text switches, and background color. `UserDefaults.plist` supplies interval**7**, transition4, transition-sound30 and background14; the numeric choice values need native mapping, not blind array indexing.

**Web source:** [showSlides/playSlides](../../src/main.js) persist a global transition boolean, apply an opacity animation lasting380ms, and schedule every slide with **3000ms**. There is no imported TimerSettings/TransSound/AudioOptionsDialog, no persisted per-slide advance/audio/transition structure, and no completion-based advance path. The current source only checks `manifest.slideShow` to select a baked `slideshow.png`; it does not bind those exported parts individually.

**Transition algorithm boundary:** `English.lproj/Transitions.plist` contains32 graphics names and32 sound choices including No/Random. `GFXTransitions.MHK` has32 preview bitmaps. `Soundfx/TransitionSounds.MHK` has31 sounds,64 bitmaps and33 scripts (12033 unsupported). The installer separately includes **30 `.qfx` files plus `tEFX.rsrc`** under `Data/Quicktimefx`, now hashed in the JSON. Previews/names/qfx presence do not establish each effect's render algorithm. This evidence can support true options and source audio without pretending the opacity tween reproduces those algorithms.

**Integration:** version and persist explicit per-slide settings; advance once on the chosen completion trigger; stop old speech/audio/timers on navigation; preserve Apply to all; export the actual control art/state cues. Coordinate model and dialog entry points in `main.js` with the Picker owner. Do not borrow Big Eraser effect logic before its separately assigned investigation establishes shared behavior.

### F06 — Slide Show Undo Guy is a different bank and needs real history

**Resource:** `PickerUndo.MHK:tSCR5300–5322`, bank5300/57 sprites and20 sounds5300–5319. Script5300 is the one-group base at `0x255bd`;5301 is a27-group sound-bearing sequence at `0x255ed`;5321/5322 have6/3 groups without cues. All23 decode;22 have multiple groups, at100ms.

**Web source:** the Slide Show composite pastes Easel sprite113 at `(44,260)` in [export_ui](../../scripts/import-ui.py), while the source PickerUndo origin is `(3,256)`. This records a different source composition; it is not proof of the final native screen geometry. The current Slide Show DOM/actions omit undo/redo, despite the exporter providing still images named `slide-undo`/`slide-redo`. Mutations directly splice/replace `slides`.

**Integration:** add slide history and its availability controls before attaching the correct actor bank/cues. Trace selection/randomization and owner cleanup; do not reuse Easel's20 routines as if they were these programs. Coordinate with the Picker owner.

## Other material gaps and limits

### F07 — Recovered sound files are only part of sound behavior

The current importer/manifests map **425/828** embedded `tWAV` records to existing web files: Easel33, WackyBrushSounds234, FeltPenSnds8, Anims144, StampEd6. **403** have no known importer path. This is an asset-recovery count, not the number played in a workflow and not a parity percentage. The JSON preserves every sound ID and import path, including all20 moving-paint shards. StampEd contains11 sounds but only6 enter its exported control-state graph; do not label the other5 as required control cues without finding their callers.

Unmapped groups include help183, Tp119, Picker16, PickerUndo20 and TransitionSounds31; the remaining groups are individually inventoried. `FeltPenSnds.MHK:tWAV1000–1007` are all present as `tools/felt-pen-sounds/<id>.mp3`, but **no source runtime consumer of that directory was found**. This does not prove those sounds should replace the current Marker cues: tool ownership still needs tracing.

`UserDefaults.plist` and guide pp75–76 distinguish Tool Sounds, added music/sounds, Slide Show sound and read-aloud. [paint.js](../../src/paint.js) accepts an initial `hooks.soundEffects=false`, but the main UI supplies no persistent user preference and UI/rollover/stamp/audio players are independent. A future shared policy must cover active and pending audio, not merely stop the next paint clip. `KPD3.cfg` also carries `continuous`, `lingers`, `specialFxID` and direction fields beyond the subset used by `paint-audio.js`; their exact event semantics remain open.

### F08 — Path animation threshold and speed provenance

The guide pp40–41 says dragging speed determines playback speed and distinguishes ping-pong point paths from continuous closed paths. `UserDefaults.plist` supplies **Path Animation Closing Radius10**, with string at i386 `0x00250d5d`. [scene.js:pathPosition](../../src/scene.js) uses **distance<16** for closure; capture stores points after a5px distance threshold, retains total gesture duration clamped650–15000ms, then distributes elapsed time uniformly by point index. Per-point timestamps are not stored.

This establishes a setting/source mismatch and a browser resampling choice. It does **not** prove the native algorithm preserves every instantaneous drag speed, or that the10 setting is always applied unchanged. Trace the preference reader and native path sampler; test endpoints at9/10/15/16px and gestures with different local speeds once native execution is available.

### F09 — Ambient/startup/about motion remains unused

`StarySky.MHK:tSCR3600/3601` at `0x27d79b/0x27d7ed` each has five groups at100ms in a10-sprite bank. The web imports a crop of bitmap6000 into static paint/slideshow composites; no source-sky timeline runs. `Splash:tSCR1001` at `0x37a78f` has68 groups and explicitly declares **90ms**, with sound1000. `About:tSCR7500` at `0x753d8` has35 groups at100ms. StartupMovie has391 sprites/13 scripts, of which11000 has unsupported trailing content. Current About is a text dialog and bootstrap opens the Paint Zone directly.

These are lower-priority ambience/entry gaps. The guide/preferences allow skipping the startup movie; restoring all intro material should not force a movie on every browser load. Callers, loop policies, scrolling composition and native startup selection remain untraced.

### F10 — Authored dialogs and Small Kids Mode are not implemented by extraction

Inventory includes RABCTextDlg14 scripts/18 sprites, RPronounceDlg19/21, RFlattenDlg13/14, RPickBgColorDlg35/38, EnterName12/13, EnterSnd11/12 and RDlgLogin64/52. Every MBTN row and ID is preserved in the JSON. The importer exports only three login stills (`tBMH7600` indices51,19,39); there is no runtime login consumer. Other dialogs use generic browser UI or are absent.

`KPD3.ini` defaults SmallKidsMode=false; the guide pp77–78 defines stamp-letter text, spoken character names and disabled complex menus/Slide Show/printing when enabled. Current normal-mode tools do not implement that alternate workflow. Treat this as an explicit future product scope, not as evidence that the normal default is wrong. `RABCTextDlg`'s name alone does not establish its complete Small Kids dispatch.

## Areas already active elsewhere

Keep detailed ownership with the existing investigations: Paper Canister, palette/CLUT interpretation, cursor decoding/dispatch, Picker chrome/characters, Tp controls and Big Eraser. Relevant current notes are [paper-canister.md](../paper-canister.md), [ui-animation-audit.md](../ui-animation-audit.md), [button-animation.md](../button-animation.md) and [image-control-regions.md](../image-control-regions.md).

Those areas already have substantial recovered assets and partial runtime integration. In particular, Easel has78 exported button programs and20 Undo Guy clips in the inspected manifest, Paper Canister has its new controller, and all Anims/Cyclic sprite banks are recovered with authored Moving Paints playback. Do not describe all animation as missing. Conversely, static control images and recovered regions do not prove all four source state slots, cancellation or owner callbacks run correctly. Native indexed palette installation remains unverified; this audit does not upgrade that claim.

## Integration contract and acceptance gates

No importer/application/shared-manifest changes are made here. The JSON `finding_index` is the handoff API: stable IDs `F01–F10`, priority, source references, exact repository entry points and integration requirement. `archives[].records` is the resource locator (`path,type,id,offset,bytes,sha256`); `scripts` supplies declared intervals, draw ticks, one-based sprite references, waits and sound cues; `button_tables` preserves raw words without inventing caller names. Font/resource names remain source-qualified.

Recommended implementation seams, **proposals rather than existing APIs**:

| Consumer | Data/behavior it needs | Cross-file ownership |
| --- | --- | --- |
| Transient scene effect | `play(sourceClip, anchor, {onFinish})`, `cancel(owner)`; source registration and clipping | Importer + scene effects layer + deletion/history |
| Drippy actor | Selected source program, original tint/composite rule, emission/completion lifecycle | Tool importer + native paint runtime + brush dispatch |
| Help controller | Control/help/sound graph, dwell timers, help mode, shared audio policy | Importer + main event routing + fonts/settings |
| Text/fonts | Original family/style mapping and awaited font readiness | Importer + CSS + text UI + DOM/canvas/export |
| Slide playback | Explicit per-slide advance/transition/audio data and completion events | Project serialization + Slide Show model/dialogs + speech/audio lifecycle |
| Sound policy | Tool/attached/slide/read-aloud gates; cancel current/pending owned playback | All UI/tool/scene sound entry points |

For each actor, require source-image composition and timing oracles, plus enter/leave/press/drag-out/reentry, cancellation, duplicate activation, loading failure/retry and owner teardown as applicable. Verify actual studio stacking, not only isolated images. For help and Slide Show, verify completion triggers and persistence. A browser pass validates the implementation against recovered rules; native recordings are still needed to establish native event-loop, audio onset, cursor and compositing fidelity.

## Actual checks and unresolved limits

- Read and hashed **all41 MHKs**; every one of the4,122 resource offsets/lengths agrees byte-for-byte between the two existing readers.
- Parsed **all35 MBTN tables /233 rows**; every table is exactly divisible by32bytes. Raw words retained.
- Applied the existing decoder to **all2,107 scripts**:2,101 complete, six explicitly rejected. No unsupported record was silently counted as a playable timeline.
- Parsed **26 font files /29 SFNT faces**, including exact resource offsets/names; no font installation/conversion performed.
- Reconciled all20 moving-paint shards and all144 source sound references with existing WAV files; the425 mapped sound files exist. No assertion that every imported cue has a runtime consumer.
- Inspected source code, importers, manifests, guide/settings and the listed binary addresses. **No browser tests or original-app execution ran** in this audit; no isolated browser port was assigned. No server/build/deployment was started. Parent owns full regression.
- Asset decoding/compositing for the newly identified programs was not run; caller/tint/lifetime questions remain identified above. Neither font-default precedence nor native indexed-color parity is established. No overall fidelity percentage is inferred.

Only `docs/audits/dmg-coverage.md` and `artifacts/t3/dmg-coverage.json` are owned/changed by this audit. Application/importer/shared-manifest edits, commits, pushes and publication remain with the integrating task.
