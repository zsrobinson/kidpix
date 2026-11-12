import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mediaRoot = fileURLToPath(new URL('../public/original/', import.meta.url));
const types = {
  '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg',
  '.json': 'application/json; charset=utf-8',
  // Raw color channels and application-decompressed animation bundles. Gzip
  // here is a file format, not HTTP Content-Encoding; the runtime expands it.
  '.argb': 'application/octet-stream', '.bin': 'application/octet-stream', '.gz': 'application/octet-stream',
};

export function contentType(path) {
  const type = types[extname(path).toLowerCase()];
  if (!type) throw new Error(`Unsupported media file: ${path}`);
  return type;
}

export function cacheControl(path) {
  // Paths are stable rather than content-addressed; manifests revalidate every time.
  return extname(path).toLowerCase() === '.json'
    ? 'public, max-age=0, must-revalidate'
    : 'public, max-age=3600, must-revalidate';
}

export function objectKey(root, path) {
  const name = relative(root, path);
  if (!name || name === '..' || name.startsWith(`..${sep}`)) throw new Error('Media path is outside the source directory.');
  const pieces = name.split(sep);
  if (pieces.some(piece => piece.startsWith('.'))) throw new Error('Hidden files cannot be uploaded.');
  return `original/${pieces.join('/')}`;
}

export async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function buildManifest(root = mediaRoot) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links cannot be uploaded: ${relative(root, path)}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const info = await stat(path);
        if (!info.size) throw new Error(`Empty media file: ${relative(root, path)}`);
        files.push({ path, key: objectKey(root, path), size: info.size, modified: info.mtimeMs,
          contentType: contentType(path), cacheControl: cacheControl(path) });
      } else throw new Error(`Unsupported media entry: ${relative(root, path)}`);
    }
  }
  await visit(root);
  if (!files.length) throw new Error('No media found. Run npm run import:original first.');
  return files;
}

export async function buildFontManifest(stageRoot) {
  const { verifyFontStage } = await import('./bundled-font-assets.mjs');
  const receipt = await verifyFontStage(stageRoot);
  return Promise.all(receipt.files.map(async file => {
    const path = join(stageRoot, file.key);
    const info = await stat(path);
    return { path, key: file.key, size: file.bytes, sha256: file.sha256, modified: info.mtimeMs,
      contentType: contentType(path), cacheControl: cacheControl(path) };
  }));
}

export function unchanged(remote, file) {
  return remote?.Metadata?.sha256 === file.sha256
    && remote.ContentLength === file.size
    && remote.ContentType === file.contentType
    && remote.CacheControl === file.cacheControl;
}

const retryableCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'TimeoutError', 'RequestTimeout', 'SlowDown', 'InternalError', 'ServiceUnavailable']);

export async function withRetry(run, { attempts = 5, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      const status = error.$metadata?.httpStatusCode;
      const retryable = status === 429 || status >= 500 || retryableCodes.has(error.code) || retryableCodes.has(error.name);
      if (!retryable || attempt + 1 >= attempts) throw error;
      await delay(Math.min(8000, 250 * 2 ** attempt) + Math.floor(Math.random() * 250));
    }
  }
}

export async function syncMedia(files, transport, { concurrency = 6, log = console.log } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Concurrency must be an integer from 1 to 32.');
  const totals = { uploaded: 0, skipped: 0, bytes: 0 };
  let next = 0;
  let failure;
  const lanes = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (!failure && next < files.length) {
      const item = files[next++];
      try {
        const file = { ...item, sha256: await checksum(item.path) };
        const remote = await withRetry(() => transport.head(file.key));
        if (unchanged(remote, file)) totals.skipped++;
        else {
          const before = await stat(file.path);
          if (before.size !== file.size || before.mtimeMs !== file.modified) throw Object.assign(new Error(), { code: 'SOURCE_CHANGED' });
          // A fresh file stream is created by the transport for every retry.
          await withRetry(() => transport.put(file));
          const after = await stat(file.path);
          if (after.size !== file.size || after.mtimeMs !== file.modified) throw Object.assign(new Error(), { code: 'SOURCE_CHANGED' });
          totals.uploaded++;
          totals.bytes += file.size;
        }
        if ((totals.uploaded + totals.skipped) % 100 === 0) log(`Processed ${totals.uploaded + totals.skipped}/${files.length}: ${totals.uploaded} uploaded, ${totals.skipped} unchanged.`);
      } catch (error) {
        // Keep SDK errors/credential configuration out of output, but identify failed objects.
        const status = error.$metadata?.httpStatusCode;
        const detail = error.code === 'SOURCE_CHANGED' ? 'Source file changed; retry after the import finishes.' : status ? `HTTP ${status}` : error.code || error.name;
        failure ??= new Error(`Could not sync ${item.key}: ${detail}`);
      }
    }
  });
  await Promise.all(lanes);
  if (failure) throw failure;
  return totals;
}

export async function createS3Transport(client, bucket, { ListObjectsV2Command, HeadObjectCommand, PutObjectCommand }) {
  // Inventory once so new objects need only a PUT. Existing objects still need
  // HEAD because ListObjectsV2 does not include SHA-256 or delivery metadata.
  const knownKeys = new Set();
  let continuationToken;
  do {
    const page = await withRetry(() => client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: 'original/', ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    })));
    for (const object of page.Contents ?? []) {
      if (typeof object.Key === 'string' && object.Key.startsWith('original/')) knownKeys.add(object.Key);
    }
    if (!page.IsTruncated) break;
    if (!page.NextContinuationToken || page.NextContinuationToken === continuationToken) throw Object.assign(new Error('R2 returned an incomplete object inventory.'), { code: 'INCOMPLETE_INVENTORY' });
    continuationToken = page.NextContinuationToken;
  } while (true);
  return {
    async head(key) {
      if (!knownKeys.has(key)) return null;
      try { return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); }
      catch (error) {
        if (error.$metadata?.httpStatusCode === 404) {
          knownKeys.delete(key);
          return null;
        }
        throw error;
      }
    },
    async put(file) {
      const body = createReadStream(file.path);
      try {
        const result = await client.send(new PutObjectCommand({ Bucket: bucket, Key: file.key, Body: body,
          ContentLength: file.size, ContentType: file.contentType, CacheControl: file.cacheControl,
          Metadata: { sha256: file.sha256 } }));
        knownKeys.add(file.key);
        return result;
      } finally { body.destroy(); }
    },
    close() { client.destroy(); },
  };
}

export async function createTransport(env, bucket, sdk) {
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!env[name]) throw new Error(`Missing ${name}. Use a bucket-scoped R2 Object Read & Write access key.`);
  }
  if (!/^[a-f\d]{32}$/i.test(env.R2_ACCOUNT_ID)) throw new Error('R2_ACCOUNT_ID must be a Cloudflare account ID.');
  const { S3Client, ListObjectsV2Command, HeadObjectCommand, PutObjectCommand } = sdk ?? await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region: 'auto',
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
  try { return await createS3Transport(client, bucket, { ListObjectsV2Command, HeadObjectCommand, PutObjectCommand }); }
  catch (error) {
    client.destroy();
    const status = error.$metadata?.httpStatusCode;
    const detail = error.code === 'INCOMPLETE_INVENTORY' ? 'Incomplete object inventory' : status ? `HTTP ${status}` : error.code || error.name;
    throw new Error(`Could not read the R2 media inventory: ${detail}`);
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.includes('--help')) {
    console.log(`Upload public/original/ to R2 as original/* without deleting remote objects.

Usage: node scripts/sync-media.mjs [--dry-run] [--concurrency 1-32] [--font-stage STAGED_ROOT]

Environment: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
Optional: R2_BUCKET (default: kidpix-media)

--dry-run lists the local upload plan without credentials or network access.
Existing objects with matching SHA-256, size, Content-Type, and Cache-Control are skipped.
Interrupted uploads are safe to resume by running the same command again.`);
    return;
  }
  let fontStage;
  let dryRun = false;
  let concurrency = 6;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--font-stage') {
      fontStage = args[++index];
      if (!fontStage || fontStage.startsWith('--')) throw new Error('--font-stage requires an explicit staged root');
    }
    else if (args[index] === '--dry-run') dryRun = true;
    else if (args[index] === '--concurrency') concurrency = Number(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Concurrency must be an integer from 1 to 32.');
  const bucket = env.R2_BUCKET || 'kidpix-media';
  if (!/^[a-z\d][a-z\d-]{1,61}[a-z\d]$/.test(bucket)) throw new Error('R2_BUCKET must be a valid bucket name.');
  const files = fontStage ? await buildFontManifest(fontStage) : await buildManifest();
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`${dryRun ? 'Dry run' : 'Sync'}: ${files.length.toLocaleString('en')} files (${(bytes / 1024 ** 3).toFixed(2)} GiB) to R2 bucket ${bucket}, prefix original/.`);
  if (dryRun) {
    console.log('No network requests made. Remote differences have not been checked.');
    return;
  }
  const transport = await createTransport(env, bucket);
  try {
    const totals = await syncMedia(files, transport, { concurrency });
    console.log(`Finished: ${totals.uploaded} uploaded (${(totals.bytes / 1024 ** 2).toFixed(1)} MiB), ${totals.skipped} unchanged. No remote objects deleted.`);
  } finally { transport.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
