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

function findControl(root, name) {
  if (name === 'undo') return root.querySelector('[aria-label="Undo"]');
  const action = actions[name] ?? (trays.has(name) ? `tray:${name}` : name);
  // Match values directly rather than interpolating source names into selectors.
  return [...root.querySelectorAll('[data-action]')].find(control => control.dataset.action === action);
}

export function attachNativeRollovers(manifest, hitRoot, nativeSpritesMap, renderLayer, { excludeNames = [] } = {}) {
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
    const url = assetUrl(path);
    if (!decodedImages.has(url)) {
      const image = new view.Image();
      image.src = url;
      const ready = image.decode().then(() => image).catch(error => {
        decodedImages.delete(url);
        throw error;
      });
      decodedImages.set(url, ready);
    }
    return decodedImages.get(url);
  }

  for (const button of data.buttons) {
    if (excludeNames.includes(button.name)) continue;
    const clip = data.scripts[String(button.rolloverScript)];
    const idle = nativeSpritesMap?.get(button.name);
    const control = idle && findControl(hitRoot, button.name);
    if (!control || !usableClip(clip) || data.unsupportedScripts?.[String(button.rolloverScript)]) continue;
    const loops = button.rolloverLoops ?? Boolean(button.rolloverParameters?.[0] ?? button.rawWords?.[11]);
    const group = button.group ?? button.rawWords?.[14] ?? 0;
    const image = document.createElement('img');
    image.className = 'native-sprite native-rollover';
    image.alt = '';
    image.draggable = false;
    image.hidden = true;
    image.style.cssText = `${place(...clip.rect)};pointer-events:none;`;
    image.dataset.nativeRollover = button.name;
    image.dataset.script = String(clip.script ?? button.rolloverScript);
    renderLayer.append(image);
    const observer = new view.MutationObserver(() => { if (unavailable()) stop(); });
    observer.observe(control, { attributes: true, attributeFilter: ['aria-pressed', 'aria-disabled', 'disabled', 'hidden'] });
    const framesReady = Promise.all(clip.frames.map(frame => preload(frame.image)));
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

    function unavailable() {
      return suspensions > 0 || control.getAttribute('aria-pressed') === 'true'
        || control.getAttribute('aria-disabled') === 'true'
        || control.matches(':disabled') || control.hidden;
    }

    function stop() {
      generation++;
      view.cancelAnimationFrame(animationFrame);
      image.hidden = true;
      if (hidingIdle) idle.hidden = idleWasHidden;
      hidingIdle = false;
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
        previous.pause();
        pendingAudio.delete(previous);
      }
      const path = sound.src ?? data.sounds?.[String(sound.sound)]?.src ?? `easel-${sound.sound}.wav`;
      const audio = new view.Audio(assetUrl(path));
      audio.volume = .65;
      ownedAudio.set(channel, audio);
      pendingAudio.set(audio, channel);
      const finished = () => {
        pendingAudio.delete(audio);
        if (ownedAudio.get(channel) === audio) ownedAudio.delete(channel);
      };
      audio.addEventListener('ended', finished, { once: true });
      audio.addEventListener('error', finished, { once: true });
      audio.play()?.catch(finished);
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
      idleWasHidden = idle.hidden;
      hidingIdle = true;
      idle.hidden = true;
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
            image.src = assetUrl(clip.frames[finalFrame].image);
            image.dataset.frame = String(finalFrame);
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
          image.src = assetUrl(clip.frames[frame].image);
          image.dataset.frame = String(frame);
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
