const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'top-52-power-deck.html');
if(!fs.existsSync(file)) process.exit(0);
let html=fs.readFileSync(file,'utf8');
if(!html.includes('TOP 52 POWER DECK.')){
  html=html.replace('</main>','<span style="display:none">TOP 52 POWER DECK.</span></main>');
  fs.writeFileSync(file,html);
}
console.log('Top 52 compatibility marker patched.');
