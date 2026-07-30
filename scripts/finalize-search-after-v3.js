const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
const steps=[
  ['Search Quality V1','scripts/install-search-quality-engine.js'],
  ['Public source evidence routes','scripts/extend-search-with-source-evidence.js'],
  ['Hybrid semantic retrieval','scripts/install-search-hybrid-retrieval.js'],
  ['Optional Gemini public-data adapter','scripts/install-gemini-public-ai.js']
];
const executions=[];
for(const [label,rel] of steps){const script=path.join(root,rel);if(!fs.existsSync(script))throw new Error(`${rel} missing`);const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',stdio:'pipe'});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);executions.push({label,script:rel,status:result.status});if(result.status!==0)process.exit(result.status||1);}
const required=['search.html','search.js','search-quality-engine.js','search-semantic-vector.js','search-hybrid-engine.js','search-semantic-index.json','search-gemini-public.js','data/gemini-public-ai-config.json'];
const missing=required.filter(rel=>!fs.existsSync(path.join(root,rel)));
const combined=['search.html','search.js','search-gemini-public.js','src/worker-production.js'].map(rel=>fs.readFileSync(path.join(root,rel),'utf8')).join('\n');
const markers=['MatrixHybridSearch','search-semantic-index.json','No reliable match found','search-gemini-public.js','geminiPublicAiRoutes','publicDataConsent:true','automaticCalls:false'];
const missingMarkers=markers.filter(marker=>!combined.includes(marker));
const syntaxFiles=['search.js','search-gemini-public.js','src/worker-production.js','src/worker-gemini-public-ai.js'];
const syntaxFailures=[];
for(const rel of syntaxFiles){const result=spawnSync(process.execPath,['--check',path.join(root,rel)],{cwd:root,encoding:'utf8',stdio:'pipe'});if(result.status!==0)syntaxFailures.push(`${rel}: ${result.stderr||result.stdout||'invalid syntax'}`);}
const report={ok:missing.length===0&&missingMarkers.length===0&&syntaxFailures.length===0,generatedAt:new Date().toISOString(),executions,required,missing,missingMarkers,syntaxFailures,boundary:'Legacy Search V3 may build the evidence corpus and facets, but the final public runtime is the safer local hybrid engine with optional explicit-consent Gemini fallback.'};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});fs.writeFileSync(path.join(root,'downloads','final-search-after-v3.json'),JSON.stringify(report,null,2)+'\n');
if(!report.ok){console.error('FINAL SEARCH AFTER V3 FAILED');missing.forEach(x=>console.error('- missing '+x));missingMarkers.forEach(x=>console.error('- marker '+x));syntaxFailures.forEach(x=>console.error('- '+x));process.exit(1);}console.log('Final search runtime restored after Search V3: local hybrid retrieval and optional Gemini fallback are active.');
