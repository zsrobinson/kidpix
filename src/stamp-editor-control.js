import { onInteractionInactive } from './interaction-owner.js';
import { playUiAudio, observeUiAudio } from './ui-audio.js';

// A tracking script owns its channel independently of silent auxiliary hover.
// Completion retires audio only: the source does not prove a rest-pose flash.
export function trackingCue() {
  let current;
  function stop() {
    const previous = current;
    current = null;
    if (!previous) return;
    previous.dispose?.();
    try { previous.audio.pause(); } catch { /* Cleanup must still retire input. */ }
  }
  return {
    stop,
    play(audio) {
      stop();
      const handle = { audio };
      current = handle;
      playUiAudio(audio);
      handle.dispose = observeUiAudio(audio, () => {
        if (current === handle) current = null;
      });
    },
  };
}

// Modal mode-0 contact seam; physical activation happens at matched release,
// never at a later compatibility click. Keyboard and assistive commands are
// accepted only while the document owner is idle.
export function bindStampControl(control, { owner, signal, activate, render = () => {}, start = () => {}, stop = () => {} }) {
  const options = { signal };
  const window = control.ownerDocument.defaultView;
  let contact = null;
  let hover = false;
  const enabled = () => control.getAttribute('aria-disabled') !== 'true';
  const paint = () => render(contact && contact.inside ? 'tracking' : hover ? 'rollover' : 'rest');
  const inside = event => {
    const rect = control.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom;
  };
  function retire(commit = false) {
    const previous = contact;
    contact = null; // Release may synchronously dispatch lostpointercapture.
    if (previous) {
      // Keep the released physical click quarantined even if activation closes
      // the modal. A new down may reuse the ID; no held rejection is created.
      if (!previous.key) owner.reject({ pointerId: previous.id, pointerType: previous.type }, { down: false, clickOnly: true });
      owner.release(control, previous.id);
      stop();
    }
    paint();
    if (previous && commit && enabled() && !signal.aborted) activate();
  }
  function inactive() { hover = false; retire(); }
  control.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch' || owner.busy() && contact?.id !== event.pointerId) return;
    hover = true; paint();
  }, options);
  control.addEventListener('pointerleave', event => {
    if (contact && contact.id !== event.pointerId) return;
    hover = false;
    if (contact) contact.inside = false;
    paint(); // Auxiliary leave never stops the base tracking cue.
  }, options);
  control.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || !enabled() || contact) return;
    if (!owner.claim(event, control)) return;
    event.preventDefault();
    control.focus();
    contact = { id: event.pointerId, inside: true, type: event.pointerType };
    hover = event.pointerType !== 'touch';
    try { control.setPointerCapture(event.pointerId); }
    catch { inactive(); return; }
    start(); paint();
  }, options);
  window.addEventListener('pointermove', event => {
    if (contact?.id !== event.pointerId) return;
    contact.inside = inside(event);
    hover = contact.type !== 'touch' && contact.inside;
    paint();
  }, options);
  window.addEventListener('pointerup', event => {
    if (contact?.id !== event.pointerId || event.button !== 0) return;
    const commit = inside(event);
    hover = contact.type !== 'touch' && commit;
    retire(commit);
  }, options);
  for (const type of ['pointercancel', 'lostpointercapture']) control.addEventListener(type, event => {
    if (contact?.id === event.pointerId) inactive();
  }, options);
  const key = event => event.code === 'Space' || event.key === ' ' ? 'Space' : event.key === 'Enter' ? 'Enter' : null;
  control.addEventListener('keydown', event => {
    const code = key(event);
    if (!code) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || contact || !enabled()) return;
    const id = `stamp-key:${code}`;
    if (!owner.claim({ pointerId: id }, control)) return;
    contact = { id, key: code, inside: true };
    start(); paint();
  }, options);
  control.addEventListener('keyup', event => {
    const code = key(event);
    if (!code) return;
    event.preventDefault(); event.stopPropagation();
    if (contact?.key === code) retire(true);
  }, options);
  control.addEventListener('blur', () => { if (contact?.key) inactive(); }, options);
  control.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (event.detail !== 0 || event.pointerType || owner.busy() || !enabled() || signal.aborted) return;
    start(); stop(); activate();
  }, options);
  onInteractionInactive(control, inactive, signal);
  signal.addEventListener('abort', inactive, { once: true });
  paint();
}
