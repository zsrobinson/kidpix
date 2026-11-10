import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Real browser media, held deliberately beyond the finite actor's duration.
// Fault injection proves interruption recovery, not Safari's reported idle cause.
test.beforeAll(async ({browser}) => { console.log(`Engine ${browser.browserType().name()} ${browser.version()}`); });

test.beforeEach(async ({ page }) => {
  page.uiErrors = [];
  page.on('pageerror', error => page.uiErrors.push(error.stack || error.message));
  if (process.env.UI_AUDIO_BASELINE) {
    for (const name of ['main', 'native-animation', 'native-tool-motion', 'native-rollovers', 'native-color-picker-motion', 'studio-color-picker']) {
      const body = execFileSync('git', ['show', `1fd088f:src/${name}.js`], {encoding:'utf8'});
      await page.route(`**/src/${name}.js*`, route=>route.fulfill({contentType:'text/javascript',body}));
    }
  }
  await page.addInitScript(() => {
    const Audio = window.Audio;
    window.uiMedia = [];
    window.Audio = function (src) {
      const audio = new Audio(src);
      if (String(src).includes('/ui/')) {
        audio.loop = true;
        audio.addEventListener('playing', () => { audio.didPlay = true; });
        window.uiMedia.push(audio);
      }
      return audio;
    };
  });
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.evaluate(() => { Math.random = () => .175; }); // source1098, cue at tick0
});

test.afterEach(async ({page}) => { expect(page.uiErrors).toEqual([]); });

for (const terminal of ['pause', 'emptied']) {
  test(`Undo real media ${terminal} releases terminal pose and permits fresh action`, async ({ page }) => {
    const actor = page.locator('#native-buttons .native-animation');
    const undo = page.getByRole('button', { name: 'Undo Guy', exact: true });
    await page.locator('#paper-canvas').dispatchEvent('pointerdown', {pointerId:1, pointerType:'mouse', buttons:1, clientX:300, clientY:200});
    await page.locator('#paper-canvas').dispatchEvent('pointerup', {pointerId:1, pointerType:'mouse', buttons:0, clientX:300, clientY:200});
    await undo.evaluate(control => control.click());
    await expect(actor).toHaveAttribute('data-script', '1098');
    await expect.poll(() => page.evaluate(() => window.uiMedia.some(a => a.didPlay && a.src.includes('easel-1011.wav')))).toBe(true);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.clock.runFor(2500);
    await expect(actor).toBeVisible(); // actually playing channel1 still holds source end gate
    await page.evaluate(terminal => {
      const audio = window.uiMedia.find(a => a.didPlay && a.src.includes('easel-1011.wav'));
      const events = window.terminalEvents = [];
      for (const event of ['pause', 'abort', 'emptied']) audio.addEventListener(event, () => events.push(event));
      if (terminal === 'pause') audio.pause();
      else { audio.removeAttribute('src'); audio.load(); }
    }, terminal);
    await page.clock.runFor(200);
    expect(await page.evaluate(() => window.terminalEvents)).toContain(terminal);
    await expect(actor).toBeHidden();
    await undo.evaluate(control => control.click());
    await expect(actor).toBeVisible();
    await expect(actor).toHaveAttribute('data-frame', '0');
    await page.clock.runFor(220);
    await expect(actor).toHaveAttribute('data-frame', '2');
  });
}

for (const kind of ['Undo', 'ColorPicker']) {
  test(`${kind} pending play holds initial gate; rejection releases without fake DOM error`, async ({ page }) => {
    await page.evaluate(() => {
      window.pendingUi = [];
      HTMLMediaElement.prototype.play = function () {
        const audio = this;
        audio.fakeErrors = 0;
        audio.addEventListener('error', () => audio.fakeErrors++);
        return new Promise((resolve, reject) => window.pendingUi.push({audio, resolve, reject}));
      };
    });
    const picker = kind === 'ColorPicker';
    await page.locator(picker ? '#color-button' : '[data-action="undo-face"]').evaluate(control => control.click());
    const target = picker ? page.locator('#palette') : page.locator('#native-buttons .native-animation');
    if (picker) await expect(target).toHaveAttribute('data-phase', 'opening');
    else await expect(target).toHaveAttribute('data-script','1098');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.clock.runFor(2500);
    if (picker) await expect(target).toHaveAttribute('data-phase','opening');
    else await expect(target).toBeVisible();
    const states = await page.evaluate(picker => window.pendingUi.filter(({audio}) => audio.src.includes(picker ? 'big-1501.wav' : 'easel-1011.wav')).map(({audio,reject}) => {
      const state = {paused:audio.paused, ended:audio.ended};
      reject(new DOMException('Injected blocked playback','NotAllowedError')); return state;
    }),picker);
    expect(states).toEqual([{paused:true,ended:false}]);
    await page.clock.runFor(220);
    if (picker) await expect(target).toHaveAttribute('data-phase','open');
    else await expect(target).toBeHidden();
    expect(await page.evaluate(() => window.pendingUi.reduce((n,{audio}) => n+audio.fakeErrors,0))).toBe(0);
    if (picker) {
      await page.keyboard.press('Escape'); await page.clock.runFor(1000);
      await page.evaluate(() => window.pendingUi.forEach(({reject}) => reject(new DOMException('blocked','NotAllowedError'))));
      await page.clock.runFor(220);
      await expect(target).toHaveAttribute('data-phase','closed');
      await page.locator('#color-button').evaluate(control=>control.click());
      await expect(target).toHaveAttribute('data-phase','opening');
    }
  });
}

test('ColorPicker real pause releases opening and closing, selection remains usable', async ({page}) => {
  const palette=page.locator('#palette');
  await page.locator('#color-button').evaluate(control=>control.click());
  await expect(palette).toHaveAttribute('data-phase','opening');
  await expect.poll(()=>page.evaluate(()=>window.uiMedia.some(a=>a.src.includes('big-1501.wav')&&a.didPlay))).toBe(true);
  await page.clock.pauseAt(new Date(Date.now()+1000)); await page.clock.runFor(600);
  await expect(palette).toHaveAttribute('data-phase','opening');
  await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('big-1501.wav')).forEach(a=>a.pause()));
  await page.clock.runFor(100); await expect(palette).toHaveAttribute('data-phase','open');
  await page.mouse.move(190,580);await page.mouse.down();await page.mouse.up();
  await expect(palette).toHaveAttribute('data-phase','open');
  await page.keyboard.press('Escape');await page.clock.runFor(1000);
  await expect(palette).toHaveAttribute('data-phase','closing');
  await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('big-150')).forEach(a=>a.pause()));
  await page.clock.runFor(150);await expect(palette).toHaveAttribute('data-phase','closed');
});

for (const [kind,selector,index,x,y] of [
  ['primary','[data-native-tool-motion="draw"]',1,240,700],
  ['secondary','[data-native-secondary-motion="draw:18400"]',0,575,670],
]) test(`${kind} real media pause finishes source hover; fresh entry advances frames`,async({page})=>{
  const actor=page.locator(selector);await expect(actor).toBeVisible();
  await page.mouse.move(1023,767);
  const before=await page.evaluate(()=>window.uiMedia.length);
  await page.mouse.move(x,y);
  if(kind === "secondary") await page.mouse.down();
  await page.waitForFunction(before=>window.uiMedia.slice(before).some(a=>a.didPlay),before);
  await page.clock.pauseAt(new Date(Date.now()+1000));await page.clock.runFor(3000);
  const snap=()=>actor.evaluate((canvas,index)=>JSON.parse(canvas.dataset.motionSnapshot)[index],index);
  expect((await snap()).finished).toBe(false);
  await page.evaluate(before=>window.uiMedia.slice(before).forEach(a=>a.pause()),before);
  await page.clock.runFor(220);
  if(kind === 'primary') expect((await snap()).auxiliary).toBe(false);
  else { expect((await snap()).finished).toBe(true); await page.mouse.up(); }
  await page.mouse.move(1023,767);await page.mouse.move(x,y);
  if(kind === 'secondary') {
    await page.locator('[data-action="style:curve"]').focus();
    await page.keyboard.down('Space');
    const first=await actor.evaluate(c=>JSON.parse(c.dataset.motionSnapshot)[1]);
    await page.clock.runFor(120);
    const next=await actor.evaluate(c=>JSON.parse(c.dataset.motionSnapshot)[1]);
    expect(first.frameIndex).toBe(0);expect(next.frameIndex).toBe(1);
    await page.keyboard.up('Space');
  } else {
    const first=await snap();await page.clock.runFor(220);const next=await snap();
    expect(next.frameIndex).toBeGreaterThan(first.frameIndex);
  }
  await page.getByRole('button',{name:'Painting Tools',exact:true}).evaluate(c=>c.click());
  await page.clock.runFor(1000);await expect(actor).toHaveCount(0);
});

test('Firehose real pause releases only its repeat gate; clear suspends rollover without resurrection', async({page})=>{
  const trigger=page.locator('#hit-layer [data-action="clear"]');
  await trigger.hover();
  await expect.poll(()=>page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1029.wav')&&a.didPlay).length)).toBe(1);
  await page.clock.pauseAt(new Date(Date.now()+1000));await page.clock.runFor(1500);
  expect(await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1029.wav')).length)).toBe(1);
  await page.evaluate(()=>window.uiMedia.find(a=>a.src.includes('easel-1029.wav')).pause());
  await page.clock.runFor(120);
  expect(await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1029.wav')).length)).toBe(2);
  await trigger.evaluate(c=>c.click());await page.clock.runFor(3000);
  const count=await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1029.wav')).length);
  await page.clock.runFor(2000);
  expect(await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1029.wav')).length)).toBe(count);
});

test('Undo replacement ignores stale terminal events on previous real media', async({page})=>{
  const undo=page.getByRole('button',{name:'Undo Guy',exact:true});
  const actor=page.locator('#native-buttons .native-animation');
  await undo.evaluate(c=>c.click());await expect(actor).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.uiMedia.some(a=>a.src.includes('easel-1011.wav')&&a.didPlay))).toBe(true);
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await undo.evaluate(c=>c.click());await page.clock.runFor(2500);
  await expect(actor).toBeVisible();
  await page.evaluate(()=>{
    const audio=window.uiMedia.filter(a=>a.src.includes('easel-1011.wav'))[0];
    // Explicit stale delivery tests ownership, separate from real lifecycle tests.
    for(const type of ['ended','pause','abort','emptied'])audio.dispatchEvent(new Event(type));
  });
  await page.clock.runFor(220);await expect(actor).toBeVisible();
  await page.evaluate(()=>window.uiMedia.filter(a=>a.src.includes('easel-1011.wav')).at(-1).pause());
  await page.clock.runFor(220);await expect(actor).toBeHidden();
});

test('ColorPicker failed decode preserves usable static color input and dismissal',async({page})=>{
  await page.route('**/color-picker-motion/big-1.png*',route=>route.fulfill({contentType:'image/png',body:'broken'}));
  await page.locator('#color-button').evaluate(c=>c.click());
  await expect(page.locator('#palette')).toHaveAttribute('data-phase','fallback');
  const custom=page.getByLabel('Custom color',{exact:true});await expect(custom).toBeVisible();
  await custom.fill('#123456');
  await page.keyboard.press('Escape');await expect(page.locator('#palette')).toBeHidden();
});

test('Undo real pending network load abort releases gate without treating initial paused as complete',async({page})=>{
  const held=[];
  await page.route('**/easel-1011.wav*',route=>{held.push(route);});
  await page.getByRole('button',{name:'Undo Guy',exact:true}).evaluate(c=>c.click());
  const actor=page.locator('#native-buttons .native-animation');
  await expect(actor).toHaveAttribute('data-script','1098');
  await expect.poll(()=>held.length).toBeGreaterThan(0);
  await page.clock.pauseAt(new Date(Date.now()+1000));await page.clock.runFor(2500);
  await expect(actor).toBeVisible();
  await page.evaluate(()=>{
    const audio=window.uiMedia.find(a=>a.src.includes('easel-1011.wav'));
    window.abortEvents=[];
    for(const type of ['abort','emptied'])audio.addEventListener(type,()=>window.abortEvents.push(type));
    audio.removeAttribute('src');audio.load();
  });
  await page.clock.runFor(220);
  expect(await page.evaluate(()=>window.abortEvents)).toContain('abort');
  await expect(actor).toBeHidden();
  for(const route of held)await route.abort().catch(()=>{});
});
