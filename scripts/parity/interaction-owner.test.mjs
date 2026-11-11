import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interactionOwner} from '../../src/interaction-owner.js';
function fixture(){
 const handlers=new Map();const view={addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);}};
 const doc={defaultView:view,addEventListener(){}};const owner=interactionOwner(doc),surface={};
 const send=(type,pointerId,pointerType='mouse',detail=0)=>{const event={type,pointerType,detail,preventDefault(){this.blocked=true;},stopImmediatePropagation(){this.stopped=true;}};if(pointerId!==undefined)event.pointerId=pointerId;for(const fn of handlers.get(type)||[])fn(event);return event;};
 return {owner,surface,send};
}
test('held contact rejects remapped physical clicks but preserves semantic commands',()=>{
 const {owner,surface,send}=fixture();assert.equal(owner.claim({pointerId:77,pointerType:'pen'},surface),true);
 assert.equal(send('pointerdown',2,'touch').blocked,true);assert.equal(send('pointerup',2,'touch').blocked,true);
 assert.equal(send('click',1,'mouse',1).blocked,true);assert.equal(owner.busy(),true);
 assert.equal(send('click',-1,'',0).blocked,undefined);assert.equal(owner.busy(),true);
});
test('held mouse also rejects a compatibility click reusing its ID',()=>{
 const {owner,surface,send}=fixture();assert.equal(owner.claim({pointerId:1,pointerType:'mouse'},surface),true);
 send('pointerdown',2,'touch');send('pointerup',2,'touch');
 assert.equal(send('click',1,'mouse',1).blocked,true);assert.equal(send('click',undefined,'mouse',1).blocked,true);
});
test('original mouse release still allows its own physical click after a rejected touch',()=>{
 const {owner,surface,send}=fixture();owner.claim({pointerId:1,pointerType:'mouse'},surface);
 send('pointerdown',2,'touch');send('pointerup',2,'touch');send('click',1,'mouse',1);
 assert.equal(send('pointerup',1).blocked,undefined);owner.release(surface,1);
 assert.equal(send('click',1,'mouse',1).blocked,undefined);
 assert.equal(send('pointerdown',2,'touch').blocked,undefined);
 assert.equal(owner.claim({pointerId:2,pointerType:'touch'},surface),true);
});
test('unguarded ordinary physical clicks remain available',()=>{
 const {send}=fixture();assert.equal(send('pointerdown',1).blocked,undefined);assert.equal(send('pointerup',1).blocked,undefined);assert.equal(send('click',1,'mouse',1).blocked,undefined);
});

test('released touch quarantines its remapped mouse click, then permits a fresh down',()=>{
 const {owner,surface,send}=fixture();
 owner.reject({pointerId:2,pointerType:'touch'},{down:false,clickOnly:true});
 assert.equal(send('click',1,'mouse',1).blocked,true);
 assert.equal(send('dblclick',undefined,'mouse',2).blocked,true);
 assert.equal(send('pointerdown',1).blocked,undefined);
 assert.equal(owner.claim({pointerId:1,pointerType:'mouse'},surface),true);
 owner.release(surface,1);
 assert.equal(send('click',1,'mouse',1).blocked,undefined);
});

test('consumed released clicks retire their records for successive touch identities',()=>{
 const {owner,surface,send}=fixture();
 for(let id=2;id<1002;id++){
  owner.reject({pointerId:id,pointerType:'touch'},{down:false,clickOnly:true});
  assert.equal(send('click',id,'touch',1).blocked,true);
  assert.equal(owner.claim({pointerId:id,pointerType:'touch'},surface),true);
  owner.release(surface,id);
 }
});

test('released quarantine preserves hover and semantic clicks and expires on a fresh sequence',()=>{
 const {owner,send}=fixture();
 owner.reject({pointerId:2,pointerType:'touch'},{down:false,clickOnly:true});
 assert.equal(send('pointermove',2,'touch').blocked,undefined);
 assert.equal(send('click',undefined,'',0).blocked,undefined);
 assert.equal(send('pointerdown',4,'touch').blocked,undefined);
 assert.equal(send('click',4,'touch',1).blocked,undefined);
 assert.equal(send('click',1,'mouse',1).blocked,undefined);
});

test('released quarantine does not consume another rejected contact or change held rejection',()=>{
 const {owner,send}=fixture();
 owner.reject({pointerId:9,pointerType:'touch'});
 owner.reject({pointerId:2,pointerType:'touch'},{down:false,clickOnly:true});
 assert.equal(send('click',9,'touch',1).blocked,true);
 assert.equal(send('pointerdown',9,'touch').blocked,true);
 assert.equal(send('click',1,'mouse',1).blocked,true);
});

test('cancelled sequences without clicks retire on fresh primary contact instead of retaining old identities',()=>{
 const {owner,surface,send}=fixture();
 for(let id=2;id<1002;id++){
  send('pointerdown',id,'touch');
  assert.equal(owner.claim({pointerId:id,pointerType:'touch'},surface),true);
  owner.reject({pointerId:id,pointerType:'touch'},{down:false,clickOnly:true});
  owner.release(surface,id);
 }
 send('pointerdown',2000,'touch');
 for(let id=2;id<1002;id++){
  assert.equal(owner.claim({pointerId:id,pointerType:'touch'},surface),true);
  owner.release(surface,id);
 }
});

test('operation-rejected touch retains its remapped click disposition through release',()=>{
 const {owner,surface,send}=fixture();
 owner.reject({pointerId:73,pointerType:'touch'},{quarantineClick:true});
 assert.equal(send('pointerup',73,'touch').blocked,true);
 assert.equal(send('click',1,'mouse',1).blocked,true);
 assert.equal(send('dblclick',undefined,'mouse',2).blocked,true);
 assert.equal(owner.claim({pointerId:73,pointerType:'touch'},surface),true);
 owner.release(surface,73);
});
test('operation-rejected exact and legacy clicks consume their released record once',()=>{
 for(const [id,type] of [[73,'touch'],[undefined,'mouse']]){
  const {owner,send}=fixture();owner.reject({pointerId:73,pointerType:'touch'},{quarantineClick:true});
  send('pointerup',73,'touch');assert.equal(send('click',id,type,1).blocked,true);
  assert.equal(send('click',id,type,1).blocked,undefined);
 }
});
test('interrupted operation contacts keep one released click while default rejections stay held',()=>{
 const {owner,surface,send}=fixture();
 owner.reject({pointerId:9,pointerType:'touch'});
 owner.reject({pointerId:73,pointerType:'touch'},{quarantineClick:true});
 send('blur');assert.equal(send('click',9,'touch',1).blocked,true);
 assert.equal(send('click',1,'mouse',1).blocked,true);
 assert.equal(owner.claim({pointerId:9},surface),false);
 assert.equal(send('pointerdown',9,'touch').blocked,undefined);
 assert.equal(owner.claim({pointerId:9,pointerType:'touch'},surface),true);owner.release(surface,9);
});
test('unrelated held rejected contacts do not consume a released operation click',()=>{
 const {owner,send}=fixture();owner.reject({pointerId:73,pointerType:'touch'},{quarantineClick:true});send('pointerup',73,'touch');
 owner.reject({pointerId:9,pointerType:'touch'});assert.equal(send('click',9,'touch',1).blocked,true);
 assert.equal(send('click',1,'mouse',1).blocked,true);assert.equal(send('pointerdown',1).blocked,undefined);
 assert.equal(send('click',1,'mouse',1).blocked,undefined);
});
test('cancelled operation contacts without clicks do not retain every ended identity',()=>{
 const {owner,surface,send}=fixture();
 for(let id=2;id<1002;id++){
  send('pointerdown',id,'touch');owner.reject({pointerId:id,pointerType:'touch'},{quarantineClick:true});
  assert.equal(send('pointercancel',id,'touch').blocked,true);
 }
 send('pointerdown',2000,'touch');
 for(let id=2;id<1002;id++){assert.equal(owner.claim({pointerId:id,pointerType:'touch'},surface),true);owner.release(surface,id);}
});
