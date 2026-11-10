const staticAdapter = `import {attachMode1Motion} from './native-library-motion.js'; export function attachCommandMotion(m,r,s,l,o){return attachMode1Motion(m,r,s,l,{...o,mode:0,bindings:[{name:'save',action:'save'},{name:'export',action:'stereo'}],terminalAdoption:true,actorAttribute:'nativeCommandMotion'});}`;
import {test,expect} from '@playwright/test';
for(const [name,rect] of [['new',{x:899,y:207,width:55,height:53}],['print',{x:954,y:207,width:55,height:53}],['help',{x:968,y:289,width:36,height:34}]])test(`${name} live visible tracking changes at first tick`,async({page})=>{
 if(process.env.OWNER_STATIC_BASELINE)await page.route('**/src/native-command-motion.js*',r=>r.fulfill({contentType:'application/javascript',body:staticAdapter}));
 await page.clock.install();await page.goto('/');await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
 const b=page.locator(`#hit-layer [data-action="${name==='export'?'stereo':name}"]`);await b.hover();
 await page.evaluate(async name=>{const i=new Image();i.src=`/original/ui/button-animations/${{new:1047,print:1051,help:1080}[name]}-1.png`;await i.decode();},name);
 await page.clock.pauseAt(new Date(Date.now()+1000));await page.mouse.down();
 const first=await page.screenshot({clip:rect});await page.clock.runFor(120);const second=await page.screenshot({clip:rect});
 expect(second.equals(first),'Authored tracking changes at tick 1; static binding must fail').toBe(false);await page.mouse.move(500,400);await page.mouse.up();
});
