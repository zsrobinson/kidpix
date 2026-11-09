import { statSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const original = fileURLToPath(new URL('../public/original/', import.meta.url));
const checked = new Map();

function check(path) {
  const file = resolve(original, path);
  const inside = relative(original, file);
  if (!inside || inside === '..' || inside.startsWith('..' + sep)) throw new Error(`Invalid asset path ${path}`);
  if (!checked.has(path)) {
    const info = statSync(file);
    if (!info.isFile() || !info.size) throw new Error(`Empty or missing asset ${path}`);
    checked.set(path, info.size);
  }
  return file;
}

function read(path) {
  return JSON.parse(readFileSync(check(path), 'utf8'));
}

try {
  const catalog = read('catalog.json');
  if (catalog.version !== 1) throw new Error('Unsupported catalog version');
  const entries = new Set();
  for (const categories of Object.values(catalog.groups)) {
    for (const category of categories) {
      for (const item of category.items) {
        if (!item.id || entries.has(item.id)) throw new Error(`Duplicate or empty catalog ID ${item.id}`);
        entries.add(item.id);
        check(item.src);
        check(item.thumbnail);
        for (const path of [item.animation, item.rightSrc, item.rightAnimation]) if (path) check(path);
        for (const layer of item.layers ?? []) {
          check(layer.src);
          if (layer.rightSrc) check(layer.rightSrc);
        }
      }
    }
  }

  const ui = read('ui/ui.json');
  for (const group of [ui.buttons, ui.drawingOptions, ui.drawingTools, ui.slideShow]) {
    for (const part of Object.values(group)) {
      for (const file of part.images) check(join('ui', file));
    }
  }
  for (const paper of ui.paperTextures) check(join('ui', paper.image));
  for (const [manifest, folder] of [['ui/trays.json', 'trays'], ['ui/library-trays.json', 'libraries']]) {
    for (const tray of Object.values(read(manifest).trays)) {
      if (tray.image) check(join(dirname(manifest), folder, tray.image));
      for (const page of tray.pages ?? []) {
        check(join(dirname(manifest), folder, page.image));
        for (const option of page.options) check(join(dirname(manifest), folder, option.image));
      }
    }
  }

  const largest = [...checked].reduce((a, b) => a[1] > b[1] ? a : b);
  console.log(`Verified ${entries.size.toLocaleString()} library items and ${checked.size.toLocaleString()} referenced files.`);
  console.log(`Largest referenced asset: ${largest[0]} (${(largest[1] / 1024 ** 2).toFixed(1)} MiB).`);
} catch (error) {
  console.error(`Original assets could not be verified. ${error.message}`);
  console.error('Run npm run import:original with the mounted trial volume.');
  process.exitCode = 1;
}
