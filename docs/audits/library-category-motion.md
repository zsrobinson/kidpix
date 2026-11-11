# Shared non-Stamp category motion (prospective milestone)

Base: `584b93bac2db528a153e4544204d19ab642fa869`. Separate from the active full0.27 rerun. No version/profile/baseline change, upload, deployment or public verification.

## Source contract and browser policy

Only MBTN18901 rows1/2 are enabled. Commands18802/18803 bind `category-step:-1/+1`; group20 is not exclusive selection. Previous slots18290/18291/0/18315 with rollover18292; next18293/18294/0/18316 with rollover18295. Hit rectangles are `[320,690,43,31]` and `[320,721,43,31]`. One-based sprites560–567, eight programs, ten groups. Both tracking groups draw identical images; tick1 emits sound18003, cue3, channel1. Interval100ms, end-check2 for tracking and1 otherwise. No easing, repeat or latched selection.

`native-category-motion.js` owns one retained action controller through `createNativeToolMotion`. Explicit `policyFor(18901,row)` applies the saved/cleared slot3 boundary policy. Both disabled actors render even without semantic buttons. Empty/invalid metadata deliberately displays both disabled source poses as a browser capability policy. Raw out-of-range indices keep the existing displayed category fallback and suppress category actions; the adapter does not rewrite list policy.

`showLibrary` calls beforeRender/update alongside the unchanged Stamp owner. Decode readiness only binds existing semantic DOM. Same target/program retains progress and cue disposition. `createCategoryIdentity` combines library/tab, source list identity, ordered category object identities, imported array identity/count and raw category index. Fresh filtered arrays do not invalidate a gesture; replacing/reordering the logical list does. No item contents are serialized per RAF. Release refresh runs through the shared controller before proposing an application action. The new owner opts in to document ownership through `ownInteraction` on the shared adapter: held pointer/key input blocks competing contacts, and release/cancellation quarantines late physical clicks with the existing `interactionOwner`. Capture transfer, cancellation and source scheduling remain shared. The option defaults off for existing owners, preserving Stamp behavior.

Application category filtering/order, imported category, page reset, selection clearing, item pagination and document/history semantics remain authoritative. The dropdown, readout, digits, tiles, drag and HTML/native fallbacks remain separate owners. Source files and UI for Stamp18700, Stamp Editor and sound14006 are unchanged. Page-arrow binding remains NO-GO and was not traced further.

Source-documentation correction retained for review: the prospective audit README's blanket claim that these image words have bit0x8000 conflicts with its own raw program hex/evidence. Original Tp and the independent fixtures encode unflagged560–567 (for example18291 draws0x0230 twice). Raw IDs/hex are preserved, not rewritten to fit that prose; the ordinary renderer supports these source words.

The owner interface is `createNativeCategoryMotion({stage, controls, resolve, readState, onActivate, ...assetOptions})`. It returns `beforeRender()`, `update(value)`, `cancel()`, and `dispose()`. `readState` and `update` use `{active, nativeUi, categoryIndex, categoryCount, identity}`; the identity is a stable logical string from `createCategoryIdentity()`. `onActivate(binding)` proposes only the existing application action. Asset decoding never reconstructs semantic DOM. The shared adapter's new `ownInteraction` option defaults false and is enabled only here. `fallbackActions` explicitly lists just the two category bindings. Before assets bind, it retains the native semantic contact and logical target under the same document owner; valid native clicks reach the existing application handler exactly once even if decoding binds mid-press. Release outside the current rectangle, cancellation, capture loss, competing input and stale targets are rejected. This is input handoff, not a second playback engine: no program/cue is fabricated before optional assets are ready. Once bound, the existing source controller owns all playback and delayed cues.

## Clean source restoration and media

The static fallback PNGs retain their original bytes, including their incorrect baked451/454 category composites. The exporter separately composes each of the nine non-Stamp `LIBRARY_TRAYS` recipes from original base/tabs/commands plus18034,18028,18031,18289,18037, omitting manual category composites and owned category programs. All nine `[320,690,43,62]` crops have identical RGBA SHA256 `d5b5c1e27f23c3c6478c623b66a6c93423a03d3e889c77e331cc11615c2dc2e3`. Only that footprint is restored, not category text or the whole tray. The shared PNG is215 bytes. Stamp's329,665 backdrop is not reused.

`stage_category.py` exports to a new owned directory, rejects any changed old manifest record or old payload, removes regenerated unchanged files, and emits a deterministic receipt. The sole changed old object is the secondary manifest; its old records remain equal. Delta: one table, eight programs, eight sprite PNG/ARGB pairs, one crop; zero added sounds. Existing18003 path/hash is reused. Two independent exports produced byte-identical receipts. No CDN or credentials were used.

`check_category_source.py` independently compares raw program hex, table words, signed registrations, tick/cue/frame metadata, original sprite RGBA hashes and registered source compositions against staged PNGs. All ten groups × nine profiles pass; all90 old-baked-background mutations differ and are rejected. Both in-memory raw-source mutations and Node adapter red controls reject changed slots, truncated duplicate tracking, changed registration and altered/missing delayed cue. Original resources are never mutated.

## Reproduction and owned artifacts

Run from this worktree. Existing Python environment and original installer resources are read-only:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python scripts/secondary-motion/stage_category.py '/home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/extracted/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources' /home/zsrobinson/code/kidpix/public/original artifacts/t3/library-category-motion/NEW/delta
PYTHONDONTWRITEBYTECODE=1 /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python scripts/secondary-motion/check_category_source.py '/home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/extracted/Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources' artifacts/t3/library-category-motion/media tests/fixtures/library-category-source.json
npm test
bash artifacts/t3/library-category-motion/container.sh node node_modules/vite/bin/vite.js build --configLoader runner --config artifacts/t3/library-category-motion/vite.config.mjs
bash artifacts/t3/library-category-motion/all-final.sh
# Earlier phase driver (stops at the first nonzero lane):
bash artifacts/t3/library-category-motion/browser-lanes.sh
# Complete remaining lanes/controls after a retained WebKit failure stops that driver:
bash artifacts/t3/library-category-motion/finish-lanes.sh
# Frozen source comparison (base-control/ is a git archive of584b93b src/index/package):
flock /var/tmp/kidpix-ui-validation.lock env ENGINE=webkit BASE_CONTROL=1 bash artifacts/t3/library-category-motion/container.sh node node_modules/@playwright/test/cli.js test -c artifacts/t3/library-category-motion/frozen.config.mjs
KIDPIX_SECONDARY_INPUTS=/home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion KIDPIX_SECONDARY_ORACLE=/home/zsrobinson/code/kidpix/artifacts/t3/tool-motion-coverage/source-oracles.json KIDPIX_SECONDARY_MEDIA="$PWD/artifacts/t3/library-category-motion/acceptance/public/original" PYTHONDONTWRITEBYTECODE=1 /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python scripts/secondary-motion/test_export.py
```

The temporary worktree `node_modules` and `public/original` links were read-only inputs and are removed at handoff; recreate them to the existing parent paths when reproducing locally. All media writes went to owned staging, never through those links.

Supporting ignored artifacts: `artifacts/t3/library-category-motion`. `validation-summary.json` records the final results and retained gates. `delta/` contains only the18 new/changed objects; `export-receipt.json` lists exact keys/sizes/hashes. `media/` retains the full privately generated secondary output for independent source checks. `acceptance/` is an owned read-only-original mirror with the staged delta applied, used by the unchanged asset verifier. Staging middleware uses actual `/original/` URLs: declared delta keys must exist locally, all other keys use read-only originals. The Range-capable existing server serves audio; it does not force200. Native Audio acceptance checks complete200 or full-file206 plus exact body size/RIFF/SHA. The parent584b93b sound14006 Range correction and exact-AbortSignal collector remain untouched.

The container runner stops unless inherited DOCKER_HOST is `unix:///run/user/1000/docker.sock`. Pinned image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`, pull never, init, user0:0 (rootless maps host1000), cap-dropALL, shm512m, default network; Vite and Playwright share the container. Source/deps/originals and absolute symlink targets mount read-only; only this milestone's artifacts/build/cache are writable. No installs/downloads, native runtime, Wine, VM, CI, EULA, root socket, daemon/context/group changes or sudo. Browser lanes wait normally on host `/var/tmp/kidpix-ui-validation.lock`.

## Validation and review gates

- Node:362/362 pass, zero skips (baseline348 plus14 meaningful boundary/controller/adapter/identity cases).
- Asset verifier:4,343 items,9,769 referenced files, staged manifest and new payloads included.
- Portable exporter:14/14 tests pass against the staged media and original source oracles, including all previous source assertions.
- Private Vite production build: passes,58 modules; owned output only.
- Independent source:8 programs/10 groups;90 profile/group pixel comparisons pass;90 baked-background red controls fail as intended.
- Chromium158.0.8127.18:54/54 development and52/52 built scoped cases pass.
- WebKit27.2:42 pass/10 retained Stamp failures in development;40 pass/the same10 Stamp failures built. Every new category case passes:28 Chromium dev,27 Chromium built,26 WebKit dev,25 WebKit built. Differences in population are the established built-module and WebKit-CDP exclusions.
- Both development engines render702 bounded source frames with zero differences. Built lanes retain the established `@module` exclusion.
- Native Audio18003 passes in all four lanes: complete200 or full-file206 only, exact3604-byte RIFF payload and SHA256 `e78ecec97f0051ef24e0ec4c6e8f491b0c3834f62c7806057e3416563edd9771`. Audio comes from the real read-only original path through the Range-capable server, not a forced200 staging overlay.
- Static binding red control loads/draws the actors but detaches binding from the semantic controls; the same ten-group case fails on expected rollover18292 versus rest18290. `static-red-final-2.log` records the intended failure; final phase logs are `*-final.log` and the driver receipt is `all-final-receipt-2.log`.
- Bounded coverage adds exactly the fixture-derived ten18901 groups to the existing692, requiring702 total and exact program/frame identities. Existing groups and source assertions remain required.

WebKit Stamp failures remain release blockers, not waived assertions. The ten cases report5,25 or38 channel mismatches (zero outside pixels). A frozen584b93b source control already reproduces the category0/3 arrow result exactly:38 bad and38 visible channels. The full frozen Stamp comparison also reproduces all ten cases and exactly the same5/25/38 bad/visible channel counts:3 pass/10 fail at584b93b. `frozen-comparison.json` compares all cases/counts across the frozen source, current dev and current built runs; `frozen-stamp-all.log` and `frozen-all-results/` retain the complete control. Source control uses a `git archive` copy in owned `base-control/`, the same pinned browser/config/media bytes, and the unchanged Stamp test file. It is not a baseline update. No Stamp source, source oracle, tolerance or expected pixels were changed.

Retained local setup evidence: `build.log` records the first private Vite config-loader attempt denied by the read-only dependency mount; `--configLoader runner` resolved it without granting dependency writes. `stage.log` records the first comparison rejecting Python tuples against JSON lists for an unchanged18053 record; the staging checker now normalizes through JSON before comparing, and independent disk JSON comparison confirmed zero changed old records. The first `node.log` ran before the owned original-media link existed and skipped28 asset-dependent cases; `node-final.log` runs all362 with zero skips. These failed/incomplete attempts are retained alongside passing receipts. `browser-startup-failure.log` and `static-startup-failure.log` record an initial config-directory server cwd error; neither counts as a test/control result. `first-chromium-dev.log` and its retained traces record42 passes/four fixture failures caused by query-string URL matching and capture not yet being delivered; corrected focused coverage passes6/6. `held-space-failure.log` records a test incorrectly expecting a competing tray activation to bypass the shared key owner; the corrected test requires rejection, one release action, and fresh Stamp activation. `first-webkit-dev.log` and its copied results retain all ten Stamp failures before the frozen control overwrites its own scoped output. `webkit-1.log` and its results retain the built failures. `readiness-activation-red.log` records the subsequently discovered real handoff bug: a valid predecode press stayed at category0 because the newly bound click handler consumed release. The shared opt-in input handoff fixes it; expanded readiness tests now prove one activation for pointer/Space, no activation after cancellation/outside release, stale rejection and reentry. Earlier pre-release-bound receipts/failures remain in `pre-release-bounds/`. All old parent failure artifacts remain untouched.

Parent review must investigate the retained Stamp WebKit failures and run full/static/public release gates after integration. The category milestone is not an all-green release receipt. Upload and HTTP verification of these exact18 objects are deferred to the parent; private staging proves no remote availability. No reference/tolerance/deadline/population change. Native0/17; enlarged vacuum disabled, Pencil OFF. Physical iPad latency, foreground idle, audible behavior and IME remain unknown. Root originals, history, worktrees, imported ancestor, deferredClipboard80a0661, SERVER_HANDOFF.md dirt, RESUME_AFTER_SIGNOUT.md and parent failure evidence were not edited.

## Exact media receipt

| Object key | Bytes | SHA256 |
| --- | ---: | --- |
| `ui/secondary-motion/backdrops/library-category.png` | 215 | `a381424f24345690d81c5ffc5b198462359c99044f0038c8a73b1bdac0f7d45e` |
| `ui/secondary-motion/manifest.json` | 627478 | `b651dc3a3d578f343bc19fbd1c1eec2898cd26b508d4edf19f178129952f5133` |
| `ui/secondary-motion/sprites/18000-560.argb` | 5332 | `09842fd673eddfc6863b5909090aa1e1a8bf411ea355ef15dd91b3551c540161` |
| `ui/secondary-motion/sprites/18000-560.png` | 2472 | `44af8f5a1204d8ace81bc2abb3e869e4889fe66d8c4b73362e2f1e2c5d67989a` |
| `ui/secondary-motion/sprites/18000-561.argb` | 5332 | `ca7f8c08de66ccb503f58dba21c9813d3cb3ace1f6303be56638d387afa56f11` |
| `ui/secondary-motion/sprites/18000-561.png` | 1752 | `348fd5f27144674a646a07221ab8c3cced01259b5563715d709418fecd806d95` |
| `ui/secondary-motion/sprites/18000-562.argb` | 5332 | `285694451e409992d7c04033383ffbaad8f5484ff170ecb3a825f10d75746ef2` |
| `ui/secondary-motion/sprites/18000-562.png` | 1757 | `65e9703829c3121a6a48570064a57d978501c41e5e18a4090250ade309302e5a` |
| `ui/secondary-motion/sprites/18000-563.argb` | 5332 | `b1400c6b6e5dc062c0a4bc9415f02576fc3d52622ff4bc209636f82e5acd31d9` |
| `ui/secondary-motion/sprites/18000-563.png` | 2793 | `657f9e2dcf8b548f6e456362fa50ab5f21a139035e96b89e934819225724b63c` |
| `ui/secondary-motion/sprites/18000-564.argb` | 5332 | `d8af7a2897bb46ec3da3225463aa5fdb336de5dccd2cd6dd4b752eb5b3ba342c` |
| `ui/secondary-motion/sprites/18000-564.png` | 1849 | `12b8429d10d91ab6447cc0a705ccca387eac0c42bb50749e5068467f66ea8f77` |
| `ui/secondary-motion/sprites/18000-565.argb` | 5332 | `bc7ce94a5ea33d6e600a151494ed47b8d744bb07d96a29794512e5327a05c301` |
| `ui/secondary-motion/sprites/18000-565.png` | 1857 | `ece9bd5634f18a2769ceccaee8a0561073a753108456ba53d21a781a91f2dc78` |
| `ui/secondary-motion/sprites/18000-566.argb` | 5332 | `47cdadcf753021988ad660226966857cf575a0f7e84bbe07595b7eeb8c30954e` |
| `ui/secondary-motion/sprites/18000-566.png` | 1549 | `b0dcc5aad1f03934419e1e445006cb05f6e5a3a452abfce944c538440b908d76` |
| `ui/secondary-motion/sprites/18000-567.argb` | 5332 | `24f2ccef3401349fd2dfb9441c7fbe7f96184ec44de7e79944c6776bd3b31465` |
| `ui/secondary-motion/sprites/18000-567.png` | 1699 | `985c596e62da4eef9073847c1bbc9f2333ce7e335fd1342d166415131750813c` |
