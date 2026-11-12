import { ensureFace, resolveBundledFace, assertTextFontsReady, applyCanvasFont } from './bundled-fonts.js';
import { stickerRaster } from './sticker-raster.js';
import { createTextClipboard } from './text-clipboard.js';
import { editorText } from './editor-text.js';
import { interactionOwner, onInteractionInactive } from './interaction-owner.js';
import { makeId } from './id.js';

const sceneWidth = 720;
const sceneHeight = 542;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function frameOpening(object) {
  const frame = object.frame;
  if (!frame?.opening) return null;
  const { x, y, width, height } = frame.opening;
  return {
    x: x * object.width / frame.width, y: y * object.height / frame.height,
    width: width * object.width / frame.width, height: height * object.height / frame.height,
  };
}

function pathPosition(object, elapsed) {
  const path = object.path;
  if (!path?.length) return null;
  const duration = object.pathDuration || 3300;
  const segment = Math.floor(elapsed / duration);
  const closed = Math.hypot(path[0].x - path.at(-1).x, path[0].y - path.at(-1).y) < 16;
  const progress = !object.pathLoop ? Math.min(1, elapsed / duration)
    : !closed && segment % 2 ? 1 - elapsed % duration / duration : elapsed % duration / duration;
  const index = progress * (path.length - 1);
  const left = path[Math.floor(index)];
  const right = path[Math.ceil(index)];
  const ratio = index % 1;
  return { x: left.x + (right.x - left.x) * ratio, y: left.y + (right.y - left.y) * ratio };
}

export function createScene(root, surface, onChange) {
  const inputOwner = interactionOwner(root.ownerDocument);
  const listeners = new AbortController();
  const inputOptions = { signal: listeners.signal };
  let pathPointer = null;
  let pathTarget = null;
  let objects = [];
  let selected = null;
  let clipboard = null;
  let before = null, typingOwner = null;
  let documentEpoch = 0, textRevision = 0, disposed = false;
  let beforeRange = null;
  let styleRequest = 0, fontRestore = 0;
  const styleIntents = new WeakMap();
  let rangeRevision = 0, lastRange;
  function syncRangeRevision() {
    const selection = root.ownerDocument.getSelection();
    const next = selection && [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset];
    if (!lastRange || next?.some((value, index) => value !== lastRange[index])) { lastRange = next; rangeRevision++; }
  }
  root.ownerDocument.addEventListener('selectionchange', syncRangeRevision, inputOptions);
  let mode = 'paint';
  let playing = false;
  let animation;
  let suspended = false;
  const suspendedVideos = new Set();
  let sceneRevision = 0, navigationRevision = 0, navigationCache;
  const preparedStickers = new WeakMap();
  let drag = null;
  let path = null;
  let pathStarted = 0;
  const previews = new Set();
  let readRevision = 0, readIdentity;
  const notify = () => { sceneRevision++; root.dispatchEvent(new Event('scenechange')); };

  const current = () => objects.find(object => object.id === selected);
  const snapshot = () => structuredClone(objects);
  const changed = (prior, ranges) => {
    navigationRevision++;
    const identity = navigationIdentity();
    onChange(prior, snapshot(), ranges);
    return identity;
  };
  const editorFor = id => [...root.children].find(node => node.dataset.object === id)?.querySelector('.object-text');
  function selectionAt(id, range, focus = true) {
    const editor = editorFor(id);
    if (!editor || !range) return false;
    const epoch = documentEpoch;
    if (focus) editor.focus({ preventScroll: true });
    if (disposed || documentEpoch !== epoch || editorFor(id) !== editor) return false;
    const model = editorText(editor);
    root.ownerDocument.getSelection().setBaseAndExtent(...model.point(range.anchor), ...model.point(range.focus));
    return !disposed && documentEpoch === epoch && editorFor(id) === editor;
  }
  function flushText() {
    if (!before) return;
    const prior = before, range = beforeRange;
    before = null; beforeRange = null; typingOwner = null;
    if (JSON.stringify(prior) !== JSON.stringify(objects)) return changed(prior, {
      before: range, after: textClipboard.target() });
  }
  const textClipboard = createTextClipboard({ epoch: () => documentEpoch,
    current: () => ({ id: current()?.id, editor: editorFor(current()?.id), revision: textRevision,
      editable: !disposed && mode === 'text' && !playing && !suspended && current()?.kind === 'text' }),
    replace(token, next) {
      if (JSON.stringify(textClipboard.target()) !== JSON.stringify(token)) return false;
      flushText();
      if (JSON.stringify(textClipboard.target()) !== JSON.stringify(token)) return false;
      const prior = snapshot(), object = current(), editor = editorFor(object.id);
      const nodes = [...editor.childNodes], oldText = object.text;
      const ownsEdit = () => !disposed && documentEpoch === token.documentEpoch
        && objects.includes(object) && editorFor(object.id) === editor;
      try {
        object.text = next.text; editor.textContent = next.text; textRevision++;
        if (!selectionAt(object.id, next) || !ownsEdit()) return false;
      } catch {
        // Focus/selection callbacks can replace the scene. Leave that document
        // intact rather than restoring or journaling this retired editor.
        if (!ownsEdit()) return false;
        object.text = oldText; editor.replaceChildren(...nodes); textRevision++;
        try { selectionAt(object.id, token); } catch { /* Retain the original editor on selection failure. */ }
        before = null; beforeRange = null; typingOwner = null;
        notify();
        return false;
      }
      // Focus callbacks can establish a new blur baseline; replace it after commit.
      before = null; beforeRange = null; typingOwner = null;
      changed(prior, { before: token, after: { ...next, objectId: object.id } });
      notify();
      return true;
    },
  });
  const coordinates = event => {
    const bounds = surface.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) * sceneWidth / bounds.width, 0, sceneWidth),
      y: clamp((event.clientY - bounds.top) * sceneHeight / bounds.height, 0, sceneHeight),
    };
  };

  // Browser navigation follows the current serialized array, not a native
  // bitmap admission filter. Presentation renders never advance this identity.
  const navigationKey = {};
  function navigationIdentity() {
    if (navigationKey.epoch !== documentEpoch || navigationKey.revision !== navigationRevision
      || navigationKey.selected !== selected || navigationKey.mode !== mode || navigationKey.playing !== playing
      || navigationKey.suspended !== suspended || navigationKey.drag !== Boolean(drag) || navigationKey.path !== Boolean(path)) {
      Object.assign(navigationKey, { epoch: documentEpoch, revision: navigationRevision, selected, mode, playing,
        suspended, drag: Boolean(drag), path: Boolean(path),
        identity: `${documentEpoch}:${navigationRevision}:${selected}:${mode}:${playing}:${suspended}:${Boolean(drag)}:${Boolean(path)}` });
    }
    return navigationKey.identity;
  }
  function navigationAvailable() {
    return !disposed && mode === 'grab' && !playing && !suspended && !drag && !path
      && renderable(current());
  }
  function renderable(object) {
    if (!object || typeof object.id !== 'string' || !object.id
      || !Number.isFinite(object.x) || !Number.isFinite(object.y)
      || !Number.isFinite(object.width) || !Number.isFinite(object.height)
      || object.width <= 0 || object.height <= 0
      || !(object.kind === 'text' ? typeof object.text === 'string'
        : (object.kind === 'image' || object.kind === 'video') && typeof object.src === 'string' && object.src)) return false;
    let matches = 0;
    for (const item of objects) if (item.id === object.id) matches++;
    if (matches !== 1) return false;
    for (const node of root.children) if (node.dataset.object === object.id) return true;
    return false;
  }
  function stepSelection(direction, expectedIdentity) {
    if (![1, -1].includes(direction) || !navigationAvailable() || expectedIdentity !== navigationIdentity()) return false;
    const owner = current();
    if (!renderable(owner)) return false;
    if (objects.length < 2) return true;
    const destination = objects[(objects.indexOf(owner) + direction + objects.length) % objects.length];
    if (!renderable(destination)) return false;
    // Only the text owner may publish pending ordinary typing. Its callbacks
    // can replace/reorder the document; never continue into that replacement.
    const ownsTyping = typingOwner?.object === owner && typingOwner.epoch === documentEpoch
      && typingOwner.editor === editorFor(owner.id);
    if (before && (typingOwner ? !ownsTyping : JSON.stringify(before) !== JSON.stringify(objects))) return false;
    const afterTyping = flushText() ?? expectedIdentity;
    if (afterTyping !== navigationIdentity() || !navigationAvailable()
      || current() !== owner || !renderable(destination)) return false;
    selected = destination.id; navigationRevision++;
    textRevision++;
    for (const node of root.children) {
      const active = node.dataset.object === selected;
      node.classList.toggle('is-selected', active);
      node.querySelector('.resize-object')?.remove();
      if (active) {
        const handle = root.ownerDocument.createElement('div');
        handle.className = 'resize-object'; node.append(handle);
      }
    }
    notify();
    return true;
  }

  function render() {
    textRevision++;
    root.replaceChildren();
    for (const object of objects) {
      const node = document.createElement('div');
      node.className = 'scene-object';
      node.dataset.object = object.id;
      node.style.cssText = `left:${object.x}px;top:${object.y}px;width:${object.width}px;height:${object.height}px`;
      if (!playing && ['grab', 'text'].includes(mode)) node.classList.add('is-selectable');
      if (!playing && ['grab', 'text', 'path'].includes(mode) && selected === object.id) node.classList.add('is-selected');
      const previewing = playing || previews.has(object.id);
      if (object.kind === 'text') {
        const text = document.createElement('div');
        const editorEpoch = documentEpoch;
        text.className = 'object-text';
        text.style.cssText = `font-family:${object.font};font-size:${object.size}px;color:${object.color};font-weight:${object.bold ? 'bold' : 'normal'};font-style:${object.italic ? 'italic' : 'normal'};text-decoration:${object.underline ? 'underline' : 'none'};text-align:${object.align || 'left'}`;
        text.textContent = object.text;
        if (mode === 'text' && !playing) {
          text.contentEditable = 'plaintext-only';
          text.setAttribute('aria-label', 'Picture text');
          text.spellcheck = true;
          text.addEventListener('focus', () => {
            before ??= snapshot();
            navigationRevision++;
            selected = object.id;
            beforeRange = textClipboard.target();
          });
          text.addEventListener('beforeinput', () => {
            before ??= snapshot();
            if (before.find(item => item.id === object.id)?.text === object.text) beforeRange = textClipboard.target();
          });
          text.addEventListener('input', () => { before ??= snapshot(); object.text = editorText(text).text; typingOwner = { object, editor: text, epoch: editorEpoch }; textRevision++; navigationRevision++; notify(); });
          text.addEventListener('blur', () => {
            if (before) {
              const prior = before.find(item => item.id === object.id);
              if (!prior && !object.text.trim()) {
                objects = objects.filter(item => item !== object);
                if (selected === object.id) selected = null;
                node.remove();
              } else if (prior?.text !== object.text) flushText();
            }
            before = null; beforeRange = null; typingOwner = null;
          });
        }
        node.append(text);
      } else {
        const media = document.createElement(object.kind === 'video' && (previewing || !object.thumbnail) ? 'video' : 'img');
        if (media instanceof HTMLVideoElement) {
          if (suspended) suspendedVideos.add(media);
          media.src = object.src;
          media.loop = true;
          media.muted = false;
          media.playsInline = true;
          if (previewing) media.play().catch(() => {});
        } else {
          media.src = object.kind === 'video' ? object.thumbnail : (previewing && object.animation ? object.animation : object.src);
          media.alt = object.name ?? '';
          media.draggable = false;
        }
        node.append(media);
        const opening = frameOpening(object);
        if (opening) {
          media.style.cssText = `position:absolute;left:${opening.x}px;top:${opening.y}px;width:${opening.width}px;height:${opening.height}px;object-fit:cover`;
          const frame = document.createElement('img');
          frame.className = 'object-frame';
          frame.src = previewing && object.frame.animation ? object.frame.animation : object.frame.src;
          frame.alt = object.frame.name;
          frame.draggable = false;
          node.append(frame);
        }
      }
      if (node.classList.contains('is-selected') && mode !== 'path') {
        const handle = document.createElement('div');
        handle.className = 'resize-object';
        node.append(handle);
      }
      root.append(node);
    }
    notify();
  }

  function add(object) {
    flushText();
    const prior = snapshot();
    object.id = makeId();
    objects.push(object); navigationRevision++;
    selected = object.id;
    render();
    return prior;
  }

  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || event.target.isContentEditable) return;
    const node = event.target.closest('[data-object]');
    if (!node || playing || !['grab', 'text'].includes(mode)) return;
    if (!inputOwner.claim(event, root)) return;
    event.preventDefault();
    const object = objects.find(item => item.id === node.dataset.object);
    selected = object.id;
    navigationRevision++;
    drag = {
      pointer: event.pointerId, origin: coordinates(event), object,
      x: object.x, y: object.y, width: object.width, height: object.height,
      resize: event.target.classList.contains('resize-object'), prior: snapshot(),
    };
    root.setPointerCapture(event.pointerId);
    render();
  }, inputOptions);

  root.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (!(event.buttons & 1)) { finishDrag(event); return; }
    const point = coordinates(event);
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    if (drag.resize) {
      drag.object.width = clamp(drag.width + dx, 16, sceneWidth * 2);
      drag.object.height = event.shiftKey ? drag.object.width * drag.height / drag.width
        : clamp(drag.height + dy, 16, sceneHeight * 2);
    } else {
      drag.object.x = clamp(drag.x + dx, -drag.object.width + 10, sceneWidth - 10);
      drag.object.y = clamp(drag.y + dy, -drag.object.height + 10, sceneHeight - 10);
    }
    render();
  }, inputOptions);

  function finishDrag(event) {
    if (drag?.pointer !== event.pointerId) return;
    const prior = drag.prior;
    drag = null; navigationRevision++;
    inputOwner.release(root, event.pointerId);
    if (JSON.stringify(prior) !== JSON.stringify(objects)) changed(prior);
  }

  root.addEventListener('pointerup', finishDrag, inputOptions);
  root.addEventListener('pointercancel', finishDrag, inputOptions);
  root.addEventListener('lostpointercapture', finishDrag, inputOptions);
  function finishInactive() {
    if (drag) finishDrag({ pointerId: drag.pointer });
    if (pathPointer !== null) cancelPath();
  }
  onInteractionInactive(root, finishInactive, listeners.signal);

  function cancelPath() {
    const pointer = pathPointer;
    pathPointer = null;
    pathTarget = null;
    path = null;
    if (pointer !== null) inputOwner.release(surface, pointer);
    mode = 'grab';
    render();
  }

  return {
    textClipboard, flushText, stepSelection,
    get navigation() {
      const identity = navigationIdentity();
      if (navigationCache?.identity !== identity) {
        const available = navigationAvailable();
        navigationCache = Object.freeze({ available, identity, canStep: available && objects.length >= 2 });
      }
      return navigationCache;
    },
    settle() {
      root.ownerDocument.activeElement?.blur();
      finishInactive();
    },
    suspend() {
      const prior = { objects: objects.slice(), selected, mode, sceneRevision, readRevision, previews: [...previews], nodes: [...root.childNodes] };
      suspended = true; navigationRevision++;
      const videos = [...root.querySelectorAll('video')].filter(video => !video.paused);
      const paused = [];
      function release() {
        suspended = false; navigationRevision++;
        for (const video of suspendedVideos) if (!video.isConnected) video.pause();
        suspendedVideos.clear();
        let failure;
        for (const video of paused.splice(0)) {
          try { if (video.isConnected) video.play().catch(() => {}); }
          catch (error) { failure ??= error; }
        }
        if (failure) throw failure;
      }
      try {
        for (const video of videos) { paused.push(video); video.pause(); }
      } catch (error) {
        try { release(); } catch { /* Preserve the original pause error. */ }
        throw error;
      }
      return {
        // Retain media nodes and the existing playback clock across a failed
        // document commit, rather than rebuilding/restarting their players.
        rollback() {
          for (const video of suspendedVideos) video.pause();
          objects = prior.objects;
          mode = prior.mode;
          sceneRevision = prior.sceneRevision; readRevision = prior.readRevision;
          selected = prior.selected;
          previews.clear();
          prior.previews.forEach(id => previews.add(id));
          root.replaceChildren(...prior.nodes);
        },
        release,
      };
    },
    get stickerIdentity() { return `${documentEpoch}:${sceneRevision}:${selected}:${mode}:${playing}`; },
    async prepareSticker(payload, owner) {
      const raster = stickerRaster(payload);
      if (!raster || raster.owner !== owner || owner.width !== sceneWidth || owner.height !== sceneHeight
        || raster.x + raster.width > sceneWidth || raster.y + raster.height > sceneHeight
        || disposed || suspended || playing || drag || path || before) return null;
      const identity = this.stickerIdentity;
      const image = new Image();
      image.src = raster.src;
      await image.decode();
      if (image.naturalWidth !== raster.width || image.naturalHeight !== raster.height
        || identity !== this.stickerIdentity) return null;
      const token = Object.freeze({});
      preparedStickers.set(token, { raster, identity });
      return token;
    },
    insertPreparedSticker(token) {
      const prepared = preparedStickers.get(token);
      if (!prepared || prepared.identity !== this.stickerIdentity || disposed || playing || drag || path || before) return null;
      preparedStickers.delete(token);
      const { raster } = prepared;
      const prior = snapshot(), priorSelected = selected;
      add({ kind: 'image', src: raster.src, name: 'Sticker', x: raster.x, y: raster.y,
        width: raster.width, height: raster.height });
      return { before: prior, after: snapshot(), beforeSelected: priorSelected, afterSelected: selected };
    },
    selectSticker(id) {
      navigationRevision++;
      selected = objects.some(object => object.id === id) ? id : null;
      render();
    },
    addAsset(asset, point = { x: 360, y: 271 }) {
      const aspect = (asset.width || 120) / (asset.height || 120);
      const full = asset.group === 'frames';
      const width = full ? sceneWidth : clamp(asset.width || 144, 54, 290);
      const height = full ? sceneHeight : clamp(width / aspect, 35, 310);
      const prior = add({
        kind: asset.mediaType === 'video' || /\.(mp4|webm|mov)$/i.test(asset.src) ? 'video' : 'image',
        src: asset.src, thumbnail: asset.thumbnail, animation: asset.animation, rightSrc: asset.rightSrc, name: asset.name,
        x: full ? 0 : point.x - width / 2, y: full ? 0 : point.y - height / 2, width, height,
      });
      changed(prior);
      if (asset.animation || current()?.kind === 'video') {
        const id = current().id;
        previews.add(id);
        render();
        if (asset.animation) setTimeout(() => {
          if (!previews.delete(id) || playing) return;
          const preview = root.querySelector(`[data-object="${id}"] img`);
          if (preview) preview.src = asset.src;
        }, 3300);
      }
    },
    addText(point, style) {
      const prior = add({ ...style, kind: 'text', x: point.x, y: point.y, width: 235, height: 100, text: '' });
      const editor = root.querySelector(`[data-object="${selected}"] .object-text`);
      if (editor) {
        editor.focus();
        before = prior; typingOwner = null;
      }
    },
    cancelTextStyleIntent() { styleRequest++; },
    captureTextStyleTarget(style) {
      const object = current(), epoch = documentEpoch, ownerMode = mode, identity = JSON.stringify(objects), request = styleRequest;
      const afterTyping = flushText() ?? navigationIdentity();
      syncRangeRevision();
      const token = Object.freeze({ request: ++styleRequest });
      if (request !== styleRequest - 1 || afterTyping !== navigationIdentity() || object !== current()
        || epoch !== documentEpoch || ownerMode !== mode || identity !== JSON.stringify(objects)) return token;
      styleIntents.set(token, { style: Object.freeze(structuredClone(style)), object, editor: editorFor(object?.id), epoch: documentEpoch,
        revision: navigationRevision, range: rangeRevision, scene: sceneRevision, mode, selected, playing, suspended,
        text: object && JSON.stringify(object) });
      return token;
    },
    validTextStyleTarget(token) {
      syncRangeRevision();
      const intent = styleIntents.get(token);
      return Boolean(intent && token.request === styleRequest && !disposed && !playing && !suspended
        && intent.range === rangeRevision && intent.epoch === documentEpoch && intent.revision === navigationRevision && intent.scene === sceneRevision
        && intent.mode === mode && intent.selected === selected && intent.playing === playing && intent.suspended === suspended
        && intent.object === current() && intent.editor === editorFor(current()?.id)
        && intent.text === (current() && JSON.stringify(current())));
    },
    commitTextStyle(token) {
      if (!this.validTextStyleTarget(token)) return false;
      // No focus, flush, render or user callbacks between validation and journal.
      const { object, style } = styleIntents.get(token);
      if (object?.kind === 'text') {
        const prior = snapshot(), range = textClipboard.target();
        Object.assign(object, style);
        const editor = editorFor(object.id);
        Object.assign(editor.style, { fontFamily: object.font, fontSize: `${object.size}px`,
          fontWeight: object.bold ? 'bold' : 'normal', fontStyle: object.italic ? 'italic' : 'normal',
          textDecoration: object.underline ? 'underline' : 'none', textAlign: object.align || 'left', color: object.color });
        styleRequest++;
        changed(prior, range ? { before: range, after: range } : undefined);
        notify();
      } else styleRequest++;
      return true;
    },
    setTextStyle(style) {
      flushText();
      const object = current();
      if (object?.kind !== 'text') return;
      const prior = snapshot();
      navigationRevision++;
      Object.assign(object, style);
      render();
      changed(prior);
    },
    edit(command) {
      flushText();
      const object = current();
      const prior = snapshot();
      navigationRevision++;
      if (command === 'paste' && clipboard) {
        add({ ...clipboard, x: clipboard.x + 12, y: clipboard.y + 12 });
      } else if (object) {
        const index = objects.indexOf(object);
        if (command === 'copy' || command === 'cut') clipboard = structuredClone(object);
        if (command === 'delete' || command === 'cut') {
          objects.splice(index, 1);
          selected = null;
        }
        const destination = { front: objects.length - 1, forward: index + 1, backward: index - 1, back: 0 }[command];
        if (destination !== undefined) {
          objects.splice(index, 1);
          objects.splice(clamp(destination, 0, objects.length), 0, object);
        }
      }
      if (JSON.stringify(prior) !== JSON.stringify(objects)) changed(prior);
      render();
    },
    nudge(x, y) {
      const object = current();
      if (!object) return;
      const prior = snapshot();
      navigationRevision++;
      object.x += x;
      object.y += y;
      render();
      changed(prior);
    },
    chooseMode(next) {
      if (mode !== next) {
        flushText();
        mode = next; navigationRevision++;
        render();
      }
    },
    hasSelection: () => Boolean(current()),
    togglePreview() {
      const object = current();
      if (!object || (!object.animation && object.kind !== 'video')) return null;
      if (previews.has(object.id)) previews.delete(object.id);
      else previews.add(object.id);
      render();
      return previews.has(object.id);
    },
    toggleLoop() {
      const object = current();
      if (!object?.path?.length) return null;
      const prior = snapshot();
      object.pathLoop = !object.pathLoop;
      changed(prior);
      return object.pathLoop;
    },
    frameMovie(asset) {
      if (!asset.opening) return false;
      const movie = current()?.kind === 'video' ? current() : objects.findLast(object => object.kind === 'video');
      if (!movie) return false;
      const prior = snapshot();
      navigationRevision++;
      movie.frame = {
        src: asset.src, rightSrc: asset.rightSrc, animation: asset.animation, name: asset.name,
        width: asset.width || sceneWidth, height: asset.height || sceneHeight, opening: asset.opening,
      };
      selected = movie.id;
      render();
      changed(prior);
      return true;
    },
    enlargeSelected() {
      const object = current();
      if (object?.kind !== 'video') return false;
      const prior = snapshot();
      navigationRevision++;
      Object.assign(object, { x: 0, y: 0, width: sceneWidth, height: sceneHeight });
      objects.splice(objects.indexOf(object), 1);
      objects.unshift(object);
      render();
      changed(prior);
      return true;
    },
    beginPath() {
      if (!current()) return false;
      mode = 'path'; navigationRevision++;
      render();
      return true;
    },
    pathStart(event) {
      if (event.button !== 0 || path || mode !== 'path' || !current() || !inputOwner.claim(event, surface)) return false;
      pathPointer = event.pointerId;
      pathTarget = current();
      pathStarted = event.timeStamp;
      path = [coordinates(event)];
      return true;
    },
    pathMove(event) {
      if (!path || event.pointerId !== pathPointer) return false;
      if (current() !== pathTarget) { cancelPath(); return false; }
      const point = coordinates(event);
      const last = path.at(-1);
      if (Math.hypot(last.x - point.x, last.y - point.y) > 5) path.push(point);
      return true;
    },
    pathEnd(event) {
      if (!path || event.pointerId !== pathPointer) return false;
      const object = current();
      if (object !== pathTarget) { cancelPath(); return false; }
      const prior = snapshot();
      path.push(coordinates(event));
      const moved = path.some(point => Math.hypot(point.x - path[0].x, point.y - path[0].y) > 5);
      if (moved) {
        object.path = path;
        object.pathDuration = clamp(event.timeStamp - pathStarted, 650, 15000);
      }
      cancelPath();
      if (moved) changed(prior);
      return moved;
    },
    cancelPath,
    setPlaying(next) {
      playing = next; navigationRevision++;
      if (!next) previews.clear();
      cancelAnimationFrame(animation);
      render();
      if (!next) return;
      let start = performance.now();
      let previous = start;
      function tick(now) {
        if (suspended) start += now - previous;
        previous = now;
        if (!suspended) for (const object of objects) {
          const point = pathPosition(object, now - start);
          if (!point) continue;
          const node = root.querySelector(`[data-object="${object.id}"]`);
          node.style.left = `${point.x - object.width / 2}px`;
          node.style.top = `${point.y - object.height / 2}px`;
        }
        animation = requestAnimationFrame(tick);
      }
      animation = requestAnimationFrame(tick);
    },
    speechPayloads() {
      return objects.filter(item => item.kind === 'text' && item.text.trim())
        .sort((a, b) => a.y - b.y || a.x - b.x).map(object => ({ text: object.text, voiceURI: object.voice || '' }));
    },
    get textReadTarget() {
      const object = current();
      const identity = JSON.stringify(object?.kind === 'text' ? [object.id, object.text, object.voice || ''] : null);
      if (identity !== readIdentity) { readIdentity = identity; readRevision++; }
      return object?.kind === 'text' ? Object.freeze({ id: object.id, revision: readRevision, voiceURI: object.voice || '' }) : null;
    },
    async rightEyeImages() {
      const sources = objects.flatMap(object => [
        [object.id, object.rightSrc], [`frame:${object.id}`, object.frame?.rightSrc],
      ]).filter(([, url]) => url);
      const entries = await Promise.all(sources.map(async ([id, url]) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [id, image];
      }));
      return new Map(entries);
    },
    assertFontsReady() { assertTextFontsReady(objects); },
    draw(context, rightEye = null) {
      assertTextFontsReady(objects);
      for (const node of root.children) {
        const saved = objects.find(item => item.id === node.dataset.object);
        const object = { ...saved, x: parseFloat(node.style.left), y: parseFloat(node.style.top) };
        if (object.kind === 'text') {
          context.save();
          context.fillStyle = object.color;
          applyCanvasFont(context, `${object.italic ? 'italic' : 'normal'} ${object.bold ? 'bold' : 'normal'} ${object.size}px ${object.font}`, object);
          context.textBaseline = 'top';
          let y = object.y;
          for (const paragraph of object.text.split('\n')) {
            const lines = [''];
            for (const word of paragraph.split(' ')) {
              const last = lines.at(-1);
              const candidate = last ? `${last} ${word}` : word;
              if (last && context.measureText(candidate).width > object.width) lines.push(word);
              else lines[lines.length - 1] = candidate;
            }
            for (const line of lines) {
              const lineWidth = Math.min(context.measureText(line).width, object.width);
              const x = object.align === 'center' ? object.x + (object.width - lineWidth) / 2
                : object.align === 'right' ? object.x + object.width - lineWidth : object.x;
              context.fillText(line, x, y, object.width);
              if (object.underline) context.fillRect(x, y + object.size * 1.02, lineWidth, Math.max(1, object.size / 18));
              y += object.size * 1.16;
            }
          }
          context.restore();
          continue;
        }
        const media = rightEye?.get(object.id) ?? node.firstChild;
        const width = media.naturalWidth || media.videoWidth;
        const height = media.naturalHeight || media.videoHeight;
        const opening = frameOpening(object);
        const box = opening ?? { x: 0, y: 0, width: object.width, height: object.height };
        if (width && height && (!(media instanceof HTMLVideoElement) || media.readyState >= 2)) {
          const scale = opening ? Math.max(box.width / width, box.height / height) : Math.min(box.width / width, box.height / height);
          const w = width * scale;
          const h = height * scale;
          const x = object.x + box.x;
          const y = object.y + box.y;
          context.save();
          if (opening) {
            context.beginPath();
            context.rect(x, y, box.width, box.height);
            context.clip();
          }
          context.drawImage(media, x + (box.width - w) / 2, y + (box.height - h) / 2, w, h);
          context.restore();
        }
        if (opening) {
          const frame = rightEye?.get(`frame:${object.id}`) || node.querySelector('.object-frame');
          if (frame?.naturalWidth) context.drawImage(frame, object.x, object.y, object.width, object.height);
        }
      }
    },
    get actionState() {
      const object = current();
      return { target: object?.id ?? null, cut: Boolean(object), copy: Boolean(object),
        paste: Boolean(clipboard), front: Boolean(object), back: Boolean(object),
        forward: Boolean(object), backward: Boolean(object),
        textStyle: object?.kind === 'text' ? Object.fromEntries(
          ['font', 'size', 'bold', 'italic', 'underline', 'align', 'voice'].map(key => [key, key === 'voice' ? object[key] || '' : object[key]])) : null };
    },
    destroy() {
      disposed = true; documentEpoch++; textClipboard.clear();
      finishInactive();
      listeners.abort();
      cancelAnimationFrame(animation);
    },
    snapshot,
    restore(state, { textTarget = null, textSelection = null, history = false } = {}) {
      before = null; beforeRange = null; typingOwner = null;
      if (!history) { documentEpoch++; textClipboard.clear(); }
      readRevision++;
      objects = structuredClone(state); navigationRevision++;
      styleRequest++;
      const generation = ++fontRestore;
      const faces = new Set(objects.filter(object => object.kind === 'text').map(resolveBundledFace).filter(Boolean));
      for (const face of faces) ensureFace(face).catch(error => {
        // A restored face can be replaced without restoring the whole document.
        // Check each failed face against live references; retiring one must not
        // silence a different face, or another object still using the same face.
        if (!disposed && generation === fontRestore && objects.some(object => object.kind === 'text'
          && resolveBundledFace(object)?.key === face.key)) {
          root.dispatchEvent(new CustomEvent('fontfailure', { detail: error.message }));
        }
      });
      previews.clear();
      selected = objects.find(object => object.id === (textSelection?.objectId ?? textTarget) && object.kind === 'text')?.id ?? null;
      render();
      selectionAt(selected, textSelection);
      before = null; beforeRange = null; typingOwner = null;
    },
  };
}
