# Ubuntu project handoff

The project was moved from the laptop at the user's request on 2026-11-09.
Development resumed at the user's request on 2026-11-09. The user subsequently
authorized autonomous implementation, version bumps, commits, pushes and regular
deployments of substantial verified milestones. The migration pause and earlier
no-push/no-deploy instructions below are historical; preserve existing work and
upload required media before publishing code that references it.
The working checkout is `/home/zsrobinson/code/kidpix` on fleet host `home`
(Linux hostname `ubuntu-server`, SSH alias `t3-home`). The existing T3 service
on this server is the place to continue; it does not depend on the laptop.

## Preserved migration snapshot

- Public site: https://kidpix.zsrobinson.com, version **0.5.0**, published source
  `8caa5334f6a4bc33e25b926c01709ae8245d79c5`.
- Local `main` also has **unpublished** commit
  `cd56b3e41268a17cb2f32c958a47e298fb230876`, restoring primary tool motion
  and portable handoff tooling. Do not push `main` casually: Cloudflare Builds
  deploys pushes automatically.
- Uncommitted changes finish Grab Hand/Scissors and expand static capture recipes
  to all eight tabs. Preserve them; they are intentional, not disposable work.
- Package version remains0.5.0. The next animation release has NOT been built,
  published or assigned a final version.
- All16 main tool actors are implemented: Drawing4, Painting3, Bucket3,
  Mixer2, Eraser2, Grab2. Their48 source programs retain453 authored poses.
  Short secondary selector/action animations remain documented follow-up work.

## Data and provenance

`public/original/` contains the complete imported media, source animation PNG/raw
pairs, opaque gzip `.bin` bundles, WAVs, clean backdrops and manifests.
`KPD3DMac.dmg` and `artifacts/research/` retain the original source inputs and
binary/disassembly evidence. `artifacts/t3/` retains extraction, test and staging
records; `parity/` retains comparison material. Paths in old research notes that
start `/Users/zsrobinson/code/kidpix/` refer to this checkout's corresponding
relative path. Diagnostic scripts may need their old absolute root updated.

No private keys, provider logins, protected fleet profiles, `.env` files or T3
server databases were copied. Dependencies/caches/build outputs are regenerated
on Ubuntu. Original Mac application execution remains unavailable: **0/17 native
reference captures**. Source-rule/browser checks do not establish native timing,
audio latency or full original-app visual parity.

## Checks already completed

- Latest local source:151 Node checks passed;61 Python checks ran,59 passed and
  2 skipped. Mac-only extraction dependencies are optional for normal web work.
- Focused final tool browser run:70/70 passed, including both Grab actors,
  all previous independent source-pixel cases and the original integration suite.
- Committed14-actor checkpoint: clean asset-free checkout `npm run check` passed
  (149 Node cases passed,1 asset-dependent skip, build and deploy dry run).
- Parent isolated built capture checks passed for Bucket/Mixer/Eraser/Stamp/Text.
- Full final dev suite was **interrupted at the user's stop request**. Its log is
  `artifacts/t3/final-tool-dev.log`. Do not describe it as a completed release gate.
- New resting-state captures and source-pose checks exist, but final full dev,
  built and public release verification and baseline acceptance remain pending.

## Media/publication state

Five primary groups'852 media objects were staged and verified on the public
Worker; evidence is `artifacts/t3/tool-motion-media-plan/staging-verified.json`.
Grab adds69 payloads plus the updated647,580-byte index. This **delta was not
uploaded** before work stopped. Current planning files are under
`artifacts/t3/tool-motion-media-plan/`; the original Grab delta/provenance is
`artifacts/t3/grab-tool-motion/delta-media.json`.
Upload payloads before the JSON index when a future release is authorized.
Do not copy the laptop's Cloudflare credentials; configure host-local access if
needed. Public code remains0.5.0 and does not request the pending new tool index.

## Local commands

Use Node24 (see `.node-version`).

```sh
npm ci
npx playwright install chromium
npm test
npm run verify:assets
npm run dev -- --host 127.0.0.1
```

T3 can run the dev command as a project script and expose the port through its
preview. The service and its authentication already belong to this host.
Local checks/builds need no Cloudflare login.

When development is resumed, read `docs/audits/tool-tray-motion.md`,
`docs/audits/tool-motion-coverage.md`, `docs/handoff.md` and `docs/parity.md`.
Finish final dev/built checks, inspect all17 static recipes, accept only intentional
web baselines, update release/version docs, commit, and publish only after the
full release gates pass. Mac web baselines are environment-specific: Ubuntu
baseline differences must be reviewed, never converted into native references.

Saved project actions should include Dev, Node checks, Asset verification,
Dev browser checks and Built browser checks. Keep setup and future runs on this
server so the laptop can remain shut.

## Ubuntu migration verification

The full5.17GB checkout/data copy is present. The tracked working diff matches
the laptop exactly (SHA-256 `3f4be85cb36a853f9dd729cb8b37fbd54a2e139229f7d2dba354cb094a92ddf0`),
and the same unpublished HEAD is retained. Server GitHub SSH access was tested.
The project is registered in the existing T3 instance as
`250eecb6-0573-4108-9c1e-affac96bee19` (Kid Pix). T3's authenticated CLI responds,
T3 Connect is enabled and the user service has lingering enabled.

On Ubuntu, `npm ci`, matching Chromium download, all151 Node tests,
`npm run verify:assets` (9,382 references), and `npm run check` (including the
Linux build and deployment dry run) passed. No deployment occurred.

Chromium's 46 missing Ubuntu dependency packages were installed on 2026-11-09
using this host's private sudo entry. The targeted opaque-gzip cold-load browser
smoke passed (1/1); its outputs are separate from the copied Mac records under
`artifacts/t3/runtime-readiness/ubuntu-smoke-20261109`. No password was stored in
this project. For a future fresh host, the corresponding setup commands are:

```sh
cd /home/zsrobinson/code/kidpix
npx playwright install-deps chromium
npx playwright test tests/browser/tool-motion-integration.spec.js --grep 'opaque gzip cold load' --reporter=list --output /tmp/kidpix-browser-smoke
```

The dependency command may request this host's sudo password. This is an
operating-system setup issue, not evidence of a tool-animation defect.
Keep smoke outputs separate from `artifacts/browser/` to preserve the copied
Mac investigation records. Old diagnostic virtual environments inside artifacts
are Mac-specific; use fresh Ubuntu environments when needed.

## Resumed Ubuntu work — 2026-11-09

The0.6.0 milestone is ready to publish:157 Node checks,206 dev browser cases,
195 built browser cases, asset verification and deployment dry run passed.
All17 Ubuntu static captures were visually reviewed and accepted as web-only
baselines; prior macOS baselines are archived under the release evidence.
The resulting report has zero web regression/comparison errors and0/17 native
comparisons.437 new media payloads and both updated manifests were uploaded and
verified before the code push. Release evidence is `artifacts/t3/release-060/`.

- Host-specific Proton Pass enrollment is complete. The official Pass CLI2.7.0
  was installed with its published SHA-256 verified; the host token and references
  are under the protected `~/.config/fleet/proton/` directory.
- Actual `fleet exec --profile cloudflare -- ./node_modules/.bin/wrangler whoami`
  succeeded against the configured Kid Pix account with masked credentials.
  Use this wrapper for authenticated Cloudflare commands; no laptop credentials
  were copied. The consumed private token-delivery file was removed.
- Portable secondary-control source export lives in `scripts/secondary-motion/`.
  Its distinct ignored media subtree contains59 controls,179 programs,235 poses,
  143 sprites,22 sound resources and60 clean pages. All12 exporter checks pass.
  Source recovery uses the supplied DMG on Linux; native execution is still absent.
- Asset verification includes the secondary export and passes9,751 references.
  Current Node checks pass156/156. Runtime integration and browser acceptance
  remain in progress; these export counts are not claims of enabled UI coverage.
- The vendor's Windows installer is being downloaded directly into
  `artifacts/source-installers/windows/`; inspect its metadata and hash after
  completion before treating it as a matching original runtime.

## Original Windows runtime investigation

The vendor Windows trial2.2.1.271 was downloaded and statically extracted on this
host. All bitmaps/sounds and877/878 Tp resources match the Mac source; program
18263 differs by one cue. Details are retained in `artifacts/t3/windows-original/`.

A filesystem/network-isolated Wine9 attempt installed real Microsoft CLR4 and
Apple QuickTime7.7.9. QuickTime initialization now succeeds. The unmodified app
then rejects Wine's elevated Windows token. Genuine restricted-token creation
removed privileges but retained Full elevation/high integrity in the child;
no working original drawing UI, About or audio was reached. Accepted native
references remain0/17. Preserve that distinction from successful web tests.

Runtime processes stopped. The retained prefix is outside the checkout, inside
private `/var/tmp/kidpix-native-runtime/`; no Wine drive mapping remains in the
repo. Vite explicitly ignores research artifacts and never follows symlinks.
The consumed private sudo delivery file has been removed. Proton enrollment
remains host-local and supports authenticated Cloudflare commands without sudo.

## 0.7.0 release and pending tablet integration

0.6.0 was published from `7717f68ffae02f26884cb3f17f886a9f4dd648e8`.
Its public checks passed194 behavior cases plus the exhaustive transport case in
an isolated rerun. The0.7.0 source completes19 Text/Grab/Stamp secondary rows with
59 programs and81 poses, for42 enabled secondary rows overall. Shared controller
fixes preserve authoritative state, release identity and backward text selections.
Grab restoration retains unbound navigation artwork; extra Path actions stay in
the Paint Zone menu. Stamp restoration is independently pinned.

Final0.7 gates pass188 Node checks,237 dev browser cases,226 built cases,
13 exporter checks,9,751 asset references, build and deployment dry run. Source-only
checks pass182 cases with6 asset-dependent skips. All17 Ubuntu web captures were
reviewed and accepted; zero comparison/regression errors, native0/17. Only the
secondary manifest and clean Stamp PNG changed in media; both were uploaded and
verified before publication. Evidence and receipts: `artifacts/t3/release-070/`.
Published0.7.0 source is `799cbd8e31e96d89b7419042d98b27e3e386ab70`.
Cloudflare/GitHub checks succeeded and all226 public browser cases passed.
The public release is independently verified at version.json.

The user requested iPad/Apple Pencil support and accepted modern Safari as the
baseline. Isolated, unpushed branches hold the upcoming input work:

- Ownership/lifecycle: `f8958a9`, parent review fixes `23a4a79`, and shipped-entry
  test separation `a29b74d`. Preserve root actionState getters and scene.destroy
  during integration. The review fixes release non-gesture contacts and block
  identity-free browser dblclick from rejected touch.27 focused/editor checks,
  64 existing browser checks and157 Node checks pass on the0.6 base.
- Pressure: `f792cb3`, neutral mouse/touch path preservation `e1ca2f7`, and studio
  pen/undo coverage `ad850a5`. Includes procedural Pencil and native Chalk/Crayon;
  Marker/shapes/timed tools retain their semantics.3 new Node tests,18 focused
  browser cases,16 exact baseline comparisons and1 actual-studio pen case pass.
- Both branches start at0.6. Parent must combine them with0.7 and rerun action,
  Stamp, input/history, pressure, dev/built/live release checks before publication.
  Branch checkout paths and full evidence remain in ignored tablet artifacts.

The initial native WebKit launch was blocked by missing host libraries and its
private setup card was cancelled. A later actual local Docker connection test
succeeded; the pinned official Playwright1.65.0 image now runs WebKit27.2 without
changing host OS packages. All41 WebKit input/editor cases pass, with1 explicit
Chromium-only delivery skip. See playwright.webkit.config.js and tablet-input.md.
Actual iPad hardware delivery, OS palm rejection, latency and subjective feel are
still unverified. Original-runtime references remain0/17.

## Integrated0.8 candidate — current local state

Local main includes the two tablet branches through `ffcd5d8`, atop published
0.7. Root resolved scene's actionState/destroy conflict and the two paint imports
by retaining both intents; no history was rewritten. The package is0.8.0 and
current uncommitted changes finish later polygon/curve contact ownership, foreign
preview-move rejection and shared recorded-path cleanup for blur/up/Escape.
All prior review objections are covered by tracked red/green regressions.

Final focused integration passed99 cases. Additional Chromium DPR2 cases passed
4/4: rendered pen/finger pixels in landscape, portrait and split-sized viewports,
and resize interruption/recontact. Root check passes191 Node cases/build/dry run;
assets remain9,751 references with no new media delta. Final full dev277 and built
236 browser suites passed with zero web drift; use `artifacts/t3/release-080/` and final logs,
not interrupted earlier attempts. The0.8 candidate is ready for its main push and public verification; preserve
the unchanged0.7 accepted web baselines.

An isolated Text-stepper implementation completed at965f8b5, following the source
audit `artifacts/t3/text-controls-next/README.md`. It owns no root source/media and
starts atffcd5d8, excluding current uncommitted tablet cleanup. Its future merge
must retain all0.8 paint/path changes, package version, range helpers and tests.
The planned scope is four font/size arrows with existing browser fonts; no font
media publication, voice or native popup expansion is authorized by that task.

Native host WebKit libraries remain uninstalled; the verified Docker route is
available and documented. Actual iPad testing remains pending. Do not request
another host password in response to automatic completion notices. Native references
remain0/17 and full original-runtime feel remains unverified.
