import { test, expect } from '@playwright/test';

test.use({hasTouch:true});

// Synthetic contacts isolate ownership and lifecycle. Real CDP capture is tested below.
async function harness(page) {
  await page.goto('/');
  await page.evaluate(() => {
    document.body.replaceChildren();
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
    Element.prototype.hasPointerCapture = function () { return false; };
    window.emit = (target, type, pointerId = 11, x = 50, y = 50, pointerType = 'pen') => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId, pointerType, button: 0,
      buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
    }));
    window.inactive = type => {
      if (type === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      } else window.dispatchEvent(new Event(type));
    };
  });
}

test.describe('input module fixtures @module', () => {
for (const termination of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'hidden', 'resize', 'destroy']) {
  test(`paint recovers after ${termination}, preserves first owner and history`, async ({ page }) => {
    await harness(page);
    const result = await page.evaluate(async termination => {
      const { createPaint } = await import('/src/paint.js');
      const c = document.createElement('canvas'); c.width = 720; c.height = 542; document.body.append(c);
      let changes = 0;
      const create = () => createPaint(c, {originalTools:'', soundEffects:false, onChange:() => changes++});
      let api = create(); api.setOptions({tool:'pencil', variant:'freehand', size:10});
      const blank = c.toDataURL();
      emit(c, 'pointerdown', 11, 50, 50, 'touch'); // finger-first must survive arriving pen
      emit(c, 'pointerdown', 22, 100, 100);
      emit(c, 'pointercancel', 22); emit(c, 'lostpointercapture', 22);
      emit(c, 'pointermove', 11, 90, 50, 'touch');
      const preview = c.toDataURL() !== blank;
      if (termination === 'destroy') { api.destroy(); api = create(); api.setOptions({tool:'pencil'}); }
      else if (['pointercancel', 'lostpointercapture'].includes(termination)) emit(c, termination, 11);
      else inactive(termination);
      const rolledBack = c.toDataURL() === blank;
      emit(c, 'pointerup', 22);
      emit(c, 'pointerdown', 33, 150, 100); emit(c, 'pointermove', 33, 190, 100); emit(c, 'pointerup', 33, 190, 100);
      emit(c, 'lostpointercapture', 33);
      const painted = c.toDataURL();
      const committed = api.canUndo;
      api.undo(); const undone = c.toDataURL() === blank;
      api.redo(); const redone = c.toDataURL() === painted;
      api.destroy();
      return {preview, rolledBack, committed, undone, redone, changes};
    }, termination);
    expect(result).toMatchObject({preview:true, rolledBack:true, committed:true, undone:true, redone:true, changes:3});
  });
}

test('capture guard blocks rejected touch chrome and late clicks while preserving keyboard and idle taps', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  const result = await page.evaluate(async () => {
    const { interactionOwner } = await import('/src/interaction-owner.js');
    const c = document.querySelector('#paper-canvas'); c.setPointerCapture = () => {};
    const target = document.querySelector('[data-action="tray:eraser"]');
    const send = (el,type,id,pointerType) => el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType,button:0,buttons:type==='pointerup'?0:1,clientX:200,clientY:200}));
    send(c,'pointerdown',71,'pen');
    let captureCalls = 0; document.addEventListener('pointerdown', () => captureCalls++, {capture:true});
    send(target,'pointerdown',72,'touch');
    send(c,'pointerup',71,'pen');
    send(target,'pointerup',72,'touch'); send(target,'click',72,'touch');
    const ignored = target.getAttribute('aria-pressed') === 'false';
    target.click(); const keyboard = target.getAttribute('aria-pressed') === 'true';
    const pencil = document.querySelector('[data-action="tray:draw"]');
    send(pencil,'pointerdown',72,'touch'); send(pencil,'pointerup',72,'touch'); send(pencil,'click',72,'touch');
    return {ignored, keyboard, idle: pencil.getAttribute('aria-pressed') === 'true', captureCalls};
  });
  expect(result).toEqual({ignored:true, keyboard:true, idle:true, captureCalls:1});
});

test('scene retains original checkpoint, ignores foreign termination, releases on lifecycle and teardown', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const { createScene } = await import('/src/scene.js');
    const surface = document.createElement('div'); surface.style.cssText = 'width:720px;height:542px';
    const root = document.createElement('div'); surface.append(root); document.body.append(surface);
    const history = []; const scene = createScene(root,surface,(before,after)=>history.push({before,after}));
    scene.addAsset({src:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',width:100,height:100},{x:100,y:100}); scene.chooseMode('grab'); history.length=0;
    emit(root.firstChild,'pointerdown'); emit(root,'pointermove',11,80,50);
    emit(root.firstChild,'pointerdown',22,80,50,'touch'); emit(root,'pointermove',22,180,50,'touch');
    emit(root,'pointercancel',22); emit(root,'lostpointercapture',22);
    emit(root,'pointermove',11,110,50); emit(root,'pointerup',11,110,50); emit(root,'lostpointercapture',11);
    const checkpoint = history.length === 1 && history[0].before[0].x === 50 && history[0].after[0].x === 110;
    scene.restore(history[0].before); const undone = scene.snapshot()[0].x === 50;
    scene.restore(history[0].after); scene.chooseMode('grab');
    for (const type of ['blur','pagehide','hidden']) {
      emit(root.firstChild,'pointerdown',31); emit(root,'pointermove',31,60,50); inactive(type);
    }
    emit(root.firstChild,'pointerdown',41); scene.destroy();
    const { interactionOwner } = await import('/src/interaction-owner.js');
    const released = interactionOwner().claim({pointerId:99,pointerType:'pen'},surface);
    interactionOwner().release(surface,99);
    return {checkpoint,undone,released,history:history.length};
  });
  expect(result).toEqual({checkpoint:true,undone:true,released:true,history:4});
});

for (const module of ['native-stamp-editor', 'stamp-editor']) {
  test(`${module} keeps first contact, one undo checkpoint, and recovers after interruption`, async ({ page }) => {
    await harness(page);
    const result = await page.evaluate(async module => {
      const source = document.createElement('canvas'); source.width=32; source.height=32;
      const {editStamp} = await import(`/src/${module}.js`);
      const session = editStamp({src:source.toDataURL(),name:'fixture'},'#ff0000',()=>{});
      while (!document.querySelector('dialog[open]')) await new Promise(r=>setTimeout(r,10));
      const dialog=document.querySelector('dialog'); const c=dialog.querySelector('.native-stamp-pixels,.stamp-pixels');
      const b=c.getBoundingClientRect(); const send=(type,id,x,y,kind='pen')=>emit(c,type,id,b.x+(x+.5)*b.width/32,b.y+(y+.5)*b.height/32,kind);
      const blank=c.toDataURL(); send('pointerdown',11,2,2); const first=c.toDataURL();
      send('pointerdown',22,10,10,'touch'); send('pointermove',22,15,10,'touch');
      const ignored = first===c.toDataURL(); send('pointercancel',22,10,10,'touch'); send('lostpointercapture',22,10,10,'touch');
      send('pointermove',11,6,2); const continued=first!==c.toDataURL(); send('pointerup',11,6,2); send('lostpointercapture',11,6,2);
      dialog.querySelector('[data-command="undo"]').click(); const undone=c.toDataURL()===blank;
      send('pointerdown',51,3,3); send('pointercancel',51,3,3);
      const cancelPolicy = module === 'native-stamp-editor' ? c.toDataURL()===blank : c.toDataURL()!==blank;
      if (module === 'stamp-editor') dialog.querySelector('[data-command="undo"]').click();
      send('pointerdown',52,3,3); send('lostpointercapture',52,3,3);
      const lossKeepsPixels=c.toDataURL()!==blank; dialog.querySelector('[data-command="undo"]').click();
      dialog.querySelector('[data-command="fill"]').click(); send('pointerdown',53,3,3); const filled=c.toDataURL();
      send('pointercancel',53,3,3); const fillStays=c.toDataURL()===filled;
      dialog.querySelector('[data-command="undo"]').click(); dialog.querySelector('[data-command="pencil"]').click();
      let fresh = true;
      for (const [i,type] of ['blur','pagehide','hidden'].entries()) {
        send('pointerdown',31,2,2); inactive(type); const before=c.toDataURL();
        send('pointerdown',32,8+i,8); send('pointerup',32,8+i,8); fresh &&= before!==c.toDataURL();
      }
      send('pointerdown',41,12,12); dialog.close(); await new Promise(r=>setTimeout(r,0)); await session;
      const {interactionOwner}=await import('/src/interaction-owner.js'); const released=interactionOwner().claim({pointerId:99},source); interactionOwner().release(source,99);
      return {ignored,continued,undone,released,fresh,cancelPolicy,lossKeepsPixels,fillStays};
    }, module);
    expect(result).toEqual({ignored:true,continued:true,undone:true,released:true,fresh:true,cancelPolicy:true,lossKeepsPixels:true,fillStays:true});
  });
}

});

test('browser-delivered pen capture rejects touch chrome activation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  const cdp=await page.context().newCDPSession(page);
  const b=await page.locator('#paper-canvas').boundingBox();
  const target=page.locator('[data-action="tray:eraser"]'); const t=await target.boundingBox();
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+100,y:b.y+100,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.6});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x+t.width/2,y:t.y+t.height/2,id:8}]});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+150,y:b.y+100,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(target).toHaveAttribute('aria-pressed','false'); await cdp.detach();
});

for (const termination of ['lostpointercapture', 'blur', 'pagehide', 'hidden']) {
  test(`full app recorded path cleans routing and preview after ${termination}`, async ({ page }) => {
    await page.goto('/'); await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
    await page.getByRole('button', {name:'Stickers',exact:true}).click();
    await page.locator('#library-tray [data-asset]').first().dblclick();
    await expect(page.locator('#objects .scene-object')).toHaveCount(1);
    await page.evaluate(() => document.querySelector('[data-action="path"]').click());
    const cleaned = await page.evaluate(termination => {
      const c=document.querySelector('#paper-canvas'); c.setPointerCapture=()=>{};
      const b=c.getBoundingClientRect();
      const send=(type,id,x)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'pen',button:0,buttons:1,clientX:b.x+x,clientY:b.y+100}));
      send('pointerdown',11,100); send('pointermove',11,150);
      send('lostpointercapture',22,150); // Foreign loss cannot end path.
      const stillPath=c.dataset.tool==='none';
      if (termination==='lostpointercapture') send(termination,11,150);
      else if (termination==='hidden') {
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document,'hidden',{configurable:true,value:false});
      } else window.dispatchEvent(new Event(termination));
      const overlay=document.querySelector('#scene-effects');
      return {stillPath, tool:c.dataset.tool, overlayEmpty: !overlay.getContext('2d').getImageData(0,0,overlay.width,overlay.height).data.some(v=>v)};
    }, termination);
    expect(cleaned.stillPath).toBe(true); expect(cleaned.overlayEmpty).toBe(true);
    await page.getByRole('button',{name:'Drawing Tools',exact:true}).click();
    await expect(page.locator('#paper-canvas')).not.toHaveAttribute('data-tool','none');
    const c=page.locator('#paper-canvas'); const before=await c.evaluate(c=>c.toDataURL()); const b=await c.boundingBox();
    await page.mouse.move(b.x+210,b.y+150); await page.mouse.down(); await page.mouse.move(b.x+250,b.y+150); await page.mouse.up();
    expect(await c.evaluate(c=>c.toDataURL())).not.toBe(before);
  });
}

test('paint → scene drag → paint maintains complete shared undo/redo checkpoints', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  const c=page.locator('#paper-canvas'); const ink=()=>c.evaluate(c=>c.toDataURL());
  const draw=async y=>{const b=await c.boundingBox(); await page.mouse.move(b.x+100,b.y+y); await page.mouse.down();await page.mouse.move(b.x+180,b.y+y);await page.mouse.up();};
  const blank=await ink(); await draw(80); const first=await ink();
  await page.getByRole('button',{name:'Stickers',exact:true}).click();
  await page.locator('#library-tray [data-asset]').first().dblclick();
  const object=page.locator('#objects .scene-object'); const left=()=>object.evaluate(n=>n.style.left);
  const prior=await left(); const b=await object.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+40,b.y+b.height/2+20);await page.mouse.up();
  const moved=await left(); expect(moved).not.toBe(prior);
  await page.getByRole('button',{name:'Drawing Tools',exact:true}).click(); await draw(180); const last=await ink();
  await c.focus(); await page.keyboard.press('ControlOrMeta+z'); expect(await ink()).toBe(first);
  await page.keyboard.press('ControlOrMeta+z'); expect(await left()).toBe(prior);
  await page.keyboard.press('ControlOrMeta+z'); await expect(object).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z'); expect(await ink()).toBe(blank);
  for(let i=0;i<4;i++) await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await ink()).toBe(last);expect(await left()).toBe(moved);
});

for (const options of [
  {tool:'pencil',variant:'polygon'}, {tool:'scissors',variant:'polygon'},
  {tool:'select',variant:'cookie-cutter'}, {tool:'mixer',variant:'mega',mode:'mega'},
]) test(`${options.tool}/${options.variant} releases a contact without a retained gesture @module`, async ({ page }) => {
  await harness(page);
  const results = await page.evaluate(async options => {
    const {createPaint} = await import('/src/paint.js');
    const {interactionOwner} = await import('/src/interaction-owner.js');
    const owner = interactionOwner();
    const independent = document.createElement('div');
    const results = [];
    for (const termination of ['pointerup','pointercancel','lostpointercapture','blur','pagehide','hidden','destroy']) {
      const canvas = document.createElement('canvas'); canvas.width=720; canvas.height=542; document.body.append(canvas);
      const api = createPaint(canvas,{originalTools:'',soundEffects:false}); api.setOptions(options);
      emit(canvas,'pointerdown',17);
      if (termination === 'destroy') api.destroy();
      else if (termination.startsWith('pointer') || termination === 'lostpointercapture') emit(canvas,termination,17);
      else inactive(termination);
      const released = owner.claim({pointerId:99,pointerType:'touch'},independent);
      if (released) owner.release(independent,99);
      if (termination !== 'destroy') {
        api.setOptions({tool:'pencil',variant:'freehand',size:8});
        emit(canvas,'pointerdown',1,100,100,'mouse'); emit(canvas,'pointermove',1,140,100,'mouse'); emit(canvas,'pointerup',1,140,100,'mouse');
        results.push({termination,released,mouseWorks:api.canUndo}); api.destroy();
      } else results.push({termination,released,mouseWorks:true});
      canvas.remove();
    }
    return results;
  }, options);
  expect(results.every(result=>result.released && result.mouseWorks),JSON.stringify(results)).toBe(true);
});

test('browser double-tap from a rejected contact stays blocked after owner release @module', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tray:stickers"]').evaluate(button=>button.click());
  const tile = page.locator('#library-tray [data-asset]').first();
  await expect(tile).toBeVisible();
  await page.evaluate(async () => {
    const {interactionOwner} = await import('/src/interaction-owner.js');
    interactionOwner().claim({pointerId:17,pointerType:'pen'},document.querySelector('#paper-canvas'));
  });
  const bounds=await tile.boundingBox(),cdp=await page.context().newCDPSession(page);
  const tap=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,id:3}]});
  await tap();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await tap();
  await page.evaluate(async()=>{const{interactionOwner}=await import('/src/interaction-owner.js');interactionOwner().release(document.querySelector('#paper-canvas'),17);});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.scene-object')).toHaveCount(0);
  await tile.dblclick();await expect(page.locator('.scene-object')).toHaveCount(1);
  await tile.evaluate(button=>button.click());await expect(page.locator('.scene-object')).toHaveCount(2);
});
