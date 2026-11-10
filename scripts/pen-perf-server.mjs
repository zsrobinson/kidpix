import { createServer, build } from 'vite';
let server;
if(process.env.BUILT){
 await build({configLoader:'runner',mode:'cloudflare',cacheDir:'artifacts/pen-perf/build-cache',build:{outDir:'artifacts/pen-perf/build'}});
 const {createBrowserBuildServer}=await import('./serve-browser-build.mjs');
 server=createBrowserBuildServer({buildRoot:new URL('../artifacts/pen-perf/build',import.meta.url).pathname});
 await new Promise(resolve=>server.listen(4242,'127.0.0.1',resolve));
}else{server=await createServer({configLoader:"runner",cacheDir:'artifacts/pen-perf/check-cache',server:{host:'127.0.0.1',port:4241,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
await server.listen();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit();});
