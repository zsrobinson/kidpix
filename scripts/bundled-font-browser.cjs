// Standalone same-container HTTP fixture: no application editor or external network.
const fs = require('node:fs');
const http = require('node:http');
const { chromium, webkit } = require('/deps/node_modules/playwright');
const catalog = JSON.parse(fs.readFileSync('/repo/src/bundled-font-catalog.json'));
let requests = [];
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/module.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync('/repo/src/bundled-fonts.js', 'utf8').replace(/^import catalog .*;$/m, `const catalog = ${JSON.stringify(catalog)};`));
  }
  if (path.startsWith('/original/fonts/')) {
    requests.push(req.url);
    const face = catalog.faces.find(f => '/' + f.key === path);
    if (!face) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'font/ttf'); return res.end(fs.readFileSync('/fonts/' + face.source));
  }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><body>Font fixture</body>');
});
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const url = `http://127.0.0.1:${server.address().port}`;
 for (const [engine, type] of Object.entries({ chromium, webkit })) {
  requests = [];
  const browser = await type.launch({ headless: true });
  try {
   const page = await browser.newPage(); await page.goto(url);
   const control = await page.evaluate(async data => {
    const alias='KPX Native FifthAve', sample='Hamburgefontsiv 0123456789';
    const font=`32px "${alias}", monospace`;
    const canvas=document.createElement('canvas'); canvas.width=1000;canvas.height=100;
    const ctx=canvas.getContext('2d');
    function paint(c) { c.clearRect(0,0,1000,100);c.font=font;c.fillText(sample,5,60);return {width:c.measureText(sample).width,pixels:Array.from(c.getImageData(0,0,1000,100).data)}; }
    const span=document.createElement('span');span.textContent=sample;span.style.font=font;document.body.append(span);
    const before=paint(ctx);span.getBoundingClientRect();
    const face=new FontFace(alias,Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer);
    await face.load();document.fonts.add(face);
    paint(ctx);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    span.getBoundingClientRect();
    const direct=paint(ctx);
    const fresh=document.createElement('canvas');fresh.width=1000;fresh.height=100;
    const reference=paint(fresh.getContext('2d'));
    const m=await import('/module.js');
    const loader=m.createBundledFontLoader();
    // Control exercises the helper with a legacy style (no readiness dependency);
    // exact recovered bytes have already been loaded independently above.
    loader.applyCanvasFont(ctx,font,'serif');
    const helper=paint(ctx);
    const equal=(a,b)=>a.width===b.width && a.pixels.every((v,i)=>v===b.pixels[i]);
    return {directFallback:equal(before,direct),helperMatchesFresh:equal(helper,reference),freshDifferent:!equal(before,reference)};
   },fs.readFileSync('/fonts/sfnt/FifthAvenue.ttf').toString('base64'));
   if (!control.helperMatchesFresh || !control.freshDifferent || (engine==='webkit' && !control.directFallback)) throw new Error('Strict control failed '+JSON.stringify(control));
   await page.goto(url);
   await page.evaluate(() => import('/module.js').then(m => window.fontsModule = m));
   if (requests.length) throw new Error('Eager font network on import');
   const results = await page.evaluate(async catalog => {
    const m = window.fontsModule, sample = 'Hamburgefontsiv 0123456789';
    const rows = [];
    function context() { const c = document.createElement('canvas'); c.width = 1200; c.height = 120; return c.getContext('2d'); }
    function paint(ctx, font, style, helper = false) {
     ctx.clearRect(0, 0, 1200, 120);
     if (helper) m.applyCanvasFont(ctx, font, style); else ctx.font = font;
     ctx.fillText(sample, 5, 65);
     return { width: ctx.measureText(sample).width, pixels: Array.from(ctx.getImageData(0,0,1200,120).data) };
    }
    function dom(font) { const el = document.createElement('span'); el.textContent = sample; el.style.cssText = `display:inline-block;white-space:pre;font:${font}`; document.body.append(el); return el; }
    const equal = (a,b) => a.width === b.width && a.pixels.every((v,i) => v === b.pixels[i]);
    for (const face of catalog.faces) {
     const variants = face.family === 'Schoolhouse' ? [[face.cssWeight === 700, face.cssStyle === 'italic']] : [[false,false],[true,false],[false,true],[true,true]];
     const cases = variants.map(([bold,italic]) => {
      const style = {font:face.cssFamily,bold,italic};
      const font = `${italic ? 'italic' : 'normal'} ${bold ? 700 : 400} 32px "${face.cssFamily}", monospace`;
      const ctx = context(), before = paint(ctx,font); const el = dom(font);
      return { style, font, ctx, before, el };
     });
     await m.ensureFace(face);
     for (const c of cases) c.old = paint(c.ctx, c.font);
     // Independent FontFace and fresh reference context use the same unmodified bytes.
     const bytes = await (await fetch('/' + face.key)).arrayBuffer();
     const alias = 'Independent ' + face.cssFamily;
     const reference = new FontFace(alias, bytes, {weight:String(face.cssWeight),style:face.cssStyle});
     await reference.load(); document.fonts.add(reference);
     for (const c of cases) {
      const refFont = c.font.replace(face.cssFamily, alias);
      const refDom = dom(refFont); refDom.getBoundingClientRect();
      const fresh = paint(context(), c.font), ref = paint(context(), refFont);
      const old = c.old, helper = paint(c.ctx,c.font,c.style,true);
      const row = { key:face.key,bold:c.style.bold,italic:c.style.italic,
       oldDirectFallback:equal(old,c.before), helperMatchesFresh:equal(helper,fresh), independentMatches:equal(helper,ref),
       nonempty:helper.pixels.some(v=>v!==0), differsFromFallback:!equal(helper,c.before),
       domMatches:Math.abs(c.el.getBoundingClientRect().width-refDom.getBoundingClientRect().width)<0.02 };
      // Ensure helper leaves every unrelated drawing property/pixel untouched.
      c.ctx.globalAlpha=.37; c.ctx.fillStyle='#123456'; c.ctx.setTransform(1,0,0,1,3,4);
      const prior=c.ctx.getImageData(0,0,1200,120).data;
      m.applyCanvasFont(c.ctx,c.font,c.style);
      const after=c.ctx.getImageData(0,0,1200,120).data;
      row.statePreserved=c.ctx.globalAlpha===.37 && c.ctx.fillStyle==='#123456' && c.ctx.getTransform().e===3 && prior.every((v,i)=>v===after[i]);
      rows.push(row); c.el.remove();refDom.remove();
     }
    }
    return rows;
   }, catalog);
   const asyncControls = await page.evaluate(async () => {
    const m=window.fontsModule, face=m.bundledFaces[0];
    let mode='bad', calls=0;
    const fetcher=async (url, options) => {
      calls++;
      if(mode==='hang') return new Promise(()=>{});
      if(mode==='delay') await new Promise(r=>setTimeout(r,30));
      const response=await fetch(url,options);
      if(mode==='bad') { const bytes=new Uint8Array(await response.arrayBuffer());bytes[0]^=1;return new Response(bytes); }
      if(mode==='http') return new Response('',{status:503});
      return response;
    };
    const loader=m.createBundledFontLoader({fetch:fetcher,loadTimeoutMs:1000});
    const rejected=async (promise,name) => {try {await promise;throw new Error('Expected rejection');}catch(e){if(name && e.name!==name)throw e;return e.message;} };
    const hash=await rejected(loader.ensureFace(face));
    if(!hash.includes('SHA-256') || loader.status(face)!=='failed') throw new Error('Hash rejection failed');
    mode='http';const http=await rejected(loader.ensureFace(face));
    if(!http.includes('503')) throw new Error('HTTP failure missed');
    mode='delay';const controller=new AbortController();
    const a=loader.ensureFace(face,{signal:controller.signal}), b=loader.ensureFace(face);controller.abort();
    await rejected(a,'AbortError');await b;
    const before=calls;await loader.ensureFace(face);if(calls!==before)throw new Error('Cache fetch');
    const timeoutLoader=m.createBundledFontLoader({fetch:fetcher,loadTimeoutMs:40});
    mode='hang';await rejected(timeoutLoader.ensureFace(face),'TimeoutError');
    if(timeoutLoader.status(face)!=='failed')throw new Error('Missing failure state');
    mode='good';await timeoutLoader.ensureFace(face);
    return {hash:true,http:true,abort:true,sharedSurvivor:true,cache:true,timeout:true,retry:true};
   });
   const receipt = { control, asyncControls, engine, version:browser.version(), cases:results.length, requests:requests.length, results };
   fs.writeFileSync(`/out/${engine}.json`, JSON.stringify(receipt,null,2)+'\n');
   const failures = results.filter(r => !r.helperMatchesFresh || !r.independentMatches || !r.nonempty || !r.differsFromFallback || !r.domMatches || !r.statePreserved);
   if (failures.length) throw new Error(`${engine}: ${failures.length} failures ${JSON.stringify(failures.slice(0,2))}`);

   console.log(engine, browser.version(), results.length, 'passed; direct fallback controls:',results.filter(r=>r.oldDirectFallback).length);
  } finally { await browser.close(); }
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
