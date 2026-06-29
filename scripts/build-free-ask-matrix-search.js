const fs = require('fs');
const path = require('path');
const root = process.cwd();

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function readJson(name, fallback) { try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return fallback; } }
function write(name, content) { fs.writeFileSync(path.join(root, name), content); }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="search.html">Ask Matrix</a><a href="authority-hub.html">Authority Hub</a><a href="news.html">Intel Desk</a><a href="live-intel.html">Live Intel</a><a href="epstein-files.html">Epstein Files</a><a href="evidence-vault.html">Evidence</a><a href="black-file.html">Black File</a></nav></header>`; }
function layout(title, desc, body, scripts = '') { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="fixes.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — free local search, source routes, evidence boundaries, and reader paths.</p><p class="warning">Ask Matrix is a free browser-side search assistant. It uses the local site index only. It does not call paid AI, external model APIs, Workers AI, AutoRAG, or paid search services.</p></footer></div><script src="matrix.js"></script>${scripts}</body></html>`; }

const existing = readJson('search-index.json', []);
const extraRoutes = [
  { key: 'ask-matrix', title: 'Ask Matrix Search', subtitle: 'Free local archive answer engine.', series: 'Site Tool', category: 'Search / Free Tool', url: 'search.html', description: 'Free browser-side question search over Matrix Reprogrammed pages, evidence routes, books, updates, and downloads.', keywords: ['ask matrix','search','free','local','answer engine','site search','open source'] },
  { key: 'authority-hub-route', title: 'Authority Hub', subtitle: 'Topic clusters, pillar pages, spoke routes, and trust boundaries.', series: 'Authority Clusters', category: 'SEO / AI Search', url: 'authority-hub.html', description: 'Authority hub for Matrix Reprogrammed topic clusters, pillar pages, spoke routes, internal links, and AI-search discovery.', keywords: ['authority hub','topic clusters','internal links','pillar pages','AI search','SEO'] },
  { key: 'live-intel-route', title: 'Live Intel', subtitle: 'Dated public-source updates.', series: 'Live Intel', category: 'Current Updates', url: 'live-intel.html', description: 'Dated public-source updates with evidence, video, free brief, offer, and book routes.', keywords: ['latest updates','seven day intel','news','live intel','daily drops','source lanes'] },
  { key: 'epstein-command-center', title: 'Epstein Files Command Center', subtitle: 'Evidence ladder, timeline, people/entity tracking, and public files.', series: 'Epstein Files', category: 'Public Record / Evidence', url: 'epstein-files.html', description: 'Epstein source watch, evidence strength ladder, timeline map, people tracker, file doors, and evidence boundaries.', keywords: ['epstein','maxwell','files','court records','evidence boundary','source watch','timeline','emails'] },
  { key: 'intel-desk', title: 'Signal Intel Desk', subtitle: 'News, migration, vaccines, conflict, source panels.', series: 'Intel Desk', category: 'News / Figures', url: 'news.html', description: 'Public-source bulletins, migration/irregular immigration figures, vaccines evidence boundary, and human-cost panels.', keywords: ['news','migration','irregular immigration','vaccines','human cost','figures','sexual offence statistics'] },
  { key: 'migration-flow', title: 'Migration / Irregular Immigration Flow Panel', subtitle: 'Encounters, crossings, displacement, and source-split rules.', series: 'Intel Desk', category: 'Migration / Figures', url: 'migration-flow.html', description: 'Migration flow categories, irregular border movement, asylum, returns, removals, and sexual-offence source-split country cards.', keywords: ['migration','illegal immigration','irregular crossings','CBP','Frontex','UNHCR','IOM','sexual assault statistics','source split'] },
  { key: 'evidence-vault-main', title: 'Evidence Vault', subtitle: 'Source hierarchy and evidence lanes.', series: 'Trust / Evidence', category: 'Evidence', url: 'evidence-vault.html', description: 'Source hierarchy, evidence lanes, source cards, claim strength, and public-record routes.', keywords: ['evidence','source cards','court records','declassified archives','financial records','human cost sources'] },
  { key: 'source-cards-main', title: 'Source Cards', subtitle: 'Original source pathways.', series: 'Trust / Evidence', category: 'Sources', url: 'source-cards.html', description: 'Source-card system for official archives, agencies, court records, datasets, and evidence pathways.', keywords: ['source cards','sources','official records','archives','datasets','documents'] },
  { key: 'power-atlas-main', title: 'Power Atlas', subtitle: 'Network and relationship map.', series: 'Control System', category: 'Network Map', url: 'power-atlas.html', description: 'Power network atlas with nodes, relationships, evidence classes, and source boundaries.', keywords: ['power atlas','network','relationships','control system','elite networks','nodes'] },
  { key: 'download-center-main', title: 'Download Center', subtitle: 'Free packs, briefs, source bundles, and forum exports.', series: 'Downloads', category: 'Free Resources', url: 'download-center.html', description: 'Free downloadable orientation packs, briefs, source pathways, forum post exports, and machine-readable data.', keywords: ['downloads','free briefs','packs','pdf','json','markdown','forum exports'] },
  { key: 'trust-center-main', title: 'Trust Center', subtitle: 'Claim labels, privacy, corrections, and source methodology.', series: 'Trust / Evidence', category: 'Credibility', url: 'trust-center.html', description: 'Trust rules, source methodology, association boundaries, privacy, corrections, and claim labels.', keywords: ['trust','claim labels','corrections','privacy','source methodology','association boundary'] }
];
const byUrl = new Map();
for (const item of [...existing, ...extraRoutes]) {
  if (!item || !item.url || /^https?:\/\//i.test(item.url)) continue;
  const cleaned = { ...item, keywords: Array.isArray(item.keywords) ? item.keywords : String(item.keywords || '').split(/[, ]+/).filter(Boolean) };
  byUrl.set(cleaned.url, { ...(byUrl.get(cleaned.url) || {}), ...cleaned });
}
const index = [...byUrl.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
write('search-index.json', JSON.stringify(index, null, 2));

const authoritySection = `<section id="phase-twelve-authority-engine" class="section wrap"><h2>Phase 12 Authority / Internal Link Engine</h2><p class="lead">Ask Matrix is part of the authority cluster system: pillar pages, spoke routes, trust pages, source pages, book paths, and evidence lanes.</p><div class="cta-row"><a class="btn" href="authority-hub.html">Authority Hub</a><a class="btn alt" href="authority-evidence-trust.html">Evidence / Trust Cluster</a><a class="btn alt" href="sales-ladder.html">Reader Paths</a></div></section>`;
const body = `<main><section class="hero wrap"><div class="eyebrow">Free Local Answer Engine</div><h1>ASK MATRIX.</h1><p class="lead">Ask a question and the archive will route you to the strongest Matrix Reprogrammed pages, evidence lanes, books, downloads, and current update paths. No paid AI. No external model call. Everything runs in your browser from the local site index.</p><div class="wrap"><input id="archive-search" type="search" placeholder="Ask: latest Epstein files, migration figures, declassified CIA records, crime-state overlap, D.O.G symbols..." autocomplete="off" /></div><div class="cta-row small" id="ask-shortcuts"><button class="btn alt" data-q="latest Epstein files evidence boundary">Epstein</button><button class="btn alt" data-q="migration irregular immigration figures sexual offence source split">Migration</button><button class="btn alt" data-q="declassified intelligence CIA NSA archives">Declassified</button><button class="btn alt" data-q="crime state overlap cartels laundering court records">Crime</button><button class="btn alt" data-q="D.O.G symbols masonic esoteric architecture">D.O.G</button><button class="btn alt" data-q="free downloads briefs source packs">Downloads</button></div></section><section class="section wrap split"><div class="terminal" id="ask-answer">ASK MATRIX STATUS\n&gt; Free local mode: active\n&gt; Paid AI calls: none\n&gt; Source: search-index.json\n&gt; Authority cluster: active\n&gt; Evidence boundary: active</div><aside class="card redline"><h2>How This Works</h2><p>This is not a paid chatbot. It scores your question against local titles, topics, descriptions, categories, and keywords, then routes you to the most useful pages.</p><p><span class="pill">free</span> <span class="pill">open web</span> <span class="pill">no API key</span> <span class="pill">no paid AI</span></p></aside></section><section class="section wrap"><p class="filter-count" id="search-count">Loading local index...</p><div class="grid" id="search-results"></div></section>${authoritySection}</main>`;
write('search.html', layout('Ask Matrix | Free Local Search | Matrix Reprogrammed', 'Free local Matrix Reprogrammed archive search and answer routing. No paid AI, no external model calls.', body, '<script src="search.js"></script><script src="analytics.js"></script>'));

const js = `(function(){
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
    {title:'Books',category:'Books',url:'books.html',description:'Matrix Reprogrammed book universe and reader paths.',keywords:['books','kdp','dog','architect','crime dossiers']},
    {title:'Download Center',category:'Free Resources',url:'download-center.html',description:'Free downloadable orientation packs, briefs, source pathways, forum exports, and machine-readable data.',keywords:['downloads','free briefs','pdf','json','markdown']},
    {title:'Authority Hub',category:'SEO / AI Search',url:'authority-hub.html',description:'Topic clusters, pillar pages, spoke routes, internal links, and AI-search discovery.',keywords:['authority','hub','seo','ai search']},
    {title:'Trust Center',category:'Credibility',url:'trust-center.html',description:'Trust rules, source methodology, association boundaries, privacy, corrections, and claim labels.',keywords:['trust','privacy','corrections','source methodology']}
  ];
  const stop=new Set('the,and,for,with,what,where,when,why,how,does,into,from,that,this,show,about,latest,update,updates,are,all,site,page,pages'.split(','));
  const routeHints=[
    {terms:['epstein','maxwell','giuffre','files','emails','settlement','nda'],route:'epstein-files.html',label:'Epstein Command Center',evidence:'epstein-files.html#epstein-evidence-ladder'},
    {terms:['migration','immigration','border','cbp','frontex','asylum','sexual','assault'],route:'migration-flow.html',label:'Migration Flow Panel',evidence:'news.html#migration'},
    {terms:['cia','nsa','declassified','foia','archive','mkultra','gladio'],route:'evidence-vault.html',label:'Evidence Vault',evidence:'evidence-vault-index.html'},
    {terms:['cartel','crime','mafia','laundering','court','sanction','ports'],route:'map-crime-state-overlap.html',label:'Crime-State Map',evidence:'evidence-lane-court-records.html'},
    {terms:['dog','symbol','masonic','masonry','esoteric','occult','architect'],route:'map-symbolic-power.html',label:'Symbolic Power Map',evidence:'answer-evidence-boundary.html'},
    {terms:['download','brief','pack','pdf','json','markdown','free'],route:'download-center.html',label:'Download Center',evidence:'trust-center.html'}
  ];
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function words(q){return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\\s+/).filter(w=>w.length>1&&!stop.has(w));}
  function hay(item){return [item.title,item.subtitle,item.series,item.category,item.description,Array.isArray(item.keywords)?item.keywords.join(' '):item.keywords].join(' ').toLowerCase();}
  function score(item,tokens,q){const h=hay(item);let s=0;if(!tokens.length)return 1;for(const t of tokens){if(String(item.title||'').toLowerCase().includes(t))s+=10;if(String(item.category||'').toLowerCase().includes(t))s+=5;if(String(item.series||'').toLowerCase().includes(t))s+=4;if(String((item.keywords||[])).toLowerCase().includes(t))s+=7;if(h.includes(t))s+=2;}if(q&&h.includes(q.toLowerCase()))s+=14;return s;}
  function bestHint(tokens){let best=null;for(const h of routeHints){const s=h.terms.reduce((n,t)=>n+(tokens.includes(t)?1:0),0);if(s&&(!best||s>best.score))best={...h,score:s};}return best;}
  function normalizeIndex(data){if(!Array.isArray(data))return fallbackIndex;const cleaned=data.filter(item=>item&&item.url&&item.title).map(item=>({...item,keywords:Array.isArray(item.keywords)?item.keywords:String(item.keywords||'').split(/[, ]+/).filter(Boolean)}));return cleaned.length?cleaned:fallbackIndex;}
  function setStatus(text){if(answer)answer.textContent=text;}
  function render(data,q=''){
    const tokens=words(q);
    let ranked=data.map(item=>({...item,_score:score(item,tokens,q)})).filter(item=>!q||item._score>0).sort((a,b)=>b._score-a._score||String(a.title).localeCompare(String(b.title)));
    if(!q)ranked=data.slice(0,60);
    ranked=ranked.slice(0,30);
    if(count)count.textContent=(q?'Ask Matrix found ':'Showing ')+ranked.length+' route'+(ranked.length===1?'':'s');
    if(!ranked.length){results.innerHTML='<article class="card redline"><h3>No direct route found</h3><p>Try Epstein, migration, declassified, crime, D.O.G, downloads, authority, evidence, books, or live intel.</p></article>';}else{results.innerHTML=ranked.map(b=>'<article class="card"><span class="label">'+esc(b.category||'Route')+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description||b.subtitle||'Open this route for deeper context.')+'</p><p>'+((b.keywords||[]).slice(0,8).map(k=>'<span class="pill">'+esc(k)+'</span>').join(''))+'</p><div class="cta-row small"><a class="btn" href="'+esc(b.url)+'">Open Route</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="download-center.html">Downloads</a></div></article>').join('');}
    const top=ranked[0];const hint=bestHint(tokens);
    if(!q){setStatus('ASK MATRIX STATUS\\n> Free local mode: active\\n> Type a question to rank the archive\\n> Paid AI calls: none\\n> Source: search-index.json with browser fallback');}
    else if(top){setStatus('ASK MATRIX ROUTE\\n> Question: '+q+'\\n> Best match: '+top.title+'\\n> Open: '+top.url+'\\n> Suggested lane: '+(hint?hint.label:'Archive route')+'\\n> Evidence route: '+(hint?hint.evidence:'evidence-vault.html')+'\\n> Boundary: Search routing is not proof. Open the source lane.');}
    else{setStatus('ASK MATRIX ROUTE\\n> No strong match found. Try Epstein, migration, declassified, crime, D.O.G, downloads, authority, evidence, books, or live intel.');}
  }
  function init(data,source){const index=normalizeIndex(data);input.dataset.searchReady='true';input.dataset.searchSource=source;function run(){render(index,input.value.trim());}input.addEventListener('input',run);if(shortcuts)shortcuts.addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(!b)return;input.value=b.dataset.q||'';run();input.focus();});run();}
  function failSafe(reason){init(fallbackIndex,'fallback');if(count)count.textContent='Search index fallback active';setStatus('ASK MATRIX STATUS\\n> Fallback mode: active\\n> search-index.json could not be loaded cleanly\\n> Reason: '+String(reason||'unknown').slice(0,120)+'\\n> Core routes still available');}
  fetch('/search-index.json',{cache:'no-store',headers:{'Accept':'application/json'}})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text().then(text=>{if(/^\\s*</.test(text))throw new Error('HTML returned instead of JSON');try{return JSON.parse(text);}catch(e){throw new Error('Invalid JSON');}});})
    .then(data=>init(data,'search-index.json'))
    .catch(err=>failSafe(err&&err.message));
})();`;
write('search.js', js);

function patchTextFile(name, marker, addition) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return;
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(marker)) {
    s += `\n${addition}\n`;
    fs.writeFileSync(file, s);
  }
}
patchTextFile('llms.txt', 'Ask Matrix Search', '- Ask Matrix Search: /search.html — free local search over Matrix Reprogrammed routes, no paid AI calls.');
patchTextFile('robots.txt', 'search-index.json', 'Allow: /search-index.json');
console.log(`Built resilient Ask Matrix search with ${index.length} local routes and browser fallback mode.`);
