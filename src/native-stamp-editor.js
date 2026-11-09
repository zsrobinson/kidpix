import { original } from './library.js';
import { place } from './trays.js';
import { editStamp as editFallbackStamp } from './stamp-editor.js';
import './native-stamp-editor.css';

let manifestPromise;
let editorSession;
const source = path => original(`ui/${path}`);

function loadManifest() {
  manifestPromise ??= fetch(source('stamp-editor/manifest.json'))
    .then(response => response.ok ? response.json() : null).catch(() => null);
  return manifestPromise;
}

function imageAt(path, rect) {
  const image = new Image();
  image.alt = '';
  image.draggable = false;
  image.src = source(path);
  image.style.cssText = place(...rect);
  return image;
}

function strokePixels(from, to, draw) {
  let [x, y] = from;
  const dx = Math.abs(to[0] - x);
  const dy = -Math.abs(to[1] - y);
  const sx = x < to[0] ? 1 : -1;
  const sy = y < to[1] ? 1 : -1;
  let error = dx + dy;
  while (true) {
    draw(x, y);
    if (x === to[0] && y === to[1]) return;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

function fillPixels(context, x, y, color) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const offset = (y * width + x) * 4;
  const previous = image.data.slice(offset, offset + 4);
  const replacement = color.slice(1).match(/../g).map(value => parseInt(value, 16)).concat(255);
  if (replacement.every((value, index) => value === previous[index])) return;
  const pending = [[x, y]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (a < 0 || b < 0 || a >= width || b >= height) continue;
    const position = (b * width + a) * 4;
    if (!previous.every((value, index) => value === image.data[position + index])) continue;
    image.data.set(replacement, position);
    pending.push([a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]);
  }
  context.putImageData(image, 0, 0);
}

export function editStamp(stamp, initialColor, onSave) {
  if (editorSession) return editorSession.promise;
  const session = {};
  editorSession = session;
  session.promise = openStampEditor(stamp, initialColor, onSave).finally(() => {
    if (editorSession === session) editorSession = null;
  });
  return session.promise;
}

async function openStampEditor(stamp, initialColor, onSave) {
  const manifest = await loadManifest();
  if (!manifest) {
    await editFallbackStamp(stamp, initialColor, onSave);
    const fallback = document.querySelector('dialog.stamp-editor[open]');
    if (fallback) await new Promise(resolve => fallback.addEventListener('close', resolve, { once: true }));
    return null;
  }
  const stampImage = new Image();
  stampImage.src = stamp.src;
  await stampImage.decode();

  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const dialog = document.createElement('dialog');
  dialog.className = 'native-stamp-editor';
  dialog.setAttribute('aria-label', 'Stamp Editor');
  dialog.innerHTML = '<div class="native-stamp-stage"><h2 class="native-stamp-heading">Stamp Editor</h2></div>';
  const stage = dialog.firstElementChild;
  stage.append(imageAt(manifest.frame.image, manifest.frame.rect));
  stage.append(imageAt(manifest.palette.image, manifest.palette.rect));
  const canvas = document.createElement('canvas');
  canvas.className = 'native-stamp-pixels';
  [canvas.width, canvas.height] = manifest.pixels;
  canvas.style.cssText = place(...manifest.canvas);
  canvas.setAttribute('aria-label', 'Stamp pixels');
  canvas.tabIndex = 0;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(stampImage, 0, 0, canvas.width, canvas.height);
  const originalPixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const preview = document.createElement('canvas');
  preview.className = 'native-stamp-preview';
  [preview.width, preview.height] = manifest.pixels;
  preview.style.cssText = place(...manifest.preview);
  preview.setAttribute('aria-label', 'Stamp preview');
  const previewContext = preview.getContext('2d');
  previewContext.imageSmoothingEnabled = false;
  const readout = document.createElement('canvas');
  readout.className = 'native-stamp-color';
  [readout.width, readout.height] = manifest.colorReadout.slice(2);
  readout.style.cssText = place(...manifest.colorReadout);
  readout.setAttribute('aria-label', 'Current stamp color');
  stage.append(canvas, preview, readout);

  const buttons = new Map();
  const history = [];
  let color = /^#[a-f\d]{6}$/i.test(initialColor) ? initialColor : '#000000';
  let tool = 'pencil';
  let gesture;
  let sound;
  let saved = null;

  function playSounds(state) {
    for (const id of state.sounds ?? []) {
      if (!manifest.sounds[id]) continue;
      sound?.pause();
      sound = new Audio(source(manifest.sounds[id]));
      sound.volume = .65;
      sound.play().catch(() => {});
    }
  }

  function update() {
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(canvas, 0, 0);
    const chip = readout.getContext('2d');
    chip.fillStyle = color;
    chip.fillRect(0, 0, readout.width, readout.height);
    readout.dataset.color = color;
    buttons.get('undo')?.setAttribute('aria-disabled', String(!history.length));
    for (const command of ['pencil', 'fill']) buttons.get(command)?.setAttribute('aria-pressed', String(tool === command));
  }

  function remember() {
    history.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (history.length > 32) history.shift();
  }

  function undo() {
    if (history.length) context.putImageData(history.pop(), 0, 0);
    update();
  }

  function transform(command) {
    remember();
    const before = context.getImageData(0, 0, canvas.width, canvas.height);
    const after = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const nextX = command === 'rotate' ? canvas.width - 1 - y : canvas.width - 1 - x;
        const nextY = command === 'rotate' ? x : y;
        after.data.set(before.data.subarray((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4), (nextY * canvas.width + nextX) * 4);
      }
    }
    context.putImageData(after, 0, 0);
  }

  function run(command) {
    if (command === 'pencil' || command === 'fill') tool = command;
    else if (command === 'undo') undo();
    else if (command === 'rotate' || command === 'flip') transform(command);
    else if (command === 'erase') { remember(); context.clearRect(0, 0, canvas.width, canvas.height); }
    else if (command === 'restore') { remember(); context.putImageData(originalPixels, 0, 0); }
    else if (command === 'cancel') dialog.close();
    else if (command === 'save') {
      const src = canvas.toDataURL();
      saved = { ...stamp, src, thumbnail: src };
      onSave(saved);
      dialog.close();
    }
    update();
  }

  for (const [command, part] of Object.entries(manifest.buttons)) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'native-stamp-button';
    control.dataset.command = command;
    control.setAttribute('aria-label', part.label);
    control.title = part.label;
    control.style.cssText = place(...part.rect);
    const image = imageAt(part.states.rest.image, [0, 0, ...part.states.rest.rect.slice(2)]);
    control.append(image);
    let inside = false;
    let pointer = null;
    let stateName = '';
    function setState() {
      const next = inside ? pointer === null ? 'rollover' : 'tracking' : 'rest';
      if (next === stateName) return;
      stateName = next;
      const state = part.states[next];
      image.src = source(state.image);
      image.style.cssText = place(state.rect[0] - part.rect[0], state.rect[1] - part.rect[1], ...state.rect.slice(2));
      playSounds(state);
    }
    control.addEventListener('pointerenter', () => { inside = true; setState(); }, options);
    control.addEventListener('pointerleave', () => { inside = false; setState(); }, options);
    control.addEventListener('pointerdown', event => {
      if (event.button !== 0 || control.getAttribute('aria-disabled') === 'true') return;
      pointer = event.pointerId;
      inside = true;
      setState();
    }, options);
    window.addEventListener('pointerup', event => { if (event.pointerId === pointer) { pointer = null; setState(); } }, options);
    window.addEventListener('pointercancel', event => { if (event.pointerId === pointer) { pointer = null; inside = false; setState(); } }, options);
    control.addEventListener('click', () => { if (control.getAttribute('aria-disabled') !== 'true') run(command); }, options);
    buttons.set(command, control);
    stage.append(control);
  }

  for (const chip of manifest.chips) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'native-stamp-chip';
    control.setAttribute('aria-label', `Color ${chip.color}`);
    control.title = chip.color;
    control.dataset.color = chip.color;
    control.style.cssText = place(...chip.rect);
    control.addEventListener('click', () => { color = chip.color; update(); }, options);
    stage.append(control);
  }

  const position = event => {
    const bounds = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width))),
      Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height))),
    ];
  };
  const draw = (x, y) => { context.fillStyle = color; context.fillRect(x, y, 1, 1); };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus();
    remember();
    const point = position(event);
    if (tool === 'fill') fillPixels(context, ...point, color);
    else {
      gesture = { pointer: event.pointerId, point };
      canvas.setPointerCapture(event.pointerId);
      draw(...point);
    }
    update();
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (gesture?.pointer !== event.pointerId) return;
    const point = position(event);
    strokePixels(gesture.point, point, draw);
    gesture.point = point;
    update();
  }, options);
  canvas.addEventListener('pointerup', event => { if (gesture?.pointer === event.pointerId) gesture = null; }, options);
  canvas.addEventListener('lostpointercapture', () => { gesture = null; }, options);
  canvas.addEventListener('pointercancel', event => { if (gesture?.pointer === event.pointerId) { gesture = null; undo(); } }, options);
  // Modal keystrokes must not reach the Paint Zone's document-level shortcuts.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    }
  }, options);
  const resize = () => {
    let scale = Math.min(window.innerWidth / 1024, window.innerHeight / 768);
    let center = [512, 384];
    if (window.innerWidth < 1024 || window.innerHeight < 768) {
      // Responsive adaptation: fit the native panel rather than shrinking its
      // surrounding 1024×768 empty stage. Legacy small-screen behavior is not
      // inferred from this; the recovered artwork and its proportions stay intact.
      const [x, y, width, height] = manifest.frame.rect;
      scale = Math.min(1, Math.max(1, window.innerWidth - 16) / width, Math.max(1, window.innerHeight - 16) / height);
      center = [x + width / 2, y + height / 2];
    }
    stage.style.setProperty('--native-stamp-scale', String(scale));
    stage.style.setProperty('--native-stamp-x', `${-center[0] * scale}px`);
    stage.style.setProperty('--native-stamp-y', `${-center[1] * scale}px`);
  };
  window.addEventListener('resize', resize, options);
  resize();
  update();
  try {
    await Promise.all([...stage.querySelectorAll('img')].map(image => image.decode()));
  } catch (error) {
    listeners.abort();
    sound?.pause();
    dialog.remove();
    throw error;
  }
  document.body.append(dialog);
  const closed = new Promise(resolve => dialog.addEventListener('close', () => {
    listeners.abort();
    sound?.pause();
    dialog.remove();
    resolve(saved);
  }, { once: true }));
  dialog.showModal();
  canvas.focus();
  return closed;
}
