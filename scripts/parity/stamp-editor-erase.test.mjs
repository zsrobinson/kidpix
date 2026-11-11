import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalErase, paintBrowserOval, eraseRectangles, eraseInterval } from '../../src/stamp-editor-erase.js';

const expected = [[17,15,19,17],[15,13,21,19],[13,11,23,21],[11,9,25,23],[9,7,27,25],[7,5,29,27],[5,3,31,29]];
function fixture(fail) {
 let now=0, due, callback, committed='colored', preview='colored', history=['older'];
 const calls=[], audio=[];
 const hooks={width:32,height:32, prepare(){if(fail==='prepare')throw Error();},
 render(rect){calls.push([...rect]);if(fail==='render')throw Error();},
 commit(){committed='blank';preview='blank';history.push('colored');if(fail==='commit')throw Error();},
 rollback(){committed=preview='colored';history=['older'];},
 start(){audio.push('start');if(fail==='start')throw Error();},stop(){audio.push('stop');if(fail==='stop')throw Error();},
 settle(){audio.push('settle');},schedule(cb){if(fail==='schedule')throw Error();callback=cb;due=now+66;return cb;},unschedule(){callback=null;}};
 const op=normalErase(hooks);
 return {op,calls,audio,get state(){return [committed,preview,history];}, deliver(time){now=time;if(callback&&now>=due){const cb=callback;callback=null;cb();}},get callback(){return callback;}};
}
test('source scheduling pins: immediate mutation, equality ready, one step per stalled delivery and seven intervals',()=>{
 const f=fixture();assert.deepEqual(f.calls,expected.slice(0,1));assert.deepEqual(f.state,['colored','colored',['older']]);
 f.deliver(65);assert.equal(f.calls.length,1);f.deliver(66);assert.equal(f.calls.length,2);
 f.deliver(10000);assert.equal(f.calls.length,3);f.deliver(10065);assert.equal(f.calls.length,3);
 for(let i=1;i<=4;i++)f.deliver(10000+66*i);
 assert.deepEqual(f.calls,expected);assert.deepEqual(f.state,['colored','colored',['older']]);
 f.deliver(10330);assert.deepEqual(f.state,['blank','blank',['older','colored']]);
 assert.equal(f.op.active,false);assert.deepEqual(f.audio,['start','stop','settle']);
});
test('cancel discards temporary operation and stale callback cannot commit',()=>{
 const f=fixture(), late=f.callback;f.op.cancel();late();f.deliver(9000);f.op.cancel();
 assert.deepEqual(f.state,['colored','colored',['older']]);assert.equal(f.calls.length,1);assert.deepEqual(f.audio,['start','stop','settle']);
});
for(const failure of ['prepare','render','schedule','commit','start','stop'])test(`transaction ${failure} failure cannot strand editor`,()=>{
 const f=fixture(failure);for(let i=1;i<=8;i++)f.deliver(i*66);
 assert.equal(f.op.active,false);assert.equal(f.callback,null);assert.equal(f.audio.at(-1),'settle');
 assert.deepEqual(f.state,failure==='start'||failure==='stop'?['blank','blank',['older','colored']]:['colored','colored',['older']]);
});
test('unsupported geometry fails before allocating or starting audio',()=>{
 assert.throws(()=>normalErase({width:16,height:32,prepare(){assert.fail();}}),/Unsupported/);
});
test('browser pixel-center policy has no antialiasing and uses TOP LEFT BOTTOM RIGHT',()=>{
 assert.deepEqual(eraseRectangles,expected);
 const pixels=[];const context={fillRect(x,y,w,h){assert.equal(w,1);assert.equal(h,1);pixels.push([x,y]);}};
 paintBrowserOval(context,expected[0]);assert.equal(context.fillStyle,'#ffffff');
 assert.deepEqual(pixels,[[15,17],[16,17],[15,18],[16,18]]);
 const broad=[];paintBrowserOval({fillRect(x,y){broad.push([x,y]);}},expected[1]);
 assert.equal(broad.length,32);assert.ok(broad.every(([x,y])=> x>=13&&x<19&&y>=15&&y<21));
});

test('default timer schedules exactly 66ms and rearms from delivery, independent of UI/audio gates',()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let now=0,next,id=0,steps=0,commits=0;
 globalThis.setTimeout=(callback,delay)=>{assert.equal(delay,66);next={callback,due:now+delay,id:++id};return id;};
 globalThis.clearTimeout=handle=>{if(next?.id===handle)next=null;};
 function deliver(time){now=time;if(next&&next.due<=now){const cb=next.callback;next=null;cb();}}
 try{
  assert.equal(eraseInterval,66);
  const op=normalErase({width:32,height:32,prepare(){},render(){steps++;},commit(){commits++;},rollback(){}});
  assert.equal(steps,1);deliver(65);assert.equal(steps,1);deliver(66);assert.equal(steps,2);
  deliver(9000);assert.equal(steps,3);assert.equal(next.due,9066);deliver(9065);assert.equal(steps,3);
  const late=next.callback;op.cancel();late();assert.equal(steps,3);assert.equal(commits,0);assert.equal(next,null);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
