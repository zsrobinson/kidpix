# Tray artwork readiness and held input

The public 0.19 release exposed a Cut failure while optional Grab artwork was loading. Completing the primary Grab sprite decode called `showTray()`, which replaced the held fallback button before pointer release. The scene target and capabilities remained unchanged, but the browser no longer dispatched its click to the original control.

## Evidence

The unchanged public test failed once in three trials. Delaying only `tool-motion/grab/sprites.bin` until a held Cut reproduced the failure in three of three public, development and built trials. Completion before pointer-down or after pointer-up passed. Removing voice catalog events still reproduced it. Completed response bodies and button identity instrumentation distinguish this failure from the unresolved public transport stalls.

The independent diagnostic report and archived probes are retained under `artifacts/t3/public-grab-cut-diagnosis/` in the diagnostic checkout. Parent red/green records are under `artifacts/t3/release-0191/`; logs have matching `/tmp/kidpix-0191-` names.

## Change

Primary, secondary and action artwork readiness now calls `refreshTrayMotion()`. It updates existing artwork and motion bindings without rebuilding semantic controls. Actual tray and option changes still use `showTray()` and its structural cancellation behavior.

The existing fallback input guard also covers Grab actions, Text formatting and tray selectors. It uses the shared document interaction owner for pointer and Space contacts. Newly ready motion bindings can adopt presentation while the original fallback gesture retains its action, target and control identity. Activation requires a connected, enabled original control, the original authoritative target, and a release over the control (or matching focused Space release). A release outside or a changed scene target cancels it.

Accepted fallback pointer-up invokes the canonical action once. This avoids losing a valid action when rejected incidental touch suppresses the browser's later compatibility click. The guard consumes that physical click, including WebKit's touch-to-mouse compatibility event with a different pointer ID. Keyboard/assistive semantic activation remains available after cancellation. Escape, blur, page hide, hidden visibility and capture loss release ownership; unrelated key releases do not finish Space tracking.

An explicit semantic command outside the guarded tray supersedes its held fallback gesture. The window capture listener cancels and releases that gesture before another chrome owner checks availability. Physical incidental contacts still go through the shared first-contact guard. The existing clipboard target-change tests now also assert that the requested tray transition actually happened.

The shared owner is installed before fallback capture listeners and rejects competing physical contacts before they can cancel the original gesture. Existing native-owned controls retain their native dispatch. No program bytes, media, audio completion code, drawing samples, pressure or history rules change.

## Acceptance

`tests/browser/tray-motion-readiness.spec.js` contains 19 actual-app cases: readiness before/during/after pointer and Space Cut, non-voice reproduction, action/selector binding handoff, Escape/focus/blur cancellation, Shift release, release outside, scene-target replacement, real touch repeat activation, and competing touch during a held fallback Cut. Mutation and Undo/Redo checks verify actual commands rather than counting consumed browser clicks.

The original primary readiness cases fail on the prior implementation. Extending the delayed-readiness test to action and selector bindings also failed before the fallback guard extension. Chromium development runs pass all 19 cases within 56 focused readiness/Text regressions. WebKit built runs pass all 19 within 49 focused regressions. Remaining engine/entry-point and full release checks are recorded separately as they finish; these counts alone are not release approval.

Initial probe corrections are retained: the scene's selection class is `is-selected`; Undo can intentionally restore no selection; consumed compatibility clicks are not a command-count oracle. These corrections do not change the original missing-Cut assertions. Later semantic activation, fresh touch, actual object removal and history remain explicit checks.

This fixes a reproduced browser readiness/input race. It does not establish physical iPad latency, the cause of foreground animation loss, native timing or audible feel. Accepted native references remain 0/17; the enlarged vacuum actor remains disabled.

## Broad-suite cancellation correction

The first independent focused review found no source objection, but the subsequent full WebKit run exposed four existing clipboard regressions: held pointer/Space Cut/Paste with fallback artwork, followed by a semantic Grab tray command. Newly shared ownership caused the tool-tab owner to reject that explicit command. The tray stayed Text, leaving the old clipboard action eligible at release. A tight four-case WebKit development run reproduced all four failures.

Canceling fallback ownership at the independent semantic command boundary makes those four cases pass, along with competing physical touch and unrelated Shift-release controls. This is distinct from allowing a second physical contact to steal a held gesture. The initial full runs were interrupted, their results are retained, and they are not counted as passed release gates. Fresh frozen-source full runs and an independent narrow recheck are required.
