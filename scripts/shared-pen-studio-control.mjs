// Benchmark-only minimal renderer. No fake studio actors, Undo clips, or UI media.
export const controlModes = ['full', 'minimal'];
export const minimalFixture = `<!doctype html><html><head><meta charset="utf-8">
<style>@import '/src/style.css'; #studio{background:none}</style></head><body>
<main id="app"><div id="viewport"><div id="studio"><section id="paint-zone"><div id="surface"><canvas id="paper-canvas" width="720" height="542" tabindex="0"></canvas></div></section></div></div></main>
<script type="module">
import {createPaint} from '/src/paint.js';
const c=document.querySelector('#paper-canvas');
const paint=createPaint(c,{includeForeground:false});
window.minimalPaint=paint;
window.selectMinimalTool=async(tool)=>{c.dataset.paintReady='loading';await paint.setOptions({gradient:null,tool,variant:'freehand',size:16,sizeIndex:2,color:'#000000',asset:null,mode:null,effectIndex:0,fill:false});c.dataset.paintReady='ready';};
function scaleStudio(){const app=document.querySelector('#app'),scale=Math.min(app.clientWidth/1024,app.clientHeight/768),v=document.querySelector('#viewport');v.style.width=(1024*scale)+'px';v.style.height=(768*scale)+'px';document.querySelector('#studio').style.transform='scale('+scale+')';}
new ResizeObserver(scaleStudio).observe(document.querySelector('#app'));scaleStudio();
await window.selectMinimalTool('pencil');
</script></body></html>`;

export function studioControlPlugin(mode, presentation = 'default') {
 if (!['default','surface-paint'].includes(presentation))throw Error('Invalid PRESENTATION');
 if (!controlModes.includes(mode)) throw Error('Invalid CONTROL_MODE');
 return { name:'shared-pen-studio-control', transformIndexHtml(html) {
  return presentation==='default'?html:html.replace('</head>','<style>#surface{contain:paint}</style></head>');
 }, configureServer(server) {
  server.middlewares.use(async(req,res,next)=>{
   if(mode!=='minimal'||req.url.split('?')[0]!=='/')return next();
   try {res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/',minimalFixture));}catch(error){next(error);}
  });
 }};
}

// Executed in the browser. Keep geometry separate from presentation properties.
export function stageState() {
 const properties=['position','display','width','height','left','top','right','bottom','transform','transformOrigin','boxSizing','padding','border','margin','zoom','alignItems','justifyItems','alignContent','justifyContent'];
 const presentation=['overflow','isolation','contain','willChange','opacity','zIndex','backgroundImage','clipPath'];
 const chain=[];
 for(let n=document.querySelector('#paper-canvas');n;n=n.parentElement){const s=getComputedStyle(n),r=n.getBoundingClientRect();chain.push({tag:n.tagName,id:n.id,rect:{x:r.x,y:r.y,width:r.width,height:r.height},geometry:Object.fromEntries(properties.map(p=>[p,s[p]])),presentation:Object.fromEntries(presentation.map(p=>[p,s[p]]))});}
 return {chain,options:window.sharedPaintOptions,canvas:{width:document.querySelector('#paper-canvas').width,height:document.querySelector('#paper-canvas').height}};
}
