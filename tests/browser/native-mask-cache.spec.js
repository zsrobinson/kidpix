import { test, expect } from '@playwright/test';

// No clock mocking: this checks synchronous source-mask reuse and exact pixels.
test('dynamic native dabs reuse immutable source pixels while resampling every random and paper coefficient', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { drawOriginalDab, nativeBrushMaskPixels } = await import('/src/paint-original.js');
    const source=document.createElement('canvas');source.width=source.height=8;
    const raw=source.getContext('2d').createImageData(8,8);
    for(let i=0;i<raw.data.length;i+=4)raw.data.set([(i/4*17)%256,(i/4*17)%256,(i/4*17)%256,255],i);
    source.getContext('2d').putImageData(raw,0,0);
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const original=CanvasRenderingContext2D.prototype.getImageData;let reads=0;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){reads++;return original.apply(this,args);};
    const equal=[];
    try {
      for(let step=0;step<4;step++){
        const actual=document.createElement('canvas'),expected=document.createElement('canvas');
        actual.width=expected.width=actual.height=expected.height=40;
        const dab={blendClass:'generic',density:5,spatter:1,jitter:0,shadow:0,glint:0,spacing:5,sizeOrdinal:1};
        const texture={width:40,height:40,data:new Uint8ClampedArray(40*40).map((_,i)=>(i*7+step*31)%256)};
        let seed=53;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        drawOriginalDab(actual.getContext('2d'),{x:20,y:20},{color:'#263a57',nativeTexture:texture},dab,image,random,step);
        seed=53;
        const pixels=expected.getContext('2d').createImageData(8,8);
        pixels.data.set(nativeBrushMaskPixels(raw.data,[38,58,87,255],dab,'paint',random,i=>texture.data[(16+Math.floor(i/8))*40+16+i%8]));
        const tile=document.createElement('canvas');tile.width=tile.height=8;tile.getContext('2d').putImageData(pixels,0,0);
        expected.getContext('2d').drawImage(tile,16,16);
        equal.push(actual.toDataURL()===expected.toDataURL());
      }
    } finally {CanvasRenderingContext2D.prototype.getImageData=original;}
    return {reads,equal};
  });
  expect(result.equal).toEqual([true,true,true,true]);
  // One immutable mask read plus the existing CSS color read per dab.
  expect(result.reads).toBe(5);
});
