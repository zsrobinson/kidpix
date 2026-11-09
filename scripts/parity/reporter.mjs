import { rm, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { release } from 'node:os';
import { buildReport, output } from './report.mjs';
import { scenarios } from '../../tests/browser/scenarios.js';

export default class ParityReporter {
  async onBegin() {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    const browser = await chromium.launch();
    this.run = {
      startedAt: new Date().toISOString(),
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
      environment: { platform: process.platform, osRelease: release(), architecture: process.arch, browser: browser.version() },
      captures: [],
    };
    await browser.close();
  }

  async onTestEnd(test, result) {
    if (result.status !== 'passed') return;
    for (const attachment of result.attachments) {
      const id = attachment.name.replace(/^parity:/, '');
      if (!attachment.name.startsWith('parity:') || !scenarios.some(s => s.id === id)) continue;
      await copyFile(attachment.path, join(output, `${id}.png`));
      this.run.captures.push({ id, test: test.title, capturedAt: new Date().toISOString() });
    }
  }

  async onEnd(result) {
    if (!this.run) return { status: 'failed' };
    this.run.testStatus = result.status;
    const report = await buildReport(this.run);
    console.log(`\nParity report: ${output}/index.html`);
    console.log(`Native comparisons: ${report.nativeCompared}/${scenarios.length}; web regression failures: ${report.regressionFailures}.`);
    if (report.regressionFailures || report.comparisonErrors) return { status: 'failed' };
  }
}
