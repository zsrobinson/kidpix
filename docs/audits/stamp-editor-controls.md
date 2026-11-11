# Stamp Editor mode-0 contacts and owned cues

Base: accepted live 0.25, `2bfaf5bffafecfd8a8f66e9e04655d8cc20c4b7b`.

## Source facts

Read the bounded source audit and its supporting evidence in
`/home/zsrobinson/.t3/worktrees/kidpix/t3-b536879e/artifacts/t3/stamp-editor-motion-next/`.
`source-evidence.json` SHA-256 is `7e73b2cdec98a84e66ee49ef74c6fee02f5804d74d0eb6917fab06a4adfa7f9b`;
`dispatch-evidence.json` SHA-256 is `109083a3a90f939761827078dcee1eb69c7c942975621c4c5ac292c8415a688d`.
Mac and Windows StampEd.MHK are identical: `d3be6fc4f07ca6bfb02c6af85b8c16c7f07f197807c804338a67750599658427`.

There are nine MBTN rows, mode 0 with slots 0/1 only, and 32 completely decoded
source programs. Each has exactly one image group, interval 66 ms, no intermediate
wait or hidden pose sequence. Rollover is finite and silent. Completion alone does
not establish a visible rest flash; this change preserves the existing static
composite, native rectangles, responsive geometry and PNGs, with no timer or RAF.
Tracking cues occur at tick 0, channel 1: 14002 Pencil/Fill/Undo/Erase, 14005 Flip,
14003 Rotate, 14004 Restore, 14000 Cancel, 14001 Save. Caller operation sounds,
progressive erase, mode 2, selected/disabled art and native runtime parity remain
outside this change.

## Changes and APIs

- `src/stamp-editor-control.js`: `bindStampControl(control, {owner, signal, activate,
  render, start, stop})` binds modal-local contact, capture, keyboard and hover
  lifecycle. `trackingCue()` exposes `play(audio)` / `stop()` for one owned stream,
  using existing `playUiAudio` and `observeUiAudio`.
- `src/native-stamp-editor.js`: buttons and palette use this seam; blank chrome
  shares the first-contact owner. Tracking audio belongs to each button and is
  independent of auxiliary leave/reentry and canvas completion. Closed/closing
  dialogs cannot reenter commands. Modal context menus are suppressed so WebKit
  cannot steal primary capture during a secondary-button chord. Canvas capture failure retires its claim before
  creating history. Existing explicit Pencil cancel rollback and capture-loss /
  inactivity retention of delivered pixels and checkpoint remain intact.
- `src/interaction-owner.js`: additive optional `reject(event, {down, clickOnly})`.
  Existing callers retain their defaults. Released controls use
  `{down:false, clickOnly:true}` so a physical click remains quarantined through
  dialog removal without suppressing subsequent hover or fresh pointer-ID reuse.
  This small shared seam is necessary because modal-local listeners disappear on
  close while late clicks can target the studio. No caller in `main.js` changes.
- `docs/audits/stamp-editor-controls.md`: this handoff and validation receipt.
- `tests/browser/stamp-editor.spec.js`: actual shipped library/editor fixture
  regressions, native asset and page-error checks, real keyboard/touch and Chromium
  pen delivery, audio lifecycle instrumentation, interruption and close/reopen.
- `tests/browser/ipad-input.spec.js`: synthetic fixture explicitly marks its first
  pointers primary; PointerEvent's default false otherwise tests nonprimary input.
  Assertions and populations remain intact.
- `scripts/parity/stamp-editor-control.test.mjs`: owned audio replacement,
  rejection/throw/error/pause, stream independence, capture failure, exact owner
  matching, keyboard cancellation, released-click quarantine, secondary button
  release and listener disposal.

## Browser adaptation policy

The first accepted primary contact owns the document across modal buttons, canvas,
palette and chrome. Later pen/touch contacts cannot take over. Physical buttons
activate exactly once on matching primary release inside; release outside cancels,
and leave/reentry during the same contact does not restart its cue. Explicit
cancel, matching capture loss, blur, pagehide, hidden, resize, close and abort
retire control capture/tracking/audio. Foreign terminal events do nothing.

While any contact is held, semantic commands (assistive click, Escape/Return,
Ctrl/Cmd+Z, and another control's keyboard down) are consumed without mutation or
retiring that owner. Commands are not queued. When idle, Escape cancels, Return
from canvas/chrome saves, and focused buttons use their own Space/Enter activation.
Space/Enter track an exact key and control until matching keyup, including modifier
changes. Blur/inactivity cancels that key; stale keyup cannot reactivate it.
Key events stay inside the dialog. Idle assistive clicks activate once. Repeated
keydown and modified keyboard starts do not create another activation. Pencil/Fill
`aria-pressed` and empty-history Undo `aria-disabled` remain semantic web policies.

Each accepted button tracking stream owns its audio handle until terminal event,
play rejection, replacement, release, cancellation or teardown. Silent auxiliary
leave/reentry neither pauses nor restarts that base stream. Audio completion
removes observers without changing the visible pose or losing contact ownership.
No new continuous Pencil audio or operation audio is introduced.

## Validation and retained failures

Owned logs, configs, runner and results: `artifacts/t3/stamp-editor-controls/`.
Initial baseline Node suite: 313/313 (`node-baseline.log`). Initial actual-modal
baseline controls: all three failed (`red.log`, screenshots/traces retained):
second-contact takeover (plus uncaught synthetic canvas capture failure), stale
physical/Space activation after blur, and held-canvas semantic Undo/Save/Cancel.
The same three passed after implementation (`green-1.log`, 6/6 including existing
static/operation cases).

Retained expanded failure: `expanded.log` had 16 pass / 1 fail because the first
released-click tombstone blocked hover leave. The additive click-only disposition
fixes it; no assertion changed. `chromium-dev.log` retained one existing iPad
fixture failure caused by its implicit nonprimary synthetic pointers; setting the
fixture's primary flag preserves the intended scenario. `right-release-red.log`
retains the failing helper regression before adding primary-button terminal
matching. The first network-gated abort/decode test timed out because a previously loaded
image need not make another network request (`chromium-dev-complete.log` and
`webkit-dev-complete.log`). A one-shot gate around the real image decode promise
now tests abort, reopening before old completion, and subsequent old completion;
`abort-chromium.log` and `abort-webkit.log` pass. No assertions or timeouts changed.
WebKit's physical secondary-button chord exposed context-menu capture theft
(`chord-webkit.log`, event sequence retained; also initial `webkit-built.log`).
A modal-only contextmenu preventDefault preserves capture; the unchanged case
passes in `chord-webkit-fixed.log`. Genuine capture loss still retires tracking.

No installation, download, original runtime, system socket, service,
shared port or baseline/profile/media/version modification was used.

Commands (from this worktree; wrapper pins rootless Docker and host flock):

```sh
npm test
npm run verify:assets
node --check src/native-stamp-editor.js
node --check src/stamp-editor-control.js
git diff --check
RUN=red bash artifacts/t3/stamp-editor-controls/container.sh node artifacts/t3/stamp-editor-controls/run.mjs --grep 'control contact|interrupted control|held canvas'
RUN=chromium-dev-complete bash artifacts/t3/stamp-editor-controls/container.sh node artifacts/t3/stamp-editor-controls/run.mjs
RUN=chromium-built BUILT=1 bash artifacts/t3/stamp-editor-controls/container.sh node artifacts/t3/stamp-editor-controls/run.mjs
RUN=webkit-dev-complete ENGINE=webkit bash artifacts/t3/stamp-editor-controls/container.sh node artifacts/t3/stamp-editor-controls/run.mjs
RUN=webkit-built ENGINE=webkit BUILT=1 bash artifacts/t3/stamp-editor-controls/container.sh node artifacts/t3/stamp-editor-controls/run.mjs
```

Every browser lifetime holds host `/var/tmp/kidpix-ui-validation.lock`. The wrapper
uses only `DOCKER_HOST=unix:///run/user/1000/docker.sock`, rootless receipt verified,
image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`,
`--pull never --cap-drop ALL --init --user 0:0 --shm-size 512m`, default container
network with Vite and Playwright together on private loopback 4771. Source and
absolute dependency/media symlink targets mount read-only. Only this task's
artifact directory is writable; Vite cache, build and browser output live there.
Inherited viewport, scale, locale, timezone, color scheme, serial workers and
30 s Chromium / 60 s WebKit timeouts remain unchanged. WebKit retains established
CDP-only exclusions; built cases retain the established `@module` exclusion.
Touch is enabled locally for tap tests and in the inherited WebKit profile.

Final receipts:

- Node: 323/323 (baseline 313 plus ten helper cases), `node-final-323.log`.
- Asset/private build: verified 4,343 items / 9,751 referenced files; private
  Cloudflare-mode builds passed inside the contained built runners.
- Syntax for both edited/new editor modules and `git diff --check`: passed.
- Runtime receipt: Node 26.13.0, Chromium 158.0.8127.18, WebKit 27.2; container
  UID 0 maps to unprivileged host UID 1000. `runtime-receipt.json`,
  `rootless-receipt.json`, `image-receipt.json` retain the evidence.
- All 36 media-key hashes match before/after (`media-hashes-after.json`).

Final modal receipts (84/84 total, no failures/skips):

- `final-chromium-dev.log`: 22/22.
- `final-chromium-built.log`: 21/21.
- `final-webkit-dev.log`: 21/21.
- `final-webkit-built.log`: 20/20.

Run these with the wrapper command above, setting `RUN=final-ENGINE-PHASE`,
`ENGINE=webkit` for WebKit and `BUILT=1` for built, and passing
`stamp-editor.spec.js` as the final argument.

The final native-editor population is rerun on both dev and built entrypoints.
Existing adjacent iPad cases passed in the larger scoped runs: Chromium dev 28,
Chromium built 9, WebKit dev 26, WebKit built 7. Their module/CDP exclusions are
inherited. The final reruns target the modal after the modal-only context-menu
fix; no release-wide suite is claimed.

## Remaining parent gates

Parent review, source checker receipt, full static/public release gates and wider
release suites remain separate. Native comparison remains 0/17; physical Pencil
feel, audible behavior and IME are unverified. Enlarged vacuum stays disabled and
Pencil preview stays OFF. No push, deployment, version change or media upload.
Root dirty handoff files, deferred clipboard work, original assets/history and
other worktrees are untouched. Temporary worktree-only dependency/media symlinks
are removed after validation; only owned container lifetimes are stopped.

## Existing media keys and SHA-256

The 36 keys below include the existing manifest, frame/palette, all 27 button
poses and six tracking WAVs. No bytes were modified.

```text
860ce7dad0a14a4ac5a43af7c1050a55babf0d7e99e2b33856069b70aba4f327  stamp-editor/cancel-rest.png
17a507ddc05aa8e71581b64327576d8245992dea7166eda6b75f05a0250b0962  stamp-editor/cancel-rollover.png
237cc00da84f2241aeb76a9b1c45cf5640f62b11ca590ba6469d94c15d8e57f7  stamp-editor/cancel-tracking.png
5c24a04173ae834b0b278cc923e76fa784f46bb2137669a5898165b3932c0dc8  stamp-editor/erase-rest.png
df0fdb836259b86301d9ecd931ff3d2f374dba83bba1fad3e4c28c88d00154fb  stamp-editor/erase-rollover.png
3be9d61c7f9d8f7eecbe983ccf13ed24a00057e18ea6da25fa02efa308108338  stamp-editor/erase-tracking.png
3db48a6e984b5a94f10da24ef0a15fde02dfb56106139265f55b7013f7444c12  stamp-editor/fill-rest.png
aac97aea6c3a8a528dc20a582d5c6c07612d7ecae077e00353458981c543ff66  stamp-editor/fill-rollover.png
cbb910102b0ee07465d6135c6acde859e6caea9df15a41db63f080c34e5bdc1a  stamp-editor/fill-tracking.png
8b103b7f85ad872b2d53210891468645151301ce5829c356140bb0ae56a7a93e  stamp-editor/flip-rest.png
4c0c4d19ee9ef4f85f03242167a178b2445d534d6619cb04587b198df359aa77  stamp-editor/flip-rollover.png
48978fbaa63c7a08a3c319d5556eee11a39ffe6ea05fca52bcd221b3f3bd1ef7  stamp-editor/flip-tracking.png
5b4ec7ca7bf29314547e01fb9104452523083800537b1c44cbbcf27a73fcf9ea  stamp-editor/frame.png
dcd818f09f21a629cdefa139befee625b6d0b38e57b355fe03903c9cde992285  stamp-editor/manifest.json
df7e2a852301713e0cf3221e6a91a1bffcc8e7e704f34c399c461800686adde5  stamp-editor/palette.png
3987a56bc42101ff3c959513ddf256e546be73d5be9f5b04d1f580669e1344b4  stamp-editor/pencil-rest.png
aeef3c935f6a2d75bf82fccaa0829a456cb463c326f8f32d3adcadd2f12e435b  stamp-editor/pencil-rollover.png
d9d6486ff84d0799786f9586879d3ea6d51959e6c66bd485ef01b78c542b1f9c  stamp-editor/pencil-tracking.png
cd8754746c8d07b92c89b5ba9716aa38cb93577aa05656bd36d49fe8b6795acf  stamp-editor/restore-rest.png
58f0596ee57ceb37c13a3b795714d65ebce3d6a76ed5e144e6619615d7e02884  stamp-editor/restore-rollover.png
2681acbab07b65eb1de15e5767f407c2fc620cdb6f05fc52f0781a0db2fd4991  stamp-editor/restore-tracking.png
eff2790eccc69e79ee3f7994c48b5d339a60441f391ddd9103640ca74bc37044  stamp-editor/rotate-rest.png
5ea1aabddf4868ba700ef50b09ad3ccc0a5a301821d92bf4e7a0e4be184e4340  stamp-editor/rotate-rollover.png
f36ca2d323c3ede606eb766851d001e95152f552d57d96e8ee2148b3caf94a0f  stamp-editor/rotate-tracking.png
0860c69c8e2285da6d966a4051e0a1be1f3fd5b6559c2844e21d0e8fd02e368e  stamp-editor/save-rest.png
90789edd606fd7439ed4570caa7bb6b71a3f3d438c77114c1674e825e3d0945a  stamp-editor/save-rollover.png
89e3aacd88d30e2bf79f4f2cd6bc41c7e965e5c9e523c55de7cf977d14d8e984  stamp-editor/save-tracking.png
396b6cfdf19fe3b134e69fe685fa78d806cabd21991d8de47f3579721ab4fd57  stamp-editor/sound-14000.wav
f62688dcf80aaab1fbe9c5b74c5a2bb8d7a1d027f2cfa862d44e2850fe77ca1c  stamp-editor/sound-14001.wav
f99f9a4f432f274bccfab3c2ce16f92c6b8934773068034e84a12a3c7398d696  stamp-editor/sound-14002.wav
65dc03ad39ab9f429995b2fee49d6835f5f3900bae470043c8734e95cbb49485  stamp-editor/sound-14003.wav
566a39bf343ba584220ed0c2f7aca12e161bc9ac4a03ea53b7489491f793a97a  stamp-editor/sound-14004.wav
2fdbdc05debfa1d9c88830238c5a5f6d66706a3db51d77414c01a41e66b79171  stamp-editor/sound-14005.wav
908aa6fbf14ce4fce967844c09c6fa862a375a3e124a26a46761a454af51e072  stamp-editor/undo-rest.png
e9ea487293ea439a1167567f9fb100075a79153b642cb97456b31453d1789c53  stamp-editor/undo-rollover.png
fc7d2543efecaff06bf5b7514db1bb4fbf010597160ae7e325e2a5979b7b78ad  stamp-editor/undo-tracking.png
```
