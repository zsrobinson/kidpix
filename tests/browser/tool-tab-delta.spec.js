import { test, expect } from '@playwright/test';

test('visible Paint tracking advances after its first source tick',async({page})=>{
  if(process.env.TOOL_TAB_STATIC_BASELINE) await page.route('**/src/native-tool-tab-motion.js*',route=>route.fulfill({contentType:'application/javascript',body:'export function attachToolTabMotion(){return {names:[],ready:()=>false,ownsCue:()=>false,cancel(){},cancelGroup(){},dispose(){},updateSelection(){},completeActivation(){}}}'}));
  await page.clock.install();await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.locator('[data-action="tray:paint"]').hover();
  // Allow asset readiness, then pin the source timeline before pressing.
  await page.evaluate(async()=>{const img=new Image();img.src='/original/ui/button-animations/1016-1.png';await img.decode();});
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.mouse.down();
  const first=await page.screenshot({clip:{x:76,y:365,width:56,height:56}});
  await page.clock.runFor(120);
  const second=await page.screenshot({clip:{x:76,y:365,width:56,height:56}});
  expect(second.equals(first),'Authored tracking image changes at tick 1').toBe(false);
  await page.mouse.up();
});
