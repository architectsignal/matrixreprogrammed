const fs = require('fs');
const path = require('path');

const root = process.cwd();
const repairs = [];
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function replaceAllText(value, from, to){ return value.split(from).join(to); }

const resilientSearchJs = String.raw`(function(){
  const input=document.getElementById('archive-search');
  const results=document.getElementById('search-results');
  const count=document.getElementById('search-count');
  const answer=document.getElementById('ask-answer');
  const shortcuts=document.getElementById('ask-shortcuts');
  if(!input||!results)return;
  const fallbackIndex=[
    {title:'Ask Matrix Search',category:'Search / Free Tool',url:'search.html',description:'Free browser-side question search over Matrix Reprogrammed pages, evidence routes, books, updates, and downloads.',keywords:['search','ask matrix','local','archive']},
    {title:'Epstein Files Command Center',category:'Public Record / Evidence',url:'epstein-files.html',description:'Epstein source watch, evidence ladder, timeline map, people tracker, file doors, and evidence boundaries.',keywords:['epstein','maxwell','files','evidence','timeline']},
    {title:'Live Intel',category:'Current Updates',url:'live-intel.html',description:'Dated public-source updates with evidence, video, free brief, offer, and book routes.',keywords:['news','updates','live intel','source lanes']},
    {title:'Evidence Vault',category:'Evidence',url:'evidence-vault.html',description:'Source hierarchy, evidence lanes, source cards, claim strength, and public-record routes.',keywords:['evidence','source cards','records','archives']},
    {title:'Books',category:'Books',url:'books.html',description:'Matrix Reprogrammed book universe and reader paths.',keywords:['books','dog','architect','crime dossiers']},
    {title:'Download Center',category:'Free Resources',url:'download-center.html',description:'Free downloadable orientation packs, briefs, source pathways, forum exports, and machine-readable data.',keywords:['downloads','free briefs','pdf','json','markdown']},
    {title:'Authority Hub',category:'SEO / AI Search',url:'authority-hub.html',description:'Topic clusters, pillar pages, spoke routes, internal links, and discovery.',keywords:['authority','hub','seo','search']},
    {title:'Trust Center',category:'Credibility',url:'trust-center.html',description:'Trust rules, source methodology, association boundaries, privacy, corrections, and claim labels.',keywords:['trust','privacy','corrections','source methodology']}
  ];
  const stop=new Set('the,and,for,with,what,where,when,why,how,does,into,from,that,this,show,about,latest,update,updates,are,all,site,page,pages'.split(','));
  const routeHints=[
    {terms:['epstein','maxwell','files','emails','settlement','nda'],label:'Epstein Command Center',evidence:'epstein-files.html#epstein-evidence-ladder'},
    {terms:['migration','immigration','border','frontex','asylum','sexual','assault'],label:'Migration Flow Panel',evidence:'news.html#migration'},
    {terms:['cia','nsa','declassified','archive','mkultra','gladio'],label:'Evidence Vault',evidence:'evidence-vault-index.html'},
    {terms:['cartel','crime','mafia','laundering','court','sanction'],label:'Crime-State Map',evidence:'evidence-lane-court-records.html'},
    {terms:['dog','symbol','masonic','masonry','esoteric','occult','architect'],label:'Symbolic Power Map',evidence:'answer-evidence-boundary.html'},
    {terms:['download','brief','pack','pdf','json','markdown','free'],label:'Download Center',evidence:'trust-center.html'}
  ];
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function keys(item){return Array.isArray(item&&item.keywords)?item.keywords:[];}
  function words(q){return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(w=>w.length>1&&!stop.has(w));}
  function hay(item){return [item.title,item.subtitle,item.series,item.category,item.description,keys(item).join(' ')].join(' ').toLowerCase();}
  function score(item,tokens,q){const h=hay(item);let s=0;if(!tokens.length)return 1;for(const t of tokens){if(String(item.title||'').toLowerCase().includes(t))s+=10;if(String(item.category||'').toLowerCase().includes(t))s+=5;if(String(item.series||'').toLowerCase().includes(t))s+=4;if(keys(item).join(' ').toLowerCase().includes(t))s+=7;if(h.includes(t))s+=2;}if(q&&h.includes(q.toLowerCase()))s+=14;return s;}
  function bestHint(tokens){let best=null;for(const h of routeHints){const s=h.terms.reduce((n,t)=>n+(tokens.includes(t)?1:0),0);if(s&&(!best||s>best.score))best={...h,score:s};}return best;}
  function normalizeIndex(data){if(!Array.isArray(data))return fallbackIndex;const cleaned=data.filter(item=>item&&item.url&&item.title).map(item=>({...item,keywords:Array.isArray(item.keywords)?item.keywords:String(item.keywords||'').split(/[, ]+/).filter(Boolean)}));return cleaned.length?cleaned:fallbackIndex;}
  function setStatus(text){if(answer)answer.textContent=text;}
  function render(data,q=''){
    const tokens=words(q);
    let ranked=data.map(item=>({...item,_score:score(item,tokens,q)})).filter(item=>!q||item._score>0).sort((a,b)=>b._score-a._score||String(a.title).localeCompare(String(b.title)));
    if(!q)ranked=data.slice(0,60); ranked=ranked.slice(0,30);
    if(count)count.textContent=(q?'Ask Matrix found ':'Showing ')+ranked.length+' route'+(ranked.length===1?'':'s');
    if(!ranked.length){results.innerHTML='<article class="card redline"><h3>No direct route found</h3><p>Try Epstein, migration, declassified, crime, D.O.G, downloads, authority, evidence, books, or live intel.</p></article>';}
    else{results.innerHTML=ranked.map(b=>{const visibleKeywords=keys(b).slice(0,8);return '<article class="card"><span class="label">'+esc(b.category||'Route')+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description||b.subtitle||'Open this route for deeper context.')+'</p><p>'+visibleKeywords.map(k=>'<span class="pill">'+esc(k)+'</span>').join('')+'</p><div class="cta-row small"><a class="btn" href="'+esc(b.url)+'">Open Route</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="download-center.html">Downloads</a></div></article>';}).join('');}
    const top=ranked[0]; const hint=bestHint(tokens);
    if(!q)setStatus('ASK MATRIX STATUS\n> Free local mode: active\n> Type a question to rank the archive\n> Paid AI calls: none\n> Source: search-index.json with browser fallback');
    else if(top)setStatus('ASK MATRIX ROUTE\n> Question: '+q+'\n> Best match: '+top.title+'\n> Open: '+top.url+'\n> Suggested lane: '+(hint?hint.label:'Archive route')+'\n> Evidence route: '+(hint?hint.evidence:'evidence-vault.html')+'\n> Boundary: Search routing is not proof. Open the source lane.');
    else setStatus('ASK MATRIX ROUTE\n> No strong match found. Try Epstein, migration, declassified, crime, D.O.G, downloads, authority, evidence, books, or live intel.');
  }
  function init(data,source){const index=normalizeIndex(data);input.dataset.searchReady='true';input.dataset.searchSource=source;function run(){render(index,input.value.trim());}input.addEventListener('input',run);if(shortcuts)shortcuts.addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(!b)return;input.value=b.dataset.q||'';run();input.focus();});run();}
  function failSafe(reason){init(fallbackIndex,'fallback');if(count)count.textContent='Search index fallback active';setStatus('ASK MATRIX STATUS\n> Fallback mode: active\n> search-index.json could not be loaded cleanly\n> Reason: '+String(reason||'unknown').slice(0,120)+'\n> Core routes still available');}
  fetch('/search-index.json',{cache:'no-store',headers:{'Accept':'application/json'}})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text().then(text=>{if(/^\s*</.test(text))throw new Error('HTML returned instead of JSON');try{return JSON.parse(text);}catch(e){throw new Error('Invalid JSON');}});})
    .then(data=>init(data,'search-index.json'))
    .catch(err=>failSafe(err&&err.message));
})();
`;

const requiredIndexRoutes = [
  { title:'Books', category:'Books', url:'books.html', description:'Matrix Reprogrammed book universe, reader paths, D.O.G The Architect, intelligence dossiers, crime dossiers, and public-record books.', keywords:['books','book universe','reader paths','dog','architect','intelligence dossiers','crime dossiers'] },
  { title:'Ask Matrix Search', category:'Search / Free Tool', url:'search.html', description:'Free local site search and answer routing over Matrix Reprogrammed pages.', keywords:['search','ask matrix','local search'] },
  { title:'Live Intel', category:'Current Updates', url:'live-intel.html', description:'Current Matrix Reprogrammed intel stream and source lanes.', keywords:['live intel','updates','source lanes'] },
  { title:'Epstein Files Command Center', category:'Public Record / Evidence', url:'epstein-files.html', description:'Epstein command center, evidence ladder, people tracker, timeline, and public files.', keywords:['epstein','files','maxwell','evidence'] },
  { title:'Evidence Vault', category:'Evidence', url:'evidence-vault.html', description:'Evidence vault, source hierarchy, claim classes, and public-record paths.', keywords:['evidence','source cards','records'] },
  { title:'Download Center', category:'Free Resources', url:'download-center.html', description:'Free downloadable briefs, packs, exports, and machine-readable resources.', keywords:['downloads','free briefs','packs'] },
  { title:'Trust Center', category:'Credibility', url:'trust-center.html', description:'Trust rules, corrections, source methodology, and evidence boundaries.', keywords:['trust','corrections','methodology'] },
  { title:'Authority Hub', category:'SEO / AI Search', url:'authority-hub.html', description:'Authority hub, topic clusters, internal links, and AI-search discovery.', keywords:['authority','seo','topic clusters'] }
];

if (exists('search-index.json')) {
  let index;
  try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  if (!Array.isArray(index)) index = [];
  const byUrl = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));
  for (const route of requiredIndexRoutes) {
    if (!byUrl.has(route.url)) {
      byUrl.set(route.url, route);
      repairs.push(`search-index-route:${route.url}`);
    }
  }
  write('search-index.json', JSON.stringify([...byUrl.values()].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''))), null, 2));
} else {
  write('search-index.json', JSON.stringify(requiredIndexRoutes, null, 2));
  repairs.push('search-index-created');
}

if (exists('search.html')) {
  let html = read('search.html');
  const before = html;
  if (html.includes('<p class="filter-count" id="search-count">Loading local index...</p>')) html = replaceAllText(html, '<p class="filter-count" id="search-count">Loading local index...</p>', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p>');
  if (html.includes('<p class="filter-count" id="search-count"></p>')) html = replaceAllText(html, '<p class="filter-count" id="search-count"></p>', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p>');
  if (!html.includes('Showing the strongest entry points') && html.includes('<div class="grid" id="search-results">')) html = replaceAllText(html, '<div class="grid" id="search-results">', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">');
  if (html !== before) { write('search.html', html); repairs.push('search-count-copy'); }
}

const currentSearchJs = exists('search.js') ? read('search.js') : '';
const requiredMarkers = ['/search-index.json', "cache:'no-store'", 'fallbackIndex', 'HTML returned instead of JSON', 'Invalid JSON', 'failSafe', 'searchReady', 'ask-shortcuts'];
if (requiredMarkers.some(marker => !currentSearchJs.includes(marker)) || currentSearchJs.includes('(b.keywords||[]).slice')) {
  write('search.js', resilientSearchJs);
  repairs.push('forced-resilient-search-js');
}

fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s).');
