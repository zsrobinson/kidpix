import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../../src/scene.js';

// Minimal DOM protocol, deliberately independent of the range/history adapter.
// Real browser focus/default editing and rendering remain in deferred specs.
class Element extends EventTarget {
  constructor(doc, name='DIV') { super(); this.ownerDocument=doc; this.nodeType=1; this.nodeName=name; this.childNodes=[];this.dataset={};this.style={};this.classList={add(){},contains:()=>false}; }
  get children(){return this.childNodes.filter(n=>n.nodeType===1);}
  append(n){this.childNodes.push(n);n.parentNode=this;}
  replaceChildren(...nodes){this.childNodes=[];nodes.forEach(n=>this.append(n));}
  setAttribute(){}
  set textContent(data){this.replaceChildren(); const n={nodeType:3,nodeName:'#text',data,length:data.length,parentNode:this};this.append(n);}
  contains(n){return this===n || this.childNodes.some(c=>c===n || c.contains?.(n));}
  querySelector(selector){return this.children.find(n=>selector==='.object-text'?n.className==='object-text':false) ?? this.children.map(n=>n.querySelector(selector)).find(Boolean);}
  focus(){if(this.ownerDocument.activeElement===this)return;this.ownerDocument.activeElement?.blur();this.ownerDocument.activeElement=this;this.dispatchEvent(new Event('focus'));}
  blur(){this.dispatchEvent(new Event('blur'));this.ownerDocument.activeElement=null;}
}
function fixture(){
  const doc=new EventTarget(),view=new EventTarget();view.AbortController=AbortController;doc.defaultView=view;
  const selection={rangeCount:0,setBaseAndExtent(a,ao,f,fo){Object.assign(this,{rangeCount:1,anchorNode:a,anchorOffset:ao,focusNode:f,focusOffset:fo});}};
  doc.getSelection=()=>selection;doc.createElement=()=>new Element(doc);globalThis.document=doc;globalThis.cancelAnimationFrame=()=>{};
  const root=new Element(doc),surface=new Element(doc),history=[];
  const scene=createScene(root,surface,(before,after,ranges)=>history.push({before,after,ranges}));
  const objects=['A','B'].map((id,i)=>({id,kind:'text',text:i?'Other':'abc',x:i*100,y:0,width:100,height:100}));
  scene.restore(objects);scene.chooseMode('text');
  const editor=()=>root.children[0].querySelector('.object-text');
  const range=(a,f)=>{editor().focus();selection.setBaseAndExtent(editor().childNodes[0],a,editor().childNodes[0],f);};
  const readRange=()=>[selection.anchorOffset,selection.focusOffset];
  return {scene,history,editor,range,readRange,root};
}
test('scene flushes typing once; Cut/Paste each own exact selection and model history; blur adds nothing',()=>{
  const h=fixture();h.range(3,3);h.editor().dispatchEvent(new Event('beforeinput'));
  h.editor().textContent='abcdef';h.range(5,2);h.editor().dispatchEvent(new Event('input'));
  assert.equal(h.scene.textClipboard.perform('cut'),true);assert.equal(h.history.length,2);
  assert.deepEqual(h.scene.snapshot().map(o=>[o.id,o.text]),[['A','abf'],['B','Other']]);assert.deepEqual(h.readRange(),[2,2]);
  assert.equal(h.scene.textClipboard.perform('paste'),true);assert.equal(h.history.length,3);assert.deepEqual(h.readRange(),[5,5]);
  h.editor().blur();assert.equal(h.history.length,3);
  for(const [index,expected,range] of [[2,'abf',[2,2]],[1,'abcdef',[5,2]],[0,'abc',[3,3]]]){
    const entry=h.history[index];h.scene.restore(entry.before,{history:true,textSelection:entry.ranges.before});
    assert.equal(h.scene.snapshot()[0].text,expected);assert.deepEqual(h.readRange(),range);assert.equal(h.history.length,3);
  }
  for(const [index,expected,range] of [[0,'abcdef',[5,2]],[1,'abf',[2,2]],[2,'abcdef',[5,5]]]){
    const entry=h.history[index];h.scene.restore(entry.after,{history:true,textSelection:entry.ranges.after});
    assert.equal(h.scene.snapshot()[0].text,expected);assert.deepEqual(h.readRange(),range);assert.equal(h.history.length,3);
  }
  assert.equal(h.scene.textClipboard.capabilities().paste,true);h.scene.destroy();
});
test('all-character Cut retains empty object; switching trays retains payload; replacement clears it',()=>{
  const h=fixture();h.range(3,0);h.scene.textClipboard.perform('cut');
  assert.deepEqual(h.scene.snapshot().map(o=>[o.id,o.text]),[['A',''],['B','Other']]);h.editor().blur();assert.equal(h.history.length,1);
  h.scene.chooseMode('grab');h.scene.chooseMode('text');h.range(0,0);assert.equal(h.scene.textClipboard.perform('paste'),true);
  assert.equal(h.scene.snapshot()[0].text,'abc');const token=h.scene.textClipboard.target();
  h.scene.restore(h.scene.snapshot());assert.equal(h.scene.textClipboard.perform('cut',token),false);
  h.range(0,0);assert.equal(h.scene.textClipboard.capabilities().paste,false);h.scene.destroy();
});
test('failed DOM transaction rolls text back without range history; disposed scene cannot accept commands',()=>{
  const h=fixture();h.range(3,0);const token=h.scene.textClipboard.target();
  const selection=h.root.ownerDocument.getSelection(),set=selection.setBaseAndExtent;
  selection.setBaseAndExtent=()=>{throw Error('selection unavailable');};
  assert.equal(h.scene.textClipboard.perform('cut',token),false);assert.equal(h.scene.snapshot()[0].text,'abc');assert.equal(h.history.length,0);
  selection.setBaseAndExtent=set;h.range(0,0);assert.equal(h.scene.textClipboard.perform('paste'),true);
  h.scene.destroy();assert.equal(h.scene.textClipboard.target(),null);assert.equal(h.scene.textClipboard.perform('paste'),false);
});
test('object clipboard is independent and retained text payload can paste into a second box',()=>{
  const h=fixture();h.range(0,3);h.scene.edit('copy');h.range(0,3);h.scene.textClipboard.perform('copy');
  const second=h.root.children[1].querySelector('.object-text');second.focus();
  h.root.ownerDocument.getSelection().setBaseAndExtent(second.childNodes[0],1,second.childNodes[0],4);
  assert.equal(h.scene.textClipboard.perform('paste'),true);
  assert.deepEqual(h.scene.snapshot().map(o=>[o.id,o.text]),[['A','abc'],['B','Oabcr']]);
  h.scene.chooseMode('grab');h.scene.edit('paste');
  assert.equal(h.scene.snapshot().length,3);assert.equal(h.scene.snapshot()[2].text,'abc');assert.equal(h.scene.snapshot()[2].x,12);
  h.scene.destroy();
});
