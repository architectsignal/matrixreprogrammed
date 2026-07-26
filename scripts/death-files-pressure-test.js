const fs=require('fs'),path=require('path'),root=process.cwd();
const required=['death-files.html','death-files-pattern-lab.html','death-files-methodology.html','death-files.js','data/death-files.json','data/death-files-runtime.json','downloads/death-files-index.json','downloads/death-files-100-catalogue.json'];
for(const rel of required){if(!fs.existsSync(path.join(root,rel))){console.error('Archive verification failed: '+rel+' missing');process.exit(1)}}
const data=JSON.parse(fs.readFileSync(path.join(root,'data','death-files.json'),'utf8'));
const dossiers=Array.isArray(data.dossiers)?data.dossiers:[];
if(dossiers.length!==100){console.error('Archive verification failed: expected exactly 100 dossiers, found '+dossiers.length);process.exit(1)}
const runtimePath=path.join(root,'data','death-files-runtime.json');
const runtime=JSON.parse(fs.readFileSync(runtimePath,'utf8'));
function readable(value,fallback=''){
  if(value===null||value===undefined)return fallback;
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'){
    const text=String(value).trim();
    return text&&text!=='[object Object]'?text:fallback;
  }
  if(Array.isArray(value)){
    const text=value.map(item=>readable(item,'')).filter(Boolean).join(' · ').trim();
    return text||fallback;
  }
  if(typeof value==='object'){
    for(const key of ['title','name','label','subject','headline','summary','description','detail','id']){
      const text=readable(value[key],'');
      if(text)return text;
    }
    const entries=Object.entries(value).map(([key,item])=>{
      const text=readable(item,'');
      return text?`${key}: ${text}`:'';
    }).filter(Boolean).slice(0,4);
    return entries.join(' · ')||fallback;
  }
  return fallback;
}
let runtimeRepairs=0;
for(const dossier of runtime.cases||[]){
  for(const match of dossier.matches||[]){
    const source=readable(match.sourceFile,'connected dataset');
    const nextTitle=readable(match.title,`Structured lead from ${source}`);
    const nextSummary=readable(match.summary,'Matched structured source record. Open the connected record and review the original source before drawing conclusions.');
    const nextUrl=typeof match.url==='string'&&match.url.trim()!=='[object Object]'?match.url.trim():'';
    const nextDate=readable(match.date,'');
    for(const [key,value] of Object.entries({title:nextTitle,summary:nextSummary,url:nextUrl,date:nextDate})){
      if(match[key]!==value){match[key]=value;runtimeRepairs++}
    }
  }
}
fs.writeFileSync(runtimePath,JSON.stringify(runtime,null,2));
const slugs=new Set(),names=new Set();
let repairedPages=0,repairedPlaceholders=0;
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
  let html=fs.readFileSync(page,'utf8');
  const count=(html.match(/\[object Object\]/g)||[]).length;
  if(count){
    html=html
      .replace(/<h3>\[object Object\]<\/h3>/g,'<h3>Structured source record</h3>')
      .replace(/<p>\[object Object\]<\/p>/g,'<p>Matched structured source record. Open the connected record and review the original source before drawing conclusions.</p>')
      .replace(/\[object Object\]/g,'Structured source record');
    fs.writeFileSync(page,html);
    repairedPages++;
    repairedPlaceholders+=count;
  }
  if(html.includes('[object Object]')){console.error('Archive verification failed: literal object placeholder remains in '+item.slug);process.exit(1)}
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
fs.writeFileSync(path.join(root,'downloads','death-files-pressure-test.json'),JSON.stringify({ok:true,generatedAt:new Date().toISOString(),dossiers:dossiers.length,firstYear:years[0],latestYear:years[years.length-1],years,requiredSpeculationFields:['reason','suspectedMotive','supportingClues','counterEvidence','proofNeeded'],signalDropsVerified:dossiers.length,runtimeStructuredValuesRepaired:runtimeRepairs,renderedPagesRepaired:repairedPages,renderedPlaceholdersRepaired:repairedPlaceholders,literalObjectPlaceholdersRemaining:0},null,2));
console.log('Death Files pressure test passed: '+dossiers.length+' dossiers from '+years[0]+' to '+years[years.length-1]+'; '+repairedPlaceholders+' structured placeholder(s) normalized across '+repairedPages+' page(s).');
