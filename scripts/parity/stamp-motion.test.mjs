import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stampProfiles, stampStates } from '../../src/native-stamp-motion.js';
import { actionManifest } from '../../src/native-action-motion.js';
import { createActionStateController } from '../../src/native-action-state.js';

// Reviewed source rows; deliberately independent of extracted artifact directories.
const rows = [
  [18700, 1, [18054,18055,0,18307],18056,[329,665,43,31],18703,1],
  [18700, 2, [18057,18058,0,18308],18059,[329,696,43,31],18704,1],
  [18700, 3, [18235,18236,0,0],18237,[490,650,61,76],18701,0],
  [18202, 0, [18226,18227,0,18227],18228,[441,653,14,14],18200,1],
  [18202, 1, [18229,18230,0,18230],18231,[437,670,22,22],18200,2],
  [18202, 2, [18232,18233,0,18233],18234,[432,696,32,32],18200,3],
];
function fixture() {
  const data = { tables: {}, scripts: {}, sprites: {}, sounds: {} };
  for (const [table,index,stateScripts,rolloverScript,boundsXYWH,command,commandArgument] of rows) {
    const [x,y,w,h] = boundsXYWH;
    (data.tables[table] ??= { buttons: [] }).buttons.push({ index, stateScripts, rolloverScript,
      command, commandArgument, group: table, rolloverParameters: [0,0,0],
      rolloverLoops: false, rolloverCancelsOnLeave: true,
      region: { status: 'exact', type: 'rectangle-union', boundsXYWH, rectsLTRB: [[x,y,x+w,y+h]] } });
    for (const id of [...stateScripts,rolloverScript].filter(Boolean)) {
      data.scripts[id] = { collection: 18000, script: id, tickMs: 100, sounds: [], endCheckTick: 2,
        frames: [0,...(id === stateScripts[1] ? [1] : [])].map(tick => ({ tick, parts: [{ sprite: id, x, y }] })) };
      data.sprites[`18000:${id}`] = { width: w, height: h };
    }
  }
  return data;
}
function owner(name, state = {}) {
  const manifest = actionManifest(fixture(), stampProfiles.find(profile => profile.name === name));
  const current = { categoryIndex: 1, categoryCount: 3, stampSize: 8, ...state };
  return { manifest, controller: createActionStateController(manifest, { now: () => 0,
    authoritative: stampStates(manifest, current) }) };
}
test('six reviewed bindings, three disjoint footprints, no category command', () => {
  assert.deepEqual(stampProfiles.map(p => p.bounds), [[329,665,43,62],[490,650,61,76],[432,653,32,75]]);
  assert.deepEqual(stampProfiles.flatMap(p => actionManifest(fixture(),p).buttons.map(b => b.action)),
    ['category-step:-1','category-step:1','stamp-edit','size:4','size:8','size:16']);
});
for (const [index,count,expected] of [[0,3,[18307,18057]],[1,3,[18054,18057]],[2,3,[18054,18308]],[0,1,[18307,18308]]]) {
  test(`category ${index}/${count} restores both actors including absent actions`, () => {
    const { controller } = owner('arrows', { categoryIndex:index, categoryCount:count });
    assert.deepEqual(controller.snapshot().map(s => s.script), expected);
    controller.snapshot().forEach((s,i) => { assert.equal(controller.press(i), !s.disabled); controller.cancel(); });
    controller.dispose();
  });
}
test('unknown/empty category never invents a selected boundary or action', () => {
  const {controller} = owner('arrows', {categoryCount:0});
  assert.deepEqual(controller.snapshot().map(s => [s.state,s.disabled]), [[0,true],[0,true]]);
});
test('boundary constructor mode survives clear/restore of slot3; arrows are independent', () => {
  const {controller} = owner('arrows', {categoryIndex:0});
  controller.setAuthoritativeState(0,{boundary:false,disabled:false});
  assert.equal(controller.snapshot()[0].mode,2);
  assert.equal(controller.press(0),true);
  controller.step(100);
  assert.equal(controller.snapshot()[0].frameIndex,1);
  assert.equal(controller.release(true).binding,'category-step:-1');
  assert.equal(controller.snapshot()[0].state,0);
  controller.setAuthoritativeState(0,{boundary:true,disabled:true});
  assert.equal(controller.snapshot()[0].script,18307);
  assert.equal(controller.snapshot()[0].frameIndex,0);
  assert.equal(controller.snapshot()[1].script,18057);
});
test('native size arguments map to 4/8/16, exclusive acknowledgement preserves shared-script progress', () => {
  const {manifest,controller} = owner('size');
  assert.deepEqual(manifest.buttons.map(b => b.commandArgument),[1,2,3]);
  assert.equal(controller.press(1),false);
  controller.press(2); controller.step(100);
  const proposal = controller.release(true);
  assert.equal(proposal.binding,'size:16');
  stampStates(manifest,{stampSize:16}).forEach((v,i) => controller.setAuthoritativeState(i,v));
  assert.deepEqual(controller.snapshot().map(s => s.state),[0,0,3]);
  assert.equal(controller.snapshot()[2].frameIndex,1);
});
test('editor accepts exactly one release; drag-out/cancel never activate', () => {
  const {controller} = owner('editor');
  controller.press(0); controller.leave(0);
  assert.equal(controller.release(false),null);
  controller.press(0); controller.cancel();
  assert.equal(controller.release(true),null);
  controller.press(0); controller.step(100);
  assert.equal(controller.release(true).binding,'stamp-edit');
  assert.equal(controller.release(true),null);
  assert.equal(controller.snapshot()[0].script,18235);
});
test('unchanged authoritative state preserves source tracking across rerenders', () => {
  const {manifest,controller} = owner('size');
  controller.press(0); controller.step(100);
  stampStates(manifest,{stampSize:8}).forEach((v,i) => controller.setAuthoritativeState(i,v));
  assert.equal(controller.snapshot()[0].frameIndex,1);
  assert.equal(controller.snapshot()[0].state,1);
  controller.cancel();
  assert.deepEqual(controller.snapshot().map(s => s.state),[0,3,0]);
});
const manifestPath = 'public/original/ui/secondary-motion/manifest.json';
test('optional real manifest pins six source hitboxes, three exact owner bounds and all registered groups',
  { skip: !fs.existsSync(manifestPath) }, () => {
    const data = JSON.parse(fs.readFileSync(manifestPath));
    let groups = 0;
    for (const profile of stampProfiles) {
      const manifest = actionManifest(data,profile);
      for (const button of manifest.buttons) {
        assert.deepEqual(button.region.boundsXYWH,rows.find(r => r[0] === profile.table && r[1] === button.index)[4]);
      }
      const parts = Object.values(manifest.scripts).flatMap(s => s.frames.flatMap(f => f.parts));
      const left = Math.min(...parts.map(p => p.x)), top = Math.min(...parts.map(p => p.y));
      assert.deepEqual([left,top,Math.max(...parts.map(p => p.x + manifest.sprites[p.sprite].width))-left,
        Math.max(...parts.map(p => p.y + manifest.sprites[p.sprite].height))-top],profile.bounds);
      groups += Object.values(manifest.scripts).reduce((n,s) => n+s.frames.length,0);
    }
    assert.equal(groups,26); // The other three of the 29 independent pins belong to static row0.
  });
