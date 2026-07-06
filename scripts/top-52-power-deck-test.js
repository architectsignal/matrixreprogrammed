const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function has(p,m){if(!fs.existsSync(f(p))||!fs.readFileSync(f(p),'utf8').includes(m))failures.push(p+' missing '+m)}
['top-52-power-deck.html','data/top-52-power-deck.json','downloads/top-52-power-deck.md'].forEach(file);
has('top-52-power-deck.html','TOP 52 POWER DECK.');
has('top-52-power-deck.html','Card Wall');
has('top-52-power-deck.html','Crowns');
has('top-52-power-deck.html','Coins');
has('top-52-power-deck.html','Swords');
has('top-52-power-deck.html','Masks');
try{const d=JSON.parse(fs.readFileSync(f('data/top-52-power-deck.json'),'utf8'));if(!d.ok)failures.push('deck json not ok');if(!Array.isArray(d.deck)||d.deck.length<20)failures.push('deck too small');if(!Array.isArray(d.suits)||d.suits.length!==4)failures.push('suits missing');for(const s of ['Crowns','Coins','Swords','Masks']){if(!d.deck.some(c=>c.suit===s))failures.push('no card suit '+s)}const first=d.deck[0];if(first&&!fs.existsSync(f('top-52/'+first.id+'.html')))failures.push('first dossier page missing')}catch{failures.push('deck json invalid')}
if(failures.length){console.error('TOP 52 POWER DECK TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('TOP 52 POWER DECK TEST PASSED');
