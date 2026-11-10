# Chromium ink frame-stream capability experiment

2026-11-10, prepared root `15d48e3930753bb609bdcf449c884d3900c40122`.
Published app remains 0.19.1, `505b033e8646c127ee084b25e447c49db2f20bac`.
**Measurement limit; no validated full-studio oracle and no runtime change.**
Only this audit is retained in tracked source. Experimental observer, harness
patch, runner, comparison, raw PNGs and results remain under ignored
`artifacts/t3/ink-frame-stream/`. Parent owns review and release gates.

## Question and result

Can `Page.screencastFrame` observe intermediate black Pencil ink with materially
less interference than the previous screenshot observer? Chromium 158.0.8127.18
accepts the protocol and emits useful PNGs during actual drawing. This is a
Chromium lab proxy, not a WebKit observer or a Safari/physical presentation test.
The former screenshot control measured WebKit, so cross-engine rates cannot
establish a quantitative observer-cost improvement.

The bounded stream experiment still materially perturbs callback delivery.
Full-studio green observer-on callbacks fall to about 45–46/s from about 60/s
off. Bare actual `createPaint` also slows substantially. Requested 60/s synthetic
delivery remains about 60/s. Callback counts are observer-cost controls, never
freshness verdicts. No renderer or application optimization follows.

Full-studio PNGs exhaust the explicit 64 MiB retained-base64 guard early in the
stroke. Every received frame is ACKed, including dropped frames; the browser
continues sampling, but the missing pixel observations cannot be reconstructed.
The retained early frames detect the synthetic fault, yet full lanes fail the
coverage/validity gate. This is **not** accepted red/green oracle validation.
The guard is not silently enlarged or replaced with lossy pixels to seek a pass.
After the bounded reversed controls and trusted-input sanity, the experiment
stops at this measurement limit. No further performance sweep.

## Method, provenance and clocks

The archived patch adds an opt-in `INK_STREAM=1`, requiring `INK_FRESHNESS=1`,
`INK_OBSERVE=0` and Chromium. The default harness remains unchanged in the
final tracked checkout. All lanes use actual full studio or actual `createPaint`
minimal fixture, seed53, 240 monotonic black Pencil moves plus release, identical
options, geometry, pressure and source pixels. Full studio first observes Undo
script1095 start and finish, actual three motion owners finished, images decoded
and finite UI media settled. No actor hiding, stopped owner, source suppression,
CSS/promotion/containment change, extra RAF stimulus or audio bypass.

Timing does not invoke `page.screenshot`, synchronous canvas readback or PNG
decode. Each protocol event is promptly ACKed and its original base64/metadata
buffered, bounded by 64 MiB estimated UTF-16 payload and 600 frames. This estimate
is a payload guard, **not** a bound on all Node/browser/protocol memory. Final
frame decoding, PNG writes, final canvas readback and whole-studio screenshots
occur after stroke timing. Browser-side PNG encoding and transport remain active
during timing and may perturb scheduling. There is no passive-observer claim.
Protocol backpressure/internal sampling losses are not measurable from ACKs;
only received frames and explicit local drops are counted.

[Official Page protocol source](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl)
describes experimental screencast frames, ACKs, geometry and frame-swap timestamp
fields. The installed Playwright protocol types also define the event, metadata
and commands; their metadata excerpt is retained. The actual binary returns
both epoch `timestamp` and `monotonicTimestamp`, not just about:blank capability.
An empty `Tracing.getCategories` enumeration does not establish that tracing is
unavailable; tracing was unnecessary for this bounded pixel-stream experiment.

For each lane, browser `performance.now`, `performance.timeOrigin`, `Date.now`,
viewport and DPR are read inside host monotonic before/after brackets before and
after the stream. Metadata epoch seconds are mapped by
`timestamp * 1000 - performance.timeOrigin`; host receipts are separately mapped
using the intersection of bracketed browser/host offsets. All raw clocks remain
in each `results.json`; receipt-minus-frame intervals include acquisition,
encoding and transport. Neither host receipt nor encode completion is scanout.
The optional monotonic timestamp remains raw, rather than assigning it a guessed
origin. Epoch chronology is checked against origin/start and receipt upper
bounds. The two-bracket offset intersection assumes stable relative clocks
over this short stroke; it is not a hardware clock calibration.

Actual decoded screencast frames are 1366×1024 at scale1 despite page DPR2.
Metadata reports device1366×1024, pageScaleFactor1, zero top/scroll offsets.
The observer rejects unsupported geometry and nonuniform scale, then maps
measured CSS paper coordinates into the actual decoded image dimensions.
It uses the existing monotonic `inkExtent`/`staleBound`: rightmost dark ink in
the blank stroke strip is a conservative spatial progress bound, with brush
radius intentionally favoring green. Only actual deliveries before the mapped
frame timestamp minus2ms enter the bound. That 2ms exclusion is an experimental
margin, not a proven maximum engine clock error. Extents and raw clocks remain
available for reanalysis. No numerical stale bound is calibrated as photon or
physical Pencil latency.

The existing 150ms fault copies/restores display snapshots and schedules delayed
updates only during synthetic `window.sharedMinEvent` pointermove dispatch;
release renders synchronously. It changes scheduling and is not an actual150ms
latency calibration. Trusted CDP lanes have **no fault**: the synthetic seam
would not fault that input path. Their requested240/s is compared with actual
trusted deliveries, never send counts.

## Reproduction and retained evidence

`artifacts/t3/ink-frame-stream/source/` contains the exact experimental scripts;
`experiment.patch` records the harness seam. Each results file records revision,
helper/harness SHA-256, binary version, options, geometry, complete chronological
input and consumption, actual source-owner states, metadata and final RGBA.
`receipts.json` checks identities and reports every rejected gate. Logs retain
exit codes; dropped/invalid observations are not excluded from reporting.

Temporary existing dependency and original-media symlinks are read-only inputs.
Vite serves source with per-lane private artifact cache; **no build was needed**,
so no 1.8GB media copy or built-runtime claim. Ports4561 (used) and4562 (reserved)
are private. The existing build-media server was not needed. No install/download,
original software execution, EULA, baseline change, secret, version bump, push,
deploy, broad tests or release gates.

The archived matrix is invoked with:

```sh
flock /var/tmp/kidpix-ui-validation.lock bash artifacts/t3/ink-frame-stream/matrix.sh
# The matrix sets INK_STREAM_LOCKED=1 for its sequential owned runners.
# Every standalone runner acquires the same lock itself.
# Runner example, with the archived experimental scripts restored locally:
bash scripts/ink-frame-stream-run.sh fresh-full-green full 1 0
node scripts/ink-frame-stream-compare.mjs
```

The lock covers all browser/container lifetime, including setup and final
captures. Lock wait is outside stroke timing. Existing pinned image, no pull:
`mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`.
Container source/dependencies/media are read-only; only own artifacts writable;
UID/GID preserved, host network, capabilities all dropped, shm512m. Only owned
runtimes are stopped. Temporary links are removed at handoff; parent dirty
SERVER_HANDOFF, original media/history, deferred Clipboard80a0661 and other
worktrees remain untouched.

Focused existing extent/fault, decoded-pixel and studio-control Node checks
pass18/18; experimental modules pass syntax checks. These do not certify the
stream measurement. Native references remain **0/17**. Actual iPad Pencil
latency, foreground-visible idle failure and audible feel remain unverified;
enlarged vacuum stays disabled. No overall release approval.

## Raw bounded controls

All rows retain240 moves and241 consumed points. Rates below are observations,
not population estimates; two green/off repeats and two synthetic faults only.

| Lane | Delivered events/s | Callbacks/s | Received / retained / eligible | Local drops | Max sampled stale bound |
| --- | ---: | ---: | ---: | ---: | ---: |
| full-off-a | 60.04 | 60.02 | — / — / 0 | — | unobserved |
| full-green-a | 60.00 | 46.04 | 185 / 26 / 19 | 159 | 0.0 ms |
| full-red-a | 60.06 | 44.48 | 178 / 26 / 19 | 152 | 149.3 ms |
| full-red-b | 60.00 | 43.19 | 173 / 26 / 20 | 147 | 154.1 ms |
| full-green-b | 60.00 | 44.72 | 178 / 26 / 19 | 152 | 0.0 ms |
| full-off-b | 60.01 | 60.05 | — / — / 0 | — | unobserved |
| minimal-off-a | 60.00 | 58.63 | — / — / 0 | — | unobserved |
| minimal-green-a | 60.01 | 33.51 | 134 / 134 / 129 | 0 | 33.5 ms |
| minimal-green-b | 60.01 | 33.25 | 134 / 134 / 129 | 0 | 53.6 ms |
| minimal-off-b | 60.00 | 58.13 | — / — / 0 | — | unobserved |
| trusted-off | 60.01 | 60.00 | — / — / 0 | — | unobserved |
| trusted-on | 44.08 | 43.93 | 240 / 26 / 18 | 214 | 0.0 ms |

Every full stream lane exits1 for local-drop validity failure. Fault lanes also
fail the75ms stale-bound gate. Minimal green lanes exit0 but incur roughly43%
callback loss and have no matched minimal fault controls; they do not validate a
full-studio oracle. Full retained observations end3.41–3.47s before stroke end;
trusted-on ends4.87s early. A minimum capture count alone would conceal this
missing coverage. The guard failure prevents that false pass. Maximum gaps
between retained eligible frames are33.34ms, which does not describe the dropped
tail. No invalid decoded frames or ACK errors occurred.

Trusted Chromium requested240/s actually delivers60.01/s off and44.08/s on,
with240 trusted moves and241 consumed points in both. The pre-existing generic
achievedEventHz field is null in instrumentation-off trusted lanes; receipts
derive delivery directly from raw.inkTrustedDelivery timestamps, not sends.
No200/s delivery gate was enabled; these are explicitly failed240/s capability
claims regardless of process exit.

All12 final decoded ink hashes match:
`154b3ea3991bb1a7092e76403e19f9316ec7b1bb99d64f8101278345666f0f59`.
Complete full-studio final RGBA also matches across all full lanes. Pressure and
consumption are compared exactly per driver, preserving browser pressure
quantization rather than inventing cross-driver exactness.

Retained eligible frame timestamp-to-receipt brackets span approximately35–70ms
in full synthetic lanes,19–42ms in minimal lanes and38–61ms trusted-on. These
are pipeline/transport intervals, not photon latency. Browser/host bracket widths
and epoch/monotonic raw pairs remain in results for clock uncertainty review.
