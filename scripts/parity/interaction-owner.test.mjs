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
