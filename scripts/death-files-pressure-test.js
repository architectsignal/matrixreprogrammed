const fs=require('fs'),path=require('path'),root=process.cwd();
const required=['death-files.html','death-files-pattern-lab.html','death-files-methodology.html','death-files.js','data/death-files.json','data/death-files-runtime.json','downloads/death-files-index.json','downloads/death-files-100-catalogue.json'];
for(const rel of required){if(!fs.existsSync(path.join(root,rel))){console.error('Archive verification failed: '+rel+' missing');process.exit(1)}}
const data=JSON.parse(fs.readFileSync(path.join(root,'data','death-files.json'),'utf8'));
const dossiers=Array.isArray(data.dossiers)?data.dossiers:[];
if(dossiers.length!==100){console.error('Archive verification failed: expected exactly 100 dossiers, found '+dossiers.length);process.exit(1)}
const slugs=new Set(),names=new Set();
for(const item of dossiers){
  if(Number(item.year)<1963){console.error('Archive verification failed: '+item.name+' predates JFK boundary');process.exit(1)}
  if(slugs.has(item.slug)||names.has(item.name)){console.error('Archive verification failed: duplicate identity '+item.name);process.exit(1)}
  slugs.add(item.slug);names.add(item.name);
  if(item.speculationRequired!==true){console.error('Archive verification failed: speculation rationale not required for '+item.name);process.exit(1)}
  const rationale=item.conspiracyRationale||{};
  for(const field of ['reason','suspectedMotive','supportingClues','counterEvidence','proofNeeded']){
    if(String(rationale[field]||'').trim().length<40){console.error('Archive verification failed: '+item.name+' lacks detailed '+field);process.exit(1)}
  }
  if(!String(item.speculation||'').includes('Why conspiracy theories exist:')||!String(item.speculation||'').includes('Strongest counter-evidence and limitation:')||!String(item.speculation||'').includes('Proof required:')){
    console.error('Archive verification failed: '+item.name+' speculation layer is incomplete');process.exit(1)
  }
  if(!Array.isArray(item.evidence)||item.evidence.length<1){console.error('Archive verification failed: '+item.name+' has no authoritative starting source');process.exit(1)}
  const page=path.join(root,'death-file-'+item.slug+'.html'),year=path.join(root,'death-files-year-'+item.year+'.html');
  if(!fs.existsSync(page)||!fs.existsSync(year)){console.error('Archive verification failed for '+item.slug);process.exit(1)}
  const html=fs.readFileSync(page,'utf8');
  for(const marker of ['Evidence Room','Evidence-Based Conclusion','Analytical Inference','Speculative Conclusions','Why conspiracy theories exist:','Strongest counter-evidence and limitation:','Proof required:','death-signal-form','death-signal-feed','id="signal-drop"']){
    if(!html.includes(marker)){console.error('Archive verification failed: '+item.slug+' lacks '+marker);process.exit(1)}
  }
}
for(const requiredSlug of ['john-f-kennedy','muammar-gaddafi','jeffrey-epstein','alexei-navalny','ebrahim-raisi']){
  if(!slugs.has(requiredSlug)){console.error('Archive verification failed: required case missing '+requiredSlug);process.exit(1)}
}
const years=[...new Set(dossiers.map(item=>Number(item.year)))].sort((a,b)=>a-b);
if(years[0]!==1963||years[years.length-1]<2024){console.error('Archive verification failed: archive must run from JFK into the present era');process.exit(1)}
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','death-files-pressure-test.json'),JSON.stringify({ok:true,generatedAt:new Date().toISOString(),dossiers:dossiers.length,firstYear:years[0],latestYear:years[years.length-1],years,requiredSpeculationFields:['reason','suspectedMotive','supportingClues','counterEvidence','proofNeeded'],signalDropsVerified:dossiers.length},null,2));
console.log('Death Files pressure test passed: '+dossiers.length+' dossiers from '+years[0]+' to '+years[years.length-1]+'.');
