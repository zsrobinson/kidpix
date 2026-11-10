// Source-authored primary mode2 tool controls. DOM ownership lives in native-tool-motion.js.
const f = Math.fround;
const reciprocal255 = f(1 / 255); // i386 float at0x002603a0

/** Native mode9 consumes raw A/shade/tintWeight/coverage, not ordinary RGBA. */
export function blendDrawingMode9(destination, offset, argb, sourceOffset, color) {
  const coverage = argb[sourceOffset + 3];
  if (!coverage) return;
  const weight = argb[sourceOffset + 2];
  const shade = argb[sourceOffset + 1];
  const alpha = f(coverage * reciprocal255);
  for (let channel = 0; channel < 3; channel++) {
    const paint = f(color[channel] * reciprocal255);
    const target = f(f(paint * weight) + shade);
    const delta = f(target - destination[offset + channel]);
    const value = Math.trunc(f(f(delta * alpha) + destination[offset + channel]));
    destination[offset + channel] = Math.min(255, value);
  }
  // Source0x001ca9eb retains destination alpha; source alpha is unused.
}

export function drawingFrameAtTick(clip, tick) {
  let index = 0;
  while (index + 1 < clip.frames.length && clip.frames[index + 1].tick <= tick) index++;
  return index;
}

/** Load before starting the controller; rejection is retryable by calling again.
 * resolve receives manifest paths relative to public/original/ui, including
 * drawing-motion/. Pass the app's original(`ui/${path}`) URL resolver.
 */
export async function loadDrawingMotionAssets(manifest, {
  resolve = path => path, fetch: fetchAsset = globalThis.fetch,
  createImage = () => new globalThis.Image(), signal,
} = {}) {
  const abort = () => signal?.throwIfAborted();
  let bundle;
  if (manifest.bundle?.compression === 'gzip' && typeof globalThis.DecompressionStream === 'function') {
    const response = await fetchAsset(resolve(manifest.bundle.path), { signal });
    if (!response.ok) throw new Error(`Tool motion bundle: ${response.status}`);
    // Some static dev servers mark .gz as HTTP content-encoded. Fetch has
    // already decoded those bytes, so the compressed hash cannot be checked.
    // Keep the separate-file oracle rather than treating it as our opaque bundle.
    const httpDecoded = /gzip/i.test(response.headers?.get('content-encoding') ?? '');
    if (!httpDecoded) {
      const compressed = await response.arrayBuffer();
      if (manifest.bundle.sha256 && globalThis.crypto?.subtle) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', compressed));
        const hash = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== manifest.bundle.sha256) throw new Error('Tool motion bundle hash differs');
      }
      bundle = new Uint8Array(await new Response(new Blob([compressed]).stream()
        .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      if (bundle.length !== manifest.bundle.byteLength) throw new Error('Tool motion bundle length differs');
    }
  }
  abort();
  function payload(sprite, kind) {
    const range = sprite.bundleOffsets?.[kind];
    if (!range || range.length !== 2 || !range.every(Number.isSafeInteger)
      || range[0] < 0 || range[1] <= 0 || range[0] + range[1] > bundle.length) {
      throw new Error(`Tool motion bundle ${kind} range differs`);
    }
    return bundle.slice(range[0], range[0] + range[1]);
  }
  const entries = await Promise.all(Object.entries(manifest.sprites).map(async ([id, sprite]) => {
    const image = createImage();
    let objectUrl;
    try {
      if (bundle) {
        objectUrl = URL.createObjectURL(new Blob([payload(sprite, 'png')], { type: 'image/png' }));
        image.src = objectUrl;
      } else image.src = resolve(sprite.image);
      const [argb] = await Promise.all([
        bundle ? payload(sprite, 'argb') : (async () => {
          const response = await fetchAsset(resolve(sprite.argb), { signal });
          if (!response.ok) throw new Error(`Drawing motion asset ${sprite.argb}: ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        })(), image.decode(),
      ]);
      abort();
      if (argb.length !== sprite.width * sprite.height * 4
        || image.naturalWidth !== sprite.width || image.naturalHeight !== sprite.height) {
        throw new Error(`Drawing motion asset dimensions differ: ${id}`);
      }
      return [id, { image, argb }];
    } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }));
  abort();
  return new Map(entries);
}

/** Paint one source callback into a native1024x768 canvas, after the owner has
 * restored the tray/backdrop. Caller owns clearing, clipping and layer order.
 * Coordinates and bitmap registrations are already resolved by the extractor.
 * A bounded target translates its context by -origin; raw pixel copies ignore
 * that transform and explicitly subtract origin. Default remains origin0.
 */
export function paintDrawingMotionFrame(context, manifest, frame, assets, color, { clipRect = null, origin = [0, 0] } = {}) {
  if (color.length !== 3 || color.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError('Drawing motion color must be three byte values');
  }
  if (manifest.renderMode === 'ordinary' || manifest.renderMode === 'mode9' && frame.parts.length === 1) {
    if (clipRect) { context.save(); context.beginPath(); context.rect(...clipRect); context.clip(); }
    try {
      for (const part of frame.parts) {
        const asset = assets.get(String(part.sprite));
        if (!asset) throw new Error('Tool motion assets must be loaded before painting');
        context.drawImage(asset.image, part.x, part.y);
      }
    } finally { if (clipRect) context.restore(); }
    return;
  }
  if (manifest.renderMode && manifest.renderMode !== 'mode9') {
    throw new Error(`Unsupported tool motion rendering ${manifest.renderMode}`);
  }
  if (frame.parts.length !== 2) throw new Error('Drawing mode9 requires two source parts');
  const [base, tint] = frame.parts;
  const baseInfo = manifest.sprites[String(base.sprite)];
  const tintInfo = manifest.sprites[String(tint.sprite)];
  const baseAsset = assets.get(String(base.sprite));
  const tintAsset = assets.get(String(tint.sprite));
  if (!baseAsset || !tintAsset) throw new Error('Drawing motion assets must be loaded before painting');
  if (clipRect) {
    context.save();
    context.beginPath();
    context.rect(...clipRect);
    context.clip();
    context.drawImage(baseAsset.image, base.x, base.y);
    context.restore();
  } else context.drawImage(baseAsset.image, base.x, base.y);
  // 0x000f742a–0x000f74c3 allocates min(part dimensions), copying the
  // destination at part0's registered origin. Mode9's source is part1.
  // Ordinary rendering restores the target clip at 0x158f79–0x158f92.
  // The custom callback then copies its temporary rectangle at 0xf758f–0xf75af;
  // auxiliary +0xb8 bounds do not clip that mode9 copy.
  const [originX, originY] = origin;
  const left = Math.max(originX, base.x, tint.x);
  const top = Math.max(originY, base.y, tint.y);
  const right = Math.min(originX + context.canvas.width, tint.x + tintInfo.width,
    base.x + Math.min(baseInfo.width, tintInfo.width));
  const bottom = Math.min(originY + context.canvas.height, tint.y + tintInfo.height,
    base.y + Math.min(baseInfo.height, tintInfo.height));
  if (right <= left || bottom <= top) return;
  const pixels = context.getImageData(left - originX, top - originY, right - left, bottom - top);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = ((y - top) * (right - left) + x - left) * 4;
      const source = ((y - tint.y) * tintInfo.width + x - tint.x) * 4;
      blendDrawingMode9(pixels.data, offset, tintAsset.argb, source, color);
    }
  }
  context.putImageData(pixels, left - originX, top - originY);
}

/** State/timing engine with explicit source dispatch and browser pointer helpers.
 * Call step(now) from the owner's RAF. render(snapshot) must restore and repaint
 * all visible controls, using snapshot[].frame/clip. No internal timers.
 * playSound(cue, owner) -> { stop(), isComplete() }; a missing handle means
 * unavailable audio and does not deadlock source completion. Channels1/2 gate
 * end processing. Hooks are synchronous; preload assets before construction.
 */
export function createDrawingMotionController(manifest, {
  render = () => {}, playSound = () => null, now = () => performance.now(),
  selected = 0,
} = {}) {
  if (![2, 3, 4].includes(manifest.buttons.length) || manifest.buttons.some(button => button.mode !== 2)) {
    throw new Error('Tool motion requires a recovered two, three or four control mode2 group');
  }
  return createMode2MotionController(manifest, { render, playSound, now, selected });
}

// Secondary selector groups use exactly the same recovered mode2 state slots
// and scheduler. Their source table determines group size (Drawing has nine).
export function createMode2MotionController(manifest, {
  render = () => {}, playSound = () => null, now = () => performance.now(), selected = null,
} = {}) {
  if (!manifest.buttons.length || manifest.buttons.some(button => button.mode !== 2
    || button.stateScripts[2] || !button.stateScripts[3])) {
    throw new Error('Source selector requires recovered mode2 slots');
  }
  let disposed = false;
  let hovered = null;
  let tracking = null;
  let ownerId = 0;
  const actors = [];

  function makeStream(script, time, kind, button) {
    const clip = manifest.scripts[String(script)];
    if (!clip) throw new Error(`Missing drawing motion program ${script}`);
    const stream = { clip, tick: 0, next: time + clip.tickMs, finished: false,
      soundIndex: 0, handles: new Map(), owner: `drawing-motion:${button}:${kind}:${++ownerId}` };
    emitSounds(stream);
    return stream;
  }

  function emitSounds(stream) {
    while (stream.soundIndex < stream.clip.sounds.length
      && stream.clip.sounds[stream.soundIndex].tick <= stream.tick) {
      const cue = stream.clip.sounds[stream.soundIndex++];
      stream.handles.get(cue.channel)?.stop?.();
      const handle = playSound({ ...cue, src: manifest.sounds?.[String(cue.sound)]?.src }, stream.owner);
      if (handle) stream.handles.set(cue.channel, handle);
    }
  }

  function stopStream(stream) {
    stream?.handles.forEach(handle => handle.stop?.());
    stream?.handles.clear();
  }

  function blockedBySound(stream) {
    return [1, 2].some(channel => {
      const handle = stream.handles.get(channel);
      return handle && !handle.isComplete();
    });
  }

  function advance(stream, time) {
    if (stream.finished || time < stream.next) return false;
    // Native scheduler requests now+interval; a late delivery advances once.
    // It never replays a burst of missed updates or repeated sound cues.
    stream.next = time + stream.clip.tickMs;
    if (stream.tick + 1 >= stream.clip.endCheckTick) {
      if (!blockedBySound(stream)) stream.finished = true;
    } else {
      stream.tick++;
      emitSounds(stream);
    }
    return true;
  }

  function snapshot() {
    return actors.map((actor, index) => {
      const stream = actor.aux ?? actor.base;
      const frameIndex = drawingFrameAtTick(stream.clip, stream.tick);
      return { index, name: manifest.buttons[index].name, state: actor.state,
        disabled: actor.disabled, auxiliary: Boolean(actor.aux), script: stream.clip.script,
        clipRect: actor.aux ? manifest.buttons[index].auxiliaryClipRect : null,
        tick: stream.tick, finished: stream.finished, clip: stream.clip, frameIndex,
        frame: stream.clip.frames[frameIndex] };
    });
  }

  function paint() { if (!disposed) render(snapshot()); }

  function cleanupAux(index, time) {
    const actor = actors[index];
    if (!actor.aux) return;
    stopStream(actor.aux);
    actor.aux = null;
    // Native0x001591c2 unhides the backing without changing its deadline.
    // The next delivered step may therefore be immediately eligible.
  }

  function setState(index, state, time) {
    const actor = actors[index];
    const script = manifest.buttons[index].stateScripts[state];
    if (!script) throw new Error(`Drawing state ${state} has no source program`);
    // 0x00030b25–0x00030b47 preserves shared-script progress, including1→3.
    if (actor.base.clip.script !== script) {
      stopStream(actor.base);
      actor.base = makeStream(script, time, 'state', index);
    }
    actor.state = state;
    actor.disabled = state === 3;
  }

  function dispatchInternal(index, event, time) {
    cleanupAux(index, time);
    if (event === 0x2000 || event === 0x2005) setState(index, 1, time);
    else if ([0x2001, 0x2003, 0x2004, 0x2008].includes(event)) setState(index, 0, time);
    else if ([0x2002, 0x2006, 0x2007].includes(event)) {
      setState(index, 3, time);
      if (event !== 0x2007) {
        for (let peer = 0; peer < actors.length; peer++) {
          if (peer !== index) {
            cleanupAux(peer, time);
            setState(peer, 0, time);
          }
        }
      }
    } else throw new RangeError(`Unsupported drawing state event ${event}`);
  }

  const start = now();
  for (let index = 0; index < manifest.buttons.length; index++) {
    const button = manifest.buttons[index];
    actors.push({ state: 0, disabled: false, aux: null,
      base: makeStream(button.stateScripts[0], start, 'state', index) });
  }
  // RPencilPanel restore sends0x2007 to the selected row (default0).
  if (selected !== null) dispatchInternal(selected, 0x2007, start);
  paint();

  return {
    snapshot,
    step(time = now()) {
      if (disposed) return;
      let changed = false;
      actors.forEach((actor, index) => {
        const stream = actor.aux ?? actor.base;
        changed = advance(stream, time) || changed;
        if (actor.aux?.finished) {
          cleanupAux(index, time);
          changed = true;
        }
      });
      if (changed) paint();
    },
    dispatch(index, event, time = now()) {
      if (disposed) return;
      dispatchInternal(index, event, time);
      paint();
    },
    enter(index, time = now()) {
      if (disposed || hovered === index) return;
      if (hovered !== null) cleanupAux(hovered, time);
      hovered = index;
      if (tracking !== null) {
        if (tracking === index) setState(index, 1, time);
      } else if (!actors[index].disabled) {
        const actor = actors[index];
        // Auxiliary setup calls0x00159280 on backing; that calls owned
        // sound cleanup0x00152aee even though its script progress survives.
        stopStream(actor.base);
        actor.aux = makeStream(manifest.buttons[index].rolloverScript, time, 'hover', index);
      }
      paint();
    },
    leave(index, time = now()) {
      if (disposed) return;
      if (hovered === index) hovered = null;
      cleanupAux(index, time);
      if (tracking === index) setState(index, 0, time);
      paint();
    },
    press(index, time = now()) {
      if (disposed || actors[index].disabled || tracking !== null) return false;
      if (hovered !== null) cleanupAux(hovered, time);
      hovered = index;
      tracking = index;
      dispatchInternal(index, 0x2005, time);
      paint();
      return true;
    },
    release(inside, time = now()) {
      if (disposed || tracking === null) return null;
      const index = tracking;
      tracking = null;
      dispatchInternal(index, inside ? 0x2002 : 0x2003, time);
      hovered = inside ? index : null;
      paint();
      return inside ? manifest.buttons[index].commandArgument : null;
    },
    cancel(time = now()) {
      if (disposed) return;
      actors.forEach((_, index) => cleanupAux(index, time));
      if (tracking !== null) dispatchInternal(tracking, 0x2003, time);
      tracking = null;
      hovered = null;
      // Window deactivation is a browser adaptation; stop every owned cue.
      actors.forEach(actor => stopStream(actor.base));
      paint();
    },
    repaint: paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      actors.forEach(actor => { stopStream(actor.base); stopStream(actor.aux); });
    },
  };
}
