import { original } from './library.js';
import { place } from './trays.js';
import addPicture from './add-picture-rollover.json';

const source = name => original(`ui/${name}`);

export async function loadNativeUi() {
  const response = await fetch(source('ui.json'));
  if (!response.ok) return null;
  const manifest = await response.json();
  const data = manifest.buttonAnimations;
  const button = data?.buttons?.find(button => button.name === 'flipbook');
  // Immutable source adapter for older published original manifests.
  if (button?.rolloverScript === 1128 && button.command === 301
      && button.stateScripts?.[0] === 1126 && button.stateScripts?.[1] === 1127) {
    data.scripts = { ...data.scripts, '1128': structuredClone(addPicture) };
    data.unsupportedScripts = { ...data.unsupportedScripts };
    delete data.unsupportedScripts['1128'];
  }
  return manifest;
}

export function sprite(part, frame = 0) {
  const image = document.createElement('img');
  image.className = 'native-sprite';
  image.alt = '';
  image.draggable = false;
  image.style.cssText = place(part.x, part.y, part.w, part.h);
  image.src = source(part.images[frame] ?? part.images[0]);
  return image;
}

export function setSprite(image, part, frame) {
  image.src = source(part.images[frame] ?? part.images[0]);
}

export function nativeCursor(manifest, id, fallback = 'crosshair') {
  const cursor = manifest?.cursors?.items[String(id)];
  const frame = cursor?.frames[manifest.cursors.preferredFrame ?? 0];
  if (cursor?.pngUsable === false || !frame || frame.width > 128 || frame.height > 128 || frame.greenPixels) return fallback;
  // CSS variables resolve relative URLs at the consuming stylesheet's URL.
  // Built styles live under assets/, so resolve against the page explicitly.
  return `url("${new URL(source(frame.image), document.baseURI).href}") ${cursor.hotspot.join(' ')}, ${fallback}`;
}

function bindSprite(control, image, part, selectedFrame, disabledFrame) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let hovered = false;
  let pressed = false;
  const update = () => {
    const selected = control.getAttribute('aria-pressed') === 'true';
    const disabled = control.getAttribute('aria-disabled') === 'true';
    const frame = disabled && disabledFrame !== undefined ? disabledFrame
      : selected && selectedFrame !== undefined ? selectedFrame : pressed ? 2 : hovered ? 1 : 0;
    setSprite(image, part, frame);
  };
  control.classList.add('native-control');
  control.addEventListener('pointerenter', () => { hovered = true; update(); }, options);
  control.addEventListener('pointerleave', () => { hovered = false; pressed = false; update(); }, options);
  control.addEventListener('pointerdown', () => { pressed = true; update(); }, options);
  control.addEventListener('pointerup', () => { pressed = false; update(); }, options);
  control.addEventListener('pointercancel', () => { pressed = false; update(); }, options);
  const observer = new MutationObserver(update);
  observer.observe(control, { attributes: true, attributeFilter: ['aria-disabled', 'aria-pressed'] });
  update();
  return () => { observer.disconnect(); listeners.abort(); };
}

export function nativeButtonParts(manifest, root, { excludeNames = [] } = {}) {
  const remap = { animations: 'tray:toons', fill: 'tray:bucket', export: 'stereo', exit: 'quit', firehose: 'clear', 'paper-texture': 'paper', 'undo-face': 'undo-face' };
  const trayButtons = ['backgrounds', 'stickers', 'media', 'draw', 'paint', 'mixer', 'stamp', 'text', 'grab', 'eraser'];
  const sprites = new Map();
  for (const [name, originalPart] of Object.entries(manifest.buttons)) {
    const idle = name === 'undo-face' && manifest.undoAnimations?.idle;
    const part = idle ? { x: idle.rect[0], y: idle.rect[1], w: idle.rect[2], h: idle.rect[3], images: [idle.frames[0].image] } : originalPart;
    const action = remap[name] || (trayButtons.includes(name) ? `tray:${name}` : name);
    const control = name === 'undo-face' ? root.querySelector('[aria-label="Undo Guy"]')
      : name === 'undo' ? root.querySelector('[aria-label="Undo"]')
        : root.querySelector(`[data-action="${action}"]`);
    const image = sprite(part);
    image.dataset.nativePart = name;
    sprites.set(name, image);
    if (control && name === 'flipbook' && manifest.buttonAnimations?.scripts?.['1128']?.clipRect) control.classList.add('native-control');
    if (control && !excludeNames.includes(name) && !(name === 'flipbook' && manifest.buttonAnimations?.scripts?.['1128']?.clipRect)) {
      bindSprite(control, image, part, control.classList.contains('side') ? 3 : undefined,
        name === 'undo' || name === 'redo' ? 3 : undefined);
    }
  }
  return sprites;
}

function filterFor(color) {
  const rgb = color.match(/[a-f\d]{2}/gi)?.map(hex => parseInt(hex, 16) / 255);
  if (!rgb || rgb.length !== 3) return 'none';
  const [r, g, b] = rgb;
  const highest = Math.max(...rgb);
  const lowest = Math.min(...rgb);
  const delta = highest - lowest;
  if (delta < .07) return `grayscale(1) brightness(${.46 + highest * 1.45})`;
  const sector = highest === r ? (g - b) / delta : highest === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return `hue-rotate(${sector * 60}deg) saturate(${.5 + delta * .5}) brightness(${.8 + highest * .25})`;
}

export function renderNativeSizes(layer, manifest, size, controls = layer) {
  const parts = manifest.drawingOptions;
  const base = sprite(parts['tray-size']);
  base.dataset.nativePart = 'tray-size';
  layer.append(base);
  const bindings = [];
  for (const [name, value] of [['size-small', 4], ['size-medium', 8], ['size-large', 16]]) {
    const part = parts[name];
    const image = sprite(part, size === value ? 2 : 0);
    image.dataset.nativePart = name;
    layer.append(image);
    const control = controls.querySelector(`[data-action="size:${value}"]`);
    if (control) {
      control.style.cssText = place(part.x, part.y, part.w, part.h);
      bindings.push(bindSprite(control, image, part, 2));
    }
  }
  return () => bindings.forEach(disconnect => disconnect());
}

export function renderNativeDrawing(layer, manifest, state, controls) {
  const options = manifest.drawingOptions;
  const controlMap = {
    freehand: 'freehand', line: 'line', curve: 'curve', rectangle: 'rectangle',
    'rectangle-fill': 'filled-rectangle', oval: 'ellipse', 'oval-fill': 'filled-ellipse',
    polygon: 'polygon', 'polygon-fill': 'filled-polygon',
  };
  layer.replaceChildren();
  const bindings = [];
  for (const [name, part] of Object.entries(options)) {
    const size = { 'size-small': 4, 'size-medium': 8, 'size-large': 16 }[name];
    const selected = size === state.sizes.draw || controlMap[name] === state.drawStyle;
    if (name === 'tray-up' || name === 'tray-down') {
      layer.append(sprite(part, 2));
      continue;
    }
    const image = sprite(part, selected ? 2 : 0);
    image.dataset.nativePart = name;
    layer.append(image);
    const action = size ? `size:${size}` : controlMap[name] ? `style:${controlMap[name]}` : null;
    const control = action && controls?.querySelector(`[data-action="${action}"]`);
    if (control) {
      control.style.cssText = place(part.x, part.y, part.w, part.h);
      bindings.push(bindSprite(control, image, part, 2));
    }
  }
  const tint = filterFor(state.color);
  for (const [name, part] of Object.entries(manifest.drawingTools)) {
    const image = sprite(part, name === state.tools.draw ? 0 : 1);
    image.style.filter = tint;
    image.dataset.nativeDrawingTool = name;
    layer.append(image);
  }
  return () => bindings.forEach(disconnect => disconnect());
}
