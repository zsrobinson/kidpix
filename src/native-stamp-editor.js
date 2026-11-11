import { interactionOwner, onInteractionInactive } from './interaction-owner.js';
import { bindStampControl, trackingCue } from './stamp-editor-control.js';
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
  const session = { controller: new AbortController() };
  editorSession = session;
  session.promise = openStampEditor(stamp, initialColor, onSave, session.controller.signal).catch(error => {
    if (!session.controller.signal.aborted) throw error;
    return null;
  }).finally(() => {
    if (editorSession === session) editorSession = null;
  });
  return session.promise;
}

// Invalidate pending decode work as well as an already presented editor.
export function cancelStampEditor() {
  const session = editorSession;
  editorSession = null;
  session?.controller.abort();
}

async function openStampEditor(stamp, initialColor, onSave, signal) {
  const manifest = await loadManifest();
  if (signal.aborted) return null;
  if (!manifest) {
    await editFallbackStamp(stamp, initialColor, onSave, { signal });
    if (signal.aborted) return null;
    const fallback = document.querySelector('dialog.stamp-editor[open]');
    if (fallback) await new Promise(resolve => fallback.addEventListener('close', resolve, { once: true }));
    return null;
  }
  const stampImage = new Image();
  stampImage.src = stamp.src;
  await stampImage.decode();
  if (signal.aborted) return null;

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
  const inputOwner = interactionOwner(canvas.ownerDocument);
  let gesture;
  let saved = null;
  const cues = [];

  function playSounds(cue, state) {
    for (const id of state.sounds ?? []) {
      if (!manifest.sounds[id]) continue;
      const audio = new Audio(source(manifest.sounds[id]));
      audio.volume = .65;
      cue.play(audio);
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

  let closing = false;
  function run(command) {
    if (!dialog.open || closing) return;
    if (command === 'cancel' || command === 'save') closing = true;
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
    const cue = trackingCue();
    cues.push(cue);
    let stateName;
    bindStampControl(control, {
      owner: inputOwner, signal: listeners.signal,
      activate: () => run(command),
      start: () => playSounds(cue, part.states.tracking),
      stop: cue.stop,
      render(next) {
        if (next === stateName) return;
        stateName = next;
        const state = part.states[next];
        image.src = source(state.image);
        image.style.cssText = place(state.rect[0] - part.rect[0], state.rect[1] - part.rect[1], ...state.rect.slice(2));
      },
    });
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
    bindStampControl(control, { owner: inputOwner, signal: listeners.signal, activate: () => { color = chip.color; update(); } });
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
    if (event.button !== 0 || event.isPrimary === false || gesture || !inputOwner.claim(event, canvas)) return;
    event.preventDefault();
    canvas.focus();
    try { canvas.setPointerCapture(event.pointerId); }
    catch { inputOwner.release(canvas, event.pointerId); return; }
    remember();
    const point = position(event);
    gesture = { pointer: event.pointerId, point, rollbackOnCancel: tool === 'pencil' };
    if (tool === 'fill') fillPixels(context, ...point, color);
    else {
      draw(...point);
    }
    update();
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (gesture?.pointer !== event.pointerId || tool !== 'pencil') return;
    const point = position(event);
    strokePixels(gesture.point, point, draw);
    gesture.point = point;
    update();
  }, options);
  function finishGesture(event) {
    if (!gesture || (event && gesture.pointer !== event.pointerId) || event?.type === 'pointerup' && event.button !== 0) return;
    const { pointer, rollbackOnCancel } = gesture;
    gesture = null;
    inputOwner.release(canvas, pointer);
    // Preserve native editor policy: explicit cancel rolls back; capture loss
    // and lifecycle interruptions keep delivered pixels and their checkpoint.
    if (event?.type === 'pointercancel' && rollbackOnCancel) undo();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, finishGesture, options);
  onInteractionInactive(canvas, () => finishGesture(), listeners.signal);
  // Modal keystrokes must not reach the Paint Zone's document-level shortcuts.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      if (!inputOwner.busy()) undo();
    } else if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      if (!inputOwner.busy() && !event.repeat) run(event.key === 'Escape' ? 'cancel' : 'save');
    }
  }, options);
  dialog.addEventListener('keyup', event => event.stopPropagation(), options);
  // Browser context menus can steal capture from a held primary contact.
  dialog.addEventListener('contextmenu', event => event.preventDefault(), options);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!inputOwner.busy()) run('cancel'); }, options);
  // Blank modal chrome also participates in first-contact ownership.
  let chromePointer;
  dialog.addEventListener('pointerdown', event => {
    if (event.target.closest('button, canvas') || event.button !== 0 || event.isPrimary === false) return;
    if (inputOwner.claim(event, dialog)) chromePointer = event.pointerId;
  }, options);
  const finishChrome = event => {
    if (chromePointer === undefined || event && (event.pointerId !== chromePointer || event.type === 'pointerup' && event.button !== 0)) return;
    const pointer = chromePointer; chromePointer = undefined;
    inputOwner.release(dialog, pointer);
  };
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, finishChrome, options);
  onInteractionInactive(dialog, () => finishChrome(), listeners.signal);
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
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', finish);
    try { finishGesture(); } catch { /* Still remove the session on audio failure. */ }
    finishChrome();
    listeners.abort();
    for (const cue of cues) cue.stop();
    dialog.remove();
    resolveClosed(saved);
  }
  signal.addEventListener('abort', finish, { once: true });
  dialog.addEventListener('close', finish, { once: true });
  try {
    await Promise.all([...stage.querySelectorAll('img')].map(image => image.decode()));
    if (signal.aborted) { finish(); return closed; }
    document.body.append(dialog);
    dialog.showModal();
    canvas.focus();
  } catch (error) {
    finish();
    throw error;
  }
  return closed;
}
