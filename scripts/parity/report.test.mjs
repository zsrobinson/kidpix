import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { buildReport } from './report.mjs';

test('reports missing native evidence, detects web drift and rejects incompatible baselines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidpix-parity-'));
  const directories = Object.fromEntries(['output', 'references', 'baselines'].map(key => [key, join(root, key)]));
  try {
    await Promise.all(Object.values(directories).map(path => mkdir(path)));
    const image = new PNG({ width: 1024, height: 768 });
    image.data.fill(255);
    const screenshot = PNG.sync.write(image);
    const run = {
      startedAt: '2026-01-01T00:00:00Z', revision: 'test-fixture', dirty: false, testStatus: 'passed',
      environment: { platform: 'test' }, captures: [{ id: 'paint-empty' }],
    };
    await writeFile(join(directories.output, 'paint-empty.png'), screenshot);
    let report = await buildReport(run, directories);
    assert.equal(report.nativeCompared, 0);
    assert.equal(report.results.find(r => r.kind === 'native').status, 'missing-reference');
    assert.equal(report.regressionFailures, 0);

    const metadata = { kind: 'web', source: '<script>untrusted source</script>', capturedAt: run.startedAt, environment: run.environment };
    await writeFile(join(directories.baselines, 'paint-empty.png'), screenshot);
    await writeFile(join(directories.baselines, 'paint-empty.json'), JSON.stringify(metadata));
    image.data.fill(0, (10 * image.width + 10) * 4, (10 * image.width + 10) * 4 + 3);
    await writeFile(join(directories.output, 'paint-empty.png'), PNG.sync.write(image));
    report = await buildReport(run, directories);
    assert.equal(report.regressionFailures, 1);
    assert.equal(report.results.find(r => r.kind === 'web').metrics[0].changed, 1);
    const html = await readFile(join(directories.output, 'index.html'), 'utf8');
    assert.ok(html.includes('&lt;script&gt;untrusted source&lt;/script&gt;'));
    assert.ok(!html.includes('<script>untrusted source</script>'));

    metadata.environment = { platform: 'another-os' };
    await writeFile(join(directories.baselines, 'paint-empty.json'), JSON.stringify(metadata));
    report = await buildReport(run, directories);
    assert.equal(report.regressionFailures, 1);
    assert.match(report.results.find(r => r.kind === 'web').error, /environment differs/);

    // Native comparison is exercised with a synthetic fixture, never installed
    // as a claimed original-application reference in the project.
    await writeFile(join(directories.references, 'paint-empty.png'), PNG.sync.write(image));
    await writeFile(join(directories.references, 'paint-empty.json'), JSON.stringify({ kind: 'native', source: 'Synthetic test fixture', capturedAt: run.startedAt }));
    report = await buildReport(run, directories);
    assert.equal(report.nativeCompared, 1);
    assert.equal(report.results.find(r => r.kind === 'native').metrics[0].changed, 0);
    report = await buildReport({ ...run, captures: [] }, directories);
    assert.equal(report.nativeCompared, 0);
    assert.equal(report.regressionFailures, 0);
    assert.equal(report.results.find(r => r.kind === 'native').status, 'missing-capture');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
