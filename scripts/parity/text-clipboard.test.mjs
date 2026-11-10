import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextClipboard } from '../../src/text-clipboard.js';
import { actionTarget, actionStates } from '../../src/native-action-motion.js';
import { createActionStateController, policyFor } from '../../src/native-action-state.js';
import { existsSync, readFileSync } from 'node:fs';

function harness(text = 'A😀BCD', publish) {
  let selection, revision = 1, epoch = 1, editable = true, id = 'A';
  const doc = { getSelection: () => selection };
  const node = { nodeType: 3, nodeName: '#text', data: text, get length() { return this.data.length; } };
  let editor = { nodeType: 1, nodeName: 'DIV', childNodes: [node], ownerDocument: doc, contains: n => n === node };
  const history = [];
  function range(anchor, focus) { selection = { rangeCount: 1, anchorNode: node, focusNode: node, anchorOffset: anchor, focusOffset: focus }; }
  range(5, 1);
  const clipboard = createTextClipboard({ current: () => ({ editor, revision, id, editable }), epoch: () => epoch, publish,
    replace(token, next) { history.push({ before: token, after: next }); node.data = next.text; revision++; range(next.anchor, next.focus); return true; } });
  return { clipboard, node, history, range, get selection() { return selection; },
    change: key => { if (key === 'revision') revision++; if (key === 'epoch') epoch++; if (key === 'id') id = 'B';
      if (key === 'editor') editor = { ...editor }; if (key === 'unavailable') editable = false; if (key === 'available') editable = true;
      if (key === 'text') node.data += '!'; if (key === 'chrome') selection = null; } };
}
test('directional Copy preserves selection; Cut publishes exact span; Paste inserts with one transaction each', () => {
  const publications = [], h = harness(undefined, p => { publications.push(p); return true; });
  const token = h.clipboard.target(), selection = h.selection;
  assert.ok(Object.isFrozen(token)); assert.equal(h.clipboard.perform('copy',token),true);
  assert.deepEqual(publications,[{type:'text/plain',text:'😀BC'}]);
  assert.equal(h.selection,selection); assert.equal(h.history.length,0);
  assert.equal(h.clipboard.perform('cut',token),true); assert.equal(h.node.data,'AD');
  assert.deepEqual([h.selection.anchorOffset,h.selection.focusOffset],[1,1]);
  assert.equal(h.clipboard.perform('paste'),true); assert.equal(h.node.data,'A😀BCD');
  assert.equal(h.history.length,2); assert.equal(h.history[0].before.anchor,5);
  assert.deepEqual([h.selection.anchorOffset,h.selection.focusOffset],[5,5]);
});
test('collapsed commands preserve clipboard and history; no editor and empty clipboard never replace', () => {
  const h = harness(); h.range(2,2);
  for(const a of ['cut','copy','paste']) assert.equal(h.clipboard.perform(a),false);
  h.range(0,1); h.clipboard.perform('copy'); h.range(3,3);
  assert.equal(h.clipboard.perform('cut'),false); assert.equal(h.clipboard.perform('paste'),true);
  assert.equal(h.node.data,'A😀ABCD'); h.change('unavailable');
  for(const a of ['cut','copy','paste']) assert.equal(h.clipboard.perform(a),false);
  assert.equal(h.history.length,1);
});
for(const failure of [()=>false,()=>{throw Error('unavailable');}]) test('publication failure cannot delete or make Paste available',()=>{
  const h=harness(undefined,failure); assert.equal(h.clipboard.perform('cut'),false);
  assert.equal(h.node.data,'A😀BCD'); assert.equal(h.history.length,0); assert.equal(h.clipboard.capabilities().paste,false);
});
for(const change of ['revision','epoch','id','editor','text','unavailable']) test(`captured range rejects changed ${change}`,()=>{
  const h=harness(), token=h.clipboard.target(); h.change(change);
  assert.equal(h.clipboard.perform('cut',token),false); assert.equal(h.history.length,0);
});
test('surrogate edges expand a range; collapsed insertion moves after pair',()=>{
  const h=harness(); h.range(2,3); h.clipboard.perform('cut'); assert.equal(h.node.data,'ABCD');
  h.range(0,0); h.clipboard.perform('paste'); assert.equal(h.node.data,'😀ABCD');
  h.range(1,1); h.clipboard.perform('paste'); assert.equal(h.node.data,'😀😀ABCD');
});
test('chrome retains exact range; document clear discards payload and retained range',()=>{
  const h=harness(); const token=h.clipboard.target(); h.change('chrome'); assert.deepEqual(h.clipboard.target(),token);
  h.clipboard.perform('copy',token); h.clipboard.clear(); assert.equal(h.clipboard.target(),null); assert.equal(h.clipboard.perform('paste'),false);
});
test('Paste generation invalidates only Paste gestures and capability art stays momentary',()=>{
  const a={target:'A',textIdentity:'range',textClipboardGeneration:1},b={...a,textClipboardGeneration:2};
  for(const action of ['bold','voice-step:1','edit:cut','text-clipboard:copy']) assert.equal(actionTarget(a,action),actionTarget(b,action));
  assert.notEqual(actionTarget(a,'text-clipboard:paste'),actionTarget(b,'text-clipboard:paste'));
  assert.deepEqual(actionStates({buttons:[{action:'text-clipboard:cut',policy:policyFor(9383,12)}]}, {textCapabilities:{cut:false}}),[{active:false,disabled:true}]);
});
test('independent nine source programs: tracking redraws same sprite and plays each cue once at 100ms',()=>{
  const pins=JSON.parse(readFileSync('tests/fixtures/text-clipboard-source.json'));
  for(const row of pins.rows){
    const plays=[],c=createActionStateController({buttons:[{...row,policy:policyFor(9383,row.index)}],scripts:pins.programs},{now:()=>0,playSound:cue=>{plays.push(cue);return {isComplete:()=>true,stop(){}};}});
    assert.equal(c.press(0,0),true); assert.equal(c.snapshot()[0].mode,0);
    const pose=c.snapshot()[0].frame.parts; c.step(99);assert.equal(plays.length,0); c.step(100);
    assert.deepEqual(c.snapshot()[0].frame.parts,pose); assert.equal(c.snapshot()[0].frameIndex,1);
    c.step(200);c.step(300);assert.equal(plays.length,1);assert.equal(plays[0].sound,pins.programs[row.stateScripts[1]].sounds[0].sound);
    assert.equal(c.release(true,301).binding,['text-clipboard:cut','text-clipboard:copy','text-clipboard:paste'][row.index-12]);
    assert.equal(c.snapshot()[0].state,0);c.dispose();
  }
});
test('invalid action and transient unavailability cannot revive a captured range',()=>{
  const h=harness(),token=h.clipboard.target();assert.equal(h.clipboard.perform('constructor',token),false);
  h.change('unavailable');assert.equal(h.clipboard.target(),null);h.change('available');
  assert.equal(h.clipboard.perform('cut',token),false);assert.equal(h.history.length,0);
});

test('imported source assets match independent archive subset, including complete programs and kind1 regions', {
  skip: !existsSync('public/original/ui/secondary-motion/manifest.json') && 'Source media unavailable',
},()=>{
  const pins=JSON.parse(readFileSync('tests/fixtures/text-clipboard-source.json'));
  const manifest=JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
  for(const row of pins.rows){
    const actual=manifest.tables[9383].buttons[row.index];assert.deepEqual(actual.rawWords,row.rawWords);assert.deepEqual(actual.region,row.region);
    assert.equal(row.region.sourceKind,1);assert.equal(row.region.status,'exact');
    for(const pose of row.region.initialScriptBounds) for(const part of pose.parts){
      const sprite=pins.sprites[`18000:${part.image}`], clip=pins.programs[pose.script];
      const x=clip.originXY[0]+part.sourceXY[0]-part.registrationXY[0],y=clip.originXY[1]+part.sourceXY[1]-part.registrationXY[1];
      assert.deepEqual(part.rectLTRB,[x,y,x+sprite.width,y+sprite.height]);
    }
  }
  for(const [id,pin] of Object.entries(pins.programs))for(const key of ['tickMs','endCheckTick','frames','sounds','sourceSha256','events'])assert.deepEqual(manifest.scripts[id][key],pin[key]);
  for(const [id,hash] of Object.entries(pins.soundSourceHashes))assert.equal(manifest.sounds[id].sourceSha256,hash);
});
