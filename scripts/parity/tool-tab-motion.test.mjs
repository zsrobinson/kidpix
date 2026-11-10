import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {rolloverFrameAtTick,rolloverEndReady} from '../../src/native-rollovers.js';
const oracle=JSON.parse(readFileSync(new URL('../../tests/fixtures/tool-tab-motion-source.json',import.meta.url)));
const media=new URL('../../public/original/',import.meta.url);
test('eight raw kind1 rows identify commands and initial auxiliary replacement geometry',()=>{
 assert.deepEqual(oracle.buttons.map(b=>b.rawWords[6]),[237,227,228,229,236,232,233,234]);
 for(const b of oracle.buttons){assert.equal(b.rawWords[4],1);assert.equal(b.rawWords[14],1);assert.deepEqual(b.hitBoundsLTRB,b.initialBounds[b.rawWords[10]]);assert.equal(b.selectedStaticVsTrackingTerminal.rgbaEqual,true);}
 assert.equal(Object.keys(oracle.scripts).length,24);
 assert.equal(Object.values(oracle.scripts).reduce((sum,s)=>sum+s.groups.length,0),80);
});
for(const b of oracle.buttons)test(`${b.name} independent deadlines, channels, registrations and file pixels`,{skip:!existsSync(new URL('ui/ui.json',media))},()=>{
 const manifest=JSON.parse(readFileSync(new URL('ui/button-animations.json',media)));
 for(let i=0;i<3;i++){
  const id=b.rawWords[0]+i,s=oracle.scripts[id],actual=manifest.scripts[id];
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
