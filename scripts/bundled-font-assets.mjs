import { readFile, readdir, lstat, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import catalog from '../src/bundled-font-catalog.json' with { type: 'json' };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateFontCatalog(value) {
  if (JSON.stringify(value) !== JSON.stringify(catalog)) throw new Error('Font catalog differs from pinned source catalog');
  const { faces } = value;
  const descriptors = new Set(faces.map(f => `${f.cssFamily}/${f.cssWeight}/${f.cssStyle}`));
  if (faces.length !== 28 || descriptors.size !== 28 || new Set(faces.map(f => f.family)).size !== 25 || faces.reduce((n, f) => n + f.bytes, 0) !== 1630980 || faces.filter(f => f.family === 'Schoolhouse').length !== 4) throw new Error('Invalid font inventory');
  for (const face of faces) {
    if (!/^original\/fonts\/[A-Za-z0-9_-]+\.ttf$/.test(face.key) || !/^sfnt\/[A-Za-z0-9_-]+\.ttf$/.test(face.source) || /Tabloid|Chalkboard/i.test(JSON.stringify(face)) || !/^[a-f0-9]{64}$/.test(face.sha256)) throw new Error('Invalid font descriptor');
  }
  return value;
}
async function contained(root, key) {
  const path = resolve(root, key);
  const name = relative(resolve(root), path);
  if (name.startsWith(`..${sep}`) || name === '..') throw new Error('Path escape');
  // Reject links in every component, including the explicit root.
  let current = path;
  for (;;) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Symbolic link in font path');
    if (current === dirname(current)) break;
    current = dirname(current);
  }
  if (await realpath(path) !== path) throw new Error('Noncanonical font path');
  return path;
}
async function checked(root, key, face) {
  const path = await contained(root, key);
  const bytes = await readFile(path);
  if (bytes.length !== face.bytes || hash(bytes) !== face.sha256) throw new Error(`Font integrity mismatch: ${key}`);
  return bytes;
}
export async function verifyFontStage(outputRoot) {
  validateFontCatalog(catalog);
  const directory = await contained(outputRoot, 'original/fonts');
  const expected = [...catalog.faces.map(f => f.key.split('/').pop()), 'catalog.json'].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) throw new Error('Extra or missing font files');
  const catalogBytes = await readFile(await contained(outputRoot, 'original/fonts/catalog.json'));
  validateFontCatalog(JSON.parse(catalogBytes));
  if (!catalogBytes.equals(Buffer.from(JSON.stringify(catalog, null, 2) + '\n'))) throw new Error('Noncanonical media catalog');
  const files = [];
  for (const face of catalog.faces) {
    const bytes = await checked(outputRoot, face.key, face);
    files.push({ key: face.key, bytes: bytes.length, sha256: hash(bytes) });
  }
  files.push({ key: 'original/fonts/catalog.json', bytes: catalogBytes.length, sha256: hash(catalogBytes) });
  return { version: 1, faces: 28, families: 25, payloadBytes: 1630980, files };
}
export async function stageFonts(sourceRoot, outputRoot) {
  validateFontCatalog(catalog);
  // Validate all inputs before creating the output. An existing output is never overwritten.
  const payloads = await Promise.all(catalog.faces.map(face => checked(sourceRoot, face.source, face)));
  await contained(dirname(resolve(outputRoot)), '.');
  await mkdir(resolve(outputRoot));
  await mkdir(join(outputRoot, 'original/fonts'), { recursive: true });
  for (const [i, face] of catalog.faces.entries()) await writeFile(join(outputRoot, face.key), payloads[i], { flag: 'wx' });
  await writeFile(join(outputRoot, 'original/fonts/catalog.json'), JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' });
  const receipt = await verifyFontStage(outputRoot);
  await writeFile(join(outputRoot, 'font-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, first, second, ...extra] = process.argv.slice(2);
  if (extra.length || !first || (mode === 'stage' ? !second : mode !== 'verify' || second)) throw new Error('Usage: bundled-font-assets.mjs stage SOURCE_ROOT OUTPUT_ROOT | verify OUTPUT_ROOT');
  console.log(JSON.stringify(await (mode === 'stage' ? stageFonts(first, second) : verifyFontStage(first)), null, 2));
}
