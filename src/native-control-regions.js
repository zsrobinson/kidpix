import { place } from './trays.js';

const actions = {
  animations: 'tray:toons', fill: 'tray:bucket', export: 'stereo', exit: 'quit',
  firehose: 'clear', 'paper-texture': 'paper',
};
const trays = new Set(['backgrounds', 'stickers', 'media', 'draw', 'paint', 'mixer', 'stamp', 'text', 'grab', 'eraser']);

export function regionClipPath(region) {
  if (region?.status !== 'exact' || region.type !== 'rectangle-union') return null;
  const bounds = region.boundsXYWH;
  const rects = region.rectsLTRB;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isSafeInteger)
      || bounds[2] <= 0 || bounds[3] <= 0 || !Array.isArray(rects) || !rects.length) return null;
  const [left, top, width, height] = bounds;
  const paths = [];
  for (const rect of rects) {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger)) return null;
    const [x0, y0, x1, y1] = rect;
    if (x0 < left || y0 < top || x1 > left + width || y1 > top + height || x1 <= x0 || y1 <= y0) return null;
    paths.push(`M${x0 - left} ${y0 - top}H${x1 - left}V${y1 - top}H${x0 - left}Z`);
  }
  // Separate clockwise subpaths fill as a union, including overlapping and
  // disconnected source rectangles. Clip the hit control, never its artwork.
  return `path("${paths.join(' ')}")`;
}

export function applyNativeControlRegions(manifest, root) {
  const data = manifest?.buttonAnimations ?? manifest;
  if (!Array.isArray(data?.buttons) || !root) return 0;
  let applied = 0;
  for (const button of data.buttons) {
    const region = button.hotspotRegion;
    const clip = regionClipPath(region);
    if (!clip) continue;
    const action = actions[button.name] ?? (trays.has(button.name) ? `tray:${button.name}` : button.name);
    const control = [...root.querySelectorAll('[data-action]')].find(element => element.dataset.action === action);
    if (!control) continue;
    const supported = root.ownerDocument.defaultView.CSS?.supports('clip-path', clip);
    if (!supported) continue;
    control.style.cssText = place(...region.boundsXYWH);
    control.style.clipPath = clip;
    control.classList.add('native-region');
    control.dataset.nativeRegion = `${region.resourceType}:${region.resource}`;
    applied++;
  }
  return applied;
}
