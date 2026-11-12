import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { bundledFaces, createBundledFontLoader, resolveBundledFace } from '../src/bundled-fonts.js';
import catalog from '../src/bundled-font-catalog.json' with { type: 'json' };
import { validateFontCatalog, verifyFontStage, stageFonts } from './bundled-font-assets.mjs';
import { buildFontManifest, contentType } from './sync-media.mjs';

const face = bundledFaces[0];
function fixture({ hang = false, broken = false, settleHang = false } = {}) {
  let calls = 0;
  const set = new Set();
  const digest = Uint8Array.from(face.sha256.match(/../g), hex => parseInt(hex, 16));
  const environment = {
    baseURL: 'https://example.test/app/', loadTimeoutMs: 35,
    crypto: { subtle: { digest: async () => digest } },
    fetch: async url => {
      calls++; assert.equal(url, `https://example.test/app/${face.key}?sha256=${face.sha256}`);
      if (hang) return new Promise(() => {});
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(broken ? 1 : face.bytes) };
    },
    FontFace: class { constructor() { this.status = 'loaded'; } async load() { return this; } },
    document: { fonts: set, body: { append() {} }, createElement: () => ({ style: {}, getBoundingClientRect() {}, remove() {} }) },
    requestAnimationFrame: callback => { if (!settleHang) setTimeout(callback, 0); },
  };
  return { loader: createBundledFontLoader(environment), environment, set, calls: () => calls };
}
test('exact catalog and descriptor rejection controls', () => {
  validateFontCatalog(catalog);
  for (const mutate of [c => c.faces.push(c.faces[0]), c => c.faces[0].key = '../bad.ttf', c => c.faces[0].sha256 = '0'.repeat(64), c => c.faces[0].family = 'Tabloid', c => c.faces[0].cssWeight = 700]) {
    const value = structuredClone(catalog); mutate(value); assert.throws(() => validateFontCatalog(value));
  }
  assert.equal(resolveBundledFace('serif'), null);
  assert.equal(resolveBundledFace({ font: 'unknown', bold: true }), null);
  for (const bold of [false, true]) for (const italic of [false, true]) {
    const f = resolveBundledFace({ font: 'KPX Native Schoolhouse', bold, italic });
    assert.equal(f.cssWeight, bold ? 700 : 400); assert.equal(f.cssStyle, italic ? 'italic' : 'normal');
  }
});
test('inert import, synchronous legacy noops, concurrent/success dedup and readiness', async () => {
  const f = fixture(); assert.equal(f.calls(), 0);
  assert.equal(f.loader.ensureFace('serif'), null); assert.equal(f.loader.ensureTextFonts([{ kind: 'text', font: 'serif' }]), null);
  f.loader.assertReady('unknown');
  assert.throws(() => f.loader.assertReady(face));
  const a = f.loader.ensureFace(face), b = f.loader.ensureFace(face);
  assert.equal(f.loader.status(face), 'pending');
  assert.equal(await a, await b); await f.loader.ensureFace(face);
  assert.equal(f.calls(), 1); assert.equal(f.loader.status(face), 'loaded'); f.loader.assertReady(face);
});
test('caller abort and timeout do not poison another waiter or cached success', async () => {
  const f = fixture(); const controller = new AbortController();
  const cancelled = f.loader.ensureFace(face, { signal: controller.signal });
  const survivor = f.loader.ensureFace(face); controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' }); await survivor;
  await assert.rejects(f.loader.ensureFace(face, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.calls(), 1);
  const g = fixture(); await assert.rejects(g.loader.ensureFace(face, { timeoutMs: 1 }), { name: 'TimeoutError' });
  await g.loader.ensureFace(face); assert.equal(g.calls(), 1);
});
test('failed integrity, fetch and settlement deadlines are retryable and unregister failed faces', async () => {
  for (const options of [{ broken: true }, { hang: true }, { settleHang: true }]) {
    const f = fixture(options);
    await assert.rejects(f.loader.ensureFace(face)); assert.equal(f.loader.status(face), 'failed'); assert.equal(f.set.size, 0);
    f.environment.fetch = fixture().environment.fetch;
    f.environment.requestAnimationFrame = callback => setTimeout(callback, 0);
    await f.loader.ensureFace(face); assert.equal(f.loader.status(face), 'loaded');
  }
  const decode = fixture();
  const validFontFace = decode.environment.FontFace;
  decode.environment.FontFace = class { async load() { throw new Error('Decode failed'); } };
  await assert.rejects(decode.loader.ensureFace(face), /Decode failed/);
  assert.equal(decode.set.size, 0);
  decode.environment.FontFace = validFontFace; await decode.loader.ensureFace(face);
  const f = fixture(); f.environment.crypto = webcrypto;
  await assert.rejects(f.loader.ensureFace(face), /SHA-256/);
});
test('real exact staging, required catalog, constrained plan and negative controls', async t => {
  // Optional explicit local input; no private source location is embedded in runtime code.
  if (!process.env.FONT_TEST_SOURCE) return t.skip('FONT_TEST_SOURCE not supplied');
  const root = await mkdtemp(join(tmpdir(), 'kpx-font-'));
  try {
    const stage = join(root, 'stage'); await stageFonts(process.env.FONT_TEST_SOURCE, stage);
    const receipt = await verifyFontStage(stage); assert.equal(receipt.files.length, 29);
    const plan = await buildFontManifest(stage); assert.equal(plan.length, 29); assert.equal(contentType('x.ttf'), 'font/ttf');
    await writeFile(join(stage, 'original/fonts/Tabloid.ttf'), 'bad'); await assert.rejects(verifyFontStage(stage));
    await rm(join(stage, 'original/fonts/Tabloid.ttf'));
    const path = join(stage, face.key), bytes = await readFile(path); bytes[0] ^= 1;
    await writeFile(path, bytes); await assert.rejects(verifyFontStage(stage), /integrity/);
    await writeFile(path, bytes.subarray(1)); await assert.rejects(verifyFontStage(stage), /integrity/);
    await rm(join(stage, 'original/fonts/catalog.json')); await assert.rejects(verifyFontStage(stage));
  } finally { await rm(root, { recursive: true, force: true }); }
});
