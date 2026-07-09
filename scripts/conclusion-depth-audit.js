const fs=require('fs');
const path=require('path');
const root=process.cwd();
const full=p=>path.join(root,p);
function read(p){try{return fs.existsSync(full(p))?fs.readFileSync(full(p),'utf8'):''}catch{return''}}
function text(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
const important=['power-conclusions.html','reader-conclusions.html','who-holds-power.html','one-world-convergence.html','accountability-watch.html','evidence-hunter.html','review-dashboard.html','site-brain-router.html','source-intake.html','search.html'];
const checks=[
  ['evidence boundary',/evidence boundary|inclusion means|record first|public-record/i],
  ['what proves',/what this proves|proves:/i],
  ['what suggests',/what this suggests|suggests:/i],
  ['missing record',/missing record|records? needed|what records/i],
  ['next action',/next action|what to watch|hunt next|submit source/i],
  ['confidence or limit',/confidence|limit|does not prove|open question/i]
];
const pages=[];
for(const file of important){const raw=read(file);const body=text(raw);const missing=checks.filter(([label,rx])=>!rx.test(body)).map(([label])=>label);pages.push({file,exists:Boolean(raw),score:raw?checks.length-missing.length:0,max:checks.length,missing,status:!raw?'missing':missing.length?'weak':'strong'});}
const weak=pages.filter(p=>p.status!=='strong');
const report={ok:weak.length===0,updated:new Date().toISOString(),purpose:'Checks whether important reader pages contain conclusion depth, evidence boundaries, limits and missing records.',pages,weak};
fs.mkdirSync(full('data'),{recursive:true});fs.mkdirSync(full('downloads'),{recursive:true});
fs.writeFileSync(full('data/conclusion-depth-audit.json'),JSON.stringify(report,null,2));
fs.writeFileSync(full('downloads/conclusion-depth-audit.md'),'# Conclusion Depth Audit\n\nUpdated: '+report.updated+'\n\nWeak pages: '+weak.length+'\n\n'+pages.map(p=>`- ${p.file}: ${p.status} (${p.score}/${p.max})${p.missing.length?' missing '+p.missing.join(', '):''}`).join('\n'));
console.log(`Conclusion depth audit complete: ${weak.length} weak page(s).`);
