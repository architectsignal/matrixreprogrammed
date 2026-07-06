const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
const nonPerson=/department|agency|institute|institution|forum|foundation|bank|blackrock|vanguard|state street|nato|united nations|company|corporation|corp\b|inc\b|ltd\b|llc\b|ministry|government|committee|council|order\b|society\b|family\b|lineage|group|network|fund\b|commission|court|university|hospital/i;
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing')}
function txt(p){return fs.existsSync(f(p))?fs.readFileSync(f(p),'utf8'):''}
function has(p,m){if(!txt(p).includes(m))failures.push(p+' missing '+m)}
['top-52-power-deck.html','data/top-52-power-deck.json','downloads/top-52-power-deck.md'].forEach(file);
has('top-52-power-deck.html','TOP 52 PERSONS OF INTEREST.');
has('top-52-power-deck.html','Persons of Interest');
has('top-52-power-deck.html','people only');
has('top-52-power-deck.html','Card Wall');
has('top-52-power-deck.html','Crowns');
has('top-52-power-deck.html','Coins');
has('top-52-power-deck.html','Swords');
has('top-52-power-deck.html','Masks');
try{const d=JSON.parse(txt('data/top-52-power-deck.json'));if(!d.ok)failures.push('deck json not ok');if(!/Persons of Interest/i.test(d.title||''))failures.push('wrong deck title');if(!/people|person/i.test((d.method||[]).join(' ')))failures.push('method does not state people only');if(!Array.isArray(d.deck)||d.deck.length<20)failures.push('deck too small');if(!Array.isArray(d.suits)||d.suits.length!==4)failures.push('suits missing');for(const s of ['Crowns','Coins','Swords','Masks']){if(!d.deck.some(c=>c.suit===s))failures.push('no card suit '+s)}for(const c of d.deck){if(nonPerson.test(c.name))failures.push('non-person card: '+c.name);if(!c.boundary||!/does not claim/i.test(c.boundary))failures.push('missing boundary '+c.name)}const first=d.deck[0];if(first&&!fs.existsSync(f('top-52/'+first.id+'.html')))failures.push('first dossier page missing')}catch{failures.push('deck json invalid')}
if(failures.length){console.error('TOP 52 PERSONS OF INTEREST TEST FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('TOP 52 PERSONS OF INTEREST TEST PASSED');
