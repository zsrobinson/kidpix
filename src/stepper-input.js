// Retain gestures begun on static steppers while optional source artwork loads.
export function guardStepperInput(controls, { actions, getTarget, activate }) {
  const doc = controls.ownerDocument, view = doc.defaultView;
  const listeners = new view.AbortController();
  const options = { capture: true, signal: listeners.signal };
  const supported = new Set(actions), cancelled = new Set();
  let pending = null, pointer = null;
  function controlFor(event) {
    const control = event.target.closest?.('[data-action]');
    return control && controls.contains(control) && supported.has(control.dataset.action) ? control : null;
  }
  function cancel() {
    for (const press of [pending, pointer]) {
      if (!press) continue;
      press.cancelled = true;
      cancelled.add(press.action);
    }
  }
  view.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancel(); return; }
    const control = controlFor(event);
    if (!control || !['Enter', ' '].includes(event.key)) return;
    if (event.repeat) { event.preventDefault(); return; }
    cancel();
    cancelled.delete(control.dataset.action);
    if (event.key !== ' ') return;
    pending = null;
    if (control.hasAttribute('data-native-motion-index')) return;
    const target = getTarget();
    event.preventDefault();
    if (!control.disabled) pending = { control, action: control.dataset.action, target, cancelled: false };
  }, options);
  view.addEventListener('keyup', event => {
    if (event.key !== ' ' || !pending) return;
    const press = pending;
    pending = null;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = getTarget();
    if (press.cancelled || !press.control.isConnected || press.control.disabled
      || controlFor(event) !== press.control || doc.activeElement !== press.control || target !== press.target) {
      cancelled.add(press.action);
      return;
    }
    activate(press.action);
  }, options);
  view.addEventListener('click', event => {
    const control = controlFor(event);
    if (pointer && event.detail > 0) {
      const press = pointer;
      pointer = null;
      if (control === press.control) {
        event.preventDefault(); event.stopImmediatePropagation();
        const hit = doc.elementFromPoint(event.clientX, event.clientY);
        if (press.released && !press.cancelled && press.control.isConnected && !press.control.disabled
          && (event.pointerId === undefined || event.pointerId === press.pointerId)
          && press.control.contains(hit) && getTarget() === press.target) activate(press.action);
        return;
      }
    }
    if (control && event.detail === 0 && cancelled.has(control.dataset.action)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, options);
  view.addEventListener('pointerdown', event => {
    cancel();
    const control = controlFor(event);
    if (control) cancelled.delete(control.dataset.action);
    pointer = control && event.button === 0 && !control.disabled
      && !control.hasAttribute('data-native-motion-index')
      ? { control, action: control.dataset.action, pointerId: event.pointerId,
          target: getTarget(), cancelled: false, released: false } : null;
  }, options);
  view.addEventListener('pointerup', event => {
    if (pointer?.pointerId === event.pointerId) pointer.released = true;
  }, options);
  view.addEventListener('pointercancel', event => {
    if (pointer?.pointerId === event.pointerId) pointer.cancelled = true;
  }, options);
  view.addEventListener('lostpointercapture', event => {
    if (pointer?.pointerId === event.pointerId && !pointer.released) pointer.cancelled = true;
  }, options);
  controls.addEventListener('focusout', event => { if (pending?.control === event.target) cancel(); }, options);
  for (const type of ['blur', 'pagehide']) view.addEventListener(type, cancel, { signal: listeners.signal });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, { signal: listeners.signal });
  return () => { listeners.abort(); pending = pointer = null; cancelled.clear(); };
}
