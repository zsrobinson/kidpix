# Pencil input API capability audit

2026-11-10. Source root `c9eb82e864fa9f7fea33f3558da5776a64efd81b`, published
0.20.0. Documentation and bounded localhost capability probe only; no runtime
candidate or physical latency fix validated. Parent owns review and release.

## Supported, unsupported and unknown

Shipping documentation and Linux probe results are separate evidence. Safari18.2
shipped on December11,2024 for iOS/iPadOS18.2 among other platforms, with both
sample methods documented in [Apple's release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_2-release-notes?changes=_7).
The [WebKit18.2 announcement](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
corroborates them. The pinned Linux Playwright WebKit27.2 is not iPad Safari27.2,
and its UA does not establish an Apple OS or physical device.

| Capability | Chromium158.0.8127.18 probe | Pinned WebKit27.2 probe | Safari/Pencil interpretation |
| --- | --- | --- | --- |
| `getCoalescedEvents()` | function | function | Documented Safari18.2; already consumed by app. Hardware batch sizes unknown. |
| `getPredictedEvents()` | function | function | Documented Safari18.2; app does not use it. Physical nonempty Pencil predictions unknown. |
| `pointerrawupdate` | Window/document/element handler exposed; three automated mouse raw events delivered | No handler exposure; zero raw events for three mouse moves | No usable pinned-WebKit path found; actual iPad delivery untested. |
| Canvas2D `desynchronized` | Requested true returned true | Requested true returned true | Recognized setting; actual low-latency presentation unknown. |
| Canvas2D `willReadFrequently` | Requested true returned true | Requested true returned true | Setting receipt, not proof of CPU/GPU backend or speed. |
| Canvas2D `alpha:false` control | Attribute false; clear after red fill returns opaque black | Alpha absent; clear after red fill returns transparent | Pinned WebKit ignores alpha request. |
| `requestAnimationFrame` rate argument | Arity1; extra-object getter not read | Same | Unsupported rate-control claim; call acceptance proves nothing. |
| `Animation.frameRate`, timeline `maximumFrameRate` / `animate`, CSS animation/transition frame-rate | Absent / unsupported | Absent / unsupported | No shipping public rate-control route established. |
| Delegated Ink API | `navigator.ink` present; presenter resolves with update method | Absent | No pinned-WebKit route; compositor/hardware trail untested even in Chromium. |

Primary references checked November10,2026:

- [W3C Pointer Events3, Recommendation June30,2026](https://www.w3.org/TR/2026/REC-pointerevents3-20260630/): coalesced samples are historical, predicted samples are estimates; quantities and algorithms depend on the UA. Raw updates are secure-context events and can themselves be coalesced. Listening to both raw and move without deduplication repeats samples and can increase work. [Chrome142 release notes](https://developer.chrome.com/release-notes/142) document secure-only raw updates.
- [WHATWG canvas standard](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-desynchronized), updated November9,2026: desynchronization permits latency optimizations and possible tearing; it is not a presentation guarantee. [Chrome's low-latency canvas guidance](https://developer.chrome.com/blog/desynchronized) requires checking returned attributes, notes first-context immutability and composition restrictions. It does not promise this app's layered studio gets a direct-display path.
- WebKit upstream [settings IDL](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/CanvasRenderingContext2DSettings.idl) includes desynchronized/read-frequency but comments out alpha. Its [context accessor](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/CanvasRenderingContext2DBase.h) returns `m_settings`. Inference: the returned true value alone cannot demonstrate a distinct rendering path. This is current upstream evidence, not an identified source revision of the pinned binary.
- WebKit [frame-rate explainer](https://webkit.github.io/explainers/animation-frame-rate/) proposes animation/timeline controls and explicitly declines extending RAF for this purpose. Current [RAF IDL](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/animation/AnimationFrameProvider.idl) takes only a callback; [Animation IDL](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/animation/WebAnimation.idl) and [timeline IDL](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/animation/DocumentTimeline.idl) gate the proposed controls behind settings. No flags were changed.
- [WICG Ink API draft, September16,2024](https://wicg.github.io/ink-enhancement/): delegated compositor trails extend the last rendered trusted pointer point. A resolved presenter is not proof that an OS compositor actually draws a trail.

## Actual app path and receipts

`src/pointer-samples.js:3` returns nonempty coalesced lists or the dispatched event;
`createPressureInput` preserves pen pressure with release handling. `src/paint.js:1073`
consumes each sample and renders synchronously afterward. The display context at
line143 requests `willReadFrequently:true`; it does not request desynchronization.
Pencil moves are not waiting for an app RAF flush. No prediction or raw listener
exists in this path. Existing audits establish exact final ink, not fresh physical
presentation; their approximately31 versus58 callbacks/s are not Pencil latency.

Raw receipts and executable sources are under ignored
`artifacts/t3/pencil-api-capabilities/`: `chromium.json`, `webkit.json`, `probe.mjs`,
`run.sh`, logs and retained initial probe receipts. Final fixture is
`http://127.0.0.1:4603/`, secureContext=true in both engines. UAs:

- Chromium: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/158.0.8127.18 Safari/537.36`.
- WebKit: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15`.

Nine fresh DOM canvases per engine cover defaults, desync false/true, read-frequency
alone and both combinations, alpha controls, and an unknown key. Defaults return
`desynchronized:false, willReadFrequently:false`; each explicit boolean is returned
as requested. Opposite options on a second call leave the same context/settings
unchanged. Known desync getter runs once; unknown-key getter never runs. RAF's
extra frameRate getter never runs, matching IDL; no callback-rate test was made.

Synthetic default PointerEvents return empty sample lists. Constructor-supplied
coalesced/predicted lists return the supplied point in both engines, demonstrating
API plumbing only. Actual imported `pointerSamples` uses the coalesced point and
falls back correctly for empty lists. Three automated trusted mouse moves each
return one coalesced sample and zero predictions in both engines; only Chromium
emits raw events. None establishes physical pen input, hover, batch frequency,
nonempty hardware predictions or their accuracy. No touch/pen device was emulated.

Red-fill readback is `[255,0,0,255]` in both engines. Alpha-false clear after fill
is `[0,0,0,255]` in Chromium versus `[0,0,0,0]` in WebKit. Initial unpainted readback
is transparent in both, even Chromium alpha-false; therefore only the materialized
fill/clear control supports the alpha conclusion. All raw values are retained.

## Bounded next steps and handoff

1. A future small physical Safari fixture can check whether trusted Pencil moves
   deliver nonempty predictions, their horizon and errors at turns. Only if useful,
   prototype a disposable predicted preview that is replaced by confirmed ink;
   never feed predictions to committed pixels, pressure history or brush RNG.
   This is a supported API candidate, not an authorized runtime patch or proven fix.
2. Desynchronized Canvas2D is a recognized creation-time option worth an isolated
   future experiment only with a validated device/presentation observation. Check
   actual attributes before comparing, retain the existing read-frequency setting,
   and require unchanged final ink/history. Stored settings and RAF counts cannot
   validate a win; do not revive the rejected screenshot/frame-stream oracle.

No additional usable Safari raw-input, delegated-ink or public frame-rate bypass
was established. Stop at that limit; no downsampling or invented prediction.

Exact reproduction from this checkout (existing dependencies/image only):

```sh
node --check artifacts/t3/pencil-api-capabilities/probe.mjs
bash -n artifacts/t3/pencil-api-capabilities/run.sh
bash artifacts/t3/pencil-api-capabilities/run.sh \
  > artifacts/t3/pencil-api-capabilities/probe-final.log 2>&1
git diff --check
```

The runner holds host `flock /var/tmp/kidpix-ui-validation.lock` across the entire
container/browser lifetime. Lock wait is not timed or used as a performance claim.
Both engines run sequentially in existing image
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`,
with `--pull never --cap-drop ALL --network host --shm-size 512m`, host UID/GID,
read-only checkout/dependencies and only own artifacts writable. Fixture serves
only its page and the unchanged pointer helper; browser outbound requests are
blocked. No media was needed, linked or copied; no app build/server was launched.
Playwright traces are retained only on failure; both final engine runs succeeded.
No full suite or benchmark matrix was warranted for this documentation-only change.

Only useful audit documentation is committed. Raw probes remain private artifacts.
No installs/downloads, new credentials, original software/EULA, baseline/version
change, push, deployment or publication. Owned fixture, browser contexts and
container close through finally/trap; no input links were created. Parent dirty
SERVER_HANDOFF, Clipboard80a0661, original media/history and other worktrees remain
untouched. Native0/17, physical iPad latency, foreground-visible idle and audible
feel remain unverified. Enlarged vacuum stays disabled. Parent owns integration,
full release/public checks and publication.
