import { original } from './library.js';

const limits = { spray: 25400, 'moving-spray': 25900 };
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

function bankKey(mode, bankId) {
  if (!Object.hasOwn(limits, mode)) throw new Error(`Unknown native spray mode ${mode}`);
  const id = typeof bankId === 'string' && /^\d+$/.test(bankId) ? Number(bankId) : bankId;
  if (!integer(id, 24000) || id > limits[mode] || id % 100) throw new Error(`Invalid ${mode} bank ${bankId}`);
  return { id, key: `${mode}:${id}` };
}

function validateIndex(index, mode) {
  if (index?.version !== 1 || index.mode !== mode || index.layout !== 'atlas' || index.sharded !== true || !index.banks || typeof index.banks !== 'object') {
    throw new Error('Invalid native spray atlas index');
  }
  let sprites = 0;
  let clips = 0;
  for (const [key, bank] of Object.entries(index.banks)) {
    const { id } = bankKey(mode, key);
    if (String(id) !== key || bank.id !== id || !integer(bank.frameCount, 1) || !integer(bank.clipCount) ||
        (mode === 'spray' ? bank.clipCount !== 0 : bank.clipCount < 1) || bank.manifest !== `tools/${mode}/native/${id}.json`) {
      throw new Error(`Invalid native spray index entry ${key}`);
    }
    sprites += bank.frameCount;
    clips += bank.clipCount;
  }
  if (!sprites || index.spriteCount !== sprites || index.clipCount !== clips) throw new Error('Native spray index source counts differ');
  return index;
}

function validateShard(shard, mode, id, entry) {
  const bank = shard?.banks?.[id];
  const clips = shard?.clips;
  if (shard?.version !== 1 || shard.mode !== mode || shard.layout !== 'atlas' || !bank || bank.id !== id ||
      bank.frameCount !== entry.frameCount || !Array.isArray(bank.frames) || bank.frames.length !== bank.frameCount ||
      !Array.isArray(bank.clipIds) || bank.clipIds.length !== entry.clipCount || !clips || typeof clips !== 'object' ||
      Array.isArray(clips) || Object.keys(clips).length !== entry.clipCount || Object.keys(shard.banks).length !== 1 || !Array.isArray(bank.atlases)) {
    throw new Error(`Native spray bank ${id} source counts differ`);
  }
  const atlases = new Map();
  for (const atlas of bank.atlases) {
    if (!new RegExp(`^tools/${mode}/native/${id}-atlas-\\d+\\.png$`).test(atlas.image) ||
        !integer(atlas.width, 1) || !integer(atlas.height, 1) || atlas.width > 2048 || atlas.height > 2048 || atlases.has(atlas.image)) {
      throw new Error(`Invalid native spray bank ${id} atlas`);
    }
    atlases.set(atlas.image, atlas);
  }
  for (const [index, frame] of bank.frames.entries()) {
    const atlas = atlases.get(frame.image);
    const rect = frame.sourceRect;
    if (frame.index !== index || !integer(frame.width, 1) || !integer(frame.height, 1) || !atlas ||
        !Array.isArray(frame.registration) || frame.registration.length !== 2 || !frame.registration.every(Number.isSafeInteger) ||
        !Array.isArray(rect) || rect.length !== 4 || !rect.every(value => integer(value)) ||
        rect[2] !== frame.width || rect[3] !== frame.height || rect[0] + rect[2] > atlas.width || rect[1] + rect[3] > atlas.height) {
      throw new Error(`Invalid native spray bank ${id} frame ${index}`);
    }
  }
  const seen = new Set();
  for (const clipId of bank.clipIds) {
    if (!integer(clipId, id) || clipId >= id + 100 || seen.has(clipId) || clips[clipId]?.id !== clipId || clips[clipId]?.bank !== id) {
      throw new Error(`Invalid native spray bank ${id} clip reference`);
    }
    seen.add(clipId);
  }
  return { bank, clips };
}

async function decodeImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function memo(cache, key, load) {
  if (!cache.has(key)) {
    const promise = Promise.resolve().then(load).catch(error => {
      if (cache.get(key) === promise) cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return cache.get(key);
}

export function createNativeSprayAssets({ urlFor = original, loadImage = decodeImage, fetcher = (...args) => fetch(...args) } = {}) {
  const indexes = new Map();
  const shards = new Map();
  const atlasImages = new Map();
  const bundles = new Map();
  const resolved = new Map();

  async function json(path) {
    const response = await fetcher(urlFor(path));
    if (!response.ok) throw new Error(`Native spray manifest ${path} returned ${response.status}`);
    return response.json();
  }

  async function load(mode, bankId) {
    const { id, key } = bankKey(mode, bankId);
    return memo(bundles, key, async () => {
      const index = await memo(indexes, mode, async () => validateIndex(await json(`tools/${mode}-native.json`), mode));
      const entry = index.banks[id];
      if (!entry) throw new Error(`Native spray bank ${id} is missing from the index`);
      const data = await memo(shards, key, async () => validateShard(await json(entry.manifest), mode, id, entry));
      const images = new Map();
      const paths = [...new Set(data.bank.frames.map(frame => frame.image))];
      await Promise.all(paths.map(async path => {
        const image = await memo(atlasImages, path, async () => {
          const decoded = await loadImage(urlFor(path));
          if (!decoded) throw new Error(`Native spray atlas ${path} did not load`);
          return decoded;
        });
        images.set(path, image);
      }));
      const bundle = { ...data, images, imageFor: path => images.get(path) };
      resolved.set(key, bundle);
      return bundle;
    });
  }

  return {
    load,
    peek(mode, bankId) {
      try { return resolved.get(bankKey(mode, bankId).key); }
      catch { return undefined; }
    },
  };
}
