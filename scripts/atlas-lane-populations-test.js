const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function text(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['data/atlas-lane-populations.json','downloads/atlas-lane-populations.md','atlas-lanes/people.html','atlas-lanes/politicians.html','atlas-lanes/institutions.html','atlas-lanes/logos.html'].forEach(file);
text('atlas-lanes/people.html','Populated Source Leads');
text('atlas-lanes/politicians.html','public-record');
text('atlas-lanes/institutions.html','World Economic Forum');
text('atlas-lanes/logos.html','UN logo');
try{const d=JSON.parse(fs.readFileSync(f('data/atlas-lane-populations.json'),'utf8'));if(!d.ok)failures.push('population json not ok');if(!d.lanes.people||d.lanes.people.count<50)failures.push('people lane has fewer than 50 items');for(const id of ['politicians','financiers','institutions','media-owners','contracts','logos','vaccine-compensation']){if(!d.lanes[id]||d.lanes[id].count<5)failures.push('lane missing or thin: '+id)}}catch{failures.push('population json invalid')}
if(failures.length){console.error('ATLAS LANE POPULATIONS TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('ATLAS LANE POPULATIONS TEST PASSED');
