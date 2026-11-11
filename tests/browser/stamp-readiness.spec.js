import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
import {stampFetchHeader,unexpectedStampRequests} from './stamp-request-errors.js';

const editorButton=page=>page.locator('#library-tray [data-action="stamp-edit"]');
const editor=page=>page.getByRole('dialog',{name:'Stamp Editor',exact:true});
const ready=page=>expect(editorButton(page)).toHaveAttribute('data-native-motion-index','0');

test.beforeEach(async({page})=>{
  page.stampErrors=[];page.stampFailures=[];page.editorRequests=[];
  page.on('request',r=>{if(new URL(r.url()).pathname.includes('/stamp-editor/'))page.editorRequests.push(r.url());});
  page.on('pageerror',e=>page.stampErrors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)page.stampErrors.push(`${r.status()} ${r.url()}`);});
  page.on('requestfailed',r=>page.stampFailures.push({error:r.failure()?.errorText,url:r.url(),fetchId:r.headers()[stampFetchHeader]}));
  await page.addInitScript(({header})=>{
    const originalFetch=window.fetch;window.stampAbortedFetches=new Set();
    window.fetch=function(input,options){
      const url=new URL(input instanceof Request?input.url:input,document.baseURI);
      const signal=options?.signal??(input instanceof Request?input.signal:undefined);
      if(!signal||url.origin!==location.origin||!/\/original\/ui\/(?:tool-motion|secondary-motion)\//.test(url.pathname))return originalFetch.apply(this,arguments);
      const id=crypto.randomUUID(),aborted=()=>window.stampAbortedFetches.add(id);
      signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
      const headers=new Headers(options?.headers??(input instanceof Request?input.headers:undefined));headers.set(header,id);
      return originalFetch.call(this,input,{...options,headers});
    };
  },{header:stampFetchHeader});
  let release,arrive;
  const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>arrive=resolve);
  page.stampGate={release,requested};
  await page.route('**/original/ui/secondary-motion/manifest.json*',async route=>{
    const response=await route.fetch();arrive();await gate;await route.fulfill({response});
  });
  await page.route('**/original/catalog.json*',async route=>{
    const response=await route.fetch(),catalog=await response.json();
    catalog.groups.stamps[0].items=[{id:'stamp-readiness-fixture',name:'Readiness fixture',mediaType:'image',width:32,height:32,
      src:'stamps/readiness-fixture.png',thumbnail:'stamps/readiness-fixture.png'}];
    await route.fulfill({response,json:catalog});
  });
  const png=new PNG({width:32,height:32});png.data.fill(0);png.data.set([255,0,0,255],(3*32+2)*4);
  await page.route('**/original/stamps/readiness-fixture.png*',route=>route.fulfill({contentType:'image/png',body:PNG.sync.write(png)}));
  await page.goto('/');
  await expect(page.locator('#paint-chrome')).toHaveClass(/native/);
  await page.getByRole('button',{name:'Rubber Stamp Tools',exact:true}).click();
  await page.locator('#library-tray [data-item="stamp-readiness-fixture"]').click();
  await expect(page.locator('#paper-canvas')).toHaveAttribute('data-tool','stamp');
  await page.stampGate.requested;
  await expect(editorButton(page)).not.toHaveAttribute('data-native-motion-index');
});
test.afterEach(async({page})=>{
  page.stampGate?.release();
  const aborted=await page.evaluate(()=>[...(window.stampAbortedFetches??[])]);
  expect([...page.stampErrors,...unexpectedStampRequests(page.stampFailures,aborted)]).toEqual([]);
});

async function hold(page,input){
  const button=editorButton(page);
  await button.evaluate(node=>window.heldStampEditor=node);
  if(input==='pointer'){await button.hover();await page.mouse.down();}
  else{await button.focus();await page.keyboard.down(' ');}
}

for(const input of ['pointer','Space'])for(const reason of ['Escape','blur']){
  test(`Stamp Editor held fallback ${input} cancels by ${reason}`,async({page})=>{
    try{
      await hold(page,input);page.stampGate.release();await ready(page);
      if(reason==='Escape')await page.keyboard.press('Escape');
      else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      await releaseInput(page,input);
      await expect(editor(page)).toHaveCount(0);expect(page.editorRequests).toEqual([]);
      await editorButton(page).click();await expect(editor(page)).toBeVisible();
    }finally{page.stampGate.release();await releaseInput(page,input);}
  });
}

test('Stamp Editor fallback release outside rejects activation after readiness',async({page})=>{
  try{
    await hold(page,'pointer');page.stampGate.release();await ready(page);
    await page.mouse.move(800,400);await page.mouse.up();
    await expect(editor(page)).toHaveCount(0);expect(page.editorRequests).toEqual([]);
    await editorButton(page).click();await expect(editor(page)).toBeVisible();
  }finally{page.stampGate.release();await page.mouse.up();}
});

test('Stamp Editor Enter fallback and later semantic activation remain usable',async({page})=>{
  await editorButton(page).press('Enter');await expect(editor(page)).toBeVisible();
  page.stampGate.release();await ready(page);
  await editor(page).getByRole('button',{name:'Cancel',exact:true}).click();
  await editorButton(page).evaluate(node=>node.click());await expect(editor(page)).toHaveCount(1);
});

test.describe('Stamp Editor touch ownership',()=>{
  test.use({hasTouch:true});
  for(const timing of ['before','after'])test(`Stamp Editor readiness ${timing} touch activates once`,async({page})=>{
    if(timing==='before'){page.stampGate.release();await ready(page);}
    await editorButton(page).tap();await expect(editor(page)).toHaveCount(1);
    if(timing==='after'){page.stampGate.release();await ready(page);}
    await editor(page).getByRole('button',{name:'Cancel',exact:true}).tap();
    await expect(editor(page)).toHaveCount(0);
    await editorButton(page).tap();await expect(editor(page)).toHaveCount(1);
  });
  test('Stamp Editor held fallback Space rejects a competing real touch through readiness',async({page})=>{
    try{
      await hold(page,'Space');
      await page.getByRole('button',{name:'Painting Tools',exact:true}).tap();
      await expect(page.getByRole('button',{name:'Rubber Stamp Tools',exact:true})).toHaveAttribute('aria-pressed','true');
      page.stampGate.release();await ready(page);await page.keyboard.up(' ');
      await expect(editor(page)).toHaveCount(1);
    }finally{page.stampGate.release();await page.keyboard.up(' ');}
  });
});
const releaseInput=(page,input)=>input==='pointer'?page.mouse.up():page.keyboard.up(' ');

for(const input of ['pointer','Space'])for(const timing of ['before','during','after']){
  test(`Stamp Editor readiness ${timing} ${input} preserves activation`,async({page})=>{
    try{
      if(timing==='before'){page.stampGate.release();await ready(page);}
      await hold(page,input);
      if(timing==='during'){
        page.stampGate.release();await ready(page);
        expect(await editorButton(page).evaluate(node=>node===window.heldStampEditor&&node.isConnected)).toBe(true);
        if(input==='Space')await expect(editorButton(page)).toBeFocused();
      }
      await releaseInput(page,input);
      await expect(editor(page)).toBeVisible();await expect(editor(page)).toHaveCount(1);
      if(timing==='after'){page.stampGate.release();await ready(page);}
      await editor(page).getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(editor(page)).toHaveCount(0);
      await editorButton(page).click();await expect(editor(page)).toHaveCount(1);
    }finally{page.stampGate.release();await releaseInput(page,input);}
  });
}
