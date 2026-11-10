import { playUiAudio, observeUiAudio } from './ui-audio.js';
import { createDrawingMotionController, loadDrawingMotionAssets, paintDrawingMotionFrame } from './native-drawing-motion.js';
import { regionClipPath } from './native-control-regions.js';
import { place } from './trays.js';

export function toolRegionContains(region, x, y) {
  return region?.status === 'exact' && region.type === 'rectangle-union'
    && region.rectsLTRB.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);
}

// All source states, not just the current pose or input region. Two native
// pixels of transparent fringe keep interpolation away from the backing edge.
export function motionCanvasBounds(manifest) {
  const parts = Object.values(manifest.scripts).flatMap(script => script.frames.flatMap(frame => frame.parts));
  const rectangles = parts.map(part => [part.x, part.y,
    manifest.sprites[String(part.sprite)].width, manifest.sprites[String(part.sprite)].height]);
  rectangles.push(...(manifest.restorationRects ?? []));
  if (!rectangles.length) return [0, 0, 1024, 768];
  const left = Math.max(0, Math.floor(Math.min(...rectangles.map(r => r[0]))) - 2);
  const top = Math.max(0, Math.floor(Math.min(...rectangles.map(r => r[1]))) - 2);
  const right = Math.min(1024, Math.ceil(Math.max(...rectangles.map(r => r[0] + r[2]))) + 2);
  const bottom = Math.min(768, Math.ceil(Math.max(...rectangles.map(r => r[1] + r[3]))) + 2);
  return [left, top, Math.max(1, right - left), Math.max(1, bottom - top)];
}

// One owner survives option/color/size renders. Only an actual tray change
// destroys its source streams, pending loads and audio handles.
export function createNativeToolMotion({ stage, layer, controls, resolve, onReady, onActivate,
  fetch: fetchAsset = globalThis.fetch,
  manifestPath = 'tool-motion/manifest.json',
  canvasAttribute = 'nativeToolMotion',
  manifestFor = (data, current) => data.trays?.[current.tray],
  backdropFor: customBackdropFor,
  loadAssets = loadDrawingMotionAssets,
  createController = createDrawingMotionController,
  actionForButton = button => `tool:${button.name}`,
  authoritativeFor, refreshCurrent,
  targetFor = () => null,
  gestureTargetFor = targetFor,
  supported = tray => ['draw', 'paint', 'bucket', 'mixer', 'eraser', 'grab'].includes(tray),
}) {
  const view = stage.ownerDocument.defaultView;
  const listeners = new view.AbortController();
  const options = { signal: listeners.signal };
  const loaded = new Map();
  const images = new Map();
  let index;
  let owner;
  let current;
  let generation = 0;
  let pending;
  let abort;
  let raf;
  let tracking = null;
  let trackingInside = false;
  let pointerId = null;
  let pointerCaptureTarget;
  let soundActive = true;
  let keyboardIndex = null;
  let cancelledKeyboardClick = false;
  let releaseIndex;
  let focusAction;
  let rendering = false;
  let targetIdentity;
  let gestureIdentity;
  let authoritative = [];

  function syncAuthoritative(force = false) {
    if (!owner || !authoritativeFor) return;
    const next = authoritativeFor(owner.manifest, current);
    next.forEach((value, i) => {
      if (force || JSON.stringify(value) !== JSON.stringify(authoritative[i])) owner.controller.setAuthoritativeState(i, value);
    });
    authoritative = next;
  }
  function normalizeProposal(proposal, index) {
    return proposal === null ? null : typeof proposal === 'object' ? proposal : { index };
  }
  function proposalIndex(proposal) {
    if (proposal === null) return null;
    return typeof proposal === 'object' ? proposal.index : proposal;
  }
  function activateProposal(proposal) {
    if (proposal === null) return;
    const i = proposalIndex(proposal);
    const button = owner?.manifest.buttons[i];
    if (button) onActivate(proposal.binding ?? actionForButton(button));
    refreshState();
    syncAuthoritative(true);
  }

  async function image(path) {
    if (images.has(path)) return images.get(path);
    const result = new view.Image();
    result.src = resolve(path);
    await result.decode();
    images.set(path, result);
    return result;
  }

  function playSound(cue) {
    if (!cue.src || !soundActive) return null;
    const audio = new view.Audio(resolve(cue.src));
    audio.volume = .65;
    let complete = false;
    playUiAudio(audio);
    const release = observeUiAudio(audio, () => { complete = true; });
    return { stop() { release(); audio.pause(); complete = true; }, isComplete: () => complete || audio.ended };
  }

  function render(snapshot) {
    if (!owner?.backdrop) return;
    const { canvas, context, manifest, assets, backdrop } = owner;
    context.clearRect(...owner.viewport);
    // Restore authored pixels before every destination-dependent composite.
    // Restrict the opaque restoration to the actor area; options stay live.
    context.save();
    context.beginPath();
    for (const rect of manifest.restorationRects ?? [owner.bounds]) context.rect(...rect);
    context.clip();
    context.drawImage(owner.chrome, 0, 0);
    context.drawImage(backdrop.image, ...backdrop.rect);
    context.restore();
    const color = current.color.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
    for (const item of snapshot) paintDrawingMotionFrame(context, manifest, item.frame, assets, color, { clipRect: item.clipRect, origin: owner.viewport.slice(0, 2) });
    canvas.dataset.motionSnapshot = JSON.stringify(snapshot.map(({ name, script, frameIndex, state, auxiliary, finished, disabled }) =>
      ({ name, script, frameIndex, state, auxiliary, finished, disabled })));
  }

  function reset() {
    generation++;
    abort?.abort(); abort = null; pending = null;
    view.cancelAnimationFrame(raf);
    owner?.controller.dispose(); owner?.canvas.remove(); owner = null;
    tracking = null; authoritative = []; targetIdentity = gestureIdentity = undefined;
    if (pointerId !== null && pointerCaptureTarget?.hasPointerCapture(pointerId)) pointerCaptureTarget.releasePointerCapture(pointerId); pointerId = null; pointerCaptureTarget = null; keyboardIndex = null; releaseIndex = undefined;
    soundActive = true; focusAction = null; cancelledKeyboardClick = false;
    layer.hidden = true;
  }

  function changedGesture() {
    const index = tracking ?? keyboardIndex;
    return index !== null && owner && gestureTargetFor(current, owner.manifest.buttons[index]) !== gestureIdentity;
  }

  function refreshState() {
    if (refreshCurrent) {
      const next = { ...current, ...refreshCurrent() };
      const nextTarget = targetFor(next);
      const changedTarget = nextTarget !== targetIdentity;
      targetIdentity = nextTarget;
      current = next;
      syncAuthoritative();
      if (changedTarget || changedGesture()) cancel();
    }
  }

  function animate(time) {
    if (!owner) return;
    refreshState();
    owner.controller.step(time);
    raf = view.requestAnimationFrame(animate);
  }

  function backdropFor(data) {
    if (customBackdropFor) return customBackdropFor(data, current);
    if (current.tray === 'draw') return { path: current.nativeUi.drawingOptions['tray-draw'].images[0],
      rect: ['x', 'y', 'w', 'h'].map(key => current.nativeUi.drawingOptions['tray-draw'][key]) };
    const backdrop = data.backdrops?.[current.art];
    const page = backdrop?.pages?.[current.page];
    return page && { path: page.image, rect: backdrop.rect };
  }

  async function prepare(token, signal) {
    try {
      if (!index) {
        const response = await fetchAsset(resolve(manifestPath), { signal });
        if (!response.ok) throw new Error(`Tool motion index: ${response.status}`);
        const result = await response.json();
        signal.throwIfAborted();
        index = result;
      }
      if (token !== generation) return;
      const tray = current.tray;
      const manifest = manifestFor(index, current);
      if (!manifest) return;
      const requestedBackdrop = backdropFor(index);
      if (!requestedBackdrop) return; // Keep static art until the matching clean page exists.
      const key = `${current.art}:${current.page}`;
      const [assets, chrome, base] = await Promise.all([
        loaded.get(tray) ?? loadAssets(manifest, { resolve, fetch: fetchAsset, signal, createImage: () => new view.Image() }),
        image('paint-empty.png'), image(requestedBackdrop.path),
      ]);
      if (token !== generation || signal.aborted) return;
      loaded.set(tray, assets);
      // A same-owner option update during decoding may request a different page.
      if (key !== `${current.art}:${current.page}`) {
        view.queueMicrotask(() => update(current));
        return;
      }
      if (!owner) {
        const canvas = stage.ownerDocument.createElement('canvas');
        const viewport = motionCanvasBounds(manifest);
        canvas.width = viewport[2]; canvas.height = viewport[3];
        canvas.style.cssText = place(...viewport);
        canvas.dataset[canvasAttribute] = tray;
        canvas.setAttribute('aria-hidden', 'true');
        const parts = Object.values(manifest.scripts).flatMap(script => script.frames.flatMap(frame => frame.parts));
        const left = Math.min(...parts.map(part => part.x));
        const top = Math.min(...parts.map(part => part.y));
        const right = Math.max(...parts.map(part => part.x + manifest.sprites[String(part.sprite)].width));
        const bottom = Math.max(...parts.map(part => part.y + manifest.sprites[String(part.sprite)].height));
        owner = { tray, manifest, assets, canvas, chrome, viewport, context: canvas.getContext('2d', { willReadFrequently: true }),
          bounds: [left, top, right - left, bottom - top] };
        owner.context.translate(-viewport[0], -viewport[1]);
        layer.replaceChildren(canvas);
        owner.controller = createController(manifest, {
          selected: selectedIndex(manifest), authoritative: authoritativeFor?.(manifest, current), render, playSound, now: () => view.performance.now(),
        });
        authoritative = authoritativeFor?.(manifest, current) ?? [];
        raf = view.requestAnimationFrame(animate);
      }
      owner.backdrop = { key, image: base, rect: requestedBackdrop.rect, path: requestedBackdrop.path };
      owner.controller.repaint();
      onReady();
    } catch (error) {
      // Failure leaves usable static controls. A later update/entry retries.
      if (!signal.aborted) layer.dataset.motionError = error.message;
    } finally {
      if (token === generation) pending = null;
    }
  }

  function selectedIndex(manifest) {
    const selected = manifest.buttons.findIndex(button => button.name === current.selected);
    return selected < 0 ? null : selected;
  }

  function bind() {
    for (const [i, button] of owner.manifest.buttons.entries()) {
      const control = [...controls.querySelectorAll('[data-action]')].find(control => control.dataset.action === actionForButton(button));
      if (!control) continue;
      const clip = regionClipPath(button.region);
      if (!clip) continue;
      control.style.cssText = place(...button.region.boundsXYWH);
      control.style.clipPath = clip;
      control.classList.add('native-control', 'native-region');
      control.dataset.nativeMotionIndex = String(i);
      if (focusAction === control.dataset.action) { control.focus({ preventScroll: true }); focusAction = null; }
    }
  }

  function update(next) {
    if (current?.tray !== next.tray) reset();
    const nextTarget = targetFor(next);
    const changedTarget = targetIdentity !== undefined && targetIdentity !== nextTarget;
    targetIdentity = nextTarget;
    current = next;
    const key = `${next.art}:${next.page}`;
    const ready = owner?.tray === next.tray && owner.backdrop?.key === key;
    layer.hidden = !ready;
    if (owner) {
      syncAuthoritative();
      if (changedTarget || changedGesture()) cancel();
      const selected = authoritativeFor ? null : selectedIndex(owner.manifest);
      if (selected !== null && owner.controller.snapshot()[selected].state !== 3) owner.controller.dispatch(selected, 0x2006);
      if (ready) { bind(); owner.controller.repaint(); }
    }
    if (!ready && !pending && next.nativeUi && supported(next.tray)) {
      abort = new view.AbortController();
      delete layer.dataset.motionError;
      const token = generation;
      const signal = abort.signal;
      pending = Promise.resolve().then(() => prepare(token, signal));
    }
    rendering = false;
    return Boolean(ready);
  }

  function target(event) {
    if (owner) refreshState();
    const control = event.target.closest?.('[data-native-motion-index]');
    const index = Number(control?.dataset.nativeMotionIndex);
    return control && !layer.hidden && owner?.manifest.buttons[index]
      && actionForButton(owner.manifest.buttons[index]) === control.dataset.action ? { control, index } : null;
  }
  function contains(i, event) {
    const rect = stage.getBoundingClientRect();
    return toolRegionContains(owner.manifest.buttons[i].region,
      (event.clientX - rect.left) * 1024 / rect.width, (event.clientY - rect.top) * 768 / rect.height);
  }
  function cancel() {
    if (keyboardIndex !== null) cancelledKeyboardClick = true;
    tracking = null; releaseIndex = undefined;
    gestureIdentity = undefined;
    owner?.controller.cancel();
    soundActive = false;
    if (pointerId !== null && pointerCaptureTarget?.hasPointerCapture(pointerId)) pointerCaptureTarget.releasePointerCapture(pointerId);
    keyboardIndex = null;
    pointerId = null;
  }

  controls.addEventListener('pointerover', event => {
    const hit = target(event);
    if (hit && tracking === null && !hit.control.contains(event.relatedTarget)) { soundActive = true; owner.controller.enter(hit.index); }
    else if ((!owner || layer.hidden) && tracking === null && !pending && current) update(current);
  }, options);
  controls.addEventListener('pointerout', event => {
    const hit = target(event);
    if (hit && tracking === null && !hit.control.contains(event.relatedTarget)) owner.controller.leave(hit.index);
  }, options);
  controls.addEventListener('pointerdown', event => {
    releaseIndex = undefined;
    const hit = target(event);
    if (!hit || event.button !== 0) return;
    releaseIndex = undefined; soundActive = true; cancelledKeyboardClick = false;
    if (!owner.controller.press(hit.index)) return;
    gestureIdentity = gestureTargetFor(current, owner.manifest.buttons[hit.index]);
    tracking = hit.index; trackingInside = true; pointerId = event.pointerId;
    pointerCaptureTarget = hit.control;
    pointerCaptureTarget.setPointerCapture(event.pointerId);
  }, options);
  controls.addEventListener('pointermove', event => {
    if (tracking === null || event.pointerId !== pointerId) return;
    const inside = contains(tracking, event);
    if (inside !== trackingInside) {
      owner.controller[inside ? 'enter' : 'leave'](tracking);
      trackingInside = inside;
    }
  }, options);
  controls.addEventListener('pointerup', event => {
    // Selection/capabilities may have changed in the same task as this release,
    // before the next RAF. Refresh can cancel the held proposal and capture.
    if (owner) refreshState();
    if (!owner || tracking === null || event.pointerId !== pointerId) return;
    const proposal = normalizeProposal(owner.controller.release(contains(tracking, event)), tracking);
    tracking = null; pointerId = null;
    // Commit here: a same-tray render may have removed the original pointerdown
    // element, in which case browsers omit the compatibility click entirely.
    releaseIndex = null;
    activateProposal(proposal);
  }, options);
  controls.addEventListener('pointercancel', event => {
    if (event.pointerId === pointerId) cancel();
  }, options);
  controls.addEventListener('lostpointercapture', event => {
    if (tracking !== null && event.target === pointerCaptureTarget) cancel();
  }, options);
  controls.addEventListener('keydown', event => {
    const hit = target(event);
    if (hit && event.repeat && ['Enter', ' '].includes(event.key)) { event.preventDefault(); return; }
    if (hit) {
      soundActive = true;
      if (!event.repeat && ['Enter', ' '].includes(event.key)) cancelledKeyboardClick = false;
    }
    if (hit && !event.repeat && ['Enter', ' '].includes(event.key) && owner.controller.press(hit.index)) {
      keyboardIndex = hit.index;
      gestureIdentity = gestureTargetFor(current, owner.manifest.buttons[hit.index]);
    }
    if (event.key === 'Escape') cancel();
  }, options);
  controls.addEventListener('keyup', event => {
    if (owner) refreshState();
    const hit = target(event);
    if (event.key === ' ' && hit && cancelledKeyboardClick) { event.preventDefault(); return; }
    if (event.key !== ' ' || keyboardIndex === null || hit?.index !== keyboardIndex) return;
    event.preventDefault();
    const index = keyboardIndex;
    keyboardIndex = null;
    activateProposal(normalizeProposal(owner.controller.release(true), index));
  }, options);
  controls.addEventListener('click', event => {
    if (owner) refreshState();
    const hit = target(event);
    if (!hit && (releaseIndex === undefined || event.detail === 0)) return;
    event.preventDefault(); event.stopPropagation();
    let index = releaseIndex;
    releaseIndex = undefined;
    if (event.detail === 0 && hit) {
      if (cancelledKeyboardClick) return;
      soundActive = true;
      // Enter's native click releases its own accepted key press. A synthetic
      // click may start a new press, but can never release another held actor.
      if (keyboardIndex === hit.index) index = normalizeProposal(owner.controller.release(true), hit.index);
      else if (tracking === null && keyboardIndex === null && owner.controller.press(hit.index)) index = normalizeProposal(owner.controller.release(true), hit.index);
      else index = null;
    }
    if (index !== null && index !== undefined) {
      keyboardIndex = null;
      activateProposal(index);
    }
  }, { ...options, capture: true });
  controls.addEventListener('focusout', () => { if (keyboardIndex !== null && !rendering) cancel(); }, options);
  view.addEventListener('blur', cancel, options);
  view.addEventListener('pagehide', cancel, options);
  stage.ownerDocument.addEventListener('visibilitychange', () => { if (stage.ownerDocument.hidden) cancel(); }, options);
  return { update, beforeRender() {
    rendering = true;
    const focused = stage.ownerDocument.activeElement;
    // Static fallback controls are usable before a new backdrop has decoded;
    // their action identity survives binding even when a motion index does not.
    if (controls.contains(focused) && focused.hasAttribute('data-action')) focusAction = focused.dataset.action;
    if (tracking !== null && pointerId !== null) {
      // Transfer capture before children disappear, preserving tracking through
      // same-owner size/color/option renders without a spurious cancellation.
      pointerCaptureTarget = controls;
      controls.setPointerCapture(pointerId);
    }
  }, get backdropPath() { return owner?.backdrop?.path; }, repaint: () => owner?.controller.repaint(), cancel,
    dispose() { reset(); listeners.abort(); } };
}
