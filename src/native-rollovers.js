import { playUiAudio, observeUiAudio } from './ui-audio.js';
import { original } from './library.js';
import { place } from './trays.js';

// A final zero-wait image is still rendered. End/restart is checked on the
// following native update, and may wait longer for channels 1 and 2 to finish.
export function rolloverFrameAtTick(clip, tick) {
  let at = 0;
  let selected = -1;
  for (let index = 0; index < clip.frames.length; index++) {
    if (at > Math.max(0, tick)) break;
    selected = index;
    at += clip.frames[index].ticks;
  }
  return selected;
}

export function rolloverEndTick(clip) {
  const firstCheck = clip.frames.reduce((sum, frame) => sum + frame.ticks, 0) + 1;
  return Math.max(firstCheck, clip.endCheckTick ?? firstCheck);
}

export function rolloverEndReady(clip, tick, pendingSoundChannels = []) {
  return tick >= rolloverEndTick(clip)
    && !pendingSoundChannels.some(channel => channel === 1 || channel === 2);
}

// RButton auxiliary cleanup: reasons 0 (leave) and 1 (tracking) honor
// MBTN word 12; reason 3 also destroys an actor retained after hover ended.
export function rolloverCleanupRequired(button, reason = 0) {
  return reason === 3 || (button.rolloverCancelsOnLeave
    ?? !Boolean(button.rolloverParameters?.[1] ?? button.rawWords?.[12]));
}

const decodedImages = new Map();
export function preloadButtonImage(view, url) {
  if (!decodedImages.has(url)) {
    const image = new view.Image();
    image.src = url;
    decodedImages.set(url, image.decode().then(() => image).catch(error => {
      decodedImages.delete(url); throw error;
    }));
  }
  return decodedImages.get(url);
}
const actions = {
  animations: 'tray:toons', fill: 'tray:bucket', export: 'stereo', exit: 'quit',
  firehose: 'clear', 'paper-texture': 'paper',
};
const trays = new Set(['backgrounds', 'stickers', 'media', 'draw', 'paint', 'mixer', 'stamp', 'text', 'grab', 'eraser']);

function usableClip(clip) {
  return clip && Number.isFinite(clip.tickMs) && clip.tickMs > 0
    && Array.isArray(clip.rect) && clip.rect.length === 4 && clip.rect.every(Number.isFinite)
    && Array.isArray(clip.frames) && clip.frames.length > 0
    && clip.frames.every(frame => typeof frame.image === 'string' && Number.isInteger(frame.ticks) && frame.ticks >= 0)
    && (clip.endCheckTick === undefined || Number.isInteger(clip.endCheckTick) && clip.endCheckTick >= 1);
}

export function usableClippedRollover(clip) {
  const rect = clip?.clipRect;
  const full = clip?.rect;
  const size = clip?.restore?.size;
  return usableClip(clip) && Array.isArray(rect) && rect.length === 4
    && rect.every(Number.isInteger) && rect[2] > 0 && rect[3] > 0
    && Array.isArray(size) && size.length === 2 && size.every(n => Number.isInteger(n) && n > 0)
    && typeof clip.restore.image === 'string' && clip.restore.image.length > 0
    && rect[0] >= 0 && rect[1] >= 0 && rect[0] + rect[2] <= size[0] && rect[1] + rect[3] <= size[1]
    && rect[0] >= full[0] && rect[1] >= full[1]
    && rect[0] + rect[2] <= full[0] + full[2] && rect[1] + rect[3] <= full[1] + full[3];
}

function findControl(root, name) {
  if (name === 'undo') return root.querySelector('[aria-label="Undo"]');
  const action = actions[name] ?? (trays.has(name) ? `tray:${name}` : name);
  // Match values directly rather than interpolating source names into selectors.
  return [...root.querySelectorAll('[data-action]')].find(control => control.dataset.action === action);
}

export function attachNativeRollovers(manifest, hitRoot, nativeSpritesMap, renderLayer, { excludeNames = [], fallbackNames = [], enabled = () => true } = {}) {
  const data = manifest?.buttonAnimations ?? manifest;
  if (!Array.isArray(data?.buttons) || !data.scripts || !hitRoot || !renderLayer) return () => {};
  const document = hitRoot.ownerDocument;
  const view = document.defaultView;
  const listeners = new view.AbortController();
  const options = { signal: listeners.signal };
  const disposers = [];
  const actors = new Map();
  const assetUrl = path => new URL(original(`ui/${path}`), document.baseURI).href;

  function cancel(name) {
    if (name === undefined) actors.forEach(actor => actor.stop());
    else actors.get(name)?.stop();
  }

  function cancelGroup(group, exceptName) {
    if (!group) return;
    actors.forEach((actor, name) => {
      if (actor.group === group && name !== exceptName) actor.stop();
    });
  }

  // A page transaction can deactivate one retained actor until it settles.
  // Releasing ownership never synthesizes hover or restarts a source timeline.
  function suspend(name) {
    const targets = name === undefined ? [...actors.values()] : [actors.get(name)].filter(Boolean);
    const releases = targets.map(actor => actor.suspend());
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releases.forEach(release => release());
    };
  }

  // Browser lifecycle adaptation of native controller deactivation/destruction.
  // Retained actors must not keep sounding in an inactive or discarded window.
  view.addEventListener('blur', () => cancel(), options);
  view.addEventListener('pagehide', () => cancel(), options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
  }, options);

  function preload(path) {
    return preloadButtonImage(view, assetUrl(path));
  }

  for (const button of data.buttons) {
    if (excludeNames.includes(button.name)) continue;
    const clip = data.scripts[String(button.rolloverScript)];
    const idle = nativeSpritesMap?.get(button.name);
    const control = idle && findControl(hitRoot, button.name);
    if (!control || !usableClip(clip) || data.unsupportedScripts?.[String(button.rolloverScript)]) continue;
    const clipped = clip.clipRect !== undefined || button.rolloverScript === 1128;
    if (clipped && !usableClippedRollover(clip)) continue;
    const loops = button.rolloverLoops ?? Boolean(button.rolloverParameters?.[0] ?? button.rawWords?.[11]);
    const group = button.group ?? button.rawWords?.[14] ?? 0;
    const image = document.createElement(clipped ? 'canvas' : 'img');
    const context = clipped ? image.getContext('2d') : null;
    if (clipped && !context) continue;
    if (clipped) {
      [image.width, image.height] = clip.clipRect.slice(2);
    }
    image.className = 'native-sprite native-rollover';
    image.alt = '';
    image.draggable = false;
    image.hidden = true;
    // Above the later paper-canister canvas (z=4), only within the clip.
    image.style.cssText = `${place(...(clipped ? clip.clipRect : clip.rect))};pointer-events:none;${clipped ? 'z-index:5;' : ''}`;
    image.dataset[fallbackNames.includes(button.name) ? 'nativeFallbackRollover' : 'nativeRollover'] = button.name;
    image.dataset.script = String(clip.script ?? button.rolloverScript);
    renderLayer.append(image);
    const observer = new view.MutationObserver(() => { if (unavailable()) stop(); });
    observer.observe(control, { attributes: true, attributeFilter: ['aria-pressed', 'aria-disabled', 'disabled', 'hidden'] });
    let decoded;
    const framesReady = Promise.all([
      ...clip.frames.map(frame => preload(frame.image)),
      ...(clipped ? [preload(clip.restore.image)] : []),
    ]).then(images => {
      if (clipped && (images.slice(0, -1).some(frame => frame.naturalWidth !== clip.rect[2] || frame.naturalHeight !== clip.rect[3])
          || images.at(-1).naturalWidth !== clip.restore.size[0] || images.at(-1).naturalHeight !== clip.restore.size[1])) {
        throw new Error('Invalid clipped rollover image dimensions');
      }
      decoded = images;
    });
    // Missing assets leave the existing static binding in charge.
    framesReady.catch(() => {});
    let suspensions = 0;
    let inside = false;
    let blockedUntilLeave = false;
    let generation = 0;
    let animationFrame;
    let hidingIdle = false;
    let idleWasHidden = false;
    const ownedAudio = new Map();
    const pendingAudio = new Map();
    const audioCleanup = new Map();

    function unavailable() {
      return (clipped && document.hidden) || !enabled(button.name) || suspensions > 0 || control.getAttribute('aria-pressed') === 'true'
        || control.getAttribute('aria-disabled') === 'true'
        || control.matches(':disabled') || control.hidden;
    }

    function stop() {
      generation++;
      view.cancelAnimationFrame(animationFrame);
      image.hidden = true;
      if (hidingIdle) idle.hidden = idleWasHidden;
      hidingIdle = false;
      for (const cleanup of audioCleanup.values()) cleanup();
      audioCleanup.clear();
      for (const audio of ownedAudio.values()) audio.pause();
      ownedAudio.clear();
      pendingAudio.clear();
    }

    actors.set(button.name, { group, stop, suspend() {
      suspensions++;
      stop();
      return () => { suspensions--; };
    } });

    function playSound(sound) {
      const channel = sound.channel ?? 1;
      const previous = ownedAudio.get(channel);
      if (previous) {
        audioCleanup.get(previous)?.();
        audioCleanup.delete(previous);
        previous.pause();
        pendingAudio.delete(previous);
      }
      const path = sound.src ?? data.sounds?.[String(sound.sound)]?.src ?? `easel-${sound.sound}.wav`;
      const audio = new view.Audio(assetUrl(path));
      audio.volume = .65;
      ownedAudio.set(channel, audio);
      pendingAudio.set(audio, channel);
      const finished = () => {
        audioCleanup.delete(audio);
        pendingAudio.delete(audio);
        if (ownedAudio.get(channel) === audio) ownedAudio.delete(channel);
      };
      playUiAudio(audio);
      audioCleanup.set(audio, observeUiAudio(audio, finished));
    }

    function drawFrame(frame) {
      if (clipped) {
        const [x, y, w, h] = clip.clipRect;
        context.clearRect(0, 0, w, h);
        context.drawImage(decoded.at(-1), x, y, w, h, 0, 0, w, h);
        context.drawImage(decoded[frame], clip.rect[0] - x, clip.rect[1] - y);
      } else image.src = assetUrl(clip.frames[frame].image);
      image.dataset.frame = String(frame);
    }

    async function start() {
      // Native setup destroys any surviving auxiliary handle on reentry.
      // Restore the backing actor first so its original visibility is retained.
      stop();
      const current = ++generation;
      try { await framesReady; } catch { return; }
      // Ordinary leave/tracking may have relinquished hover without destroying
      // this actor. Only cleanup/replacement invalidates its pending decode.
      if (current !== generation || unavailable()) return;
      if (!clipped) {
        idleWasHidden = idle.hidden;
        hidingIdle = true;
        idle.hidden = true;
      }
      image.hidden = false;
      let startTime = view.performance.now();
      let nextSound = 0;
      let lastFrame = -1;
      let lastTick = -1;
      const sounds = [...(clip.sounds ?? [])].sort((a, b) => a.tick - b.tick);

      function step(now) {
        if (current !== generation) return;
        // Hover ownership and actor lifetime differ when word 12 is nonzero.
        // Leave/tracking handlers decide cancellation; a retained actor runs on.
        if (unavailable()) { stop(); return; }
        let tick = Math.floor((now - startTime) / clip.tickMs);
        const updateDue = tick !== lastTick;
        // Catch up source cues before deciding whether the actor can finish.
        // A late browser frame must not skip a cue near the terminal image.
        while (nextSound < sounds.length && sounds[nextSound].tick <= tick) playSound(sounds[nextSound++]);
        if (updateDue && rolloverEndReady(clip, tick, [...pendingAudio.values()])) {
          if (!loops) {
            // Finite native actors stop updating, retaining their final image.
            // Owner-specific completion callbacks can restore a backing actor;
            // those callbacks are not encoded in the MBTN/tSCR manifest.
            const finalFrame = clip.frames.length - 1;
            drawFrame(finalFrame);
            return;
          }
          startTime = now;
          tick = 0;
          nextSound = 0;
          lastFrame = -1;
        }
        while (nextSound < sounds.length && sounds[nextSound].tick <= tick) playSound(sounds[nextSound++]);
        const frame = rolloverFrameAtTick(clip, tick);
        if (frame !== lastFrame) {
          drawFrame(frame);
          lastFrame = frame;
        }
        lastTick = tick;
        animationFrame = view.requestAnimationFrame(step);
      }
      step(startTime);
    }

    control.addEventListener('pointerenter', event => {
      if (inside) return;
      inside = true;
      blockedUntilLeave = Boolean(event.buttons);
      if (!blockedUntilLeave && !unavailable()) {
        void start();
        cancelGroup(group, button.name);
      }
    }, options);
    control.addEventListener('pointerleave', () => {
      inside = false;
      blockedUntilLeave = false;
      if (rolloverCleanupRequired(button)) stop();
    }, options);
    const press = () => {
      blockedUntilLeave = true;
      if (rolloverCleanupRequired(button, 1)) stop();
    };
    control.addEventListener('pointerdown', press, options);
    if (clipped) control.addEventListener('lostpointercapture', () => { blockedUntilLeave = true; stop(); }, options);
    control.addEventListener('pointercancel', () => { blockedUntilLeave = true; stop(); }, options);
    disposers.push(() => { observer.disconnect(); stop(); image.remove(); });
  }
  const dispose = () => {
    listeners.abort();
    disposers.forEach(dispose => dispose());
    actors.clear();
  };
  // Owners can apply native reason-3 cleanup even after ordinary leave cleared
  // the hover marker. Keep the existing callable-disposer integration intact.
  dispose.cancel = cancel;
  dispose.cancelGroup = cancelGroup;
  dispose.suspend = suspend;
  return dispose;
}
