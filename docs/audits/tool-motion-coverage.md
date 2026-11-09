# Tool-control motion coverage

Audit of the mounted trial installer and current studio, 2026-11-09. **The original application has not run.** Installer and binary evidence establish authored poses, table assignments and rendering/state rules; browser tests establish web behavior only. Native event ordering, timer jitter, audio latency, color management, ordinary alpha rounding and subjective motion remain unverified. Native captures remain 0/10.

This pass covers tool icons and controls on Drawing, Painting, Bucket, Mixer, Stamp, Text, Grab and Eraser. It excludes Color Picker animation, clipboard/font features, character playback and erasure effects. The 14-control integration does not complete every animated control across those eight tabs.

## Independent evidence

Read `Data/Tools/Tp.MHK` directly through `import-ui.app_resources` and `mohawk`; decode full `tSCR` programs, not first groups or sprite-number guesses. Source archive SHA-256: `00e92bdce3a7aaf3b72b18a38928f163ba096e7a6c5a3371b5345a3df4482ae5`. Independently rechecked executable SHA-256: `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.

Diagnostics under `artifacts/t3/tool-motion-coverage/` include `source-audit.py`, `source-oracles.json` and `source-inventory.txt`. The browser spec embeds source-pinned program hashes, complete registered-frame hashes, MRGN rectangles, cue ticks, group counts and aggregate raw-sprite and ordinary PNG-channel hashes; it does not need the mounted volume or these diagnostic files after export. Regenerate audit diagnostics with:

```sh
python3 artifacts/t3/tool-motion-coverage/source-audit.py > artifacts/t3/tool-motion-coverage/source-inventory.txt
```

`MBTN` word 7 is retained as a raw field, **not** interpreted as internal state mode. The constructor derives mode2 from absent state slot2 and present slot3 at i386 `0x00031155–0x00031177`. Shared dispatch is `0x00030ce0–0x00030e9b`, same-script continuity `0x00030b25–0x00030b47`, and finite auxiliary cancellation follows zero rollover parameters. This distinction matters for Bucket's raw word7=3 and argument=1.

## Primary controls: all 14 have authored motion

Slots below are rest / tracking-and-selected / auxiliary hover. Slot2 is zero; slot3 repeats slot1. Counts are draw groups, including the final retained pose, rather than elapsed milliseconds. All these programs declare 100ms; the final yielding deadline is distinct from the end check and owned sound can postpone completion. Bucket hover18086/18089 retain five pictures through seven source ticks; their two additional final waits are explicitly exercised.

| Tab / control | MBTN row | Scripts | Groups | Native load evidence |
| --- | --- | --- | --- | --- |
| Drawing / Pencil | 18400:0 | 18060/18061/18062 | 11/11/6 | `0x000f33fc` |
| Drawing / Chalk | 18400:1 | 18063/18064/18065 | 16/16/6 | same owner |
| Drawing / Crayon | 18400:2 | 18066/18067/18068 | 16/16/6 | same owner |
| Drawing / Marker | 18400:3 | 18069/18070/18071 | 14/14/5 | same owner |
| Painting / Paint Brush | 18000:0 | 18072/18073/18074 | 4/11/4 | `0x000f41a7` |
| Painting / Sound Art Tool | 18000:1 | 18075/18076/18077 | 6/13/9 | same owner |
| Painting / Spray Can | 18000:2 | 18078/18079/18080 | 11/11/5 | same owner |
| Bucket / Single Color | 18300:0 | 18081/18082/18083 | 13/13/8 | `0x000f12ed` |
| Bucket / Blend of Colors | 18300:1 | 18084/18085/18086 | 7/11/5 | same owner |
| Bucket / Multicolor Pattern | 18300:2 | 18087/18088/18089 | 11/11/5 | same owner |
| Mixer / Mega Mixer | 18600:0 | 18090/18091/18092 | 11/11/7 | `0x000f278b` |
| Mixer / Mixer Wand | 18600:1 | 18093/18094/18095 | 11/11/7 | same owner |
| Eraser / Big Eraser (right) | 18500:0 | 18137/18138/18139 | 7/7/9 | `0x000f04f5` |
| Eraser / Mini Eraser (left) | 18500:1 | 18134/18135/18136 | 10/10/8 | same owner |

Painting and Bucket share Drawing's traced callback only over rows0–2; one-part frames take its ordinary branch. Mixer and Eraser have no mode9 callback range and must retain ordinary parts. Their apparent material colors are not evidence of tinting. See [primary callback details](tool-tray-motion.md) and [Drawing dispatch/compositing evidence](drawing-tool-motion.md).

Native command arguments are not unique row indices: Drawing uses command18400 with arguments0–3; Painting uses commands18000–18002 with argument0; Bucket commands18300–18302 with argument1; Mixer commands18600–18601 with argument0; Eraser commands18500–18501 with argument0. Eraser's table order is opposite left-to-right UI order. Tests select and assert every named browser choice, catching argument-only dispatch mistakes.

## Additional authored controls beyond the 14

These are genuine omitted state programs, not requests to broaden this patch. Exact records and all program counts are retained in `source-oracles.json`; labels follow registered placement plus existing importer controls. The plain first-group importer cannot constitute timeline playback.

| Area | Direct table/source programs | Authored motion still outside primary integration |
| --- | --- | --- |
| Grab Hand and Scissors | MBTN926 rows1/0; 18128/18129/18130 and 18131/18132/18133 | Hand8/8/9 groups; Scissors9/9/6. These are two additional long material-tool sequences. Owner explicitly loads926 at `0x000ee480`; do not call Grab single-pose. |
| Drawing styles | MBTN18400 rows4–12; 18201–18224 and18198–18200 | Nine choices each have1-group rest,2-group tracking/selected,1-group hover. Current static variant swapping omits the second state pose. |
| Painting modes | MBTN18001/18002/18003, two rows each;18167–18184 | Six controls, each1/2/1 groups. Includes Realistic/Wacky, Mouse-move/Hands-free, Paint Shapes/Moving Paints. |
| Sizes | MBTN18200/18201/18202;18140–18158 and18226–18234 | Three source groups of three size choices, each1/2/1; current size PNG swaps are not full playback. Applicability differs by owner. |
| Eraser shapes | MBTN18203;18160–18165 | Round/Square choices each1/2/1. This is control art, not page-wipe behavior. |
| Stamp | MBTN18700; owner loads18700 at `0x000dd88f` | Rows1/2 use18055/18058 with2 tracking groups; row3 Stamp Editor uses18236 with2 tracking groups. Selected states18307/18308 are single poses. Size controls are separate. |
| Text | MBTN9383; owner loads9383 at `0x000e6aa5` | Rows2–8 and12–15,17–18 include2-group tracking; alignment rows9–11 also have2-group rest/tracking. No native font implementation is inferred. |
| Grab secondary controls | MBTN926 rows2–11 | Ten2-group tracking records; several actions are deliberately outside this task. Inventory is source evidence only, not clipboard feature work. |

## Single-pose controls versus missing animation

Stamp's category popup row0 (`18053/18282/18283`) has one draw group in every supplied program: no authored multi-pose opening is established. Text's two increment controls (`18096/18278/18279`, `18097/18280/18281`) and voice popup (`18241/18284/18285`) are likewise one group per assigned program. A state image swap is sufficient to show their distinct poses; inventing a loop would be unsupported. Other single-pose selected/rest/hover slots in the tables above do not make an entire control single-pose when its tracking program has two groups.

Stamp library items and option preview images are content, not evidence of animated chrome. Unbound multi-group Tp scripts are not assigned an opening/closing role merely from their bounds. This audit makes no new playback, clipboard, font or erasure-effect claim.

## Actual-app acceptance suite

`tests/browser/tool-motion-coverage.spec.js` uses the actual studio and controls, with the shared `data-native-tool-motion` and JSON `data-motion-snapshot` contract. It imports no application renderer/controller. Its independent pixel composer decodes exported source PNGs/raw channels, uses pinned source registrations and float32 mode9 arithmetic, restores source chrome/clean backdrops, and compares full actor areas including vacated-pose pixels. It also checks a studio screenshot so an opaque foreground or old baked actor cannot hide a correct private canvas. Ordinary web alpha comparison allows one byte; this is not a native Mac pixel oracle.

Coverage includes every primary control's rest/tracking/hover group and finite terminal hold; selected-control disabling; press/drag-out/reentry/outside release; keyboard activation; same-script release continuity; color/size/effect/row/mode rerenders; source audio ownership and blur; pointer cancellation and lost capture; rapid eight-tab switching with delayed old-owner data; failed optional art/static usability/retry; editable picture text/title selection; protected chrome; retained library dragging. Each source asset bundle is checked against raw installer hashes, and ordinary PNG channels are pinned to independent source ARGB conversion. All53 clean pages are additionally pinned to independent source-script/option composition. A separate transport gate rejects HTTP `Content-Encoding` for application-decompressed bundles and checks exact fallback byte ranges.

Playwright clocks drive source deadlines one delivered update at a time. Audio fixtures record ownership and expose ended/held states; these checks establish dispatch and cleanup, not speaker output or native latency. The fixture closes the Vite HMR socket so unrelated shared-checkout artifact writes cannot reload a running case.

Use the isolated verifier configuration, with explicit `testMatch`, output directory, list reporter, one worker and port4193:

```sh
npx playwright test -c artifacts/t3/tool-motion-coverage/playwright.config.mjs
```

No shared config, application, exporter or release files are owned by this audit. Diagnostic config and results are under `artifacts/t3/tool-motion-coverage/`; no `dist-cloudflare` build is needed. Parent remains responsible for broader regression and built/public entry points.

## Execution status

The final isolated Chromium run passed **33/33 cases in1.7minutes**. All14 primary controls completed their source-pinned rest/tracking/hover timelines and terminal holds, including Bucket18086/18089's extra waits. All five trays passed same-owner color/size/option/row rerenders, static fallback/retry and cross-tab/audio cleanup. Full source comparison covered42 programs,377 raw/PNG sprite pairs and53 clean backdrop pages. The actual studio composites, editable text/title and real library stamp drop passed. `node --check` and `git diff --check` also passed.

The initial `.bin.gz` fetch failure is resolved in the current exporter by storing compressed payloads under `.bin`; the separate opaque-transport test now passes exact compressed hashes, decompressed lengths and every raw/PNG fallback byte range. Earlier failures from incomplete integration and test-harness assumptions are retained in diagnostic logs; they are not unresolved product findings.

Results: `artifacts/t3/tool-motion-coverage/final-run.log`; source/app input checksums: `tested-inputs.sha256`. The shared helper changed once early during the run; the other five captured inputs remained unchanged. A separate four-control Drawing rerun against the final captured helper passed4/4 in25.2seconds (`current-drawing-run.log`); all six captured source/data checksums still match. Port4193 was stopped after verification. Parent should rerun the exact33-case command above after any further integration edits, then complete the full dev/built/public release checks. No commit, push, deployment, shared config change or `dist-cloudflare` build was performed by this audit.

The tested stopping point completes the14-primary-control scope. Grab Hand/Scissors and the secondary multi-group controls listed above remain known omitted motion. Single-pose native controls remain explicitly distinct. Original-runtime comparison, including native timing/feel and audio output, is still unavailable.
