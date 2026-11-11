import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { expect } from '@playwright/test';

// Source geometry is read independently of the live renderer and its metadata.
// Existing source-byte/registration oracles pin these installer manifests.
const primary = JSON.parse(readFileSync('public/original/ui/tool-motion/manifest.json'));
const secondary = JSON.parse(readFileSync('public/original/ui/secondary-motion/manifest.json'));
export async function canonicalMotionFrame(locator) {
  const identity = await locator.evaluate(c => ({ primary:c.dataset.nativeToolMotion,
    secondary:c.dataset.nativeSecondaryMotion, action:c.dataset.nativeActionMotion, stamp:c.dataset.nativeStampMotion }));
  let rectangles;
  if (identity.primary) {
    const m = primary.trays[identity.primary];
    rectangles = Object.values(m.scripts).flatMap(s => s.frames.flatMap(f => f.parts.map(p =>
      [p.x,p.y,m.sprites[p.sprite].width,m.sprites[p.sprite].height])));
    rectangles.push(...(m.restorationRects || []));
  } else {
    let table, rows;
    if (identity.secondary) table = Number(identity.secondary.split(':')[1]);
    else if (identity.stamp) {
      [table,rows] = { arrows:[18700,[1,2]],editor:[18700,[3]],size:[18202,[0,1,2]] }[identity.stamp.split(':')[1]];
    } else {
      const [tray,,indices] = identity.action.split(':');
      table = tray === 'text' ? 9383 : 926;
      rows = indices.split('-').map(Number);
      expect(rows).toEqual(tray === 'text' ? [2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18]
        : rows.length === 3 ? [2,3,4] : rows.length === 4 ? [2,3,4,11] : [2,3,4,5,6,7,8,9,10]);
    }
    rectangles = secondary.tables[table].buttons.filter(b => !rows || rows.includes(b.index))
      .flatMap(b => [...b.stateScripts,b.rolloverScript].filter(Boolean))
      .flatMap(id => { const s = secondary.scripts[id]; return s.frames.flatMap(f => f.parts.map(p => {
        const info = secondary.sprites[`${s.collection}:${p.sprite}`]; return [p.x,p.y,info.width,info.height];
      })); });
  }
  let x0=1024,y0=768,x1=0,y1=0;
  for (const [x,y,w,h] of rectangles) { x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+w);y1=Math.max(y1,y+h); }
  const bounds=[Math.max(0,x0-2),Math.max(0,y0-2),Math.min(1024,x1+2),Math.min(768,y1+2)];
  const full = await locator.evaluate(c => c.width===1024 && c.height===768 && !c.getAttribute('style') ? c.toDataURL() : null);
  if(full) return full; // Independently fixed native origin for source controls.
  const encoded = await locator.evaluate((c,[left,top,right,bottom]) => {
    // Align using independently computed source geometry, never renderer origin.
    if(c.width!==right-left || c.height!==bottom-top || c.style.left!==`${left}px` || c.style.top!==`${top}px`
      || c.style.width!==`${right-left}px` || c.style.height!==`${bottom-top}px`) throw Error('Source viewport/placement differs');
    return c.toDataURL();
  },bounds);
  // Copy PNG bytes directly: another Canvas draw can add alpha round-trips.
  const local = PNG.sync.read(Buffer.from(encoded.split(',')[1], 'base64'));
  const frame = new PNG({width:1024,height:768});
  for(let row=0;row<local.height;row++) local.data.copy(frame.data,
    ((row+bounds[1])*1024+bounds[0])*4,row*local.width*4,(row+1)*local.width*4);
  return `data:image/png;base64,${PNG.sync.write(frame).toString('base64')}`;
}
