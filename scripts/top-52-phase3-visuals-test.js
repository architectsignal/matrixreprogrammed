const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function txt(p){return fs.existsSync(f(p))?fs.readFileSync(f(p),'utf8'):''}
function has(p,m){if(!txt(p).includes(m))failures.push(p+' missing '+m)}
['top-52-power-deck.html','top-52-phase3.css','data/top-52-card-art-manifest.json','downloads/top-52-card-art-manifest.md'].forEach(file);
has('top-52-power-deck.html','Phase 3 Visual System');
has('top-52-power-deck.html','Esoteric Playing-Card Interface');
has('top-52-power-deck.html','top-52-phase3.css');
has('top-52-phase3.css','.power-card.crowns');
has('top-52-phase3.css','.power-card.coins');
has('top-52-phase3.css','.power-card.swords');
has('top-52-phase3.css','.power-card.masks');
try{const d=JSON.parse(txt('data/top-52-card-art-manifest.json'));if(!d.ok)failures.push('art manifest not ok');if(!Array.isArray(d.cards)||d.cards.length<20)failures.push('art manifest too small');if(!d.cards[0]?.portraitPrompt)failures.push('portrait prompt missing');const first=d.cards[0];if(first&&!txt('top-52/'+first.id+'.html').includes('Phase 3 Card Art'))failures.push('first dossier missing phase 3 art section')}catch{failures.push('art manifest json invalid')}
if(failures.length){console.error('TOP 52 PHASE 3 VISUALS TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('TOP 52 PHASE 3 VISUALS TEST PASSED');
