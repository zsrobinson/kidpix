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
  let before = null;
  let mode = 'paint';
  let playing = false;
  let animation;
  let suspended = false;
  let drag = null;
  let path = null;
  let pathStarted = 0;
  const previews = new Set();

  const current = () => objects.find(object => object.id === selected);
  const snapshot = () => structuredClone(objects);
  const changed = (prior) => onChange(prior, snapshot());
  const coordinates = event => {
    const bounds = surface.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) * sceneWidth / bounds.width, 0, sceneWidth),
      y: clamp((event.clientY - bounds.top) * sceneHeight / bounds.height, 0, sceneHeight),
    };
  };

  function render() {
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
        text.className = 'object-text';
        text.style.cssText = `font-family:${object.font};font-size:${object.size}px;color:${object.color};font-weight:${object.bold ? 'bold' : 'normal'};font-style:${object.italic ? 'italic' : 'normal'};text-decoration:${object.underline ? 'underline' : 'none'};text-align:${object.align || 'left'}`;
        text.textContent = object.text;
        if (mode === 'text' && !playing) {
          text.contentEditable = 'plaintext-only';
          text.setAttribute('aria-label', 'Picture text');
          text.spellcheck = true;
          text.addEventListener('focus', () => {
            before = snapshot();
            selected = object.id;
          });
          text.addEventListener('input', () => { object.text = text.innerText; });
          text.addEventListener('blur', () => {
            if (before) {
              const prior = before.find(item => item.id === object.id);
              if (!prior && !object.text.trim()) {
                objects = objects.filter(item => item !== object);
                if (selected === object.id) selected = null;
                node.remove();
              } else if (prior?.text !== object.text) changed(before);
            }
            before = null;
          });
        }
        node.append(text);
      } else {
        const media = document.createElement(object.kind === 'video' && (previewing || !object.thumbnail) ? 'video' : 'img');
        if (media instanceof HTMLVideoElement) {
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
  }

  function add(object) {
    const prior = snapshot();
    object.id = makeId();
    objects.push(object);
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
    drag = null;
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
    settle() {
      root.ownerDocument.activeElement?.blur();
      finishInactive();
    },
    suspend() {
      const prior = { objects, selected, previews: [...previews], nodes: [...root.childNodes] };
      suspended = true;
      const videos = [...root.querySelectorAll('video')].filter(video => !video.paused);
      const paused = [];
      function release() {
        suspended = false;
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
          objects = prior.objects;
          selected = prior.selected;
          previews.clear();
          prior.previews.forEach(id => previews.add(id));
          root.replaceChildren(...prior.nodes);
        },
        release,
      };
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
        before = prior;
      }
    },
    setTextStyle(style) {
      const object = current();
      if (object?.kind !== 'text') return;
      const prior = snapshot();
      Object.assign(object, style);
      render();
      changed(prior);
    },
    edit(command) {
      const object = current();
      const prior = snapshot();
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
      object.x += x;
      object.y += y;
      render();
      changed(prior);
    },
    chooseMode(next) {
      if (mode !== next) {
        mode = next;
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
      Object.assign(object, { x: 0, y: 0, width: sceneWidth, height: sceneHeight });
      objects.splice(objects.indexOf(object), 1);
      objects.unshift(object);
      render();
      changed(prior);
      return true;
    },
    beginPath() {
      if (!current()) return false;
      mode = 'path';
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
      playing = next;
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
    speak() {
      if (!('speechSynthesis' in window)) return;
      for (const object of objects.filter(item => item.kind === 'text').sort((a, b) => a.y - b.y || a.x - b.x)) {
        if (!object.text.trim()) continue;
        const speech = new SpeechSynthesisUtterance(object.text);
        if (object.voice) speech.voice = speechSynthesis.getVoices().find(voice => voice.voiceURI === object.voice) || null;
        speechSynthesis.speak(speech);
      }
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
    draw(context, rightEye = null) {
      for (const node of root.children) {
        const saved = objects.find(item => item.id === node.dataset.object);
        const object = { ...saved, x: parseFloat(node.style.left), y: parseFloat(node.style.top) };
        if (object.kind === 'text') {
          context.save();
          context.fillStyle = object.color;
          context.font = `${object.italic ? 'italic' : 'normal'} ${object.bold ? 'bold' : 'normal'} ${object.size}px ${object.font}`;
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
          ['font', 'size', 'bold', 'italic', 'underline', 'align'].map(key => [key, object[key]])) : null };
    },
    destroy() {
      finishInactive();
      listeners.abort();
      cancelAnimationFrame(animation);
    },
    snapshot,
    restore(state) {
      objects = structuredClone(state);
      previews.clear();
      selected = null;
      render();
    },
  };
}
