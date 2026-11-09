#!/usr/bin/env node
// Portable, dependency-free transfer: a sanitized shallow checkout and optional media.
import { constants, createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const mediaRoots = new Set(['guide', 'ui', 'stamps', 'stickers', 'tools', 'frames', 'sounds', 'backgrounds', 'movies', 'catalog.json', 'ideas', 'toons']);
const mediaExtensions = /\.(?:json|png|jpg|jpeg|svg|webp|gif|flac|mp3|mp4|wav|ogg|webm|argb|bin|qfx|gz|woff2?|ttf|otf)$/i;
const usage = `Usage (Node 22.12+ and Git):
  node scripts/prepare-handoff.mjs create /absolute/new-package [--include-media]
  node scripts/prepare-handoff.mjs inventory-media /absolute/new-inventory.json
  node scripts/prepare-handoff.mjs verify-media /absolute/inventory.json
  node /path/package/prepare-handoff.mjs verify /path/package
  node /path/package/prepare-handoff.mjs restore /path/package /absolute/new-checkout
Run create/inventory-media/verify-media from the repository root. Outputs must be
outside that checkout and must not exist. No build, upload, credentials or DMG needed.`;

function git(root, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function validPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\:\x00-\x1f\x7f]/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe relative path: ${path}`);
  return path;
}

function sourcePath(path) {
  validPath(path);
  const parts = path.split('/');
  if (parts.some(part => /^(?:\.env.*|\.dev\.vars.*|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|credentials?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/i.test(part))
    || /\.(?:pem|key|p12|pfx)$/i.test(path)
    || /^(?:artifacts|node_modules|dist|dist-cloudflare|\.git)(?:\/|$)/.test(path)
    || path.startsWith('public/original/')) throw new Error(`Forbidden source path: ${path}`);
}

function mediaPath(path) {
  validPath(path);
  const short = path.replace(/^public\/original\//, '');
  if (short === path || !mediaRoots.has(short.split('/')[0]) || short.split('/').some(part => part.startsWith('.')) || !mediaExtensions.test(short)) {
    throw new Error(`Unexpected media file (review before transferring): ${path}`);
  }
  sourcePath(short);
}

async function walk(root, { media = false } = {}, prefix = '') {
  const files = [];
  if (!(await lstat(root)).isDirectory()) throw new Error(`Expected a real directory: ${root}`);
  for (const entry of (await readdir(root)).sort()) {
    if (media && (entry === '.DS_Store' || entry.startsWith('._'))) continue;
    const path = validPath(prefix + entry);
    const info = await lstat(resolve(root, entry));
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not transferable: ${path}`);
    if (info.isDirectory()) files.push(...await walk(resolve(root, entry), { media }, path + '/'));
    else if (info.isFile()) files.push({ path, executable: Boolean(info.mode & 0o111) });
    else throw new Error(`Unsupported file type: ${path}`);
  }
  return files;
}

async function digest(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function inventory(root, options) {
  const files = [];
  for (const entry of await walk(root, options)) files.push({ ...entry, ...await digest(resolve(root, entry.path)) });
  return files;
}

function sameFiles(expected, actual) {
  if (expected.length !== actual.length) throw new Error(`File count differs: expected ${expected.length}, found ${actual.length}`);
  const byPath = new Map(actual.map(file => [file.path, file]));
  const seen = new Set();
  for (const file of expected) {
    validPath(file.path);
    const other = byPath.get(file.path);
    if (seen.has(file.path) || !other || file.bytes !== other.bytes || file.sha256 !== other.sha256 || file.executable !== other.executable) {
      throw new Error(`Inventory mismatch: ${file.path}`);
    }
    seen.add(file.path);
  }
}

async function repository() {
  const root = await realpath(process.cwd());
  if (await realpath(git(root, 'rev-parse', '--show-toplevel').trim()) !== root) throw new Error('Run from the repository root.');
  return root;
}

function clean(root, revision) {
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all').trim()) throw new Error('Source is dirty (including untracked files). Commit the finalized release first.');
  if (revision && git(root, 'rev-parse', 'HEAD').trim() !== revision) throw new Error('Source HEAD changed during packaging.');
}

async function outputPath(path, root) {
  if (!isAbsolute(path)) throw new Error('Use an absolute output/destination path.');
  const target = resolve(path);
  const output = resolve(await realpath(dirname(target)), basename(target));
  if (root) {
    const inside = relative(root, output);
    if (!inside || inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside)) throw new Error('Output must be outside the source checkout.');
  }
  return output;
}

async function copyFiles(from, to, files) {
  for (const file of files) {
    validPath(file.path);
    const target = resolve(to, file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(from, file.path), target, constants.COPYFILE_EXCL);
    await chmod(target, file.executable ? 0o755 : 0o644);
  }
}

async function mediaInventory(root) {
  const original = resolve(root, 'public/original');
  const files = (await inventory(original, { media: true })).map(file => ({ ...file, path: 'public/original/' + file.path }));
  for (const file of files) mediaPath(file.path);
  for (const path of ['catalog.json', 'ui/ui.json', 'ui/trays.json', 'ui/library-trays.json']) {
    if (!files.some(file => file.path === 'public/original/' + path)) throw new Error(`Incomplete library: missing ${path}`);
  }
  return files;
}

async function create(root, output, includeMedia) {
  clean(root);
  const revision = git(root, 'rev-parse', 'HEAD').trim();
  for (const entry of git(root, 'ls-tree', '-r', '-z', 'HEAD').split('\0').filter(Boolean)) {
    const [header, path] = entry.split('\t');
    if (!/^100(?:644|755) blob /.test(header)) throw new Error(`Unsupported tracked entry: ${path}`);
    sourcePath(path);
  }
  const media = includeMedia ? await mediaInventory(root) : [];
  await mkdir(output); // Exclusive: even an existing empty directory is refused.
  try {
    const source = resolve(output, 'source');
    // File transport forces shallow object transfer rather than local hardlinks/history.
    git(root, 'clone', '--quiet', '--no-local', '--depth=1', '--single-branch', '--no-tags', '--template=', pathToFileURL(root).href, source);
    if (git(source, 'rev-parse', 'HEAD').trim() !== revision) throw new Error('Clone does not match the selected source revision.');
    const dotGit = resolve(source, '.git');
    // Keep only newly generated checkout metadata/objects; discard remote URLs,
    // reflogs, templates, hooks and config. No host .git directory is copied.
    for (const entry of await readdir(dotGit)) {
      if (!['objects', 'index', 'shallow'].includes(entry)) await rm(resolve(dotGit, entry), { recursive: true, force: true });
    }
    await mkdir(resolve(dotGit, 'refs/heads'), { recursive: true });
    await writeFile(resolve(dotGit, 'refs/heads/handoff'), revision + '\n');
    await writeFile(resolve(dotGit, 'HEAD'), 'ref: refs/heads/handoff\n');
    await writeFile(resolve(dotGit, 'config'), '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tfilemode = true\n\tlogallrefupdates = false\n');
    if (includeMedia) await copyFiles(root, resolve(output, 'media'), media);
    await copyFile(self, resolve(output, 'prepare-handoff.mjs'), constants.COPYFILE_EXCL);
    const files = await inventory(output);
    if (includeMedia) {
      sameFiles(media, files.filter(file => file.path.startsWith('media/')).map(file => ({ ...file, path: file.path.slice(6) })));
      sameFiles(media, await mediaInventory(root));
    }
    clean(root, revision);
    clean(source, revision);
    const { version } = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
    await writeFile(resolve(output, 'handoff.json'), JSON.stringify({
      format: 'kidpix-handoff-v1', revision, version, mediaIncluded: includeMedia, files,
    }, null, 2) + '\n', { flag: 'wx' });
    await verify(output);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function verify(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'handoff.json'), 'utf8'));
  if (manifest.format !== 'kidpix-handoff-v1' || !/^[a-f0-9]{40}$/.test(manifest.revision) || typeof manifest.mediaIncluded !== 'boolean' || !Array.isArray(manifest.files)) throw new Error('Invalid handoff manifest.');
  for (const file of manifest.files) {
    validPath(file.path);
    if (file.path.startsWith('source/.git/')) {
      if (!/^source\/\.git\/(?:HEAD|config|index|shallow|refs\/heads\/handoff|objects\/(?:[a-f0-9]{2}\/[a-f0-9]{38}|pack\/pack-[a-f0-9]{40}\.(?:pack|idx|rev)))$/.test(file.path)) throw new Error(`Unexpected Git metadata: ${file.path}`);
    } else if (file.path.startsWith('source/')) sourcePath(file.path.slice(7));
    else if (file.path.startsWith('media/') && manifest.mediaIncluded) mediaPath(file.path.slice(6));
    else if (file.path !== 'prepare-handoff.mjs') throw new Error(`Unexpected package entry: ${file.path}`);
  }
  sameFiles(manifest.files, (await inventory(root)).filter(file => file.path !== 'handoff.json'));
  const source = resolve(root, 'source');
  clean(source, manifest.revision);
  if (git(source, 'remote').trim()) throw new Error('Package must not carry Git remotes.');
  if (JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')).version !== manifest.version) throw new Error('Package version differs.');
  return manifest;
}

async function main() {
  const [command, path, extra, ...rest] = process.argv.slice(2);
  if (command === '--help' || command === '-h') return console.log(usage);
  if (!path || rest.length) throw new Error(usage);
  if (command === 'create' && (!extra || extra === '--include-media')) {
    const root = await repository();
    await create(root, await outputPath(path, root), extra === '--include-media');
    console.log(`Verified handoff: ${path}`);
  } else if (['inventory-media', 'verify-media'].includes(command) && !extra) {
    const root = await repository();
    const files = await mediaInventory(root);
    if (command === 'inventory-media') await writeFile(await outputPath(path, root), JSON.stringify({ format: 'kidpix-media-inventory-v1', files }, null, 2) + '\n', { flag: 'wx' });
    else {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      if (manifest.format !== 'kidpix-media-inventory-v1' || !Array.isArray(manifest.files)) throw new Error('Invalid media inventory.');
      sameFiles(manifest.files, files);
    }
    console.log(`Verified ${files.length} media files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes.`);
  } else if (command === 'verify' && !extra) {
    const manifest = await verify(resolve(path));
    console.log(`Verified ${manifest.revision}, version ${manifest.version}, ${manifest.files.length} files; media ${manifest.mediaIncluded ? 'included' : 'excluded'}.`);
  } else if (command === 'restore' && extra) {
    const root = await realpath(path);
    const manifest = await verify(root);
    const destination = await outputPath(extra, root);
    await mkdir(destination);
    try {
      await copyFiles(resolve(root, 'source'), destination, manifest.files.filter(file => file.path.startsWith('source/')).map(file => ({ ...file, path: file.path.slice(7) })));
      await copyFiles(resolve(root, 'media'), destination, manifest.files.filter(file => file.path.startsWith('media/')).map(file => ({ ...file, path: file.path.slice(6) })));
      const expected = manifest.files.filter(file => /^(?:source|media)\//.test(file.path)).map(file => ({ ...file, path: file.path.replace(/^(?:source|media)\//, '') }));
      sameFiles(expected, await inventory(destination));
      clean(destination, manifest.revision);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
    console.log(`Restored ${manifest.revision} to ${destination} (shallow handoff branch; no remote or credentials).`);
  } else throw new Error(usage);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
