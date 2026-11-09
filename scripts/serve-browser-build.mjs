import { createServer } from 'node:http';
import { open, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function fail(response, method, status, message, headers = {}) {
  const body = Buffer.from(message + '\n');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function rangeFor(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if (![first, last].every(number => number === null || Number.isSafeInteger(number))) return false;
  if (!size || first === null && last === 0 || first !== null && (first >= size || last !== null && last < first)) return false;
  return { start: first === null ? Math.max(0, size - last) : first,
    end: first === null || last === null ? size - 1 : Math.min(last, size - 1) };
}

export function createBrowserBuildServer({
  buildRoot = resolve(repository, 'dist-cloudflare'),
  mediaRoot = resolve(repository, 'public/original'),
} = {}) {
  return createServer(async (request, response) => {
    const method = request.method;
    if (!['GET', 'HEAD'].includes(method)) return fail(response, method, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    let handle;
    try {
      // Validate the original request path before URL normalization can discard
      // encoded dot segments. Decode each segment exactly once.
      const raw = request.url.split(/[?#]/, 1)[0];
      if (!raw.startsWith('/')) return fail(response, method, 400, 'Bad Request');
      let parts;
      try { parts = raw.slice(1).split('/').map(part => decodeURIComponent(part)); }
      catch { return fail(response, method, 400, 'Bad Request'); }
      if (raw === '/') parts = ['index.html'];
      else if (parts.some(part => !part || part === '.' || part === '..' || /[/\\\u0000-\u001f\u007f]/.test(part))) {
        return fail(response, method, 400, 'Bad Request');
      }
      const media = parts[0] === 'original';
      if (media) parts.shift();
      if (!parts.length) return fail(response, method, 404, 'Not Found');
      const root = await realpath(media ? mediaRoot : buildRoot);
      const file = await realpath(resolve(root, ...parts));
      const inside = relative(root, file);
      if (!inside || inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || isAbsolute(inside)) {
        return fail(response, method, 404, 'Not Found');
      }
      handle = await open(file, 'r');
      const info = await handle.stat();
      if (!info.isFile()) return fail(response, method, 404, 'Not Found');
      const range = method === 'HEAD' ? null : rangeFor(request.headers.range, info.size);
      if (range === false) return fail(response, method, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${info.size}` });
      const headers = {
        'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': range ? range.end - range.start + 1 : info.size,
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
        'Last-Modified': info.mtime.toUTCString(), 'X-Content-Type-Options': 'nosniff',
      };
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
      response.writeHead(range ? 206 : 200, headers);
      if (method === 'HEAD') response.end();
      else await pipeline(handle.createReadStream(range || {}), response);
    } catch (error) {
      if (response.headersSent) response.destroy(error);
      else if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) fail(response, method, 404, 'Not Found');
      else {
        console.error(error);
        fail(response, method, 500, 'Internal Server Error');
      }
    } finally {
      await handle?.close().catch(() => {});
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = createBrowserBuildServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(4175, '127.0.0.1', () => console.log('Built browser app: http://127.0.0.1:4175'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
}
