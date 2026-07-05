const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function has(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['evidence-graph.html','daily-power-conclusions.html','data/evidence-weighted-relationship-graph.json','data/daily-power-conclusions.json','downloads/mission-intelligence-10.md'].forEach(file);
has('evidence-graph.html','Top evidence-weighted nodes');
has('daily-power-conclusions.html','What the machine says today');
has('daily-power-conclusions.html','Strongest route today');
try{
  const g=JSON.parse(fs.readFileSync(f('data/evidence-weighted-relationship-graph.json'),'utf8'));
  if(!g.ok)failures.push('graph json not ok');
  if(!Array.isArray(g.nodes)||g.nodes.length<5)failures.push('graph has too few nodes');
  if(!Array.isArray(g.edges))failures.push('graph edges missing');
}catch{failures.push('graph json invalid')}
try{
  const c=JSON.parse(fs.readFileSync(f('data/daily-power-conclusions.json'),'utf8'));
  if(!c.ok)failures.push('conclusions json not ok');
  if(!Array.isArray(c.conclusions)||c.conclusions.length<5)failures.push('too few daily conclusions');
}catch{failures.push('conclusions json invalid')}
if(failures.length){console.error('MISSION INTELLIGENCE TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('MISSION INTELLIGENCE TEST PASSED');
