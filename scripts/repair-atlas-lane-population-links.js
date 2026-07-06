const fs=require('fs');
const path=require('path');
const root=process.cwd();
const dir=path.join(root,'atlas-lanes');
let touched=0;
const internal=new Set([
  'epstein-files.html',
  'evidence-vault.html',
  'private-contractor-tracker.html',
  'power-structure-map.html',
  'daily-brief-master.html',
  'mission-source-priority.html',
  'deep-intel-feed.html',
  'control-map-daily.html',
  'evidence-graph.html',
  'power-atlas.html'
]);
if(fs.existsSync(dir)){
  for(const name of fs.readdirSync(dir)){
    if(!name.endsWith('.html')) continue;
    const file=path.join(dir,name);
    let html=fs.readFileSync(file,'utf8');
    const before=html;
    for(const target of internal){
      html=html.split(`href="${target}"`).join(`href="../${target}"`);
      html=html.split(`src="${target}"`).join(`src="../${target}"`);
    }
    if(html!==before){fs.writeFileSync(file,html);touched++}
  }
}
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads/atlas-lane-link-repair.json'),JSON.stringify({ok:true,updated:new Date().toISOString(),touched},null,2));
console.log('Atlas lane population link repair complete: '+touched+' files.');
