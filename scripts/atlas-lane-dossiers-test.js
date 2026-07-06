const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function text(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['power-atlas.html','data/atlas-lane-dossiers.json','downloads/atlas-lane-dossiers.md'].forEach(file);
text('power-atlas.html','atlas-lanes/politicians.html');
text('power-atlas.html','atlas-lanes/financiers.html');
text('power-atlas.html','atlas-lanes/logos.html');
text('power-atlas.html','atlas-lanes/vaccine-compensation.html');
text('power-atlas.html','Atlas Dossier Doors');
for(const p of ['atlas-lanes/politicians.html','atlas-lanes/financiers.html','atlas-lanes/media-owners.html','atlas-lanes/logos.html','atlas-lanes/contracts.html','atlas-lanes/migration.html']){file(p);text(p,'Atlas Lane Dossier');text(p,'Agenda 2030');text(p,'Boundary')}
try{const d=JSON.parse(fs.readFileSync(f('data/atlas-lane-dossiers.json'),'utf8'));if(!d.ok)failures.push('atlas dossier json not ok');if(!Array.isArray(d.lanes)||d.lanes.length<30)failures.push('too few atlas lanes');for(const id of ['politicians','financiers','intelligence-figures','media-owners','logos','vaccine-compensation']){if(!d.lanes.some(x=>x.id===id))failures.push('missing atlas lane '+id)}}catch{failures.push('atlas dossier json invalid')}
if(failures.length){console.error('ATLAS LANE DOSSIERS TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('ATLAS LANE DOSSIERS TEST PASSED');
