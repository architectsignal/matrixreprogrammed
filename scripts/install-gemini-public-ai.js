const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
const reportDir=path.join(root,'downloads');
fs.mkdirSync(reportDir,{recursive:true});
const changes=[];
function read(rel){const file=path.join(root,rel);if(!fs.existsSync(file))throw new Error(`Missing ${rel}`);return fs.readFileSync(file,'utf8');}
function write(rel,value){fs.writeFileSync(path.join(root,rel),value);changes.push(rel);}
function insertAfter(text,anchor,addition,label){if(text.includes(addition.trim()))return text;if(!text.includes(anchor))throw new Error(`${label} anchor missing`);return text.replace(anchor,anchor+addition);}
function insertBefore(text,anchor,addition,label){if(text.includes(addition.trim()))return text;if(!text.includes(anchor))throw new Error(`${label} anchor missing`);return text.replace(anchor,addition+anchor);}
const clientSource=path.join(root,'scripts','search-gemini-public.js');
if(!fs.existsSync(clientSource))throw new Error('scripts/search-gemini-public.js missing');
fs.copyFileSync(clientSource,path.join(root,'search-gemini-public.js'));
changes.push('search-gemini-public.js');
let html=read('search.html');
html=html.replace(/<script src="search-gemini-public\.js"><\/script>/g,'');
if(html.includes('<script src="search.js"></script>'))html=html.replace('<script src="search.js"></script>','<script src="search.js"></script><script src="search-gemini-public.js"></script>');
else if(html.includes('</body>'))html=html.replace('</body>','<script src="search-gemini-public.js"></script></body>');
else throw new Error('Gemini client script anchor missing');
write('search.html',html);
let worker=read('src/worker-production.js');
worker=insertAfter(worker,"import consequenceTrackerWorker, { isConsequenceTrackerRoute } from './worker-consequence-tracker.js';","\nimport geminiPublicAiWorker, { geminiPublicAiRoutes } from './worker-gemini-public-ai.js';",'Gemini Worker import');
const helpers=`\nasync function validateGeminiPublicAiResponse(response) {\n  const origin = response.headers.get('x-matrix-origin');\n  if (origin !== 'cloudflare-worker-gemini-public-ai') {\n    return new Response(JSON.stringify({\n      ok: false,\n      external: false,\n      error: 'Non-authoritative Gemini response blocked.',\n      reason: 'non-authoritative-gemini-response',\n      origin: origin || null\n    }, null, 2), {\n      status: 503,\n      headers: { ...jsonHeaders, 'X-Matrix-Origin': 'cloudflare-worker-gemini-public-ai-boundary' }\n    });\n  }\n  return response;\n}\n\nfunction geminiPublicAiUnavailable(reason, detail = '') {\n  return new Response(JSON.stringify({\n    ok: false,\n    enabled: false,\n    external: false,\n    error: 'Optional Gemini public-data adapter is unavailable. Local hybrid search remains active.',\n    reason,\n    detail: String(detail || '').slice(0, 240)\n  }, null, 2), {\n    status: 503,\n    headers: { ...jsonHeaders, 'X-Matrix-Origin': 'cloudflare-worker-gemini-public-ai-boundary' }\n  });\n}\n\n`;
worker=insertBefore(worker,'export default {',helpers,'Gemini response boundary');
const dispatch=`    if (geminiPublicAiRoutes.has(path)) {\n      try {\n        return validateGeminiPublicAiResponse(await geminiPublicAiWorker.fetch(request, env, ctx));\n      } catch (error) {\n        return geminiPublicAiUnavailable('gemini-public-ai-worker-exception', error?.message || error);\n      }\n    }\n\n`;
worker=insertBefore(worker,'    if (isConsequenceTrackerRoute(path)) {',dispatch,'Gemini route dispatch');
write('src/worker-production.js',worker);
const config={updated:new Date().toISOString(),provider:'Google Gemini Developer API',enabledByDefault:false,automaticCalls:false,modelDefault:'gemini-2.5-flash-lite',costCeilingGBP:0,route:'/api/public-ai/gemini',healthRoute:'/api/public-ai/gemini/health',publicDataOnly:true,requiresExplicitPerQueryConsent:true,freeTierPrivacy:'Google states that free-tier content may be used to improve its products.',fallbackOrder:['local-rules','local-semantic-retrieval','gemini-public-opt-in','research-queue','honest-no-answer'],requiredOwnerSetup:['Create a Gemini API key in Google AI Studio.','Store it as the Cloudflare Worker secret GEMINI_API_KEY.','Set the Cloudflare plaintext variable GEMINI_PUBLIC_AI_ENABLED to true.'],boundary:'AI output is analysis, never evidence. Underlying source routes remain authoritative.'};
fs.mkdirSync(path.join(root,'data'),{recursive:true});
fs.writeFileSync(path.join(root,'data','gemini-public-ai-config.json'),JSON.stringify(config,null,2)+'\n');
changes.push('data/gemini-public-ai-config.json');
const checks=[['src/worker-production.js',worker],['search-gemini-public.js',read('search-gemini-public.js')]];
const syntaxFailures=[];
for(const [rel] of checks){const result=spawnSync(process.execPath,['--check',path.join(root,rel)],{cwd:root,encoding:'utf8',stdio:'pipe'});if(result.status!==0)syntaxFailures.push(`${rel}: ${result.stderr||result.stdout||'node --check failed'}`);}
const required=["import geminiPublicAiWorker, { geminiPublicAiRoutes } from './worker-gemini-public-ai.js';",'if (geminiPublicAiRoutes.has(path))','cloudflare-worker-gemini-public-ai-boundary','search-gemini-public.js','publicDataConsent:true','Nothing has been sent. Local search works without Gemini.'];
const combined=worker+'\n'+html+'\n'+read('search-gemini-public.js');
const missing=required.filter(marker=>!combined.includes(marker));
const test=spawnSync(process.execPath,[path.join(root,'scripts','gemini-public-ai-test.mjs')],{cwd:root,encoding:'utf8',stdio:'pipe'});
if(test.stdout)process.stdout.write(test.stdout);
if(test.stderr)process.stderr.write(test.stderr);
const report={ok:missing.length===0&&syntaxFailures.length===0&&test.status===0,generatedAt:new Date().toISOString(),changes:[...new Set(changes)],missing,syntaxFailures,testStatus:test.status,enabledByDefault:false,automaticCalls:false,costCeilingGBP:0,boundary:'The API key is server-side only. Gemini is opt-in for public/redacted text and local search remains fully functional without it.'};
fs.writeFileSync(path.join(reportDir,'gemini-public-ai-install.json'),JSON.stringify(report,null,2)+'\n');
if(!report.ok){console.error('GEMINI PUBLIC AI INSTALL FAILED');missing.forEach(x=>console.error('- missing '+x));syntaxFailures.forEach(x=>console.error('- '+x));process.exit(test.status||1);}
console.log('Optional Gemini public-data adapter installed: disabled by default, explicit consent required, local hybrid search preserved.');
