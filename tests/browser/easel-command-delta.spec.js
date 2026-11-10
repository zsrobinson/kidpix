import {test,expect} from '@playwright/test';
for(const [name,rect] of [['save',{x:899,y:149,width:55,height:53}],['export',{x:954,y:148,width:55,height:53}]])test(`${name} live visible tracking changes at first tick`,async({page})=>{
 if(process.env.COMMAND_STATIC_BASELINE)await page.route('**/src/native-command-motion.js*',r=>r.fulfill({contentType:'application/javascript',body:'export function attachCommandMotion(){return {names:[],ready:()=>false,cancel(){},cancelGroup(){},dispose(){},completeActivation(){}}}'}));
 await page.clock.install();await page.goto('/');await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
 const b=page.locator(`#hit-layer [data-action="${name==='export'?'stereo':name}"]`);await b.hover();
 await page.evaluate(async name=>{const i=new Image();i.src=`/original/ui/button-animations/${name==='save'?1036:1124}-1.png`;await i.decode();},name);
 await page.clock.pauseAt(new Date(Date.now()+1000));await page.mouse.down();
 const first=await page.screenshot({clip:rect});await page.clock.runFor(120);const second=await page.screenshot({clip:rect});
 expect(second.equals(first),'Authored tracking changes at tick 1; static binding must fail').toBe(false);await page.mouse.move(500,400);await page.mouse.up();
});
