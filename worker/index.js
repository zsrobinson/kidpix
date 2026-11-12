const types = {
  ttf: 'font/ttf', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', flac: 'audio/flac', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf',
};

function errorResponse(status, method, headers = {}) {
  const messages = { 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed', 412: 'Precondition Failed', 416: 'Range Not Satisfiable', 503: 'Media temporarily unavailable' };
  return new Response(method === 'HEAD' ? null : messages[status], {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function mediaKey(pathname) {
  const parts = pathname.slice(1).split('/').map(part => decodeURIComponent(part));
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || /[/\\\u0000-\u001f\u007f]/.test(part))) return null;
  return parts.join('/');
}

function headersFor(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || types[key.split('.').pop().toLowerCase()] || 'application/octet-stream');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  // Original filenames are stable rather than content hashed. Revalidate updates promptly.
  headers.set('Cache-Control', `public, max-age=${key.endsWith('.json') ? 300 : 3600}`);
  headers.delete('Expires');
  return headers;
}

function etagMatches(value, etag, weak = false) {
  return value.split(',').some(tag => {
    tag = tag.trim();
    return tag === '*' || (weak ? tag.replace(/^W\//, '') === etag : tag === etag);
  });
}

function modifiedAfter(object, value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.floor(object.uploaded.getTime() / 1000) > Math.floor(time / 1000) : null;
}

function preconditionStatus(request, object) {
  const h = request.headers;
  const match = h.get('If-Match');
  if (match && !etagMatches(match, object.httpEtag)) return 412;
  if (!match && h.has('If-Unmodified-Since') && modifiedAfter(object, h.get('If-Unmodified-Since'))) return 412;
  const none = h.get('If-None-Match');
  if (none && etagMatches(none, object.httpEtag, true)) return 304;
  if (!none && h.has('If-Modified-Since') && modifiedAfter(object, h.get('If-Modified-Since')) === false) return 304;
  return null;
}

function rangeFor(request, object) {
  const value = request.headers.get('Range');
  if (!value || request.method === 'HEAD') return null;
  const ifRange = request.headers.get('If-Range');
  if (ifRange && (ifRange.startsWith('"') || ifRange.startsWith('W/')) && ifRange !== object.httpEtag) return null;
  if (ifRange && !ifRange.startsWith('"') && !ifRange.startsWith('W/') && modifiedAfter(object, ifRange) !== false) return null;
  // Ignore unsupported/malformed ranges, including multi-range requests, as HTTP permits.
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false;
  if (!object.size || (first === null && last === 0) || (first !== null && (first >= object.size || (last !== null && last < first)))) return false;
  const start = first === null ? Math.max(0, object.size - last) : first;
  const end = first === null || last === null ? object.size - 1 : Math.min(last, object.size - 1);
  return { offset: start, length: end - start + 1 };
}

async function readMedia(request, env, key) {
  // Pin the body read to the metadata version, so an upload cannot change its range or ETag mid-request.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Invoke outside the catch: only asynchronous binding read rejections consume a retry.
    // Header/condition/Response errors and synchronous binding contract errors still fail immediately.
    const headRead = env.MEDIA.head(key);
    let metadata;
    try {
      metadata = await headRead;
    } catch (error) {
      if (attempt === 1) throw error;
      console.error(JSON.stringify({ message: 'media_read_retry', key, stage: 'head', attempt: attempt + 1, error: String(error) }));
      continue;
    }
    if (!metadata) return errorResponse(request.headers.has('If-Match') ? 412 : 404, request.method);
    const headers = headersFor(metadata, key);
    const condition = preconditionStatus(request, metadata);
    if (condition === 304) return new Response(null, { status: 304, headers });
    if (condition) return errorResponse(condition, request.method, { ETag: metadata.httpEtag });
    const range = rangeFor(request, metadata);
    if (range === false) return errorResponse(416, request.method, { 'Content-Range': `bytes */${metadata.size}`, 'Accept-Ranges': 'bytes' });
    headers.set('Content-Length', String(range ? range.length : metadata.size));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
    if (request.method === 'HEAD') return new Response(null, { headers });
    const bodyRead = env.MEDIA.get(key, {
      onlyIf: { etagMatches: metadata.etag }, ...(range ? { range } : {}),
    });
    let object;
    try {
      object = await bodyRead;
    } catch (error) {
      if (attempt === 1) throw error;
      console.error(JSON.stringify({ message: 'media_read_retry', key, stage: 'get', attempt: attempt + 1, error: String(error) }));
      continue;
    }
    if (!object) continue;
    if (!('body' in object)) continue;
    return new Response(object.body, { status: range ? 206 : 200, headers });
  }
  return errorResponse(503, request.method, { 'Retry-After': '1' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/original' && !url.pathname.startsWith('/original/')) return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return errorResponse(405, request.method, { Allow: 'GET, HEAD' });
    let key;
    try { key = mediaKey(url.pathname); } catch { return errorResponse(400, request.method); }
    if (!key) return errorResponse(400, request.method);
    try {
      // Public, unconditional GETs can share cached responses. Range and validators go to R2.
      const cacheable = request.method === 'GET' && !['Range', 'If-Match', 'If-None-Match', 'If-Modified-Since', 'If-Unmodified-Since', 'If-Range'].some(name => request.headers.has(name));
      const cache = cacheable && typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey = new Request(url.href, { method: 'GET' });
      if (cache) {
        try {
          const cached = await cache.match(cacheKey);
          if (cached) return cached;
        } catch (error) {
          console.error(JSON.stringify({ message: 'media_cache_read_failed', key, error: String(error) }));
        }
      }
      const response = await readMedia(request, env, key);
      if (cache && ctx && response.status === 200 && Number(response.headers.get('Content-Length')) <= 8 * 1024 ** 2) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(error => {
          console.error(JSON.stringify({ message: 'media_cache_write_failed', key, error: String(error) }));
        }));
      }
      return response;
    } catch (error) {
      console.error(JSON.stringify({ message: 'media_read_failed', key, error: String(error) }));
      return errorResponse(503, request.method);
    }
  },
};
