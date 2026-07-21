const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const root=process.cwd();
const file=p=>path.join(root,p);
const read=p=>JSON.parse(fs.readFileSync(file(p),'utf8'));
const text=p=>fs.readFileSync(file(p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

function refreshDerivedOverlapIfStale(){
  let registry=null,graph=null;
  try{registry=read('data/money-intelligence-registry.json')}catch{}
  try{graph=read('data/money-overlap-graph.json')}catch{}
  const stale=!registry
    || Number(registry.version)<3
    || !graph
    || Number(graph?.summary?.records)!==Number(registry?.records?.length)
    || Number(graph?.summary?.categories)!==Number(registry?.categories?.length);
  if(!stale)return false;
  execFileSync(process.execPath,[path.join(__dirname,'build-money-overlap-map.js')],{
    cwd:root,
    stdio:'inherit',
    env:{...process.env,MATRIX_MONEY_REFRESH:'0'}
  });
  return true;
}

const rebuilt=refreshDerivedOverlapIfStale();
const registry=read('data/money-intelligence-registry.json');
const graph=read('data/money-overlap-graph.json');
assert(registry.version>=3,'Money registry schema must be version 3 or newer');
assert(registry.categories.length>=20,'Expected at least 20 money category systems');
assert(registry.categories.every(c=>Number.isInteger(c.coverage)&&Number.isInteger(c.ranked)&&Number.isInteger(c.verified)&&Number.isInteger(c.research)),'Every category must expose coverage, ranked, verified and research counts');
assert(graph.summary.records===registry.records.length,'Overlap graph record total must match registry');
assert(graph.summary.categories===registry.categories.length,'Overlap graph category total must match registry');
assert(graph.overlaps.length>0,'Expected at least one cross-category overlap');
assert(graph.nodes.some(n=>n.kind==='category')&&graph.nodes.some(n=>n.kind==='entity'),'Graph must contain category and entity nodes');
assert(graph.edges.some(e=>e.type==='appears in category'),'Graph must contain category membership edges');
assert(graph.categoryPairs.some(p=>p.count>0),'Graph must contain category-pair overlap counts');
for(const required of ['money-graph.html','money-graph.js','money-command-center.js','money-overlap.css','src/money-overlap-graph.html'])assert(fs.existsSync(file(required)),`Missing ${required}`);

const html=text('money-graph.html');
const canonical=text('src/money-overlap-graph.html');
const hub=text('follow-the-money.html');
assert(html.includes('RELATIONSHIP &amp; OVERLAP MAP')&&html.includes('overlap-svg')&&html.includes('overlap-matrix'),'Interactive overlap map surface missing');
assert(hub.includes('money-command-stats')&&hub.includes('money-command-grid')&&hub.includes('money-command-center.js'),'Dynamic command center wiring missing');

const assets=[
  'styles.css','fixes.css','reader-experience.css','money-intelligence.css','money-expansion.css','money-overlap.css',
  'index.html','follow-the-money.html','money-search.html','money-graph.html','making-money.html','evidence-vault.html',
  'matrix.js','money-graph.js','analytics.js','investigation-pulse.js'
];
for(const asset of assets){
  assert(canonical.includes(`"../${asset}"`),`Canonical overlap template missing source-relative URL ../${asset}`);
  assert(html.includes(`"${asset}"`),`Published overlap map missing root-relative URL ${asset}`);
}
assert(!html.includes('../'),'Published money-graph.html must not escape the site root');
assert(html===canonical.replace(/(["'])\.\.\//g,'$1'),'Published money-graph.html must be the path-translated canonical template');

console.log(`Money overlap map verified: ${registry.records.length} records, ${graph.overlaps.length} overlap entities, ${graph.edges.length} graph edges and source-to-public path translation${rebuilt?' after rebuilding stale derived data':''}.`);
