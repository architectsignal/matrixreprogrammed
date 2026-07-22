const fs=require('fs');
const path=require('path');
const root=process.cwd();
const f=p=>path.join(root,p);
const failures=[];
const nonPerson=/\b(department|agency|institute|institution|forum|foundation|bank|blackrock|vanguard|state street|nato|united nations|company|corporation|corp|inc|ltd|llc|ministry|government|committee|council|order|society|family|lineage|group|network|fund|commission|court|university|hospital|world health|federal reserve|caci|booz allen)\b/i;
const slug=s=>String(s||'').toLowerCase().replace(/&/g,' and ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function file(p){if(!fs.existsSync(f(p)))failures.push(p+' missing');}
function txt(p){return fs.existsSync(f(p))?fs.readFileSync(f(p),'utf8'):'';}
function has(p,m){if(!txt(p).includes(m))failures.push(p+' missing '+m);}
['top-52-power-deck.html','data/top-52-power-deck.json','downloads/top-52-power-deck.md'].forEach(file);
has('top-52-power-deck.html','TOP 52 PUPPETS OF INTEREST.');
has('top-52-power-deck.html','Puppets of Interest');
has('top-52-power-deck.html','people only');
has('top-52-power-deck.html','Card Wall');
for(const suit of ['Crowns','Coins','Swords','Masks'])has('top-52-power-deck.html',suit);
try{
 const data=JSON.parse(txt('data/top-52-power-deck.json'));
 const html=txt('top-52-power-deck.html');
 if(!data.ok)failures.push('deck json not ok');
 if(data.title!=='Top 52 Puppets of Interest')failures.push('wrong deck title: '+data.title);
 if(!data.personOnly)failures.push('deck is not marked people only');
 if(!Array.isArray(data.deck)||data.deck.length!==52)failures.push('deck must contain exactly 52 people');
 if(!Array.isArray(data.suits)||data.suits.length!==4)failures.push('suits missing');
 for(const suit of ['Crowns','Coins','Swords','Masks'])if(!data.deck.some(card=>card.suit===suit))failures.push('no card suit '+suit);
 for(const card of data.deck||[]){
  const id=slug(card.id||card.name);
  if(nonPerson.test(card.name))failures.push('non-person card: '+card.name);
  if(!card.boundary||!/(does not prove|not proof|not an accusation|does not claim)/i.test(card.boundary))failures.push('missing evidence boundary '+card.name);
  if(card.profileTitle!=='Puppet of Interest')failures.push('wrong profile label '+card.name);
  if(card.profileRoute!==`/top-52/${id}`)failures.push('wrong direct route '+card.name);
  if(!fs.existsSync(f(`top-52/${id}.html`)))failures.push('dossier page missing '+card.name);
  if(!html.includes(`href="/top-52/${id}"`))failures.push('card wall does not link directly to '+card.name);
 }
 const names=new Set((data.deck||[]).map(card=>card.name));
 for(const stale of ['Pope Francis','Jens Stoltenberg'])if(names.has(stale))failures.push('stale active-role entry remains: '+stale);
 for(const current of ['Pope Leo XIV','Mark Rutte','Donald Trump','Andy Burnham','António Guterres'])if(!names.has(current))failures.push('current-role entry missing: '+current);
 if(/href=["']top-52-power-deck\.html["'][^>]*>Deep Dossier/i.test(html))failures.push('Deep Dossier loops back to deck');
}catch(error){failures.push('deck json invalid: '+error.message);}
if(failures.length){console.error('TOP 52 PUPPETS OF INTEREST TEST FAILED');for(const item of failures)console.error('- '+item);process.exit(1);}
console.log('TOP 52 PUPPETS OF INTEREST TEST PASSED');
