# Tool-control motion coverage

Update: the runtime now enables 46 secondary source rows (144 programs,
193 poses) alongside the 16 primary actors. The source-only inventory and prior
execution records below remain historical evidence; see
[secondary control motion](secondary-control-motion.md) for enabled scope and
[Text steppers](text-steppers.md) for the latest four controls.

Audit of the mounted trial installer and current studio, 2026-11-09. **The original application has not run.** Installer and binary evidence establish authored poses, table assignments and rendering/state rules; browser tests establish web behavior only. Native event ordering, timer jitter, audio latency, color management, ordinary alpha rounding and subjective motion remain unverified. Native captures remain 0/17 prepared recipes (previously0/10).

The historical audit below covers tool icons and controls on Drawing, Painting, Bucket, Mixer, Stamp, Text, Grab and Eraser. It excludes Color Picker animation, clipboard/font features, character playback and erasure effects. The 16-main-actor integration completes the long material actors; short secondary selectors and actions across those eight tabs remain later work.

## Independent evidence

Read `Data/Tools/Tp.MHK` directly through `import-ui.app_resources` and `mohawk`; decode full `tSCR` programs, not first groups or sprite-number guesses. Source archive SHA-256: `00e92bdce3a7aaf3b72b18a38928f163ba096e7a6c5a3371b5345a3df4482ae5`. Independently rechecked executable SHA-256: `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.

Original diagnostics under `artifacts/t3/tool-motion-coverage/` and the additive Grab audit under `artifacts/t3/grab-tool-motion/` include `source-audit.py`, `source-oracles.json` and `source-inventory.txt`. The browser spec embeds source-pinned program hashes, complete registered-frame hashes, MRGN rectangles, cue ticks, group counts and aggregate raw-sprite and ordinary PNG-channel hashes; it does not need the mounted volume or these diagnostic files after export. Regenerate audit diagnostics with:

```sh
python3 artifacts/t3/grab-tool-motion/source-audit.py > artifacts/t3/grab-tool-motion/source-inventory.txt
```

`MBTN` word 7 is retained as a raw field, **not** interpreted as internal state mode. The constructor derives mode2 from absent state slot2 and present slot3 at i386 `0x00031155–0x00031177`. Shared dispatch is `0x00030ce0–0x00030e9b`, same-script continuity `0x00030b25–0x00030b47`, and finite auxiliary cancellation follows zero rollover parameters. This distinction matters for Bucket's raw word7=3 and argument=1.

## Primary controls: all 16 have authored motion

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
| Grab / Hand | 926:1 | 18128/18129/18130 | 8/8/9 | `0x000ee480` |
| Grab / Scissors | 926:0 | 18131/18132/18133 | 9/9/6 | same owner |

Painting and Bucket share Drawing's traced callback only over rows0–2; Grab uses it over rows0–1, with every frame taking its confirmed ordinary one-part branch. Mixer and Eraser have no mode9 callback range and must retain ordinary parts. Their apparent material colors are not evidence of tinting. See [primary callback details](tool-tray-motion.md) and [Drawing dispatch/compositing evidence](drawing-tool-motion.md).

Native command arguments are not unique row indices: Drawing uses command18400 with arguments0–3; Painting uses commands18000–18002 with argument0; Bucket commands18300–18302 with argument1; Mixer commands18600–18601 with argument0; Eraser commands18500–18501 with argument0; Grab commands22300/22301 with argument0. Eraser's table order is opposite left-to-right UI order. Tests select and assert every named browser choice, catching argument-only dispatch mistakes.

## Additional authored secondary controls

These are genuine omitted state programs, not requests to broaden this patch. Exact records and all program counts are retained in `source-oracles.json`; labels follow registered placement plus existing importer controls. The plain first-group importer cannot constitute timeline playback.

| Area | Direct table/source programs | Authored motion still outside primary integration |
| --- | --- | --- |
| Drawing styles | MBTN18400 rows4–12; 18201–18224 and18198–18200 | Nine choices each have1-group rest,2-group tracking/selected,1-group hover. Current static variant swapping omits the second state pose. |
| Painting modes | MBTN18001/18002/18003, two rows each;18167–18184 | Six controls, each1/2/1 groups. Includes Realistic/Wacky, Mouse-move/Hands-free, Paint Shapes/Moving Paints. |
| Sizes | MBTN18200/18201/18202;18140–18158 and18226–18234 | Three source groups of three size choices, each1/2/1; current size PNG swaps are not full playback. Applicability differs by owner. |
| Eraser shapes | MBTN18203;18160–18165 | Round/Square choices each1/2/1. This is control art, not page-wipe behavior. |
| Stamp | MBTN18700; owner loads18700 at `0x000dd88f` | Previous/next category rows1/2 use18055/18058 with2 tracking groups; row3 Stamp Editor uses18236 with2 tracking groups. Boundary-disabled states18307/18308 are single poses. Size controls are separate. |
| Text | MBTN9383; owner loads9383 at `0x000e6aa5` | Rows2–8 and12–15,17–18 include2-group tracking; Bold/Italic/Underline rows9–11 also have2-group rest/tracking. Alignment occupies rows6–8. No native font implementation is inferred. |
| Grab secondary controls | MBTN926 rows2–11 | Ten2-group tracking records; several actions are deliberately outside this task. Inventory is source evidence only, not clipboard feature work. |

## Single-pose controls versus missing animation

Stamp's category popup row0 (`18053/18282/18283`) has one draw group in every supplied program: no authored multi-pose opening is established. Text's font and font-size popup controls (`18096/18278/18279`, `18097/18280/18281`) and voice popup (`18241/18284/18285`) are likewise one group per assigned program. A state image swap is sufficient to show their distinct poses; inventing a loop would be unsupported. Other single-pose selected/rest/hover slots in the tables above do not make an entire control single-pose when its tracking program has two groups.

Stamp library items and option preview images are content, not evidence of animated chrome. Unbound multi-group Tp scripts are not assigned an opening/closing role merely from their bounds. This audit makes no new playback, clipboard, font or erasure-effect claim.

## Actual-app acceptance suite

`tests/browser/tool-motion-coverage.spec.js` uses the actual studio and controls, with the shared `data-native-tool-motion` and JSON `data-motion-snapshot` contract. It imports no application renderer/controller. Its independent pixel composer decodes exported source PNGs/raw channels, uses pinned source registrations and float32 mode9 arithmetic, restores source chrome/clean backdrops, and compares full actor areas including vacated-pose pixels. It also checks a studio screenshot so an opaque foreground or old baked actor cannot hide a correct private canvas. Ordinary web alpha comparison allows one byte; this is not a native Mac pixel oracle.

Coverage includes every primary control's rest/tracking/hover group and finite terminal hold; selected-control disabling; press/drag-out/reentry/outside release; keyboard activation; same-script release continuity; color/size/effect/row/mode rerenders; source audio ownership and blur; pointer cancellation and lost capture; rapid eight-tab switching with delayed old-owner data; failed optional art/static usability/retry; editable picture text/title selection; protected chrome; retained library dragging. Each source asset bundle is checked against raw installer hashes, and ordinary PNG channels are pinned to independent source ARGB conversion. All57 clean pages are additionally pinned to independent source-script/option composition. A separate transport gate rejects HTTP `Content-Encoding` for application-decompressed bundles and checks exact fallback byte ranges.

Playwright clocks drive source deadlines one delivered update at a time. Audio fixtures record ownership and expose ended/held states; these checks establish dispatch and cleanup, not speaker output or native latency. The fixture closes the Vite HMR socket so unrelated shared-checkout artifact writes cannot reload a running case.

Use the isolated verifier configuration, with explicit `testMatch`, output directory, list reporter, one worker and port4194 (both coverage and integration specs):

```sh
npx playwright test -c artifacts/t3/grab-tool-motion/playwright.config.mjs
```

The Grab completion changes only its focused exporter, owner enablement, source contracts/tests and audits. Diagnostic config, independent source oracles and results are under `artifacts/t3/grab-tool-motion/`; no shared Playwright config or `dist-cloudflare` build is needed. Parent remains responsible for broader regression, media delta sync and built/public entry points.

## Grab source contract and independent acceptance

Grab's source rows stay in native order: Scissors0 (`scissors`, command22300),
Hand1 (`grab`, command22301), argument0/group153 for both. The manifest records
`renderMode:'mode9'`: the installed common callback takes its ordinary branch
for all49 single-part groups, confirmed by vtable0x0031eff8 range functions
0x000eb184/0x000eb18c returning0/1. Appearance did not establish rendering.

Hand uses hotspot kind1 but **internal mode2**. Its initial full registered
rest/press bounds are both `[130,623,272,763]` LTRB. The kind1 constructor replaces
their union with hover18130's initial full sprite371 rectangle, yielding exact
hit/auxiliary bounds `[149,643,109,112]` XYWH. Scissors uses sourceMRGN1926
`[271,648,115,108]`. Source pins retain initial construction inputs as well as
all six complete registered-frame hashes, program bytes, cue ticks, raw and
ordinary-channel hashes. The existing table/resource pins remain additive;
no original14-actor pin was replaced by a generated-manifest value.

Clean Grab and all three Scissors pages are independently composed from source,
omitting only their two primary state programs. The ordinary source PNG channels,
raw bytes and all four new backdrop pixel hashes are embedded in the browser
spec. Actual-studio screenshots check **every new pose**, overlaps and vacated
locations over the clean page. The owner survives Hand/Scissors switching and
all three option pages, including captured pointer and held-Space rerenders.

Dedicated browser cases also cover each of the six cue deadlines and held-sound
end gates, pointercancel/lostcapture/blur for both actors, separate static failure/
retry selection restores for Hand and Scissors,
delayed Grab bundle cancellation/reentry, separate PNG/raw fallback, real Hand
object selection/drag/undo/redo and Scissors raster selection/moving. Other tests
retain selected disabling, pointer/keyboard/drag-out/reentry, same-script release
continuity, all earlier color/size/effect rerenders, text editing and library dragging.

## Execution status

The initial4194 run passed52/52 cases; the expanded69-case run also passed
completely. Those include all original33 independent coverage and15 integration
cases. Final validation adds a separate Scissors static selection restore.
Original source pins and existing14 actors are retained. All12 focused Python
cases,25 focused Node cases and asset verification (9,382 referenced files) pass.
The final strict4194 run passed **70/70 cases in2.4minutes**:55 coverage cases
(including all original33) and all15 integration cases. Port4194 was stopped.
Results: `final-browser.log`; final source/data checksums: `tested-inputs.sha256`.

Independent diagnostics: `artifacts/t3/grab-tool-motion/source-audit.py`,
`source-oracles.json`, `source-inventory.txt`, raw/PNG/backdrop hashes and run logs.
The original4193 diagnostic evidence is left intact. `preservation.log` verifies
all five original compiled tray contracts against committed cd56b3e and all851
previously staged payload hashes byte-for-byte. `delta-media.json` enumerates69
new payloads (3,206,676 bytes); the updated index is647,580 bytes. The helper-source import
case in the integration spec retains its `@module` tag.

No commit, push, deployment, shared config change, release build or R2 upload
was performed. Public remains0.5.0/source8caa533; parent owns the69-payload Grab
media delta plus index, final full regressions/release and media-inclusive handoff.
Native runtime comparison, timing/feel, audio latency/output and Mac bitmap
rounding/color space remain unverified. Original application execution and native
reference captures remain unavailable (0/17).

## Secondary action integration — 0.7.0

The enabled secondary scope now includes the previous 23 selector rows plus 19
action/Stamp rows: 42 rows, 128 programs and 173 authored poses. This is separate
from the 16 primary actors' 48 programs and 453 poses. It does not mean every
recovered secondary action or the complete original program is implemented.

`native-action-state.js` preserves mode-0 momentary actions, mode-1 independent
toggles and mode-2 exclusive/boundary behavior. `native-action-motion.js` binds
Text alignment/B/I/U and supported Grab actions to authoritative application
state. `native-stamp-motion.js` uses independent arrow, editor and size owners;
category bounds select the source disabled programs. The category popup remains
a standard select. Unimplemented action contracts remain separate follow-up work.

Stamp source restoration omits the two manually baked arrow sprites from its
clean backdrop; the existing static library artwork remains the failure fallback.
The tracked independent pose pins cover 29 draw groups and 123 transitions.
Actual-studio tests cover all 26 animated groups, including the disabled arrows.
Source-pixel and browser checks establish web behavior, not native event timing
or subjective feel. Native references remain 0/17.

Grab action restoration uses two disjoint source-derived footprints for clipboard
and ordering. The unbound next/previous-object column stays transparent to the
retained static source art; these two arrows have no new action binding. Path,
Loop Path and Play Object remain available through the Paint Zone menu rather
than floating over the restored native tray.

Release validation:188 Node checks,237 dev browser cases,226 built browser cases
and13 focused exporter cases passed. All17 reviewed Ubuntu web captures were
accepted with zero remaining regression/comparison errors; native comparisons
remain0/17. Failed-art and Text press phase probes, independent composition
checks and staging receipts are retained separately from the final full runs.
