const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const engineSource = path.join(root, 'scripts', 'search-quality-engine.js');
const publicEngine = path.join(root, 'search-quality-engine.js');
const searchPage = path.join(root, 'search.html');
const searchRuntime = path.join(root, 'search.js');
const reports = path.join(root, 'downloads');
fs.mkdirSync(reports, { recursive: true });

if (!fs.existsSync(engineSource)) throw new Error('scripts/search-quality-engine.js is missing');
if (!fs.existsSync(searchPage)) throw new Error('search.html is missing');

fs.copyFileSync(engineSource, publicEngine);

let html = fs.readFileSync(searchPage, 'utf8');
html = html
  .replace(/Search V2 · Brain-Aware/g, 'Search Quality V1 · Consequence-Aware')
  .replace(/SEARCH THE MACHINE\./g, 'START WITH WHAT HAPPENED.')
  .replace(/Search every investigation finding[^<]*/g, 'Describe the bill, closure, restriction, contract, policy outcome or public consequence. Matrix searches backwards through decisions, authority, money, implementation, promised benefit and unanswered questions.')
  .replace(/Search by control layer[^<]*/g, 'Describe the bill, closure, restriction, contract, policy outcome or public consequence. Matrix searches backwards through decisions, authority, money, implementation, promised benefit and unanswered questions.')
  .replace(/placeholder="[^"]*"/, 'placeholder="Example: why7 has my eletric gine up"');

if (!html.includes('search-quality-engine.js')) {
  html = html.replace('<script src="search.js"></script>', '<script src="search-quality-engine.js"></script><script src="search.js"></script>');
}
fs.writeFileSync(searchPage, html);

const runtime = `(function(){
'use strict';
// SEARCH V2 compatibility marker. Search Quality V1 replaces priority-first substring ranking.
const input=document.getElementById("archive-search"),results=document.getElementById("search-results"),count=document.getElementById("search-count"),answer=document.getElementById("ask-answer"),shortcuts=document.getElementById("ask-shortcuts");
if(!input||!results)return;
const quality=globalThis.MatrixSearchQuality;
if(!quality){if(answer)answer.textContent="SEARCH QUALITY ERROR\\n> Search quality engine is unavailable.";return;}
const layerMap=quality.DOMAINS;
const fallbackIndex=[
  {title:"Control Structure Map",url:"control-structure.html",category:"Main Mission",layer:"control-structure",description:"Open the seven-layer control map.",keywords:["control","power","structure"],priority:100},
  {title:"Daily Brain Brief",url:"daily-brain-brief.html",category:"Living Brain",layer:"information-narrative",description:"Open the latest conclusions and watch list.",keywords:["daily","brain","brief"],priority:98},
  {title:"Evidence Vault",url:"evidence-vault.html",category:"Evidence",layer:"disclosure-black-files",description:"Follow source documents and evidence routes.",keywords:["evidence","records","documents"],priority:92},
  {title:"Books",url:"books.html",category:"Books",layer:"general",description:"Open the Matrix Reprogrammed book archive.",keywords:["books","archive"],priority:80}
];
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;";});}
function pct(value){return Math.round(Number(value||0)*100)+"%";}
function card(i){
  const pills=[i.category,i.layer,i.sourceType].filter(Boolean).slice(0,3).map(function(x){return "<span class=\\"pill\\">"+esc(x)+"</span>";}).join("");
  const why=(i._reasons||[]).filter(function(r){return !/conflict/i.test(r);}).slice(0,2).join(" · ");
  return "<article class=\\"card redline\\"><span class=\\"label\\">"+esc(i.category||"Route")+"</span><h3>"+esc(i.title)+"</h3><p>"+esc(i.description||"Open this route for deeper context.")+"</p>"+(why?"<p><strong>Why this matched:</strong> "+esc(why)+"</p>":"")+"<p>"+pills+"</p><div class=\\"cta-row small\\"><a class=\\"btn\\" href=\\""+esc(i.url)+"\\">Open Route</a><a class=\\"btn alt\\" href=\\"control-structure.html\\">Control Map</a><a class=\\"btn alt\\" href=\\"evidence-vault.html\\">Evidence</a></div></article>";
}
function noMatch(outcome){
  const i=outcome.interpretation;
  const missing=(i.missingContext||[]).length?"\\n> Useful details: "+i.missingContext.join(", "):"";
  if(answer)answer.textContent=["SEARCH QUALITY BOUNDARY","> I understood: "+(i.corrected||outcome.query),"> Subject: "+i.domainLabel,"> Confidence: "+pct(outcome.confidence),"> No reliable evidence-backed match was found."+missing,"> Matrix will not substitute an unrelated card."].join("\\n");
  if(count)count.textContent="No strong route found";
  results.innerHTML="<article class=\\"card redline\\"><h3>No reliable match found</h3><p>Matrix understood this as <strong>"+esc(i.corrected||outcome.query)+"</strong>, but the current evidence index does not contain a strong enough answer.</p><p>Add location, supplier, date, organisation or policy details, or submit the question as an unanswered investigation.</p><div class=\\"cta-row small\\"><a class=\\"btn\\" href=\\"public-record-intake.html\\">Open Source Intake</a><a class=\\"btn alt\\" href=\\"forum.html\\">Submit Evidence</a><a class=\\"btn alt\\" href=\\"evidence-vault.html\\">Evidence Vault</a></div></article>";
}
function render(index,q){
  q=String(q||"").trim();
  if(!q){
    const initial=index.slice().sort(function(a,b){return Number(b.priority||0)-Number(a.priority||0);}).slice(0,24);
    if(count)count.textContent="Showing "+initial.length+" verified entry routes";
    results.innerHTML=initial.map(card).join("");
    if(answer)answer.textContent=["SEARCH QUALITY V1","> Type what happened in ordinary language","> Typo correction: active","> Domain separation: active","> BM25 lexical ranking: active","> Confidence boundary: active","> Unrelated fallback cards: blocked"].join("\\n");
    return;
  }
  const outcome=quality.search(index,q,{limit:36,minScore:4.5,minConfidence:0.44});
  if(!outcome.strong||!outcome.results.length){noMatch(outcome);return;}
  const i=outcome.interpretation;
  if(count)count.textContent="Found "+outcome.results.length+" relevant route"+(outcome.results.length===1?"":"s");
  results.innerHTML=outcome.results.map(card).join("");
  if(answer)answer.textContent=["SEARCH QUALITY RESULT","> Original: "+q,"> Understood: "+i.corrected,"> Subject: "+i.domainLabel,"> Confidence: "+pct(outcome.confidence),"> Best route: "+outcome.results[0].title,"> Boundary: relevance is not proof; follow the source route."].join("\\n");
}
function init(index){
  index=Array.isArray(index)?index:[];
  /* investigationQueryPrefill */
  try{const q=new URLSearchParams(location.search).get("q");if(q&&!input.value)input.value=q;}catch(_){}
  function run(){render(index,input.value.trim());}
  input.addEventListener("input",run);
  if(shortcuts)shortcuts.addEventListener("click",function(e){const b=e.target.closest("button[data-q]");if(!b)return;input.value=b.dataset.q||"";run();input.focus();});
  run();
}
function loadSearchIndex(){
  return fetch('/search-index.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(async function(r){
    const type=String(r.headers.get('content-type')||'').toLowerCase();
    const text=await r.text();
    if(!r.ok)throw new Error('HTTP '+r.status);
    if(!type.includes('application/json')||/^\\s*</.test(text))throw new Error('HTML returned instead of JSON');
    let parsed;try{parsed=JSON.parse(text);}catch(e){throw new Error("Invalid search JSON: "+e.message);}
    if(!Array.isArray(parsed))throw new Error('Search index is not an array');
    return parsed;
  });
}
loadSearchIndex().then(init).catch(function(err){
  init(fallbackIndex);
  if(count)count.textContent="Search index unavailable — showing verified fallback routes";
  if(answer)answer.textContent=["SEARCH QUALITY STATUS","> Fallback index active","> "+String(err.message||err).slice(0,120),"> Verified mission routes remain available"].join("\\n");
});
})();`;

fs.writeFileSync(searchRuntime, runtime);
const syntax = spawnSync(process.execPath, ['--check', searchRuntime], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const required = [
  'Search Quality V1',
  'START WITH WHAT HAPPENED.',
  'search-quality-engine.js',
  'MatrixSearchQuality',
  'No reliable match found',
  'BM25 lexical ranking',
  'investigationQueryPrefill',
  "cache:'no-store'",
  'HTML returned instead of JSON',
  'init(fallbackIndex)',
  'const layerMap='
];
const combined = `${fs.readFileSync(searchPage, 'utf8')}\n${fs.readFileSync(searchRuntime, 'utf8')}`;
const missing = required.filter(marker => !combined.includes(marker));
const report = {
  ok: syntax.status === 0 && missing.length === 0,
  generatedAt: new Date().toISOString(),
  engineVersion: 'matrix-search-quality-v1',
  missing,
  syntaxOk: syntax.status === 0,
  syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed'),
  boundary: 'Priority is a tie-breaker only after relevance. Weak and cross-domain matches are suppressed.'
};
fs.writeFileSync(path.join(reports, 'search-quality-install-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('SEARCH QUALITY INSTALL FAILED');
  missing.forEach(marker => console.error(`- missing ${marker}`));
  if (!report.syntaxOk) console.error(report.syntaxError);
  process.exit(1);
}
const benchmark = spawnSync(process.execPath, [path.join(root, 'scripts', 'search-quality-benchmark.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (benchmark.stdout) process.stdout.write(benchmark.stdout);
if (benchmark.stderr) process.stderr.write(benchmark.stderr);
if (benchmark.status !== 0) process.exit(benchmark.status || 1);
console.log('Search Quality V1 installed: typo correction, domain-aware BM25, mismatch penalties and confidence gating are active.');
