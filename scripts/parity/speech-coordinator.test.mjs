import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechCoordinator } from '../../src/speech-coordinator.js';
import { rangeText } from '../../src/editor-text.js';
function model() {
  const calls = [], engine = { getVoices: () => [{voiceURI:'a'}], speak(u) { calls.push(u); }, cancel() { this.cancels++; calls.forEach(u=>u.onerror()); }, cancels:0 };
  class Utterance { constructor(text) { this.text=text; } }
  return { engine, calls, owner:createSpeechCoordinator(engine,Utterance) };
}
test('queued/start/terminal identity, synchronous cancel callbacks and new owners',()=>{
  const {engine,calls,owner}=model();
  assert(owner.submit('TextRead',[{text:'first',voiceURI:'a'}]));
  assert.equal(owner.current.state,'queued'); calls[0].onstart(); assert.equal(owner.current.state,'started');
  owner.retire('TextRead'); assert.equal(owner.current,null); assert.equal(engine.cancels,1);
  assert(owner.submit('PicturePlay',[{text:'second'},{text:'third'}]));
  const active=owner.current; calls[0].onend(); calls[0].onerror(); assert.equal(owner.current,active);
  assert.equal(owner.submit('TextRead',[{text:'rejected'}]),false);
  calls[1].onend(); calls[1].onend(); assert.equal(owner.current,active); calls[2].onerror(); assert.equal(owner.current,null);
});
test('takeover retires Read and stale callbacks cannot clear slides',()=>{
 const {owner,calls,engine}=model(); owner.submit('TextRead',[{text:'read'}]);
 owner.submit('SlideSpeech',[{text:'slide'}]); const active=owner.current;
 calls[0].onstart(); calls[0].onerror(); owner.retire('TextRead'); assert.equal(owner.current,active); assert.equal(engine.cancels,1);
});
test('paused, unavailable voices/API and synchronous throw do not retain running',()=>{
 const {owner,engine}=model(); engine.paused=true; assert.equal(owner.submit('TextRead',[{text:'x'}]),false);
 engine.paused=false; assert.equal(owner.submit('TextRead',[{text:'x',voiceURI:'missing'}]),false);
 engine.getVoices=()=>[]; assert.equal(owner.submit('TextRead',[{text:'x'}]),false);
 engine.getVoices=()=>[{voiceURI:'a'}]; engine.speak=()=>{throw Error('blocked');};
 assert.equal(owner.submit('TextRead',[{text:'x'}]),false); assert.equal(owner.current,null);
 assert.equal(createSpeechCoordinator(null,null).submit('TextRead',[{text:'x'}]),false);
});
test('directional UTF16 offsets retain complete Unicode; collapsed uses whole box',()=>{
 const text='A😀\nB'; assert.equal(rangeText(text,4,1),'😀\n'); assert.equal(rangeText(text,2,3),'😀'); assert.equal(rangeText(text,3,3),text);
});
