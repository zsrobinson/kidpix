export const original = name => `${import.meta.env.BASE_URL}original/${name}`;

export function originalCssUrl(name) {
  return `url("${new URL(original(name), document.baseURI).href}")`;
}

function absoluteAsset(item, group) {
  const media = { ...item, group };
  for (const key of ['src', 'thumbnail', 'rightSrc', 'foreground', 'foregroundSrc', 'leftSrc', 'animation', 'rightAnimation']) {
    if (typeof media[key] === 'string') media[key] = original(media[key]);
  }
  if (media.layers) {
    media.layers = media.layers.map(layer => ({
      ...layer, src: original(layer.src), rightSrc: layer.rightSrc && original(layer.rightSrc),
    }));
  }
  return media;
}

export async function loadCatalog() {
  const response = await fetch(original('catalog.json'));
  if (!response.ok) throw new Error('Original art library is unavailable.');
  const catalog = await response.json();
  if (catalog.version !== 1 || !catalog.groups) throw new Error('Original art library is unavailable.');
  return Object.fromEntries(Object.entries(catalog.groups).map(([key, categories]) => [
    key, categories.map(category => ({
      ...category,
      items: category.items.map(item => absoluteAsset(item, key)),
    })),
  ]));
}

const savedMedia = new Set([
  'src', 'thumbnail', 'rightSrc', 'leftSrc', 'animation', 'rightAnimation',
  'background', 'foreground', 'foregroundSrc', 'paper',
]);

export function rebaseProject(picture) {
  function rebase(value, key) {
    if (typeof value === 'string' && savedMedia.has(key)) {
      const path = /^(?:\.\/|\/)?original\/(.+)$/.exec(value)?.[1];
      return path ? original(path) : value;
    }
    if (Array.isArray(value)) return value.map(item => rebase(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, rebase(item, name)]));
    }
    return value;
  }
  return rebase(picture);
}
