import { original } from './library.js';
import { place } from './trays.js';

const source = name => original(`ui/${name}`);

export async function loadNativeUi() {
  const response = await fetch(source('ui.json'));
  if (!response.ok) return null;
  return response.json();
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

export function nativeButtonParts(manifest, root) {
  const remap = { animations: 'tray:toons', fill: 'tray:bucket', export: 'stereo', exit: 'quit', firehose: 'clear', 'paper-texture': 'paper' };
  const trayButtons = ['backgrounds', 'stickers', 'media', 'draw', 'paint', 'mixer', 'stamp', 'text', 'grab', 'eraser'];
  const sprites = new Map();
  for (const [name, part] of Object.entries(manifest.buttons)) {
    const action = remap[name] || (trayButtons.includes(name) ? `tray:${name}` : name);
    const control = name === 'undo-face' ? root.querySelector('[aria-label="Undo Guy"]')
      : name === 'undo' ? root.querySelector('[aria-label="Undo"]')
        : root.querySelector(`[data-action="${action}"]`);
    const image = sprite(part);
    sprites.set(name, image);
    if (control) {
      const update = frame => {
        const disabled = control.getAttribute('aria-disabled') === 'true';
        setSprite(image, part, disabled && part.images.length === 4 ? 3 : frame);
      };
      control.addEventListener('pointerenter', () => update(1));
      control.addEventListener('pointerleave', () => update(0));
      control.addEventListener('pointerdown', () => update(2));
      control.addEventListener('pointerup', () => update(1));
      if (name === 'undo' || name === 'redo') {
        new MutationObserver(() => update(0)).observe(control, { attributes: true, attributeFilter: ['aria-disabled'] });
        update(0);
      }
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

export function renderNativeDrawing(layer, manifest, state) {
  const options = manifest.drawingOptions;
  const controlMap = {
    freehand: 'freehand', line: 'line', curve: 'curve', rectangle: 'rectangle',
    'rectangle-fill': 'filled-rectangle', oval: 'ellipse', 'oval-fill': 'filled-ellipse',
    polygon: 'polygon', 'polygon-fill': 'filled-polygon',
  };
  layer.replaceChildren();
  for (const [name, part] of Object.entries(options)) {
    const size = { 'size-small': 4, 'size-medium': 8, 'size-large': 16 }[name];
    const selected = size === state.sizes.draw || controlMap[name] === state.drawStyle;
    layer.append(sprite(part, name.startsWith('tray-') && part.images.length === 3 ? 2 : selected ? 2 : 0));
  }
  const tint = filterFor(state.color);
  for (const [name, part] of Object.entries(manifest.drawingTools)) {
    const image = sprite(part, name === state.tools.draw ? 0 : 1);
    image.style.filter = tint;
    layer.append(image);
  }
}
