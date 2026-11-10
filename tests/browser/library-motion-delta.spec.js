import { test, expect } from '@playwright/test';

test('visible Backgrounds tracking advances after its first source tick',async({page})=>{
  if(process.env.LIBRARY_STATIC_BASELINE) await page.route('**/src/native-library-motion.js*',route=>route.fulfill({contentType:'application/javascript',body:'export function attachLibraryMotion(){return {names:[],ready:()=>false,ownsCue:()=>false}}'}));
  await page.clock.install();await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button',{name:'Backgrounds',exact:true}).hover();
  // Allow asset readiness, then pin the source timeline before pressing.
  await page.evaluate(async()=>{const img=new Image();img.src='/original/ui/button-animations/1001-1.png';await img.decode();});
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.mouse.down();
  const first=await page.screenshot({clip:{x:27,y:15,width:105,height:61}});
  await page.clock.runFor(120);
  const second=await page.screenshot({clip:{x:27,y:15,width:105,height:61}});
  expect(second.equals(first),'Authored tracking image changes at tick 1').toBe(false);
  await page.mouse.up();
});
