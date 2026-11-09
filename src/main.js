import { guardStepperInput } from './stepper-input.js';
import { createStudioColorPicker } from './studio-color-picker.js';
import { createTextRangeKeeper } from './text-range.js';
import { TEXT_FONTS, TEXT_STEPPERS, editedSize, textStep } from './text-values.js';
import { interactionOwner, onInteractionInactive } from './interaction-owner.js';
import './style.css';
import { createPaint } from './paint.js';
import { createScene } from './scene.js';
import { makeId } from './id.js';
import { readData, recordMedia } from './recording.js';
import { editStamp } from './native-stamp-editor.js';
import { loadCatalog, original, originalCssUrl, rebaseProject } from './library.js';
import { highlightLibraryItem, libraryCategories, showOriginalLibrary, trayKey } from './library-tray.js';
import { loadNativeUi, nativeButtonParts, nativeCursor, renderNativeDrawing, renderNativeSizes, setSprite } from './native-ui.js';
import { commandButtons, libraryGroups, optionTitle, place, toolGroups, trayState } from './trays.js';
import { createNativeAnimation } from './native-animation.js';
import { attachNativeRollovers } from './native-rollovers.js';
import { applyNativeControlRegions } from './native-control-regions.js';
import { createNativePaperPicker } from './native-paper.js';
import { createNativeToolMotion } from './native-tool-motion.js';
import { createNativeActionMotion } from './native-action-motion.js';
import { createNativeStampMotion } from './native-stamp-motion.js';
import { createNativeSecondaryMotion } from './native-secondary-motion.js';

// Install before any application or popup capture handler.
interactionOwner(document);
const app = document.querySelector('#app');
const state = {
  tray: 'draw', tools: { draw: 'pencil', paint: 'brush', bucket: 'bucket', mixer: 'mega', grab: 'grab', eraser: 'round' },
  sizes: { draw: 8, paint: 8, mixer: 8, stamp: 8, eraser: 16 },
  drawStyle: 'freehand', selectionStyle: 'freehand', cookie: null, eraserShape: 'round', alt: false, page: 0, effect: 0,
  color: '#000000', category: 0, libraryPage: 0, media: 'sounds', stamp: null, libraryTab: null, selectedAsset: null,
  font: 'Chalkboard, sans-serif', textSize: 32, bold: false, italic: false, underline: false, align: 'left', voice: '', playing: false,
  extendedHelp: false, pickColor: false, backdrop: null, sound: null, narration: null,
};
let groups = {};
let catalogStatus = 'Loading the original libraries…';
let soundPreview;
let picturePlayers = [];
let soundInput;
let soundMeter;
let micRequest = 0;
let notice;
let loadingProject = false;
let objectPlacement = null;
let pathPointer = null;
let nativeUi;
let nativeSprites;
let nativeRollovers;
let nativeTrays = {};
let disconnectTraySprites;
let libraryManifest;
let importKind = 'image';
const importedAssets = new Map();
let paperPage = 0;
let paperOpen = false;
let selectedPaper = 12300;
let nativePaperPicker;
let studioColorPicker;
let gradientDefinitions = [];
let backgroundRequest = 0;
const undoStack = [];
const redoStack = [];
let undoFaceRedo = false;
let toolRequest = 0;

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const button = (action, label, x, y, w, h, extra = '') =>
  `<button type="button" class="hit ${extra}" data-action="${action}" title="${label}" aria-label="${label}" style="${place(x, y, w, h)}"></button>`;
const menu = (label, commands) => `<details><summary>${label}</summary><div>${commands.map(([action, title]) => `<button type="button" data-action="${action}">${title}</button>`).join('')}</div></details>`;

app.innerHTML = `
  <div id="viewport">
    <div id="studio">
      <section id="paint-zone" aria-label="Paint Zone">
        <div class="chrome" id="paint-chrome"></div>
        <div id="native-buttons" class="chrome"></div>
        <div id="native-draw" class="chrome"></div>
        <div id="surface">
          <canvas id="paper-canvas" width="720" height="542" tabindex="0" aria-label="Drawing area"></canvas>
          <div id="objects"></div>
          <canvas id="foreground" width="720" height="542" aria-hidden="true"></canvas>
          <canvas id="scene-effects" width="720" height="542" aria-hidden="true"></canvas>
        </div>
        <input id="picture-title" aria-label="Picture title" value="KidPix1" maxlength="55" spellcheck="false">
        <div id="hit-layer">
          ${toolGroups.map(([id, label, ...rect]) => button(`tray:${id}`, label, ...rect, 'side')).join('')}
          ${libraryGroups.map(([id, label, ...rect]) => button(`tray:${id}`, label, ...rect, 'side')).join('')}
          ${commandButtons.map(([id, label, ...rect]) => button(id, label, ...rect)).join('')}
          <button id="color-button" class="hit" type="button" data-action="palette" title="Color Swatch" aria-label="Color Swatch" aria-expanded="false"><canvas width="68" height="65" id="color-chip" aria-hidden="true"></canvas></button>
        </div>
        <div id="tray-bed" hidden></div>
        <img id="tray-art" alt="" draggable="false">
        <div id="native-tool-motion" class="chrome" hidden></div>
        <div id="tray-buttons"></div>
        <div id="library-tray" hidden></div>
        <div id="palette" hidden></div>
        <div id="paper-picker" hidden></div>
      </section>
      <section id="slides" aria-label="Slide Show" hidden>
        <div class="chrome" id="slide-chrome"></div>
        <input id="slide-title" aria-label="Slide Show title" value="My Slide Show" maxlength="55">
        <output id="slide-sound-title">No Sound</output>
        <div id="slide-deck"></div>
        <div id="slide-grid"></div>
        ${button('slide-play', 'Play Slide Show', 846, 120, 87, 87)}
        ${button('slide-save', 'Save Slide Show', 709, 134, 76, 59)}
        ${button('slide-delete', 'Remove Slide', 800, 644, 121, 98)}
        ${button('slide-new', 'Create New Slide Show', 80, 615, 109, 131)}
        ${button('slide-sound', 'Choose Slide Show Sound', 289, 153, 31, 31)}
        ${button('slide-sound-off', 'Remove Slide Show Sound', 472, 153, 31, 31)}
        ${button('slide-up', 'Previous Slide Row', 679, 321, 37, 42)}
        ${button('slide-down', 'Next Slide Row', 679, 363, 37, 42)}
        ${button('slide-print', 'Print Selected Picture', 766, 260, 76, 59)}
        ${button('slide-export', 'Export Selected Picture', 722, 201, 76, 59)}
        ${button('paint-zone', 'Go to Paint Zone', 920, 621, 95, 60)}
        ${button('slide-help', 'Slide Show Help', 954, 327, 36, 34)}
      </section>
      <div id="playback" hidden>
        <div id="playback-picture">
          <img id="slide-base" alt="">
          <img id="slide-ink" alt="">
          <div id="slide-objects"></div>
          <img id="slide-front" alt="">
        </div>
        <button type="button" id="stop-slides" class="pill" data-action="stop-slides">Stop</button>
      </div>
      <nav id="menu" aria-label="Kid Pix menus">
        <button id="menu-trigger" type="button" aria-label="Show menus" aria-expanded="false" data-action="menu">▼</button>
        <div id="menu-items" hidden>
          ${menu('File', [['new', 'New Picture'], ['open', 'Open Picture…'], ['save', 'Save Picture…'], ['export', 'Export PNG…'], ['ideas', 'Idea Machine…'], ['print', 'Print Picture…']])}
          ${menu('Edit', [['undo', 'Undo'], ['redo', 'Redo'], ['edit:cut', 'Cut'], ['edit:copy', 'Copy'], ['edit:paste', 'Paste'], ['import-image', 'Import Image…']])}
          ${menu('Paint Zone', [['play', 'Play Picture'], ['path', 'Path Animation Tool'], ['loop-path', 'Loop Path'], ['preview-object', 'Play Object'], ['enlarge', 'Enlarge to Fill Canvas'], ['record-video', 'Video Narration…'], ['record-sound', 'Record Sound…'], ['flipbook', 'Add Picture to Slide Show'], ['slideshow', 'Go to Slide Show'], ['clear', 'Erase Picture']])}
          ${menu('Help', [['help', 'Extended Help'], ['about', 'About KID PIX 3D']])}
        </div>
      </nav>
      <output id="status" role="status" hidden></output>
    </div>
  </div>
  <dialog id="dialog"><div id="dialog-body"></div><div id="dialog-actions" class="dialog-actions"></div></dialog>
  <input type="file" id="picture-file" accept=".kidpix-web,.json,application/json" hidden>
  <input type="file" id="image-file" accept="image/*" hidden>
`;

const $ = selector => app.querySelector(selector);
const studio = $('#studio');
const canvas = $('#paper-canvas');
const surface = $('#surface');
const foreground = $('#foreground').getContext('2d');
const effects = $('#scene-effects').getContext('2d');
const status = $('#status');
const title = $('#picture-title');
const dialog = $('#dialog');

function showStatus(message, ms = 2200) {
  clearTimeout(notice);
  status.textContent = message;
  status.hidden = !message;
  if (ms && message) notice = setTimeout(() => { status.hidden = true; }, ms);
}

function showDialog(heading, message, actions) {
  $('#dialog-body').innerHTML = `<h2>${escape(heading)}</h2><p>${escape(message)}</p>`;
  const area = $('#dialog-actions');
  area.replaceChildren();
  for (const [label, run] of actions) {
    const control = document.createElement('button');
    control.textContent = label;
    control.addEventListener('click', () => {
      dialog.close();
      run?.();
    });
    area.append(control);
  }
  if (!dialog.open) { nativeRollovers?.cancel(); dialog.showModal(); }
}

function showPicker(heading, items, onChoose) {
  const body = $('#dialog-body');
  body.innerHTML = `<h2>${escape(heading)}</h2><div class="dialog-library"></div>`;
  const area = $('#dialog-actions');
  area.innerHTML = '<button type="button">Cancel</button>';
  area.firstElementChild.onclick = () => dialog.close();
  for (const item of items) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'asset-tile';
    if (item.thumbnail) {
      const image = document.createElement('img');
      image.src = item.thumbnail;
      image.loading = 'lazy';
      image.alt = '';
      control.append(image);
    }
    const caption = document.createElement('span');
    caption.textContent = item.name;
    control.title = item.name;
    control.append(caption);
    control.onclick = () => { dialog.close(); Promise.resolve(onChoose(item)).catch(() => showStatus('Could not open that item.')); };
    body.lastElementChild.append(control);
  }
  if (!dialog.open) { nativeRollovers?.cancel(); dialog.showModal(); }
}

function scaleStudio() {
  const scale = Math.min(app.clientWidth / 1024, app.clientHeight / 768);
  const viewport = $('#viewport');
  viewport.style.width = `${1024 * scale}px`;
  viewport.style.height = `${768 * scale}px`;
  studio.style.transform = `scale(${scale})`;
}

new ResizeObserver(scaleStudio).observe(app);
scaleStudio();

function remember(entry) {
  if (loadingProject) return;
  undoFaceRedo = false;
  undoStack.push(entry);
  if (undoStack.length > 32) undoStack.shift();
  redoStack.length = 0;
  syncHistory();
}

function syncHistory() {
  if (!undoStack.length && !redoStack.length) undoFaceRedo = false;
  for (const control of app.querySelectorAll('[data-action="undo"]')) control.setAttribute('aria-disabled', String(!undoStack.length));
  for (const control of app.querySelectorAll('[data-action="redo"]')) control.setAttribute('aria-disabled', String(!redoStack.length));
  app.querySelector('[data-action="undo-face"]').setAttribute('aria-disabled', String(!(undoFaceRedo ? redoStack.length : undoStack.length)));
}

function drawForeground() {
  foreground.clearRect(0, 0, canvas.width, canvas.height);
  paint.renderForegroundTo(foreground);
}

const scene = createScene($('#objects'), surface, (before, after) => remember({ before, after, kind: 'scene' }));
const paint = createPaint(canvas, {
  includeForeground: false,
  onBigErase: () => clearPicture(),
  onChange({ kind, paperSource }) {
    syncPaperSelection(paperSource);
    if (!['undo', 'redo', 'reset', 'restore'].includes(kind)) remember({ kind: 'paint' });
    drawForeground();
  },
  onSample(color) {
    chooseColor(color);
    state.pickColor = false;
    syncTool();
  },
  onSamplePreview(color) { drawSwatch(color); },
  sampleColor: point => samplePictureColor(point),
  cursorFor(options) {
    // These roles are identified from the recovered glyphs. The exporter keeps
    // that evidence separate from bindings recovered from the executable.
    const ids = { eyedropper: 10006, bucket: 10007, select: 10008, scissors: 10013, brush: 10015, spray: 10017, text: 10019 };
    const id = options.tool === 'mixer' ? options.mode === 'wand' ? 10011 : 10010 : ids[options.tool] ?? 10029;
    return nativeCursor(nativeUi, id, options.tool === 'text' ? 'text' : 'crosshair');
  },
  onText(point) {
    if (state.tray === 'text') scene.addText(point, textStyle());
  },
  onError(error) { showStatus(error?.message || 'Could not use that image.'); },
});

function history(direction, fromFace = false) {
  cancelRecordedPathInput();
  if (!fromFace) undoFaceRedo = false;
  // A held moving-paint stroke becomes a history entry during cleanup. Finish
  // it before selecting the unified entry so the two history stacks agree.
  paint.cancel();
  const source = direction === 'undo' ? undoStack : redoStack;
  const target = direction === 'undo' ? redoStack : undoStack;
  const entry = source.pop();
  if (!entry) return;
  if (entry.kind === 'scene') scene.restore(entry[direction === 'undo' ? 'before' : 'after']);
  else if (entry.kind === 'sound') state[entry.track] = entry[direction === 'undo' ? 'before' : 'after'];
  else if (entry.kind === 'clear') {
    if (entry.paint) paint[direction]();
    scene.restore(direction === 'undo' ? entry.before : []);
    state.sound = direction === 'undo' ? entry.sound : null;
    state.narration = direction === 'undo' ? entry.narration : null;
    state.backdrop = direction === 'undo' ? entry.backdrop : null;
  } else if (entry.kind === 'background') {
    paint[direction]();
    state.backdrop = entry[direction === 'undo' ? 'before' : 'after'];
  } else paint[direction]();
  target.push(entry);
  if (fromFace) undoFaceRedo = direction === 'undo';
  syncHistory();
}

const paperTextures = ['Smooth', 'Leaf', 'Stones', 'Fern', 'Swirl', 'Mosaic', 'Woodgrain', 'Woven'];
let uiSound;
let faceAnimation;
let undoAnimation;
let slideSound;
let slideTrack;
let slidePicturePlayers = [];
const swatch = new Image();
swatch.onload = () => drawSwatch(state.color);
swatch.src = original('ui/swatch-0.png');

function drawSwatch(color) {
  if (!swatch.naturalWidth) return;
  const chip = $('#color-chip');
  const context = chip.getContext('2d');
  context.clearRect(0, 0, chip.width, chip.height);
  context.drawImage(swatch, 0, 0);
  const rgb = color.match(/[a-f\d]{2}/gi)?.map(value => parseInt(value, 16));
  if (!rgb || rgb.length !== 3 || color === '#000000') return;
  const image = context.getImageData(0, 0, chip.width, chip.height);
  for (let i = 0; i < image.data.length; i += 4) {
    if (!image.data[i + 3]) continue;
    const light = image.data[i] / 255;
    const highlight = light ** 2;
    for (let c = 0; c < 3; c++) image.data[i + c] = rgb[c] * (.64 + .36 * light) + (255 - rgb[c]) * highlight;
  }
  context.putImageData(image, 0, 0);
}

function playUiSound(id) {
  if (!nativeUi) return;
  uiSound?.pause();
  uiSound = new Audio(original(`ui/easel-${id}.wav`));
  uiSound.volume = .65;
  uiSound.play().catch(() => {});
}

function playAnimationSound(id) {
  const audio = new Audio(original(`ui/easel-${id}.wav`));
  audio.volume = .65;
  // The actor owns this handle. Rejection must release its completion slot.
  audio.play().catch(() => audio.dispatchEvent(new Event('error')));
  return audio;
}

function animateUndoGuy() {
  if (!nativeUi || !nativeSprites) return;
  if (undoAnimation && nativeUi.undoAnimations?.clips.length) {
    const { clips } = nativeUi.undoAnimations;
    const index = Math.trunc(Math.fround(Math.fround(Math.fround(Math.random()) * (clips.length - 1)) + .5));
    const clip = clips[index];
    undoAnimation.play(clip, clip.tickMs);
    return;
  }
  playUiSound(1008 + Math.floor(Math.random() * 20));
  const image = nativeSprites.get('undo-face');
  const start = performance.now();
  cancelAnimationFrame(faceAnimation);
  function step(now) {
    const frame = Math.floor((now - start) / 35);
    if (frame >= 53) {
      setSprite(image, nativeUi.buttons['undo-face'], 0);
      return;
    }
    image.src = original(`ui/undo-face-frame-${String(frame).padStart(2, '0')}.png`);
    faceAnimation = requestAnimationFrame(step);
  }
  faceAnimation = requestAnimationFrame(step);
}

function textStyle() {
  return {
    color: state.color, size: state.textSize, font: state.font, bold: state.bold,
    italic: state.italic, underline: state.underline, align: state.align, voice: state.voice,
  };
}

function syncTool() {
  const group = state.tray;
  const tool = state.tools[group];
  const view = trayState(state);
  const { art } = view;
  const rowWidth = group === 'bucket' ? 7 : group === 'mixer' ? 6 : 5;
  const effectIndex = state.effect + state.page * rowWidth;
  const effect = nativeTrays[art] ? optionTitle(art, effectIndex) : view.effect;
  const next = {
    gradient: null,
    tool: 'none', variant: 'freehand', size: state.sizes[group] || 8, sizeIndex: [4, 8, 16].indexOf(state.sizes[group]),
    color: state.color, asset: null, mode: null, effectIndex, fill: false,
  };
  if (group === 'draw') Object.assign(next, { tool, variant: state.drawStyle });
  if (group === 'paint') Object.assign(next, {
    tool, variant: effect?.toLowerCase() || 'realistic',
    mode: tool === 'brush' ? state.alt ? 'wacky' : 'realistic'
      : tool === 'spray' ? state.alt ? 'moving' : 'shapes' : state.alt ? 'hands-free' : 'mouse',
    ...(tool === 'sound' ? { level: soundMeter ? soundLevel() : 0 } : {}),
  });
  if (group === 'bucket') Object.assign(next, {
    tool: 'bucket', mode: tool === 'gradient' ? 'blend' : tool === 'pattern' ? 'pattern' : 'single',
    variant: tool === 'gradient' ? 'gradient' : tool === 'pattern' ? 'multicolor' : effectIndex ? 'pattern' : 'solid',
    gradient: tool === 'gradient' ? gradientDefinitions[effectIndex] : null,
    asset: tool === 'pattern' ? original(`tools/patterns/${20400 + effectIndex}.png`)
      : tool === 'bucket' && effectIndex > 0 ? original(`tools/mono-patterns/${20500 + effectIndex}.png`) : null,
  });
  if (group === 'mixer') Object.assign(next, { tool: 'mixer', mode: tool, variant: effect });
  if (group === 'stamp') Object.assign(next, { tool: 'stamp', asset: state.stamp?.src, size: state.sizes.stamp * 3 });
  if (group === 'eraser') Object.assign(next, { tool: 'eraser', variant: tool === 'big' ? 'big' : state.eraserShape, mode: effect, size: state.sizes.eraser * 2 });
  if (group === 'text') Object.assign(next, { tool: 'text', size: state.textSize });
  if (group === 'grab' && tool === 'scissors') Object.assign(next, {
    tool, variant: state.selectionStyle, asset: state.cookie ? original(`tools/cutouts/${state.cookie}.png`) : null,
  });
  if (state.pickColor) next.tool = 'eyedropper';
  if (state.playing || objectPlacement || pathPointer !== null) next.tool = 'none';
  const pending = paint.setOptions(next);
  const request = ++toolRequest;
  canvas.dataset.paintReady = pending ? 'loading' : 'ready';
  canvas.setAttribute('aria-busy', String(Boolean(pending)));
  if (pending) {
    const cursor = canvas.style.cursor;
    canvas.style.cursor = 'progress';
    pending.then(() => {
      if (request !== toolRequest) return;
      canvas.dataset.paintReady = 'ready';
      canvas.setAttribute('aria-busy', 'false');
      canvas.style.cursor = cursor;
    }).catch(() => {
      if (request !== toolRequest) return;
      canvas.dataset.paintReady = 'error';
      canvas.setAttribute('aria-busy', 'false');
      canvas.style.cursor = cursor;
      showStatus('Could not load the selected tool. Select it again to retry.');
    });
  }
  if (pathPointer === null) scene.chooseMode(state.pickColor ? 'paint' : group === 'text' ? 'text' : group === 'grab' && tool === 'grab' ? 'grab' : 'paint');
  canvas.dataset.tool = next.tool;
  canvas.dataset.paintStyle = art;
}

const libKeys = new Set(['backgrounds', 'stickers', 'toons', 'media', 'stamp']);
const trayArt = $('#tray-art');
const library = $('#library-tray');
const nativeToolMotion = createNativeToolMotion({
  stage: studio, layer: $('#native-tool-motion'), controls: $('#tray-buttons'),
  resolve: path => original(`ui/${path}`),
  onReady: () => showTray(), onActivate: action => activate(action),
});

const nativeSecondaryMotion = createNativeSecondaryMotion({
  stage: studio, controls: $('#tray-buttons'), resolve: path => original(`ui/${path}`),
  onReady: () => showTray(), onActivate: action => activate(action),
});

// Formatting chrome keeps the editor's caret/range during pointer activation.
$('#tray-buttons').addEventListener('pointerdown', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (state.tray === 'text' && (['bold', 'italic', 'underline'].includes(action) || action?.startsWith('align:') || action?.startsWith('font-step:') || action?.startsWith('font-size-step:'))
    && document.activeElement?.matches('.object-text')) event.preventDefault();
}, { capture: true });
guardStepperInput($('#tray-buttons'), {
  actions: TEXT_STEPPERS.map(stepper => stepper.action),
  getTarget: () => actionMotionState().target,
  activate: action => activate(action),
});
const textRange = createTextRangeKeeper($('#objects'));
$('#tray-buttons').addEventListener('pointerdown', event => {
  if (event.target.matches('#font, #font-size')) textRange.capture();
}, { capture: true });
$('#objects').addEventListener('focusin', event => {
  if (event.target.matches('.object-text') && !event.target.matches(':active')) textRange.restore(event.target);
});
function applyTextStyle() { textRange.apply(() => scene.setTextStyle(textStyle())); }
function syncTextValues() {
  if (state.tray !== 'text') return;
  for (const { action } of TEXT_STEPPERS) {
    const control = $('#tray-buttons').querySelector(`[data-action="${action}"]`);
    if (control) control.disabled = textStep(state, action) === null;
  }
  for (const action of ['bold', 'italic', 'underline', 'align:left', 'align:right', 'align:center']) {
    const control = $('#tray-buttons').querySelector(`[data-action="${action}"]`);
    control?.setAttribute('aria-pressed', String(action.startsWith('align:') ? state.align === action.slice(6) : Boolean(state[action])));
  }
  const font = $('#font'), size = $('#font-size');
  if (font && document.activeElement !== font) {
    if (![...font.options].some(option => option.value === state.font)) font.add(new Option(state.font, state.font));
    font.value = state.font;
  }
  if (size && document.activeElement !== size) size.value = state.textSize;
}
function actionMotionState() {
  const capabilities = state.tray === 'grab' && state.tools.grab === 'scissors' ? paint.actionState : scene.actionState;
  if (state.tray === 'text') {
    if (capabilities.textStyle) {
      const { size, ...style } = capabilities.textStyle;
      Object.assign(state, style, { textSize: size });
    }
    syncTextValues();
  }
  return { font: state.font, textSize: state.textSize, bold: state.bold, italic: state.italic, underline: state.underline, align: state.align, capabilities, target: capabilities.target };
}
const nativeActionMotion = createNativeActionMotion({
  stage: studio, controls: $('#tray-buttons'), resolve: path => original(`ui/${path}`),
  onReady: () => state.tray === 'text' ? updateActionMotion() : showTray(),
  onActivate: action => activate(action), refreshCurrent: actionMotionState,
});
function updateActionMotion() {
  const view = trayState(state);
  return nativeActionMotion.update({ ...actionMotionState(), tray: state.tray, art: view.art, page: state.page,
    selected: state.tools[state.tray], color: state.color, nativeUi });
}

function stampMotionState() {
  return { active: state.tray === 'stamp', nativeUi: Boolean(nativeUi && libraryManifest?.trays.stamps),
    categoryIndex: state.category, categoryCount: library.categories?.length ?? 0,
    stampSize: state.sizes.stamp, selectedAssetId: state.selectedAsset?.id ?? null };
}
const nativeStampMotion = createNativeStampMotion({
  stage: studio, controls: library, resolve: path => original(`ui/${path}`),
  onReady: () => nativeStampMotion.update(stampMotionState()),
  onActivate: action => activate(action), readState: stampMotionState,
});

function libraryKey() {
  if (state.tray === 'stamp') return 'stamps';
  if (state.tray === 'media') return state.media;
  return state.tray;
}

function showLibrary() {
  nativeStampMotion.beforeRender();
  const key = libraryKey();
  const categories = [...libraryCategories(groups, key, state.libraryTab)];
  const added = importedAssets.get(key);
  if (added?.length && !state.libraryTab) categories.push({ name: 'My ' + key[0].toUpperCase() + key.slice(1), items: added });
  const category = categories[state.category] ?? categories[0];
  const items = category?.items ?? [];
  const nativeTray = libraryManifest?.trays[trayKey(key, state.libraryTab)];
  const count = nativeTray?.slots.length || 6;
  const pages = Math.max(1, Math.ceil(items.length / count));
  state.libraryPage = Math.min(state.libraryPage, pages - 1);
  const row = items.slice(state.libraryPage * count, state.libraryPage * count + count);
  library.visibleItems = row;
  library.categories = categories;
  if (nativeTray) {
    showOriginalLibrary(library, libraryManifest, nativeTray, {
      categories, key, categoryIndex: state.category, page: state.libraryPage, pages, row,
      selected: state.selectedAsset, stampSize: state.sizes.stamp, tab: state.libraryTab, status: catalogStatus,
    });
    nativeStampMotion.update(stampMotionState());
    return;
  }
  nativeStampMotion.update({ ...stampMotionState(), nativeUi: false });
  library.classList.remove('original-library');
  library.innerHTML = `
    <div class="tray-categories">
      ${state.tray === 'media' ? '<select id="media-category" aria-label="Library type"><option value="sounds">Sounds</option><option value="movies">Movies</option><option value="frames">Frames</option></select>' : ''}
      <label for="category">${escape(key === 'toons' ? 'Animations' : key[0].toUpperCase() + key.slice(1))}</label>
      <select id="category" aria-label="Library category" ${categories.length ? '' : 'disabled'}>
        ${categories.map((group, index) => `<option value="${index}" ${group === category ? 'selected' : ''}>${escape(group.name)}</option>`).join('')}
      </select>
      ${state.tray === 'media' && key !== 'frames' ? `<button class="pill media-record" data-action="record-${key === 'movies' ? 'video' : 'sound'}">${key === 'movies' ? 'Video Narration' : 'Record Sound'}</button>` : ''}
      ${key === 'stamps' ? '<div class="stamp-sizes"><button data-action="size:4">Small</button> <button data-action="size:8">Medium</button> <button data-action="size:16">Large</button> <button data-action="stamp-edit" aria-label="Stamp Editor">Edit</button></div>' : ''}
    </div>
    <div id="library-items">
      ${row.length ? row.map((item, index) => `
        <button type="button" class="asset-tile" data-asset="${index}" title="${escape(item.name)}" aria-label="${escape(item.name)}" data-item="${escape(item.id)}" aria-pressed="${item.id === state.selectedAsset?.id}" draggable="${Boolean(item.src)}">
          ${item.thumbnail ? `<img src="${escape(item.thumbnail)}" alt="" draggable="false">` : '<span aria-hidden="true">♫</span>'}
          <span>${escape(item.name)}</span>
        </button>`).join('') : `<span class="library-note">${escape(catalogStatus)}</span>`}
    </div>
    <div class="tray-pager">
      <button type="button" data-action="lib-page:-1" aria-label="Previous library row" ${state.libraryPage ? '' : 'disabled'}>▲</button>
      <span>${state.libraryPage + 1} / ${pages}</span>
      <button type="button" data-action="lib-page:1" aria-label="Next library row" ${state.libraryPage < pages - 1 ? '' : 'disabled'}>▼</button>
    </div>`;
  if ($('#media-category')) $('#media-category').value = state.media;
}

function showTray() {
  nativeToolMotion.beforeRender();
  nativeSecondaryMotion.beforeRender();
  nativeActionMotion.beforeRender();
  disconnectTraySprites?.();
  const lib = libKeys.has(state.tray);
  const nativeDraw = state.tray === 'draw' && nativeUi;
  trayArt.hidden = lib || nativeDraw;
  $('#native-draw').hidden = !nativeDraw;
  studio.classList.toggle('native-draw', Boolean(nativeDraw));
  library.hidden = !lib;
  if (state.tray !== 'stamp') nativeStampMotion.update({ active: false });
  $('#tray-bed').hidden = true;
  const layer = $('#tray-buttons');
  layer.replaceChildren();
  if (lib) {
    showLibrary();
  } else {
    const view = trayState(state);
    const nativeTray = nativeTrays[view.art];
    state.page = Math.min(state.page, Math.max(0, (nativeTray?.pages.length ?? 1) - 1));
    const page = nativeTray?.pages[state.page];
    if (!nativeDraw && page) trayArt.src = original(`ui/trays/${page.image}`);
    else if (!nativeDraw) {
      const fallback = { 'hands-free': 'sound', 'mixer-wand': 'mixer' }[view.art] || view.art;
      trayArt.src = original(`guide/${fallback}.png`);
    }
    trayArt.classList.remove('paper-tray');
    const controls = view.controls.filter(({ action }) => !nativeTray || !['effect', 'page'].includes(action) && !(view.art === 'scissors' && action === 'style') && !(nativeTray.sizeEnabled === false && action === 'size'));
    layer.innerHTML = controls.map(({ action, value, label, x, y, w, h, selected }) =>
      button(`${action}:${value}`, label, 113 + x / 2, 608 + y / 2, w / 2, h / 2, 'tray-hit')
        .replace('title=', `aria-pressed="${selected}" title=`),
    ).join('');
    if (page) {
      for (const control of layer.querySelectorAll('.tray-hit')) control.classList.add('native-control');
      const rowWidth = nativeTray.options.length;
      for (const [index, option] of page.options.entries()) {
        const rect = nativeTray.options[index];
        const key = state.page * rowWidth + index;
        const scissors = view.art === 'scissors';
        const styles = ['freehand', 'polygon', 'ellipse', 'rectangle'];
        const selected = scissors ? state.cookie ? state.cookie === option.id : styles[key] === state.selectionStyle : index === state.effect;
        const action = scissors ? key < 4 ? `style:${styles[key]}` : `cookie:${option.id}` : `effect:${index}`;
        layer.insertAdjacentHTML('beforeend', button(action, optionTitle(view.art, key), ...rect, 'tray-option').replace('title=', `aria-pressed="${selected}" title=`));
      }
      if (nativeTray.dynamicOptionFrames) {
        for (const control of layer.querySelectorAll('.tray-option')) {
          control.classList.add('native-option');
          control.style.setProperty('--option-hover', originalCssUrl('ui/trays/icons/option-frame-739.png'));
          control.style.setProperty('--option-selected', originalCssUrl('ui/trays/icons/option-frame-740.png'));
        }
      }
      if (state.page > 0) layer.insertAdjacentHTML('beforeend', button('page:-1', 'Previous row', 872, 643, 42, 33));
      if (state.page < nativeTray.pages.length - 1) layer.insertAdjacentHTML('beforeend', button('page:1', 'Next row', 872, 700, 42, 33));
    }
    if (state.tray === 'text') {
      layer.innerHTML += `
        <select class="text-value" id="font" aria-label="Font" style="${place(152, 658, 103, 27)}">${TEXT_FONTS.map(font => `<option value="${escape(font.value)}">${escape(font.label)}</option>`).join('')}</select>
        <input class="text-value" id="font-size" aria-label="Font size" style="${place(300, 660, 34, 28)}" type="number" min="7" max="336" value="${state.textSize}">
        <select class="text-value" id="text-voice" aria-label="Voice" style="${place(626, 671, 143, 28)}"><option value="">Default Voice</option></select>
        ${TEXT_STEPPERS.map(({ action, label, x, y, symbol }) => button(action, label, x, y, 43, 31)
          .replace('class="', 'class="text-step ').replace('</button>', `${symbol}</button>`)
          .replace('title=', `${textStep(state, action) === null ? 'disabled' : ''} title=`)).join('')}
        ${button('bold', 'Bold', 153, 716, 30, 32).replace('title=', `aria-pressed="${state.bold}" title=`)}
        ${button('italic', 'Italic', 183, 716, 30, 32).replace('title=', `aria-pressed="${state.italic}" title=`)}
        ${button('underline', 'Underline', 212, 716, 30, 32).replace('title=', `aria-pressed="${state.underline}" title=`)}
        ${['left', 'center', 'right'].map((align, index) => button(`align:${align}`, `Align ${align}`, 252 + index * 38, 715, 33, 35).replace('title=', `aria-pressed="${state.align === align}" title=`)).join('')}
        ${button('speak', 'Read Aloud', 495, 648, 56, 82)}
      `;
      if (!TEXT_FONTS.some(entry => entry.value === state.font)) $('#font').add(new Option(state.font, state.font));
      $('#font').value = state.font;
      const voiceSelect = $('#text-voice');
      for (const voice of window.speechSynthesis?.getVoices() || []) voiceSelect.add(new Option(voice.name, voice.voiceURI));
      voiceSelect.value = state.voice;
    }
    if (state.tray === 'grab' && state.tools.grab === 'grab' && !(nativeUi && nativeTray)) {
      layer.innerHTML += '<div class="path-controls"><button class="pill" data-action="path">Path</button><button class="pill" data-action="loop-path">Loop Path</button><button class="pill" data-action="preview-object">Play Object</button></div>';
    }
    if (nativeDraw) disconnectTraySprites = renderNativeDrawing($('#native-draw'), nativeUi, state, layer);
    else if (nativeUi && nativeTray && nativeTray.sizeEnabled !== false && ['paint', 'mixer', 'eraser'].includes(state.tray)) {
      disconnectTraySprites = renderNativeSizes(layer, nativeUi, state.sizes[state.tray]);
    }
  }
  for (const control of app.querySelectorAll('.side')) {
    control.setAttribute('aria-pressed', String(control.dataset.action === `tray:${state.tray}`));
  }
  const motionView = trayState(state);
  const motionReady = nativeToolMotion.update({ tray: state.tray, art: motionView.art, page: state.page,
    selected: state.tray === 'eraser' && state.tools.eraser === 'square' ? 'round' : state.tools[state.tray], color: state.color, nativeUi });
  if (motionReady) {
    $('#native-draw').querySelectorAll('[data-native-drawing-tool]').forEach(image => image.remove());
    if (!nativeDraw) trayArt.src = original(`ui/${nativeToolMotion.backdropPath}`);
  }
  nativeSecondaryMotion.update({ tray: state.tray, art: motionView.art, page: state.page,
    selected: state.tools[state.tray], eraserShape: state.eraserShape, color: state.color, nativeUi });
  updateActionMotion();
  syncTool();
}

function selectTray(group) {
  openPaper(false);
  objectPlacement = null;
  state.pickColor = false;
  studioColorPicker?.reset();
  state.tray = group;
  state.category = 0;
  state.libraryPage = 0;
  state.libraryTab = null;
  state.selectedAsset = group === 'stamp' ? state.stamp : null;
  state.page = 0;
  state.effect = 0;
  state.alt = false;
  showTray();
}

function chooseColor(color) {
  state.color = color;
  studioColorPicker?.setColor(color);
  if (nativeUi) showTray();
  drawSwatch(color);
  if (!nativeUi) syncTool();
}

function openPaper(open) {
  const wasOpen = paperOpen;
  paperOpen = open;
  const picker = $('#paper-picker');
  const control = $('#hit-layer [data-action="paper"]');
  control.setAttribute('aria-expanded', String(open));
  control.setAttribute('aria-controls', 'paper-picker');
  if (!open) {
    picker.hidden = true;
    if (wasOpen || nativePaperPicker?.state !== 'closed') nativePaperPicker?.close();
    return;
  }
  if (nativePaperPicker) {
    if (wasOpen && !picker.hidden) {
      renderPaperPicker();
      return;
    }
    paperPage = Math.floor((selectedPaper - 12300) / 7);
    picker.hidden = true;
    void nativePaperPicker.open(selectedPaper, () => { if (paperOpen) renderPaperPicker(); });
  } else renderPaperPicker();
}

function syncPaperSelection(source) {
  const match = /\/paper\/(123\d{2})\.png(?:[?#]|$)/.exec(source ?? '');
  const id = match ? Number(match[1]) : 12300;
  const next = id >= 12300 && id <= 12320 ? id : 12300;
  if (next === selectedPaper) return;
  selectedPaper = next;
  nativePaperPicker?.setSelected(next);
  if (paperOpen) openPaper(false);
}

function renderPaperPicker() {
  const picker = $('#paper-picker');
  picker.hidden = false;
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Paper textures');
  const page = nativeUi?.paperTextures?.[paperPage];
  if (page) {
    picker.innerHTML = `<img alt="" src="${original(`ui/${page.image}`)}" style="${place(...page.rect)}">`
      + page.options.map(({ id, rect }) => button(`texture:${id}`, id === 12300 ? 'Smooth Paper' : `Paper texture ${id - 12300}`, ...rect, 'tray-hit')
        .replace('title=', `aria-pressed="${id === selectedPaper}" title=`)).join('')
      + (paperPage > 0 ? button('paper-page:-1', 'Previous texture row', 860, 542, 32, 36) : '')
      + (paperPage < nativeUi.paperTextures.length - 1 ? button('paper-page:1', 'Next texture row', 860, 579, 32, 36) : '');
  } else {
    picker.innerHTML = `<img alt="" src="${original('guide/paper.png')}" style="${place(394, 540, 503, 92)}">`
      + paperTextures.map((name, index) => button(`texture:${12300 + index}`, name, 401 + index * 60, 545, 58, 63)).join('');
  }
}

function renderPalette() {
  const native = nativeUi?.colorPicker;
  const palette = $('#palette');
  if (native) {
    palette.classList.add('original-palette');
    palette.style.cssText = place(native.x, native.y, native.w, native.h) + `;background-image:url("${original('ui/color-picker.png')}")`;
    palette.innerHTML = native.chips.map(({ x, y, color }) => button(`color:${color}`, color, x - 6, y - 6, 12, 12, 'palette-chip')).join('')
      + button('eyedropper', 'Eye Dropper', 73, 27, 55, 49)
      + '<input id="custom-color" aria-label="Custom color" title="Custom color" type="color" value="' + state.color + '">';
    return;
  }
  const hues = [0, 18, 38, 56, 85, 118, 161, 188, 214, 241, 279, 325];
  const colors = [81, 70, 60, 50, 42, 30, 18].flatMap(light => hues.map(hue => {
    const convert = n => {
      const chroma = .94 * Math.min(light, 100 - light) / 100;
      const k = (n + hue / 30) % 12;
      return Math.round(255 * (light / 100 - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
    };
    return `#${convert(0)}${convert(8)}${convert(4)}`;
  })).concat(['#ffffff', '#ececec', '#d8d8d8', '#c0c0c0', '#a9a9a9', '#919191', '#797979', '#626262', '#494949', '#303030', '#171717', '#000000']);
  $('#palette').innerHTML = `<div class="swatches">${colors.map(color => `<button type="button" data-action="color:${color}" aria-label="${color}" title="${color}" style="--swatch:${color}"></button>`).join('')}</div>
    <div class="palette-actions"><button class="pill" data-action="eyedropper">Eye Dropper</button><label>Custom <input id="custom-color" type="color" value="${state.color}"></label></div>`;
}

function openPalette(open) {
  studioColorPicker ??= createStudioColorPicker({ studio, palette: $('#palette'), trigger: $('#color-button'),
    original, getColor: () => state.color, renderControls: renderPalette, fallback: renderPalette,
    select: chooseColor, preview: drawSwatch,
    eyedropper: () => { state.pickColor = true; syncTool(); },
  });
  if (open) studioColorPicker.open(); else studioColorPicker.close();
}

function coordinates(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function soundLevel() {
  if (!soundMeter) return 0;
  const buffer = new Uint8Array(soundMeter.fftSize);
  soundMeter.getByteTimeDomainData(buffer);
  return Math.sqrt(buffer.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / buffer.length);
}

async function enableMicrophone() {
  if (soundInput || !navigator.mediaDevices?.getUserMedia) return;
  const request = ++micRequest;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (request !== micRequest) { stream.getTracks().forEach(track => track.stop()); return; }
    const context = new AudioContext();
    await context.resume();
    soundMeter = context.createAnalyser();
    soundMeter.fftSize = 256;
    context.createMediaStreamSource(stream).connect(soundMeter);
    soundInput = { context, stream };
    const refresh = () => {
      if (!soundInput) return;
      if (state.tray === 'paint' && state.tools.paint === 'sound') paint.setOptions({ level: soundLevel() });
      requestAnimationFrame(refresh);
    };
    refresh();
  } catch { showStatus('Allow microphone access to paint with sound.'); }
}

function stopMicrophone() {
  micRequest++;
  if (!soundInput) return;
  soundInput.stream.getTracks().forEach(track => track.stop());
  soundInput.context.close().catch(() => {});
  soundInput = null;
  soundMeter = null;
}

async function loadedImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

async function drawLayers(context, layers, right = false) {
  const media = await Promise.all(layers.map(layer => loadedImage(right ? layer.rightSrc ?? layer.src : layer.src)));
  for (const [index, layer] of layers.entries()) {
    context.drawImage(media[index], layer.x, layer.y, layer.width, layer.height);
  }
}

async function applyAsset(item, point) {
  if (!item.src) {
    showStatus(`${item.name} has no browser-ready media in this import.`);
    return;
  }
  try {
    if (item.group === 'stamps') {
      state.stamp = item;
      state.selectedAsset = item;
      if (point) await paint.placeAsset(item.src, { ...point, width: state.sizes.stamp * 3, height: state.sizes.stamp * 3 });
      highlightLibraryItem(library, item);
      syncTool();
    } else if (item.group === 'backgrounds') {
      const request = ++backgroundRequest;
      let front = item.foreground ?? item.foregroundSrc ?? null;
      if (item.layers?.length) {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = canvas.width;
        layerCanvas.height = canvas.height;
        await drawLayers(layerCanvas.getContext('2d'), item.layers);
        front = layerCanvas.toDataURL();
      }
      if (request !== backgroundRequest) return;
      const before = state.backdrop;
      const result = await paint.setBackground(item.src, { foreground: front, clearArt: true });
      if (result) {
        state.backdrop = item;
        if (undoStack.at(-1)?.kind === 'paint') undoStack[undoStack.length - 1] = { kind: 'background', before, after: item };
      }
    } else if (item.group === 'sounds') {
      const track = item.personal ? 'narration' : 'sound';
      remember({ kind: 'sound', track, before: state[track], after: item });
      state[track] = item;
      soundPreview?.pause();
      soundPreview = new Audio(item.src);
      soundPreview.play().catch(() => showStatus('Use Play Picture to hear the sound.'));
    } else {
      if (item.group !== 'frames' || !scene.frameMovie(item)) scene.addAsset(item, point);
      selectTray('grab');
    }
  } catch { showStatus(`Could not load ${item.name}.`); }
}

library.addEventListener('dragstart', event => {
  const control = event.target.closest('[data-asset]');
  const item = library.visibleItems?.[Number(control?.dataset.asset)];
  if (!item?.src) return;
  objectPlacement = item;
  event.dataTransfer.setData('text/plain', item.name);
  event.dataTransfer.effectAllowed = 'copy';
});
library.addEventListener('dragend', () => { objectPlacement = null; syncTool(); });
surface.addEventListener('dragover', event => { if (objectPlacement) event.preventDefault(); });
surface.addEventListener('drop', event => {
  if (!objectPlacement) return;
  event.preventDefault();
  const item = objectPlacement;
  objectPlacement = null;
  state.selectedAsset = item;
  highlightLibraryItem(library, item);
  applyAsset(item, coordinates(event));
});

canvas.addEventListener('pointerdown', event => {
  if (pathPointer === 'pending' && scene.pathStart(event)) {
    pathPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
}, { capture: true });
canvas.addEventListener('pointermove', event => {
  if (pathPointer !== event.pointerId || !scene.pathMove(event)) return;
  const point = coordinates(event);
  effects.fillStyle = '#237ed1';
  effects.fillRect(point.x - 2, point.y - 2, 4, 4);
}, { capture: true });
function endPath(event) {
  if (pathPointer !== event.pointerId) return;
  pathPointer = null;
  const added = event.type === 'pointerup' && scene.pathEnd(event);
  if (event.type !== 'pointerup') scene.cancelPath();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  effects.clearRect(0, 0, canvas.width, canvas.height);
  syncTool();
  showStatus(added ? 'Path added. Press Play Picture to see it move.' : '');
}
canvas.addEventListener('pointerup', endPath, { capture: true });
canvas.addEventListener('pointercancel', endPath, { capture: true });
canvas.addEventListener('lostpointercapture', endPath, { capture: true });
function cancelRecordedPathInput() {
  if (pathPointer === null) return;
  const pointerId = pathPointer;
  if (pointerId === 'pending') {
    pathPointer = null;
    scene.cancelPath();
    effects.clearRect(0, 0, canvas.width, canvas.height);
    syncTool();
  } else endPath({ type: 'pointercancel', pointerId });
}
onInteractionInactive(canvas, cancelRecordedPathInput);

function importFile(kind) {
  importKind = kind;
  const input = $('#image-file');
  input.accept = kind === 'sound' ? 'audio/*' : kind === 'movie' ? 'video/*' : 'image/*';
  input.click();
}

async function clearBackground() {
  const before = state.backdrop;
  if (await paint.setBackground(null, { clearArt: true })) {
    state.backdrop = null;
    if (undoStack.at(-1)?.kind === 'paint') undoStack[undoStack.length - 1] = { kind: 'background', before, after: null };
  }
}

function playTracks(sound, narration) {
  return [sound, narration].flatMap((track, index) => {
    if (!track?.src) return [];
    const player = new Audio(track.src);
    if (index === 0 && narration) player.volume = .42;
    player.play().catch(() => {});
    return [player];
  });
}

function stopTracks(players) {
  for (const player of players) player.pause();
}

function playPicture(next = !state.playing) {
  state.playing = next;
  scene.setPlaying(next);
  syncTool();
  const control = app.querySelector('[data-action="play"]');
  control.setAttribute('aria-pressed', String(next));
  control.setAttribute('aria-label', next ? 'Stop Picture' : 'Play Picture');
  if (next) {
    soundPreview?.pause();
    stopTracks(picturePlayers);
    picturePlayers = playTracks(state.sound, state.narration);
    scene.speak();
    showStatus('Playing picture. Press Play or Esc to stop.');
  } else {
    soundPreview?.pause();
    stopTracks(picturePlayers);
    window.speechSynthesis?.cancel();
  }
}

function clearPicture() {
  backgroundRequest++;
  playUiSound(1029);
  const before = scene.snapshot();
  const sound = state.sound;
  const narration = state.narration;
  const backdrop = state.backdrop;
  if (state.playing) playPicture(false);
  soundPreview?.pause();
  loadingProject = true;
  const cleared = paint.clear();
  scene.restore([]);
  state.sound = null;
  state.narration = null;
  state.backdrop = null;
  loadingProject = false;
  if (cleared || before.length || sound || narration || backdrop) {
    remember({ kind: 'clear', paint: cleared, before, sound, narration, backdrop });
  }
}

function freshPicture() {
  backgroundRequest++;
  if (state.playing) playPicture(false);
  soundPreview?.pause();
  paint.reset();
  scene.restore([]);
  state.sound = null;
  state.narration = null;
  state.backdrop = null;
  undoStack.length = 0;
  redoStack.length = 0;
  syncHistory();
  title.value = 'KidPix1';
  selectTray('draw');
}

function createComposite(result = document.createElement('canvas')) {
  result.width = canvas.width;
  result.height = canvas.height;
  const context = result.getContext('2d');
  paint.renderTo(context, { includeForeground: false });
  scene.draw(context);
  paint.renderForegroundTo(context);
  return result;
}

let colorSample;
function samplePictureColor(point) {
  colorSample ??= document.createElement('canvas');
  const context = createComposite(colorSample).getContext('2d');
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)));
  return '#' + [...context.getImageData(x, y, 1, 1).data].slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('');
}

function download(name, content) {
  const link = document.createElement('a');
  const url = content instanceof Blob ? URL.createObjectURL(content) : content;
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, '_');
  link.click();
  if (content instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function project() {
  return { version: 1, format: 'kidpix-web', title: title.value, paint: paint.save(), objects: scene.snapshot(), sound: state.sound, narration: state.narration, backdrop: state.backdrop };
}

async function restoreProject(data) {
  if (data?.version !== 1 || data?.format !== 'kidpix-web' || !Array.isArray(data.objects)) throw new Error('Choose a Kid Pix web picture.');
  data = rebaseProject(data);
  loadingProject = true;
  try {
    if (state.playing) playPicture(false);
    soundPreview?.pause();
    await paint.restore(data.paint);
    scene.restore(data.objects);
    state.sound = data.sound ?? null;
    state.narration = data.narration ?? null;
    state.backdrop = data.backdrop ?? null;
    title.value = data.title || 'KidPix1';
    undoStack.length = 0;
    redoStack.length = 0;
    syncHistory();
  } finally { loadingProject = false; }
}

async function exportStereo() {
  if (!state.backdrop?.rightSrc) {
    showStatus('Choose a 3D background to export a red/cyan picture.');
    return;
  }
  try {
    const left = createComposite();
    const stateImage = paint.save();
    const right = document.createElement('canvas');
    right.width = canvas.width;
    right.height = canvas.height;
    const context = right.getContext('2d');
    const background = new Image();
    const ink = new Image();
    background.src = state.backdrop.rightSrc;
    ink.src = stateImage.art;
    await Promise.all([background.decode(), ink.decode()]);
    context.drawImage(background, 0, 0, right.width, right.height);
    context.drawImage(ink, 0, 0, right.width, right.height);
    scene.draw(context, await scene.rightEyeImages());
    if (state.backdrop.layers?.length) await drawLayers(context, state.backdrop.layers, true);
    else paint.renderForegroundTo(context);
    const lctx = left.getContext('2d');
    const ldata = lctx.getImageData(0, 0, left.width, left.height);
    const rdata = context.getImageData(0, 0, right.width, right.height);
    for (let i = 0; i < ldata.data.length; i += 4) {
      ldata.data[i + 1] = rdata.data[i + 1];
      ldata.data[i + 2] = rdata.data[i + 2];
    }
    lctx.putImageData(ldata, 0, 0);
    download(`${title.value || 'Kid Pix'} 3D.png`, left.toDataURL());
  } catch { showStatus('Could not export the 3D picture.'); }
}

let slides = [];
let selectedSlide = 0;
let slidePage = 0;
let slideTimer;
let slideTransitions = false;

function showSlides() {
  $('#slide-sound-title').textContent = slideSound?.name || 'No Sound';
  $('#slide-deck').innerHTML = `<button type="button" data-action="slide-transition" aria-pressed="${slideTransitions}">Transitions ${slideTransitions ? 'On' : 'Off'}</button>
    <button type="button" data-action="slide-open" aria-label="Open selected picture">${escape($('#slide-title').value)}</button>`;
  const grid = $('#slide-grid');
  grid.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const number = slidePage * 12 + index;
    const slide = slides[number];
    return `<button type="button" class="slide-card" data-action="slide:${number}" aria-pressed="${selectedSlide === number}">
      <b>${String(number + 1).padStart(2, '0')}</b>
      ${slide ? `<img src="${slide.preview}" alt="">` : '<span class="slide-placeholder"></span>'}
      <small>${escape(slide?.picture.title || 'Empty Slide')}</small>
    </button>`;
  }).join('');
  const maxPage = Math.max(0, Math.floor((slides.length - 1) / 12));
  $('[data-action="slide-up"]').disabled = slidePage === 0;
  $('[data-action="slide-down"]').disabled = slidePage === maxPage;
}

function openSlides(open) {
  if (open) nativeRollovers?.cancel();
  if (state.playing) playPicture(false);
  stopSlides();
  $('#slides').hidden = !open;
  $('#paint-zone').hidden = open;
  if (open) { showStatus(''); showSlides(); }
}

const slideScene = createScene($('#slide-objects'), $('#playback-picture'), () => {});

function stopSlides() {
  clearTimeout(slideTimer);
  if ($('#playback').hidden) return;
  slideTrack?.pause();
  stopTracks(slidePicturePlayers);
  window.speechSynthesis?.cancel();
  slideScene.setPlaying(false);
  slideScene.restore([]);
  $('#playback').hidden = true;
}

function setSlideImage(id, source) {
  const image = $(id);
  image.hidden = !source;
  if (source) image.src = source;
  else image.removeAttribute('src');
}

function playSlides() {
  if (!slides.length) { showStatus('Add a picture with the Flipbook button first.'); return; }
  stopSlides();
  const player = $('#playback');
  const pictureView = $('#playback-picture');
  let index = 0;
  player.hidden = false;
  if (slideSound) {
    slideTrack = new Audio(slideSound.src);
    slideTrack.loop = true;
    slideTrack.play().catch(() => {});
  }
  function advance() {
    if (index >= slides.length) { stopSlides(); return; }
    const slide = slides[index++];
    const picture = slide.picture;
    const ink = picture.paint;
    setSlideImage('#slide-base', ink?.background || (!ink ? slide.preview : null));
    setSlideImage('#slide-ink', ink?.art);
    setSlideImage('#slide-front', ink?.foreground);
    slideScene.restore(picture.objects || []);
    slideScene.setPlaying(true);
    stopTracks(slidePicturePlayers);
    slidePicturePlayers = playTracks(picture.sound, picture.narration);
    window.speechSynthesis?.cancel();
    slideScene.speak();
    if (slideTransitions) pictureView.animate([{ opacity: .1 }, { opacity: 1 }], { duration: 380 });
    slideTimer = setTimeout(advance, 3000);
  }
  advance();
}

function doEdit(command) {
  if (['cut', 'delete', 'paste'].includes(command)) cancelRecordedPathInput();
  if (state.tray === 'grab' && state.tools.grab === 'scissors') {
    if (['cut', 'copy', 'paste'].includes(command)) paint[command]();
  } else scene.edit(command);
}

const commands = {
  undo: () => { animateUndoGuy(); history('undo'); },
  'undo-face': () => { animateUndoGuy(); history(undoFaceRedo ? 'redo' : 'undo', true); },
  redo: () => { animateUndoGuy(); history('redo'); },
  new: () => showDialog('Create a new picture?', 'Save your picture first if you want to keep it.', [['Cancel'], ['New Picture', freshPicture]]),
  quit: () => showDialog('Close this picture?', 'Save your picture first if you want to keep it.', [['Cancel'], ['Close Picture', freshPicture]]),
  save: () => showDialog('Save Picture', 'Save an editable web picture or export an image.', [
    ['Cancel'],
    ['Export PNG', () => commands.export()],
    ['Save Picture', () => download(`${title.value || 'Kid Pix'}.kidpix-web`, new Blob([JSON.stringify(project())], { type: 'application/json' }))],
  ]),
  open: () => $('#picture-file').click(),
  ideas: async () => {
    try {
      const response = await fetch(original('ideas/index.json'));
      if (!response.ok) throw new Error();
      const ideas = await response.json();
      showPicker('Idea Machine', ideas.map(idea => ({
        ...idea, image: original(`ideas/${idea.image}`), thumbnail: original(`ideas/${idea.thumbnail}`),
      })), async idea => {
        freshPicture();
        title.value = idea.name;
        await paint.setBackground(idea.image);
        if (idea.sound) new Audio(original(`ideas/${idea.sound}`)).play().catch(() => {});
      });
    } catch { showStatus('The Idea Machine library is unavailable.'); }
  },
  'record-video': () => recordMedia('video', applyAsset),
  'record-sound': () => recordMedia('audio', media => {
    const item = { ...media, id: makeId(), personal: true };
    const entries = importedAssets.get('sounds') ?? [];
    entries.push(item);
    importedAssets.set('sounds', entries);
    if (state.tray === 'media' && state.media === 'sounds') {
      state.category = groups.sounds?.length ?? 0;
      state.libraryPage = Math.floor((entries.length - 1) / (libraryManifest?.trays.sounds.slots.length || 6));
      state.selectedAsset = item;
      showLibrary();
    }
    applyAsset(item);
  }),
  'import-image': () => importFile('image'),
  'import-background': () => importFile('background'),
  'import-sound': () => importFile('sound'),
  'import-movie': () => importFile('movie'),
  'remove-background': clearBackground,
  'remove-sound': () => {
    const track = state.selectedAsset?.personal ? 'narration' : 'sound';
    if (state[track]) remember({ kind: 'sound', track, before: state[track], after: null });
    state[track] = null;
    soundPreview?.pause();
    stopTracks(picturePlayers);
  },
  'delete-imported': () => {
    const key = libraryKey();
    const entries = importedAssets.get(key);
    if (!entries) return;
    const index = entries.findIndex(item => item.id === state.selectedAsset?.id);
    if (index < 0) return;
    entries.splice(index, 1);
    state.selectedAsset = null;
    if (!entries.length) state.category = 0;
    showLibrary();
  },
  export: () => download(`${title.value || 'Kid Pix'}.png`, createComposite().toDataURL()),
  print: () => window.print(),
  stereo: exportStereo,
  clear: clearPicture,
  play: () => { if (!state.playing) playUiSound(1003); playPicture(); },
  speak: () => scene.speak(),
  help: () => {
    state.extendedHelp = !state.extendedHelp;
    showStatus(state.extendedHelp ? 'Move over a tool to see its name. Press Esc to close help.' : '', 0);
  },
  about: () => showDialog('KID PIX 3D', `Version ${__APP_VERSION__}. Paint Zone and Slide Show with artwork and libraries from the Mac trial.`, [['OK']]),
  palette: () => openPalette(true),
  eyedropper: () => { state.pickColor = true; openPalette(false); syncTool(); },
  paper: () => { if (!nativePaperPicker) playUiSound(1006); openPaper(!paperOpen); },
  'stamp-edit': () => {
    if (!state.stamp) { showStatus('Choose a stamp to edit.'); return; }
    editStamp(state.stamp, state.color, stamp => {
      for (const category of groups.stamps || []) {
        const index = category.items.findIndex(item => item.id === stamp.id);
        if (index >= 0) category.items[index] = stamp;
      }
      state.stamp = stamp;
      state.selectedAsset = stamp;
      showTray();
    }).catch(() => showStatus('Could not open that stamp.'));
  },
  enlarge: () => { if (!scene.enlargeSelected()) showStatus('Select a movie with the Grab Hand first.'); },
  'preview-object': () => {
    const result = scene.togglePreview();
    if (result === null) showStatus('Select an animation or movie first.');
    else for (const control of app.querySelectorAll('[data-action="preview-object"]')) control.textContent = result ? 'Pause Object' : 'Play Object';
  },
  'loop-path': () => {
    const result = scene.toggleLoop();
    showStatus(result === null ? 'Draw an animation path first.' : result ? 'Loop Path on' : 'Loop Path off');
  },
  path: () => {
    if (!scene.beginPath()) { showStatus('Select an object with the Grab Hand first.'); return; }
    pathPointer = 'pending';
    syncTool();
    showStatus('Draw a path for the selected object.');
  },
  bold: () => { state.bold = !state.bold; applyTextStyle(); showTray(); },
  italic: () => { state.italic = !state.italic; applyTextStyle(); showTray(); },
  underline: () => { state.underline = !state.underline; applyTextStyle(); showTray(); },
  menu: () => {
    $('#menu-items').hidden = !$('#menu-items').hidden;
    $('#menu-trigger').setAttribute('aria-expanded', String(!$('#menu-items').hidden));
  },
  flipbook: () => {
    playUiSound(1032);
    slides.push({ preview: createComposite().toDataURL(), picture: project() });
    selectedSlide = slides.length - 1;
    slidePage = Math.floor(selectedSlide / 12);
    showStatus(`Picture added as slide ${slides.length}.`);
  },
  slideshow: () => { playUiSound(1031); openSlides(true); },
  'paint-zone': () => openSlides(false),
  'slide-play': playSlides,
  'slide-up': () => { slidePage = Math.max(0, slidePage - 1); showSlides(); },
  'slide-down': () => { slidePage = Math.min(Math.max(0, Math.floor((slides.length - 1) / 12)), slidePage + 1); showSlides(); },
  'slide-transition': () => { slideTransitions = !slideTransitions; showSlides(); },
  'slide-sound': () => showPicker('Slide Show Sound', (groups.sounds ?? []).flatMap(group => group.items), sound => {
    slideSound = sound;
    showSlides();
  }),
  'slide-sound-off': () => { slideSound = null; showSlides(); },
  'slide-export': () => {
    const slide = slides[selectedSlide];
    if (slide) download(`${slide.picture.title || 'Slide'}.png`, slide.preview);
  },
  'slide-print': () => {
    const slide = slides[selectedSlide];
    if (!slide) return;
    const image = document.createElement('img');
    image.id = 'print-slide';
    image.src = slide.preview;
    document.body.append(image);
    window.print();
    image.remove();
  },
  'stop-slides': stopSlides,
  'slide-new': () => showDialog('Create a new Slide Show?', 'This clears the current set of slides.', [['Cancel'], ['New Slide Show', () => { slides = []; selectedSlide = 0; slidePage = 0; showSlides(); }]]),
  'slide-delete': () => { if (slides[selectedSlide]) { slides.splice(selectedSlide, 1); selectedSlide = Math.max(0, selectedSlide - 1); slidePage = Math.floor(selectedSlide / 12); showSlides(); } },
  'slide-open': () => {
    const picture = slides[selectedSlide]?.picture;
    if (picture) restoreProject(picture).then(() => openSlides(false)).catch(error => showStatus(error.message));
  },
  'slide-help': () => showStatus('Use Flipbook in the Paint Zone to add slides.'),
  'slide-save': () => download(`${$('#slide-title').value || 'Slide Show'}.kidpix-web`, new Blob([JSON.stringify({
    version: 1, format: 'kidpix-web-slides', title: $('#slide-title').value, slides, sound: slideSound, transitions: slideTransitions,
  })], { type: 'application/json' })),
};

async function activate(action) {
  const [id, value] = action.split(':');
  const group = state.tray;
  if (id === 'tray') { playUiSound(libKeys.has(value) && value !== 'stamp' ? 1000 : 1002); stopMicrophone(); selectTray(value); }
  else if (id === 'tool') {
    if (value === 'spray') paint.resetNativeSpray();
    state.tools[group] = value;
    state.page = 0; state.effect = 0; state.alt = false;
    if (value === 'sound') enableMicrophone();
    else stopMicrophone();
    showTray();
  } else if (id === 'mode') { state.alt = value === 'true'; state.page = 0; state.effect = 0; showTray(); }
  else if (id === 'size') { state.sizes[group] = Number(value); showTray(); }
  else if (id === 'style') {
    if (group === 'grab') { state.selectionStyle = value; state.cookie = null; }
    else state.drawStyle = value;
    showTray();
  } else if (id === 'cookie') { state.selectionStyle = 'cookie-cutter'; state.cookie = Number(value); showTray(); }
  else if (id === 'effect') {
    if (state.tray === 'paint' && state.tools.paint === 'spray' && !state.alt) paint.resetNativeSpray();
    state.effect = Number(value); showTray();
  }
  else if (id === 'page') { state.page = Math.max(0, state.page + Number(value)); state.effect = 0; showTray(); }
  else if (id === 'lib-page') {
    state.libraryPage = Math.max(0, state.libraryPage + Number(value));
    state.selectedAsset = null;
    showLibrary();
  } else if (id === 'category-step') {
    state.category = Math.max(0, Math.min(library.categories.length - 1, state.category + Number(value)));
    state.libraryPage = 0;
    state.selectedAsset = null;
    showLibrary();
  } else if (id === 'library-tab') {
    if (state.tray === 'media') state.media = value;
    else state.libraryTab = value;
    state.category = 0;
    state.libraryPage = 0;
    state.selectedAsset = null;
    showLibrary();
  }
  else if (id === 'eraser-shape') { state.eraserShape = value; state.tools.eraser = value; showTray(); }
  else if (id === 'color') { chooseColor(value); openPalette(false); }
  else if (id === 'paper-page') {
    paperPage = Math.max(0, Math.min((nativeUi?.paperTextures?.length || 1) - 1, paperPage + Number(value)));
    openPaper(true);
  } else if (id === 'texture') {
    try {
      const texture = Number(value);
      const applied = await paint.setPaper(texture === 12300 ? null : original(`tools/paper/${texture}.png`));
      if (applied) openPaper(false);
    } catch { showStatus('Could not load the paper texture.'); }
  } else if (id === 'slide') {
    selectedSlide = Number(value);
    showSlides();
  } else if (id === 'font-step' || id === 'font-size-step') {
    const change = textStep(state, `${id}:${value}`);
    if (change) { Object.assign(state, change); applyTextStyle(); updateActionMotion(); syncTool(); }
  } else if (id === 'align') { state.align = value; applyTextStyle(); showTray(); }
  else if (id === 'edit') doEdit(value);
  else commands[id]?.();
}

app.addEventListener('click', event => {
  const assetButton = event.target.closest('[data-asset]');
  if (assetButton) {
    const item = library.visibleItems?.[Number(assetButton.dataset.asset)];
    if (item) {
      state.selectedAsset = item;
      highlightLibraryItem(library, item);
      if (state.tray === 'stamp' || event.detail === 0) applyAsset(item);
    }
    return;
  }
  const control = event.target.closest('[data-action]');
  if (control) {
    if (control.closest('#menu-items')) {
      $('#menu-items').hidden = true;
      $('#menu-trigger').setAttribute('aria-expanded', 'false');
      for (const item of app.querySelectorAll('#menu details')) item.open = false;
    }
    activate(control.dataset.action);
  } else if (!event.target.closest('#palette')) openPalette(false);
});

library.addEventListener('dblclick', event => {
  const control = event.target.closest('[data-asset]');
  const item = library.visibleItems?.[Number(control?.dataset.asset)];
  if (!item) return;
  if (state.tray === 'stamp') commands['stamp-edit']();
  else applyAsset(item);
});
$('#slide-grid').addEventListener('dblclick', event => {
  const card = event.target.closest('.slide-card');
  if (card && slides[selectedSlide]) commands['slide-open']();
});
$('#slide-title').addEventListener('change', () => showSlides());

app.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'category' || target.id === 'media-category') {
    if (target.id === 'media-category') state.media = target.value;
    state.category = target.id === 'category' ? Number(target.value) : 0;
    state.libraryPage = 0;
    state.selectedAsset = null;
    showLibrary();
  } else if (target.id === 'custom-color') {
    chooseColor(target.value);
  } else if (['font', 'font-size', 'text-voice'].includes(target.id)) {
    if (target.id === 'font') state.font = target.value;
    else if (target.id === 'text-voice') state.voice = target.value;
    else {
      const size = editedSize(target.value);
      if (size === null) return;
      state.textSize = size; target.value = size;
    }
    applyTextStyle();
    syncTextValues();
    syncTool();
  } else if (target.id === 'picture-file') {
    const file = target.files[0];
    target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format === 'kidpix-web-slides' && data.version === 1 && Array.isArray(data.slides)) {
        const imported = rebaseProject(data);
        slides = imported.slides;
        slideSound = imported.sound ?? null;
        slideTransitions = Boolean(data.transitions);
        $('#slide-title').value = data.title || 'My Slide Show';
        selectedSlide = 0;
        slidePage = 0;
        openSlides(true);
      } else {
        await restoreProject(data);
        openSlides(false);
      }
    } catch (error) { showStatus(error.message || 'Could not open that picture.'); }
  } else if (target.id === 'image-file') {
    const file = target.files[0];
    target.value = '';
    if (!file) return;
    try {
      const src = await readData(file);
      if (importKind === 'image') {
        await paint.loadImage(src);
        return;
      }
      const group = `${importKind}s`;
      const item = {
        id: makeId(), name: file.name, group, src, personal: true,
        thumbnail: importKind === 'background' ? src : null,
        mediaType: { sound: 'audio', movie: 'video', background: 'image' }[importKind],
      };
      const entries = importedAssets.get(group) ?? [];
      entries.push(item);
      importedAssets.set(group, entries);
      state.selectedAsset = item;
      if (libKeys.has(state.tray) && libraryKey() === group) {
        state.libraryTab = null;
        state.category = libraryCategories(groups, group, null).length;
        state.libraryPage = Math.floor((entries.length - 1) / (libraryManifest?.trays[group]?.slots.length || 6));
        showLibrary();
      }
      await applyAsset(item);
    } catch { showStatus('Could not open that file.'); }
  }
});

$('#color-button').addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') openPalette(true); });
app.addEventListener('pointerdown', event => {
  if (paperOpen && !event.target.closest('#paper-picker, [data-action="paper"]')) openPaper(false);
}, { capture: true });
canvas.addEventListener('pointerleave', () => { if (state.pickColor) drawSwatch(state.color); });
app.addEventListener('pointerover', event => {
  if (state.extendedHelp && event.target.closest('button[title]')) showStatus(event.target.closest('button').title, 0);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (state.pickColor) {
      state.pickColor = false;
      drawSwatch(state.color);
      syncTool();
    }
    openPalette(false);
    openPaper(false);
    $('#menu-items').hidden = true;
    $('#menu-trigger').setAttribute('aria-expanded', 'false');
    state.extendedHelp = false;
    cancelRecordedPathInput();
    stopSlides();
    if (state.playing) playPicture(false);
    else paint.cancel();
    showStatus('');
    return;
  }
  if (event.target.matches('input,textarea,select') || event.target.isContentEditable || dialog.open) return;
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    const shortcuts = { z: event.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'save', o: 'open', n: 'new', p: 'print', l: 'enlarge', c: 'edit:copy', x: 'edit:cut', v: 'edit:paste' };
    if (shortcuts[key]) {
      event.preventDefault();
      activate(shortcuts[key]);
    }
  } else if (state.tray === 'grab' && scene.hasSelection()) {
    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      cancelRecordedPathInput();
      scene.edit('delete');
    }
    const shift = event.shiftKey ? 10 : 1;
    const arrows = { ArrowLeft: [-shift, 0], ArrowRight: [shift, 0], ArrowUp: [0, -shift], ArrowDown: [0, shift] };
    if (arrows[event.key]) { event.preventDefault(); scene.nudge(...arrows[event.key]); }
  }
});

$('#paint-chrome').style.backgroundImage = `url("${original('guide/paint-zone.png')}")`;
$('#slide-chrome').style.backgroundImage = `url("${original('guide/slides.png')}")`;
loadNativeUi().then(manifest => {
  if (!manifest) return;
  nativeUi = manifest;
  studio.style.setProperty('--cursor-grab', nativeCursor(manifest, 10008, 'grab'));
  studio.style.setProperty('--cursor-text', nativeCursor(manifest, 10019, 'text'));
  $('#paint-chrome').classList.add('native');
  $('#paint-chrome').style.backgroundImage = `url("${original('ui/paint-empty.png')}")`;
  const paperOptions = { excludeNames: manifest.paperAnimations ? ['paper-texture'] : [] };
  nativeSprites = nativeButtonParts(manifest, $('#hit-layer'), paperOptions);
  applyNativeControlRegions(manifest, $('#hit-layer'));
  nativeRollovers?.();
  $('#native-buttons').replaceChildren(...[...nativeSprites].filter(([name]) => name !== 'swatch').map(([, image]) => image));
  if (manifest.undoAnimations) undoAnimation = createNativeAnimation($('#native-buttons'), nativeSprites.get('undo-face'), playAnimationSound);
  nativeRollovers = attachNativeRollovers(manifest, $('#hit-layer'), nativeSprites, $('#native-buttons'), paperOptions);
  if (manifest.paperAnimations) {
    nativePaperPicker = createNativePaperPicker({
      manifest: manifest.paperAnimations,
      control: $('#hit-layer [data-action="paper"]'),
      layer: $('#native-buttons'),
      staticSprite: nativeSprites.get('paper-texture'),
      onError() {
        showStatus('Could not load the paper animation.');
        if (paperOpen) renderPaperPicker();
      },
    });
    nativePaperPicker.setSelected(selectedPaper);
  }
  if (manifest.slideShow) {
    $('#slides').classList.add('native-slides');
    $('#slides').style.setProperty('--slide-slot', originalCssUrl('ui/slide-slot.png'));
    $('#slides').style.setProperty('--slide-slot-selected', originalCssUrl('ui/slide-slot-selected.png'));
    $('#slide-chrome').style.backgroundImage = `url("${original('ui/slideshow.png')}")`;
  }
  showTray();
}).catch(() => {});
fetch(original('ui/library-trays.json')).then(response => response.ok ? response.json() : null).then(manifest => {
  libraryManifest = manifest;
  if (libKeys.has(state.tray)) showLibrary();
}).catch(() => {});
fetch(original('ui/trays.json')).then(response => response.ok ? response.json() : {}).then(({ trays }) => {
  nativeTrays = trays || {};
  showTray();
}).catch(() => {});
fetch(original('tools/gradients.json')).then(response => response.ok ? response.json() : []).then(items => {
  gradientDefinitions = items;
  syncTool();
}).catch(() => {});
trayArt.addEventListener('error', () => { $('#tray-bed').hidden = false; });
trayArt.addEventListener('load', () => { $('#tray-bed').hidden = true; });
chooseColor(state.color);
showTray();
syncHistory();
loadCatalog().then(catalog => {
  groups = catalog;
  catalogStatus = 'No items in this category.';
  if (libKeys.has(state.tray)) showLibrary();
}).catch(() => {
  catalogStatus = 'Run npm run import:original to load the trial libraries.';
  if (libKeys.has(state.tray)) showLibrary();
});
