import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { idleOwnerTransform, assertOwnerWindow } from './shared-pen-idle-control.mjs';

test('attribution transform gates the actual owner RAF callsite without replacing refresh or step',async()=>{
 const code=await readFile(new URL('../src/native-tool-motion.js',import.meta.url),'utf8');
 const transformed=idleOwnerTransform(code);
 assert.match(transformed,/view.cancelAnimationFrame\(raf\); sharedParked=true/);
 assert.match(transformed,/sharedParked=false; raf=view.requestAnimationFrame\(animate\)/);
 assert.match(transformed,/sharedCallbacks\+\+;\n    if\(sharedParked\)throw/);
 assert.match(transformed,/refreshState\(\);\n    owner.controller.step\(time\);\n    raf = view.requestAnimationFrame\(animate\)/);
 assert.throws(()=>idleOwnerTransform(code.replace('  let raf;','  let other;')));
});
const states=(parked,callbacks)=>Array.from({length:3},(_,i)=>({id:String(i),ready:true,finished:true,parked,callbacks}));
test('owner window accepts verified park/resume and default callback coverage',()=>{
 assertOwnerWindow(states(true,10),states(true,10),states(false,12),true);
 assertOwnerWindow(states(false,10),states(false,40),states(false,42),false);
});
test('owner window rejects absent owners, unfinished treatment, callback leaks and failed resume',()=>{
 for(const change of [a=>a[0].pop(),a=>a[0][0].finished=false,a=>a[0][0].ready=false,a=>a[1][0].callbacks++,a=>a[2][0].callbacks=10,a=>a[2][0].parked=true,a=>a[1][0].id='changed']){
  const args=[states(true,10),states(true,10),states(false,12)];change(args);assert.throws(()=>assertOwnerWindow(...args,true));
 }
 assert.throws(()=>assertOwnerWindow(states(false,10),states(false,10),states(false,12),false));
});
