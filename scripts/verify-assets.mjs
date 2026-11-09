import { existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
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
  if (ui.paperAnimations) {
    const paper = read('ui/paper-canister.json');
    if (JSON.stringify(paper) !== JSON.stringify(ui.paperAnimations)) throw new Error('Paper animation index differs from embedded UI metadata');
    const ids = new Set([...paper.pageSprites, ...paper.textureSprites]);
    for (const [name, clip] of [['opening', paper], ...Object.entries(paper.states)]) {
      for (const frame of clip.frames) {
        frame.parts.forEach((part, index) => {
          const replaced = name === 'opening' ? [paper.substitutionParts.page, paper.substitutionParts.texture].includes(index) : index === clip.texturePart;
          if (!replaced) ids.add(part.sprite);
        });
      }
      for (const cue of clip.sounds ?? []) check(join('ui', `easel-${cue.sound}.wav`));
    }
    for (const id of ids) {
      if (!paper.sprites[String(id)]) throw new Error(`Missing paper animation sprite ${id}`);
      check(join('ui', paper.sprites[String(id)].image));
    }
  }
  if (ui.undoAnimations) {
    for (const clip of [ui.undoAnimations.idle, ...ui.undoAnimations.clips]) {
      for (const frame of clip.frames) check(join('ui', frame.image));
      for (const cue of clip.sounds) check(join('ui', `easel-${cue.sound}.wav`));
    }
  }
  for (const cursor of Object.values(ui.cursors?.items ?? {})) {
    for (const frame of cursor.frames) check(join('ui', frame.image));
  }
  if (ui.stampEditor) {
    const editor = read('ui/stamp-editor/manifest.json');
    for (const part of [editor.frame, editor.palette]) check(join('ui', part.image));
    for (const button of Object.values(editor.buttons)) {
      for (const state of Object.values(button.states)) check(join('ui', state.image));
    }
    for (const file of Object.values(editor.sounds)) check(join('ui', file));
  }
  for (const clip of Object.values(ui.buttonAnimations?.scripts ?? {})) {
    for (const frame of clip.frames) check(join('ui', frame.image));
    for (const cue of clip.sounds) check(join('ui', `easel-${cue.sound}.wav`));
  }
  if (existsSync(join(original, 'ui/tool-motion/manifest.json'))) {
    const motion = read('ui/tool-motion/manifest.json');
    if (motion.version !== 1 || !motion.trays) throw new Error('Unsupported tool motion index');
    for (const [name, tray] of Object.entries(motion.trays)) {
      let unpacked;
      if (tray.bundle) {
        const packed = readFileSync(check(join('ui', tray.bundle.path)));
        if (createHash('sha256').update(packed).digest('hex') !== tray.bundle.sha256) throw new Error(`Tool motion bundle checksum mismatch: ${name}`);
        if (tray.bundle.compression !== 'gzip' || !Number.isSafeInteger(tray.bundle.byteLength) || tray.bundle.byteLength <= 0) throw new Error(`Invalid tool motion bundle metadata: ${name}`);
        unpacked = gunzipSync(packed, { maxOutputLength: tray.bundle.byteLength });
        if (unpacked.length !== tray.bundle.byteLength) throw new Error(`Tool motion bundle size mismatch: ${name}`);
      }
      for (const [id, sprite] of Object.entries(tray.sprites)) {
        const raw = readFileSync(check(join('ui', sprite.argb)));
        if (!Number.isSafeInteger(sprite.width) || sprite.width <= 0 || !Number.isSafeInteger(sprite.height) || sprite.height <= 0
          || raw.length !== sprite.width * sprite.height * 4 || createHash('sha256').update(raw).digest('hex') !== sprite.argbSha256) {
          throw new Error(`Tool motion raw pixels differ from source metadata: ${name}/${id}`);
        }
        const png = readFileSync(check(join('ui', sprite.image)));
        if (sprite.pngSha256 && createHash('sha256').update(png).digest('hex') !== sprite.pngSha256) throw new Error(`Tool motion PNG checksum mismatch: ${name}/${id}`);
        if (unpacked) for (const [kind, expected] of [['argb', raw], ['png', png]]) {
          const range = sprite.bundleOffsets?.[kind];
          if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] < 0
            || range[1] !== expected.length || range[0] + range[1] > unpacked.length
            || !unpacked.subarray(range[0], range[0] + range[1]).equals(expected)) {
            throw new Error(`Tool motion bundle entry differs from its source file: ${name}/${id}/${kind}`);
          }
        }
      }
      for (const button of tray.buttons) for (const script of [...button.stateScripts, button.rolloverScript]) {
        if (script && !tray.scripts[String(script)]) throw new Error(`Missing tool motion state program: ${name}/${script}`);
      }
      for (const clip of Object.values(tray.scripts)) {
        for (const frame of clip.frames) for (const part of frame.parts) {
          if (!tray.sprites[String(part.sprite)]) throw new Error(`Missing tool motion frame part: ${name}/${part.sprite}`);
        }
        for (const cue of clip.sounds) {
          const sound = tray.sounds[String(cue.sound)];
          if (!sound) throw new Error(`Missing tool motion cue: ${name}/${cue.sound}`);
          check(join('ui', sound.src));
        }
      }
    }
    for (const backdrop of Object.values(motion.backdrops ?? {})) {
      for (const page of backdrop.pages) {
        const bytes = readFileSync(check(join('ui', page.image)));
        if (page.sha256 && createHash('sha256').update(bytes).digest('hex') !== page.sha256) throw new Error(`Tool motion backdrop checksum mismatch: ${page.image}`);
      }
    }
  }
  for (const [manifest, folder] of [['ui/trays.json', 'trays'], ['ui/library-trays.json', 'libraries']]) {
    for (const tray of Object.values(read(manifest).trays)) {
      if (tray.image) check(join(dirname(manifest), folder, tray.image));
      for (const page of tray.pages ?? []) {
        check(join(dirname(manifest), folder, page.image));
        for (const option of page.options) check(join(dirname(manifest), folder, option.image));
      }
    }
  }
  for (const mode of ['spray', 'moving-spray']) {
    const index = read(`tools/${mode}-native.json`);
    let count = 0;
    for (const entry of Object.values(index.banks)) {
      const shard = read(entry.manifest);
      const bank = shard.banks[entry.id];
      if (bank.frames.length !== entry.frameCount) throw new Error(`Incorrect source sprite count for ${mode} ${entry.id}`);
      count += bank.frames.length;
      for (const frame of bank.frames) check(frame.image);
      for (const clip of Object.values(shard.clips)) for (const sound of clip.sounds) check(sound.src);
    }
    if (count !== index.spriteCount) throw new Error(`Incorrect total source sprite count for ${mode}`);
  }

  const largest = [...checked].reduce((a, b) => a[1] > b[1] ? a : b);
  console.log(`Verified ${entries.size.toLocaleString()} library items and ${checked.size.toLocaleString()} referenced files.`);
  console.log(`Largest referenced asset: ${largest[0]} (${(largest[1] / 1024 ** 2).toFixed(1)} MiB).`);
} catch (error) {
  console.error(`Original assets could not be verified. ${error.message}`);
  console.error('Run npm run import:original with the mounted trial volume.');
  process.exitCode = 1;
}
