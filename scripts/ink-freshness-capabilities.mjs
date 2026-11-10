// Passive-capture capability probe only; no app/input performance claim.
import {chromium,webkit} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const engine=process.env.ENGINE||'chromium';
const out=process.env.CAP_OUT||`artifacts/t3/ink-freshness/capabilities-${engine}.json`;
const browser=await {chromium,webkit}[engine].launch();
const result={engine,browser:browser.version(),frames:[],physicalPresentation:'unobservable'};
try{
 const page=await browser.newPage({viewport:{width:1366,height:1024},deviceScaleFactor:2});
 await page.goto('about:blank');
 try{
  const cdp=await page.context().newCDPSession(page);
  const {categories}=await cdp.send('Tracing.getCategories');
  result.traceCategories=categories.filter(c=>/screenshot|frame|timeline/i.test(c));
  cdp.on('Page.screencastFrame',e=>{result.frames.push({metadata:e.metadata,encodedBytes:e.data.length});void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
  await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1});
  await page.evaluate(()=>{document.body.style.background='red';});
  await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');
  result.screencast='protocol command accepted; about:blank diagnostic only, not an ink oracle or physical presentation';
 }catch(e){result.cdpError=String(e);}
}finally{await browser.close();await writeFile(out,JSON.stringify(result,null,2));}
console.log(JSON.stringify(result));
