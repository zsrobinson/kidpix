import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {rolloverFrameAtTick,rolloverEndReady} from '../../src/native-rollovers.js';
const oracle=JSON.parse(readFileSync(new URL('../../tests/fixtures/owner-command-motion-source.json',import.meta.url)));
const media=new URL('../../public/original/',import.meta.url);
test('mode1 rows retain native modes independently of browser reset policy',async()=>{
 const {commandMotionBindings}=await import('../../src/native-command-motion.js');
 assert.deepEqual(oracle.buttons.map(b=>b.rawWords.slice(0,4)),[[1046,1047,1047,1047],[1049,1051,1051,1051],[1079,1080,1080,1080]]);
 assert.equal(Object.keys(oracle.scripts).length,9);
 assert.equal(Object.values(oracle.scripts).reduce((n,s)=>n+s.groups.length,0),29);
 for(const b of oracle.buttons){assert.equal(b.mode,1);assert.equal(commandMotionBindings.find(a=>a.name===b.name).mode,1);assert.deepEqual(b.hitBoundsLTRB,b.initialBounds[b.rawWords[10]]);}
});
for(const b of oracle.buttons)test(`${b.name} independent deadlines, channels, registrations and file pixels`,{skip:!existsSync(new URL('ui/ui.json',media))},()=>{
 const manifest=JSON.parse(readFileSync(new URL('ui/button-animations.json',media)));
 for(let i=0;i<3;i++){
  const id=[b.rawWords[0],b.rawWords[1],b.rawWords[10]][i],s=oracle.scripts[id],actual=manifest.scripts[id];
  assert.deepEqual(actual.rect,s.rectXYWH);assert.equal(actual.tickMs,100);
  assert.deepEqual(actual.frames.map(f=>f.ticks),s.waitTicks);assert.equal(actual.endCheckTick,s.endCheckTick);
  assert.deepEqual((actual.sounds??[]).map(({tick,sound,channel})=>({tick,sound,channel})),s.sounds.map(({tick,sound,channel})=>({tick,sound,channel})));
  assert.equal(rolloverEndReady(actual,s.endCheckTick-1),false);
  assert.equal(rolloverEndReady(actual,s.endCheckTick),true);
  if(i<2)assert.equal(rolloverEndReady(actual,s.endCheckTick,[1]),false);
  for(const [f,g] of s.groups.entries()){
   assert.equal(rolloverFrameAtTick(actual,g.tick),f);
   assert.deepEqual([s.originXY[0]+g.sourceXY[0]-g.registrationXY[0],s.originXY[1]+g.sourceXY[1]-g.registrationXY[1]],g.boundsLTRB.slice(0,2));
   const png=PNG.sync.read(readFileSync(new URL(`ui/button-animations/${id}-${f}.png`,media)));
   assert.equal(createHash('sha256').update(png.data).digest('hex'),s.rgbaSha256[f]);
  }
 }
});

test('required existing media bodies remain pinned',{skip:!existsSync(new URL('ui/ui.json',media))},()=>{
 for(const [key,pin] of Object.entries(oracle.mediaFiles)){
  const bytes=readFileSync(new URL(key,media));assert.equal(bytes.length,pin.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
 }
});
