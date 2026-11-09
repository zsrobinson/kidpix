import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/color-picker-motion-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><canvas width="1024" height="768"></canvas>',
  }));
  await page.goto('/color-picker-motion-harness');
  await page.evaluate(async () => {

const { createNativeColorPickerMotion, drawColorPickerFrame } = await import('/src/native-color-picker-motion.js');
const manifest = await fetch('/original/ui/color-picker-motion/manifest.json').then(r => r.json());
const canvas = document.querySelector('canvas'), context = canvas.getContext('2d', {willReadFrequently:true});
const images = new Map();
await Promise.all(Object.values(manifest.sprites).map(async ({image:path}) => {
 const image = new Image(); image.src = '/original/ui/color-picker-motion/' + path; await image.decode(); images.set(path,image);
}));
let time=0, id=0; const tasks=new Map(), ready=[], previews=[], selections=[];
const f={context, images, ready, previews, selections, makeSound:()=>null,
 advance(ms){time+=ms; const work=[...tasks.values()]; tasks.clear(); work.forEach(fn=>fn());}};
f.picker=createNativeColorPickerMotion({manifest, now:()=>time,
 schedule:fn=>{tasks.set(++id,fn);return id}, cancel:key=>tasks.delete(key), playSound:cue=>f.makeSound(cue),
 render:({clip,frame})=>{context.clearRect(0,0,1024,768);if(frame)drawColorPickerFrame(context,manifest,clip,frame,path=>images.get(path))},
 onReady:()=>ready.push(time), onPreview:c=>previews.push(c), onSelect:c=>selections.push(c),
 readColor:(x,y)=>{const rgb=context.getImageData(x,y,1,1).data; return '#'+[...rgb].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')}
});
window.pickerFixture=f;

  });
});

test('@module all seven opening and closing poses match independent source placement pixel for pixel', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.pickerFixture;
    await f.picker.open();
    const positions = [[1, -78, 559], [2, -46, 510], [3, -7, 470], [4, 38, 426],
      [5, 38, 426], [6, 38, 426], [7, 38, 426]];
    const oracle = document.createElement('canvas'); oracle.width = 1024; oracle.height = 768;
    const expected = oracle.getContext('2d');
    const compare = ([sprite, x, y]) => {
      expected.clearRect(0, 0, 1024, 768);
      expected.save(); expected.beginPath(); expected.rect(-80, 411, 427, 457); expected.clip();
      expected.drawImage(f.images.get(`big-${sprite}.png`), x, y); expected.restore();
      const a = f.context.getImageData(0, 0, 1024, 768).data;
      const b = expected.getImageData(0, 0, 1024, 768).data;
      let mismatch = 0, visible = 0;
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) mismatch++; if (i % 4 === 3 && a[i]) visible++; }
      return { mismatch, visible };
    };
    const opening = [];
    for (let i = 0; i < positions.length; i++) { if (i) f.advance(30); opening.push(compare(positions[i])); }
    const earlyReady = f.ready.length; f.advance(30);
    f.picker.close(); const closing = [];
    for (let i = 0; i < positions.length; i++) { if (i) f.advance(100); closing.push(compare(positions[6 - i])); }
    const beforeClose = f.picker.state; f.advance(100);
    return { opening, closing, earlyReady, ready: f.ready, beforeClose, state: f.picker.state,
      alpha: f.context.getImageData(0, 0, 1024, 768).data.some((v, i) => i % 4 === 3 && v) };
  });
  expect(result.opening.map(r => r.mismatch)).toEqual(Array(7).fill(0));
  expect(result.closing.map(r => r.mismatch)).toEqual(Array(7).fill(0));
  expect(result.opening.every(r => r.visible > 20)).toBe(true);
  expect(result.earlyReady).toBe(0); expect(result.ready).toEqual([210]);
  expect(result.beforeClose).toBe('closing'); expect(result.state).toBe('closed'); expect(result.alpha).toBe(false);
});

test('@module decoded source color sampling, drag selection and retention use native scene coordinates', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.pickerFixture;
    await f.picker.open(); for (let i = 0; i < 7; i++) f.advance(30);
    f.picker.move(190, 580); const ordinaryPreview = f.previews.length;
    const pressed = f.picker.pointerDown(190, 580);
    f.picker.move(200, 580); const preview = f.picker.previewColor;
    const chosen = f.picker.pointerUp(200, 580);
    const openAfterSelection = f.picker.state;
    f.picker.move(50, 700); const retained = f.picker.state;
    f.picker.move(50, 640);
    return { ordinaryPreview, pressed, chosen, preview, selections: f.selections, openAfterSelection, retained, exited: f.picker.state };
  });
  expect(result.ordinaryPreview).toBe(0); expect(result.pressed).toBe(true); expect(result.chosen).toBe(true);
  expect(result.preview).toMatch(/^#[0-9a-f]{6}$/); expect(result.selections).toEqual([result.preview]);
  expect(result.openAfterSelection).toBe('open'); expect(result.retained).toBe('open'); expect(result.exited).toBe('closing');
});

test('@module browser completion waits for owned source cue; pointer-close stops it and blocks reversal', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.pickerFixture;
    const sounds = [];
    // The real audio asset is decoded in the browser, while event completion is
    // controlled to make interruption assertions deterministic and silent.
    const context = new AudioContext();
    const bytes = await fetch('/original/ui/color-picker-motion/big-1501.wav').then(r => r.arrayBuffer());
    const audio = await context.decodeAudioData(bytes);
    await context.close();
    f.makeSound = cue => {
      const sound = Object.assign(new EventTarget(), { cue, ended: false, pause() { this.paused = true; } });
      sounds.push(sound); return sound;
    };
    await f.picker.open(); for (let i = 0; i < 20; i++) f.advance(30);
    const held = f.picker.state;
    sounds[0].dispatchEvent(new Event('ended')); f.advance(30);
    const ready = f.ready[0]; f.picker.close();
    const reopened = await f.picker.open(); const stopped = sounds[0].paused;
    return { duration: audio.duration, sampleRate: audio.sampleRate, held, ready, reopened, stopped,
      closingCue: sounds[1].cue.sound };
  });
  expect(Math.abs(result.duration - 13433 / 22050)).toBeLessThanOrEqual(1 / result.sampleRate);
  expect(result.held).toBe('opening'); expect(result.ready).toBe(630);
  expect(result.reopened).toBe(false); expect(result.stopped).toBe(true); expect(result.closingCue).toBe(1500);
});
