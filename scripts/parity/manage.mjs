import { readFile, writeFile, copyFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { cropImage, frame } from './images.mjs';
import { output, references, baselines } from './report.mjs';
import { scenarios } from '../../tests/browser/scenarios.js';

const [action, ...args] = process.argv.slice(2);
try {
  if (action === 'baseline') {
    const run = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
    if (run.testStatus !== 'passed' || run.captures.length !== scenarios.length) throw new Error('Run all browser tests successfully before accepting web baselines.');
    await mkdir(baselines, { recursive: true });
    for (const scenario of scenarios) {
      await copyFile(join(output, `${scenario.id}.png`), join(baselines, `${scenario.id}.png`));
      await writeFile(join(baselines, `${scenario.id}.json`), JSON.stringify({
        kind: 'web', source: `Accepted web capture at ${run.revision}${run.dirty ? ' (uncommitted changes)' : ''}`,
        capturedAt: run.startedAt, environment: run.environment,
      }, null, 2) + '\n');
    }
    console.log(`Accepted ${scenarios.length} web baselines. Original-application references were not changed.`);
  } else if (action === 'reference') {
    const [id, path, ...flags] = args;
    if (!scenarios.some(s => s.id === id) || !path) throw new Error('Usage: npm run parity:reference -- SCENARIO /path/to/native.png --source "app version, OS, capture details" [--crop x,y,1024,768] [--replace]');
    const values = {};
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--replace') values.replace = true;
      else if (['--source', '--crop'].includes(flag) && flags[i + 1] && !flags[i + 1].startsWith('--')) values[flag.slice(2)] = flags[++i];
      else throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    if (!values.source?.trim()) throw new Error('--source is required to record the original app version, operating system and capture details.');
    let image = PNG.sync.read(await readFile(path));
    const originalSize = { width: image.width, height: image.height };
    if (values.crop) {
      const parts = values.crop.split(',').map(Number);
      if (parts.length !== 4) throw new Error('--crop requires x,y,width,height');
      image = cropImage(image, Object.fromEntries(['x', 'y', 'width', 'height'].map((key, index) => [key, parts[index]])));
    }
    if (image.width !== frame.width || image.height !== frame.height) throw new Error('Reference must be the exact 1024×768 application frame. Use --crop to remove OS chrome. Images are never resized.');
    await mkdir(references, { recursive: true });
    const target = join(references, `${id}.png`);
    if (!values.replace) {
      try { await access(target); throw new Error('Reference already exists; use --replace to overwrite it deliberately.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await writeFile(target, PNG.sync.write(image));
    await writeFile(join(references, `${id}.json`), JSON.stringify({
      kind: 'native', source: values.source, capturedAt: new Date().toISOString(),
      sourceFile: path, originalSize, crop: values.crop || null, recipe: scenarios.find(s => s.id === id).steps,
    }, null, 2) + '\n');
    console.log(`Imported native reference ${target}. Rerun npm run parity to compare it.`);
  } else {
    throw new Error('Use baseline or reference. See docs/parity.md.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
