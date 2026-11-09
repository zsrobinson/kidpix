import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildManifest, cacheControl, checksum, contentType, objectKey, syncMedia, unchanged, withRetry } from './sync-media.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kidpix-media-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('manifest preserves original/ paths, skips hidden files, and records delivery metadata', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'movies'));
  await mkdir(join(root, '.private'));
  await writeFile(join(root, '.private', 'secret.json'), '{}');
  await writeFile(join(root, '.DS_Store'), 'hidden');
  await writeFile(join(root, 'catalog.json'), '{}');
  await writeFile(join(root, 'movies', 'movie.mp4'), 'movie');
  const files = await buildManifest(root);
  assert.deepEqual(files.map(file => file.key), ['original/catalog.json', 'original/movies/movie.mp4']);
  assert.equal(files[0].contentType, 'application/json; charset=utf-8');
  assert.equal(files[0].cacheControl, 'public, max-age=0, must-revalidate');
  assert.equal(files[1].contentType, 'video/mp4');
  assert.equal(files[1].size, 5);
  assert.ok(Number.isFinite(files[1].modified));
});

test('manifest rejects installers and symbolic links rather than uploading outside media', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'installer.dmg'), 'installer');
  await assert.rejects(buildManifest(root), /Unsupported media file/);
  await rm(join(root, 'installer.dmg'));
  await symlink('/etc/passwd', join(root, 'image.png'));
  await assert.rejects(buildManifest(root), /Symbolic links cannot be uploaded/);
});

test('manifest rejects empty directories and zero-byte media', async t => {
  const root = await fixture(t);
  await assert.rejects(buildManifest(root), /No media found/);
  await writeFile(join(root, 'image.png'), '');
  await assert.rejects(buildManifest(root), /Empty media file/);
});

test('object keys reject paths outside source and hidden names', () => {
  assert.equal(objectKey('/media', '/media/paint/my image.png'), 'original/paint/my image.png');
  assert.throws(() => objectKey('/media', '/other/image.png'), /outside/);
  assert.throws(() => objectKey('/media', '/media/.env'), /Hidden/);
});

test('media types cover imported formats and stable media has bounded caching', () => {
  assert.equal(contentType('image.JPG'), 'image/jpeg');
  assert.equal(contentType('audio.flac'), 'audio/flac');
  assert.equal(contentType('shape.svg'), 'image/svg+xml');
  assert.equal(cacheControl('movie.mp4'), 'public, max-age=3600, must-revalidate');
  assert.throws(() => contentType('private.pem'), /Unsupported/);
});

test('checksums use SHA-256 over file bytes', async t => {
  const root = await fixture(t);
  const path = join(root, 'catalog.json');
  await writeFile(path, 'abc');
  assert.equal(await checksum(path), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('resume skips only matching content and delivery metadata', () => {
  const file = { sha256: 'hash', size: 3, contentType: 'image/png', cacheControl: 'public, max-age=3600' };
  const remote = { Metadata: { sha256: 'hash' }, ContentLength: 3, ContentType: 'image/png', CacheControl: file.cacheControl };
  assert.equal(unchanged(remote, file), true);
  for (const changed of [{ Metadata: {} }, { ContentLength: 4 }, { ContentType: 'image/jpeg' }, { CacheControl: 'private' }]) {
    assert.equal(unchanged({ ...remote, ...changed }, file), false);
  }
  assert.equal(unchanged(null, file), false);
});

test('sync is resumable and updates same-size changed bytes with bounded concurrency', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'a.png'), 'aaa');
  await writeFile(join(root, 'b.png'), 'bbb');
  const files = await buildManifest(root);
  const remote = new Map();
  let active = 0;
  let peak = 0;
  const transport = {
    async head(key) { return remote.get(key) ?? null; },
    async put(file) {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      remote.set(file.key, { Metadata: { sha256: file.sha256 }, ContentLength: file.size, ContentType: file.contentType, CacheControl: file.cacheControl });
      active--;
    },
  };
  assert.deepEqual(await syncMedia(files, transport, { concurrency: 1 }), { uploaded: 2, skipped: 0, bytes: 6 });
  assert.equal(peak, 1);
  assert.deepEqual(await syncMedia(await buildManifest(root), transport), { uploaded: 0, skipped: 2, bytes: 0 });
  await writeFile(join(root, 'a.png'), 'new');
  assert.deepEqual(await syncMedia(await buildManifest(root), transport), { uploaded: 1, skipped: 1, bytes: 3 });
});

test('sync detects source changes before upload and redacts unexpected transport messages', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'a.png'), 'aaa');
  const files = await buildManifest(root);
  await writeFile(join(root, 'a.png'), 'longer');
  await assert.rejects(syncMedia(files, { head: async () => null, put: async () => assert.fail('must not upload changed source') }), /Source file changed/);
  const error = await syncMedia(await buildManifest(root), { head: async () => { throw new Error('secret-value'); } }).catch(error => error);
  assert.match(error.message, /Could not sync original\/a.png/);
  assert.ok(!error.message.includes('secret-value'));
});

test('retries transient failures, stops after limit, and fails authentication immediately', async () => {
  let attempts = 0;
  const transient = Object.assign(new Error(), { $metadata: { httpStatusCode: 503 } });
  assert.equal(await withRetry(async () => { if (++attempts < 3) throw transient; return 'ok'; }, { delay: async () => {} }), 'ok');
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(withRetry(async () => { attempts++; throw transient; }, { attempts: 2, delay: async () => {} }));
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(withRetry(async () => { attempts++; throw Object.assign(new Error(), { $metadata: { httpStatusCode: 403 } }); }, { delay: async () => {} }));
  assert.equal(attempts, 1);
});

test('dry-run and help work without R2 credentials or loading the SDK', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('R2_') || key.startsWith('AWS_')) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/sync-media.mjs', '--dry-run'], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run: .*files .*prefix original\//);
  assert.match(result.stdout, /No network requests made/);
  const help = spawnSync(process.execPath, ['scripts/sync-media.mjs', '--help'], { encoding: 'utf8', env });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /R2_ACCESS_KEY_ID/);
});

test('CLI rejects invalid concurrency and unknown options', () => {
  for (const args of [['--concurrency', '100'], ['--concurrency'], ['--unknown']]) {
    const result = spawnSync(process.execPath, ['scripts/sync-media.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  }
});
