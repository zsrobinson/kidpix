# Pending 0.5 integration review

Reviewed 2026-11-09 against HEAD `1970780642186211f64affbfd6f257213ae12ddd` and the uncommitted integration present during this review. Public release 0.4.0 was not modified or tested. Scope: `paint.js`, `paint-original.js`, `native-marker.js`, `native-brush-tracking.js`, `native-paper.js`, paper/history wiring in `main.js`, paper binding exclusions in `native-ui.js`, selection CSS, and their focused tests. Other parallel work is outside this verdict.

**Integration follow-up: the three P2 findings below have been addressed.** The review findings are retained as the original evidence record. The caller now honors canceled texture loads, paper playback advances by delivered updates with a terminal hold, and fallback row navigation uses live popup visibility. Eight actual-app paper browser cases pass, including out-of-order loads, undo cancellation and persistent fallback row navigation; seven focused Node cases cover the timeline and ownership contract. Passing source-rule tests establish useful recovered behavior, but do not close the full UI-animation/UX goal.

## Findings

### P2 — A canceled paper request overwrites the current canister selection

- **Location:** [main.js](../../src/main.js), lines 1267–1270; cancellation contract in [paint.js](../../src/paint.js), lines 1073–1078. `activate('texture:…')` ignores the boolean returned by `paint.setPaper()` and always assigns `selectedPaper`, calls `setSelected()`, and closes the popup.
- **Trigger:** choose texture 12301 while its image is slow, then choose 12302 before the first request completes. The popup remains interactive while the first load is pending. Alternatively, undo/reset/restore can invalidate the pending request through `updateId`.
- **Observed reproduction:** executing the actual extracted `activate`, `setLayer`, and `syncPaperSelection` functions in a controlled Node VM, with deferred image loads, produced `{selectedPaper:12302, actualPaper:'…/12302.png'}` after the second request, then `{selectedPaper:12301, actualPaper:'…/12302.png'}` when the canceled first request resolved. The old completion also invoked the helper's `setSelected(12301)`.
- **Impact:** the canister, highlighted choice, and next opening page can describe a different paper from the texture used by painting. A stale completion can close a subsequently reopened picker. The paint layer correctly rejects the stale load; the UI continuation bypasses that protection.
- **Integration requirement:** consume the successful-application result before changing UI state, or make the existing `onChange({paperSource})` synchronization authoritative. Cover out-of-order choices and a pending choice invalidated by undo. Existing paper tests await each completed selection and therefore miss this race.
- **Primary behavioral reference:** the supplied [user guide](../../artifacts/research/user-guide.txt), lines 988–1003 (printed page 22), specifies that the canister shows the selected texture and subsequent drawing uses it. Native substitution callbacks are `0x00053fb6` and `0x0008e89c` in the [i386 disassembly](../../artifacts/research/disassembly-i386.txt); both derive art from the owner's selection.

### P2 — Delayed paper updates skip authored poses and bypass the delivered terminal hold

- **Location:** [native-paper.js](../../src/native-paper.js), lines 154–180. Frame and completion are derived from absolute elapsed time; a single `step()` can reveal the last page frame and immediately clear that page in its completion callback, lines 208–225.
- **Trigger:** a rendering stall, throttled frame delivery, or suspended tab during opening. This does not require an asset failure.
- **Observed reproduction:** using the existing Node fixture and actual helper, callbacks at `0`, `350`, and `650` ms yielded frames `0 → 3 → 5`, then `state='open'` and `onReady(650)`. Frames 1, 2, and 4 were never drawn. At 650 ms the last opening page was immediately removed in the same callback, leaving only roller70 and the cylinder before the live picker callback.
- **Source discrepancy:** the opening is created with flags `0x00800031` at `0x0008ed78`. These do not set the sign bit tested at `0x0015a2de`–`0x0015a2e0`; the applicable branch `0x0015a2ed`–`0x0015a301` sets the next deadline to **current framework time + interval**. Wait handling at `0x0015a6e4`–`0x0015a72b` yields between groups, and finite completion at `0x0015a304`–`0x0015a372` occurs on the following delivered update after end. The paper callback explicitly requires that later `-2` completion reason at `0x0008eb41`–`0x0008eb58`. This is sequential delivered-update playback, rather than indexing directly into wall-clock elapsed time. Addresses are in the [original disassembly](../../artifacts/research/disassembly-i386.txt). `Data/Easel.MHK` tSCR1055 independently supplies the six groups and 100 ms interval.
- **Impact:** the newly recovered motion can turn into a jump, with no visible final opening hold. This matters to the requested authored-animation fidelity even though browser/native event-loop latency cannot be identical.
- **Integration requirement:** advance the source program by eligible delivered updates and retain the terminal frame until its following scheduled completion update. Add a delayed-callback case that records every presented frame and the terminal dwell. The current Node test deliberately advances directly to 599 ms and asserts frame5, so it validates the current elapsed-time policy rather than independently checking source delivery semantics. Controlled regular-RAF browser tests do not expose it.

### P2 — The animation-failure fallback cannot navigate texture rows

- **Location:** [main.js](../../src/main.js), lines 582–589, 1261–1263, and the paper `onError` callback at lines 1459–1462.
- **Trigger:** opening art fails to decode. `onError` renders the live fallback, leaving `paperOpen=true` while the helper has `state='closed'`. Press “Next texture row.”
- **Observed reproduction:** executing the actual `openPaper()` with that state and the row increment used by `activate()` changed `paperPage` from 1 back to 0 and invoked `nativePaperPicker.open(12300)`. It did not render row 1. Persistent failure repeats the fallback at row 0; successful retry unexpectedly starts the opening animation instead of honoring the requested row.
- **Impact:** users cannot reach papers on other rows while opening-animation assets are unavailable, despite an otherwise usable static picker. The same problem applies to Previous on a fallback opened from a later selected page.
- **Integration requirement:** distinguish changing the row of an already visible live picker from beginning a new animated opening. Test Next/Previous while the opening asset continues to fail, including a selected texture on a later page. The existing failure test checks Smooth Paper and retry after closing, but never operates fallback row controls.
- **Primary behavioral reference:** [user-guide.txt](../../artifacts/research/user-guide.txt), lines 999–1003, explicitly includes scrolling through texture choices. Page lookup is tSCR1122; native begin's ordinal/page calculation is at `0x0008ec83`–`0x0008ecb7`. Resetting to the selected page belongs to a new opening, not each live row change.

## Source fidelity checks without findings

- **Marker arithmetic:** checked [native-marker.js](../../src/native-marker.js), lines 5–22, against `0x00121500`–`0x00121681`. Mask255 retention, integer paper quotient, divisor+254, Option inversion, float32 operation order, +0.5, truncation, and independent darkening agree for the implemented ordinary pixel path. Destination capture is explicitly below scene objects; that is an acknowledged layering limit, not verified native object/paint behavior. Browser preview alpha is forced opaque only for changed pixels on an already opaque composed destination.
- **Tracking:** the accepted-point threshold, directed integer ties, segment endpoint residual, lack of release-position interpolation, and configured/effective spacing distinction agree with the reviewed binary paths. Stationary painting requests one timeout sample per delivered callback and stops on release/cancel/blur/hidden document. The evidence supports a requested 5 ms Core Foundation timer and extra event-loop scheduler passes; it does not establish 200 delivered native dabs/second. Direct pointer/coalesced-event sampling and recursive browser timeouts remain adaptations.
- **Paper and Option:** actual imported paper12301 is 720×542 opaque RGBA, matching this application's fixed page dimensions. Generic and Marker paths sample the page texture separately and capture Alt/Option at stroke begin. Generic alpha quantization, dry-out, smear, coverage accumulation, native RNG consumption, and filled-shape behavior remain documented limits. The old approximate `drawOriginalDab` Marker branch still exists, but the reviewed actual-app bitmap path selects `createNativeMarkerStroke` instead; it is not evidence that the new path has the old opacity.
- **Paper assets:** re-read `Data/Easel.MHK` from the mounted installer using `app_resources()`/`mohawk()`. Every `compile_paper()` metadata key matched the current exported manifest, including six opening groups, timing, registration, substitution tables, and state programs. All 21 indexed cylinder PNGs matched the raw indexed payloads decoded with the archive tPAL exactly. This validates archive-authored colors, **not installation of that palette in a running Mac drawing port**.
- **Cleanup and ownership:** reviewed generation guards around pending decode, close, reopen, and disposal; the focused stale-load cancellation/retry checks pass. The main integration excludes paper from both legacy sprite state binding and generic rollover binding, leaving one art controller. The new canvas is at z-index4; the existing browser test checks the actual studio composite as well as the helper canvas. These browser results were read, not rerun here.
- **Selection/history:** CSS suppresses chrome selection and image dragging while retaining explicit input/textarea/contenteditable exceptions. Library tiles retain their own draggable parent and drag handler. Native held-stroke cancellation now checkpoints before the unified history entry is chosen; the existing browser test covers that ordering. No additional concrete standards violation or selection-policy regression was established in this scope.

## Actual checks and limits

Executed successfully during this review:

```sh
node --test scripts/parity/native-brush.test.mjs scripts/parity/native-brush-tracking.test.mjs scripts/parity/native-marker.test.mjs scripts/parity/native-paper.test.mjs
# 31 passed, 0 failed

PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts python3 -m unittest scripts/test_native_paper.py
# 4 passed
```

Additional in-memory checks: mounted-archive metadata comparison; exact 21-cylinder RGBA comparison; the two controlled main-function reproductions and delayed-callback helper reproduction described above. Reproduction harnesses used extracted production functions with stubbed I/O/scheduling; they are deterministic integration probes, not actual-browser or native-runtime observations. No persistent test/config/output files were created.

The extracted executable SHA-256 was independently recomputed as `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`, matching [reverse-engineering.md](../reverse-engineering.md). Primary inputs were the local executable/disassembly, installer resource payloads, KPD3.cfg and supplied user guide. No secondary technical source was needed for the findings.

No isolated browser port was assigned in this review brief, so no browser server or browser suite was started. No build, deployment, public-site validation, full regression, native reference capture, or original-app execution occurred. Native references remain absent (0/10 per the work brief). Browser fixture clocks and source-image oracles establish web implementation behavior; they cannot establish native palette installation, event latency, audio onset, or subjective feel.

The broader goal remains partial: static tray state swaps still omit source-authored multi-group motion in Tp.MHK, and Easel/Slide Show state playback and effect behavior have separate gaps described in [ui-animation-audit.md](../ui-animation-audit.md). Those are scope/acceptance limits, not new defects attributed to unrelated parallel work. Do not describe these three integration improvements as completing the full animation/UX fidelity goal.

## Integration contracts and ownership

- `paint.setPaper(asset)` returns `Promise<boolean>`: `true` means applied, `false` means superseded. `onChange` includes the authoritative `paperSource` on edits, undo/redo, reset, and restore. UI continuations must honor cancellation.
- `createNativePaperPicker({manifest,control,layer,staticSprite,onReady,onError,...})` returns `open(id,readyOverride)`, `close()`, `setSelected(id)`, `dispose()`, and `state`. IDs are 12300–12320. `open()` resolves after decode/start, **before** timeline completion; readiness is the callback. Closed helper state does not necessarily mean the fallback popup is hidden.
- `createNativeBrushTracking({spacing,lineSpacing})` consumes signed integer page points and returns absolute centers plus relative deltas from `begin()`/`track()`; `end()` emits nothing. Painting owns timers, capture, composition, and history.
- `createNativeMarkerStroke(base,overlay,options)` owns working destination pixels; `draw(mask,placement)` requires original bitmap dimensions, `reset()` restores its initial destination, and `used` chooses the commit path. The present main canvas is 720×542; arbitrary scaled Marker canvases are not established by this review.

Only `docs/audits/release-review.md` was changed. Source fixes and regression additions are for the owning integration work; none were made here.
