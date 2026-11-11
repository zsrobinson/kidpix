# Hand navigation implementation handoff

Base: accepted0.24, a6d842af12d7e1bc78077108b170fc110bec51ce. Scope is the browser policy in hand-navigation.md. No package/version/profile, baseline, source media, exporter or original program changes; no push or deployment. Parent-owned dirty handoff/resume notes and all other worktrees/history remain outside this checkout's changes.

## Reproduction

Source oracle (existing audit environment; no installation):

```
PYTHONDONTWRITEBYTECODE=1 /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/venv/bin/python scripts/secondary-motion/check_hand_navigation_source.py /home/zsrobinson/code/kidpix/artifacts/t3/secondary-motion/inputs/Tp.MHK artifacts/t3/hand-navigation/source.json
node --test scripts/parity/hand-navigation.test.mjs scripts/parity/action-motion.test.mjs scripts/parity/make-sticker.test.mjs
```

Owned runtime scripts/configs, JSON results, logs and retained failures are under this checkout's artifacts/t3/hand-navigation. run.mjs is the initial/corrected focused runner; run-completion.mjs separates the navigation pose test; run-exact.mjs rebuilds the final production/private outputs. The private fixture is vite.hand-navigation.config.js; ordinary production exports no test bindings. Both builds use Vite's runner config loader and owned cache/output paths.

Every browser lifetime is under host `flock /var/tmp/kidpix-ui-validation.lock`. The exact container invocation uses inherited `DOCKER_HOST=unix:///run/user/1000/docker.sock`, image `mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`, `--pull never --rm --init --user 0:0 --cap-drop ALL --shm-size 512m`. Source is mounted read-only at /work; only own artifacts are writable. Existing dependency/media symlink targets are mounted read-only at their original absolute paths. Servers and browsers share that container's default isolated network, using loopback4771/4772 for private dev/built and4773/4774 for shipped dev/built. No host networking/system socket/context switch is used. image-receipt.txt, runtime-receipt.txt and browser-versions.json retain image/rootless/data-directory/browser receipts (Chromium158.0.8127.18, WebKit27.2).

## Preserved failures and corrections

- Host system Python lacked Pillow. The source oracle subsequently used the existing secondary-motion/venv; no packages were installed.
- Initial Chromium shipped run:20 passed,4 failed. Three test assertions retained the old unbound profile; the new Scissors assertion matched both menu and tray controls. Exact profile/ownership expectations and the scoped locator were corrected. initial logs/traces remain separate.
- An adjacent Node check still required Hand rows5/10 absent. It now checks exactly the authorized Hand profile and row11 exclusion. The failed node-final.log remains; the corrected focused Node population passes39.
- Expanded Grab exhaustive pose test reached WebKit's unchanged30-second deadline. Navigation's two actors were split into a separate test; the original seven clipboard/reorder actions and all pixel assertions, tolerances and deadlines remain. Both development and built WebKit timeout traces remain in verified-* results.
- The first raw-fixture browser merge used an array offset despite the source array beginning at row2. That displaced unrelated expected rows and caused an oracle exception. It now merges by source row identity. final-* logs/traces retain the exception; completion-* results are distinct.
- run-final.mjs initially had an extra closing brace in its orchestration script; Node syntax checking caught it before that script ran. It was corrected before container launch. No product workaround was made for a harness error.

No failed attempt is reclassified as passing, no automatic retries are configured, and no baseline/tolerance was changed. Fault controls deliberately weaken only private served JavaScript: one replaces navigation's order identity with selected ID; the other restores a no-op step. Their original expected-failure output remains in fault-controls.log/json.

## Parent gates

The scoped checks establish browser behavior and source-art ownership, not native runtime parity. Native immediate observer delivery, universal handoff, filter translation, Undo grouping and audible/hardware timing remain unknown; native accepted0/17 is unchanged. Parent review and full release/source-only/Worker/static capture/public gates remain required. No full suites, performance sweeps, upload or deployment were run here.

The scene tests cover array wrap, singleton/no selection, stale order/restore/replacement, invalid destination, drag/path/playback/staging/disposal, empty and whitespace text retention, history/redo/clipboard/save representation, selection ABA, media/editor DOM retention, focus, modal rejection and held artwork readiness. The video test retains a video element and spies on its player methods; it does not prove real decoded movie playback or audible timing. Ordinary typing is normally settled by the existing Text-to-Hand transition. The navigation continuation's post-flush identity guard is implemented, but exhaustive injected typing-history reentrancy and actual save/Open/PNG-export round trips remain parent validation gates; do not claim they were executed by these tests.

Required existing public object keys and exact hashes are committed in hand-navigation-media.json (15 keys, zero new media). Public delivery was not checked by this child. Source oracle output also retains the archive/program/draw-group and media receipts. No original application ran. Owned containers/processes and temporary input links are removed before handoff.

## Final scoped results

- Raw oracle:2 MBTN rows,6 complete programs,8 draw groups; all registration/geometry/sprite/audio pins pass.15 existing required media keys recorded;0 new media.
- Focused Node:39 passed,0 failed (node-exact.log).
- Completion pass:15 private +5 shipped cases per engine/lane,80 passed across Chromium/WebKit development/built (completion-exits.json). This includes the original Grab pixel test and the independent navigation pixel test after the row-identity merge correction.
- Final code pass after idle-token caching and the ordinary-typing guard:16 private +3 shipped cases per engine/lane,76 passed across all four engine/lane pairs (exact-exits.json). Both private and standard builds succeed. Normal production has no private test exports (production-export-check.txt is empty).
- Fault controls:2 expected assertion failures in both completion and exact private-built Chromium runs; the stale-order control receives b instead of a, and the no-op control receives a instead of b. No route-injection assertion or setup failure substitutes for those red results. exact-fault-controls.json/log retain the final run.

All owned validation containers exited and were removed. Temporary dependency/media links were removed. The tracked checkout is committed and clean; ignored evidence remains available to the parent. Independent parent review, exhaustive typing-flush reentrancy and save/Open/export checks, release gates and public verification remain outstanding as listed above.

## Originating typing ownership hardening

A bounded independent probe found that synthetic input delivered to retired editor A could be flushed while navigation advanced selected text B. Ordinary UI and hardware IME reachability were not demonstrated; detached input also reached generic flushing in the accepted baseline. Navigation now requires the pending typing token to match the selected object, current live editor and document epoch. It does not reinterpret or delete text, or claim to fix all late-input behavior. Two retired-owner regressions fail before the gate and pass after it across all four Chromium/WebKit development/built lanes; a real keyboard positive control still commits one ordinary typing record before selection-only navigation. The full Node suite passes 313 checks. Independent recheck and release gates remain pending.
