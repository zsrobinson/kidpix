# Text range clipboard slice

Based on published0.13 root `e90450293cb4ae6f5102af32f12a278e5d28661e`. Version remains0.13.0. Local implementation only; no public media, exporter, deployment, push or PR changes.

## Evidence and supported policy

Independent input: `/home/zsrobinson/code/kidpix/artifacts/t3/text-clipboard-next/{README.md,contracts.json,evidence.json,native-excerpts.txt}`. `tests/fixtures/text-clipboard-source.json` copies the three raw rows, nine complete programs (12 draw groups), registrations, cue hashes, nine sprite hashes/dimensions and exact kind1 bounds directly from that evidence. Expectations are not generated from production manifests. Node checks compare complete programs and recompute registered sprite bounds.

MBTN9383 rows12/13/14 dispatch240/241/242 to current-editor character Cut/Copy/Paste. These are mode0 momentary actions with no disabled artwork or selected latch. Tracking has two draws of the SAME sprite; tick1 at100ms carries one cue. The existing action interpreter retains timing, channel ownership and end gates. Regions are Cut409,647,41,86; Copy449,647,42,43; Paste449,690,42,43. Restoration ownership is a separate clipboard rectangle, disjoint from Read and live fields. At x449 the browser DOM orders Copy above Cut; the acceptance assertion is a browser ownership decision, not a native edge-priority claim.

Browser scope is a dedicated document-local, session-scoped plaintext clipboard. It survives box/tray changes, clears on New/Open/document replacement/disposal, and is absent from project snapshots. Whole-object menus, keyboard shortcuts outside the editor, Grab and Scissors retain their existing routes and clipboards. Native editor keyboard and copy/cut/paste defaults are untouched. No clipboard events are intercepted or synchronized, no `navigator.clipboard` APIs are invoked, and there is no OS interoperability or rich-style claim. Ordinary native clipboard data and the tray clipboard can therefore differ.

Capabilities are browser policy: Cut/Copy require a nonempty current editable range; Paste requires an editable current range/caret plus nonempty internal `text/plain` payload. No editor or stale target is a no-op; Paste never creates a box. Collapsed Cut/Copy leave payload and history untouched. Read's collapsed-to-whole-box fallback is never used. Application labels are Cut Text, Copy Text and Paste Text with ordinary success feedback.

## Product seams

- `src/text-clipboard.js`: `createTextClipboard({current,replace,epoch,publish})` exposes `target()`, `capabilities(token)`, `perform(action,token)`, `clear()` and `generation`. Production publication is synchronous in-memory assignment; injected publication can reject/throw in adapter tests. A Cut publishes successfully before invoking replacement. Empty clipboard never replaces. Tokens are frozen and carry document epoch, object ID, WeakMap editor generation, text revision, range revision, exact canonical plaintext and directional anchor/focus. Both live endpoints must belong to that editor, or a retained range must match the exact editor/text/revision/epoch. There is no guessed collapsed fallback.
- `src/editor-text.js` remains the shared BR/block/UTF16 mapping, unchanged. Nonempty extraction/replacement expands surrogate-splitting edges. A collapsed insertion splitting a pair moves after the complete pair. This is code-point safety, not grapheme-cluster or native layout equivalence.
- `src/scene.js`: `scene.textClipboard` supplies the adapter, and `scene.flushText()` settles pending typing. Cut/Paste validate twice, flush typing once, update model/DOM/caret synchronously, and emit one history entry with before/after text-object arrays and directional selection metadata. DOM/selection failure rolls text/DOM back without a mutation entry. Copy creates none. All-character Cut retains its box. The blur baseline is cleared after commit/rollback so blur cannot duplicate the transaction. Typing baselines are renewed on beforeinput/input; pending edits settle before add/style/menu/tray transitions.
- Scene `onChange(before,after,ranges)` adds optional transient selection metadata. `restore(state,{history:true,textSelection,textTarget})` restores the entry's object identity and range/caret while retaining session text clipboard; ordinary restore advances document epoch and clears it. Disposal also makes future clipboard capabilities unavailable.
- `src/main.js`: records/restores selection metadata, flushes typing before choosing an Undo/Redo entry, binds only `text-clipboard:{cut,copy,paste}`, keeps pointer focus, synchronizes real capabilities and feedback, and includes static controls in the existing guarded input path. Read continues to retire through existing payload/revision notifications and never restarts through history or rollback.
- `src/native-action-{state,motion}.js`: explicit text bindings for only rows12–14; source profile/restoration/capabilities plus per-action gesture identities. Text targets include range/text/editor/document revisions. Clipboard generation affects held Paste only; Bold, size, voice, Grab and text Copy/Cut do not acquire clipboard-generation coupling. Existing accepted-release/Space refresh validates before RAF; tray/target/history/lifecycle changes cancel through the existing manager. Same-tray source rerenders retain the existing owner/timeline; optional media failure uses semantic fallback and retry.

## Validation

**BROWSER ACCEPTANCE NOT RUN.** No browser, Playwright runner, WebKit, Wine, Windows/native capture, server or port was started. Parent's frozen public acceptance is untouched. No package installation/download, native clipboard request or media export occurred.

- `npm test`:219 passed, zero skipped/failed (`artifacts/t3/text-clipboard-runtime/node-final.log`). Includes20 new clipboard/source/history cases, with real scene transaction tests against a minimal independent DOM protocol; browser focus/default-edit behavior remains deferred. An initial full run found only the existing thirteen-control profile expectation, updated to the sixteen supported controls.
- `node node_modules/vite/bin/vite.js build --mode cloudflare --config vite.text-clipboard.config.js`:passed (`build-final.log`). Build/cache stay under child `artifacts/t3/text-clipboard-runtime`; no root/dist outputs.
- Browser spec/config syntax and `git diff --check`:passed. No Worker dry run was needed or performed.

Exact implementation/test/config files: `src/{text-clipboard,scene,main,native-action-motion,native-action-state}.js`, `scripts/parity/{text-clipboard,text-clipboard-history,action-motion}.test.mjs`, `tests/browser/text-clipboard.spec.js`, `tests/fixtures/text-clipboard-source.json`, `vite.text-clipboard.config.js`, `playwright.clipboard{,.build}.config.js`, this audit, and the secondary-motion audit link/count update.

Deferred specs cover source/visible pixel composition, full raw/program/sprite pins, both identical tracking draws and single cue, rest/hover/cancellation, fallback/retry, x449 single browser owner, directional/multinode/BR/Unicode selections, two boxes and separate object clipboard, empty-box Cut, collapsed/no-editor, replacement/caret insertion, typing/Cut/Paste selection history, held pointer/Space invalidation for range/text/target/tray/history/document/blur/cancel, session clearing, Read retirement and no OS calls. Source-helper cases are marked `@module`; built app cases have a separate config excluding them. The WebKit oracle uses the existing pinned-layer Canvas compositor pattern and the same one-channel-unit threshold; tolerance is not loosened. These authored cases are unexecuted and may require parent diagnosis.

## Parent commands and media

After frozen public acceptance finishes, provide existing dependencies and read-only public media in the child checkout, then:

```sh
npm test
node node_modules/vite/bin/vite.js build --mode cloudflare --config vite.text-clipboard.config.js
node node_modules/@playwright/test/cli.js test -c playwright.clipboard.config.js --project=chromium
node node_modules/@playwright/test/cli.js test -c playwright.clipboard.build.config.js --project=chromium
```

WebKit must use the existing pinned runtime (no installation here): `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`, with `CLIPBOARD_BASE_URL` pointing to the parent's explicitly started private dev/built server. Use `--project=webkit` and exclude `@module` against built output. Config ports4231/4232 are strict/private and have not been opened here. Parent should also run existing Text Read/voice/action and Firehose regression acceptance.

Required existing public keys under `original/ui/`:

- `secondary-motion/manifest.json`, `paint-empty.png`, `secondary-motion/backdrops/text-1.png`.
- `secondary-motion/sprites/18000-{502,503,504,505,506,507,601,602,603}.{png,argb}` (every listed combination).
- `secondary-motion/sounds/{18059,18060,18071}.wav`.

No media is added. Existing Read/font/voice/action dependencies remain necessary. Temporary dependency/public input symlinks were removed after checks. There are no servers to stop.

Native accepted coverage remains **0/17**. Actual iPad interaction, audible playback, native clipboard interoperability, rich styles, source enable-updater/focus behavior and native timing remain unverified. The clipboard is plaintext, preserves the object's single style, and imposes no reconstructed native per-character callback/length-cap policy. Windows resource identity is not a native runtime-equivalence claim. Parent owns browser acceptance and release decisions.

## Parent review fixes before browser acceptance

Static review reproduced a history integration defect: after wiping a picture,
copying newly typed text, undoing that creation and undoing the wipe, Paste lost
the copied payload. The clear-history branch now passes `history:true`, matching
ordinary scene history. The actual main history function was run against the
real scene adapter in a private Node probe: it failed before and passes after,
including Redo and ordinary document-replacement clearing. A matching actual-app
browser regression is added but remains unrun.

The injected synchronous focus/document-replacement probe also failed before
and passes after a scene/editor/epoch ownership guard. Selection restoration
checks after focusing before using the editor; a replaced document is neither
rolled back nor journaled as the retired operation. This addresses the reported
callback edge; no normal UI trigger had been established. The application
`onChange` history sink remains trusted synchronous code, with throwing or
reentrant mutation callbacks outside the supported contract.

Deferred browser assertions now require independent rest/hover/press program IDs,
tracking frame indices and preserved Read/font/size/voice pixels. Asset-failure
routes match versioned URLs, explicitly assert fallback and successful source
retry, and cue identity uses URL paths rather than failing on version queries.
No pixel tolerance changed. These assertions still require actual browser runs.

Parent final checks:220 Node tests passed with source assets present, private
production build and syntax/diff checks passed. No browser/server was started.
Evidence is under `artifacts/t3/text-clipboard-runtime/`: `wipe-before.log`,
`wipe-after-final.log`, `focus-before.log`, `node-parent-final.log` and
`build-parent-final.log`. Root public0.13 verification remains untouched.
