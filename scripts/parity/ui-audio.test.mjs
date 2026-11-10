import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playUiAudio, observeUiAudio } from '../../src/ui-audio.js';

function media() {
  const listeners = new Map();
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return { paused:true, ended:false, error:null, resolve, reject,
    play:()=>promise,
    addEventListener(type,fn) { if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn); },
    removeEventListener(type,fn) {listeners.get(type)?.delete(fn);},
    emit(type) {for(const fn of [...listeners.get(type)??[]])fn();},
    count:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0),
  };
}
for(const event of ['ended','error','pause','abort','emptied']) test(`${event} releases once and removes every listener`,()=>{
  const audio=media();let completed=0;
  const cleanup=observeUiAudio(playUiAudio(audio),()=>completed++);
  assert.equal(completed,0,'initial paused pending play is not completion');
  audio.emit(event);audio.emit('ended');cleanup();
  assert.equal(completed,1);assert.equal(audio.count(),0);
});
test('owned rejected play is observable without a synthetic DOM event',async()=>{
  const audio=media();let completed=0;
  observeUiAudio(playUiAudio(audio),()=>completed++);
  audio.reject(new DOMException('blocked','NotAllowedError'));
  await Promise.resolve();assert.equal(completed,1);assert.equal(audio.count(),0);
});
test('cancelled owner ignores late play rejection and stale events',async()=>{
  const old=media(), next=media();let owner=old;
  const cleanup=observeUiAudio(playUiAudio(old),()=>{if(owner===old)owner=null;});
  cleanup();owner=next;
  observeUiAudio(playUiAudio(next),()=>{if(owner===next)owner=null;});
  old.emit('pause');old.reject(new Error('replaced'));await Promise.resolve();
  assert.equal(owner,next);assert.equal(old.count(),0);
  next.emit('ended');assert.equal(owner,null);assert.equal(next.count(),0);
});
test('legacy Audio-like callers need no play promise API',()=>{
  const audio=media();let done=false;
  observeUiAudio(audio,()=>{done=true;});audio.emit('ended');assert.equal(done,true);
});

test('finite animation keeps independent channels1/2 gated until each owned sound terminates', async t => {
  const { createNativeAnimation } = await import('../../src/native-animation.js');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis,'document');
  const imageBefore = Object.getOwnPropertyDescriptor(globalThis,'Image');
  const sprite={style:{},dataset:{}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>sprite}});
  Object.defineProperty(globalThis,'Image',{configurable:true,value:class {decode(){return Promise.resolve();}}});
  t.after(()=>{
    for(const [key,value] of [['document',documentBefore],['Image',imageBefore]]) {
      if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
    }
  });
  const tasks=new Map();let id=0;const sounds=[];
  const animation=createNativeAnimation({append(){}},{hidden:false},()=>{
    const audio=media();audio.pause=()=>audio.emit('pause');sounds.push(audio);return playUiAudio(audio);
  },{url:p=>p,schedule:fn=>{tasks.set(++id,fn);return id;},cancel:key=>tasks.delete(key)});
  const advance=()=>{const work=[...tasks.values()];tasks.clear();work.forEach(fn=>fn());};
  await animation.play({script:1,rect:[0,0,1,1],frames:[{image:'frame',ticks:1}],sounds:[{tick:0,sound:1,channel:1},{tick:0,sound:2,channel:2}]},100);
  for(let i=0;i<4;i++)advance();
  assert.equal(sprite.hidden,false,'pending play holds both channels even while paused initially');
  sounds[0].emit('ended');advance();assert.equal(sprite.hidden,false,'channel2 still holds gate');
  sounds[1].emit('pause');advance();assert.equal(sprite.hidden,true);
  assert.equal(sounds[0].count()+sounds[1].count(),0);
  animation.stop();animation.stop();assert.equal(tasks.size,0);
});
