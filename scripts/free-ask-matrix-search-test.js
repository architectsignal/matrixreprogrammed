const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return exists(file) ? fs.readFileSync(path.join(root, file), 'utf8') : ''; }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label=text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function requireAny(file, values, label){ if(!exists(file)) return; const text=read(file); if(!values.some(value=>text.includes(value))) fail(`${file}: missing ${label}`); }
function forbidIncludes(file, text, label=text){ if(exists(file) && read(file).includes(text)) fail(`${file}: contains forbidden ${label}`); }

for(const file of ['scripts/build-free-ask-matrix-search.js','scripts/repair-search-system.js','search.html','search.js','search-index.json','package.json']) requireFile(file);

requireAny('search.html', ['ASK MATRIX.','SEARCH THE MACHINE.'], 'Ask Matrix / Search The Machine heading');
requireIncludes('search.html', 'id="archive-search"', 'search input');
requireIncludes('search.html', 'id="search-results"', 'search results container');
requireIncludes('search.html', 'search.js', 'local search runtime');
requireAny('search.html', ['Free Local Answer Engine','free local browser search','No paid AI','Paid AI calls: none'], 'free local search boundary');

requireAny('search.js', ["fetch('/search-index.json'", 'fetch("/search-index.json"'], 'local search-index fetch');
requireAny('search.js', ["cache:'no-store'", 'cache:"no-store"'], 'no-store index fetch');
requireIncludes('search.js', 'fallbackIndex', 'verified fallback index');
requireAny('search.js', ['HTML returned instead of JSON','Invalid search JSON','Search index failed to load'], 'invalid index fallback handling');
for(const marker of ['api.openai.com','workers-ai','autorag','anthropic.com','gemini']) forbidIncludes('search.js', marker, `external model call ${marker}`);

const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'search.js')], { cwd: root, encoding: 'utf8' });
if(syntax.status !== 0) fail(`search.js syntax invalid: ${syntax.stderr || syntax.stdout}`);

let index=[];
try { index=JSON.parse(read('search-index.json')); }
catch(error){ fail(`search-index.json invalid JSON: ${error.message}`); }
if(!Array.isArray(index)) fail('search-index.json must be an array');
if(Array.isArray(index) && index.length < 40) fail(`search-index.json expected at least 40 routes, found ${index.length}`);

const urls=new Set();
if(Array.isArray(index)){
  for(const item of index){
    if(!item || !item.title || !item.url) fail('search index item missing title or url');
    if(item && /^https?:\/\//i.test(item.url || '')) fail(`search index contains external route: ${item.url}`);
    if(item && urls.has(item.url)) fail(`search index contains duplicate route: ${item.url}`);
    if(item) urls.add(item.url);
  }
}
const requiredRoutes=[
  'control-structure.html','daily-brain-brief.html','evidence-vault.html','epstein-files.html',
  'books.html','live-intel.html','power-atlas.html','download-center.html','claim-classifier.html',
  'daily-drop.html','network-search.html','power-entities.html'
];
for(const route of requiredRoutes) if(!urls.has(route)) fail(`search index missing current route: ${route}`);

function hay(item){ return [item.title,item.subtitle,item.description,item.category,item.layer,Array.isArray(item.keywords)?item.keywords.join(' '):item.keywords].join(' ').toLowerCase(); }
const semanticChecks=[
  ['books',['books.html','book-universe.html','amazon-store-books.html']],
  ['epstein files',['epstein-files.html','daily-drop.html','evidence-vault.html']],
  ['evidence classifier',['claim-classifier.html','evidence-vault.html']],
  ['power entities',['power-entities.html','entity-registry.html','power-atlas.html']],
  ['live intel',['live-intel.html','daily-brain-brief.html']]
];
for(const [query,acceptable] of semanticChecks){
  const tokens=query.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates=index.filter(item=>tokens.some(token=>hay(item).includes(token)));
  const hasRoute=acceptable.some(route=>candidates.some(item=>item.url===route));
  if(!hasRoute) fail(`Ask Matrix semantic coverage missing for ${query}: expected one of ${acceptable.join(', ')}`);
}

requireIncludes('package.json', 'build-free-ask-matrix-search.js', 'search builder wired into build');
requireIncludes('package.json', 'free-ask-matrix-search-test.js', 'search test wired into build');

const report={
  ok: problems.length===0,
  generatedAt:new Date().toISOString(),
  indexedRoutes:Array.isArray(index)?index.length:0,
  requiredRoutes,
  semanticChecks:semanticChecks.map(([query,routes])=>({query,routes})),
  boundary:'Ask Matrix is a free browser-side router over the local search index. Ranking is navigation assistance, not proof or a factual verdict.',
  problems
};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads/free-ask-matrix-search-test.json'),JSON.stringify(report,null,2));
if(problems.length){
  console.error('\nASK MATRIX LOCAL SEARCH TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('ASK MATRIX LOCAL SEARCH TEST PASSED');
console.log(`Checked ${index.length} local routes, current mission coverage, fallback handling, syntax and the no-paid-model boundary.`);
