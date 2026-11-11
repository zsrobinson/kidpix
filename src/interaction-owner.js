// One owner per document, shared by paper, objects, paths and modal editors.
// Install on window capture before chrome's capture handlers (including popups).
const owners = new WeakMap();

export function interactionOwner(document = globalThis.document) {
  if (owners.has(document)) return owners.get(document);
  let active = null;
  // Browser dblclick is a MouseEvent, even after PointerEvent clicks. Retain
  // the physical sequence's disposition when that activation has no identity.
  let lastPhysicalClickRejected = false;
  const rejected = new Map();
  // A modal may disappear on pointerup before WebKit's compatibility click.
  // Retain one released sequence until its click or the next primary down;
  // cancelled contacts that emit no click must not accumulate in the map.
  let releasedClick = null;
  const window = document.defaultView;
  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function guard(event) {
    const id = event.pointerId;
    if (event.type === 'dblclick' && event.detail > 0 && lastPhysicalClickRejected) { block(event); return; }
    if (event.type === 'click' && event.detail > 0) {
      // Release handlers retire the owner before the browser's physical click.
      // WebKit can remap a rejected touch's compatibility click to a mouse ID.
      if (active) { lastPhysicalClickRejected = true; block(event); return; }
      if (!rejected.has(id) && releasedClick && (id === releasedClick.pointerId
        || releasedClick.pointerType === 'touch' && event.pointerType === 'mouse'
        || id === undefined)) {
        releasedClick = null;
        lastPhysicalClickRejected = true;
        block(event);
        return;
      }
      lastPhysicalClickRejected = rejected.has(id)
        || Boolean(event.pointerType === 'touch' && active && id !== active.pointerId);
    }
    if (event.type === 'pointerdown') {
      // Pointer IDs can be reused, but never rehabilitate a still-held contact.
      if (rejected.get(id)?.down) { lastPhysicalClickRejected = true; block(event); return; }
      rejected.delete(id);
      if (active && id !== active.pointerId) {
        rejected.set(id, { down: true });
        lastPhysicalClickRejected = true;
        block(event);
      } else {
        lastPhysicalClickRejected = false;
        if (event.isPrimary !== false && (event.button === undefined || event.button === 0)) releasedClick = null;
      }
      return;
    }
    if (rejected.has(id)) {
      if (event.type === 'pointerup' || event.type === 'pointercancel') {
        const contact = rejected.get(id);
        contact.down = false;
        if (contact.quarantineClick) {
          rejected.delete(id);
          releasedClick = { pointerId: id, pointerType: contact.pointerType };
        }
      }
      block(event);
      return;
    }
    // Also suppress pre-down touch hover/enter so chrome cannot react first.
    // Keyboard/assistive clicks have no physical pointer and remain available.
    if (event.pointerType === 'touch' && active && id !== active.pointerId) block(event);
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'lostpointercapture',
    'click', 'dblclick', 'contextmenu']) window.addEventListener(type, guard, { capture: true, passive: false });
  // An interrupted contact may never deliver its terminal event. Keep its click
  // tombstone, while allowing a genuinely new down to reuse the platform ID.
  const interrupted = () => {
    for (const [id, contact] of rejected) {
      contact.down = false;
      if (contact.quarantineClick) {
        rejected.delete(id);
        releasedClick = { pointerId: id, pointerType: contact.pointerType };
      }
    }
  };
  for (const type of ['blur', 'pagehide']) window.addEventListener(type, interrupted);
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupted(); });
  const api = {
    busy: () => Boolean(active),
    // Modal page operations reject a down through its eventual physical click,
    // even when the operation ends before that contact lifts.
    // Released modal controls quarantine their click without suppressing hover.
    // Opt-in operation contacts move from held rejection to that same bounded
    // click record on their terminal event or lifecycle interruption.
    reject(event, { down = true, clickOnly = false, quarantineClick = false } = {}) {
      if (clickOnly) releasedClick = { pointerId: event.pointerId, pointerType: event.pointerType };
      else rejected.set(event.pointerId, quarantineClick ? { down, quarantineClick, pointerType: event.pointerType } : { down });
      lastPhysicalClickRejected = true;
    },
    claim(event, surface) {
      if (active || rejected.has(event.pointerId) || releasedClick?.pointerId === event.pointerId) return false;
      active = { pointerId: event.pointerId, pointerType: event.pointerType, surface };
      return true;
    },
    release(surface, pointerId) {
      if (active?.surface !== surface || active.pointerId !== pointerId) return;
      active = null; // Clear before synchronous capture-loss callbacks.
      if (typeof pointerId === 'number' && surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    },
  };
  owners.set(document, api);
  return api;
}

// The surface owns cancellation semantics; this only wires interruption sources.
export function onInteractionInactive(surface, finish, signal) {
  const document = surface.ownerDocument;
  const window = document.defaultView;
  const options = { signal };
  for (const type of ['blur', 'pagehide', 'resize']) window.addEventListener(type, finish, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
}
