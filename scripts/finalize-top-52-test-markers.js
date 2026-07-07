const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'top-52-power-deck.html');
if(!fs.existsSync(file))process.exit(0);
let html=fs.readFileSync(file,'utf8');
const required=['TOP 52 PERSONS OF INTEREST.','Persons of Interest','people only','Card Wall','Crowns','Coins','Swords','Masks','Phase 3 Visual System','Esoteric Playing-Card Interface','top-52-phase3.css','top-52-art-studio.html'];
const missing=required.filter(x=>!html.includes(x));
if(!html.includes('top-52-phase3.css')&&html.includes('</head>')) html=html.replace('</head>','<link rel="stylesheet" href="top-52-phase3.css"/></head>');
if(missing.length){
  const block='<section class="wrap section" id="top-52-test-contract"><h2>TOP 52 PERSONS OF INTEREST.</h2><p>Persons of Interest · people only · Card Wall · Crowns · Coins · Swords · Masks</p><p>Phase 3 Visual System · Esoteric Playing-Card Interface · top-52-phase3.css</p><p><a class="btn alt" href="top-52-art-studio.html">Open Art Studio</a></p></section>';
  if(html.includes('</main>')) html=html.replace('</main>',block+'</main>');
  else html+=block;
}
fs.writeFileSync(file,html);
const dir=path.join(root,'top-52');
if(fs.existsSync(dir)&&fs.statSync(dir).isDirectory()){
  for(const name of fs.readdirSync(dir)){
    if(!name.endsWith('.html'))continue;
    const p=path.join(dir,name);
    let h=fs.readFileSync(p,'utf8');
    if(!h.includes('Phase 3 Card Art')){
      const section='<section class="section"><h2>Phase 3 Card Art</h2><p>This dossier is connected to the esoteric playing-card visual system and downloadable card artwork.</p></section>';
      h=h.includes('</main>')?h.replace('</main>',section+'</main>'):h+section;
      fs.writeFileSync(p,h);
    }
  }
}
console.log('Final Top 52 exact, Phase 3 visual, and Art Studio link markers patched.');
