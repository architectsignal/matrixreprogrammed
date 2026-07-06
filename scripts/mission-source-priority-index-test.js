const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function text(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['mission-source-priority.html','data/mission-source-priority-index.json','downloads/mission-source-priority-index.md'].forEach(file);
text('mission-source-priority.html','MISSION SOURCE PRIORITY INDEX.');
text('mission-source-priority.html','This is not every record.');
text('mission-source-priority.html','Open these sources first');
try{const d=JSON.parse(fs.readFileSync(f('data/mission-source-priority-index.json'),'utf8'));if(!d.ok)failures.push('mission source priority json not ok');if(!Array.isArray(d.priorities)||d.priorities.length<8)failures.push('too few source priorities');for(const id of ['sec-edgar-core','contracts-procurement-core','court-docket-core','central-bank-money-core','epstein-court-file-core']){if(!d.priorities.some(x=>x.id===id))failures.push('missing priority '+id)}}catch{failures.push('mission source priority json invalid')}
if(failures.length){console.error('MISSION SOURCE PRIORITY INDEX TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('MISSION SOURCE PRIORITY INDEX TEST PASSED');
