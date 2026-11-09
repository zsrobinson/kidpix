// BigPicker.MHK / RColorPicker. Coordinates are native 1024×768 scene pixels.
// No DOM listeners: the Easel adapter owns scaled pointer coordinates and menus.
export function colorPickerContains(region, x, y) {
  return region.rectsLTRB.some(([l, t, r, b]) => x >= l && y >= t && x < r && y < b);
}

export function colorPickerHit(manifest, x, y) {
  const mask = manifest.hitMask;
  x = Math.trunc(x); y = Math.trunc(y);
  const localX = x - mask.x, localY = y - mask.y;
  // RColorPicker::pointInRect rejects the top/left edges, too (0x3c7bb).
  if (localX <= 0 || localY <= 0 || localX >= mask.width || localY >= mask.height) return null;
  for (const radius of manifest.hitSearch.radii) {
    for (const [dx, dy] of manifest.hitSearch.offsetOrder) {
      const px = localX + dx * radius, py = localY + dy * radius;
      if (px <= 0 || py <= 0 || px >= mask.width || py >= mask.height) continue;
      if (mask.rows[py].some(([l, r]) => px >= l && px < r)) return { x: px + mask.x, y: py + mask.y };
    }
  }
  return null;
}

export function drawColorPickerFrame(context, manifest, clip, frame, imageFor) {
  context.save();
  context.beginPath();
  context.rect(...clip.clipRect);
  context.clip();
  for (const part of frame.parts) {
    context.drawImage(imageFor(manifest.sprites[String(part.sprite)].image), part.x, part.y);
  }
  context.restore();
}

// render({phase, clip, frame, frameIndex}) receives null frame when fully closed.
// prepare() resolves after images decode. playSound(cue) may return an Audio-like
// object; ended/error completion gates native finite playback. No object means
// sound is disabled/unavailable and cannot delay completion. readColor(x,y)
// supplies the native screen sampler (the adapter may sample its composed canvas).
export function createNativeColorPickerMotion({ manifest, prepare = async () => {},
  render = () => {}, onReady = () => {}, onClosed = () => {}, onPreview = () => {},
  onSelect = () => {}, onSampleSound = () => {}, onError = () => {}, onState = () => {}, readColor = () => null,
  playSound = () => null, now = () => performance.now(),
  schedule = callback => requestAnimationFrame(callback), cancel = handle => cancelAnimationFrame(handle),
  color = '#000000',
} = {}) {
  let phase = 'closed', generation = 0, pending, clip, frameIndex = 0, nextAt = 0;
  let tracking = false, dropper = false, disposed = false, preview = color;
  let dropperState = 'rest';
  const audio = new Set();
  const pendingAudio = new Set();
  const cleanupAudio = new Set();
  const setPhase = value => { phase = value; onState(value); };
  function stop() {
    generation++;
    if (pending !== undefined) cancel(pending);
    pending = undefined;
    for (const cleanup of cleanupAudio) cleanup();
    cleanupAudio.clear();
    for (const sound of audio) sound.pause?.();
    audio.clear(); pendingAudio.clear();
  }
  function cue(entry) {
    const sound = playSound({ ...entry, audio: manifest.sounds?.[String(entry.sound)]?.audio });
    if (!sound) return;
    audio.add(sound);
    if (sound.ended || sound.error) return;
    pendingAudio.add(sound);
    const done = () => { pendingAudio.delete(sound); };
    const cleanup = () => {
      sound.removeEventListener?.('ended', done);
      sound.removeEventListener?.('error', done);
    };
    cleanupAudio.add(cleanup);
    sound.addEventListener?.('ended', done, { once: true });
    sound.addEventListener?.('error', done, { once: true });
  }
  function paint() {
    render({ phase, clip, frame: clip.frames[frameIndex], frameIndex });
  }
  function step(token) {
    if (token !== generation || disposed) return;
    const time = now();
    if (time >= nextAt) {
      // Native clock schedules from this delivered update. A stalled tab must
      // not skip directly through all seven authored poses or replay cues.
      nextAt = time + clip.tickMs;
      if (frameIndex < clip.frames.length - 1) {
        frameIndex++;
        for (const sound of clip.sounds ?? []) if (sound.tick === clip.frames[frameIndex].tick) cue(sound);
        paint();
      } else if (![...pendingAudio].some(sound => !sound.ended && !sound.error)) {
        if (phase === 'opening') {
          setPhase('open');
          paint();
          onReady();
        } else {
          setPhase('closed');
          render({ phase, clip: null, frame: null, frameIndex: -1 });
          onClosed();
        }
        return;
      }
    }
    pending = schedule(() => step(token));
  }
  function start(name) {
    stop();
    clip = manifest.clips[name];
    frameIndex = 0;
    setPhase(name);
    nextAt = now() + clip.tickMs;
    for (const sound of clip.sounds ?? []) if (sound.tick === 0) cue(sound);
    paint();
    const token = generation;
    pending = schedule(() => step(token));
  }
  function showPreview(value) {
    if (value !== null && value !== preview) { preview = value; onPreview(value); }
  }
  function sample(x, y) {
    const point = dropper ? { x: Math.trunc(x), y: Math.trunc(y) } : colorPickerHit(manifest, x, y);
    return point ? readColor(point.x, point.y) : null;
  }
  function insideSwatches(x, y) {
    const m = manifest.hitMask;
    return x >= m.x && y >= m.y && x < m.x + m.width && y < m.y + m.height;
  }
  function retained(x, y) { return insideSwatches(x, y) || colorPickerContains(manifest.retentionRegion, x, y); }
  function close() {
    if (disposed || phase === 'closed' || phase === 'closing') return false;
    tracking = false; dropper = false; dropperState = 'rest'; showPreview(color);
    if (phase === 'loading') {
      stop(); setPhase('closed');
      render({ phase, clip: null, frame: null, frameIndex: -1 }); onClosed();
    } else start('closing');
    return true;
  }
  async function open() {
    // +0x84 blocks a fresh open until the closing completion callback resets it.
    if (disposed || phase !== 'closed') return false;
    stop(); const token = generation;
    setPhase('loading');
    try {
      await prepare();
      if (disposed || token !== generation) return false;
      start('opening');
      return true;
    } catch (error) {
      if (!disposed && token === generation) {
        stop(); setPhase('closed');
        render({ phase, clip: null, frame: null, frameIndex: -1 }); onError(error);
      }
      return false;
    }
  }
  function move(x, y) {
    if (phase !== 'open') return false;
    if (!dropper && !retained(x, y)) { close(); return false; }
    if (tracking || dropper) showPreview(sample(x, y) ?? color);
    return true;
  }
  function pointerDown(x, y) {
    if (phase !== 'open') return false;
    if (!dropper && !retained(x, y)) { close(); return false; }
    const value = sample(x, y);
    if (value === null) return false;
    if (value !== preview && manifest.colorChangeCue) {
      // This is an independently owned positional cue, not an actor sound gate.
      onSampleSound({ ...manifest.colorChangeCue, x, y });
    }
    showPreview(value);
    tracking = true;
    if (dropper) { color = value; onSelect(value); close(); }
    return true;
  }
  function pointerUp(x, y) {
    if (phase !== 'open' || !tracking) return false;
    tracking = false;
    const value = sample(x, y);
    if (value !== null) { color = value; showPreview(value); onSelect(value); return true; }
    showPreview(color);
    return false;
  }
  function setDropper(active = true) {
    if (phase !== 'open') return false;
    dropper = active; tracking = false;
    if (!active) showPreview(color);
    return true;
  }
  function setDropperState(value) {
    if (phase !== 'open' || dropper || value === dropperState) return false;
    const names = { rest: 'dropperRest', hover: 'dropperHover', tracking: 'dropperTracking' };
    if (!names[value]) throw new RangeError(`Unknown color-picker dropper state ${value}`);
    dropperState = value;
    const stateClip = manifest.clips[names[value]];
    for (const sound of stateClip.sounds ?? []) cue(sound);
    // The adapter composes this single source pose over the retained palette.
    render({ phase, clip: stateClip, frame: stateClip.frames[0], frameIndex: 0, overlay: true });
    return true;
  }
  return { open, close, move, pointerDown, pointerUp, setDropper, setDropperState,
    escape() {
      // Native Escape cancels eyedropper mode; ordinary palette dismissal is
      // pointer-leave based. A host may independently choose a broader Escape UX.
      if (phase !== 'open' || !dropper) return false;
      dropper = false; tracking = false; showPreview(color); return true;
    },
    setColor(value) { color = value; showPreview(value); },
    dispose() {
      if (disposed) return;
      stop(); disposed = true; phase = 'closed';
      render({ phase, clip: null, frame: null, frameIndex: -1 });
    },
    get state() { return phase; }, get color() { return color; },
    get previewColor() { return preview; }, get eyedropper() { return dropper; },
  };
}
