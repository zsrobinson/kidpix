import { playUiAudio, observeUiAudio } from './ui-audio.js';
import { preloadButtonImage, rolloverFrameAtTick, rolloverEndReady } from './native-rollovers.js';
import { interactionOwner } from './interaction-owner.js';
import { original } from './library.js';
import { place } from './trays.js';

export const libraryMotionNames = ['backgrounds', 'stickers', 'animations', 'media'];
const actions = ['backgrounds', 'stickers', 'toons', 'media'];

// Mode-1 library owners. Selection remains application-owned; only source
// streams, capture and their sounds live here. Static binding remains fallback.
export function attachLibraryMotion(manifest, root, sprites, layer, { onGroup = () => {}, onReady = () => {} } = {}) {
  const data = manifest.buttonAnimations;
  const doc = root.ownerDocument, view = doc.defaultView;
  const listeners = new view.AbortController(), options = { signal: listeners.signal };
  const guard = interactionOwner(doc);
  const actors = [];
  let contact = null, keyboard = null, cancelledKeyboard = false, epoch = 0, released = null, raf;
  const url = path => new URL(original(`ui/${path}`), doc.baseURI).href;
  function stop(stream) { stream?.handles.forEach(h => h.stop()); }
  function stream(id) {
    const clip = data.scripts[id];
    return { id, clip, tick: 0, next: view.performance.now() + clip.tickMs, sound: 0, handles: new Map(), finished: false };
  }
  function cues(s) {
    while (s.sound < (s.clip.sounds?.length ?? 0) && s.clip.sounds[s.sound].tick <= s.tick) {
      const cue = s.clip.sounds[s.sound++], channel = cue.channel ?? 1;
      s.handles.get(channel)?.stop();
      const audio = new view.Audio(url(cue.src ?? data.sounds?.[cue.sound]?.src ?? `easel-${cue.sound}.wav`));
      audio.volume = .65;
      let done = false;
      playUiAudio(audio);
      const release = observeUiAudio(audio, () => { done = true; });
      s.handles.set(channel, { complete: () => done || audio.ended, stop() { release(); audio.pause(); done = true; } });
    }
  }
  function schedule() { if (raf === undefined) raf = view.requestAnimationFrame(step); }
  function step(now) {
    raf = undefined;
    for (const a of actors) {
      if (!a.ready) continue;
      const s = a.aux ?? a.base;
      if (!s || s.finished) continue;
      cues(s);
      if (now >= s.next) {
        s.next += s.clip.tickMs;
        if (rolloverEndReady(s.clip, s.tick + 1, [...s.handles].filter(([, h]) => !h.complete()).map(([ch]) => ch))) {
          if (a.aux && a.record.rolloverLoops) { stop(s); a.aux = stream(s.id); cues(a.aux); }
          else s.finished = true;
        } else if (s.tick + 1 < (s.clip.endCheckTick ?? Infinity)) { s.tick++; cues(s); }
      }
      paint(a);
    }
    if (actors.some(a => a.ready && !(a.aux ?? a.base)?.finished)) schedule();
  }
  function paint(a) {
    const s = a.aux ?? a.base;
    if (!a.ready || !s) return;
    const i = rolloverFrameAtTick(s.clip, s.tick);
    a.image.style.cssText = `${place(...s.clip.rect)};pointer-events:none`;
    a.image.src = url(s.clip.frames[i].image);
    a.image.dataset.script = String(s.id); a.image.dataset.frame = String(i);
    a.image.dataset.state = String(a.state); a.image.dataset.finished = String(s.finished);
    a.image.hidden = false; a.idle.hidden = true;
    // Preserve the auxiliary test/inspection seam separately from the base.
    a.hover.hidden = !a.aux;
    if (a.aux) { a.hover.src = a.image.src; a.hover.style.cssText = a.image.style.cssText;
      a.hover.dataset.script = String(s.id); a.hover.dataset.frame = String(i); a.image.hidden = true; }
  }
  function auxiliaryOff(a) { if (a.aux && a.base) a.base.next = Math.max(a.base.next, view.performance.now()); stop(a.aux); a.aux = null; a.hover.hidden = true; }
  function state(a, value) {
    auxiliaryOff(a); a.state = value;
    const id = a.record.stateScripts[value];
    if (a.base?.id !== id) { stop(a.base); a.base = stream(id); cues(a.base); }
    paint(a); schedule();
  }
  function unavailable(a) { return a.control.hidden || a.control.matches(':disabled') || a.control.getAttribute('aria-disabled') === 'true'; }
  function selected(a) { return a.control.getAttribute('aria-pressed') === 'true'; }
  function settle(a) { state(a, selected(a) ? 2 : 0); }
  function cancel() {
    epoch++;
    const held = contact; contact = null; cancelledKeyboard ||= keyboard !== null; keyboard = null;
    if (held) { released = held; guard.release(root, held.id); }
    actors.forEach(a => { if (a.ready) { settle(a); stop(a.base); } });
  }
  async function prepare(a) {
    if (a.ready || a.loading) return;
    a.loading = true;
    const pendingEpoch = epoch;
    try {
      await Promise.all([...new Set([...a.record.stateScripts, a.record.rolloverScript])].flatMap(id => data.scripts[id].frames.map(f => preloadButtonImage(view, url(f.image)))));
      if (listeners.signal.aborted || pendingEpoch !== epoch || unavailable(a)) return;
      a.ready = true; onReady(a.record.name); settle(a);
      if (a.inside && a.hoverAllowed && !selected(a) && !unavailable(a) && !contact && !keyboard) startHover(a);
    } catch { /* A later entry retries; static binding stays usable. */ }
    finally { a.loading = false; }
  }
  function startHover(a) {
    if (a.aux) return;
    onGroup(a.record.group, a.record.name); stop(a.base);
    a.aux = stream(a.record.rolloverScript); cues(a.aux); paint(a); schedule();
  }
  for (const [index, name] of libraryMotionNames.entries()) {
    const record = data?.buttons?.find(b => b.name === name);
    const control = root.querySelector(`[data-action="tray:${actions[index]}"]`), idle = sprites.get(name);
    if (!record || !control || !idle || !record.stateScripts[2]
      || record.hotspotRegion?.status !== 'exact'
      || [...record.stateScripts, record.rolloverScript].some(id => !data.scripts[id]?.frames?.length || !(data.scripts[id].tickMs > 0) || data.unsupportedScripts?.[id])) continue;
    const image = doc.createElement('img'), hover = doc.createElement('img');
    for (const img of [image, hover]) { img.className = 'native-sprite'; img.alt = ''; img.draggable = false; img.hidden = true; layer.append(img); }
    image.dataset.nativeLibraryMotion = name; hover.dataset.nativeRollover = name;
    const a = { record, control, idle, image, hover, ready: false, state: 0 };
    actors.push(a);
    control.addEventListener('pointerenter', event => {
      a.inside = true; a.hoverAllowed = !event.buttons;
      void prepare(a);
      if (!a.ready || unavailable(a) || contact || event.buttons || selected(a)) return;
      startHover(a);
    }, options);
    control.addEventListener('pointerleave', () => { a.inside = false; auxiliaryOff(a); paint(a); schedule(); }, options);
    const observer = new view.MutationObserver(() => {
      if (!a.ready) return;
      if (unavailable(a)) { cancel(); image.hidden = true; hover.hidden = true; idle.hidden = false; a.ready = false; }
      else if (contact?.a !== a && keyboard !== a) settle(a);
    });
    observer.observe(control, { attributes: true, attributeFilter: ['aria-pressed', 'aria-disabled', 'disabled', 'hidden'] });
    a.dispose = () => { observer.disconnect(); stop(a.base); stop(a.aux); image.remove(); hover.remove(); idle.hidden = false; };
    void prepare(a);
  }
  function hit(event) { return actors.find(a => a.control === event.target.closest?.('[data-action]') && a.ready && !unavailable(a)); }
  function contains(a, event) {
    const box = root.getBoundingClientRect();
    const x = (event.clientX - box.left) * 1024 / box.width, y = (event.clientY - box.top) * 768 / box.height;
    return a.record.hotspotRegion.rectsLTRB.some(([l,t,r,b]) => x >= l && x < r && y >= t && y < b);
  }
  root.addEventListener('pointerdown', event => {
    if (!contact) released = null;
    const a = hit(event);
    if (!a || event.button !== 0 || contact || !guard.claim(event, root)) return;
    released = null; cancelledKeyboard = false;
    contact = { a, id: event.pointerId, inside: true };
    onGroup(a.record.group, a.record.name); state(a, 1);
    try { root.setPointerCapture(event.pointerId); } catch { cancel(); }
  }, options);
  root.addEventListener('pointermove', event => {
    if (!contact || contact.id !== event.pointerId) return;
    const inside = contains(contact.a, event);
    if (inside !== contact.inside) { contact.inside = inside; state(contact.a, inside ? 1 : 0); }
  }, options);
  root.addEventListener('pointerup', event => {
    if (!contact || contact.id !== event.pointerId) return;
    const held = contact; contact = null; released = held;
    const inside = contains(held.a, event);
    if (inside) state(held.a, 2); else settle(held.a);
    guard.release(root, held.id);
    // Capture retargets the compatibility click to the layer. Preserve the
    // existing semantic activation exactly once using the original control.
    if (inside) held.a.control.click();
  }, options);
  root.addEventListener('click', event => {
    if (event.detail > 0 && released && (event.pointerId === released.id
      || (!('pointerId' in event) && (event.target === root || released.a.control.contains(event.target))))) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const a = hit(event);
    if (!a || event.detail > 0) return;
    if (cancelledKeyboard) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (contact) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (keyboard !== a) state(a, 1);
    keyboard = null; state(a, 2);
  }, { ...options, capture: true });
  root.addEventListener('keydown', event => {
    const a = hit(event);
    if (event.key === 'Escape') cancel();
    if (a && ['Enter', ' '].includes(event.key) && event.repeat) { event.preventDefault(); return; }
    if (a && ['Enter', ' '].includes(event.key) && !event.repeat) { cancelledKeyboard = false; keyboard = a; state(a, 1); }
  }, options);
  root.addEventListener('focusout', () => { if (keyboard) cancel(); }, options);
  for (const type of ['pointercancel', 'lostpointercapture']) root.addEventListener(type, event => { if (contact?.id === event.pointerId) cancel(); }, options);
  for (const type of ['blur', 'pagehide']) view.addEventListener(type, cancel, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, options);
  return { cancel: name => { if (name === undefined) cancel(); else { const a = actors.find(a => a.record.name === name); if (a) { auxiliaryOff(a); stop(a.base); paint(a); } } },
    cancelGroup: (group, except) => { actors.forEach(a => { if (group && a.record.group === group && a.record.name !== except) { auxiliaryOff(a); paint(a); } }); },
    names: actors.map(a => a.record.name), ready: name => Boolean(actors.find(a => a.record.name === name)?.ready), ownsCue(action) {
    const a = actors.find(a => a.control.dataset.action === action);
    return Boolean(a?.ready && a.base?.id === a.record.stateScripts[1]);
  }, dispose() { cancel(); listeners.abort(); view.cancelAnimationFrame(raf); actors.forEach(a => a.dispose()); } };
}
