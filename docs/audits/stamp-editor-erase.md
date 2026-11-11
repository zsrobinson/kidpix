# Stamp Editor NORMAL browser erase adaptation

Frozen base: `c1d50006105a0563e9f525f7f5772fb46201ff9c`. This is future work,
separate from the parent's 0.26 release. No version, main.js, profile, baseline,
original media, deployment, upload or release change.

## Source and approximation boundary

The original-source contracts are root ignored artifacts
`artifacts/t3/stamp-editor-erase-contract/{README.md,normal-case.json,evidence.json}`
and `artifacts/t3/stamp-editor-display-followup/{README.md,evidence.json,check_source.py}`.
The owned `source-pins.py` independently verifies their executable spans and six
original input hashes without rerunning checkers that write root evidence.
The equal/scaled display joins reach mode-zero CopyBits, with explicit white
backing. All 32 StampEd pose scripts still contain ONE GROUP. No new pose,
intermediate frame asset, or button animation sequence was invented.

Supported geometry is ONLY 32×32. The seven TOP,LEFT,BOTTOM,RIGHT rectangles are:

```text
17,15,19,17
15,13,21,19
13,11,23,21
11,9,25,23
9,7,27,25
7,5,29,27
5,3,31,29
```

Their center is x16,y18. The next rectangle `3,1,33,31` is invalid and completes
the operation. The first temporary mutation is synchronous; each delivered
nominal 66 ms timeout advances once, rearming from delivery. No elapsed-time
catch-up occurs. Seven intervals nominally total 462 ms, plus delivery latency.

The browser raster policy tests pixel centers `(x+.5,y+.5)` against the normalized
ellipse equation `dx²+dy² <= 1`, inside half-open rectangle bounds. Included pixels
are painted opaque white, without antialiasing. The temporary 32×32 canvas scales
with CSS `image-rendering: pixelated`, matching the existing browser editor policy.
This is an explicit approximation, NOT a native QuickDraw mask/resampling oracle.
The enlarged presentation and small preview have explicit opaque white backing.
Final transparent browser storage is a blank-stamp adaptation; it does not
reinterpret native `0xffffffff` as Canvas RGBA. Exact oval edges, resampling,
Intel high-byte writes and the four-component PixMap behavior remain unknown.
The ordinary product label remains Eraser, without technical warnings in the UI.

## Transaction and browser policies

`src/stamp-editor-erase.js` owns progression and cleanup, using injected scoped
prepare/render/commit/rollback and lifetime hooks. It exposes only cancellation
and an active getter. It neither exposes global mutable paint/history nor imports
the editor. `paintBrowserOval` is separately testable from source geometry.
`src/native-stamp-editor.js` keeps committed pixels, preview and history private.
It copies committed pixels to a separate temporary canvas and leaves both the
committed canvas and preview unchanged until the one completion clear. Completion
adds one checkpoint using the existing bounded Undo stack. Existing editor Undo
semantics remain; no new Redo behavior is invented.

Operation setup occurs only after the control seam releases its physical/key
contact. Ordinary drawing, tools, transforms, palette, repeat erase, history and
Save are rejected without queueing. Modal keystrokes are consumed. Rejected downs
are quarantined through their late compatibility clicks, even after completion.
Explicit Cancel closes safely; Escape cancels the effect and keeps the editor.
Blur, pagehide, hidden, resize, owner abort, close and disposal discard the temporary
presentation and preserve preoperation pixels, preview and history. No callback
can commit after cancellation or reopening. Native interruption/history policy
is unproved; these are explicit safe browser policies.

Allocation, preparation, rendering, callback scheduling and commit failures abort
the effect with rollback and unconditional cleanup. Audio construction/play,
rejection, pause, error and stop failure cannot gate progression or strand the
operation. Prepare performs no committed mutation. Commit failures restore the
saved pixel/preview/history snapshot; cleanup removes the temporary presentation.
Pencil explicit-cancel rollback versus capture-loss/inactivity retention, pending
decode invalidation, fallback editor and Save callback behavior are retained.

The operation uses its own `trackingCue()` handle and existing UI audio helpers.
Only original operation sound 14006 starts once at erase start and stops on normal
finish/cancel/teardown, independently of tracking sound 14002. It never loops or
waits for audio completion. No other caller sounds or continuous Pencil audio.
The exporter pins the original StampEd archive SHA-256 and fails closed for future
source changes. Runtime rejects unsupported geometry, missing operation metadata, or a mismatched archive hash.

## Media isolation and publication block

All export output is in this checkout's ignored
`artifacts/t3/stamp-editor-erase-runtime/media/ui/stamp-editor`. Original media was
read-only. `export.py`, `export.log`, `export-retry.log` and `media-receipt.json`
retain the exact export and comparison receipts. The first export comparison
failed on `save-rest.png`: Pillow encoding differed. Decoded RGBA comparison
passed on retry, and staging retained the original PNG bytes. All existing PNGs
and six tracking WAVs are byte-identical. Only the following keys change:

| Key | Bytes | SHA-256 |
| --- | ---: | --- |
| `ui/stamp-editor/manifest.json` | 19942 | `59ddf639accf10f968117c1b1a6d22c1363cc62e751b174e30b39f153c6d7a34` |
| `ui/stamp-editor/sound-14006.wav` | 59536 | `3cf76d5838f2008dbe7eb7b0336d71c7df989bee2a2cebd3e5ff923e690f22cf` |

Manifest legitimately gains `operations.erase` and `sounds[14006]`; removing those
two additions yields the exact old manifest structure. The WAV is one addition.
The private runner serves these two staged bodies at their actual `/original/`
URLs using owned middleware in dev and the built HTTP server. Every other media
request reaches existing original media. Browser tests require exact staged body
hashes, loaded audio and metadata, and no unexpected page/asset errors. There is
no fake-success fallback.

Publication remains BLOCKED until the parent reviews, uploads these two keys and
verifies the exact public body hashes in a later release. This child does no CDN,
credential, upload or deployment work.

## Validation commands and receipts

Owned evidence: `artifacts/t3/stamp-editor-erase-runtime` in this checkout.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 artifacts/t3/stamp-editor-erase-runtime/source-pins.py
PYTHONDONTWRITEBYTECODE=1 /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python artifacts/t3/stamp-editor-erase-runtime/export.py
node --test scripts/parity/stamp-editor-erase.test.mjs
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python -m unittest scripts/test_stamp_editor.py
npm test
npm run verify:assets
node node_modules/vite/bin/vite.js build --mode cloudflare --outDir artifacts/t3/stamp-editor-erase-runtime/build-host
node --check src/native-stamp-editor.js
node --check src/stamp-editor-erase.js
git diff --check
RUN=first bash artifacts/t3/stamp-editor-erase-runtime/container.sh node artifacts/t3/stamp-editor-erase-runtime/run.mjs stamp-editor.spec.js
bash artifacts/t3/stamp-editor-erase-runtime/matrix.sh
bash artifacts/t3/stamp-editor-erase-runtime/finish-matrix.sh
ENGINE=webkit RUN=http-webkit-dev bash artifacts/t3/stamp-editor-erase-runtime/container.sh node artifacts/t3/stamp-editor-erase-runtime/run.mjs
bash artifacts/t3/stamp-editor-erase-runtime/complete.sh
# These retained counterfactuals must fail:
node --test artifacts/t3/stamp-editor-erase-runtime/instant-clear.test.mjs
node --test artifacts/t3/stamp-editor-erase-runtime/catch-up.test.mjs
COUNTERFACTUAL=preview-sync RUN=preview-sync-red bash artifacts/t3/stamp-editor-erase-runtime/container.sh node artifacts/t3/stamp-editor-erase-runtime/run.mjs stamp-editor.spec.js --grep 'NORMAL browser erase temporary'
```

Initial/final Node logs, helper logs, source pins and build/assets logs are retained.
Initial full Node suite passed; after eleven added helper cases, 339/339 passed. The fail-closed exporter unit test also passed.
Asset verification: 4,343 items / 9,751 references. Owned Cloudflare-mode build
passed. Instant-clear and catch-up counterfactual modules each fail the unchanged
helper assertions (`instant-clear-red.log`, `catch-up-red.log`). Browser preview-sync
counterfactual results and final browser receipts are recorded below. Existing immediate-erase assertions now await operation completion;
final expectations, deadlines and tolerances are unchanged.

Every browser lifetime acquires host `/var/tmp/kidpix-ui-validation.lock` through
blocking flock. No polling/killing of the parent's release processes. Inherited
`DOCKER_HOST` must equal `unix:///run/user/1000/docker.sock`, otherwise the runner
stops. Pinned image:
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`,
`--pull never --init --cap-drop ALL --user 0:0 --shm-size 512m`. Source/dependencies
and absolute original-media targets are read-only; only the owned artifact tree
is writable. Vite and Playwright share the default-network container. Browser
profiles/settings, serial workers, timeouts and module/CDP exclusions are inherited;
no full release suite, downloads, installations or original runtime execution.

## Browser receipts

- Initial focused Chromium dev editor population: 45/45 passed (`first.log`).
- Final Chromium dev editor plus adjacent input population: 73/73 passed (`final-chromium-dev.log`).
- Final Chromium built editor plus adjacent input population: 52/52 passed (`final-chromium-built.log`).
- Changed media assertions rerun on Chromium dev/built: 3/3 each (`media-chromium-dev.log`, `media-chromium-built.log`).
- Corrected WebKit dev: 69/69 passed (`http-webkit-dev.log`).
- Corrected WebKit built: 49/49 passed (`http-webkit-built.log`).
- Final exact-HTTP assertions on Chromium dev/built: 3/3 each (`http-chromium-dev.log`, `http-chromium-built.log`).
- Preview-sync browser counterfactual: all three fixtures fail specifically at the frozen-preview assertion (`preview-sync-red.log`, traces/screenshots retained).

The four full scoped populations total 243 passing cases. Their module/CDP
exclusions are inherited, with no failures or skipped tests inside the selected
populations. Initial/focused reruns are additional receipts, not release-wide
coverage. Chromium is 158.0.8127.18; WebKit is 27.2.

Runtime receipts confirm Node 26.13.0 and container UID 0 mapped to host UID 1000.
Chromium has no failures. Two retained WebKit dev attempts (`final-webkit-dev.log`
and `verified-webkit-dev.log`) each passed 66 cases and failed three new media
assertions. The trace shows a status-0 provisional response followed by one HTTP
200 response containing the complete staged 59,536-byte WAV. Counting response
events was incorrect; filtering with Playwright `ok()` still admits status 0.
The assertion now counts explicit HTTP 200 responses and retains the original
exact count, body hash and timeout. Separate owned-audio tests require exactly
one play call. No product change, profile, deadline or tolerance adjustment.

## Remaining gates

Parent review, independent review, full/public release suites, actual uploaded
media verification and physical-device gates remain separate. Native acceptance
remains 0/17; enlarged vacuum disabled; Pencil preview OFF. Physical iPad latency,
foreground idle, audible output and IME remain unknown. Root dirty
SERVER_HANDOFF.md, untracked RESUME_AFTER_SIGNOUT.md, deferred clipboard 80a0661,
imported ancestor, originals, history and other worktrees are preserved.

Final media comparison (`media-after.json`) verifies all 38 staged entries remain
unchanged, all existing PNG/tracking-WAV bytes match root originals, and the
manifest has only the two intended additions. Owned temporary dependency/media
symlinks were removed after validation. Docker `--rm` lifetimes and private
servers ended normally. No owned persistent process remains.


## Ownership review correction

Independent review found that Cancel's broad key exception could expose the modal Undo shortcut during erase after a real mouse press/drag-out/release left Cancel focused. The committed image, preview and history then changed while the temporary presentation was active. Cancel now admits only unmodified activation keys during erase, and the direct Undo handler also checks that no erase operation is active. Escape and genuine Cancel activation retain their explicit cancellation policies.

A second conditional gap concerned operation-rejected touches after close: their numeric ID did not cover a remapped mouse or legacy MouseEvent click. The interaction owner now provides an opt-in quarantineClick rejection policy. It retains the contact while held, then moves its type and identity to the existing single released-click record at a terminal event or lifecycle interruption. Matching/remapped clicks consume that record; a fresh primary down retires a no-click sequence. Existing default rejection callers are unchanged. This fixes event-shape replays, not a demonstrated physical-device delivery sequence.

Before the correction, three actual-app regression assertions fail in WebKit and five new guard assertions fail in Node. Afterward all 12 focused browser cases pass across Chromium/WebKit dev/built, with 39 focused helper checks, and npm run check passes 348 Node checks, asset verification, build and Worker dry run. The committed Undo regression freezes only the erase callback queue for deterministic observation; the independent review also reproduced the original defect with real mouse/keyboard and unmodified timers in all four lanes. The remapped-click probes remain explicitly synthetic. Prior failures, source pins and unchanged staged media receipts are preserved under artifacts/t3/release-0270. A fresh correction review and the full/public/upload gates remain pending.


## Complete media receipts with native Range delivery

The first standard full development run passed 827 cases with one skip and three new composition-test failures. Their media receipt counted only HTTP 200. The actual native Audio request used Range: bytes=0-, and the unmodified development server correctly returned HTTP 206 with Content-Range: bytes 0-59535/59536 and the complete 59,536-byte payload. The staged media middleware had returned full HTTP 200, so the scoped runs did not exercise that delivery shape. Original logs, reports, screenshots and traces are retained under artifacts/t3/release-0270/initial-full.

The test now recognizes either HTTP 200 or that exact complete-file HTTP 206 range. Provisional status zero and partial ranges do not count. The exact single full-payload count, RIFF and SHA-256 checks remain; an explicit 59,536-byte length assertion is added. Every pixel, timing, preview and history assertion is unchanged. All twelve composition cases pass across Chromium/WebKit development/built using real Vite/build-server Range delivery without staged-response overrides. Application code and all media are unchanged by this correction. Full release gates are rerun separately.

## Parent release validation

The correction recheck found no remaining objections within correction/shared-default scope: 316 browser cases and 75 helper deliveries passed, including real-clock Undo containment in all four engine/entry lanes. Prior-candidate and algorithm controls fail as intended; physical compatibility-click delivery remains unverified.

The complete frozen rerun at 584b93bac2db528a153e4544204d19ab642fa869 passed 830 development cases with one skip, 743 built cases with one skip, and 595 WebKit cases with three skips. All 17 static captures are RGBA-identical to accepted 0.26. Parent checks passed 348 Node cases, asset verification, production build and Worker dry run; source-only validation passed 320 cases with 28 imported-asset skips. No baseline or tolerance was changed.

Only the operation WAV and its manifest additions were imported and published. All 37 required public media bodies match their hashes, with previous metadata and unchanged original-media receipts retained. Exact revision publication and selected public acceptance are the remaining release gates. Physical iPad, audible delivery and native execution remain unverified; native references stay 0/17.
