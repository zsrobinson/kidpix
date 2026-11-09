import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createBrowserBuildServer } from './serve-browser-build.mjs';

test('built server streams local media separately and rejects missing or escaping paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidpix-build-server-'));
  const buildRoot = join(root, 'build');
  const mediaRoot = join(root, 'media');
  await mkdir(join(buildRoot, 'assets'), { recursive: true });
  await mkdir(join(mediaRoot, 'ui'), { recursive: true });
  await writeFile(join(buildRoot, 'index.html'), '<html>built app</html>');
  await writeFile(join(buildRoot, 'assets', 'app.js'), 'console.log("build")');
  await writeFile(join(mediaRoot, 'ui', 'cursor.png'), '0123456789');
  await writeFile(join(root, 'outside.txt'), 'private');
  await symlink(join(root, 'outside.txt'), join(mediaRoot, 'escape.txt'));
  const server = createBrowserBuildServer({ buildRoot, mediaRoot });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = (path, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    assert.equal((await request('/')).body, '<html>built app</html>');
    const js = await request('/assets/app.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
    const media = await request('/original/ui/cursor.png?v=0.2.1');
    assert.equal(media.body, '0123456789');
    assert.equal(media.headers['content-type'], 'image/png');
    const head = await request('/original/ui/cursor.png', 'HEAD', { Range: 'bytes=0-2' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], '10');
    const range = await request('/original/ui/cursor.png', 'GET', { Range: 'bytes=2-4' });
    assert.equal(range.status, 206);
    assert.equal(range.body, '234');
    assert.equal(range.headers['content-range'], 'bytes 2-4/10');
    assert.equal((await request('/original/ui/cursor.png', 'GET', { Range: 'bytes=-2' })).body, '89');
    assert.equal((await request('/original/ui/cursor.png', 'GET', { Range: 'bytes=100-' })).status, 416);
    assert.equal((await request('/original/ui/cursor.png', 'POST')).status, 405);
    for (const path of ['/assets/original/ui/cursor.png', '/missing-route', '/original/missing.png', '/original/escape.txt']) {
      assert.equal((await request(path)).status, 404, path);
    }
    for (const path of ['/original/%2e%2e/outside.txt', '/original/%2foutside.txt', '/original/%5coutside.txt', '/original/%00.png', '/original/%zz']) {
      assert.equal((await request(path)).status, 400, path);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
