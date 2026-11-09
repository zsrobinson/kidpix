# Tablet and pen input

Modern iPad Safari is the target baseline. Drawing uses Pointer Events and works
with pen, mouse or finger; pressure is optional. The browser build includes no
Pencil-specific hardware detection or accessory settings.

## Gesture ownership

The first active drawing, object-drag, recorded-path or Stamp Editor contact owns
its gesture. Additional contacts cannot replace it or activate chrome while it is
held. Rejected contacts remain ignored through their terminal click/double-click,
including when the first contact releases earlier. A new accepted contact can
reuse an ended pointer ID. Keyboard and assistive activation remain available;
finger drawing works when idle.

Up, matching cancellation/capture loss, blur, pagehide, hidden document, resize
and component teardown release ownership. Foreign terminal events do not end the
owner. Canvas path routing releases its actual capture separately from scene
ownership. Discrete actions and every pending polygon/curve contact release their physical
contact even though they retain no drawing gesture; pending shapes do not own
the document between contacts.

Interrupted procedural paint previews roll back. Delivered native tracked ink
and moving-paint ink keep their existing single-checkpoint commit policy. Scene
drags commit delivered movement once. Native Stamp Editor pencil cancellation
rolls back its active checkpoint; its capture-loss/inactivity policy and fallback
editor termination retain delivered pixels. These differences preserve existing
history behavior rather than changing every tool to one interruption policy.

## Freehand pressure

Explicit pen pressure changes freehand Pencil and the native Chalk/Crayon dabs.
The initial response is `clamp(2 × pressure, 0.25, 1.5)`; neutral pressure0.5 gives
factor1. Missing or invalid pressure stays neutral. A zero-pressure release uses
the last positive pressure so the final segment does not collapse.

Mouse and finger use their existing drawing path. Marker, shapes, fills, stamps,
selection, timed spray and sound tools retain their behavior. Native mask/texture
calculations and base spacing stay intact; pressure changes rendered dab scale.
Coalesced samples are consumed chronologically once, with the dispatched parent
used to validate pointer ownership. Missing/empty coalescing uses the parent.
Pressure interpolates across emitted dabs without changing their base scheduler.
This is a modern input adaptation, not recovered original pressure behavior.

## Verification boundary

Chromium automation covers ownership, real browser pen/touch delivery, rejected
double-taps, physical capture cleanup, interruptions, undo/redo, source-renderer
pressure response and exact neutral/mouse pixels. Module fixtures use synthetic
contacts where documented. Built/public cases exercise the studio entry point.
Additional Chromium checks verify rendered pen/finger pixels at DPR2 in landscape,
portrait and a split-sized viewport, plus recovery after a delivered resize.
No browser emulation establishes actual iPad feel, OS palm rejection or latency.

Actual iPad acceptance still needs slow/fast strokes, light/heavy pressure where
supported, incidental touch over paper and chrome, pen-before-finger release,
rapid recontact, off-canvas release, rotation/split view/zoom, app switching and
lock/return, text keyboard/Scribble, editor reopen and mixed undo/redo. Record the
device, iPadOS/Safari and Pencil details with those results. WebKit checks also pass in the pinned Playwright container described below.
Original-runtime captures remain0/17.

## Run the WebKit lane

`npm run test:browser:webkit` starts a private development server on4176 and runs
shared input, renderer and editor cases in WebKit. It requires the matching
Playwright WebKit download and OS libraries. Chromium CDP delivery cases stay in
the Chromium lane; the studio pen-pressure case explicitly skips in WebKit.
Neither lane creates native-original references or substitutes for a real iPad.

On this Ubuntu server, the additional host libraries were unnecessary because
the [official Playwright image](https://playwright.dev/docs/docker) supplies them.
The tested image matches Playwright1.65.0 and is pinned by digest. Run the host
server in one terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 4176 --strictPort
```

From the repository root in another terminal:

```sh
mkdir -p artifacts/browser-webkit
docker run --rm --init --network host --cap-drop ALL --shm-size 512m \
  --user "$(id -u):$(id -g)" --workdir /work \
  --mount "type=bind,src=$PWD,dst=/work,readonly" \
  --mount "type=bind,src=$PWD/artifacts/browser-webkit,dst=/work/artifacts/browser-webkit" \
  --env XDG_CACHE_HOME=/tmp/kidpix-webkit-cache \
  --env KIDPIX_WEBKIT_EXTERNAL_SERVER=1 \
  mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
  node node_modules/@playwright/test/cli.js test -c playwright.webkit.config.js
```

Only test outputs are writable inside the mounted project. Host networking in
this command is the tested Linux setup. Stop the development server afterward.
When updating Playwright, update and verify the matching image/digest too.
