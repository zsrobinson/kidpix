import { interactionOwner } from './interaction-owner.js';

// Retain gestures begun on static controls while optional source artwork loads.
export function guardStepperInput(controls, { actions, getTarget, activate }) {
  const doc = controls.ownerDocument, view = doc.defaultView;
  const listeners = new view.AbortController();
  const options = { capture: true, signal: listeners.signal };
  const actionSet = typeof actions === 'function' ? null : new Set(actions);
  const supported = typeof actions === 'function' ? actions : action => actionSet.has(action);
  const owner = interactionOwner(doc), keyContact = Symbol('static-tray-key');
  let pending = null, pointer = null;
  const release = press => { if (press) owner.release(controls, press.pointerId ?? keyContact); };
  function controlFor(event) {
    const control = event.target.closest?.('[data-action]');
    return control && controls.contains(control) && supported(control.dataset.action) ? control : null;
  }
  function cancel() {
    for (const press of [pending, pointer]) {
      if (!press) continue;
      press.cancelled = true;
      release(press);
    }
  }
  view.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancel(); return; }
    const control = controlFor(event);
    if (!control || !['Enter', ' '].includes(event.key)) return;
    if (event.repeat) { event.preventDefault(); return; }
    if (pending && !pending.cancelled || pointer && !pointer.released && !pointer.cancelled || owner.busy()) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    cancel();
    if (event.key !== ' ') return;
    pending = null;
    if (control.hasAttribute('data-native-motion-index')) return;
    const target = getTarget(control.dataset.action);
    event.preventDefault();
    if (!control.disabled && owner.claim({ pointerId: keyContact }, controls)) pending = { control, action: control.dataset.action, target, cancelled: false };
  }, options);
  view.addEventListener('keyup', event => {
    if (event.key !== ' ' || !pending) return;
    const press = pending;
    pending = null;
    release(press);
    event.preventDefault(); event.stopImmediatePropagation();
    const target = getTarget(press.action);
    if (press.cancelled || !press.control.isConnected || press.control.disabled
      || controlFor(event) !== press.control || doc.activeElement !== press.control || target !== press.target) {
      return;
    }
    activate(press.action);
  }, options);
  view.addEventListener('click', event => {
    // An independent keyboard/assistive or programmatic command supersedes
    // this held fallback. Release before another chrome owner handles it.
    if (event.detail === 0 && !controls.contains(event.target)
      && event.target.closest?.('[data-action]')) cancel();
    const control = controlFor(event);
    if (control && event.detail === 0 && (pending && !pending.cancelled || pointer && !pointer.released && !pointer.cancelled)) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const touchCompatibility = pointer?.pointerType === 'touch' && event.pointerType === 'mouse'
      && (control?.dataset.action === pointer.action || event.target === controls);
    if (pointer && event.detail > 0 && event.pointerId !== undefined && event.pointerId !== pointer.pointerId && !touchCompatibility) {
      if (control) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (pointer && event.detail > 0) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (pointer.released || pointer.cancelled) { release(pointer); pointer = null; }
    }
  }, options);
  view.addEventListener('pointerdown', event => {
    if (pointer && !pointer.released && !pointer.cancelled) return;
    cancel();
    const control = controlFor(event);
    pointer = control && event.button === 0 && !control.disabled
      && !control.hasAttribute('data-native-motion-index')
      && owner.claim(event, controls)
      ? { control, action: control.dataset.action, pointerId: event.pointerId,
          pointerType: event.pointerType, target: getTarget(control.dataset.action), cancelled: false, released: false } : null;
  }, options);
  view.addEventListener('pointerup', event => {
    if (pointer?.pointerId !== event.pointerId || pointer.released) return;
    const press = pointer;
    press.released = true; release(press);
    // Browser compatibility clicks can disappear after rejected incidental
    // touch or a semantic render. Commit the original accepted release once.
    if (press.cancelled || !press.control.isConnected) return;
    const target = getTarget(press.action), hit = doc.elementFromPoint(event.clientX, event.clientY);
    if (!press.control.disabled && press.control.contains(hit) && target === press.target) activate(press.action);
  }, options);
  view.addEventListener('pointercancel', event => {
    if (pointer?.pointerId === event.pointerId) { pointer.cancelled = true; release(pointer); }
  }, options);
  view.addEventListener('lostpointercapture', event => {
    if (pointer?.pointerId === event.pointerId && !pointer.released) { pointer.cancelled = true; release(pointer); }
  }, options);
  controls.addEventListener('focusout', event => { if (pending?.control === event.target) cancel(); }, options);
  for (const type of ['blur', 'pagehide']) view.addEventListener(type, cancel, { signal: listeners.signal });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, { signal: listeners.signal });
  return () => { cancel(); listeners.abort(); pending = pointer = null; };
}
