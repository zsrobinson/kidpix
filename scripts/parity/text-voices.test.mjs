import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceStep, voiceOptions, createVoiceCatalog } from '../../src/text-voices.js';
const voices = (...uris) => uris.map(voiceURI => ({ voiceURI, name: 'Same name' }));
test('raw order and URI identity across reorder, loss, return and duplicate identities', () => {
  const catalog = voices('b','a','c');
  assert.equal(voiceStep('a',-1,catalog),'b');
  assert.equal(voiceStep('a',1,catalog),'c');
  assert.equal(voiceStep('a',1,voices('c','a','b')),'b');
  for (const uri of ['', 'missing']) for (const direction of [-1,1]) assert.equal(voiceStep(uri,direction,catalog),null);
  for (const list of [[],voices('a'),voices('a','a','b')]) for (const direction of [-1,1]) assert.equal(voiceStep('a',direction,list),null);
  assert.equal(voiceStep('a',1,voices('a','b','b')),null);
  assert.match(voiceOptions('saved',[])[1].label,/unavailable/);
  assert.equal(voiceOptions('saved',voices('saved'))[1].value,'saved');
  assert.match(voiceOptions('a',voices('a','a'))[1].label,/ambiguous/);
});
test('empty asynchronous platform catalogs, every refresh generation, no platform objects persisted', () => {
  class Platform extends EventTarget { list = []; getVoices() { return this.list; } }
  const platform = new Platform(); let notifications = 0;
  const catalog = createVoiceCatalog(platform,()=>notifications++);
  assert.equal(catalog.generation,1); assert.deepEqual(catalog.voices,[]);
  platform.list = voices('b','a'); platform.dispatchEvent(new Event('voiceschanged'));
  assert.equal(voiceStep('b',1,catalog.voices),'a');
  platform.dispatchEvent(new Event('voiceschanged')); assert.equal(catalog.generation,3);
  platform.list = []; platform.dispatchEvent(new Event('voiceschanged'));
  assert.equal(voiceStep('b',1,catalog.voices),null);
  platform.list = voices('b','a'); platform.dispatchEvent(new Event('voiceschanged'));
  assert.equal(voiceStep('b',1,catalog.voices),'a'); assert.equal(notifications,5);
  catalog.dispose(); platform.dispatchEvent(new Event('voiceschanged')); assert.equal(notifications,5);
  assert.deepEqual(createVoiceCatalog(undefined).voices,[]);
});
