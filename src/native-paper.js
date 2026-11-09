import { original } from './library.js';
import { place } from './trays.js';

export function nativePaperFrameAtTick(clip, tick) {
  let selected = 0;
  for (let index = 1; index < clip.frames.length; index++) {
    if (clip.frames[index].tick > tick) break;
    selected = index;
  }
  return selected;
}

function selectedIndex(manifest, id) {
  const index = id - 12300;
  if (!Number.isInteger(index) || index < 0 || index >= manifest.textureSprites.length) {
    throw new RangeError(`Unknown native paper texture ${id}`);
  }
  return index;
}

export function nativePaperParts(manifest, frame, selectedId, opening = true) {
  const selected = selectedIndex(manifest, selectedId);
  return frame.parts.map((part, index) => ({ ...part,
    sprite: opening && index === manifest.substitutionParts.page ? manifest.pageSprites[Math.trunc(selected / 7)]
      : index === (opening ? manifest.substitutionParts.texture : 1) ? manifest.textureSprites[selected] : part.sprite,
  }));
}

export function drawNativePaperFrame(context, manifest, frame, selectedId, imageFor, opening = true) {
  context.save();
  if (opening) {
    context.beginPath();
    context.rect(...manifest.clipRect);
    context.clip();
  }
  for (const part of nativePaperParts(manifest, frame, selectedId, opening)) {
    context.drawImage(imageFor(manifest.sprites[String(part.sprite)].image), part.x, part.y);
  }
  context.restore();
}

// Owns only canister art and its authored timelines. The caller owns live popup
// controls; onReady runs when native script1055's completion callback would
// install those controls. No reverse/closing motion is invented.
export function createNativePaperPicker({ manifest, control, layer, staticSprite, onReady = () => {}, onError = () => {},
  now, schedule, cancel, loadImage, playSound } = {}) {
  const document = layer.ownerDocument;
  const view = document.defaultView;
  now ??= () => view.performance.now();
  schedule ??= callback => view.setTimeout(() => callback(now()), manifest.tickMs);
  cancel ??= handle => view.clearTimeout(handle);
  const url = path => new URL(original(`ui/${path}`), document.baseURI).href;
  loadImage ??= async path => {
    const image = new view.Image();
    image.src = url(path);
    await image.decode();
    return image;
  };
  playSound ??= sound => {
    const audio = new view.Audio(url(`easel-${sound.sound}.wav`));
    audio.volume = .65;
    audio.play()?.catch(() => {});
    return audio;
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  canvas.className = 'native-sprite native-paper-canister';
  canvas.style.cssText = `${place(0, 0, 1024, 768)};pointer-events:none;z-index:4;`;
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  const context = canvas.getContext('2d');
  const cache = new Map();
  const decoded = new Map();
  const audio = new Map();
  const pressAudio = new Set();
  const listeners = new view.AbortController();
  let generation = 0;
  let pendingFrame;
  let selection = 12300;
  let phase = 'closed';
  let inside = false;
  let stateName;
  let disposed = false;
  let priorStaticHidden = staticSprite?.hidden ?? false;
  const state = value => { phase = value; control.dataset.paperState = value; canvas.dataset.paperState = value; };
  state('closed');

  function stopTimeline() {
    generation++;
    cancel(pendingFrame);
    for (const owned of audio.values()) owned?.pause?.();
    audio.clear();
  }

  function stopPressAudio() {
    for (const owned of pressAudio) owned?.pause?.();
    pressAudio.clear();
  }

  function pressCue() {
    for (const sound of manifest.states.tracking.sounds ?? []) {
      const owned = playSound(sound);
      if (!owned) continue;
      pressAudio.add(owned);
      const finished = () => pressAudio.delete(owned);
      owned.addEventListener?.('ended', finished, { once: true });
      owned.addEventListener?.('error', finished, { once: true });
    }
  }

  function preload(path) {
    if (!cache.has(path)) {
      const ready = Promise.resolve().then(() => loadImage(path)).then(image => {
        decoded.set(path, image);
        return image;
      }).catch(error => { cache.delete(path); throw error; });
      cache.set(path, ready);
    }
    return cache.get(path);
  }

  function reveal(frame, opening, frameIndex, script) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawNativePaperFrame(context, manifest, frame, selection, path => decoded.get(path), opening);
    if (canvas.hidden && staticSprite) priorStaticHidden = staticSprite.hidden;
    if (staticSprite) staticSprite.hidden = true;
    canvas.hidden = false;
    canvas.dataset.script = String(script);
    canvas.dataset.frame = String(frameIndex);
    canvas.dataset.selectedPaper = String(selection);
    control.dataset.paperReady = 'true';
  }

  async function run(clip, opening, complete) {
    stopTimeline();
    const current = generation;
    const selected = selection;
    const paths = new Set(clip.frames.flatMap(frame => nativePaperParts(manifest, frame, selected, opening)
      .map(part => manifest.sprites[String(part.sprite)].image)));
    try { await Promise.all([...paths].map(preload)); }
    catch (error) {
      if (current === generation && !disposed) {
        state('closed');
        canvas.hidden = true;
        if (staticSprite) staticSprite.hidden = priorStaticHidden;
        onError(error);
      }
      return false;
    }
    if (current !== generation || disposed) return false;
    if (opening) state('opening');
    const started = now();
    let nextUpdate = started + manifest.tickMs;
    let tick = 0;
    let firstUpdate = true;
    let lastFrame = -1;
    let nextSound = 0;
    // The press cue starts synchronously from the actual tracking transition,
    // preserving user activation even if a first-use bitmap decode is pending.
    const sounds = opening ? clip.sounds ?? [] : [];
    function step(time) {
      if (current !== generation || disposed) return;
      if (!firstUpdate) {
        if (time < nextUpdate) { pendingFrame = schedule(step); return; }
        tick++;
        nextUpdate = time + manifest.tickMs;
      }
      firstUpdate = false;
      if (tick >= clip.endCheckTick && clip.loop) {
        tick = 0;
        lastFrame = -1;
        nextSound = 0;
      }
      while (nextSound < sounds.length && sounds[nextSound].tick <= tick) {
        const sound = sounds[nextSound++];
        const channel = sound.channel ?? 1;
        audio.get(channel)?.pause?.();
        audio.set(channel, playSound(sound));
      }
      const frame = nativePaperFrameAtTick(clip, tick);
      if (lastFrame !== frame) {
        reveal(clip.frames[frame], opening, frame, clip.script);
        lastFrame = frame;
      }
      if (tick >= clip.endCheckTick && !clip.loop) { complete?.(); return; }
      pendingFrame = schedule(step);
    }
    step(started);
    return true;
  }

  function showClosedState(name = 'rest', force = false) {
    if (phase !== 'closed' || disposed) return;
    if (!force && stateName === name) return;
    const enteringTracking = name === 'tracking' && stateName !== name;
    stateName = name;
    void run(manifest.states[name], false);
    if (enteringTracking) pressCue();
  }

  function close() {
    if (disposed) return;
    stopTimeline();
    stopPressAudio();
    state('closed');
    showClosedState('rest', true);
  }

  function open(id = selection, ready = onReady) {
    selectedIndex(manifest, id);
    selection = id;
    state('loading');
    return run(manifest, true, () => {
      state('open');
      // The native actor retains its final canister pose under a live picker.
      // The caller draws the full page image, so leave that portion to it to
      // avoid compositing the same translucent page edges twice.
      context.clearRect(0, 0, canvas.width, canvas.height);
      const terminal = manifest.frames.at(-1);
      const parts = nativePaperParts(manifest, terminal, selection);
      context.save();
      context.beginPath();
      context.rect(...manifest.clipRect);
      context.clip();
      for (const [index, part] of parts.entries()) {
        if (index === manifest.substitutionParts.page) continue;
        context.drawImage(decoded.get(manifest.sprites[String(part.sprite)].image), part.x, part.y);
      }
      context.restore();
      ready();
    });
  }

  function setSelected(id) {
    selectedIndex(manifest, id);
    selection = id;
    if (phase === 'closed') showClosedState('rest', true);
  }

  control.addEventListener('pointerenter', event => {
    inside = true;
    showClosedState(event.buttons ? 'tracking' : 'hover');
  }, { signal: listeners.signal });
  control.addEventListener('pointerleave', () => { inside = false; showClosedState(); }, { signal: listeners.signal });
  control.addEventListener('pointerdown', () => showClosedState('tracking'), { signal: listeners.signal });
  control.addEventListener('pointerup', () => showClosedState(inside ? 'hover' : 'rest'), { signal: listeners.signal });
  control.addEventListener('pointercancel', () => { stopPressAudio(); showClosedState(); }, { signal: listeners.signal });
  showClosedState();
  return { open, close, setSelected, get state() { return phase; },
    dispose() {
      if (disposed) return;
      stopTimeline();
      stopPressAudio();
      disposed = true;
      listeners.abort();
      canvas.remove();
      if (staticSprite) staticSprite.hidden = priorStaticHidden;
    },
  };
}
