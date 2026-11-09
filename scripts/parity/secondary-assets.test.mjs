import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = join(root, 'public/original/ui/secondary-motion/manifest.json');

test('asset verification rejects corrupted source audio without touching imported originals', {
  skip: !existsSync(manifest) && 'Secondary source assets are not imported',
}, () => {
  const sound = Object.values(JSON.parse(readFileSync(manifest)).sounds)[0];
  const relative = ['ui', ...sound.src.split('/')];
  const temporary = mkdtempSync(join(tmpdir(), 'kidpix-secondary-assets-'));
  try {
    const scripts = join(temporary, 'scripts');
    mkdirSync(scripts);
    copyFileSync(join(root, 'scripts/verify-assets.mjs'), join(scripts, 'verify-assets.mjs'));
    // Mirror only ancestors of one WAV; every other entry points to untouched
    // source data. The verifier still traverses its real manifest and all assets.
    function mirror(source, destination, remaining) {
      mkdirSync(destination, { recursive: true });
      for (const entry of readdirSync(source)) {
        const from = join(source, entry), to = join(destination, entry);
        if (entry !== remaining[0]) symlinkSync(from, to);
        else if (remaining.length > 1) mirror(from, to, remaining.slice(1));
        else copyFileSync(from, to);
      }
    }
    mirror(join(root, 'public/original'), join(temporary, 'public/original'), relative);
    const verify = () => spawnSync(process.execPath, [join(scripts, 'verify-assets.mjs')], { encoding: 'utf8' });
    const healthy = verify();
    assert.equal(healthy.status, 0, healthy.stderr);
    const wav = join(temporary, 'public/original', ...relative);
    const bytes = readFileSync(wav);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(wav, bytes);
    const corrupted = verify();
    assert.equal(corrupted.status, 1);
    assert.match(corrupted.stderr, /Secondary motion checksum mismatch: .*\.wav/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
