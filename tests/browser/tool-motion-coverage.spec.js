import { installPaletteClockAudio, openClockPalette, closeClockPalette } from './palette-clock.js';
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { gunzipSync } from 'node:zlib';

// Independent installer oracles, decoded from Tp.MHK by source-audit.py.
// No application controller/renderer is imported. See docs/audits/tool-motion-coverage.md.
const trays = {
  draw: { table: 18400, tools: ['pencil', 'chalk', 'crayon', 'marker'], scripts: [18060, 18063, 18066, 18069] },
  paint: { table: 18000, tools: ['brush', 'sound', 'spray'], scripts: [18072, 18075, 18078] },
  bucket: { table: 18300, tools: ['bucket', 'gradient', 'pattern'], scripts: [18081, 18084, 18087] },
  mixer: { table: 18600, tools: ['mega', 'wand'], scripts: [18090, 18093] },
  grab: { table: 926, tools: ['scissors', 'grab'], scripts: [18131, 18128] },
  eraser: { table: 18500, tools: ['big', 'round'], scripts: [18137, 18134] },
};
const digest = value => createHash('sha256').update(value).digest('hex');
const action = (page, value) => page.locator(`[data-action="${value}"]`);
const actor = (page, tray) => page.locator(`canvas[data-native-tool-motion="${tray}"]`);
const allActors = page => page.locator('canvas[data-native-tool-motion]:visible');
const snap = (page, tray) => actor(page, tray).evaluate(node => JSON.parse(node.dataset.motionSnapshot));
const item = async (page, tray, index) => (await snap(page, tray))[index];
const point = async (page, x, y) => {
  const box = await page.locator('#studio').boundingBox();
  return [box.x + x * box.width / 1024, box.y + y * box.height / 768];
};
const moveOutside = async page => page.mouse.move(...await point(page, 1020, 765));

async function install(page, { heldAudio = false } = {}) {
  await installPaletteClockAudio(page);
  page.motionErrors = [];
  page.on('pageerror', error => page.motionErrors.push(error.message));
  await page.addInitScript(({ heldAudio }) => {
    const RealAudio = window.Audio;
    window.toolSounds = [];
    window.holdToolAudio = heldAudio;
    window.Audio = class extends EventTarget {
      constructor(src) {
        super();
        if (!/\/(?:tool-motion|drawing-motion)\/.+\.wav(?:\?|$)/.test(String(src))) return new RealAudio(src);
        this.src = String(src); this.currentTime = 0; this.paused = true;
        this.ended = false; this.plays = 0; this.stops = 0;
        window.toolSounds.push(this);
      }
      play() {
        this.paused = false; this.ended = false; this.plays++;
        if (!window.holdToolAudio) queueMicrotask(() => { this.ended = true; this.dispatchEvent(new Event('ended')); });
        return Promise.resolve();
      }
      pause() { this.paused = true; this.stops++; }
    };
  }, { heldAudio });
  await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:(?:4193|4194)/, socket => socket.close());
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready', 'ready');
  const response = await page.request.get('/original/ui/tool-motion/manifest.json');
  expect(response.ok(), 'Shared tool-motion manifest must be exported').toBe(true);
  page.toolManifest = await response.json();
  await moveOutside(page);
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
}
async function openTray(page, tray) {
  await action(page, `tray:${tray}`).click();
  await moveOutside(page);
  expect(page.toolManifest.trays[tray], `Missing integration data for ${tray}`).toBeTruthy();
  await expect(actor(page, tray), `Missing actual studio actor for ${tray}`).toBeVisible();
  await expect(allActors(page)).toHaveCount(1);
  const value = await snap(page, tray);
  expect(value).toHaveLength(trays[tray].tools.length);
  return page.toolManifest.trays[tray];
}
async function advance(page, tray, index, script, frameIndex) {
  // RAF runs once per delivered eligible source update; do not fast-forward
  // one big interval (the native scheduler explicitly drops missed updates).
  for (let n = 0; n < 10; n++) {
    const state = await item(page, tray, index);
    if (state.script !== script || state.frameIndex >= frameIndex) break;
    await page.clock.runFor(16);
  }
  expect(await item(page, tray, index)).toMatchObject({ script, frameIndex });
}
async function terminal(page, tray, index, script) {
  const count = sourceScripts[script].groups;
  for (let frame = 0; frame < count; frame++) {
    await advance(page, tray, index, script, frame);
    await expectPixels(page, tray, { composite: tray === 'grab' });
    if (frame + 1 < count) await page.clock.runFor(96);
  }
  // Some auxiliary scripts retain their last picture through additional
  // yielding waits (Bucket18086/18089 end at tick7 after five pictures).
  for (let tick = count; tick < sourceScripts[script].endCheckTick; tick++) {
    await page.clock.runFor(112);
    expect(await item(page, tray, index)).toMatchObject({ script, frameIndex: count - 1, finished: false });
    await expectPixels(page, tray, { composite: tray === 'grab' });
  }
  return await item(page, tray, index);
}

function assertSource(manifest, tray) {
  expect(manifest.table).toBe(trays[tray].table);
  if (tray === 'grab') {
    expect(manifest.renderMode).toBe('mode9'); // Proven callback, ordinary one-part branch.
    expect(manifest.evidence.callbackRows).toEqual([0, 1]);
    expect(manifest.buttons[1].hotspotKind).toBe(1);
    expect(manifest.buttons[1].region.boundsSelection).toBe('rollover-initial-group');
    expect(manifest.buttons[1].region.initialScriptBounds.map(value => value.boundsLTRB))
      .toEqual([[130, 623, 272, 763], [130, 623, 272, 763], [149, 643, 258, 755]]);
    expect(manifest.buttons[0].hotspotResource).toBe(1926);
  }
  for (const [index, rest] of trays[tray].scripts.entries()) {
    const button = manifest.buttons[index];
    expect(button.name).toBe(trays[tray].tools[index]);
    expect(button.rawWords).toEqual(sourceButtons[tray][index]);
    expect(button.mode).toBe(2);
    expect(button.stateScripts).toEqual([rest, rest + 1, 0, rest + 1]);
    expect(button.rolloverScript).toBe(rest + 2);
    expect(button.rolloverParameters).toEqual([0, 0, 0]);
    expect(button.region.boundsXYWH).toEqual(sourceRegions[rest]);
    expect(button.auxiliaryClipRect).toEqual(sourceRegions[rest]);
    for (const script of [rest, rest + 1, rest + 2]) {
      const clip = manifest.scripts[script], oracle = sourceScripts[script];
      expect(clip.sourceSha256, `${script} original program`).toBe(oracle.sha256);
      // Property order is canonicalized independently of exporter object layout.
      const frames = clip.frames.map(frame => ({ tick: frame.tick, parts: frame.parts.map(part => ({
        sprite: part.sprite, rawImage: part.rawImage, sourceXY: part.sourceXY,
        registrationXY: part.registrationXY, x: part.x, y: part.y,
      })) }));
      expect(digest(JSON.stringify(frames)), `${script} every registered pose`).toBe(oracle.framesSha256);
      expect([clip.frames.length, clip.tickMs, clip.endCheckTick]).toEqual([oracle.groups, 100, oracle.endCheckTick]);
      expect(clip.sounds).toEqual(oracle.sounds);
    }
  }
}

test('all six primary tables and 48 programs retain installer assignments, registrations and cue ticks', async ({ page }) => {
  await install(page);
  for (const tray of Object.keys(trays)) {
    expect(page.toolManifest.trays[tray], `Exporter has not supplied ${tray}`).toBeTruthy();
    assertSource(page.toolManifest.trays[tray], tray);
  }
});

for (const [tray, spec] of Object.entries(trays)) for (const [index, tool] of spec.tools.entries()) {
  test(`${tray}/${tool}: every rest, tracking and hover pose; selection, terminal hold, drag-out and reentry`, async ({ page }) => {
    await install(page);
    const manifest = await openTray(page, tray);
    assertSource(manifest, tray);
    await loadOracle(page, tray);
    const rest = spec.scripts[index];
    // Select a peer by real keyboard activation, then remount the tray. This
    // exposes a fresh target rest program without synthetic controller calls.
    const peer = spec.tools[(index + 1) % spec.tools.length];
    await action(page, `tool:${peer}`).focus();
    await page.keyboard.press('Enter');
    await action(page, 'tray:text').click();
    await openTray(page, tray);
    await terminal(page, tray, index, rest);
    await page.clock.runFor(128);
    expect(await item(page, tray, index)).toMatchObject({ script: rest, frameIndex: sourceScripts[rest].groups - 1, finished: true });
    // Peers can have longer programs than this target. Finish all streams
    // before comparing the whole shared canvas for an unchanged terminal hold.
    await page.clock.runFor(2048);
    expect((await snap(page, tray)).every(value => value.finished)).toBe(true);
    const held = digest(await actor(page, tray).evaluate(node => node.toDataURL()));
    await page.clock.runFor(512);
    expect(digest(await actor(page, tray).evaluate(node => node.toDataURL())), 'Terminal pose stays painted without cumulative blending').toBe(held);

    const [x0, y0, w, h] = sourceRegions[rest];
    const inside = await point(page, x0 + w / 2, y0 + h / 2);
    await page.mouse.move(...inside);
    expect(await item(page, tray, index)).toMatchObject({ script: rest + 2, frameIndex: 0, auxiliary: true });
    await terminal(page, tray, index, rest + 2);
    await expectPixels(page, tray, { composite: true });
    await page.clock.runFor(128);
    expect(await item(page, tray, index)).toMatchObject({ script: rest, auxiliary: false });
    // Finite hover remains finished while the pointer stays inside.
    await page.clock.runFor(512);
    expect(await item(page, tray, index)).toMatchObject({ script: rest, auxiliary: false });
    await moveOutside(page);
    await page.mouse.move(...inside);
    expect(await item(page, tray, index)).toMatchObject({ script: rest + 2, frameIndex: 0, auxiliary: true });
    await page.mouse.down();
    expect(await item(page, tray, index)).toMatchObject({ script: rest + 1, frameIndex: 0, state: 1, auxiliary: false });
    await page.clock.runFor(112);
    await moveOutside(page);
    expect(await item(page, tray, index)).toMatchObject({ script: rest, frameIndex: 0, state: 0 });
    await page.mouse.move(...inside);
    expect(await item(page, tray, index)).toMatchObject({ script: rest + 1, frameIndex: 0, state: 1 });
    await terminal(page, tray, index, rest + 1);
    const beforeRelease = await item(page, tray, index);
    await page.mouse.up();
    expect(await item(page, tray, index), 'Shared tracking→selected script retains its terminal pose').toMatchObject({
      script: rest + 1, frameIndex: beforeRelease.frameIndex, state: 3, auxiliary: false,
    });
    await expect(action(page, `tool:${tool}`)).toHaveAttribute('aria-pressed', 'true');
    for (const other of spec.tools.filter(value => value !== tool)) await expect(action(page, `tool:${other}`)).toHaveAttribute('aria-pressed', 'false');
    await page.clock.runFor(128);
    expect(await item(page, tray, index)).toMatchObject({ frameIndex: sourceScripts[rest + 1].groups - 1, finished: true });
    await moveOutside(page);
    await page.mouse.move(...inside);
    await page.mouse.down(); await page.mouse.up();
    expect(await item(page, tray, index), 'Selected source control does not hover, toggle or restart').toMatchObject({
      state: 3, script: rest + 1, frameIndex: beforeRelease.frameIndex, auxiliary: false, finished: true,
    });
    // A separate press/release outside never changes the selected peer.
    const peerIndex = spec.tools.indexOf(peer), peerRest = spec.scripts[peerIndex];
    const [px, py, pw, ph] = sourceRegions[peerRest];
    await page.mouse.move(...await point(page, px + pw / 2, py + ph / 2));
    await page.mouse.down(); await moveOutside(page); await page.mouse.up();
    await expect(action(page, `tool:${tool}`)).toHaveAttribute('aria-pressed', 'true');
    expect(await item(page, tray, peerIndex)).toMatchObject({ state: 0, script: peerRest });
    expect(page.motionErrors).toEqual([]);
  });
}

const sourceRegions = {"18060":[160,648,53,109],"18063":[217,648,53,109],"18066":[274,648,53,109],"18069":[331,648,53,109],"18072":[171,649,58,110],"18075":[235,647,62,110],"18078":[313,647,68,112],"18081":[163,647,72,112],"18084":[240,647,68,112],"18087":[313,647,69,112],"18090":[161,648,137,108],"18093":[304,648,82,108],"18137":[276,649,94,109],"18134":[172,649,99,109],"18128":[149,643,109,112],"18131":[271,648,115,108]};
const sourceScripts = {
  "18060": {"sha256":"b0dc0d1f98060dd5e100ee70cd7863baf39a4d4962073423513a7da093f9d175","framesSha256":"006f4fef86ce758c4c489443196d97e4de7b0063798c90fe39e6a45a9bdd5e8f","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":2,"cue":4,"sound":18004,"channel":1}]},
  "18061": {"sha256":"ebdad610147ec565a8848d83f90dc6483bd48790dff6c86ac42f0189b10740e8","framesSha256":"b8bb900f74d575a80ffeb93683ad3acb3f20311a62fee9e7d8bff4dad28a0b28","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":1,"cue":5,"sound":18005,"channel":1}]},
  "18062": {"sha256":"a9654da5fda711a7d3373c4eba43aacc4047e1ba42a1215fa4d1ee1be79f778b","framesSha256":"2a7f33ecc1c16992138b9703744bb3578abd35c299c283531a6f782da379f430","groups":6,"tickMs":[100],"endCheckTick":6,"sounds":[{"tick":0,"cue":6,"sound":18006,"channel":1}]},
  "18063": {"sha256":"f7f544f9be504a69d176adc37cdc696841fcea834f73886c2248c6dc9d6006d5","framesSha256":"5dddbf93b3f0229b24b5bc665d09ff1928c76e8cf31cd43cb6d1a78a481a846e","groups":16,"tickMs":[100],"endCheckTick":16,"sounds":[{"tick":5,"cue":7,"sound":18007,"channel":1}]},
  "18064": {"sha256":"50e45695121d6966a2d69e1ad9892d07e9b26486d1d625db99729270bd982156","framesSha256":"4b792ad1a32eeeed2888099637652fe41fb6f0ed599602434de6179c8e342178","groups":16,"tickMs":[100],"endCheckTick":16,"sounds":[{"tick":0,"cue":8,"sound":18008,"channel":1}]},
  "18065": {"sha256":"debe9547bc1195150836ac27ca5898cd94dfd5ec39f6a9b0dd953485c003a311","framesSha256":"7ad3a157e08d3018100f513a762c340ed4d3187e30ccc617425bf441ef056148","groups":6,"tickMs":[100],"endCheckTick":6,"sounds":[{"tick":1,"cue":9,"sound":18009,"channel":1}]},
  "18066": {"sha256":"07122cf9929ee793b81c79dd42db8a3d8826db47d3dfb68b01e0332f6b6f827e","framesSha256":"76c26c204e4f3d82ec9996b371e1e8d17cdf17309a07c37e0c8d4eda55a9d448","groups":16,"tickMs":[100],"endCheckTick":16,"sounds":[{"tick":0,"cue":10,"sound":18010,"channel":1}]},
  "18067": {"sha256":"134dbec51c467944637bb2fb4edc285125966cda4c9aff44c071ace55654f827","framesSha256":"433b5d943caa24ae7b6fed60d3d6c9cde3e14374fc0d24606f47edc7555b27b0","groups":16,"tickMs":[100],"endCheckTick":16,"sounds":[{"tick":0,"cue":11,"sound":18011,"channel":1}]},
  "18068": {"sha256":"4c44687fd794c606cb5178f0dc52990a2b8160956c386664286b493c6f664f85","framesSha256":"3aaa2962fb41ada075dd7d33405e81dd094978666eb70b1eb34dde67a7e924a8","groups":6,"tickMs":[100],"endCheckTick":6,"sounds":[{"tick":0,"cue":12,"sound":18012,"channel":1}]},
  "18069": {"sha256":"3f4f1d95d681e5879ab68a723a3038bb27124a31f713bc95930fa7863a860835","framesSha256":"3dd76ad27d791b94745df0838299b18747eb452c3e997aca554f0b641b1a3132","groups":14,"tickMs":[100],"endCheckTick":14,"sounds":[{"tick":2,"cue":13,"sound":18013,"channel":1}]},
  "18070": {"sha256":"2c8968d8612f776a1df7011497a594d085fabb235ca5097f5c14b7754129c9c5","framesSha256":"b46fed3396e59954b34a6da6f33665cf0570f41af6edfe50631cb05cc35c3fda","groups":14,"tickMs":[100],"endCheckTick":14,"sounds":[{"tick":0,"cue":14,"sound":18014,"channel":1}]},
  "18071": {"sha256":"95da2cceb5fbbbdf9ce246b517ed803c152a0fda60dd541f884acb7f9ceeaf19","framesSha256":"1e6cfea4da956012a8679f16a91719b48a01fbc7bf792d4bfda62149f7c3a659","groups":5,"tickMs":[100],"endCheckTick":5,"sounds":[{"tick":0,"cue":15,"sound":18015,"channel":1}]},
  "18072": {"sha256":"2274b9c8f0e39650620b5f0b805e9c83e68ca6097f9b0d57ca5e78bb73c4edbf","framesSha256":"391bf96024ffb5119e101a6fb31a9fe8810ba3378404ca8fa0e70425ef6fbb57","groups":4,"tickMs":[100],"endCheckTick":4,"sounds":[{"tick":0,"cue":16,"sound":18016,"channel":1}]},
  "18073": {"sha256":"1084f1bde2e01e58ee4c64a80ce330eab65a7861fb4c40fef9e89acbd6d14def","framesSha256":"0a829b132bdf860e591490b0d1c764a3e6584be1a7ab149f29b00773417ae5fc","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":17,"sound":18017,"channel":1}]},
  "18074": {"sha256":"707ef02cbcc0e6b2b4f077776b5d10b19da49bd030ab84b95e1970706cb6cc48","framesSha256":"7e860841fec0b2f5464633ff876aa1622d1a9c9e451b3b8cf8b9259e13ac44e0","groups":4,"tickMs":[100],"endCheckTick":4,"sounds":[{"tick":0,"cue":18,"sound":18018,"channel":1}]},
  "18075": {"sha256":"b9e159a2b7e09dc400211c5c21cc96728e88c64914654ed2adba2a88763b9a19","framesSha256":"32dfbfba18886917859bd608396fca0a18e99246543afe4d768cd7891d05f231","groups":6,"tickMs":[100],"endCheckTick":6,"sounds":[{"tick":0,"cue":19,"sound":18019,"channel":1}]},
  "18076": {"sha256":"34e96133f124021e2cb28dc553b67e258163c413376c75040e42079f79a93175","framesSha256":"9b63e7edb0b6197655991377749d5cf17ea4fb5612a2e4a730d2958620cc6c30","groups":13,"tickMs":[100],"endCheckTick":13,"sounds":[{"tick":0,"cue":20,"sound":18020,"channel":1}]},
  "18077": {"sha256":"18701d0e381f6fae7d16843748d49f7ce57c0c944f5ee973de0532ecdf9b9faa","framesSha256":"0dc1206d94facc560b1539f3983a3da716b1c02ae6c7223afc7e2edb745044bd","groups":9,"tickMs":[100],"endCheckTick":9,"sounds":[{"tick":0,"cue":21,"sound":18021,"channel":1}]},
  "18078": {"sha256":"8ec64b7c27e6852d2853d83de011b119a50d31e6ff404c4f822716bc9eb07df4","framesSha256":"5785014d8609796d27bc3e9cb12228fda2b2194190810d48d7ab7b6b51b60241","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":22,"sound":18022,"channel":1}]},
  "18079": {"sha256":"6a7ac80c5ef8743d3b6d549db67c10e294c5b55e17a3c49bb944ef16bcde964c","framesSha256":"b07f0503ae218ee7af4dac7f77651a80892b1e52895a04759bc22f7e2ddae49a","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":23,"sound":18023,"channel":1}]},
  "18080": {"sha256":"ce5203909d871ddccef339f2528f96ab0c52a8b535a7041635264259e2af4742","framesSha256":"3873b182a27385588786556ae94bdc4e5f08d492ae1edd08d2bb816b9028a25b","groups":5,"tickMs":[100],"endCheckTick":5,"sounds":[{"tick":0,"cue":24,"sound":18024,"channel":1}]},
  "18081": {"sha256":"d10834614a3d4ea49ad09c853a06348e3989803459c39f75075240c2a8ffb8b5","framesSha256":"8fc8b2042d5b6136c327ee86cb80ed0c15206c6e9f893301a58e95b281007d0f","groups":13,"tickMs":[100],"endCheckTick":13,"sounds":[{"tick":3,"cue":25,"sound":18025,"channel":1}]},
  "18082": {"sha256":"5f349a2e226503283dde010b5e8c1d6fd007a64f4f1479dc147e870c9dfd1f9b","framesSha256":"903e4292167eb99c9b6c28030ef56b59424061e5045aa24830d5dcd652baa179","groups":13,"tickMs":[100],"endCheckTick":13,"sounds":[{"tick":0,"cue":26,"sound":18026,"channel":1}]},
  "18083": {"sha256":"ecf641502469216db8382af0b425b8357a21a369c6beb0e7b0e8b95ce022e8f5","framesSha256":"43e2b3d6d81b6b2e8883bbe96b2767dda9dc4eafe2e4550e0b8cd1eb8ac32a51","groups":8,"tickMs":[100],"endCheckTick":8,"sounds":[{"tick":0,"cue":27,"sound":18027,"channel":1}]},
  "18084": {"sha256":"a56d6572ed45bae0106ad8d0172cd3ba31cf2fb98f234aa7f4dcca5109c23bbb","framesSha256":"b4defa72dc5f24960224b255cea35b6696ea82eafe6a7a45f0e5f5d996d6cb20","groups":7,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":3,"cue":28,"sound":18028,"channel":1}]},
  "18085": {"sha256":"3b4aae0b879eda814bde6699ed512f07297c12c221abf637ab5e743fe298c25b","framesSha256":"e05c3f58fa08782aa4ecd9d6c72bcafd941b7cf36e75144fddc4782d70fa0534","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":29,"sound":18029,"channel":1}]},
  "18086": {"sha256":"cc5936866b87e3c771643d10f4e4d877e53197cc481b4f7b8103255d87ecf44a","framesSha256":"31a1587af940b2978f547b83d21149873ca4e0edcf306df4779bd76f8a83e80b","groups":5,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":0,"cue":30,"sound":18030,"channel":1}]},
  "18087": {"sha256":"62f48e890eef587e820467fe4cc21aef083976b2c20645de96bd1dd111ab4009","framesSha256":"2e48f6870f1671277a1c0bda16a8e9b736bd74c149289731215fd6bcbfedfb5f","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":3,"cue":25,"sound":18025,"channel":1}]},
  "18088": {"sha256":"c110b1f6490e31b206492a701abd1782afbcc509ab418db03f4d80fdad4a4af5","framesSha256":"d948b9e3bbb4149f25e04467a9f5ab9bdf7c350f2557ab3555bf74d168b91113","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":26,"sound":18026,"channel":1}]},
  "18089": {"sha256":"d63e7f374f1314033d1ffb8feae64d556f2541a2804d84c88306537ae80eb2b4","framesSha256":"222bca99f748514250749fe49ec60c423d7e07af7d6fb9dc177db95ca8ac25d2","groups":5,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":0,"cue":27,"sound":18027,"channel":1}]},
  "18090": {"sha256":"e92ecb40ca9fd089cb9d3d230f4e28b495d842796548283368b09998c7a190ad","framesSha256":"aa7a27a400397f07f7d8cb9559627019447386d1e9ddeb60f264a3b378cdbed1","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":1,"cue":31,"sound":18031,"channel":1}]},
  "18091": {"sha256":"009fc6569d8021940650eb5d4c8e51e7ee6c4baf2ecee179f2e4dd214943b1d4","framesSha256":"c4e6f88811c807abd58e78c70cc86a21a24e822dc3db828974104c4ca87c0a77","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":32,"sound":18032,"channel":1}]},
  "18092": {"sha256":"1a535375dfa4b662fc2a63a34c04c4d16fa2d294fe8385ba9cea720fbe1abe23","framesSha256":"395e36c9d18d366bc60228a9d7e7b661a2e4c36e1b4f84505064b9bf9db8efa9","groups":7,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":0,"cue":33,"sound":18033,"channel":1}]},
  "18093": {"sha256":"5830964ed494970a2d21cb07c8da5a1c9c4c92eaf7c6da6d5e04ee851a46b4ef","framesSha256":"7d3f2669ac27afc532b8e34ab62de784d4a6641d66e1a1cf7849df88afd72717","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":34,"sound":18034,"channel":1}]},
  "18094": {"sha256":"c6c132ce4a79010fd44cab2fa1f9f3512bb302c6cd1625bb23e060abd0fd0710","framesSha256":"e14c9907a361f5e80daae6f4d998a7dc617b6ff4bc3aea51c2f6ca5865f39fb3","groups":11,"tickMs":[100],"endCheckTick":11,"sounds":[{"tick":0,"cue":35,"sound":18035,"channel":1}]},
  "18095": {"sha256":"950ac4f002754719957ffecb706354603c70a7544f57f339acb13763b23d2221","framesSha256":"5aaee373d6f55cab9abe1dc58c68a65dc3483e1a1d970318e607db49fd619907","groups":7,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":0,"cue":36,"sound":18036,"channel":1}]},
  "18134": {"sha256":"f785a7bec2887a387f91830f0345b5d0130e54fc0260706eef1cad75d4bed480","framesSha256":"4d9b0c3c8673789d852abb8a8e990a8d995985a0053deca574bcf41f5c9a84db","groups":10,"tickMs":[100],"endCheckTick":10,"sounds":[{"tick":2,"cue":46,"sound":18046,"channel":1}]},
  "18135": {"sha256":"1519dbeb44375739a6c736c4429af5f4353ed1cd4450950582865db906b755de","framesSha256":"e5d6d1c8bb0fe524cf3b326c7a0f82aa1f80f45adbabf11aaa9ec985b1045004","groups":10,"tickMs":[100],"endCheckTick":10,"sounds":[{"tick":0,"cue":47,"sound":18047,"channel":1}]},
  "18136": {"sha256":"666a6acb312f472290ea6e23602f76a69bb24cf846e381dde85b0df3d5c86ebe","framesSha256":"211ad127118ba36f36b6ef1373aefea8dc859c612fb7f7913fdc8b7c51936fec","groups":8,"tickMs":[100],"endCheckTick":8,"sounds":[{"tick":0,"cue":48,"sound":18048,"channel":1}]},
  "18137": {"sha256":"57d86e0286d05ac505a947bddaffc0b6f433fdbf1743adca3a74625ac212fd9c","framesSha256":"7145b8de742e51e159c675cc5fbdef3101f1d06b2a6135b8d6da5b6fe9308175","groups":7,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":2,"cue":49,"sound":18049,"channel":1}]},
  "18138": {"sha256":"2e66b44e54407f24959c93c7993a5a2b04e24852d54e90f96f321736562210dd","framesSha256":"0dcde0c9123886caaae2200dd30e2a609b7fbd4eaad91d8183eea01956f37bcf","groups":7,"tickMs":[100],"endCheckTick":7,"sounds":[{"tick":0,"cue":50,"sound":18050,"channel":1}]},
  "18139": {"sha256":"f2cc0bd6c29b7706692f328c3f3dfd398a933ad54fe9310808c2bf59e2500281","framesSha256":"c4de909f05b360ccf46d18ff36b46ad7f7de6b26168a1dd02dfc9e9e780328ec","groups":9,"tickMs":[100],"endCheckTick":9,"sounds":[{"tick":0,"cue":51,"sound":18051,"channel":1}]},
"18128":{"sha256":"3ad892d6e15a0197636eafdbc46ad826ad40611524f9cca54122d4e918879a03","framesSha256":"b3051dca371bdaa41ea054b52dafedc4494e38be092f769a7e79b09f3f5f5bf9","groups":8,"tickMs":[100],"endCheckTick":8,"sounds":[{"tick":4,"cue":40,"sound":18040,"channel":1}]},"18129":{"sha256":"e319785f3e63b3bcdc6b2139a0f61eb71838ba9166f7b93ce235ec50440a8bd8","framesSha256":"c45f4b7b02008b8d82dbe541b608e02116dce044e24081b0fac17032ffb45e0a","groups":8,"tickMs":[100],"endCheckTick":8,"sounds":[{"tick":0,"cue":41,"sound":18041,"channel":1}]},"18130":{"sha256":"379d70b3062929adace377138bc0f870d9ec555b9f1b58eb3b747fcf875b8965","framesSha256":"6ba2fbbd936e72634ff0e56f47b0fba0cdd08067c1317134918b72c9aa158472","groups":9,"tickMs":[100],"endCheckTick":9,"sounds":[{"tick":2,"cue":42,"sound":18042,"channel":1}]},"18131":{"sha256":"6a8e2ef6ac46d6d047661565735ba25cde30c5958482cd37e7b583578e968079","framesSha256":"45a036aeb83b4220124818025303a61536c650afc172655af983196c42ddc6a8","groups":9,"tickMs":[100],"endCheckTick":9,"sounds":[{"tick":0,"cue":43,"sound":18043,"channel":1}]},"18132":{"sha256":"88ca05940d9055d923886a652551d2258603659c0046572cf01ea468994f7e42","framesSha256":"06fd3cf50d8f98ea0f868640cc07ae32b30ff1bbd643e2efab1215b3bc3d4032","groups":9,"tickMs":[100],"endCheckTick":9,"sounds":[{"tick":0,"cue":44,"sound":18044,"channel":1}]},"18133":{"sha256":"0e14c1923e3445267c6c33e44f2982fbf2f0a88f32145d0ee377af86f2d778cc","framesSha256":"92fa8642be431f159dab670d7bdb43361a9c30dde00425000373b2161ae0a66e","groups":6,"tickMs":[100],"endCheckTick":6,"sounds":[{"tick":0,"cue":45,"sound":18045,"channel":1}]}};

const sourceAssetHashes = {"draw": "7614847f4d9332ab63af4933ef564f3680d31e1daafefb303526ef67dd93f378", "paint": "6a3e233faf4843f8f4fc508835003d9e86c6a80ed3206485a5c842e21dd7015a", "bucket": "c811d2d71d73547cd725d77a0e417f98c1b1342a5cfd2e64bde93455bc49cb42", "mixer": "c9e4734ee078eb10b2465b85496dbe157ed7d653e4a96fbc4fe2df34f0db3cd7", "eraser": "4f950ed3e3557a8fa8f2f7ddcf996321126aa4c975bf9cfd5256d722a8719486","grab":"9680af8aeed49b63af4475f311360c1e57410d8676cff0b675fb20b7d131b9d5"};

async function loadOracle(page, tray) {
  const manifest = page.toolManifest.trays[tray];
  const entries = Object.entries(manifest.sprites).sort(([a], [b]) => Number(a) - Number(b));
  let bundle;
  if (manifest.bundle) {
    const response = await page.request.get(`/original/ui/${manifest.bundle.path}`);
    expect(response.ok()).toBe(true);
    const compressed = await response.body();
    // The separate transport case rejects Content-Encoding. Keep the pose
    // oracle usable on a dev server that HTTP-decodes gzip: its decompressed
    // bytes are still independently checked against installer channel hashes.
    if (/gzip/i.test(response.headers()['content-encoding'] || '')) bundle = compressed;
    else { expect(digest(compressed)).toBe(manifest.bundle.sha256); bundle = gunzipSync(compressed); }
    expect(bundle.length).toBe(manifest.bundle.byteLength);
  }
  const assets = await Promise.all(entries.map(async ([id, sprite]) => {
    let raw, png;
    if (bundle) {
      const [start, length] = sprite.bundleOffsets.argb;
      raw = bundle.subarray(start, start + length);
      const [pngStart, pngLength] = sprite.bundleOffsets.png;
      png = bundle.subarray(pngStart, pngStart + pngLength);
    } else {
      const [a, b] = await Promise.all([page.request.get(`/original/ui/${sprite.argb}`), page.request.get(`/original/ui/${sprite.image}`)]);
      expect(a.ok()).toBe(true); expect(b.ok()).toBe(true);
      raw = await a.body(); png = await b.body();
    }
    expect(raw.length).toBe(sprite.width * sprite.height * 4);
    const decoded = PNG.sync.read(png);
    expect([decoded.width, decoded.height]).toEqual([sprite.width, sprite.height]);
    return { id, hash: digest(raw), imageHash: digest(decoded.data), raw: raw.toString('base64'), png: png.toString('base64') };
  }));
  expect(digest(JSON.stringify(assets.map(({ id, hash }) => [id, hash]))), 'All raw channels are pinned to the mounted installer').toBe(sourceAssetHashes[tray]);
  expect(digest(JSON.stringify(assets.map(({ id, imageHash }) => [id, imageHash]))), 'Every ordinary PNG channel is pinned to source ARGB conversion').toBe(sourcePngHashes[tray]);
  const ui = await (await page.request.get('/original/ui/ui.json')).json();
  await page.evaluate(async ({ assets, ui, manifest, backdrops, tray }) => {
    const image = async src => { const image = new Image(); image.src = src; try { await image.decode(); } catch { throw new Error(`Source oracle image failed: ${src.slice(0, 220)}`); } return image; };
    const sprites = new Map(await Promise.all(assets.map(async value => [value.id, {
      image: await image(`data:image/png;base64,${value.png}`),
      raw: Uint8Array.from(atob(value.raw), value => value.charCodeAt(0)),
    }])));
    const pages = new Map();
    if (tray === 'draw') {
      const part = ui.drawingOptions['tray-draw'];
      pages.set('draw', { image: await image(`/original/ui/${part.images[0]}`), rect: [part.x, part.y, part.w, part.h] });
    } else {
      for (const [view, backdrop] of Object.entries(backdrops)) {
        if (!({ paint: ['paint', 'wacky', 'sound', 'hands-free', 'spray', 'moving-spray'],
          bucket: ['bucket', 'gradient', 'pattern'], mixer: ['mixer', 'mixer-wand'], eraser: ['eraser'], grab: ['grab', 'scissors'] }[tray] || []).includes(view)) continue;
        for (const page of backdrop.pages) pages.set(page.image, { image: await image(`/original/ui/${page.image}`), rect: backdrop.rect });
      }
    }
    window.toolOracle = { sprites, pages, chrome: await image('/original/ui/paint-empty.png'), manifest };
  }, { assets, ui, manifest, backdrops: page.toolManifest.backdrops || {}, tray });
}

async function expectPixels(page, tray, { composite = false, color = '#000000' } = {}) {
  const state = await snap(page, tray);
  const { expected, bounds } = await page.evaluate(({ state, color, tray }) => {
    const { sprites, pages, chrome, manifest } = window.toolOracle;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(chrome, 0, 0);
    const displayed = document.querySelector('#tray-art');
    const background = tray === 'draw' ? pages.get('draw') : [...pages.values()].find(value => new URL(value.image.src).pathname === new URL(displayed.src).pathname);
    if (!background) throw new Error(`No source clean backdrop for ${displayed?.src}`);
    ctx.drawImage(background.image, ...background.rect);
    const rgb = color.match(/\w\w/g).map(hex => parseInt(hex, 16));
    const f = Math.fround, reciprocal = f(1 / 255);
    for (const [index, value] of state.entries()) {
      const frame = manifest.scripts[value.script].frames[value.frameIndex];
      const clip = value.auxiliary ? manifest.buttons[index].auxiliaryClipRect : null;
      const tint = manifest.renderMode !== 'ordinary' && frame.parts.length > 1;
      const ordinary = tint ? frame.parts.slice(0, 1) : frame.parts;
      ctx.save();
      if (clip) { ctx.beginPath(); ctx.rect(...clip); ctx.clip(); }
      for (const part of ordinary) ctx.drawImage(sprites.get(String(part.sprite)).image, part.x, part.y);
      ctx.restore();
      if (tint) {
        const [base, part] = frame.parts;
        const source = sprites.get(String(part.sprite)).raw;
        const info = manifest.sprites[part.sprite], baseInfo = manifest.sprites[base.sprite];
        const x0 = Math.max(base.x, part.x, 0), y0 = Math.max(base.y, part.y, 0);
        const x1 = Math.min(part.x + info.width, base.x + Math.min(info.width, baseInfo.width), 1024);
        const y1 = Math.min(part.y + info.height, base.y + Math.min(info.height, baseInfo.height), 768);
        if (x1 > x0 && y1 > y0) {
          const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const from = ((y - part.y) * info.width + x - part.x) * 4;
            const to = ((y - y0) * (x1 - x0) + x - x0) * 4;
            for (let channel = 0; channel < 3; channel++) {
              const target = f(f(f(rgb[channel] * reciprocal) * source[from + 2]) + source[from + 1]);
              image.data[to + channel] = Math.min(255, Math.trunc(f(f(f(target - image.data[to + channel]) * f(source[from + 3] * reciprocal)) + image.data[to + channel])));
            }
          }
          ctx.putImageData(image, x0, y0);
        }
      }
    }
    const parts = Object.values(manifest.scripts).flatMap(clip => clip.frames.flatMap(frame => frame.parts));
    const left = Math.min(...parts.map(p => p.x)), top = Math.min(...parts.map(p => p.y));
    const right = Math.max(...parts.map(p => p.x + manifest.sprites[p.sprite].width));
    const bottom = Math.max(...parts.map(p => p.y + manifest.sprites[p.sprite].height));
    return { expected: canvas.toDataURL(), bounds: [left, top, right, Math.min(bottom, 768)] };
  }, { state, color, tray });
  const expectedPng = PNG.sync.read(Buffer.from(expected.split(',')[1], 'base64'));
  const actual = composite ? PNG.sync.read(await page.locator('#studio').screenshot({ animations: 'disabled' }))
    : PNG.sync.read(Buffer.from((await actor(page, tray).evaluate(node => node.toDataURL())).split(',')[1], 'base64'));
  if (!composite) expect([actual.width, actual.height]).toEqual([1024, 768]);
  const differences = [];
  const [left, top, right, bottom] = bounds;
  let checked = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = (y * 1024 + x) * 4;
    const ax = Math.min(actual.width - 1, Math.floor((x + .5) * actual.width / 1024));
    const ay = Math.min(actual.height - 1, Math.floor((y + .5) * actual.height / 768));
    const actualOffset = (ay * actual.width + ax) * 4;
    // At scaled sizes compare only constant 3x3 source neighborhoods, so
    // CSS resampling at silhouette edges cannot masquerade as clipping.
    if (actual.width !== 1024 || actual.height !== 768) {
      if ([ -1, 0, 1 ].some(dy => [ -1, 0, 1 ].some(dx =>
        [0, 1, 2, 3].some(c => expectedPng.data[((y + dy) * 1024 + x + dx) * 4 + c] !== expectedPng.data[offset + c])))) continue;
    }
    // Source chrome/backdrop are opaque within the restored actor area. Check
    // blank former-pose locations too: overlay-only rendering leaves ghosts.
    if (expectedPng.data[offset + 3] !== 255) continue;
    checked++;
    if ([0, 1, 2, 3].some(c => Math.abs(actual.data[actualOffset + c] - expectedPng.data[offset + c]) > 1) && differences.length < 5) {
      differences.push({ x, y, actual: [...actual.data.subarray(actualOffset, actualOffset + 4)], expected: [...expectedPng.data.subarray(offset, offset + 4)] });
    }
  }
  expect(checked, 'Independent source comparison includes full actor area').toBeGreaterThan(5000);
  expect(differences, `${tray} ${composite ? 'visible studio stack' : 'actor composition'} follows registered source poses and clean backdrop`).toEqual([]);
}

for (const tray of Object.keys(trays)) {
  test(`${tray}: color/size/option/row rerenders retain owner, source progress and terminal pixels`, async ({ page }) => {
    await install(page);
    await openTray(page, tray);
    await loadOracle(page, tray);
    const tool = trays[tray].tools[1];
    await action(page, `tool:${tool}`).focus(); await page.keyboard.press('Enter');
    await moveOutside(page);
    await page.clock.runFor(112);
    await actor(page, tray).evaluate(node => { window.savedMotionActor = node; });
    let before = await snap(page, tray);
    expect(before.some(value => value.frameIndex > 0 && !value.finished)).toBe(true);
    for (const color of ['#0080ff', '#f54081', '#ffffff', '#000000']) {
      await openClockPalette(page);
      before = await snap(page, tray);
      // The OS color chooser is outside Playwright. Deliver its existing input
      // boundary; selection and every subsequent rerender use the actual app.
      await page.locator('#custom-color').evaluate((input, color) => {
        input.value = color; input.dispatchEvent(new Event('change', { bubbles: true }));
      }, color);
      expect(await actor(page, tray).evaluate(node => node === window.savedMotionActor)).toBe(true);
      expect(await snap(page, tray), 'Color repaint preserves every base stream deadline/pose').toEqual(before);
      await expectPixels(page, tray, { color });
      await closeClockPalette(page);
      before = await snap(page, tray);
      await expectPixels(page, tray, { color, composite: true });
    }
    for (const value of ['size:4', 'effect:1', 'page:1', 'page:-1']) {
      if (await action(page, value).count()) {
        await action(page, value).click();
        await expect(actor(page, tray)).toBeVisible();
        expect(await actor(page, tray).evaluate(node => node === window.savedMotionActor)).toBe(true);
        expect(await snap(page, tray), `${value} cannot restart source motion`).toEqual(before);
        await expectPixels(page, tray, { composite: true });
      }
    }
    if (tray === 'paint') {
      for (const mode of ['mode:true', 'mode:false']) {
        await action(page, mode).click();
        await expect(actor(page, tray)).toBeVisible();
        expect(await snap(page, tray)).toEqual(before);
        await expectPixels(page, tray, { composite: true });
      }
    }
    expect(page.motionErrors).toEqual([]);
  });

  for (const retryIndex of tray === 'grab' ? [0, 1] : [1]) test(`${tray}: failed optional art keeps static choices usable and reentry retries${tray === 'grab' ? ` ${trays[tray].tools[retryIndex]}` : ''}`, async ({ page }) => {
    let fail = true, failures = 0;
    // Fail both bundle and fallback payloads: a successful fallback must not
    // accidentally turn this into a test of the success path.
    await page.route(/\/original\/ui\/(?:tool-motion|drawing-motion)\/.*\.(?:gz|bin|argb|png)(?:\?|$)/, route => {
      if (fail) { failures++; return route.fulfill({ status: 503, body: 'temporary motion fixture' }); }
      return route.continue();
    });
    await install(page);
    await action(page, `tray:${tray}`).click();
    await expect.poll(() => failures).toBeGreaterThan(0);
    await expect(actor(page, tray)).toHaveCount(0);
    const tool = trays[tray].tools[retryIndex];
    if (tray === 'grab') {
      await action(page, `tool:${trays[tray].tools[1 - retryIndex]}`).click();
    }
    await action(page, `tool:${tool}`).click();
    await expect(action(page, `tool:${tool}`)).toHaveAttribute('aria-pressed', 'true');
    fail = false;
    await action(page, 'tray:text').click();
    await openTray(page, tray);
    expect(await item(page, tray, retryIndex)).toMatchObject({ state: 3, script: trays[tray].scripts[retryIndex] + 1 });
    expect(page.motionErrors).toEqual([]);
  });
}

test('rapid changes across all eight tabs cancel pending old-owner publication and old audio', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  await page.route(url => url.pathname.endsWith('/original/ui/tool-motion/manifest.json'), async route => {
    const response = await route.fetch();
    if (!held) { held = true; await gate; }
    try { await route.fulfill({ response }); } catch { /* Switching owner can abort this exact request. */ }
  });
  await install(page, { heldAudio: true });
  await expect.poll(() => held).toBe(true);
  for (const tray of ['paint', 'bucket', 'mixer', 'stamp', 'text', 'grab', 'eraser', 'text']) {
    await action(page, `tray:${tray}`).click();
  }
  release();
  await page.clock.runFor(256);
  await expect(allActors(page)).toHaveCount(0);
  const lateAudio = await page.evaluate(() => window.toolSounds.filter(audio => !audio.paused && !audio.ended).map(audio => audio.src));
  expect(lateAudio, 'A completed old-owner load cannot create a late actor or cue').toEqual([]);
  // Enter ready owners in succession, then interrupt live cues on each switch.
  for (const tray of Object.keys(trays)) {
    await openTray(page, tray);
    await page.clock.runFor(112);
    await page.evaluate(() => { window.previousToolSounds = [...window.toolSounds]; });
    await action(page, 'tray:text').click();
    await expect(allActors(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.previousToolSounds.every(audio => audio.paused || audio.ended))).toBe(true);
    await page.clock.runFor(512);
    await expect(allActors(page)).toHaveCount(0);
  }
  expect(page.motionErrors).toEqual([]);
});

test('hover owns only its cue; release-inside preserves one tracking cue; blur cancels all owned audio', async ({ page }) => {
  await install(page, { heldAudio: true });
  await openTray(page, 'draw');
  const [x, y, w, h] = sourceRegions[18063];
  const inside = await point(page, x + w / 2, y + h / 2);
  await page.mouse.move(...inside);
  await page.clock.runFor(112); // Chalk hover cue 18009 is at source tick1.
  const sounds = async () => page.evaluate(() => window.toolSounds.map(audio => ({
    src: audio.src, paused: audio.paused, ended: audio.ended, plays: audio.plays, stops: audio.stops,
  })));
  expect((await sounds()).filter(sound => /18009\.wav(?:\?|$)/.test(sound.src) && !sound.paused)).toHaveLength(1);
  await page.mouse.down();
  expect((await sounds()).filter(sound => /18009\.wav(?:\?|$)/.test(sound.src)).every(sound => sound.paused)).toBe(true);
  const tracking = (await sounds()).filter(sound => /18008\.wav(?:\?|$)/.test(sound.src));
  expect(tracking).toHaveLength(1);
  expect(tracking[0]).toMatchObject({ paused: false, plays: 1 });
  await page.clock.runFor(224);
  const pose = await item(page, 'draw', 1);
  await page.mouse.up();
  expect(await item(page, 'draw', 1)).toMatchObject({ state: 3, frameIndex: pose.frameIndex, script: 18064 });
  expect((await sounds()).filter(sound => /18008\.wav(?:\?|$)/.test(sound.src))).toHaveLength(1);
  // Local leave cannot stop this selected backing's independent cue.
  await moveOutside(page);
  expect((await sounds()).find(sound => /18008\.wav(?:\?|$)/.test(sound.src)).paused).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await sounds()).every(sound => sound.paused || sound.ended)).toBe(true);
  const after = await sounds();
  await page.clock.runFor(512);
  expect((await sounds()).length).toBe(after.length);
  expect(page.motionErrors).toEqual([]);
});

for (const event of ['pointercancel', 'lostpointercapture', 'blur']) {
  test(`${event} cancels primary tracking without selecting the pressed control`, async ({ page }) => {
    await install(page);
    await openTray(page, 'draw');
    await action(page, 'tool:chalk').evaluate(node => node.addEventListener('pointerdown', event => { node.dataset.testPointer = event.pointerId; }));
    await action(page, 'tool:chalk').hover(); await page.mouse.down();
    // Deliver one captured pointermove before releasing capture; releasing a
    // pending capture before gotpointercapture need not emit a lost event.
    await page.mouse.move(...await point(page, 243, 704));
    expect(await item(page, 'draw', 1)).toMatchObject({ state: 1 });
    await action(page, 'tool:chalk').evaluate((node, event) => {
      const pointerId = Number(node.dataset.testPointer);
      if (event === 'blur') window.dispatchEvent(new Event('blur'));
      else if (event === 'lostpointercapture') node.releasePointerCapture(pointerId);
      else node.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true }));
    }, event);
    await moveOutside(page); await page.mouse.up();
    expect(await item(page, 'draw', 1)).toMatchObject({ state: 0, script: 18063, auxiliary: false });
    await expect(action(page, 'tool:pencil')).toHaveAttribute('aria-pressed', 'true');
    await action(page, 'tool:chalk').focus(); await page.keyboard.press('Enter');
    await expect(action(page, 'tool:chalk')).toHaveAttribute('aria-pressed', 'true');
  });
}

test('motion layer preserves editable text selection and protected chrome without intercepting library drag', async ({ page }) => {
  await install(page);
  await openTray(page, 'draw');
  const title = page.getByRole('textbox', { name: 'Picture title', exact: true });
  await title.fill('Motion draft'); await title.press('Home'); await title.press('Shift+End');
  expect(await title.evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('Motion draft');
  await action(page, 'tray:text').click();
  const bounds = await page.locator('#paper-canvas').boundingBox();
  await page.mouse.click(bounds.x + 130, bounds.y + 120);
  const text = page.getByLabel('Picture text', { exact: true });
  await text.fill('Editable motion draft');
  const rect = await text.boundingBox();
  await page.mouse.move(rect.x + 2, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + Math.min(180, rect.width - 2), rect.y + rect.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).not.toBe('');
  await text.press('ControlOrMeta+a'); await page.keyboard.insertText('Edited during tab changes');
  await expect(text).toHaveText('Edited during tab changes');
  for (const tray of Object.keys(trays)) await openTray(page, tray);
  await expect(page.locator('#objects .scene-object')).toHaveText('Edited during tab changes');
  await action(page, 'tray:text').click();
  await text.click();
  await expect(text).toHaveText('Edited during tab changes');
  await expect(title).toHaveValue('Motion draft');
  await page.evaluate(() => {
    getSelection().removeAllRanges();
    window.chromeDragStarts = 0;
    document.addEventListener('dragstart', () => window.chromeDragStarts++);
  });
  await page.mouse.move(...await point(page, 400, 640)); await page.mouse.down();
  await page.mouse.move(...await point(page, 850, 750), { steps: 10 }); await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  expect(await page.evaluate(() => window.chromeDragStarts), 'Real chrome sweep cannot initiate native image dragging').toBe(0);
  expect(await page.locator('#paint-zone img').evaluateAll(images => images.filter(image => !image.closest('#library-tray, #objects')).every(image => !image.draggable || getComputedStyle(image).webkitUserDrag === 'none'))).toBe(true);
  await action(page, 'tray:stamp').click();
  const tile = page.locator('#library-tray [data-asset][draggable="true"]').first();
  await expect(tile).toBeVisible();
  const beforeStamp = await page.locator('#paper-canvas').evaluate(node => node.toDataURL());
  await tile.dragTo(page.locator('#paper-canvas'), { targetPosition: { x: 400, y: 240 } });
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'stamp');
  await expect.poll(() => page.locator('#paper-canvas').evaluate(node => node.toDataURL())).not.toBe(beforeStamp);
  await expect(allActors(page)).toHaveCount(0);
  expect(page.motionErrors).toEqual([]);
});

test('sprite bundles are opaque HTTP payloads with exact compressed hashes and byte ranges', async ({ page }) => {
  await install(page);
  for (const [tray, manifest] of Object.entries(page.toolManifest.trays)) {
    if (!manifest.bundle) continue; // Bundle is optional; per-file loading is covered by source-pose cases.
    const response = await page.request.get(`/original/ui/${manifest.bundle.path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-encoding'], `${tray}: application gzip must not be HTTP-decoded`).toBeUndefined();
    const body = await response.body();
    expect(digest(body)).toBe(manifest.bundle.sha256);
    const bytes = gunzipSync(body);
    expect(bytes.length).toBe(manifest.bundle.byteLength);
    const files = Object.entries(manifest.sprites).flatMap(([id, sprite]) => ['argb', 'png'].map(kind => ({ id, sprite, kind })));
    let next = 0;
    // Verify every fallback while bounding public-origin latency and pressure.
    // Serial requests for hundreds of files exceed the live test's deadline.
    await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
      while (next < files.length) {
        const { id, sprite, kind } = files[next++];
        const [start, length] = sprite.bundleOffsets[kind];
        expect(start).toBeGreaterThanOrEqual(0); expect(length).toBeGreaterThan(0);
        expect(start + length).toBeLessThanOrEqual(bytes.length);
        const fallback = await page.request.get(`/original/ui/${kind === 'argb' ? sprite.argb : sprite.image}`);
        expect(fallback.ok()).toBe(true);
        expect(bytes.subarray(start, start + length).equals(await fallback.body()), `${tray}/${id}/${kind}: bundle retains exact fallback bytes`).toBe(true);
      }
    }));
  }
});

const sourceButtons = {"draw":[[18060,18061,0,18061,2,1184,18400,1,0,0,18062,0,0,0,18400,0],[18063,18064,0,18064,2,2184,18400,1,1,0,18065,0,0,0,18400,0],[18066,18067,0,18067,2,3184,18400,1,2,0,18068,0,0,0,18400,0],[18069,18070,0,18070,2,4184,18400,1,3,0,18071,0,0,0,18400,0]],"paint":[[18072,18073,0,18073,2,18072,18000,1,0,0,18074,0,0,0,18000,0],[18075,18076,0,18076,2,18075,18001,1,0,0,18077,0,0,0,18000,0],[18078,18079,0,18079,2,18078,18002,1,0,0,18080,0,0,0,18000,0]],"bucket":[[18081,18082,0,18082,2,1183,18300,3,1,0,18083,0,0,0,3,0],[18084,18085,0,18085,2,2183,18301,3,1,0,18086,0,0,0,3,0],[18087,18088,0,18088,2,3183,18302,3,1,0,18089,0,0,0,3,0]],"mixer":[[18090,18091,0,18091,2,1186,18600,1,0,0,18092,0,0,0,18600,0],[18093,18094,0,18094,2,2186,18601,1,0,0,18095,0,0,0,18600,0]],"eraser":[[18137,18138,0,18138,2,1185,18500,1,0,0,18139,0,0,0,18500,0],[18134,18135,0,18135,2,2185,18501,1,0,0,18136,0,0,0,18500,0]],"grab":[[18131,18132,0,18132,2,1926,22300,1,0,0,18133,0,0,0,153,0],[18128,18129,0,18129,1,0,22301,1,0,0,18130,0,0,0,153,0]]};

const sourcePngHashes = {"draw":"2c9fec03f9cbca14d8ca90c78e612993b872f74edf24b1c286a5e61389682df8","paint":"6b759149135adfa92ee71d6e59b0f936cc249b2ed68c696a4e77b97ac9fc933c","bucket":"9a0cf6d385020f83afbcb5e42b23478def43f37cb8278cf7af8f9d4e8f405a23","mixer":"f53173fd273f30e59c4c6f29b2ca89e64e061d7e48070f956ed94b2549961f35","eraser":"e6dfd59a4e419b9bab5a386b64f5e534d83b8b1a47162b6a8f14776e6272556a","grab":"4903f27662254d0f2ce7330b318e6a58343ad7ba97d363ab16ea1e30771c1abc"};

const sourceBackdropHashes = {"paint":["5c47607b8602e28b5004ed887939c8bbb2374a08355d2f1115467cc9686a76c3","c61504ed9c034f237d874a6a3c44939dd8d869fc09a867db10188b51661d502a","8760cc5d098d83b511fc2c2691277d3092b29c33466578f7f52f0da31c31cb38","1e8aa1cac383aeec95dc5e92527cc6a1bd3132aaeb5a3fbc0f1b970d67221bf4"],"wacky":["e75079f8cd8e56713dd9f3d4a26f8e4b2ad7a1caaca96d7f29f14ef8fb9d973d","73d0ab3810a6565e26147e83e720b4cb5e5abcea590ebe2239e6449a35830805","6d0a7d0039ffd272fe1e53bb81f3a999d06797061f9108e6ec37e77116b56ce4","65c3e4729c954beebf6ecaea8b24ef83e58c320f01695945f8780fb449e11b81","9299f53d1139dbdb7f36f4c74b3c2c0fbc5b34481e4942fa48d2f85c863d1b4c","a3c380dd37f578fa0fd8b17c6f8cb12a99c7c1f9beb165797e9a4afac99b4ab2"],"sound":["12c9f7274f869d998f50170eed1663678bbb8585d66f0fe540a0609607ded22d","51cee7f805a165fec779d176f478aac76c9f931a435493f2901a7a045f8f83c1"],"hands-free":["78ea180af70ace3fa181bab1925c4ef3658d11ef06184944d898d9a5cc20ca4f","55bb1ebcc09334aac481c5ee0be008540b5260c2cb6027ed6eab319e54777a65"],"spray":["ed9747177b8a8cfde0e9af05e7e4946a2544f8baae26491cdf65f8e3136200f3","80dce0cc8ee3c7f66bd9fb884e8d9019369e97ea3925a5a5558ebe7eaf713acc","63dcc2a54c8599c351c34f3cbecb752c3ecc6a0409064f05d9eeb628b40db144"],"moving-spray":["99b33788a654f96fde7cb05c0b6b158548073efec90e85d3aab3c2a0325c004c","deefdc7d5c778e8aea56e715c36775bbf45f61abfaec58a31200ae81a0d9ec9d","4f64668cf387e3a70a7297c5a9259c424070842de04c02c310ac14abf5fb56af","5fd50fe343d549ecbee9ba11cf7eb6f291bbe46aa748800608c178a1fc0c10f7"],"bucket":["ca9ed5c2c437ab35a47c2ad58772e0ddd629cf789b08174285cc57cbcbef99ac","a593dfcf22799c6908bc56db0396affcd698d618744a195a588157dafb534593","320981223f8aee37e63e453ccb4fc4f5e29b572b9611987f17f0f0e49b401da7","92343fc693bb6592a58fe9fe5ac9493bfd40cfabec51748d8f57aed3bf78a3b8","0ee5228efc0db51ee788e7d6f9f3c443831b892de0209973f1c8dbd806356155","0d563f4c34d5e0d1c3f8dd10723d5d5f0dc5ddcc250d614869e1d3766c8dc58c"],"gradient":["8e9579e4980ff841a9abb7fc7feb56b4726305a4da7e993bf1938f96f0846ce4","b9857baef649a969a3faef29df71077fb4ea0ea16c5898901eee03abaf993d7f","56f51ea5beaabd6c81a2f435df39fe82825332ae521803b03718b1465956f935","4088472f4958e921f1d634545407de0e6dc436903f3e20d78d993c7435d489f3","584ef44b6f0ac67c045b74f4dec91876dfacc8a797692ce10a60d38eef832d0b","0824bdda52f28aa658bafff0277a9bbd6ebc4c8ffab8baf3549c43d55e6230b2","093cc4a5cf5ca2e633abf2562d94cf0037397cebd30eb9ed568e1a80f94b549f","56a92c80cff37ea54351d46cada65986b0e014eaff3fc75df3ca8ba105a9d1cd","49a27db4f60dd71b620774d13be3b54dfadea1e65e57e6eaf8a580992df03ef5"],"pattern":["20959d7beeef7fa99e09a173694c6d2c34644997a9d60fbc4dbd8f2f2ff80851","5ca1b0ac0b1fbd2a1ba157d96c7334543e3d3ccf2b5d2018e1b2d47b438eef6c","188b0b420241f2defe0b7cd4bb64fc1180fd92bda90e8c3967e3bb991d55d6cc","b9262c823f84bd6fb47dc3330ab99402de809e514b696c1e2691c0f66a37b62f","816b0bfe47a9b684c20ddcc10d83be30806bf102d7dbaa03bce8fec5b23474a4","2bac20b26ff91f904c67f6e2c3eab4222befabbcbe770a9c7a641dcf6d8f55ad","5f8816ba5539ed3f61367f2fe668d14dfa0281462af94058706f6c4826897e16"],"mixer":["54a41cdc4327fc2a543460c51f487ce80eea3d0fd635f0c682c74f03f4d9352e","4b22921c6d7704c771fec84fe3cfc9b78022902bbe8e2423055705ef73c5b6c4","2c519e1ae01d548aaee1727303c7064dd363d0cb9934a230b7f5739fda3743ae","746f29c88138c478ab765c36a029b97b66d4579343c2f185b9e7fda69b0763ec"],"mixer-wand":["bf45f2fea136795d9555c8377a76527f9efdf76856aecf183ee5c3e6c5345f3c","ab251c7b6ea41287f5b777c4a04bd3d4e76938d79fee7d96c74c9acf723a3aab"],"eraser":["374ea8caeb5c5480c1b7fe546edd27b15399c3d8bdc4024c15e3fb800e95960d","35161a6a2afa98b214cdeefc8bc2fdaa7acc8520ead6dd7c8c5dd08bfb107701","cb4173113877b8f46dd74abe365b4df1471efbc6ea806fd82389731b5251b14c","f41ba3814c39fce9f09d90fb515f401540d98c99afad1d550881085a82d32626"],"grab":["299c39e967ee2cf3473e22a92b2cef2829bc143d5fdb7e219845c3b4b30739be"],"scissors":["17272f78cfdf8515fc6f7562597a8115373c3749bc57a4250f8de1438cfceed8","56b832113f34bcd1c0497ac109b2f0c6cf07f226106c6507416018c4d00d4c91","4c6dfcc5495119def98f12ff79d0e89353b46dc21177528b46b1b8e06c3f8854"]};

test('all clean tray pages exactly retain source options and omit only primary actor scripts', async ({ page }) => {
  await install(page);
  const original = await (await page.request.get('/original/ui/trays.json')).json();
  for (const [view, hashes] of Object.entries(sourceBackdropHashes)) {
    const backdrop = page.toolManifest.backdrops[view];
    expect(backdrop, `${view}: missing clean-page integration`).toBeTruthy();
    expect(backdrop.rect).toEqual([113, 608, 817, 168]);
    expect(backdrop.pages).toHaveLength(hashes.length);
    expect(backdrop.pages).toHaveLength(original.trays[view].pages.length);
    for (const [index, value] of backdrop.pages.entries()) {
      const response = await page.request.get(`/original/ui/${value.image}`);
      expect(response.ok()).toBe(true);
      const png = PNG.sync.read(await response.body());
      expect([png.width, png.height]).toEqual([817, 168]);
      expect(digest(png.data), `${view} row${index + 1}: source-composed clean backdrop`).toBe(hashes[index]);
    }
  }
});

for (const [index, tool, rest] of [[0, 'scissors', 18131], [1, 'grab', 18128]]) {
  for (const [phase, offset] of [['rest', 0], ['tracking', 1], ['hover', 2]]) {
    test(`grab/${tool}: ${phase} source cue deadline, ownership and sound-gated end hold`, async ({ page }) => {
      await install(page, { heldAudio: true });
      await openTray(page, 'grab');
      const peer = index === 0 ? 'grab' : 'scissors';
      await action(page, `tool:${peer}`).focus(); await page.keyboard.press('Enter');
      await action(page, 'tray:text').click();
      await page.evaluate(() => { window.toolSounds.length = 0; });
      await openTray(page, 'grab');
      const script = rest + offset, oracle = sourceScripts[script];
      const [x, y, w, h] = sourceRegions[rest];
      if (phase !== 'rest') await page.mouse.move(...await point(page, x + w / 2, y + h / 2));
      if (phase === 'tracking') await page.mouse.down();
      const cue = oracle.sounds[0];
      const sounds = () => page.evaluate(sound => window.toolSounds.filter(audio =>
        new URL(audio.src, location.href).pathname.endsWith(`/${sound}.wav`)).map(audio => ({ paused: audio.paused, plays: audio.plays })), cue.sound);
      for (let tick = 0; tick < oracle.endCheckTick; tick++) {
        if (tick) await page.clock.runFor(112);
        expect(await item(page, 'grab', index)).toMatchObject({ script, frameIndex: tick, finished: false });
        expect(await sounds()).toEqual(tick < cue.tick ? [] : [{ paused: false, plays: 1 }]);
      }
      await page.clock.runFor(448);
      expect(await item(page, 'grab', index)).toMatchObject({ script, frameIndex: oracle.groups - 1, finished: false });
      if (phase === 'tracking') {
        await page.mouse.up();
        expect(await item(page, 'grab', index)).toMatchObject({ state: 3, script, frameIndex: oracle.groups - 1 });
        expect(await sounds()).toEqual([{ paused: false, plays: 1 }]);
      }
      await page.evaluate(sound => {
        for (const audio of window.toolSounds) if (new URL(audio.src, location.href).pathname.endsWith(`/${sound}.wav`)) {
          audio.ended = true; audio.dispatchEvent(new Event('ended'));
        }
      }, cue.sound);
      await page.clock.runFor(112);
      if (phase === 'hover') expect(await item(page, 'grab', index)).toMatchObject({ script: rest, auxiliary: false });
      else expect(await item(page, 'grab', index)).toMatchObject({ script, finished: true });
      await page.evaluate(() => { window.previousToolSounds = [...window.toolSounds]; });
      await action(page, 'tray:text').click();
      expect(await page.evaluate(() => window.previousToolSounds.every(audio => audio.paused || audio.ended))).toBe(true);
      await expect(allActors(page)).toHaveCount(0);
      expect(page.motionErrors).toEqual([]);
    });
  }

  for (const event of ['pointercancel', 'lostpointercapture', 'blur']) {
    test(`grab/${tool}: ${event} cancels tracking and permits keyboard retry`, async ({ page }) => {
      await install(page, { heldAudio: true });
      await openTray(page, 'grab');
      await action(page, `tool:${index === 0 ? 'grab' : 'scissors'}`).focus(); await page.keyboard.press('Enter');
      // Selecting the peer can change Hand/Scissors pages asynchronously.
      // Attach the event probe only to the final, rebound controls.
      await expect(actor(page, 'grab')).toBeVisible();
      const control = action(page, `tool:${tool}`);
      await control.evaluate(node => node.addEventListener('pointerdown', event => { node.dataset.testPointer = event.pointerId; }));
      const [x, y, w, h] = sourceRegions[rest];
      await page.mouse.move(...await point(page, x + w / 2, y + h / 2)); await page.mouse.down();
      await page.mouse.move(...await point(page, x + w / 2 + 1, y + h / 2));
      expect(await item(page, 'grab', index)).toMatchObject({ state: 1 });
      expect(await control.evaluate(node => node.hasPointerCapture(Number(node.dataset.testPointer)))).toBe(true);
      await control.evaluate((node, event) => {
        const pointerId = Number(node.dataset.testPointer);
        if (event === 'blur') window.dispatchEvent(new Event('blur'));
        else if (event === 'lostpointercapture') node.releasePointerCapture(pointerId);
        else node.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true }));
      }, event);
      await moveOutside(page); await page.mouse.up();
      expect(await item(page, 'grab', index)).toMatchObject({ state: 0, script: rest, auxiliary: false });
      await expect(action(page, `tool:${index === 0 ? 'grab' : 'scissors'}`)).toHaveAttribute('aria-pressed', 'true');
      await control.focus(); await page.keyboard.down('Space');
      await page.clock.runFor(224);
      const held = await item(page, 'grab', index);
      await page.keyboard.up('Space');
      await expect(actor(page, 'grab')).toBeVisible();
      expect(await item(page, 'grab', index)).toMatchObject({ state: 3, script: held.script, frameIndex: held.frameIndex });
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      expect(page.motionErrors).toEqual([]);
    });
  }
}

test('Grab and every Scissors page retain one owner through view switches and held-input rerenders', async ({ page }) => {
  await install(page);
  await openTray(page, 'grab'); await loadOracle(page, 'grab');
  await actor(page, 'grab').evaluate(node => { window.savedMotionActor = node; });
  await action(page, 'tool:scissors').focus(); await page.keyboard.press('Enter');
  await expect(actor(page, 'grab')).toBeVisible();
  await page.clock.runFor(224);
  const before = await snap(page, 'grab');
  for (const value of ['page:1', 'page:1', 'page:-1', 'page:-1']) {
    await action(page, value).click(); await expect(actor(page, 'grab')).toBeVisible();
    expect(await actor(page, 'grab').evaluate(node => node === window.savedMotionActor)).toBe(true);
    expect(await snap(page, 'grab')).toEqual(before);
    await expectPixels(page, 'grab', { composite: true });
  }
  // Hold Hand while the other actor remains selected, rerender the Scissors
  // page, then commit once into the Hand view without restarting its script.
  await action(page, 'tool:grab').focus(); await page.keyboard.down('Space');
  await page.clock.runFor(224);
  const hand = await item(page, 'grab', 1);
  await action(page, 'page:1').evaluate(node => node.click());
  await expect(actor(page, 'grab')).toBeVisible();
  await expect(action(page, 'tool:grab')).toBeFocused();
  expect(await item(page, 'grab', 1)).toEqual(hand);
  await page.keyboard.up('Space'); await expect(actor(page, 'grab')).toBeVisible();
  expect(await item(page, 'grab', 1)).toMatchObject({ state: 3, script: hand.script, frameIndex: hand.frameIndex });
  expect(await actor(page, 'grab').evaluate(node => node === window.savedMotionActor)).toBe(true);
  await expectPixels(page, 'grab', { composite: true });
  // A captured Scissors press crosses a real color rerender before mouseup.
  await action(page, 'tool:scissors').hover(); await page.mouse.down();
  await page.clock.runFor(224);
  await openClockPalette(page);
  const scissors = await item(page, 'grab', 0);
  await page.locator('#custom-color').evaluate(input => { input.value = '#0080ff'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await item(page, 'grab', 0)).toEqual(scissors);
  await page.mouse.up(); await expect(actor(page, 'grab')).toBeVisible();
  expect(await item(page, 'grab', 0)).toMatchObject({ state: 3, script: scissors.script, frameIndex: scissors.frameIndex });
  await closeClockPalette(page);
  await expectPixels(page, 'grab', { composite: true });
  expect(page.motionErrors).toEqual([]);
});

test('animated Hand preserves real object selection and dragging across Scissors view changes', async ({ page }) => {
  await install(page);
  await action(page, 'tray:stickers').click();
  const tile = page.locator('#library-tray [data-asset][draggable="true"]').first();
  await expect(tile).toBeVisible();
  await tile.dragTo(page.locator('#paper-canvas'), { targetPosition: { x: 360, y: 240 } });
  const object = page.locator('#objects .scene-object');
  await expect(object).toHaveCount(1); await expect(actor(page, 'grab')).toBeVisible();
  const rect = () => object.evaluate(node => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top) }));
  const original = await rect();
  await action(page, 'tool:scissors').focus(); await page.keyboard.press('Enter');
  await expect(actor(page, 'grab')).toBeVisible();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool', 'scissors');
  let releaseBackdrop;
  const backdropGate = new Promise(resolve => { releaseBackdrop = resolve; });
  const delayedBackdrop = '**/tool-motion/backdrops/scissors-2.png*';
  await page.route(delayedBackdrop, async route => { await backdropGate; await route.continue(); });
  try {
    await action(page, 'page:1').click();
    await expect(actor(page, 'grab')).toBeHidden();
    // Focus the usable static fallback while the new page decodes. The later
    // ready render must retain it even before motion indexes have been bound.
    await action(page, 'tool:grab').focus();
    releaseBackdrop();
    await expect(actor(page, 'grab')).toBeVisible();
    await expect(action(page, 'tool:grab')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(action(page, 'tool:grab')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    releaseBackdrop();
    await page.unroute(delayedBackdrop);
  }
  const box = await object.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 47, box.y + box.height / 2 + 29, { steps: 5 }); await page.mouse.up();
  const moved = await rect();
  expect(moved.x).toBeCloseTo(original.x + 47, 1); expect(moved.y).toBeCloseTo(original.y + 29, 1);
  await expect(object).toHaveClass(/is-selected/);
  await page.locator('#paper-canvas').focus(); await page.keyboard.press('ControlOrMeta+z');
  expect(await rect()).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z'); expect(await rect()).toEqual(moved);
  await action(page, 'tray:draw').click(); await openTray(page, 'grab');
  await expect(action(page, 'tool:grab')).toHaveAttribute('aria-pressed', 'true');
  expect(await item(page, 'grab', 1)).toMatchObject({ state: 3, script: 18129 });
  expect(await rect()).toEqual(moved);
  expect(page.motionErrors).toEqual([]);
});

test('Grab delayed bundle cancellation cannot publish a late actor or cue and reentry retries', async ({ page }) => {
  await install(page, { heldAudio: true });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  await page.route(/\/tool-motion\/grab\/sprites\.bin(?:\?|$)/, async route => {
    held = true;
    await gate;
    try { await route.continue(); } catch { /* Owner switch aborted this request. */ }
  });
  await action(page, 'tray:grab').click();
  await expect.poll(() => held).toBe(true);
  await action(page, 'tray:text').click();
  release();
  await page.clock.runFor(512);
  await expect(allActors(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.toolSounds.filter(audio => /\/grab\//.test(audio.src)))).toEqual([]);
  await openTray(page, 'grab');
  expect(await item(page, 'grab', 1)).toMatchObject({ state: 3, script: 18129 });
  expect(page.motionErrors).toEqual([]);
});

test('Grab separate PNG/raw fallback loads both actors when gzip decompression is unavailable', async ({ page }) => {
  await page.addInitScript(() => { window.DecompressionStream = undefined; });
  const requests = [];
  page.on('request', request => { if (/\/tool-motion\/grab\//.test(request.url())) requests.push(request.url()); });
  await install(page); await openTray(page, 'grab'); await loadOracle(page, 'grab');
  expect(requests.filter(path => /\.argb(?:\?|$)/.test(path))).toHaveLength(29);
  expect(requests.filter(path => /\.png(?:\?|$)/.test(path))).toHaveLength(29);
  // loadOracle's separate API request is outside page network observations.
  expect(requests.filter(path => /sprites\.bin/.test(path))).toHaveLength(0);
  await expectPixels(page, 'grab', { composite: true });
  await action(page, 'tool:scissors').focus(); await page.keyboard.press('Enter');
  await expect(actor(page, 'grab')).toBeVisible();
  await page.clock.runFor(224); await expectPixels(page, 'grab', { composite: true });
  expect(page.motionErrors).toEqual([]);
});

test('animated Scissors retain actual raster selection and move behavior', async ({ page }) => {
  await install(page);
  await action(page, 'tool:marker').focus(); await page.keyboard.press('Enter');
  const paper = page.locator('#paper-canvas');
  await expect(paper).toHaveAttribute('data-paint-ready', 'ready');
  const bounds = await paper.boundingBox();
  const at = (x, y) => [bounds.x + x * bounds.width / 720, bounds.y + y * bounds.height / 542];
  await page.mouse.move(...at(80, 80)); await page.mouse.down();
  await page.mouse.move(...at(140, 120), { steps: 8 }); await page.mouse.up();
  const ink = () => paper.evaluate(node => node.toDataURL());
  const drawn = await ink();
  await openTray(page, 'grab');
  await action(page, 'tool:scissors').focus(); await page.keyboard.press('Enter');
  await expect(actor(page, 'grab')).toBeVisible();
  await action(page, 'style:rectangle').click();
  await page.mouse.move(...at(50, 50)); await page.mouse.down();
  await page.mouse.move(...at(180, 160), { steps: 5 }); await page.mouse.up();
  await page.mouse.move(...at(100, 100)); await page.mouse.down();
  await page.mouse.move(...at(300, 220), { steps: 5 }); await page.mouse.up();
  await action(page, 'tray:draw').click();
  expect(await ink()).not.toBe(drawn);
  await paper.focus(); await page.keyboard.press('ControlOrMeta+z');
  expect(await ink()).toBe(drawn);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await ink()).not.toBe(drawn);
  await openTray(page, 'grab');
  await expect(action(page, 'tool:scissors')).toHaveAttribute('aria-pressed', 'true');
  expect(await item(page, 'grab', 0)).toMatchObject({ state: 3, script: 18132 });
  expect(page.motionErrors).toEqual([]);
});

// Deferred acceptance for physical-iPad feedback. No browser execution in the
// resource phase. Existing source hash assertions pin every registration/raw byte.
for (const viewport of [{ width: 1024, height: 768 }, { width: 1366, height: 1024 },
  { width: 768, height: 1024 }, { width: 820, height: 1180 }]) {
  test(`iPad hover geometry ${viewport.width}x${viewport.height}: every Crayon/Marker pose and restoration`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await install(page); await openTray(page, 'draw'); await loadOracle(page, 'draw');
    for (const [index, script] of [[2, 18068], [3, 18071]]) {
      await moveOutside(page);
      const box = await page.locator('#studio').boundingBox();
      const scale = Math.min(viewport.width / 1024, viewport.height / 768);
      expect(Math.abs(box.width - 1024 * scale)).toBeLessThan(.1);
      expect(Math.abs(box.height - 768 * scale)).toBeLessThan(.1);
      expect(box.x).toBeGreaterThanOrEqual(-.1); expect(box.y).toBeGreaterThanOrEqual(-.1);
      await page.mouse.move(...await point(page, index === 2 ? 300 : 350, 700));
      for (let pose = 0; pose < sourceScripts[script].groups; pose++) {
        await advance(page, 'draw', index, script, pose);
        await expectPixels(page, 'draw');
        await expectPixels(page, 'draw', { composite: true });
        await testInfo.attach(`${script}-pose-${pose}`, { body: await page.locator('#studio').screenshot(), contentType: 'image/png' });
        if (pose + 1 < sourceScripts[script].groups) await page.clock.runFor(96);
      }
      await moveOutside(page);
      expect(await item(page, 'draw', index)).toMatchObject({ auxiliary: false });
      await expectPixels(page, 'draw'); await expectPixels(page, 'draw', { composite: true });
    }
  });
}
