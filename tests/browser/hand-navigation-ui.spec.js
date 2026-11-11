import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
test.use({ hasTouch: true });
const control=(page,d)=>page.locator(`#tray-buttons [data-action="navigate:${d}"]`);
async function start(page,fallback=false){
 if(fallback) await page.route('**/secondary-motion/manifest.json*',r=>r.abort());
 await page.goto('/');await page.waitForSelector('#paper-canvas');
 await page.locator('[data-action="tray:text"]').click();
 await page.locator('#paper-canvas').click({position:{x:120,y:120}});await page.locator('.object-text').fill('First');
 await page.locator('#paper-canvas').click({position:{x:420,y:320}});await page.locator('.object-text').last().fill('Second');
 await page.locator('[data-action="tray:grab"]').click();
 if(!fallback)await expect(control(page,1)).toHaveAttribute('data-native-motion-index',/\d/);
}
const selected=page=>page.locator('.scene-object.is-selected .object-text').textContent();
for(const fallback of [false,true])test(`shipped UI pointer, Space, Enter and touch once (${fallback?'fallback':'motion'})`,async({page})=>{
 await start(page,fallback);expect(await selected(page)).toBe('Second');
 await control(page,1).click();expect(await selected(page)).toBe('First');
 await control(page,-1).focus();await page.keyboard.press('Space');expect(await selected(page)).toBe('Second');
 await page.keyboard.press('Enter');expect(await selected(page)).toBe('First');
 await control(page,-1).tap();expect(await selected(page)).toBe('Second');
 await expect(page.locator('#tray-buttons [data-action="make-sticker"]')).toHaveCount(0);
});
for(const cancel of ['Escape','blur','leave'])test(`shipped held navigation cancels on ${cancel}`,async({page})=>{
 await start(page);await control(page,1).hover();await page.mouse.down();
 if(cancel==='Escape')await page.keyboard.press('Escape');
 if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 if(cancel==='leave')await page.mouse.move(900,550);
 await page.mouse.up();expect(await selected(page)).toBe('Second');
});
test('shipped no selected owner disables navigation and Scissors excludes both targets',async({page})=>{
 await page.goto('/');await page.waitForSelector('#paper-canvas');await page.locator('[data-action="tray:grab"]').click();
 await expect(control(page,1)).toBeDisabled();await expect(control(page,-1)).toBeDisabled();
 await page.locator('[data-action="tool:scissors"]').click();await expect(control(page,1)).toHaveCount(0);
 await expect(page.locator('#tray-buttons [data-action="make-sticker"]')).toHaveCount(1);
});

test('shipped navigation preserves the actual saved picture and PNG across Open',async({page})=>{
 await start(page);
 async function download(choice) {
  await page.locator('[data-action="save"]').last().evaluate(button=>button.click());
  const pending=page.waitForEvent('download');
  await page.locator('#dialog-actions').getByRole('button',{name:choice,exact:true}).click();
  return readFile(await (await pending).path());
 }
 const before=await download('Save Picture'),beforePNG=PNG.sync.read(await download('Export PNG'));
 await control(page,1).click();expect(await selected(page)).toBe('First');
 const saved=await download('Save Picture'),afterPNG=PNG.sync.read(await download('Export PNG'));
 expect(JSON.parse(saved)).toEqual(JSON.parse(before));
 expect([afterPNG.width,afterPNG.height]).toEqual([720,542]);
 expect(afterPNG.data.equals(beforePNG.data)).toBe(true);
 expect(afterPNG.data.some((value,index)=>index%4!==3&&value<200)).toBe(true);
 await page.locator('#picture-file').setInputFiles({name:'navigation.kidpix-web',mimeType:'application/json',buffer:saved});
 await expect(page.locator('#objects .scene-object')).toHaveCount(2);
 await expect(control(page,1)).toBeDisabled();
 await page.locator('#objects .scene-object').first().click({position:{x:4,y:4}});
 await control(page,-1).click();expect(await selected(page)).toBe('Second');
 expect(JSON.parse(await download('Save Picture'))).toEqual(JSON.parse(saved));
 const openedPNG=PNG.sync.read(await download('Export PNG'));
 expect(openedPNG.data.equals(beforePNG.data)).toBe(true);
});
