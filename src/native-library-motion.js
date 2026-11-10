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
  return attachMode1Motion(manifest, root, sprites, layer, { onGroup, onReady });
}

// Shared source stream/input core; application adapters choose selection policy.
export function attachMode1Motion(manifest, root, sprites, layer, {
  onGroup = () => {}, onReady = () => {},
  bindings = libraryMotionNames.map((name, i) => ({ name, action: `tray:${actions[i]}` })),
  mode = 1, readSelection, terminalAdoption = false, actorAttribute = 'nativeLibraryMotion',
} = {}) {
  const momentary = mode === 0;
  const authoritative = momentary || Boolean(readSelection);
  let selection = readSelection?.();
  let activation = null, fallbackContact = null, fallbackPointer = null, adoptionTimer;
  const data = manifest.buttonAnimations;
  const doc = root.ownerDocument, view = doc.defaultView;
  const listeners = new view.AbortController(), options = { signal: listeners.signal };
  const guard = interactionOwner(doc);
  const actors = [];
  let contact = null, keyboard = null, keyboardKey = null, cancelledKey = null, epoch = 0, released = null, raf;
  const url = path => new URL(original(`ui/${path}`), doc.baseURI).href;
  function stop(stream) { stream?.handles.forEach(h => h.stop()); }
  function stream(id, { skipInitialCues = false } = {}) {
    const clip = data.scripts[id];
    let sound = 0;
    // Readiness can take over a selection whose fallback already played this cue.
    if (skipInitialCues) while (clip.sounds?.[sound]?.tick <= 0) sound++;
    return { id, clip, tick: 0, next: view.performance.now() + clip.tickMs, sound, handles: new Map(), finished: false };
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
  function auxiliaryOff(a) { if (a.aux && a.base) a.base.next = authoritative ? view.performance.now() + (a.remaining ?? a.base.clip.tickMs) : Math.max(a.base.next, view.performance.now()); stop(a.aux); a.aux = null; a.hover.hidden = true; }
  function state(a, value, { skipInitialCues = false } = {}) {
    auxiliaryOff(a); a.state = value;
    const id = a.record.stateScripts[value];
    if (a.base?.id !== id) { stop(a.base); a.base = stream(id, { skipInitialCues }); cues(a.base); }
    paint(a); schedule();
  }
  function unavailable(a) { return a.control.hidden || a.control.matches(':disabled') || a.control.getAttribute('aria-disabled') === 'true'; }
  function selected(a) { if (momentary) return false; return authoritative ? a.action === `tray:${selection}` : a.control.getAttribute('aria-pressed') === 'true'; }
  function terminal(a) {
    auxiliaryOff(a); stop(a.base); a.state = selected(a) ? 2 : 0;
    a.base = stream(a.record.stateScripts[a.state], { skipInitialCues: true });
    a.base.tick = a.base.clip.endCheckTick; a.base.sound = a.base.clip.sounds?.length ?? 0;
    a.base.finished = true; paint(a);
  }
  function updateSelection(value, { reason = 'liveSelection' } = {}) {
    const previous = selection; selection = value;
    for (const a of actors) {
      if (!a.ready) continue;
      if (reason !== 'liveSelection') { terminal(a); continue; }
      if (previous === value) continue;
      if (selected(a)) onGroup(a.record.group, a.record.name);
      if (a.action === `tray:${previous}` || selected(a)) state(a, selected(a) ? 2 : 0);
    }
  }
  function settle(a, options) { state(a, selected(a) ? 2 : 0, options); }
  function completeActivation() {
    const a = activation; activation = null;
    if (!a || !a.ready) return;
    if (momentary) state(a, 0);
    else if (selected(a)) state(a, 2); else terminal(a);
  }
  const keyContact = Symbol('mode1-key');
  function releaseKey() { guard.release(root, keyContact); }
  function cancel() {
    epoch++;
    view.clearTimeout(adoptionTimer);
    const held = contact; contact = null;
    if (keyboard) cancelledKey = keyboardKey;
    releaseKey(); keyboard = null; keyboardKey = null;
    if (held) { released = held; guard.release(root, held.id); }
    if (fallbackPointer) { released = fallbackPointer; guard.release(root, fallbackPointer.id); }
    fallbackPointer = null; fallbackContact = null; activation = null;
    actors.forEach(a => { a.decoded = false; });
    actors.forEach(a => { if (a.ready) { if (terminalAdoption) terminal(a); else { settle(a); stop(a.base); } } });
  }
  async function prepare(a) {
    if (a.ready || a.loading) return;
    a.loading = true;
    const pendingEpoch = epoch, generation = a.generation;
    try {
      await Promise.all([...new Set([...a.record.stateScripts.filter(Boolean), a.record.rolloverScript])].flatMap(id => data.scripts[id].frames.map(f => preloadButtonImage(view, url(f.image)))));
      if (listeners.signal.aborted || pendingEpoch !== epoch || generation !== a.generation || unavailable(a)) return;
      if (terminalAdoption && (fallbackContact === a || keyboard === a)) { a.decoded = true; return; }
      adopt(a);
      if (a.inside && a.hoverAllowed && !selected(a) && !unavailable(a) && !contact && !keyboard && !guard.busy()) startHover(a);
    } catch { /* A later entry retries; static binding stays usable. */ }
    finally { a.loading = false; }
  }
  function adopt(a) {
    a.ready = true; a.decoded = false;
    if (readSelection) selection = readSelection();
    onReady(a.record.name);
    if (terminalAdoption) terminal(a); else settle(a, { skipInitialCues: selected(a) });
  }
  function finishFallback() {
    if (!fallbackContact) return;
    if (fallbackPointer) guard.release(root, fallbackPointer.id);
    if (keyboard === fallbackContact) { releaseKey(); keyboard = null; keyboardKey = null; }
    fallbackPointer = null; fallbackContact = null;
    // Run after the browser's release/default-click transaction. Adoption must
    // observe its committed tray and must never steal the fallback activation.
    view.clearTimeout(adoptionTimer);
    const generation = epoch;
    adoptionTimer = view.setTimeout(() => {
      if (!listeners.signal.aborted && epoch === generation)
        actors.forEach(a => { if (a.decoded) adopt(a); });
    }, 0);
  }
  function startHover(a) {
    if (a.aux) return;
    onGroup(a.record.group, a.record.name);
    a.remaining = Math.max(0, a.base.next - view.performance.now());
    if (!authoritative) stop(a.base);
    a.aux = stream(a.record.rolloverScript); cues(a.aux); paint(a); schedule();
  }
  for (const { name, action } of bindings) {
    const record = data?.buttons?.find(b => b.name === name);
    const control = root.querySelector(`[data-action="${action}"]`), idle = sprites.get(name);
    if (!record || !control || !idle || (momentary ? record.stateScripts[2] || record.stateScripts[3] : !record.stateScripts[2])
      || record.hotspotRegion?.status !== 'exact'
      || [...record.stateScripts.filter(Boolean), record.rolloverScript].some(id => !data.scripts[id]?.frames?.length || !(data.scripts[id].tickMs > 0) || data.unsupportedScripts?.[id])) continue;
    const image = doc.createElement('img'), hover = doc.createElement('img');
    for (const img of [image, hover]) { img.className = 'native-sprite'; img.alt = ''; img.draggable = false; img.hidden = true; layer.append(img); }
    image.dataset[actorAttribute] = name; hover.dataset.nativeRollover = name;
    const a = { record, action, control, idle, image, hover, ready: false, state: 0, generation: 0 };
    actors.push(a);
    control.addEventListener('pointerenter', event => {
      a.inside = true; a.hoverAllowed = !event.buttons;
      void prepare(a);
      if (!a.ready || unavailable(a) || contact || keyboard || guard.busy() || event.buttons || selected(a)) return;
      startHover(a);
    }, options);
    // Pending decoding must not turn a still-held fallback press into hover.
    control.addEventListener('pointerdown', event => {
      a.hoverAllowed = false;
      if (terminalAdoption && !a.ready && event.button === 0 && guard.claim(event, root)) {
        fallbackContact = a; fallbackPointer = { a, id: event.pointerId, pointerType: event.pointerType };
      }
    }, options);
    if (terminalAdoption) control.addEventListener('keydown', event => {
      if (a.ready || !['Enter', ' '].includes(event.key)) return;
      if (event.repeat || !guard.claim({ pointerId: keyContact }, root)) { event.preventDefault(); return; }
      cancelledKey = null; keyboard = a; keyboardKey = event.key; fallbackContact = a;
    }, options);
    control.addEventListener('pointerleave', () => { a.inside = false; auxiliaryOff(a); paint(a); schedule(); }, options);
    const observer = new view.MutationObserver(() => {
      if (!a.ready) return;
      if (unavailable(a)) { cancel(); image.hidden = true; hover.hidden = true; idle.hidden = false; a.ready = false; }
      else if (!authoritative && contact?.a !== a && keyboard !== a) settle(a);
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
    released = null;
    contact = { a, id: event.pointerId, pointerType: event.pointerType, inside: true };
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
    if (!authoritative) { if (inside) state(held.a, 2); else settle(held.a); }
    else if (!inside) terminal(held.a);
    guard.release(root, held.id);
    // Capture retargets the compatibility click to the layer. Preserve the
    // existing semantic activation exactly once using the original control.
    if (inside) held.a.control.click();
    if (authoritative && held.a.state === 1) { if (momentary) settle(held.a); else terminal(held.a); }
  }, options);
  root.addEventListener('click', event => {
    const sameReleasedControl = released && (event.target === root || released.a.control.contains(event.target));
    // WebKit can give a consumed touch's mouse compatibility click another ID.
    const touchCompatibility = released?.pointerType === 'touch' && event.pointerType === 'mouse' && sameReleasedControl;
    if (event.detail > 0 && released && (event.pointerId === released.id
      || (!('pointerId' in event) && sameReleasedControl) || touchCompatibility)) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const a = hit(event);
    if (!a) return;
    // A fallback press can become ready before its physical release/click.
    // Start its source state before main decides who owns the activation cue.
    if (contact || (guard.busy() && keyboard !== a)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    onGroup(a.record.group, a.record.name);
    if (keyboard !== a) state(a, 1);
    releaseKey(); keyboard = null; keyboardKey = null;
    if (!authoritative) state(a, 2);
    else activation = a;
  }, { ...options, capture: true });
  root.addEventListener('keydown', event => {
    const a = hit(event);
    if (a && ['Enter', ' '].includes(event.key) && event.repeat) { event.preventDefault(); return; }
    if (a && ['Enter', ' '].includes(event.key) && !event.repeat) {
      if (contact || !guard.claim({ pointerId: keyContact }, root)) { event.preventDefault(); return; }
      if (momentary) event.preventDefault();
      cancelledKey = null; keyboard = a; keyboardKey = event.key; state(a, 1);
    }
  }, options);
  if (momentary) root.addEventListener('keyup', event => {
    if (keyboard && event.key === keyboardKey && !fallbackContact) {
      event.preventDefault();
      const a = keyboard;
      a.control.click();
    }
  }, options);
  if (terminalAdoption) {
    doc.addEventListener('pointerup', finishFallback, options);
    doc.addEventListener('pointercancel', finishFallback, options);
    doc.addEventListener('keyup', event => { if (fallbackContact === keyboard && event.key === keyboardKey) finishFallback(); }, options);
    root.addEventListener('click', () => { if (fallbackContact) finishFallback(); }, options);
  }
  // A captured pointer can outlive focus in the hit layer.
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); }, { ...options, capture: true });
  // Prevent only the cancelled key's default activation, even after focus moves.
  doc.addEventListener('keyup', event => {
    if (event.key === cancelledKey) { event.preventDefault(); cancelledKey = null; }
  }, { ...options, capture: true });
  root.addEventListener('focusout', () => { if (keyboard) cancel(); }, options);
  for (const type of ['pointercancel', 'lostpointercapture']) root.addEventListener(type, event => { if (contact?.id === event.pointerId) cancel(); }, options);
  for (const type of ['blur', 'pagehide']) view.addEventListener(type, cancel, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, options);
  return { updateSelection, completeActivation, cancel: name => {
    if (name === undefined) cancel();
    else {
      const a = actors.find(a => a.record.name === name);
      if (!a) return;
      a.generation++; a.decoded = false;
      if (terminalAdoption && a.ready) terminal(a);
      else { auxiliaryOff(a); stop(a.base); paint(a); }
    }
  },
    cancelGroup: (group, except) => { actors.forEach(a => { if (group && a.record.group === group && a.record.name !== except) { auxiliaryOff(a); paint(a); } }); },
    names: actors.map(a => a.record.name), ready: name => Boolean(actors.find(a => a.record.name === name)?.ready), ownsCue(action) {
    const a = actors.find(a => a.control.dataset.action === action);
    return Boolean(a?.ready && (!authoritative || activation === a) && a.base?.id === a.record.stateScripts[1]);
  }, dispose() { cancel(); listeners.abort(); view.cancelAnimationFrame(raf); actors.forEach(a => a.dispose()); } };
}
