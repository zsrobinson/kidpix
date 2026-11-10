import {test,expect} from '@playwright/test';
test.use({hasTouch:true});
const sizes=[[507,1024],[683,1024],[834,1194],[1194,834]];
async function open(page,size){
 await page.setViewportSize({width:size[0],height:size[1]});await page.goto('/');
 await expect(page.locator('#paper-canvas')).toHaveAttribute('data-paint-ready','ready');
 await page.getByRole('button',{name:'Show menus'}).click();
 await page.locator('#menu summary').filter({hasText:/^Paint Zone$/}).click();
}
async function geometry(page){return page.evaluate(()=>{
 const item=document.querySelector('[data-action="pencil-preview"]'),help=document.querySelector('#pencil-preview-help'),menu=document.querySelector('#menu-items');
 const size=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,font:parseFloat(getComputedStyle(e).fontSize)*r.width/e.offsetWidth};};
 return {item:size(item),help:size(help),menu:size(menu),width:innerWidth,height:innerHeight};
});}
function readable(g){
 expect(g.item.font).toBeGreaterThanOrEqual(16);expect(g.help.font).toBeGreaterThanOrEqual(14);
 expect(g.item.height).toBeGreaterThanOrEqual(44);expect(g.help.y).toBeGreaterThanOrEqual(g.menu.y);expect(g.help.bottom).toBeLessThanOrEqual(g.menu.bottom);expect(g.menu.x).toBeGreaterThanOrEqual(8);expect(g.menu.y).toBeGreaterThanOrEqual(8);
 expect(g.menu.right).toBeLessThanOrEqual(g.width-8);expect(g.menu.bottom).toBeLessThanOrEqual(g.height-8);
}
for(const size of sizes)test(`expanded Pencil menu stays readable and touch-sized at ${size.join('x')}`,async({page})=>{
 await open(page,size);await expect.poll(async()=>{const g=await geometry(page);return g.item.font>=16&&g.menu.bottom<=g.height-8&&g.menu.right<=g.width-8;}).toBe(true);readable(await geometry(page));
 await page.locator('[data-action="pencil-preview"]').tap();await expect(page.locator('[data-action="pencil-preview"]')).toHaveAttribute('aria-checked','true');await expect(page.locator('#menu-items')).toBeHidden();
});
test('expanded menu stays bounded after rotation and lower commands remain reachable',async({page})=>{
 await open(page,[507,1024]);await page.setViewportSize({width:1024,height:507});
 await expect.poll(async()=>{const g=await geometry(page);return g.menu.bottom<=g.height-8;}).toBe(true);readable(await geometry(page));
 const clear=page.locator('#menu-items [data-action="clear"]');await clear.scrollIntoViewIfNeeded();
 const b=await clear.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.y).toBeGreaterThanOrEqual(8);expect(b.y+b.height).toBeLessThanOrEqual(499);
 expect(await clear.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 await page.getByRole('button',{name:'Close menus',exact:true}).click();await expect(page.locator('#menu-items')).toBeHidden();await expect(page.getByRole('button',{name:'Show menus'})).toHaveAttribute('aria-expanded','false');
});
