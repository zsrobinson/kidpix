import { createNativeColorPickerMotion, drawColorPickerFrame, colorPickerContains, colorPickerHit } from './native-color-picker-motion.js';
import { interactionOwner, onInteractionInactive } from './interaction-owner.js';

// Scene-space adapter. The helper owns authored programs, clocks and cue gates;
// this module owns DOM/input, cancellable loading and browser fallback policy.
export function createStudioColorPicker({ studio, palette, trigger, original, getColor,
  renderControls, fallback, select, preview, eyedropper }) {
  const actor = document.createElement('canvas');
  actor.id = 'color-picker-actor'; actor.width = 1024; actor.height = 768;
  actor.setAttribute('aria-hidden', 'true'); studio.append(actor);
  const context = actor.getContext('2d', { willReadFrequently: true });
  const owner = interactionOwner(studio.ownerDocument);
  let picker, manifest, images, request, generation = 0, contact, failed = false;
  const sounds = new Set();
  function sound(cue) {
    if (!cue.audio) return null;
    const audio = new Audio(original(`ui/color-picker-motion/${cue.audio}`));
    sounds.add(audio);
    const done = () => sounds.delete(audio);
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('pause', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.play().catch(() => { audio.dispatchEvent(new Event('error')); done(); });
    return audio;
  }
  function release() {
    if (!contact) return;
    const id = contact.id; contact = null;
    owner.release(palette, id);
  }
  function controls(live) {
    palette.hidden = !live;
    trigger.setAttribute('aria-expanded', String(live));
  }
  function clear() { context.clearRect(0, 0, 1024, 768); }
  function base() {
    const clip = manifest.clips.opening;
    drawColorPickerFrame(context, manifest, clip, clip.frames.at(-1), path => images.get(path));
  }
  function drawDropper(name) {
    const clip = manifest.clips[name];
    drawColorPickerFrame(context, manifest, clip, clip.frames[0], path => images.get(path));
  }
  function stopSounds() {
    for (const audio of sounds) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    sounds.clear();
  }
  function reset() {
    generation++; request?.abort(); request = null;
    release(); picker?.dispose(); picker = null; failed = false;
    stopSounds(); clear(); controls(false); palette.dataset.phase = 'closed';
    preview(getColor());
  }
  function close() {
    release();
    if (request) { reset(); return; }
    if (failed) { failed = false; controls(false); palette.dataset.phase = 'closed'; return; }
    picker?.close();
  }
  async function open() {
    if (request || picker && picker.state !== 'closed') return;
    failed = false; controls(false);
    const token = ++generation;
    request = new AbortController();
    palette.dataset.phase = 'loading';
    try {
      // Cache only a complete decode; a failed or cancelled attempt is retryable.
      if (!images) {
        const response = await fetch(original('ui/color-picker-motion/manifest.json'), { signal: request.signal });
        if (!response.ok) throw new Error(`Color picker manifest: ${response.status}`);
        const next = await response.json();
        const decoded = new Map();
        await Promise.all(Object.values(next.sprites).map(async ({ image: path }) => {
          const response = await fetch(original(`ui/color-picker-motion/${path}`), { signal: request.signal });
          if (!response.ok) throw new Error(`Color picker image: ${response.status}`);
          const url = URL.createObjectURL(await response.blob());
          try { const image = new Image(); image.src = url; await image.decode(); decoded.set(path, image); }
          finally { URL.revokeObjectURL(url); }
        }));
        if (token !== generation) return;
        manifest = next; images = decoded;
      }
      if (token !== generation) return;
      request = null;
      picker?.dispose();
      renderControls();
      palette.classList.add('motion-palette');
      palette.style.backgroundImage = 'none';
      picker = createNativeColorPickerMotion({ manifest, color: getColor(), playSound: sound,
        onSampleSound: sound,
        render({ clip, frame, overlay }) {
          clear();
          if (overlay) base();
          if (frame) drawColorPickerFrame(context, manifest, clip, frame, path => images.get(path));
          if (picker?.state === 'open' && !overlay) drawDropper('dropperRest');
        },
        onState(phase) {
          if (phase === 'closing' || phase === 'closed') release();
          palette.dataset.phase = phase; controls(phase === 'open');
        },
        onPreview: preview, onSelect(color) {
          const custom = palette.querySelector('input[type="color"]');
          if (custom) custom.value = color;
          select(color);
        },
        readColor(x, y) {
          const data = context.getImageData(x, y, 1, 1).data;
          return data[3] ? '#' + [...data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('') : null;
        },
      });
      await picker.open();
    } catch (error) {
      if (token !== generation) return;
      request?.abort(); request = null; clear();
      palette.classList.remove('motion-palette'); fallback(); failed = true;
      controls(true); palette.dataset.phase = 'fallback';
    }
  }
  const point = event => {
    const rect = studio.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 1024 / rect.width,
      y: (event.clientY - rect.top) * 768 / rect.height };
  };
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  studio.addEventListener('pointerdown', event => {
    if (picker?.state !== 'open' || event.target.closest('input')) return;
    const { x, y } = point(event);
    const dropper = colorPickerContains(manifest.dropperRegion, x, y);
    if (!dropper && !colorPickerHit(manifest, x, y)) return;
    if (!owner.claim(event, palette)) return;
    consume(event); contact = { id: event.pointerId, dropper };
    try { palette.setPointerCapture(event.pointerId); } catch { /* Synthetic contacts have no browser capture. */ }
    if (dropper) picker.setDropperState('tracking'); else picker.pointerDown(x, y);
  }, true);
  studio.addEventListener('pointermove', event => {
    if (picker?.state !== 'open' || palette.contains(document.activeElement) && !contact) return;
    if (contact && contact.id !== event.pointerId) return;
    const { x, y } = point(event);
    if (contact) { consume(event); if (!contact.dropper) picker.move(x, y); }
    else if (event.pointerType === 'mouse') {
      if (event.target.closest('#color-button, input')) return;
      picker.setDropperState(colorPickerContains(manifest.dropperRegion, x, y) ? 'hover' : 'rest');
      picker.move(x, y);
    }
  }, true);
  studio.addEventListener('pointerup', event => {
    if (!contact || contact.id !== event.pointerId) return;
    consume(event); const { x, y } = point(event), dropper = contact.dropper;
    release();
    if (dropper) {
      picker.setDropperState('rest');
      if (colorPickerContains(manifest.dropperRegion, x, y)) { close(); eyedropper(); }
    } else picker.pointerUp(x, y);
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) palette.addEventListener(type, () => { if (contact) close(); });
  // Captured source hits must not also activate estimated DOM chip commands.
  palette.addEventListener('click', event => {
    if (picker?.state === 'open' && event.detail > 0 && !event.target.closest('input')) consume(event);
  }, true);
  onInteractionInactive(palette, reset);
  return { open, close, reset, setColor(color) {
      picker?.setColor(color);
      const custom = palette.querySelector('input[type="color"]');
      if (custom) custom.value = color;
    },
    get active() { return Boolean(request || failed || picker && picker.state !== 'closed'); } };
}
