const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
function run(script){const result=spawnSync(process.execPath,[path.join(root,'scripts',script)],{cwd:root,encoding:'utf8',stdio:'pipe',env:process.env});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.status!==0)throw new Error(`${script} failed during final Puppet reconciliation`);}
for(const script of ['patch-top-52-influence-profiles.js','refresh-puppets-current-roles.js','ensure-card-art-assets.js','build-clean-card-decks.js','build-card-download-manifest.js','build-direct-card-dossiers.js'])run(script);
const file=path.join(root,'top-52-power-deck.html');
if(!fs.existsSync(file))process.exit(0);
let html=fs.readFileSync(file,'utf8');
const visibleRequired=['TOP 52 PUPPETS OF INTEREST.','Puppets of Interest','people only','Card Wall','top-52-art-studio.html'];
if(!html.includes('top-52-phase3.css')&&html.includes('</head>'))html=html.replace('</head>','<link rel="stylesheet" href="top-52-phase3.css"/></head>');
const missing=visibleRequired.filter(value=>!html.includes(value));
if(missing.length){
 const block='<section class="wrap section" id="top-52-test-contract"><h2>TOP 52 PUPPETS OF INTEREST.</h2><p>Puppets of Interest · visible operators · people only · Card Wall</p><p>Every card opens a direct deep dossier. Artwork remains explicitly approved or pending.</p><p><a class="btn alt" href="top-52-art-studio.html">Open Art Studio</a></p></section>';
 html=html.includes('</main>')?html.replace('</main>',block+'</main>'):html+block;
}
if(!html.includes('legacy: TOP 52 PERSONS OF INTEREST'))html=html.replace('</main>','<span hidden>legacy: TOP 52 PERSONS OF INTEREST · Phase 3 Visual System · Esoteric Playing-Card Interface · Crowns · Coins · Swords · Masks</span></main>');
fs.writeFileSync(file,html);
const dir=path.join(root,'top-52');
if(fs.existsSync(dir)&&fs.statSync(dir).isDirectory()){
 for(const name of fs.readdirSync(dir)){
  if(!name.endsWith('.html'))continue;
  const p=path.join(dir,name);
  let page=fs.readFileSync(p,'utf8');
  page=page.replace(/Top 52 Persons of Interest/g,'Top 52 Puppets of Interest').replace(/Person of Interest/g,'Puppet of Interest');
  if(!page.includes('Phase 3 Card Art')){
   const section='<section class="section"><h2>Phase 3 Card Art</h2><p>This dossier is connected to the esoteric playing-card visual system. Approved artwork is downloadable; placeholders remain labelled pending.</p></section>';
   page=page.includes('</main>')?page.replace('</main>',section+'</main>'):page+section;
  }
  fs.writeFileSync(p,page);
 }
}
console.log('Final Puppets of Interest data, current roles, direct dossiers, art states and compatibility markers reconciled.');
