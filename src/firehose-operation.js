import { interactionOwner } from './interaction-owner.js';
import { createNativeBigEraser } from './native-big-eraser.js';

// Browser page transaction. The source renderer owns only paths/timing/audio;
// this scope owns mutation exclusion, composite stacking and caller rollback.
export function createFirehoseOperation({ surface, canvas, original, settle, begin, composite, onError, suspendRollover = () => undefined }) {
  const inputOwner = interactionOwner(surface.ownerDocument);
  let active = null;
  let disposed = false;
  let generation = 0;
  const listeners = new AbortController();
  const options = { capture: true, passive: false, signal: listeners.signal };
  const manifest = fetch(original('ui/big-eraser/manifest.json')).then(response => {
    if (!response.ok) throw new Error('Firehose resources unavailable');
    return response.json();
  });
  // Preload failure is reported on activation, not as an unhandled rejection.
  manifest.catch(() => {});

  function finish(run, committed = false) {
    if (active !== run) return;
    active = null;
    generation++;
    try { run.transaction?.release(committed); }
    finally {
      try { run.releaseRollover?.(); }
      finally { run.frozen?.remove(); run.overlay?.remove(); surface.removeAttribute('aria-busy'); }
    }
  }
  function cancel(reason) {
    const run = active;
    if (!run) return;
    if (run.renderer) run.renderer.cancel(reason);
    else finish(run);
  }
  function guard(event) {
    if (!active) return;
    if (event.type === 'pointerdown') inputOwner.reject(event);
    if (event.type === 'keydown' && event.key === 'Escape') cancel('escape');
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick',
    'keydown', 'keyup', 'beforeinput', 'input', 'change', 'drop', 'dragstart', 'contextmenu']) {
    window.addEventListener(type, guard, options);
  }
  for (const type of ['blur', 'pagehide', 'resize']) window.addEventListener(type, () => cancel(type), { signal: listeners.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel('hidden'); }, { signal: listeners.signal });

  return {
    get busy() { return Boolean(active); },
    async play() {
      if (active || disposed) return false; // Native temporary-tool busy policy.
      const run = { generation: ++generation };
      active = run;
      try {
        run.releaseRollover = suspendRollover();
        settle();
        run.transaction = begin();
        run.frozen = composite();
        run.frozen.className = 'firehose-frozen';
        run.frozen.setAttribute('aria-hidden', 'true');
        run.overlay = document.createElement('canvas');
        run.overlay.width = canvas.width;
        run.overlay.height = canvas.height;
        run.overlay.className = 'firehose-wipe';
        run.overlay.setAttribute('aria-hidden', 'true');
        surface.append(run.frozen, run.overlay);
        surface.setAttribute('aria-busy', 'true');
        const resources = await manifest;
        if (active !== run || generation !== run.generation) return false;
        run.renderer = createNativeBigEraser({ manifest: resources,
          context: run.overlay.getContext('2d'), rect: [0, 0, canvas.width, canvas.height],
          playSound(cue) {
            const audio = new Audio(original(`ui/big-eraser/${cue.image}`));
            audio.play().catch(() => {});
            return audio;
          },
          onCommit() {
            let committed = false;
            try { run.transaction.commit(); committed = true; }
            finally { finish(run, committed); }
          },
          onCancel: () => finish(run),
          onError,
        });
        return run.renderer.play({ trigger: 'firehose' });
      } catch (error) {
        finish(run);
        onError(error);
        return false;
      }
    },
    cancel,
    dispose() { disposed = true; cancel('dispose'); listeners.abort(); },
  };
}
