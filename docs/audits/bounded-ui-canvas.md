# Bounded motion-canvas experiment

Prepared source is cdea196, whose runtime matches live0.14 (8cce3df).
This is a desktop rendering experiment, not physical iPad latency or evidence
about the reported Safari foreground animation loss. Version remains0.14.

## Reusable controls

The corrected shared replay now supports `MOTION_REVISION`: only
`native-tool-motion.js` and `native-drawing-motion.js` are served from that Git
revision, leaving the replay, studio and assets unchanged. Source hashes identify
this control. The WebKit wrapper mounts the Git common directory read-only when
needed (including linked worktrees). `PERF_ROOT` and `PORT` isolate outputs and
servers. No install, image pull, media import or original reference creation occurs.

`motionCanvases` records backing dimensions and nominal RGBA bytes, not actual
GPU/engine allocation. `MAX_MOTION_RGBA_BYTES` is an optional shared work/storage
bound. Synthetic delivered events/samples and dispatch wall times remain available
with canvas/event probes disabled. Dispatch timing includes synthetic dispatch
machinery and synchronous application listeners; it is not hardware event latency.
RAF coverage includes callback counts, observed gaps and censored endpoints.

```sh
PERF_ROOT=artifacts/t3/bounded-ui-canvas PORT=4271 INSTRUMENT=0 \
 DRIVERS=inpage TOOLS=pencil TRIALS=3 PATTERNS=60x1,60x4,240x1 \
 MAX_FRAME_P95=25 bash scripts/shared-pen-perf-webkit.sh bounded
# Add MOTION_REVISION=cdea196 for the original source control.
# MAX_MOTION_RGBA_BYTES=300000 tests the allocation bound independently of cadence.
```

Raw commands, private runner/configs, source-control exports, failed diagnostics
and full JSON results are retained in this checkout under
`artifacts/t3/bounded-ui-canvas/`. They are not release reports or native references.
The initial prototype and repeated controls use the same corrected replay,
seed53,240 samples, size16,1366x1024/DPR2 and pinned WebKit27.2 image. No test
pretends that a requested event rate was achieved without measuring delivery.
