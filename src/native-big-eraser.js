// Source-backed page effects only. Ordinary Firehose rollover belongs to
// native-rollovers.js. The unresolved large hose actor is deliberately disabled.

export function nativeBigEraserPanelChoice(manifest, index) {
  if (!Number.isInteger(index)) return null;
  const toolId = manifest.panel.toolIds[index];
  return manifest.effects.find(effect => effect.toolId === toolId) ?? null;
}

export function nativeBigEraserEffect(manifest, { trigger = 'big-eraser', toolId, bitmapId } = {}) {
  if (trigger === 'firehose') return manifest.firehose;
  if (trigger !== 'big-eraser' || (toolId == null) === (bitmapId == null)) return null;
  return manifest.effects.find(effect => toolId != null ? effect.toolId === toolId : effect.bitmapId === bitmapId) ?? null;
}

function validateRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= 0 || rect[3] <= 0) {
    throw new RangeError('Big Eraser requires a positive picture rectangle');
  }
}

// 0x162de0 translates to (left, windowHeight - bottom), scales by picture
// width/height, then emits move/line/two cubic curves in a y-up CGContext.
// This converts that transform to Canvas's y-down coordinates. Each call adds
// white to the existing temporary overlay; intermediate paths are cumulative.
export function drawNativeBigEraserPath(context, rect, points, alpha = 1) {
  validateRect(rect);
  if (!Array.isArray(points) || points.length !== 16 || !points.every(Number.isFinite)
      || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError('Invalid native Big Eraser path');
  }
  const [left, top, width, height] = rect;
  context.save();
  try {
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = alpha;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.rect(...rect);
    context.clip();
    context.translate(left, top + height);
    context.scale(width, -height);
    context.beginPath();
    context.moveTo(points[0], points[1]);
    context.lineTo(points[2], points[3]);
    context.bezierCurveTo(...points.slice(4, 10));
    context.bezierCurveTo(...points.slice(10, 16));
    context.closePath();
    context.fill();
  } finally {
    context.restore();
  }
}

function fillNativeVanish(context, rect) {
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(...rect);
  } finally {
    context.restore();
  }
}

// context must be a dedicated transparent overlay ABOVE a frozen picture
// composite, never paint's history surface. Caller owns scene/audio/backdrop
// snapshots and clears them in one synchronous onCommit transaction.
// Cancellation is a browser rollback policy: it removes this overlay and never
// commits. The original Mac app's Escape/blur rollback has not been established.
export function createNativeBigEraser({ manifest, context, rect,
  now = () => performance.now(), schedule = callback => requestAnimationFrame(callback),
  cancel = handle => cancelAnimationFrame(handle), playSound = () => null,
  onBegin = () => undefined, onCommit = () => {}, onCancel = () => {},
  onUnsupported = () => {}, onError = () => {} } = {}) {
  if (manifest?.version !== 1 || !context || !Array.isArray(manifest.firehose?.paths)
      || manifest.firehose.paths.length !== 10) throw new TypeError('Missing native Big Eraser resources');
  validateRect(rect);
  let generation = 0;
  let active = null;
  let disposed = false;
  let phase = 'idle';

  const clearOverlay = () => context.clearRect(...rect);
  const stop = run => {
    if (run.frame != null) cancel(run.frame);
    run.audio?.pause?.();
  };

  function abort(reason = 'cancel') {
    const run = active;
    if (!run) return false;
    active = null;
    generation++;
    stop(run);
    clearOverlay();
    phase = 'idle';
    onCancel({ effect: run.effect, token: run.token, reason });
    return true;
  }

  function fail(run, error) {
    if (active !== run) return;
    abort('error');
    onError(error);
  }

  function commit(run) {
    if (active !== run) return;
    active = null;
    stop(run);
    phase = 'idle';
    try {
      onCommit({ effect: run.effect, token: run.token });
    } catch (error) {
      onError(error);
    } finally {
      // A callback may synchronously start the next operation.
      if (generation === run.generation) clearOverlay();
    }
  }

  function play(selection) {
    if (disposed) return false;
    const effect = nativeBigEraserEffect(manifest, selection);
    if (!effect || (effect.engine !== 'RBubbleCleaner' && !(effect.engine === 'RFullCutEraser' && effect.toolId === 137))) {
      onUnsupported({ selection, effect });
      return false;
    }
    abort('replace');
    const run = { effect, generation: ++generation, started: now(), lastUpdate: null, index: 0 };
    run.lastUpdate = run.started;
    active = run;
    phase = 'running';
    try {
      clearOverlay();
      run.token = onBegin({ effect });
      if (active !== run) return false;
      if (effect.engine === 'RFullCutEraser') {
        // 0x12a2b0 fills its entire rectangle then calls the completion slot.
        // Vanish has no configured startSoundID and no authored duration.
        fillNativeVanish(context, rect);
        commit(run);
        return true;
      }
      try { run.audio = playSound(effect.sound); }
      catch { /* Audio refusal must not leave the page locked. */ }
      if (active !== run) { stop(run); return false; }
      function step(time) {
        if (active !== run || generation !== run.generation) return;
        try {
          const elapsed = time - run.started;
          // Native code advances at most ONE path per delivered update; a late
          // RAF is not permission to replay all missed alpha fills in a burst.
          if (elapsed > effect.initialDelayMs && time - run.lastUpdate > effect.updateIntervalMs) {
            run.lastUpdate = time;
            if (elapsed > effect.maximumElapsedMs || run.index >= effect.paths.length) {
              drawNativeBigEraserPath(context, rect, effect.finalPath, 1);
              commit(run);
              return;
            }
            drawNativeBigEraserPath(context, rect, effect.paths[run.index++], effect.alpha);
          }
          run.frame = schedule(step);
        } catch (error) { fail(run, error); }
      }
      run.frame = schedule(step);
      return true;
    } catch (error) {
      fail(run, error);
      return false;
    }
  }

  return { play, cancel: abort, get state() { return phase; },
    get effect() { return active?.effect ?? null; },
    dispose() { disposed = true; abort('dispose'); } };
}
