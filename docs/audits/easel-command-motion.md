# Easel Save and Export motion

Save and the existing Easel Export control use the source mode-0 streams. The browser commands remain `save` (the existing choice dialog) and `stereo` (`exportStereo`). Export PNG remains a separate menu/dialog action. New, Print and Help retain static binding and their existing auxiliary fallback.

## Source contract

The read-only five-button audit at `/home/zsrobinson/code/kidpix/artifacts/t3/easel-command-buttons-next/` supplied README, evidence, reproduction script and public-media verification. The compact committed [fixture](../../tests/fixtures/easel-command-motion-source.json) retains only these two rows, six complete programs, 20 independently composed RGBA hashes, registrations, geometry, deadlines and media body hashes. Its oracle is the raw archive audit, not the production manifest.

- Mac Easel SHA256: `6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c`.
- Executable hash: `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`; disassembly hash: `d1130230e50b57bebdeebc9ef7496fb6d4fd9332b35b52fe86836dd75bf19963`. Neither executable nor installer was run.
- Save row18 / command281: slots `[1038,1036,0,0]`, auxiliary1037, mode0/group3, hit `[899,149,954,202]`.
- Export row22 / command300: slots `[1123,1124,0,0]`, auxiliary1125, mode0/group0, hit `[954,148,1009,201]`.
- Kind1 uses exact registered composition bounds, with auxiliary initial bounds replacing the rest/tracking union. Left/top inclusive, right/bottom exclusive; no stretched or alpha-mask substitute.
- Rest/tracking draw at ticks0/1/2, earliest end check3. Auxiliary draws at0/1/2/3, earliest repeat check4. All intervals are100ms. Tracking alone emits1004/channel1 at tick0. Rest and auxiliary are silent; no owner1005 sound was added.

## Ownership and APIs

`attachCommandMotion` supplies explicit mode and command bindings to the existing shared stream/contact core. `attachLibraryMotion` still defaults to four library buttons; `attachToolTabMotion` still supplies eight tabs. Existing selection, same-script progress, auxiliary freezing, audio end gates and group cleanup remain in the shared core. Mode0 never requests absent slots2/3, reads ARIA as a latch, or changes `state.tray`.

Initial decode/adoption displays silent terminal rest, matching the old normal image. A held fallback contact defers adoption until its release/default click transaction finishes. No button node or tray is rebuilt. A failed image decode leaves static input/art usable and the failed cache entry can retry on entry.

The first primary contact captures input. Drag out/in switches rest/tracking; release outside does not dispatch. Release inside emits one semantic click and consumes its physical compatibility click, including WebKit's changed mouse ID after touch. Ready mode0 keyboard input tracks Enter/Space until matching keyup, suppressing repeat. Escape, focus loss, blur, visibility, pagehide, capture cancellation, disable, modal changes and disposal retire owned motion/audio. Unrelated sound channels remain independent.

`activate()` invokes the original command without adding an await and then completes mode0 dispatch in `finally`. This completion is **not** a completed save/download signal. The Save modal can cancel its own source actor immediately. Stereo image decode/download can outlive the mode0 contact. No completion callback from that task has access to the actor, so old resolve/reject outcomes cannot reclaim a newer contact. Existing missing-right-background and decode/async-failure handling is unchanged. No task generation token is required because task outcomes never mutate motion.

## Existing media requirement

29 existing keys, no new media: `ui/ui.json`, `ui/button-animations.json`, `ui/easel-1004.wav`; six static fallbacks `ui/{save,export}-{0,1,2}.png`; and 20 PNGs `ui/button-animations/{1036,1038,1123,1124}-{0,1,2}.png` plus `{1037,1125}-{0,1,2,3}.png`. Every exact key, byte length and SHA256 is in the fixture. All29 are a subset of the parent's68 verified public bodies (recorded2026-11-10); this work did not fetch or publish media.

## Validation and reproduction

Private outputs live under `artifacts/t3/easel-command-motion/`. Dependencies and original media were temporary read-only input symlinks. Cloudflare-mode builds avoid public media copies. Actual browser phases run under `flock /var/tmp/kidpix-ui-validation.lock` using the existing pinned Playwright image, `--pull never --cap-drop ALL`, host UID/GID, host networking, read-only source/dependencies/media, private writable artifacts and512MiB shared memory. Ports4551/4552 are private to this validation. Lock wait is not a performance measurement.

Focused Node command:

```sh
node --test scripts/parity/easel-command-motion.test.mjs scripts/parity/tool-tab-motion.test.mjs scripts/parity/rollovers.test.mjs scripts/parity/ui-audio.test.mjs
```

Private build command:

```sh
node node_modules/vite/bin/vite.js build --mode cloudflare --configLoader runner --config artifacts/t3/easel-command-motion/vite.config.mjs
```

The private Vite config imports root configuration, overriding only cache/output paths to this artifact directory. The private Playwright config serves development4551 or imports `createBrowserBuildServer` from `scripts/serve-browser-build.mjs` on4552 using existing media. `matrix.sh` records exact Docker flags and lane commands. New command tests are also included in repository built/WebKit test lists; module tests remain excluded by the built config.

Validation results:

- Focused Node checks:29 passed, zero skipped. Asset verifier:4,343 library items /9,751 referenced files passed. Private Cloudflare build passed.
- Read-only raw source recheck:20/20 command frames exactly match independent audit pins. Existing library40 + tool-tab80 raw frame pins retain exact matches.
- Existing library/tab ownership, lifecycle, held fallback/readiness, source composition and audio regression subset:100/100 Chromium development and100/100 WebKit development.
- Final command matrix:31/31 Chromium development,28/28 Chromium built,31/31 WebKit development,28/28 WebKit built. Development includes three pending-decode module cancellation/disposal cases; built lanes exercise app entry points and exclude module fixtures. Successful stereo download during Save modal leaves the modal open and the Export actor retired.
- Static-binding control:both live tracking delta tests fail at the intended visible-change assertion; source binding passes.
- Initial test harness failures:private webServer working directory was missing; dialog Save Picture locator was ambiguous; decode-retry test inspected the hidden base while its auxiliary was visible; WebKit normalizes download spaces to underscores. Corrected the harness/assertions and retained initial logs. No baseline changes or command-handler fixes were used to resolve these.

Final command browser counts and limitations are recorded in the integration handoff alongside the logs. No baseline acceptance, full release suites, version bump, install/download, push, deployment or original software execution occurred. Native reference acceptance remains0/17. Actual iPad/Pencil latency, foreground-idle behavior and audible feel remain unverified. Enlarged vacuum stays disabled; Clipboard80a0661, parent SERVER_HANDOFF, original media/history and other worktrees are outside scope. Parent review and full release/publication gates remain required.

## Required-slot validation correction

Review of the integrated mode-0 extension found that filtering all falsy state slots also admitted missing required rest/tracking programs, including existing mode-1 library records. Four actual-app malformed-record cases fail on that implementation. A follow-up truncated Save record separately reproduces a missing tracking slot when slicing a shortened array. The corrected validator explicitly requires both mode-0 slot indices, preserves the former complete mode-1 state validation, and permits only mode-0's intentionally unused selected slots. Five actual-app cases require rejected actors, visible usable static controls, the canonical Save/library action and no page errors. Red/green logs are retained under `artifacts/t3/release-0200/`.

All 29 required public response bodies were fetched and match their pinned hashes; no media upload is required. The final independent review and full release/publication gates remain pending.

## Semantic command availability correction

Independent review of `2aa1204` reproduced ready Save swallowing semantic clicks while Backgrounds or Export owned pointer/Space. Before-feature and pending-artwork controls accepted the same command; four actual-app ready cases fail on the candidate. The momentary adapter now permits detail-zero command activation without treating it as a competing physical contact. Only the activated actor's keyboard proposal is consumed. The canonical handler remains responsible for cancellation: Save opens its existing modal and cancels old source contacts, while a non-modal Export status leaves another held gesture intact.

An interim local-cancel approach passed Save but introduced a second readiness-dependent difference: semantic Export cancelled an older held Save only when Export artwork was ready. Two additional controls fail on that interim approach; it was replaced before commit or publication. The final regression file covers eighteen actual-app cases: ready/pending Save across two held controls and pointer/Space, ready/pending Export while Save is held, Export while Backgrounds is held, and real competing touch rejection with fresh activation recovery. Original and interim red results are retained separately under `artifacts/t3/release-0200/`. This correction changes no source programs, frames, media or command handlers. Final focused checks, a fresh independent recheck and full release gates remain required.
