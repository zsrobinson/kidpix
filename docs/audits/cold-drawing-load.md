# Drawing while UI art loads

2026-11-10; exact runtime base fd216d7373f17d29eb9ee9250192609da064ab18
(0.16.0). No runtime candidate retained. Parent owns integration and release.

## Findings

UI-only readiness did not truncate a held procedural Pencil stroke. Delayed
ui.json, trays.json, and Drawing/secondary art all completed during held input
on the actual studio. Each lane consumed the same 240 chronological moves plus
the existing release sample, retained canvas identity and first-pointer capture,
rejected competing touch, preserved focused title input, produced identical
settled decoded ink within its engine, and had exactly one Undo/working Redo.
There was no held-contact cancel call. UI-only callbacks passed unchanged
Pencil options through showTray/syncTool; setOptions already guards unchanged
tool/variant/mode. No cancellation policy was changed.

Cold resource completion **does** create a reproducible scheduling backlog in
this local workload. This is narrower than a physical Pencil diagnosis. Below
are medians of three per-trial p95 values, never pooled events. Every stroke
contains 240 moves with intended 240 Hz real-clock deadlines and task yields.

| Engine / workload | deadline age p95 ms | delivered events/s range |
|---|---:|---:|
| Chromium158 warm |4.13|237.93–239.38|
| Chromium158 delayed art |105.57|238.57–239.40|
| Chromium158 primary bundle only delayed |61.83|239.33–239.38|
| Chromium158 secondary files only delayed |112.73|238.50–239.35|
| Chromium158 eight concurrent sprite tasks, delayed art |103.53|239.35–239.43|
| WebKit27.2 warm |58.33|235.99–238.10|
| WebKit27.2 delayed art |284.00|216.02–230.11|

Chromium cold dispatch p95 remained 0.2 ms, versus 0.1–0.2 ms warm; handler time
alone does not explain the deadline backlog. WebKit cold dispatch p95 was 6–8 ms,
versus 6–8 ms warm. Chromium callback coverage was 54.67–56.86/s cold versus
59.62–60.47/s warm; WebKit 25.23–29.70/s cold versus 21.70–34.41/s warm.
No claim that callback rate improves or explains the known studio/bare deficit.

Eight-at-a-time loading did not produce a repeatable material reduction in
Chromium cold deadline age: individual p95 values 103.53/74.37/105.97ms versus
97.77/105.57/117.73ms unbounded. Callback counts modestly increased, which is
insufficient to promote a loader change. The experimental limiter remains an
opt-in **test transform**, never production code. Safari treatment benefit,
abort/fairness behavior of that experiment, and peak retained memory were not
established. Do not promote it based on this evidence.

## Actual delivery path

CDP Network was enabled before navigation. The normal primary Drawing path
requested exactly one opaque gzip sprites.bin, HTTP/1.1 locally, no HTTP
Content-Encoding:gzip. Its completed compressed body was 1,299,564 bytes,
SHA-256 df324caa49ff19011f5460661172fd6c9859bcf4c944f9ad33eaa145bd22c906,
matching the imported manifest and local input. Manifest decompressed length
is 7,043,032 bytes. Runtime hash/length/offset/dimension checks remain intact.

The secondary manifest in these inputs has **no bundle**. The active Drawing
secondary owners requested 36 PNG and 36 raw ARGB files, plus their clean art;
this is the actual separate-file path, not assumed primary fanout. There was no
duplicate primary bundle request. Captured primary/raw bodies all reached EOF
and matched local inputs; capture errors and outstanding/failed records are
retained distinctly in JSON. Asset bodies are read through CDP outside the page;
those protocol reads are still measurement overhead. PNG body hashes were not
independently captured (settled PNG/RGBA and decode completion were checked).

In the separate instrumented lane, 270 explicit image.decode calls occur at
startup: 146 blob-backed primary sprites and other button/secondary artwork.
Cold art overlaps 184–270 of these decodes depending on engine/run. Chromium
long-task records mostly show no task above the observer threshold despite
backlog; this does not mean no main-thread work occurred. No JS heap, GPU,
engine-copy or resident-memory benefit was measured. The unchanged nominal
Drawing-owned canvas RGBA accounting remains 272,628 bytes; bundle bytes are
not interchangeable with that number.

No public requests were made. Prior public incomplete transfer evidence remains
unresolved; neither transport repair nor causal attribution to134 request
records is claimed.

## Probe and red/green

scripts/cold-drawing-load.mjs starts only private 4401 dev or 4402 built, with
cache/build/output under artifacts/t3/cold-drawing-load. It runs the actual
application with a common test-only paint API exposure and fixed RNG seed 53.
Only instrumented lanes wrap decode or insert options/cancel/sample/render
counters. Quantitative lanes have no such wrappers. All lanes record real
scheduling/deadline and dispatch timing; counter timing is not pooled with quant.

Fresh contexts and routing disable cache. Controlled responses remain withheld
until sample 80, then proceed through the real local server. Network transfer,
decode and ready callbacks run while remaining input continues. All moves yield
to a distinct MessageChannel task; no frozen clock, skipped samples or prediction.
Synthetic untrusted PointerEvents use a test-only capture shim, not hardware
capture. Competing touch is dispatched every 20 moves. Geometry, input coordinates
and pressure, consumed point traces (instrumented), PNG bytes and decoded hashes
are retained. Pixel reads, PNG decoding, Undo and Redo happen after timing except
the explicitly instrumented first-down ink check. First-delivered-ink is a
synchronous application proxy, never first visible photon. Warm/cold first-down
ink already exists before the controlled mid-stroke completion burst.

Final functional evidence covers 16 actual-studio scenarios: four each in
Chromium dev/built and WebKit dev/built. functional-invariants.json also checks
all saved consumed point traces offline. All pass 241 strokeTo calls, exact
pressure/path, same per-engine decoded RGBA, no readiness cancellation, readiness
inside the stroke, focus/identity/owner, competing touch and single Undo/Redo.
Chromium ink hash 68c535f7f0bb4a6303f655db9770c27f459e581dadb1ae2d00c34fbb270163eb;
WebKit 33cfa2dd3a0129e82cc4a8284355d0c08192b7676d1d9781a473b5e0afecbad0.
Engine differences are retained, not treated as cross-engine pixel equality.

The negative control actually changes tool at sample 80 through paint.setOptions.
The final negative run exits 1 at `all moves plus release consumed` (97 vs 241),
while final-green passes all four scenarios. This shows the loop detects lost
continuity on the real readiness path; no actual readiness cancellation bug was
found or fixed. Existing intentional tool changes remain effective.

```sh
INSTRUMENT=1 COLD_OUT=artifacts/t3/cold-drawing-load/final-green \
 node scripts/cold-drawing-load.mjs
INSTRUMENT=1 NEGATIVE=1 SCENARIOS=warm,art \
 COLD_OUT=artifacts/t3/cold-drawing-load/final-negative \
 node scripts/cold-drawing-load.mjs # expected exit 1
SCENARIOS=warm,art TRIALS=3 COLD_OUT=artifacts/t3/cold-drawing-load/quant \
 node scripts/cold-drawing-load.mjs
# Same control with SCENARIOS=warm,primary,secondary for split workload;
# DECODE_LIMIT=8 is the rejected test-only limiter.
SCENARIOS=warm,art TRIALS=3 LABEL=webkit-quant \
 bash scripts/cold-drawing-load-webkit.sh
BUILT=1 INSTRUMENT=1 COLD_OUT=artifacts/t3/cold-drawing-load/built-chromium \
 node scripts/cold-drawing-load.mjs
BUILT=1 INSTRUMENT=1 LABEL=built-webkit \
 bash scripts/cold-drawing-load-webkit.sh
```

Raw results, source harness hashes, event arrays, bodies/headers, decoded snapshots
and logs remain under artifacts/t3/cold-drawing-load. Early instrument runs whose
body filter missed version query strings remain separate from instrument-final.
The first WebKit launch failed before navigation because the isolated container
could not resolve worktree Git metadata; REVISION is now explicitly passed.
The earlier negative applied the tool mutation even to warm; final-negative
corrects this and keeps a passing warm control. These are not accepted quant lanes.

WebKit uses the already installed pinned Playwright image, with read-only source,
dependency and media mounts, no pull. Host Chromium158 uses existing dependencies.
Host Node 24.22.2 and container Node 26.13.0 are not pooled across engine results.
All owned browsers, containers and servers ended; temporary input links removed.
No source runtime/package/media/baseline changes, upload, installation, version
bump or publication. Parent root handoff and isolated Clipboard work untouched.

## Limits

Only default procedural Pencil was exercised by this minimized cold loop. It
cannot establish that every native drawing tool behaves identically under load.
No runtime candidate exists, so full asset-corruption/lifecycle/source-pixel and
17 static release gates were not repeated. Existing audio recovery, hover,
bounded animation stores, native brush samples and source timing are unchanged.
No immutable-copy or shared-cache optimization was attempted without demonstrated
duplication/memory benefit. Physical iPad Pencil latency, the foreground-visible
idle failure and audible behavior remain unverified; original native references
remain 0/17. Cold work is a measured contributor to this synthetic deadline
backlog, not the established cause of all reported hardware drawing lag.
