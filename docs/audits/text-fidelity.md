# Text fidelity: supplied Mac trial

This audit uses the mounted `/Volumes/Kid Pix Deluxe 3D` installer, its bundled user guide, and the extracted i386 executable. The original application has **not run here**. Resource contents, disassembly, browser loading checks, and native runtime verification are different evidence levels throughout this document. No native text screenshot, recording, baseline measurement, or speech recording is available.

The supplied fonts can be recovered faithfully as font data: **26 dfont containers contain 29 byte-identical TrueType faces**. Twenty-eight load unchanged in the installed Chromium. The remaining face, Tabloid, contains a recursive composite glyph and is excluded from the generated CSS. **Chalkboard is not bundled**, so these assets cannot make the source's default Chalkboard rendering portable to other operating systems. No substitute font is selected by this work.

## Primary evidence and artifacts

- Installer index: `/Volumes/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources/Archive.zplist`; compressed payload: adjacent `Archive.zp`. The `YAPackTask` for `Kid Pix Deluxe 3D.app` supplies the application paths below. [`app_resources()`](../../scripts/import-ui.py) decodes its independently compressed data segments.
- Application font directory: `Kid Pix Deluxe 3D.app/Contents/Resources/Fonts/`. Every source path, `sfnt` resource ID and index, SHA-256, exact face name, Unicode coverage, metrics, copyright/name records, and raw embedding flags is in [manifest.json](../../artifacts/t3/fonts/manifest.json).
- Defaults: `Contents/Resources/UserDefaults.plist`, `English.lproj/TextObjects.plist`, and `English.lproj/HelpTextSettings.plist`. Exact copies and parsed values are in the artifact directory/manifest. The separate installer task for `Kid Pix Deluxe 3D.app/Contents/Resources/AdminUserDefaults.plist` also specifies Chalkboard / `48`; a copy is [AdminUserDefaults.plist](../../artifacts/t3/fonts/AdminUserDefaults.plist).
- Text tray: `Contents/Resources/Data/Tools/Tp.MHK`, principally `MBTN` 9383, `tSCR` 18049 and the state programs listed below, `tBMH` 18000, and `REGS` 18000/18001. The [decoded inventory](../../artifacts/t3/fonts/text-scripts.json) includes tables 9383/9384/9385, all raw words, registered initial bounds, and 83 decoded programs. `ExtendedHelp.plist` / `AutoHelp.plist` map each table row to help topics.
- Guide: `/Volumes/Kid Pix Deluxe 3D/Kid Pix User Guide.pdf`, printed pages 25–31, 75, 77–78. Searchable supplied copy: [user-guide.txt](../../artifacts/research/user-guide.txt), especially lines 1134–1460 and 3472. The text-tray image in [public/original/ui/trays/text.png](../../public/original/ui/trays/text.png) is extracted artwork, not a screenshot of the running original.
- Executable: [kidpix-original](../../artifacts/research/kidpix-original), SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. Addresses below are i386 virtual addresses in [disassembly-i386.txt](../../artifacts/research/disassembly-i386.txt), not file offsets.

Font parsing follows fontTools' own [Mac resource reader documentation](https://fonttools.readthedocs.io/en/latest/misc/macRes.html), [sfnt-resource documentation](https://fonttools.readthedocs.io/en/latest/ttLib/macUtils.html), and [TTFont API](https://fonttools.readthedocs.io/en/latest/ttLib/ttFont.html). Browser-facing CSS uses the standard [`@font-face` mechanism](https://www.w3.org/TR/css-fonts-4/#font-face-rule). These references describe the tools/formats; the installer bytes establish the actual Kid Pix content. External primary documentation was checked on 2026-11-09.

## Source defaults and font selection

| Source | Actual values | Scope / limit |
| --- | --- | --- |
| `UserDefaults.plist`; installer `AdminUserDefaults.plist` | `Default Font Name = Chalkboard`; `Default Font Size = "48"` | Shipped user preference defaults. The guide p.75 explicitly associates the preference font/size with the first text box. Saved user settings can supersede these defaults. |
| `English.lproj/TextObjects.plist` | `defaultFontName = Arial Black`; `defaultFontSize = "16"`; `defaultFontStyle = "1"`; `defaultTextAlignment = "34"` | Separate text-drawing-object settings, not evidence to replace the ordinary text-tool default with Arial Black 16. The constructor at `0x001784f4`, especially `0x00178570`–`0x001786a3`, loads these four dictionary keys. The complete relation of that drawing-object path to editable picture text is untraced. Style/alignment numbers remain raw native values. |
| `English.lproj/HelpTextSettings.plist` | AutoHelp: Jester 14/style 0; ExtendedHelp: Jester 16/style 0 | Help text, distinct from picture text. Jester is actually bundled and recovered. |
| User defaults | `Read Aloud Text Feature = 1`; `Read Aloud Text During Slide Show = 1`; `TextToSpeachStatePreferences = 1`; `Tool Sounds = 1` | Shipped switches; they do not identify a particular voice. |

The font loader builds a URL for `Fonts` (CFString at `0x00335d70`, cstring `0x00249272`) relative to the application's resources, resolves its file specification, and calls `ATSFontActivateFromFileSpecification` at `0x0000aa96`. The surrounding function is `0x0000a9c9`–`0x0000aac9`. This establishes that the bundled directory participates in native font activation. It does not mean the native menu contains only bundled fonts.

The font-menu default selection routine at `0x00161732` reads `Default Font Name` via CFString `0x00336ee0` at `0x00161773` and searches its font records by name. If that selection fails, it constructs and searches **Franciscan**, then **Lucida Grande** (`0x00161818`–`0x00161964`). The no-preference path also searches Franciscan and then Lucida Grande (`0x00161971`–`0x00161aaf`). This is binary evidence for menu default-selection fallback, not a runtime observation of newly typed glyphs or an authorization to silently change the web default. Franciscan is available in the supplied font directory; Lucida Grande and Chalkboard are not.

The current web source starts at `textSize: 32`, offers Chalkboard plus generic serif/sans-serif/monospace choices, and clamps sizes to 8–160 ([main.js](../../src/main.js), initial state / text tray / change handler). The guide instead says the size control supports almost any font size, and describes arrows beside font/size/voice menus. The exact native numeric limits and hold-to-repeat acceleration are not yet established. The ordinary text tool's fresh bold/italic/underline flags and alignment default are also unverified; the separate TextObjects values above should not be substituted for that missing trace. Changing the fresh user default from 32 to 48 is source-backed; changing the font to a generic or bundled face as though it were Chalkboard is not.

## Exact font recovery

[`scripts/native-fonts.py`](../../scripts/native-fonts.py) extracts the `sfnt` payload itself into a `.ttf` file. It does **not** resave the font through TTFont, normalize its tables, subset glyphs, change names, synthesize styles, or modify metrics. That distinction matters: fontTools can recalculate timestamps/bounds when saving, while raw resource extraction preserves the source bytes. All 29 faces total 1,663,024 bytes. Original dfont containers remain alongside them.

The exact source filenames and resource IDs are:
| Source filename under `Contents/Resources/Fonts/` | `sfnt` resource ID → exact extracted filename |
| --- | --- |
| `Catchup-Normal.dfont` | 2925 → `CatchupNormal.ttf` |
| `Cuckoo.dfont` | 2747 → `Cuckoo.ttf` |
| `Diploma.dfont` | 2926 → `Diploma.ttf` |
| `Eurasia-Normal.dfont` | 2537 → `EurasiaNormal.ttf` |
| `Expose-Normal.dfont` | 1149 → `ExposeNormal.ttf` |
| `FifthAvenue.dfont` | 1836 → `FifthAvenue.ttf` |
| `Flat Brush-Normal.dfont` | 2965 → `FlatBrushNormal.ttf` |
| `Franciscan.dfont` | 2128 → `Franciscan.ttf` |
| `Gremlin-Normal.dfont` | 1685 → `GremlinNormal.ttf` |
| `Jester.dfont` | 15695 → `Jester.ttf` |
| `Jolt-Normal.dfont` | 1124 → `JoltNormal.ttf` |
| `Keira Condensed-Normal.dfont` | 1165 → `KeiraCondensedNormal.ttf` |
| `Market.dfont` | 1296 → `Market.ttf` |
| `Patrick.dfont` | 1300 → `Patrick.ttf` |
| `Pegasus.dfont` | 3038 → `Pegasus.ttf` |
| `Rococo.dfont` | 1365 → `Rococo.ttf` |
| `Schoolhouse.dfont` | 2139 → `Schoolhouse.ttf`; 1272 → `SchoolhouseBold.ttf`; 1951 → `SchoolhouseBoldItalic.ttf`; 2398 → `SchoolhouseItalic.ttf` |
| `Socket.dfont` | 1361 → `Socket.ttf` |
| `Storybook.dfont` | 2414 → `Storybook.ttf` |
| `Tabloid.dfont` | 2991 → `Tabloid.ttf` |
| `Tarzana.dfont` | 2263 → `Tarzana.ttf` |
| `Techno-Normal.dfont` | 2921 → `TechnoNormal.ttf` |
| `Teletype.dfont` | 2856 → `Teletype.ttf` |
| `Tubular.dfont` | 1948 → `Tubular.ttf` |
| `Vogel-Normal.dfont` | 1555 → `VogelNormal.ttf` |
| `Yankee.dfont` | 3024 → `Yankee.ttf` |

Files are under `artifacts/t3/fonts/original/` and `artifacts/t3/fonts/sfnt/`. Schoolhouse has real regular, bold, italic and bold-italic outlines. Every other supplied family has one face; native synthesized bold/italic appearance for those families is not recovered. FifthAvenue's internal family name is **FifthAve**, so filename-derived family names would be wrong. The manifest records the actual names.

The generated [fonts.css](../../artifacts/t3/fonts/fonts.css) has 28 `@font-face` entries using isolated aliases such as `KPX Native Jester` and `KPX Native Schoolhouse`. It uses the source `head.macStyle` bits to map real styles to normal/italic and 400/700. Several old `OS/2.usWeightClass` values are 5 or 7; those are preserved in metadata and are not copied blindly into CSS weights. Use `font-synthesis: none` while assessing the recovered real faces; any deliberate synthesis for missing styles needs its own native comparison. No claim of platform-identical rasterization follows from identical outlines.

Tabloid's `sfnt` resource 2991 has glyph 155, named `pi`, whose components are `pi` itself plus `circumflex`. The manifest reports `compositeCycles: [["pi", "pi"]]`. Chromium rejects the unchanged font; its OTS diagnostic reports bad directory search fields and escalating composite depth/point limits for glyph 155. FontTools contour compilation also recurses on that glyph. Fixing only the directory header would not establish faithful glyph recovery. The original bytes remain available, but Tabloid has `cssIncluded: false`; **no repaired or substituted Tabloid is supplied**. Native behavior for that malformed face is unknown.

Every recovered face has Unicode cmap data, but coverage is limited and recorded per face in `unicodeCodepoints`; do not assume modern full-Unicode coverage. The manifest also retains `hhea`, `OS/2` typographic/Windows metrics, `post` underline metrics, and units-per-em. These are useful inputs for layout investigation, not a proven native CSS line-height recipe.

Embedding metadata is retained without modification: 20 faces have raw `fsType = 0`; nine have `fsType = 1`. The latter sets a reserved low bit, rather than the modern restricted-embedding bit `0x0002`; see the primary [OpenType OS/2 specification](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype). No face supplies name ID 13/14 license text/URL. The app's bundled `English.lproj/License.rtf` was retained as evidence. Neither a bit flag nor technical loading success is treated here as a grant to redistribute the fonts. This work creates local research artifacts only.

## Text tray state programs, timing and sounds

`Tp.MHK` `MBTN` 9383 has 19 records. `ExtendedHelp.plist["9383"]` gives the corresponding topics: font 84, size 85, alignment 87, style 86, cut 88, copy 89, paste 90, Read Out Loud 92, voice 91. The following meanings follow the source artwork, matching help topics, and guide p.25/29/30. They are not native event recordings.

| Control / command | MBTN row | Four source state-script slots | Auxiliary rollover | Source initial bounds L,T,R,B |
| --- | --- | --- | --- | --- |
| Font menu / 210 | 0 | 18096,18278,0,0 | 18279 | 142,643,257,705 |
| Size menu / 211 | 1 | 18097,18280,0,0 | 18281 | 294,643,334,705 |
| Font previous/up / 200 | 2 | 18098,18099,0,18309 | 18100 | 257,643,300,674 |
| Font next/down / 201 | 3 | 18101,18102,0,18310 | 18103 | 257,674,300,705 |
| Size up / 202 | 4 | 18104,18105,0,18311 | 18106 | 334,643,377,674 |
| Size down / 203 | 5 | 18107,18108,0,18312 | 18109 | 334,674,377,705 |
| Align left / 204 | 6 | 18119,18120,0,18120 | 18121 | 255,714,280,743 |
| Align right / 206 | 7 | 18125,18126,0,18126 | 18127 | 329,714,354,743 |
| Align center / 205 | 8 | 18122,18123,0,18123 | 18124 | 292,714,317,743 |
| Bold / 207 | 9 | 18110,18111,18111,0 | 18112 | 160,715,183,744 |
| Italic / 208 | 10 | 18113,18114,18114,0 | 18115 | 189,715,212,744 |
| Underline / 209 | 11 | 18116,18117,18117,0 | 18118 | 221,715,244,744 |
| Cut / 240 | 12 | 18191,18192,0,0 | 18193 | 409,647,450,733 |
| Copy / 241 | 13 | 18185,18186,0,0 | 18187 | 449,647,491,690 |
| Paste / 242 | 14 | 18188,18189,0,0 | 18190 | 449,690,491,733 |
| Read Out Loud / 232 | 15 | 18238,18239,18239,0 | 18240 | 493,647,554,733 |
| Voice menu / 231 | 16 | 18241,18284,0,0 | 18285 | 616,659,731,721 |
| Voice previous/up / 236 | 17 | 18242,18243,0,18313 | 18244 | 731,659,774,690 |
| Voice next/down / 237 | 18 | 18245,18246,0,18314 | 18247 | 731,690,774,721 |

All 19 rows use hotspot kind 1, with raw rollover parameters `[0,0,0]`. The bounds above come from the first slot's registered, full bitmap rectangles, including transparent padding, using the established [control-region decoding](../control-regions.md). They are not guessed from opaque pixels or the raw script origin. Additional tables 9384/9385 are retained without assigning them to an untraced mode/context.

The recovered programs declare **100 ms** intervals. Many contain two image groups separated by a wait, with a sound before the second group; some redraw exactly the same image. For example, `18099` draws sprite 452, waits, plays cue 3/channel 1, redraws sprite 452, then ends through a terminal wait. Program `18111` similarly uses cue 38; `18120` cue 39; `18239` cue 66. These cues resolve relative to collection 18000 (e.g. 18003, 18038, 18039, 18066). This is timed control feedback even when there is no visible shape change. The ordinary rollover programs in the table are single-group programs without sound.

The native timing interpretation is backed by the existing [binary scheduler audit](../button-animation.md): interval handler `0x0015a52c`–`0x0015a54d`, scheduler `0x0015a2ed`–`0x0015a301`, wait handler `0x0015a6e4`. A terminal wait does not impose an additional full frame hold. Under uninterrupted finite playback, the sound/second group follows on the next scheduled update; static extraction does not establish the actual event-loop latency, whether a state is interrupted before then, or all dynamically replaced state-slot assignments. Preserve these programs rather than inventing a long tool animation or calling every state slot "hover/pressed/selected" without the caller trace.

The current web tray composites first groups into a background and overlays native HTML selects/input plus hit buttons. That preserves artwork but drops the program timing and sound feedback. The app currently exposes Bold/Italic/Underline, three alignments and Read Aloud in its text-tray markup; font/size/voice arrows and text Cut/Copy/Paste are not explicitly bound there. Global object/menu editing is a separate path. Integration should consume MBTN/script metadata and the dynamic state dispatcher after their ownership is coordinated, not edit the generated UI manifest from this task.

## Layout, selection and editing behavior

The guide provides stronger behavioral evidence than a font name alone:

- P.25: click the picture, type, and the text box grows as it fills. Cut/Copy/Paste operate on selected text, with paste at the I-beam insertion point.
- P.28–29: different characters in one text box can have different fonts, sizes, colors and styles. Alignment applies to the entire box. The blue top strip moves a text box; scale handles resize it and text reflows. The Grab Hand edit frame also supplies path/loop controls. Tab/Shift+Tab switch objects; arrow keys and Control+arrow keys move them. Text can be flattened individually or all together.
- P.26–27 and 77: Small Kids stamp characters and Alphabet animations are separate modes, with different edit/speech behavior; they are not ordinary rich-text boxes.
- P.29: spell-check-all, as-you-type dotted underlines, and Control-click spelling suggestions are documented. Browser spellcheck support alone does not establish those application behaviors.

Static executable evidence confirms the presence of a text-layout stack with run styles, font fallback, line breaking and cursor geometry: `ATSUGetRunStyle` at `0x00100637`, `ATSUBreakLine` at `0x00100b86`, `ATSUMeasureTextImage` at `0x00100ca0`, offset→cursor at `0x00100ddf`, cursor→offset at `0x00100e37`, and `ATSUSetRunStyle` at `0x0010120b`. The drawing wrapper calls `ATSUGetTextHighlight` at `0x001ce870` and `ATSUDrawText` at `0x001ce9d4`. These are binary call-site facts. The exact editable-picture-text call graph, baseline origins, padding, line metrics, glyph fallback decisions and selection/caret drawing constants remain untraced; these calls do not provide a native pixel oracle.

Current source differences are concrete ([scene.js](../../src/scene.js), [style.css](../../src/style.css)):

| Area | Current browser implementation | Source-backed requirement / unresolved native value |
| --- | --- | --- |
| Rich text | One `text` string and one style per object; `contenteditable="plaintext-only"`; style changes use whole-object `Object.assign` | Preserve style runs for character ranges; alignment stays per box. Run boundaries/selection must survive tray focus changes. |
| Box size | New object 235×100; CSS editor can grow independently of stored dimensions | Guide documents growth and reflow. Initial dimensions, growth thresholds, inset and clipping require native capture/trace. |
| On-screen wrapping | `white-space: pre-wrap`, `overflow-wrap: anywhere`, line-height 1.16 | Source engine calls native line-breaking/measurement APIs. No evidence establishes 1.16 as its line-height or breaking policy. |
| Export / flatten | Separate canvas word-splitting on spaces, `textBaseline='top'`, line advance `size*1.16`; `fillText` gets `maxWidth` | DOM can break a long word while canvas export horizontally compresses it. Font recovery cannot fix this renderer disagreement. One shared layout result should drive display/export before claiming fidelity. |
| Underline | Browser CSS decoration on screen; canvas rectangle at `size*1.02` with thickness `max(1,size/18)` | Font underline metrics are recovered. Exact native use, rounding, selection and synthesis are unverified; no source supports the current constants. |
| Selection frame | Generic object outline plus one bottom-right resize handle | Guide shows multiple scale handles and a blue move strip. Text selection, object selection, move/resize and path editing need distinct interactions. |
| Missing glyphs/styles | Generic OS font fallback and browser synthesis can vary by machine | Recovered source faces provide consistent font data for covered glyphs/real styles only. Exact legacy fallback, hinting and rasterizer behavior require native comparison. |

A source-size value of 48 is established. Whether every native drawing path interprets that value at the same device scale as 48 CSS pixels still needs native output measurements; a point/pixel conversion factor should not be guessed. Recovering font metrics does not prove baseline placement, antialiasing, kerning, line spacing or selection highlight fidelity across macOS/Windows/Linux.

## Voice and playback limits

Guide p.30 says Read Out Loud reads the selected box or selected portion; Play reads all boxes top-to-bottom, left-to-right. The voice menu and its arrows choose a voice. P.31 additionally documents pronunciation substitutions via Say It This Way. Sound/text-to-speech preferences are per user (p.78).

The i386 binary enumerates installed native voices (`CountVoices` `0x000ff73b`, `GetIndVoice` `0x000ff762`, `GetVoiceDescription` `0x000ff726`), uses `NewSpeechChannel` at `0x000ffcfb`, and speaks with `SpeakText` at `0x000ff926`. A configuration path sets rate and pitch at `0x000ffa92`/`0x000ffaa7`. The supplied font/data extraction does not recover the operating system's voice models, default voice identity, native timing, or exact pronunciation engine.

Current `scene.speak()` queues all nonempty text objects sorted by y then x, and resolves a saved browser `voiceURI` through the host's Web Speech voices. The text-tray Read Aloud action calls that all-object method too. It therefore lacks the guide's selected-range/selected-box scope. Browser voice names/URIs and legacy native voice identifiers must not be presented as equivalent. Read selected text, stop/interruption behavior, playback ordering for overlapping/tied boxes, and pronunciation substitutions require independent integration and native checks.

## Integration contract and checks

Reproduce the local recovery without touching application assets:

```sh
python3 scripts/native-fonts.py
python3 scripts/native-fonts.py --check
python3 artifacts/t3/fonts/test_native_fonts.py
python3 artifacts/t3/fonts/extract-text-evidence.py
node artifacts/t3/fonts/check-fonts.mjs
```

`native-fonts.py` accepts `--volume PATH` and `--output PATH`; default output is `artifacts/t3/fonts`. `--check` re-extracts the mounted installer and compares every generated artifact byte-for-byte. Module API `extract_dfont(data)` yields `(faceMetadata, exactSfntBytes)`; `recover(read, appPaths)` returns `(manifest, {relativePath: bytes})`. `manifest.faces[]` exposes `family`, `postscriptName`, `cssFamily`, `cssWeight`, `cssStyle`, `path`, `sha256`, `unicodeCodepoints`, metrics, `compositeCycles`, and `cssIncluded`. `fonts.css` resolves face URLs relative to itself; use the aliases in both DOM and canvas text, await font loading before measuring/drawing, and retain selected font identity in saved objects. Do not use a recovered face under the name Chalkboard.

A future text model needs text plus range styles (with explicitly defined offset units), box alignment, voice identity and dimensions; layout should return common glyph/line positions, baselines, hit/caret geometry and selection ranges for editing and export. This is an integration recommendation, not an implemented API or recovered native struct layout. Existing source/UI files were not changed by this audit.

Actual checks on 2026-11-09:

- Installer extraction: 26 containers / 29 faces; **60 output artifacts** compared byte-for-byte on a fresh `--check` run. Source timestamp fields provoke fontTools warnings for some old fonts; output bytes are unchanged.
- Five focused tests pass: all face bytes/resource IDs/hashes, four real Schoolhouse styles, absent Chalkboard with source 48 default, recursive Tabloid preservation/CSS exclusion, and rejection of non-resource input.
- Text inventory: three tables, 27 records, 83 scripts decoded, including registered initial bounds. No native runtime event dispatch is implied by decoder success.
- Standalone browser font test: Chromium **28/29 loaded**, Tabloid rejected. It uses in-memory `FontFace` buffers and a blank document; **no server/port**, app build, root test report or application configuration was used. Version/metrics/diagnostics are in [browser-font-results.json](../../artifacts/t3/fonts/browser-font-results.json).
- Firefox/WebKit checks could not launch because their Playwright executables are absent. No browsers/fonts were downloaded or installed. Windows/Linux were not tested. Font loading success checks structure and availability, not the visual identity of all glyphs or native rasterization.

Outstanding work is explicit: recover/verify the actual Chalkboard font from an authorized original OS source if exact default portability is required; validate native font-menu ordering, size increments and held-arrow repeat; trace dynamic text control state changes and speech cancellation; compare native text baselines, wraps, mixed styles, handles, highlights and voice output. No native parity percentage or runtime verification is claimed.
