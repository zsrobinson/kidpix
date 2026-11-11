// NORMAL 32×32 browser adaptation. Geometry/timing are source-backed; this
// pixel-center mask is deliberately not an oracle for QuickDraw PaintOval.
export const eraseRectangles = Object.freeze(Array.from({ length: 7 }, (_, i) =>
  Object.freeze([17 - i * 2, 15 - i * 2, 19 + i * 2, 17 + i * 2])));
export const eraseInterval = 66;

export function paintBrowserOval(context, [top, left, bottom, right]) {
  const rx = (right - left) / 2, ry = (bottom - top) / 2;
  const cx = (right + left) / 2, cy = (bottom + top) / 2;
  context.fillStyle = '#ffffff';
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1) context.fillRect(x, y, 1, 1);
  }
}

// Callers keep paint/context/history private. prepare must be nonmutating;
// rollback restores a failed commit, including preview and the history stack.
export function normalErase({ width, height, prepare, render, commit, rollback,
  start = () => {}, stop = () => {}, settle = () => {},
  schedule = callback => setTimeout(callback, eraseInterval), unschedule = clearTimeout }) {
  if (width !== 32 || height !== 32) throw new Error('Unsupported stamp erase geometry');
  let active = true, timer, index = 0;
  const safe = action => { try { action(); } catch { /* Cleanup cannot strand ownership. */ } };
  function finish(cancelled) {
    if (!active) return;
    active = false;
    safe(() => unschedule(timer));
    if (cancelled) safe(rollback);
    safe(stop);
    safe(settle);
  }
  function advance() {
    if (!active) return;
    try {
      if (index === eraseRectangles.length) { commit(); finish(false); return; }
      render(eraseRectangles[index++]);
      // A delivered callback advances exactly once; rearm from delivery time.
      timer = schedule(advance);
    } catch { finish(true); }
  }
  const operation = { cancel: () => finish(true), get active() { return active; } };
  try { prepare(); safe(start); advance(); } catch { finish(true); }
  return operation;
}
