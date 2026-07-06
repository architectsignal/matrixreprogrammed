const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function text(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['atlas-lanes/logos.html','data/logo-symbolism-dossiers.json','downloads/logo-symbolism-dossiers.md'].forEach(file);
text('atlas-lanes/logos.html','Logo Symbolism Dossier');
text('atlas-lanes/logos.html','Official Logo Links + Esoteric Readings');
text('atlas-lanes/logos.html','UN logo');
text('atlas-lanes/logos.html','Esoteric reading');
text('atlas-lanes/logos.html','Open official logo/source page');
try{const d=JSON.parse(fs.readFileSync(f('data/logo-symbolism-dossiers.json'),'utf8'));if(!d.ok)failures.push('logo symbolism json not ok');if(!Array.isArray(d.logos)||d.logos.length<12)failures.push('too few logo dossiers');for(const name of ['UN logo','WHO logo','WEF logo','BlackRock logo','EU emblem']){if(!d.logos.some(x=>x.name===name))failures.push('missing logo dossier '+name)}}catch{failures.push('logo symbolism json invalid')}
if(failures.length){console.error('LOGO SYMBOLISM DOSSIERS TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('LOGO SYMBOLISM DOSSIERS TEST PASSED');
