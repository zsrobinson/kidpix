import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { compareImages, pixelThreshold } from './images.mjs';
import { scenarios } from '../../tests/browser/scenarios.js';

export const output = 'artifacts/parity';
export const references = 'parity/references';
export const baselines = 'parity/web-baselines';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function optionalFile(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function buildReport(run, directories = {}) {
  const output = directories.output ?? 'artifacts/parity';
  const references = directories.references ?? 'parity/references';
  const baselines = directories.baselines ?? 'parity/web-baselines';
  await mkdir(output, { recursive: true });
  let regressionFailures = 0;
  let comparisonErrors = 0;
  // Embed each unique image once; overlay, pair and capture views reuse it.
  const images = {};
  const imageSource = buffer => {
    const id = createHash('sha256').update(buffer).digest('hex');
    images[id] ??= `data:image/png;base64,${buffer.toString('base64')}`;
    return `data-image="${id}"`;
  };
  const sections = [];
  const results = [];
  for (const scenario of scenarios) {
    const captured = run.captures.find(capture => capture.id === scenario.id);
    const comparisons = [];
    let web;
    if (captured) web = await readFile(join(output, `${scenario.id}.png`));
    for (const [kind, directory] of [['native', references], ['web', baselines]]) {
      const label = kind === 'native' ? 'Original application' : 'Accepted web baseline';
      const reference = await optionalFile(join(directory, `${scenario.id}.png`));
      if (!reference) {
        comparisons.push(`<p>${label}: <strong>no reference captured</strong>.</p>`);
        results.push({ id: scenario.id, kind, status: 'missing-reference' });
        continue;
      }
      if (!web) {
        comparisons.push(`<p>${label}: comparison skipped; no successful web capture in this run.</p>`);
        results.push({ id: scenario.id, kind, status: 'missing-capture' });
        continue;
      }
      try {
        const metadata = JSON.parse(await readFile(join(directory, `${scenario.id}.json`), 'utf8'));
        if (metadata.kind !== kind) throw new Error(`Reference metadata must have kind ${kind}.`);
        if (kind === 'web' && JSON.stringify(metadata.environment) !== JSON.stringify(run.environment)) {
          throw new Error('Web baseline environment differs (OS, architecture or browser version). Rerun in the original environment or explicitly accept new web baselines.');
        }
        const { diff, metrics } = compareImages(PNG.sync.read(web), PNG.sync.read(reference), !['slide-show', 'stamp-editor'].includes(scenario.id));
        const different = metrics[0].changed > 0;
        if (kind === 'web' && different) regressionFailures++;
        const diffBuffer = PNG.sync.write(diff);
        await writeFile(join(output, `${scenario.id}-${kind}-diff.png`), diffBuffer);
        const result = { id: scenario.id, kind, status: different ? 'different' : 'matching', metrics, metadata };
        results.push(result);
        comparisons.push(`<div class="comparison"><h3>${label}</h3><p>${escape(metadata.source)} · ${escape(metadata.capturedAt)}</p>
          <div class="pair"><figure><img ${imageSource(reference)} alt="${label}"><figcaption>Reference</figcaption></figure><figure><img ${imageSource(web)} alt="Current web capture"><figcaption>Current web</figcaption></figure></div>
          <label>Overlay: reference → web <input type="range" min="0" max="1" step="0.01" value="0.5" oninput="this.parentElement.nextElementSibling.lastElementChild.style.opacity=this.value"></label>
          <div class="overlay"><img ${imageSource(reference)} alt="Reference beneath overlay"><img ${imageSource(web)} style="opacity:.5" alt="Web overlay"></div>
          <details><summary>Difference mask (red pixels)</summary><div class="diff"><img ${imageSource(diffBuffer)} alt="Pixel difference mask"></div></details>
          <ul>${metrics.map(m => `<li>${m.name}: ${m.changed.toLocaleString()} / ${m.total.toLocaleString()} pixels differ (${m.percent.toFixed(3)}%)<meter min="0" max="100" value="${m.percent}"></meter></li>`).join('')}</ul></div>`);
      } catch (error) {
        comparisonErrors++;
        if (kind === 'web') regressionFailures++;
        results.push({ id: scenario.id, kind, status: 'invalid-comparison', error: error.message });
        comparisons.push(`<p class="error">${label}: ${escape(error.message)}</p>`);
      }
    }
    sections.push(`<section><h2>${escape(scenario.title)}</h2><p>${escape(scenario.steps)}</p>${web ? `<details open><summary>Web capture</summary><img class="capture" ${imageSource(web)} alt="${escape(scenario.title)}"></details>` : '<p class="error">No successful capture in this run.</p>'}${comparisons.join('')}</section>`);
  }
  const nativeCompared = results.filter(r => r.kind === 'native' && r.metrics).length;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kid Pix local parity report</title>
    <style>body{font:16px/1.5 system-ui,sans-serif;background:#151923;color:#e8edf5;margin:0 auto;padding:24px;max-width:1200px}h1,h2,h3{line-height:1.2}section{border-top:1px solid #596174;margin-top:32px;padding-top:16px}img{display:block;width:100%;height:auto;image-rendering:auto}.capture{max-width:1024px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}figcaption{color:#b4bfd1}.overlay{position:relative;max-width:1024px}.overlay img+img{position:absolute;inset:0}.diff{background:white;max-width:1024px}input{width:200px;vertical-align:middle}meter{display:block;width:260px;height:14px}details{margin:12px 0}summary{cursor:pointer}.error{color:#ffb3ae}code{color:#c7daff}.comparison{margin:24px 0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>
    <h1>Kid Pix local parity report</h1><p>${escape(run.startedAt)} · ${escape(run.revision)}${run.dirty ? ' (uncommitted changes)' : ''}</p>
    <p>Browser checks: <strong>${escape(run.testStatus)}</strong>. Native references compared: <strong>${nativeCompared}/${scenarios.length}</strong>. Web regression failures: <strong>${regressionFailures}</strong>. Comparison errors: <strong>${comparisonErrors}</strong>.</p>
    <p>Pixel differences describe these captured states, not overall feature parity. Drawing area and controls are counted separately so a blank page does not hide differences in the interface. Threshold ${pixelThreshold}; anti-alias differences excluded. Native differences are informational; accepted web baseline differences fail the run.</p>
    <p>Environment: ${escape(JSON.stringify(run.environment))}. Pointer moved to the bottom-right corner; screenshots at 1024×768, device scale 1. Random seed fixed for web repeatability; this does not match the original's random effects.</p>
    ${sections.join('')}<script>const images=${JSON.stringify(images)};for(const image of document.querySelectorAll('img[data-image]'))image.src=images[image.dataset.image];</script></html>`;
  const summary = { ...run, nativeCompared, regressionFailures, comparisonErrors, results };
  await writeFile(join(output, 'index.html'), html);
  await writeFile(join(output, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}
