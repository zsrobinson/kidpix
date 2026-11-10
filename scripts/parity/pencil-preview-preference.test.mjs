import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPencilPreviewPreference, PENCIL_PREVIEW_KEY } from '../../src/pencil-preview-preference.js';

test('only exact explicit true enables browser preference; reads have no effects', () => {
  for (const value of [null, '', 'false', '1', 'TRUE', '{}', 'true']) {
    let reads = 0, writes = 0;
    const preference = createPencilPreviewPreference(() => ({ getItem(key) { assert.equal(key, PENCIL_PREVIEW_KEY); reads++; return value; }, setItem() { writes++; } }));
    assert.equal(preference.enabled, value === 'true');
    assert.equal(preference.enabled, value === 'true');
    assert.equal(reads, 1); assert.equal(writes, 0);
  }
});
test('explicit choice persists and blocked storage retains session choice', () => {
  let saved;
  const storage = () => ({ getItem: () => saved, setItem: (key, value) => { assert.equal(key, PENCIL_PREVIEW_KEY); saved = value; } });
  const preference = createPencilPreviewPreference(storage);
  assert.equal(preference.toggle(), true);
  assert.equal(createPencilPreviewPreference(storage).enabled, true);
  assert.equal(preference.toggle(), false); assert.equal(saved, 'false');
  for (const storage of [() => { throw Error('denied'); }, () => ({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } })]) {
    const p = createPencilPreviewPreference(storage);
    assert.equal(p.enabled, false); assert.equal(p.toggle(), true); assert.equal(p.enabled, true); assert.equal(p.toggle(), false);
  }
});

test('prior readable ON survives quota write failure correctly for this instance',()=>{
 let reads=0,writes=0;
 const storage=()=>({getItem(){reads++;return 'true';},setItem(){writes++;throw Error('quota');}});
 const preference=createPencilPreviewPreference(storage);
 assert.equal(preference.enabled,true);assert.equal(preference.toggle(),false);
 for(let i=0;i<1000;i++)assert.equal(preference.enabled,false);
 assert.equal(reads,1);assert.equal(writes,1);assert.equal(preference.toggle(),true);assert.equal(reads,1);
});
