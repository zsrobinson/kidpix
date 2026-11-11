# Stamp Editor input across artwork readiness

A pointer press on the fallback Stamp Editor button must still open the editor
when its authored artwork becomes ready before release. The button remains
connected; asynchronous binding must preserve the accepted action and selection.

The public 0.29.0 acceptance run failed once at editor opening, before its sound
assertions. Five unchanged public replays passed. A response-body gate reproduced
the opening failure when secondary artwork arrived during a held pointer;
readiness before the press or after release passed. This controlled bug does not
establish the cause of the original intermittent public failure.

## Cause and correction

Stamp Editor used the shared motion manager without its optional fallback-contact
ownership. Readiness bound the native control after the fallback press, but no
native release proposal existed. The new capture-phase click handler then
consumed the browser click without activating the application command.

Only Stamp's editor profile now adopts the shared interaction owner and its
`stamp-edit` fallback action. It retains the accepted pointer or keyboard contact,
validates the selected stamp on release, and preserves ordinary application
activation when readiness arrives during that contact.

Pre-ready owned input also refreshes authoritative state before accepting the
press. Selecting a library stamp updates application state before the motion
owner exists. Recording its old snapshot would make readiness cancel the gesture
as if the selection changed afterward. Existing ready-owner refresh behavior is
preserved; the added refresh covers pre-ready owners that opt into interaction.

## Verification and limits

`tests/browser/stamp-readiness.spec.js` gates the real secondary manifest while
using the application catalog, selected stamp, semantic control and modal flow.
It asserts the same connected button, actual editor opening, cancellation and
fresh activation. Before the fix, the pointer-during-readiness case fails at the
dialog assertion while five before/after/keyboard controls pass. Enabling ownership
without refreshing the pre-ready target still fails four cases; the final fix
passes all fifteen focused WebKit cases.

Coverage includes pointer and Space before/during/after readiness, Escape and blur,
outside release, Enter and semantic activation, genuine touch, and rejection of a
competing touch during held Space. Network errors retain the existing per-request
abort-identity checks. Assertions, timeouts and pixel tolerances are unchanged.
Shared-control regression, independent review and release receipts are recorded
separately under `artifacts/t3/release-0291/`.

No source artwork, animation timeline, cue, document content, history or media
payload changes. Native references remain 0/17. Physical iPad latency, foreground
idle, audible behavior and IME remain unverified; enlarged vacuum stays disabled
and Pencil preview defaults off.
