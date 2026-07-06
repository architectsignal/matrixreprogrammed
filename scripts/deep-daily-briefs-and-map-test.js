const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function text(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['daily-brief-master.html','control-map-daily.html','data/daily-brief-master.json','data/control-map-daily.json','data/master-evidence-source-registry.json','downloads/daily-brief-master.md','downloads/control-map-daily.md','downloads/master-evidence-source-registry.md'].forEach(file);
text('daily-brief-master.html','DEEP DAILY CONTROL BRIEF');
text('daily-brief-master.html','One-World Convergence Watch');
text('daily-brief-master.html','Evidence Source Registry');
text('control-map-daily.html','DAILY / WEEKLY VISUAL CONTROL MAP');
text('control-map-daily.html','Evidence Base');
try{const d=JSON.parse(fs.readFileSync(f('data/daily-brief-master.json'),'utf8'));if(!d.ok)failures.push('daily brief json not ok');if(!Array.isArray(d.sections)||d.sections.length<6)failures.push('brief structure too thin');if(!Array.isArray(d.convergence)||d.convergence.length<4)failures.push('convergence watch missing');}catch{failures.push('daily brief json invalid')}
try{const s=JSON.parse(fs.readFileSync(f('data/master-evidence-source-registry.json'),'utf8'));if(!s.ok)failures.push('source registry json not ok');for(const id of ['government-records','court-and-legal-records','finance-and-ownership-records','document-archive-lane','epstein-record-lane','missing-records']){if(!s.lanes.some(x=>x.id===id))failures.push('source registry missing '+id)}}catch{failures.push('source registry json invalid')}
try{const m=JSON.parse(fs.readFileSync(f('data/control-map-daily.json'),'utf8'));if(!m.ok)failures.push('control map json not ok');if(!Array.isArray(m.layers)||m.layers.length<4)failures.push('control map layers too thin');}catch{failures.push('control map json invalid')}
if(failures.length){console.error('DEEP DAILY BRIEFS AND MAP TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('DEEP DAILY BRIEFS AND MAP TEST PASSED');
