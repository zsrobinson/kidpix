import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import worker from './index.js';

function setup({ body = '0123456789', missing = false, metadata = {}, get } = {}) {
  const calls = [];
  const object = {
    key: 'original/movie.mp4', size: new TextEncoder().encode(body).length,
    etag: 'abc123', httpEtag: '"abc123"', uploaded: new Date('2026-11-09T12:00:00.123Z'),
    writeHttpMetadata(headers) { headers.set('Content-Type', 'video/mp4'); }, ...metadata,
  };
  const env = {
    ASSETS: { fetch: async request => { calls.push(['assets', request.url]); return new Response('app'); } },
    MEDIA: {
      head: async key => { calls.push(['head', key]); return missing ? null : object; },
      get: async (key, options) => {
        calls.push(['get', key, options]);
        if (get) return get(object, calls);
        const bytes = new TextEncoder().encode(body);
        const data = options.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes;
        return { ...object, body: new Blob([data]).stream() };
      },
    },
  };
  const fetch = (path = '/original/movie.mp4', options = {}) => worker.fetch(new Request(`https://kidpix.example${path}`, options), env, { waitUntil() {} });
  return { env, calls, object, fetch };
}

test('routes the app to static assets without accessing R2', async () => {
  const { fetch, calls } = setup();
  const response = await fetch('/');
  assert.equal(await response.text(), 'app');
  assert.deepEqual(calls.map(call => call[0]), ['assets']);
});

test('streams full media with metadata and a bounded cache lifetime', async () => {
  const { fetch, calls } = setup();
  const response = await fetch();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(response.headers.get('ETag'), '"abc123"');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=3600');
  assert.equal(response.headers.get('Last-Modified'), 'Mon, 09 Nov 2026 12:00:00 GMT');
  assert.deepEqual(calls[1], ['get', 'original/movie.mp4', { onlyIf: { etagMatches: 'abc123' } }]);
});

test('JSON receives fallback Content-Type and shorter caching', async () => {
  const { fetch } = setup({ metadata: { writeHttpMetadata() {} } });
  const response = await fetch('/original/catalog.json');
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
});

test('raw color channels and application-compressed bundles retain binary bytes without HTTP decoding', async () => {
  const raw = Buffer.from([255, 0, 255, 0, 128, 27, 63, 220, 0, 255, 128, 255]);
  for (const [name, bytes] of [['sprite.argb', raw], ['poses.bin.gz', gzipSync(raw)]]) {
    const { fetch } = setup({
      metadata: { size: bytes.length, writeHttpMetadata() {} },
      get: object => ({ ...object, body: new Blob([bytes]).stream() }),
    });
    const response = await fetch(`/original/ui/tool-motion/${name}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
    assert.equal(response.headers.get('Content-Encoding'), null);
    assert.equal(response.headers.get('Content-Length'), String(bytes.length));
    const received = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(received, bytes);
    if (name.endsWith('.gz')) assert.deepEqual(gunzipSync(received), raw);
  }
});

test('HEAD returns full metadata without fetching a body or honoring Range', async () => {
  const { fetch, calls } = setup();
  const response = await fetch(undefined, { method: 'HEAD', headers: { Range: 'bytes=2-4' } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.deepEqual(calls.map(call => call[0]), ['head']);
});

test('only permits read methods on media routes', async () => {
  for (const method of ['PUT', 'POST', 'DELETE', 'OPTIONS']) {
    const { fetch, calls } = setup();
    const response = await fetch(undefined, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
    assert.equal(calls.length, 0);
  }
});

test('rejects malformed or ambiguous media keys before R2 access', async () => {
  for (const path of ['/original/%zz.png', '/original/a%2Fb.png', '/original/a%5Cb.png', '/original/%00.png', '/original//movie.mp4', '/original/']) {
    const { fetch, calls } = setup();
    assert.equal((await fetch(path)).status, 400, path);
    assert.equal(calls.length, 0);
  }
});

test('decodes valid object paths once', async () => {
  const { fetch, calls } = setup();
  await fetch('/original/hello%20world.png');
  assert.equal(calls[0][1], 'original/hello world.png');
});

test('missing media returns an uncacheable 404', async () => {
  const { fetch } = setup({ missing: true });
  const response = await fetch();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('If-None-Match supports weak ETags, lists, wildcard, and HEAD', async () => {
  for (const value of ['W/"abc123"', '"other", "abc123"', '*']) {
    const { fetch, calls } = setup();
    const response = await fetch(undefined, { headers: { 'If-None-Match': value } });
    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('ETag'), '"abc123"');
    assert.deepEqual(calls.map(call => call[0]), ['head']);
  }
  assert.equal((await setup().fetch(undefined, { method: 'HEAD', headers: { 'If-None-Match': '*' } })).status, 304);
});

test('If-Match uses strong comparison and missing objects fail the precondition', async () => {
  for (const value of ['"other"', 'W/"abc123"']) {
    const { fetch, calls } = setup();
    assert.equal((await fetch(undefined, { headers: { 'If-Match': value } })).status, 412);
    assert.equal(calls.length, 1);
  }
  assert.equal((await setup().fetch(undefined, { headers: { 'If-Match': '"abc123"' } })).status, 200);
  assert.equal((await setup({ missing: true }).fetch(undefined, { headers: { 'If-Match': '*' } })).status, 412);
});

test('date validators use second precision and ignore invalid dates', async () => {
  const fetch = setup().fetch;
  assert.equal((await fetch(undefined, { headers: { 'If-Modified-Since': 'Mon, 09 Nov 2026 12:00:00 GMT' } })).status, 304);
  assert.equal((await fetch(undefined, { headers: { 'If-Unmodified-Since': 'Mon, 09 Nov 2026 11:59:59 GMT' } })).status, 412);
  assert.equal((await fetch(undefined, { headers: { 'If-Modified-Since': 'garbage' } })).status, 200);
});

test('ETag validators take precedence over date validators', async () => {
  const fetch = setup().fetch;
  assert.equal((await fetch(undefined, { headers: { 'If-None-Match': '"different"', 'If-Modified-Since': 'Tue, 10 Nov 2026 12:00:00 GMT' } })).status, 200);
  assert.equal((await fetch(undefined, { headers: { 'If-Match': '"abc123"', 'If-Unmodified-Since': 'Mon, 09 Nov 2026 11:59:59 GMT' } })).status, 200);
});

test('serves explicit, open-ended, suffix, and clamped ranges', async () => {
  for (const [range, expected, contentRange] of [
    ['bytes=2-4', '234', 'bytes 2-4/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-100', '89', 'bytes 8-9/10'],
    ['bytes=-100', '0123456789', 'bytes 0-9/10'],
  ]) {
    const { fetch } = setup();
    const response = await fetch(undefined, { headers: { Range: range } });
    assert.equal(response.status, 206, range);
    assert.equal(await response.text(), expected, range);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(response.headers.get('Content-Length'), String(expected.length));
  }
});

test('unsatisfiable ranges return 416 without a body read', async () => {
  for (const range of ['bytes=10-', 'bytes=5-3', 'bytes=-0', 'bytes=999999999999999999999-']) {
    const { fetch, calls } = setup();
    const response = await fetch(undefined, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.equal(calls.length, 1);
  }
  assert.equal((await setup({ body: '' }).fetch(undefined, { headers: { Range: 'bytes=0-' } })).status, 416);
});

test('ignores unsupported and malformed ranges', async () => {
  for (const range of ['items=1-2', 'bytes=0-1,3-4', 'bytes=-', 'garbage']) {
    assert.equal((await setup().fetch(undefined, { headers: { Range: range } })).status, 200, range);
  }
});

test('If-Range honors matching strong ETags and unmodified dates only', async () => {
  for (const [value, status] of [
    ['"abc123"', 206], ['"other"', 200], ['W/"abc123"', 200],
    ['Mon, 09 Nov 2026 12:00:00 GMT', 206], ['Mon, 09 Nov 2026 11:59:59 GMT', 200], ['garbage', 200],
  ]) {
    assert.equal((await setup().fetch(undefined, { headers: { Range: 'bytes=1-2', 'If-Range': value } })).status, status, value);
  }
});

test('retries if the object changes between metadata and body reads', async () => {
  let reads = 0;
  const { fetch, calls } = setup({ get: object => ++reads === 1 ? object : { ...object, body: new Blob(['0123456789']).stream() } });
  const response = await fetch();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.deepEqual(calls.map(call => call[0]), ['head', 'get', 'head', 'get']);
});

test('bounds retries during repeated concurrent updates', async () => {
  const { fetch, calls } = setup({ get: object => object });
  const response = await fetch();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '1');
  assert.equal(calls.length, 4);
});

test('caches small full GETs while conditional and ranged requests bypass cache', async () => {
  const previous = globalThis.caches;
  const stored = new Map();
  const pending = [];
  let matches = 0;
  globalThis.caches = { default: {
    async match(request) {
      matches++;
      const cached = stored.get(request.url);
      return cached && new Response(cached.body, cached.options);
    },
    async put(request, response) {
      stored.set(request.url, { body: await response.text(), options: { status: response.status, headers: response.headers } });
    },
  } };
  try {
    const { env, calls } = setup();
    const request = new Request('https://kidpix.example/original/movie.mp4');
    const ctx = { waitUntil(promise) { pending.push(promise); } };
    const first = await worker.fetch(request, env, ctx);
    assert.equal(await first.text(), '0123456789');
    await Promise.all(pending);
    const second = await worker.fetch(request, env, ctx);
    assert.equal(await second.text(), '0123456789');
    assert.deepEqual(calls.map(call => call[0]), ['head', 'get']);
    assert.equal(matches, 2);
    const conditional = await worker.fetch(new Request(request, { headers: { 'If-None-Match': '*' } }), env, ctx);
    assert.equal(conditional.status, 304);
    const ranged = await worker.fetch(new Request(request, { headers: { Range: 'bytes=2-4' } }), env, ctx);
    assert.equal(ranged.status, 206);
    assert.equal(await ranged.text(), '234');
    assert.equal(matches, 2);
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
});
