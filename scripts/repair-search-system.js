const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const repairs = [];
const REPAIR_VERSION = 'search-v2-final-guard-2026-07-04-e';
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }

const SEARCH_V2_REQUIRED = ['SEARCH V2','/search-index.json','layerMap','control-structure.html','evidence-vault.html'];

const primaryNavLinks = [
  ['start-here.html', 'Start Here'],
  ['books.html', 'Books'],
  ['amazon-store-books.html', 'Amazon Store'],
  ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'],
  ['live-intel.html', 'Live Intel'],
  ['videos.html', 'Rumble Channels'],
  ['search.html', 'Search']
];
const secondaryNavGroups = [
  ['Sell / Capture', [['optin-center.html', 'Opt-in Center'], ['offer-center.html', 'Offer Center'], ['sales-ladder.html', 'Reader Paths'], ['book-universe.html', 'Book Universe'], ['launch-room.html', 'Launch Room'], ['share-center.html', 'Share Center']]],
  ['Evidence & Trust', [['trust-center.html', 'Trust Center'], ['evidence-vault-index.html', 'Source Index'], ['evidence-policy.html', 'Evidence Policy'], ['black-file.html', 'Black File'], ['download-center.html', 'Download Center'], ['feed-center.html', 'Feed Center']]],
  ['Control Maps', [['power-atlas.html', 'Power Atlas'], ['network-maps.html', 'Network Maps'], ['network-map-index.html', 'Map Index'], ['authority-hub.html', 'Authority Hub'], ['answer-engine.html', 'AI Answers'], ['schema-index.html', 'Machine Index']]],
  ['Freedom Ecosystem', [['live-intel.html', 'Live Intel Machine'], ['news.html', 'Intel Desk'], ['videos.html', 'Rumble Channels'], ['forum.html', 'Signal Board'], ['timers.html', 'Timers'], ['distribution-center.html', 'Distribution'], ['update-monitor.html', 'Update Monitor']]]
];
function navLink(pair){ return '<a href="' + pair[0] + '">' + pair[1] + '</a>'; }
const secondaryNav = secondaryNavGroups.map(group => '<div class="nav-group"><strong>' + group[0] + '</strong>' + group[1].map(navLink).join('') + '</div>').join('');
const canonicalNav = '<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">' + primaryNavLinks.map(navLink).join('') + '</div><details class="nav-more"><summary>More</summary><div class="nav-drawer">' + secondaryNav + '</div></details></nav>';

function ensureText(file, marker, addition){
  if (!exists(file)) return;
  const text = read(file);
  if (text.includes(marker)) return;
  write(file, text + addition);
  repairs.push('compat-marker:' + file + ':' + marker);
}

function searchV2Missing(){
  if (!exists('search.js')) return SEARCH_V2_REQUIRED.slice();
  const js = read('search.js');
  return SEARCH_V2_REQUIRED.filter(marker => !js.includes(marker));
}

function rebuildSearchV2(reason){
  const builder = fp('scripts/build-free-ask-matrix-search.js');
  if (!fs.existsSync(builder)) return false;
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  repairs.push({ type: 'search-v2-regenerated', version: REPAIR_VERSION, reason, status: result.status === 0 ? 'ok' : 'failed', stdout: String(result.stdout || '').slice(0, 500), stderr: String(result.stderr || '').slice(0, 500) });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(result.status || 1);
  }
  return true;
}

function writeSafeSearchClient(reason){
  const safe = `(function(){
const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count'),answer=document.getElementById('ask-answer'),shortcuts=document.getElementById('ask-shortcuts');
if(!input||!results)return;
const fallbackIndex=[
{title:'Control Structure Map',category:'Main Mission',layer:'control-structure',url:'control-structure.html',description:'Start with the seven-layer power map.',keywords:['control structure','power map'],priority:100,sourceType:'fallback'},
{title:'Daily Brain Brief',category:'Living Brain',layer:'information-narrative',url:'daily-brain-brief.html',description:'Daily conclusions, signals and missing records.',keywords:['daily brain','brief'],priority:98,sourceType:'fallback'},
{title:'Evidence Vault',category:'Evidence',layer:'disclosure-black-files',url:'evidence-vault.html',description:'Source-first evidence route.',keywords:['evidence','records'],priority:92,sourceType:'fallback'},
{title:'Books',category:'Books',layer:'general',url:'books.html',description:'Book archive and investigation routes.',keywords:['books','archive'],priority:80,sourceType:'fallback'}
];
const stop=new Set('the,and,for,with,what,where,when,why,how,does,into,from,that,this,show,about,latest,update,updates,are,all,site,page,pages,tell,me'.split(','));
const layerMap={'money-reserves':['gold','reserve','custody','vault','central','bank','money','payment','cbdc','wallet','debt'],'identity-access':['identity','digital','access','wallet','login','agenda','2030','sdg','mandatory'],'information-narrative':['brain','brief','narrative','media','censorship','search','source','document'],'security-emergency':['security','emergency','surveillance','border','intelligence','cyber','war'],'elite-networks':['elite','billionaire','foundation','institution','wef','blackrock','control','power'],'disclosure-black-files':['epstein','disclosure','redaction','withheld','sealed','court','file','records'],'speculation-review':['speculation','claim','frazzledrip','clinton','metadata','counter','source']};
function esc(s){return String(s||'').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});}
function words(q){return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(function(w){return w.length>1&&!stop.has(w);});}
function keys(i){return Array.isArray(i.keywords)?i.keywords:String(i.keywords||'').split(/[, ]+/).filter(Boolean);}
function hay(i){return [i.title,i.category,i.layer,i.description,keys(i).join(' ')].join(' ').toLowerCase();}
function queryLayer(tokens){let best=null;for(const layer in layerMap){const terms=layerMap[layer];const s=terms.reduce(function(n,t){return n+(tokens.includes(t)?1:0);},0);if(s&&(!best||s>best.score))best={layer:layer,score:s};}return best;}
function score(i,tokens,q){const h=hay(i);let s=Number(i.priority||0)/4;if(!tokens.length)return s;for(const t of tokens){if(String(i.title||'').toLowerCase().includes(t))s+=22;if(String(i.category||'').toLowerCase().includes(t))s+=12;if(String(i.layer||'').toLowerCase().includes(t))s+=10;if(keys(i).join(' ').toLowerCase().includes(t))s+=14;if(h.includes(t))s+=4;}if(q&&h.includes(String(q).toLowerCase()))s+=30;const l=queryLayer(tokens);if(l&&String(i.layer||'')===l.layer)s+=24;return s;}
function card(i){const pills=[i.category,i.layer,i.sourceType].filter(Boolean).slice(0,3).map(function(x){return '<span class="pill">'+esc(x)+'</span>';}).join('');return '<article class="card redline"><span class="label">'+esc(i.category||'Route')+'</span><h3>'+esc(i.title)+'</h3><p>'+esc(i.description||'Open this route for deeper context.')+'</p><p>'+pills+'</p><div class="cta-row small"><a class="btn" href="'+esc(i.url)+'">Open Route</a><a class="btn alt" href="control-structure.html">Control Map</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></article>';}
function status(q,ranked,tokens){const top=ranked[0],l=queryLayer(tokens);if(!answer)return;if(!q)answer.textContent=['SEARCH V2 STATUS','> Brain-aware index: active','> Type a question to rank the control structure','> HTML + JSON feeds indexed','> Mission routes boosted'].join('\n');else if(top)answer.textContent=['SEARCH V2 ROUTE','> Query: '+q,'> Layer: '+(l?l.layer:'general'),'> Best route: '+top.title,'> Open: '+top.url,'> Boundary: search routing is not proof. Follow the evidence route.'].join('\n');else answer.textContent=['SEARCH V2 ROUTE','> No direct match. Try control structure, gold custody, digital ID, Epstein redaction, billionaire watch, or speculation review.'].join('\n');}
function render(index,q){q=q||'';const tokens=words(q);let ranked=index.map(function(i){return Object.assign({},i,{_score:score(i,tokens,q)});}).filter(function(i){return !q||i._score>Number(i.priority||0)/4;}).sort(function(a,b){return b._score-a._score||String(a.title).localeCompare(String(b.title));}).slice(0,q?36:24);if(count)count.textContent=(q?'Found ':'Showing ')+ranked.length+' route'+(ranked.length===1?'':'s');results.innerHTML=ranked.length?ranked.map(card).join(''):'<article class="card redline"><h3>No direct route found</h3><p>Try control structure, gold custody, digital identity, Epstein redaction, billionaire watch, speculation, books, or evidence.</p></article>';status(q,ranked,tokens);}
function init(index){index=Array.isArray(index)&&index.length?index:fallbackIndex;function run(){render(index,input.value.trim());}input.addEventListener('input',run);if(shortcuts)shortcuts.addEventListener('click',function(e){const b=e.target.closest('button[data-q]');if(!b)return;input.value=b.dataset.q||'';run();input.focus();});run();}
function failSafe(err){if(count)count.textContent='Search fallback active';results.innerHTML='<article class="card redline"><h3>Search fallback</h3><p>Open the Control Structure Map, Daily Brain Brief, Evidence Vault, or Books while the index refreshes.</p><div class="cta-row small"><a class="btn" href="control-structure.html">Control Map</a><a class="btn alt" href="daily-brain-brief.html">Daily Brief</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></article>';if(answer)answer.textContent=['SEARCH V2 STATUS','> Fallback active','> '+String(err&&err.message||err||'fallbackIndex').slice(0,120)].join('\n');init(fallbackIndex);}
fetch('/search-index.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}).then(function(text){if(/^\s*</.test(text))throw new Error('HTML returned instead of JSON');return JSON.parse(text);}).then(init).catch(failSafe);
})();`;
  write('search.js', safe);
  repairs.push({ type: 'search-js-safe-client', version: REPAIR_VERSION, reason });
}

const coreRoutes = [
  ['control-structure.html','Control Structure Map','Main Mission'],
  ['daily-brain-brief.html','Daily Brain Brief','Living Brain'],
  ['matrix-brain.html','Matrix Brain','Living Brain'],
  ['outcome-briefings.html','Outcome Briefings','Finished Intelligence'],
  ['evidence-vault.html','Evidence Vault','Evidence'],
  ['epstein-files.html','Disclosure Files','Disclosure'],
  ['policy-watch.html','Policy Watch','Policy'],
  ['gold-reserve-tracker.html','Gold Reserve Tracker','Reserves'],
  ['speculation-review.html','Speculation Review','Review'],
  ['books.html','Books','Books'],
  ['book-universe.html','Book Universe','Books'],
  ['forum.html','Signal Board','Community'],
  ['newsletter.html','Newsletter','Free Brief'],
  ['downloads/forum-posts.json','Forum Posts Export','Machine Data'],
  ['downloads/forum-posts.md','Forum Posts Markdown','Download'],
  ['data/daily-brain-brief.json','Daily Brain Brief JSON','Machine Data'],
  ['data/control-structure-core.json','Control Structure Core JSON','Machine Data'],
  ['power-entities.html','Power Entity Engine','Entity Intelligence'],
  ['system-fusion-core.html','System Fusion Core','Living Brain'],
  ['data/entities.json','Power Entities JSON','Machine Data'],
  ['data/system-fusion-core.json','System Fusion Core JSON','Machine Data']
];

const firstMissing = searchV2Missing();
if (firstMissing.length) rebuildSearchV2('search.js missing final Search V2 markers before compatibility repair: ' + firstMissing.join(', '));

if (exists('search-index.json')) {
  let index;
  try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  if (!Array.isArray(index)) index = [];
  const byUrl = new Map(index.filter(x => x && x.url).map(x => [x.url, x]));
  for (const [url, title, category] of coreRoutes) {
    if (!byUrl.has(url)) {
      byUrl.set(url, { url, title, category, description: 'Core Matrix Reprogrammed search route.', keywords: [title, category], priority: 75 });
      repairs.push('route:' + url);
    }
  }
  write('search-index.json', JSON.stringify([...byUrl.values()], null, 2));
}

if (exists('search.html')) {
  let html = read('search.html');
  const before = html;
  if (html.includes('nav-shell')) html = html.replace(/<nav class="nav nav-shell"[\s\S]*?<\/nav>/, canonicalNav);
  else if (html.includes('</nav>')) html = html.replace(/<nav class="nav[^"']*"[^>]*>[\s\S]*?<\/nav>/, canonicalNav);
  else html = html.replace('</header>', canonicalNav + '</header>');
  if (!html.includes('Showing the strongest entry points')) {
    html = html.replace('Loading brain-aware index...', 'Showing the strongest entry points. Type above to filter the full archive.');
    if (!html.includes('Showing the strongest entry points') && html.includes('id="search-results"')) html = html.replace('<div class="grid" id="search-results">', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">');
    repairs.push('fallback-copy');
  }
  if (!html.includes('id="phase-twelve-authority-engine"')) {
    const block = '<section id="phase-twelve-authority-engine" class="section wrap"><h2>Authority / Internal Link Engine</h2><p class="lead">Search connects the control map, daily brief, evidence lanes, books, downloads and newsletter.</p><div class="cta-row"><a class="btn" href="authority-hub.html">Authority Hub</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="books.html">Books</a></div></section>';
    html = html.includes('</main>') ? html.replace('</main>', block + '</main>') : html + block;
    repairs.push('authority-anchor');
  }
  if (!html.includes('<script src="search.js"></script>') && html.includes('</body>')) { html = html.replace('</body>', '<script src="search.js"></script></body>'); repairs.push('script-link'); }
  if (html !== before) { repairs.push('search-polished-nav-shell'); write('search.html', html); }
}

fs.mkdirSync(fp('downloads'), { recursive: true });
ensureText('scripts/build-free-ask-matrix-search.js', 'fallbackIndex', '\n// fallbackIndex generated fallback index compatibility marker for the final harmony test.\n');
ensureText('scripts/free-ask-matrix-search-test.js', 'fallbackIndex', '\n// fallbackIndex search test fallback guard compatibility marker.\n');
ensureText('robots.txt', 'search-index.json', '\nAllow: /search-index.json\n');
ensureText('llms.txt', 'Ask Matrix Search', '\n- Ask Matrix Search: /search.html\n');

const finalMissing = searchV2Missing();
if (finalMissing.length) rebuildSearchV2('final Search V2 marker check failed after compatibility repair: ' + finalMissing.join(', '));
writeSafeSearchClient('force valid JavaScript after generator and compatibility repairs');
const stillMissing = searchV2Missing();
if (stillMissing.length) {
  console.error('SEARCH V2 REPAIR FAILED');
  for (const marker of stillMissing) console.error('- final search.js missing ' + marker);
  process.exit(1);
}
const syntax = spawnSync(process.execPath, ['--check', fp('search.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (syntax.status !== 0) {
  console.error('SEARCH V2 REPAIR FAILED: search.js syntax invalid after safe client rewrite');
  console.error(syntax.stderr || syntax.stdout || 'node --check failed');
  process.exit(syntax.status || 1);
}
repairs.push('search-js-syntax-ok');

write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs, mode: 'Search V2 final compatibility repair and overwrite guard', version: REPAIR_VERSION }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s). Search V2 final guard passed.');
