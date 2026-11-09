import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('./manage.mjs', import.meta.url));

test('native import preserves crop pixels and protects an existing reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidpix-reference-'));
  try {
    const image = new PNG({ width: 1040, height: 800 });
    image.data.fill(255);
    image.data[(10 * image.width + 8) * 4] = 17;
    const input = join(root, 'synthetic-desktop.png');
    await writeFile(input, PNG.sync.write(image));
    const args = ['reference', 'paint-empty', input, '--source', 'Synthetic test fixture'];
    await assert.rejects(exec(process.execPath, [script, ...args], { cwd: root }), /exact 1024×768/);
    await exec(process.execPath, [script, ...args, '--crop', '8,10,1024,768'], { cwd: root });
    const target = join(root, 'parity/references/paint-empty.png');
    const original = await readFile(target);
    assert.equal(PNG.sync.read(original).data[0], 17);
    const metadata = JSON.parse(await readFile(join(root, 'parity/references/paint-empty.json'), 'utf8'));
    assert.equal(metadata.kind, 'native');
    assert.equal(metadata.source, 'Synthetic test fixture');
    await assert.rejects(exec(process.execPath, [script, ...args, '--crop', '8,10,1024,768'], { cwd: root }), /already exists/);
    assert.deepEqual(await readFile(target), original);
    await exec(process.execPath, [script, ...args, '--crop', '8,10,1024,768', '--replace'], { cwd: root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
