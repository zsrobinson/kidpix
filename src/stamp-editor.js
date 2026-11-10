import { interactionOwner, onInteractionInactive } from './interaction-owner.js';

export async function editStamp(stamp, initialColor, onSave, { signal } = {}) {
  if (signal?.aborted) return;
  const image = new Image();
  image.src = stamp.src;
  await image.decode();
  if (signal?.aborted) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'stamp-editor';
  dialog.innerHTML = `<h2>Stamp Editor</h2>
    <div class="stamp-work">
      <div class="stamp-tools">
        <button data-command="pencil" aria-pressed="true">Pencil</button>
        <button data-command="fill" aria-pressed="false">Fill</button>
        <button data-command="rotate">Rotate</button>
        <button data-command="flip">Flip</button>
        <button data-command="undo">Undo</button>
        <button data-command="erase">Erase</button>
      </div>
      <canvas class="stamp-pixels" width="32" height="32" aria-label="Stamp pixels"></canvas>
      <div class="stamp-preview"><canvas width="32" height="32" aria-label="Preview"></canvas>
      <label>Color <input type="color"></label></div>
    </div>
    <div class="dialog-actions"><button data-command="restore">Restore Original</button><button data-command="cancel">Cancel</button><button data-command="save">OK</button></div>`;
  const canvas = dialog.querySelector('.stamp-pixels');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const preview = dialog.querySelector('.stamp-preview canvas').getContext('2d');
  const picker = dialog.querySelector('input');
  picker.value = initialColor;
  context.drawImage(image, 0, 0, 32, 32);
  const original = context.getImageData(0, 0, 32, 32);
  const undo = [];
  let tool = 'pencil';
  const inputOwner = interactionOwner(canvas.ownerDocument);
  const listeners = new AbortController();
  let painting = null;

  function update() {
    preview.clearRect(0, 0, 32, 32);
    preview.drawImage(canvas, 0, 0);
    dialog.querySelector('[data-command="undo"]').disabled = !undo.length;
  }

  function remember() {
    undo.push(context.getImageData(0, 0, 32, 32));
    if (undo.length > 32) undo.shift();
  }

  function paint(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.min(31, Math.max(0, Math.floor(32 * (event.clientX - bounds.left) / bounds.width)));
    const y = Math.min(31, Math.max(0, Math.floor(32 * (event.clientY - bounds.top) / bounds.height)));
    if (tool === 'pencil') {
      context.fillStyle = picker.value;
      context.fillRect(x, y, 1, 1);
    } else {
      const pixels = context.getImageData(0, 0, 32, 32);
      const offset = 4 * (32 * y + x);
      const previous = [...pixels.data.slice(offset, offset + 4)];
      const replacement = picker.value.slice(1).match(/../g).map(hex => parseInt(hex, 16)).concat(255);
      if (previous.every((channel, index) => channel === replacement[index])) return;
      const work = [[x, y]];
      while (work.length) {
        const [a, b] = work.pop();
        if (a < 0 || b < 0 || a >= 32 || b >= 32) continue;
        const position = 4 * (32 * b + a);
        if (!previous.every((channel, index) => channel === pixels.data[position + index])) continue;
        pixels.data.set(replacement, position);
        work.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
      }
      context.putImageData(pixels, 0, 0);
    }
    update();
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || painting !== null || !inputOwner.claim(event, canvas)) return;
    event.preventDefault();
    remember();
    painting = event.pointerId;
    canvas.setPointerCapture(painting);
    paint(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (tool === 'pencil' && event.pointerId === painting) paint(event);
  });
  function finishGesture(event) {
    if (painting === null || (event && painting !== event.pointerId)) return;
    const pointer = painting;
    painting = null;
    inputOwner.release(canvas, pointer);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, finishGesture);
  onInteractionInactive(canvas, () => finishGesture(), listeners.signal);

  dialog.addEventListener('click', event => {
    const command = event.target.closest('[data-command]')?.dataset.command;
    if (command === 'pencil' || command === 'fill') {
      tool = command;
      for (const button of dialog.querySelectorAll('[aria-pressed]')) button.setAttribute('aria-pressed', String(button.dataset.command === tool));
    } else if (command === 'rotate' || command === 'flip') {
      remember();
      context.clearRect(0, 0, 32, 32);
      context.save();
      context.translate(16, 16);
      if (command === 'rotate') context.rotate(Math.PI / 2);
      else context.scale(-1, 1);
      context.drawImage(preview.canvas, -16, -16);
      context.restore();
    } else if (command === 'erase') {
      remember();
      context.clearRect(0, 0, 32, 32);
    } else if (command === 'restore') {
      remember();
      context.putImageData(original, 0, 0);
    } else if (command === 'undo') {
      if (undo.length) context.putImageData(undo.pop(), 0, 0);
    } else if (command === 'save') {
      const src = canvas.toDataURL();
      onSave({ ...stamp, src, thumbnail: src });
      dialog.close();
    } else if (command === 'cancel') dialog.close();
    update();
  });

  const abort = () => dialog.close();
  dialog.addEventListener('close', () => {
    signal?.removeEventListener('abort', abort);
    finishGesture(); listeners.abort(); dialog.remove();
  }, { once: true });
  update();
  if (signal?.aborted) { listeners.abort(); return; }
  document.body.append(dialog);
  dialog.showModal();
  signal?.addEventListener('abort', abort, { once: true });
}
