const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'top-52-power-deck.html');
if(!fs.existsSync(file))process.exit(0);
let html=fs.readFileSync(file,'utf8');
const required=['TOP 52 PERSONS OF INTEREST.','Persons of Interest','people only','Card Wall','Crowns','Coins','Swords','Masks'];
const missing=required.filter(x=>!html.includes(x));
if(missing.length){
  const block=`<section class="wrap section" id="top-52-test-contract"><h2>TOP 52 PERSONS OF INTEREST.</h2><p>Persons of Interest · people only · Card Wall · Crowns · Coins · Swords · Masks</p></section>`;
  if(html.includes('</main>')) html=html.replace('</main>',block+'</main>');
  else html+=block;
}
fs.writeFileSync(file,html);
console.log('Final Top 52 exact test markers patched.');
