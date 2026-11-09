import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSprayAssets } from '../../src/native-spray-assets.js';

function fixtures() {
  const makeBank = id => ({ id, frameCount: 2, clipIds: [],
    atlases: [{ image: `tools/spray/native/${id}-atlas-0.png`, width: 2, height: 1 }],
    frames: [0, 1].map(index => ({ index, width: 1, height: 1, registration: [0, 0],
      image: `tools/spray/native/${id}-atlas-0.png`, sourceRect: [index, 0, 1, 1] })),
  });
  return new Map([
    ['tools/spray-native.json', { version: 1, mode: 'spray', layout: 'atlas', sharded: true, spriteCount: 4, clipCount: 0,
      banks: Object.fromEntries([24000, 24100].map(id => [id, { id, frameCount: 2, clipCount: 0, manifest: `tools/spray/native/${id}.json` }])) }],
    ...[24000, 24100].map(id => [`tools/spray/native/${id}.json`, { version: 1, mode: 'spray', layout: 'atlas', banks: { [id]: makeBank(id) }, clips: {} }]),
  ]);
}

test('loads only the selected bank and unique atlas, sharing concurrent requests and resolved bundles', async () => {
  const source = fixtures();
  const fetched = [];
  const loaded = [];
  const assets = createNativeSprayAssets({
    urlFor: path => path,
    fetcher: async path => { fetched.push(path); return { ok: true, json: async () => source.get(path) }; },
    loadImage: async path => { loaded.push(path); return { path }; },
  });
  assert.equal(assets.peek('spray', 24000), undefined);
  const [one, two] = await Promise.all([assets.load('spray', 24000), assets.load('spray', '24000')]);
  assert.equal(one, two);
  assert.equal(assets.peek('spray', 24000), one);
  assert.equal(one.imageFor('tools/spray/native/24000-atlas-0.png'), one.images.get('tools/spray/native/24000-atlas-0.png'));
  assert.deepEqual(fetched, ['tools/spray-native.json', 'tools/spray/native/24000.json']);
  assert.deepEqual(loaded, ['tools/spray/native/24000-atlas-0.png']);
  await assets.load('spray', 24100);
  assert.deepEqual(fetched, ['tools/spray-native.json', 'tools/spray/native/24000.json', 'tools/spray/native/24100.json']);
  assert.equal(loaded.length, 2);
});

test('retries failed atlas loads without fetching a successful index or shard again', async () => {
  const source = fixtures();
  let fetches = 0;
  let loads = 0;
  const assets = createNativeSprayAssets({ urlFor: path => path,
    fetcher: async path => { fetches++; return { ok: true, json: async () => source.get(path) }; },
    loadImage: async path => { if (++loads === 1) throw new Error('temporary image failure'); return { path }; },
  });
  await assert.rejects(assets.load('spray', 24000), /temporary image failure/);
  assert.equal(assets.peek('spray', 24000), undefined);
  await assets.load('spray', 24000);
  assert.equal(fetches, 2);
  assert.equal(loads, 2);
});

test('retries failed indexes and shards and rejects invalid source counts or atlas paths', async () => {
  const source = fixtures();
  let indexAttempts = 0;
  let shardAttempts = 0;
  const assets = createNativeSprayAssets({ urlFor: path => path,
    fetcher: async path => {
      if (path.endsWith('-native.json') && ++indexAttempts === 1) return { ok: false, status: 503 };
      if (path.endsWith('/24000.json') && ++shardAttempts === 1) throw new Error('temporary shard failure');
      return { ok: true, json: async () => source.get(path) };
    },
    loadImage: async path => ({ path }),
  });
  await assert.rejects(assets.load('spray', 24000), /503/);
  await assert.rejects(assets.load('spray', 24000), /temporary shard failure/);
  const shard = source.get('tools/spray/native/24000.json');
  shard.banks[24000].frameCount = 3;
  await assert.rejects(assets.load('spray', 24000), /source counts differ/);
  shard.banks[24000].frameCount = 2;
  shard.banks[24000].frames[0].image = 'https://external.invalid/wrong.png';
  await assert.rejects(assets.load('spray', 24000), /Invalid native spray bank/);
  shard.banks[24000].frames[0].image = 'tools/spray/native/24000-atlas-0.png';
  await assets.load('spray', 24000);
  assert.equal(indexAttempts, 2);
  assert.equal(shardAttempts, 4);
  await assert.rejects(assets.load('spray', '../24000'), /Invalid/);
  await assert.rejects(assets.load('moving-spray-evil', 24000), /Unknown/);
  await assert.rejects(assets.load('toString', 24000), /Unknown/);
});
