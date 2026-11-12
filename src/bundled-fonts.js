import catalog from './bundled-font-catalog.json' with { type: 'json' };

export const bundledFaces = Object.freeze(catalog.faces.map(face => Object.freeze({ ...face })));
const abortError = () => new DOMException('Font request cancelled', 'AbortError');
const timeoutError = () => new DOMException('Font readiness timed out', 'TimeoutError');
const deadline = ms => {
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('timeoutMs must be positive and finite');
  return ms;
};

export function resolveBundledFace(style) {
  const family = typeof style === 'string' ? style : style?.font;
  const faces = bundledFaces.filter(face => face.cssFamily === family);
  return faces.find(face => face.cssWeight === (style?.bold ? 700 : 400) && face.cssStyle === (style?.italic ? 'italic' : 'normal')) ?? faces[0] ?? null;
}

// Dependencies are injected only for isolated tests; the default instance does no work on import.
export function createBundledFontLoader(environment = {}) {
  const records = new Map();
  const contexts = new WeakMap();
  let generation = 0;
  const env = name => environment[name] ?? globalThis[name];
  function faceOf(value) {
    if (value?.key) {
      const face = bundledFaces.find(face => face.key === value.key);
      if (!face || Object.keys(face).some(key => face[key] !== value[key])) throw new Error('Unrecognized bundled face');
      return face;
    }
    return resolveBundledFace(value);
  }
  function status(value) {
    const face = faceOf(value);
    return face ? records.get(face.key)?.status ?? 'unloaded' : 'legacy';
  }
  function assertReady(value) {
    const state = status(value);
    if (state !== 'loaded' && state !== 'legacy') throw new Error(`Bundled font is ${state}`);
  }
  function start(face) {
    const controller = new AbortController();
    const record = { status: 'pending', face: null, error: null };
    records.set(face.key, record);
    let timer;
    const timeoutMs = deadline(environment.loadTimeoutMs ?? 10000);
    const active = () => { if (record.status !== 'pending') throw timeoutError(); };
    const operation = (async () => {
      const base = environment.baseURL ?? new URL(import.meta.env?.BASE_URL ?? './', env('document').baseURI).href;
      const url = new URL(`${face.key}?sha256=${face.sha256}`, base).href;
      const response = await env('fetch')(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Font HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      active();
      if (bytes.byteLength !== face.bytes) throw new Error('Font byte length mismatch');
      const digest = await env('crypto').subtle.digest('SHA-256', bytes);
      if (Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') !== face.sha256) throw new Error('Font SHA-256 mismatch');
      active();
      const font = new (env('FontFace'))(face.cssFamily, bytes, { weight: String(face.cssWeight), style: face.cssStyle });
      record.face = font;
      await font.load();
      active();
      const document = env('document');
      document.fonts.add(font);
      // Force face-specific layout. Canvas contexts require applyCanvasFont separately.
      const span = document.createElement('span');
      record.span = span;
      span.textContent = 'Hamburgefontsiv 0123456789';
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${face.cssStyle} ${face.cssWeight} 32px "${face.cssFamily}", monospace`;
      try {
        document.body.append(span);
        span.getBoundingClientRect();
        await new Promise(resolve => env('requestAnimationFrame')(() => env('requestAnimationFrame')(resolve)));
        active();
        if (font.status !== 'loaded' || !document.fonts.has(font)) throw new Error('Font registration failed');
      } finally { span.remove(); }
      record.status = 'loaded';
      generation++;
      return font;
    })();
    record.promise = Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    })]).catch(error => {
      record.status = 'failed'; record.error = error;
      controller.abort();
      record.span?.remove();
      if (record.face) env('document').fonts.delete(record.face);
      throw error;
    }).finally(() => clearTimeout(timer));
    // A cancelled caller can leave the shared attempt without any waiters.
    record.promise.catch(() => {});
    return record;
  }
  function ensureFace(value, { signal, timeoutMs = 10000 } = {}) {
    const face = faceOf(value);
    if (!face) return null;
    deadline(timeoutMs);
    if (signal?.aborted) return Promise.reject(abortError());
    let record = records.get(face.key);
    if (!record || record.status === 'failed') record = start(face);
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (fn, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(result); };
      const abort = () => finish(reject, abortError());
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(reject, timeoutError()), timeoutMs);
      record.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
  const textStyles = snapshot => snapshot.filter(object => object.kind === 'text');
  function ensureTextFonts(snapshot, options) {
    const faces = [...new Set(textStyles(snapshot).map(resolveBundledFace).filter(Boolean))];
    return faces.length ? Promise.all(faces.map(face => ensureFace(face, options))) : null;
  }
  function assertTextFontsReady(snapshot) { textStyles(snapshot).forEach(assertReady); }
  function applyCanvasFont(context, font, style) {
    assertReady(style);
    // WebKit caches a fallback for repeated identical assignments across FontFace registration.
    // Invalidate selection with a measured unrelated font; never resize or reset the canvas.
    if (contexts.get(context) !== generation) {
      const previous = context.font;
      try {
        context.font = '11px serif'; context.measureText('KPX font settlement');
        context.font = '13px monospace'; context.measureText('KPX font settlement');
      } finally { context.font = previous; }
      contexts.set(context, generation);
    }
    context.font = font;
  }
  return { ensureFace, ensureTextFonts, status, assertReady, assertTextFontsReady, applyCanvasFont };
}
const loader = createBundledFontLoader();
export const { ensureFace, ensureTextFonts, status: bundledFaceStatus, assertReady: assertBundledFaceReady, assertTextFontsReady, applyCanvasFont } = loader;
