# Interaction UX audit

Tested the pending 0.5 checkout on 2026-11-09, based on commit `1970780642186211f64affbfd6f257213ae12ddd`. The public 0.4.0 deployment was not exercised. Application files and other contributors' edits were preserved.

The original application has **not run here**. These results establish browser behavior against supplied resource/binary evidence and explicit web UX requirements. They do not establish native animation feel, OS event delivery, or screenshot parity.

## Primary evidence

| Evidence | What it establishes | Boundary |
| --- | --- | --- |
| Mounted [Kid Pix User Guide.pdf](</Volumes/Kid Pix Deluxe 3D/Kid Pix User Guide.pdf>), printed pp. 25–26; extracted [user-guide.txt](../../artifacts/research/user-guide.txt), lines 1156–1189 | Text Tools creates editable picture text. Selected text can be cut/copied/pasted through controls in the Text tray. | Keyboard shortcut choice, HTML focus behavior and browser clipboard permissions are web adaptations. |
| Same guide, printed p. 28; extracted text lines 1288–1295 | Objects can be moved with dragging/arrows and deleted with Delete/Backspace. | These tests assert ordinary one-pixel arrows. Native modifier mapping is not claimed. |
| Same guide, printed p. 35; extracted text lines 1630–1650 | Library objects can be dragged into the drawing area or inserted with Return/Enter. | These tests cover real HTML dragging; they do not prove the native drag image, pointer threshold, or exact placement rounding. |
| [i386 disassembly](../../artifacts/research/disassembly-i386.txt), `0x000705a0`–`0x000705b8`, `0x000727eb`–`0x00072814` | Native candidate targeting calls the control's point test; its rectangle branch uses inclusive left/top and exclusive right/bottom. | The existing control-region tests cover recovered geometry. Browser focus outlines and text-selection suppression are web UX policy. |
| Same disassembly, `0x0008ed60`–`0x0008ed7f`, `0x0008e5ac`–`0x0008e5e3`, `0x0008e74e`–`0x0008e78b`; Easel script 1055 | The picker starts script 1055 and outside/Escape paths dispatch close event `0xd80`. The resource's six 100ms groups are documented in [paper-canister.md](../paper-canister.md). | Outside-click pass-through, closing while a browser image promise is pending, and exact native callback latency remain unverified. |

The executable SHA-256 is `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`. The mounted guide SHA-256 is `1a974daf259180c79bf358e9efebb7e27ccde0c67133174098e360dd4dea812d`. A fresh `pdftotext -layout` extraction into [mounted-user-guide.txt](../../artifacts/t3/interaction-ux/mounted-user-guide.txt) was byte-for-byte identical to the existing research text (`cmp` exit 0). No web or secondary source was needed.

## Checked workflows

[interaction-ux.spec.js](../../tests/browser/interaction-ux.spec.js) adds 14 real-application cases without replacing the catalogue, artwork, UI metadata, or drawing assets with fixtures.

| Cases | Visible outcome asserted | Expectation basis |
| --- | --- | --- |
| 1 title/focus | Select, copy to the clipboard, replace and paste the picture title; Tab reaches Drawing Tools and Enter activates it. | Web editor and keyboard UX policy; title control's precise native action remains untraced. |
| 1 picture-text editing | Real mouse selection survives inherited selection suppression; keyboard copy/cut/paste edits text; blur commits one undoable addition and redo restores the words. | Native guide's text-editing workflow; browser shortcuts/clipboard are adaptations. |
| 3 responsive library workflows | Real asset drop at picture `(410,270)` at 1024×768, 800×600 and centered portrait 600×900; decoded asset/name, Grab Tools activation, arrow movement, copy/paste/delete and history all work. | Native guide workflow plus web coordinate policy. HTML drop error is bounded by one screen pixel, accounting for integer drag-event coordinates. |
| 1 abandoned library drag | Release outside the paper adds nothing; the next real drop adds exactly one object, undo removes it, redo restores it. | Web cancellation/data-integrity policy. |
| 1 object cancellation | A delivered pointercancel ends movement; later hover adds nothing; undo/redo restores original/moved coordinates. | Web event cleanup/history policy. |
| 1 paint outside release | Captured drawing continues outside the page, ends on release, creates no chrome text selection, and remains one undoable stroke. | Web pointer-capture/history policy. |
| 3 paint interruptions | Pointercancel, actual capture release and window blur each preserve delivered native-media ink; later movement adds nothing; a fresh stroke and both history steps work. | Web interruption policy, not proof of native OS interruption semantics. |
| 1 modal workflow | New Picture Cancel and Escape retain title, text and paint; background controls stay inert; focus returns to the trigger; dismissal adds no history entry. | Browser modal/data-preservation policy. Chromium's neutral body focus between tab cycles is permitted. |
| 1 popup workflow | Escape closes paper/color/menu popups; outside title click closes paper; prior title and text edits persist and remain editable. | Native paper close evidence; other popup/focus choices are web UX policy. |
| 1 moving-paper interruption | Closing during the source opening sequence cannot reveal stale picker controls over continued text editing, checked after 700ms with real timers. | Source opening/close evidence plus browser asynchronous-work policy. This does not compare all animation pixels or frame latency. |

Input is real Playwright mouse/keyboard input except the explicit interruption boundary: pointercancel and window blur are dispatched events; lost capture calls `releasePointerCapture` for the actual active pointer. Clipboard checks grant permissions only to the isolated test browser context and verify only the strings written by that case. Pixel snapshots compare the picture before/after history; they are not native reference screenshots. Uncaught exceptions, failed requests other than intentional aborts, and HTTP errors fail every new case.

## Reproduced defects for application owners

These probes are kept under `artifacts/t3`, outside the normal test discovery tree. They assert concrete missing behavior, rather than adding arbitrary failing preference tests to the suite. The [diagnostic results](../../artifacts/t3/interaction-ux/defects-results.json) retain JSON observations, screenshots and traces for three failures.

### Object movement survives lost capture — P2

Reproduction: drag a real sticker, release the actual `#objects` pointer capture, move outside the surface, release the mouse, then hover back over the sticker without pressing. Its position changes from `(296,219.5)` to `(306,229.5)` during that unpressed hover.

The browser sequence is reproduced; a natural OS/window-switch trigger for it has not been verified. This is a web gesture-cleanup defect, not a native-parity finding. In [scene.js](../../src/scene.js), `pointermove` around line 152 checks the retained pointer ID without checking held buttons. `finishDrag` around line 168 is bound to pointerup/pointercancel, but no lostpointercapture cleanup exists. A release outside the surface after capture loss never reaches that handler.

Fix requirement: settle or cancel an active object move/resize when capture is lost, clear drag state, and retain a consistent single undo checkpoint. Deactivation should be considered in the same lifecycle. A no-buttons hover after interruption must not mutate the object. Extend the passing pointercancel case with the diagnostic lost-capture sequence once fixed.

Evidence: [error context](../../artifacts/t3/interaction-ux/defect-output/defects-lost-scene-pointer-a41e2--on-a-later-unpressed-hover/error-context.md), [trace](../../artifacts/t3/interaction-ux/defect-output/defects-lost-scene-pointer-a41e2--on-a-later-unpressed-hover/trace.zip).

### Native Text tray clipboard controls are absent — P2 fidelity gap

Text Tools exposes Bold, Italic, Underline, Align left/center/right and Read Aloud, but no Cut, Copy or Paste controls. The guide explicitly documents those three controls operating on selected text in the Text tray (printed p. 26, extraction lines 1181–1189). Keyboard text clipboard operations pass, so the pending selection CSS does not cause this missing-control gap.

Fix requirement: add source-positioned Text tray clipboard controls and preserve the text range when activating them. They must act on selected text, support caret paste, and preserve editing history. Routing them directly to the existing generic `scene.edit()` is insufficient: that function copies/cuts whole scene objects. Native button geometry/resource dispatch for these particular actions still needs tracing; this audit does not invent their hit boxes.

Application seam: `showTray()`'s text branch in [main.js](../../src/main.js), `doEdit()` and the text-editor range/history ownership in [scene.js](../../src/scene.js).

Evidence: [error context](../../artifacts/t3/interaction-ux/defect-output/defects-native-guide-text--751b2-py-Paste-actions-must-exist/error-context.md), [trace](../../artifacts/t3/interaction-ux/defect-output/defects-native-guide-text--751b2-py-Paste-actions-must-exist/trace.zip).

### Menu expanded accessibility state remains stale after Escape — P3

Open Show menus, then press Escape. `#menu-items` becomes hidden while its trigger retains `aria-expanded="true"`. This is an observed contradiction in the web control's exposed state, not a native expectation.

Fix requirement: synchronize the trigger to `aria-expanded="false"` on Escape and any other dismissal path. The Escape branch in [main.js](../../src/main.js) around line 1405 hides the menu directly. Consider sharing a close helper with menu activation/command dismissal.

Evidence: [error context](../../artifacts/t3/interaction-ux/defect-output/defects-menu-expanded-state-must-follow-Escape-dismissal/error-context.md), [trace](../../artifacts/t3/interaction-ux/defect-output/defects-menu-expanded-state-must-follow-Escape-dismissal/trace.zip).

## Execution and integration

All local browser runs use isolated **4186**, one Chromium worker, a 1024×768 default viewport, real imported media and temporary config/report directories under [artifacts/t3/interaction-ux](../../artifacts/t3/interaction-ux). They start Vite directly; they do not build Cloudflare output. The browser server is stopped after each run.

```sh
npx playwright test -c artifacts/t3/interaction-ux/playwright.config.mjs
# 14 new cases plus the existing 3 control-region cases

npx playwright test -c artifacts/t3/interaction-ux/defects.config.mjs
# Diagnostic only: 3 concrete defect assertions fail on the audited checkout
```

The focused new-spec run passed **14/14**. The final combined run passed **17/17 in 14.9s**, including all three existing control-region cases, with zero retries. Results are recorded in [results.json](../../artifacts/t3/interaction-ux/results.json) and [final-run.log](../../artifacts/t3/interaction-ux/final-run.log). The earlier 12-case run also passed before object-cancel and moving-paper cases were added.

An earlier combined run passed 16/17: the existing selection/drag case timed out during an observed page reload (its trace showed a second Vite connection). That case passed alone, then the whole combined set passed without file edits during execution. The reload's specific cause was not established in this shared checkout; the interrupted run's output is retained in [combined-interrupted-run.log](../../artifacts/t3/interaction-ux/combined-interrupted-run.log). Initial test-harness mistakes (an invalid multi-character key name, overly strict scaled-drop rounding, and an incorrect assumption that modal Tab never visits neutral body focus) were corrected; they are not application defects.

Integration requires adding `interaction-ux.spec.js` to the fixed `testMatch` list in `playwright.build.config.js` (owned by the parent). Default discovery already finds it. No new application export or test-only production API is required. Stable surfaces used are accessible button/editor names, `#paper-canvas`, rendered scene object geometry/content, native readiness/state attributes already exposed by the application, actual HTML drag/drop, and standard browser clipboard/events. Parent owners should handle the three fixes above and then promote their concrete reproductions into normal regression cases.

Owned deliverables are this audit and the new browser spec only. Temporary configs, mounted-guide extraction, logs and diagnostic probes live under the assigned artifact directory. No commits, pushes, publication, credentials, fleet changes, external messages or subdelegation occurred.

## Remaining limits

No native runtime reference exists. The supplied title record's action, pointer coordinate rounding, outside-click redispatch and platform-specific blur/cancel delivery are still unverified natively. These Chromium dev-server results do not establish Safari/Firefox, touch/pen, OS clipboard restrictions, accessibility-tree behavior with a screen reader, production build behavior, or full-suite regression status. Pure DOM assertions and matching imported-resource metadata must not be presented as native runtime proof. The parent owns final built-app/full-suite checks and any publication.
