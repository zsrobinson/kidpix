import { readFile } from 'node:fs/promises';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Usage: node scripts/pen-perf-summary.mjs before/results.json after/results.json');
const before=JSON.parse(await readFile(beforePath)),after=JSON.parse(await readFile(afterPath));
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summarize=rows=>({trials:rows.length,handlerP50:median(rows.map(r=>r.handler.p50)),handlerP95:median(rows.map(r=>r.handler.p95)),handlerP95Range:rows.map(r=>r.handler.p95),handlerWorst:Math.max(...rows.map(r=>r.handler.worst)),frameP50:median(rows.map(r=>r.frame.p50)),frameP95:median(rows.map(r=>r.frame.p95)),frameWorst:Math.max(...rows.map(r=>r.frame.worst)),nextRAFP95:median(rows.map(r=>r.nextRAF.p95)),readbacks:rows.map(r=>r.canvas.getImageData?.count||0),uploads:rows.map(r=>r.canvas.putImageData?.count||0),moveSamples:rows.map(r=>r.samples),trustedEvents:rows.map(r=>r.trusted),gapsOver25ms:rows.map(r=>r.over60),longTasks:rows.flatMap(r=>r.longTasks)});
const summary=[];
for(const key of new Set(before.rows.map(r=>`${r.tool}/${r.size}/${r.mode}`))){const pick=r=>`${r.tool}/${r.size}/${r.mode}`===key;summary.push({key,before:summarize(before.rows.filter(pick)),after:summarize(after.rows.filter(pick))});}
console.log(JSON.stringify(summary,null,2));
