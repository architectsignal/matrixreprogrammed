const fs = require('fs');
const path = require('path');
const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', '.wrangler', '_site']);
const coreJson = [
  'data/daily-brain-brief.json',
  'data/control-structure-core.json',
  'data/outcome-briefings.json',
  'data/gold-reserves-worldwide.json',
  'data/agenda-2030-policy-watch.json',
  'data/probability-snapshot.json',
  'data/probability-signal-feed-004.json',
  'data/billionaire-watch-core.json'
];
const priorityRoutes = {
  'control-structure.html': 100,
  'daily-brain-brief.html': 98,
  'matrix-brain.html': 96,
  'outcome-briefings.html': 94,
  'evidence-vault.html': 92,
  'epstein-files.html': 91,
  'policy-watch.html': 90,
  'agenda-2030.html': 89,
  'gold-reserve-tracker.html': 88,
  'gold.html': 87,
  'billionaire-watch.html': 86,
  'power-atlas.html': 84,
  'convergence-hypotheses.html': 83,
  'speculation-review.html': 82,
  'books.html': 80,
  'download-center.html': 78,
  'newsletter.html': 77
};
const layers = [
  { id: 'money-reserves', label: 'Money / Reserves', terms: ['gold','reserve','custody','vault','central bank','money','payment','cbdc','wallet','debt','sanctions'], routes: ['gold-reserve-tracker.html','gold.html','policy-watch.html','billionaire-watch.html'] },
  { id: 'identity-access', label: 'Identity / Access', terms: ['identity','digital id','access','wallet','login','public service','agenda','2030','sdg','mandatory'], routes: ['agenda-2030.html','policy-watch.html','convergence-hypotheses.html','probability-snapshot.html'] },
  { id: 'information-narrative', label: 'Information / Narrative', terms: ['brain','brief','narrative','media','censorship','search','source','document','vault','information'], routes: ['daily-brain-brief.html','outcome-briefings.html','source-document-vault.html','search.html'] },
  { id: 'security-emergency', label: 'Security / Emergency Power', terms: ['security','emergency','surveillance','border','intelligence','cyber','policing','war'], routes: ['power-atlas.html','network-map-index.html','live-intel.html','evidence-vault.html'] },
  { id: 'elite-networks', label: 'Elite Networks', terms: ['elite','billionaire','foundation','institution','wef','blackrock','control','power','contract','lobbying'], routes: ['billionaire-watch.html','power-atlas.html','network-maps.html','book-elite-toolkit.html'] },
  { id: 'disclosure-black-files', label: 'Disclosure / Black Files', terms: ['epstein','disclosure','redaction','withheld','sealed','court','file','black file','records'], routes: ['epstein-files.html','trigger-watchtower.html','record-intake-queue.html','black-file.html'] },
  { id: 'speculation-review', label: 'Speculation Review', terms: ['speculation','claim','frazzledrip','clinton','source chain','metadata','counter source','case file'], routes: ['speculation-review.html','dark-speculation-lab.html','dark-speculation-forum.html'] }
];
function read(file, fallback = '') { try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return fallback; } }
function readJson(file, fallback = null) { try { return JSON.parse(read(file)); } catch { return fallback; } }
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }
function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripHtml(s = '') { return String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function titleFromHtml(html, file) { return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || file.replace(/[-.]/g, ' ')).replace(/\s+/g, ' ').trim(); }
function descFromHtml(html) { return html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || ''; }
function allHtmlFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}
function termsFor(text) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const l of layers) if (l.terms.some(t => lower.includes(t))) found.push(l.id, l.label);
  return found;
}
function bestLayer(text) {
  const lower = String(text || '').toLowerCase();
  let best = null;
  for (const l of layers) {
    const score = l.terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    if (score && (!best || score > best.score)) best = { ...l, score };
  }
  return best;
}
function add(map, item) {
  if (!item || !item.url || /^https?:/i.test(item.url)) return;
  const prior = map.get(item.url) || {};
  const merged = { ...prior, ...item };
  merged.keywords = [...new Set([...(prior.keywords || []), ...(item.keywords || [])].filter(Boolean))];
  merged.priority = Math.max(Number(prior.priority || 0), Number(item.priority || 0), Number(priorityRoutes[item.url] || 0));
  map.set(item.url, merged);
}
const index = new Map();
for (const file of allHtmlFiles()) {
  const html = read(file);
  const title = titleFromHtml(html, file);
  const description = descFromHtml(html) || stripHtml(html).slice(0, 260);
  const text = `${title} ${description} ${stripHtml(html).slice(0, 6000)}`;
  const layer = bestLayer(text);
  add(index, { key: file, title, category: layer ? layer.label : 'Site Route', layer: layer ? layer.id : 'general', url: file, description, keywords: termsFor(text).slice(0, 22), priority: priorityRoutes[file] || 10, sourceType: 'html' });
}
for (const file of coreJson) {
  const data = readJson(file, null);
  if (!data) continue;
  const text = JSON.stringify(data).slice(0, 12000);
  const layer = bestLayer(text);
  const url = file;
  add(index, { key: file, title: data.title || file.replace('data/','').replace('.json',''), category: layer ? layer.label : 'Machine Data', layer: layer ? layer.id : 'machine-data', url, description: data.purpose || data.mission || data.boundary || 'Machine-readable Matrix Reprogrammed feed.', keywords: termsFor(text).slice(0, 25), priority: 70, sourceType: 'json-feed' });
}
const missionRoutes = [
  { url: 'control-structure.html', title: 'Control Structure Map', category: 'Main Mission', layer: 'control-structure', description: 'The intuitive seven-layer map of money, identity, information, emergency power, elite networks, disclosure gaps and speculation review.', keywords: ['control structure','world control','matrix','mission','power map','money','identity','information','elite networks','disclosure'] },
  { url: 'daily-brain-brief.html', title: 'Daily Brain Brief', category: 'Living Brain', layer: 'information-narrative', description: 'Daily conclusions, top signals, missing records, likely outcomes and watch list generated from Matrix Brain feeds.', keywords: ['daily brain','brief','conclusions','watch list','records needed','alive','machine pulse'] },
  { url: 'data/daily-brain-brief.json', title: 'Daily Brain Brief JSON', category: 'Machine Data', layer: 'information-narrative', description: 'Machine-readable Daily Brain Brief feed.', keywords: ['json','brain','conclusions','signals','missing records'] },
  { url: 'gold-reserve-tracker.html', title: 'Gold Reserve Tracker', category: 'Money / Reserves', layer: 'money-reserves', description: 'Worldwide official gold reserve holdings with owner route, custody route, audit status and missing records.', keywords: ['gold','reserves','custody','vault','central bank','tonnes','audit'] },
  { url: 'agenda-2030.html', title: 'Agenda 2030 Policy Intelligence', category: 'Identity / Access', layer: 'identity-access', description: 'Policy intelligence route for SDG language, access systems, digital identity, wallets, public-private systems and records needed.', keywords: ['agenda 2030','sdg','digital id','wallet','access','policy','public private'] },
  { url: 'speculation-review.html', title: 'Speculation Review', category: 'Speculation Review', layer: 'speculation-review', description: 'Converts dark claims into source chains, record routes, counter-sources, evidence grades and probability triggers.', keywords: ['speculation','claim review','source chain','frazzledrip','clinton','metadata','counter source'] },
  { url: 'epstein-files.html', title: 'Epstein Files', category: 'Disclosure / Black Files', layer: 'disclosure-black-files', description: 'Epstein file drops, disclosure pressure, redactions, court records, source boundaries and missing-record routes.', keywords: ['epstein','redaction','court','withheld','files','black file','disclosure'] },
  { url: 'billionaire-watch.html', title: 'Billionaire Watch', category: 'Elite Networks', layer: 'elite-networks', description: 'Tracks ultra-wealth, infrastructure, investments, policy influence, foundations and control layers.', keywords: ['billionaire','wealth','elite','foundation','infrastructure','policy influence'] }
];
missionRoutes.forEach(item => add(index, { ...item, priority: priorityRoutes[item.url] || 95, sourceType: 'mission-route' }));
const finalIndex = [...index.values()].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title).localeCompare(String(b.title)));
write('search-index.json', JSON.stringify(finalIndex, null, 2));
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Search The Machine | Matrix Reprogrammed</title><meta name="description" content="Brain-aware Matrix Reprogrammed search for the control structure, evidence routes, Daily Brain Brief, gold reserves, policy systems, disclosure files, speculation review, books and videos."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="control-structure.html">Control Map</a><a href="daily-brain-brief.html">Daily Brief</a><a href="evidence-vault.html">Evidence</a><a href="books.html">Books</a><a href="newsletter.html">Free Brief</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Search V2 · Brain-Aware</div><h1>SEARCH THE MACHINE.</h1><p class="lead">Search by control layer, person, institution, record route, missing file, book, briefing, or outcome. The system now boosts the pages that explain the control structure first.</p><div class="wrap"><input id="archive-search" type="search" placeholder="Try: control structure, gold custody, Epstein redactions, digital ID, billionaire watch, speculation review..." autocomplete="off"/></div><div class="cta-row small" id="ask-shortcuts"><button class="btn alt" data-q="control structure power map">Control Structure</button><button class="btn alt" data-q="gold custody vault audit reserves">Gold Custody</button><button class="btn alt" data-q="epstein redaction withheld court files">Epstein Redactions</button><button class="btn alt" data-q="agenda 2030 digital identity access wallet">Digital ID</button><button class="btn alt" data-q="billionaire infrastructure foundation policy influence">Billionaires</button><button class="btn alt" data-q="speculation claim source chain counter source">Speculation</button></div></section><section class="section wrap split"><div class="terminal" id="ask-answer">SEARCH V2 STATUS\n&gt; Brain-aware index: active\n&gt; Control layers: active\n&gt; HTML + JSON feeds: indexed\n&gt; Mission routes: boosted\n&gt; Evidence boundary: active</div><aside class="card redline"><h2>How This Works</h2><p>This is still free local browser search. But it now indexes the site like an intelligence machine: control layer, route priority, evidence lane, feed type, keywords, and page purpose.</p><div class="cta-row small"><a class="btn alt" href="control-structure.html">Control Map</a><a class="btn alt" href="daily-brain-brief.html">Daily Brief</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></aside></section><section class="section wrap"><div data-living-pulse></div></section><section class="section wrap"><p class="filter-count" id="search-count">Loading brain-aware index...</p><div class="grid" id="search-results"></div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — search the control structure, then follow the records.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script><script src="search.js"></script><script src="analytics.js"></script></body></html>`;
write('search.html', html);
const client = `(function(){
const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count'),answer=document.getElementById('ask-answer'),shortcuts=document.getElementById('ask-shortcuts');
if(!input||!results)return;
const stop=new Set('the,and,for,with,what,where,when,why,how,does,into,from,that,this,show,about,latest,update,updates,are,all,site,page,pages,tell,me'.split(','));
const layerMap={
'money-reserves':['gold','reserve','custody','vault','central','bank','money','payment','cbdc','wallet','debt'],
'identity-access':['identity','digital','access','wallet','login','agenda','2030','sdg','mandatory'],
'information-narrative':['brain','brief','narrative','media','censorship','search','source','document'],
'security-emergency':['security','emergency','surveillance','border','intelligence','cyber','war'],
'elite-networks':['elite','billionaire','foundation','institution','wef','blackrock','control','power'],
'disclosure-black-files':['epstein','disclosure','redaction','withheld','sealed','court','file','records'],
'speculation-review':['speculation','claim','frazzledrip','clinton','metadata','counter','source']};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function words(q){return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(w=>w.length>1&&!stop.has(w));}
function keys(i){return Array.isArray(i.keywords)?i.keywords:String(i.keywords||'').split(/[, ]+/).filter(Boolean);}
function hay(i){return [i.title,i.category,i.layer,i.description,keys(i).join(' ')].join(' ').toLowerCase();}
function queryLayer(tokens){let best=null;for(const [layer,terms] of Object.entries(layerMap)){const s=terms.reduce((n,t)=>n+(tokens.includes(t)?1:0),0);if(s&&(!best||s>best.score))best={layer,score:s};}return best;}
function score(i,tokens,q){const h=hay(i);let s=Number(i.priority||0)/4;if(!tokens.length)return s;for(const t of tokens){if(String(i.title||'').toLowerCase().includes(t))s+=22;if(String(i.category||'').toLowerCase().includes(t))s+=12;if(String(i.layer||'').toLowerCase().includes(t))s+=10;if(keys(i).join(' ').toLowerCase().includes(t))s+=14;if(h.includes(t))s+=4;}if(q&&h.includes(q.toLowerCase()))s+=30;const l=queryLayer(tokens);if(l&&String(i.layer||'')===l.layer)s+=24;return s;}
function card(i){const pills=[i.category,i.layer,i.sourceType].filter(Boolean).slice(0,3).map(x=>'<span class="pill">'+esc(x)+'</span>').join('');return '<article class="card redline"><span class="label">'+esc(i.category||'Route')+'</span><h3>'+esc(i.title)+'</h3><p>'+esc(i.description||'Open this route for deeper context.')+'</p><p>'+pills+'</p><div class="cta-row small"><a class="btn" href="'+esc(i.url)+'">Open Route</a><a class="btn alt" href="control-structure.html">Control Map</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></article>';}
function status(q, ranked, tokens){const top=ranked[0],l=queryLayer(tokens);if(!answer)return;if(!q)answer.textContent='SEARCH V2 STATUS\n> Brain-aware index: active\n> Type a question to rank the control structure\n> HTML + JSON feeds indexed\n> Mission routes boosted';else if(top)answer.textContent='SEARCH V2 ROUTE\n> Query: '+q+'\n> Layer: '+(l?l.layer:'general')+'\n> Best route: '+top.title+'\n> Open: '+top.url+'\n> Boundary: search routing is not proof. Follow the evidence route.';else answer.textContent='SEARCH V2 ROUTE\n> No direct match. Try control structure, gold custody, digital ID, Epstein redaction, billionaire watch, or speculation review.';}
function render(index,q=''){const tokens=words(q);let ranked=index.map(i=>({...i,_score:score(i,tokens,q)})).filter(i=>!q||i._score>Number(i.priority||0)/4).sort((a,b)=>b._score-a._score||String(a.title).localeCompare(String(b.title))).slice(0,q?36:24);count&&(count.textContent=(q?'Found ':'Showing ')+ranked.length+' route'+(ranked.length===1?'':'s'));results.innerHTML=ranked.length?ranked.map(card).join(''):'<article class="card redline"><h3>No direct route found</h3><p>Try control structure, gold custody, digital identity, Epstein redaction, billionaire watch, speculation, books, or evidence.</p></article>';status(q,ranked,tokens);}
function init(index){index=Array.isArray(index)?index:[];function run(){render(index,input.value.trim());}input.addEventListener('input',run);shortcuts&&shortcuts.addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(!b)return;input.value=b.dataset.q||'';run();input.focus();});run();}
fetch('/search-index.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(init).catch(err=>{count&&(count.textContent='Search index failed to load');results.innerHTML='<article class="card redline"><h3>Search fallback</h3><p>Open the Control Structure Map, Daily Brain Brief, Evidence Vault, or Books while the index refreshes.</p><div class="cta-row small"><a class="btn" href="control-structure.html">Control Map</a><a class="btn alt" href="daily-brain-brief.html">Daily Brief</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></article>';answer&&(answer.textContent='SEARCH V2 STATUS\n> Fallback active\n> '+String(err.message||err).slice(0,120));});
})();`;
write('search.js', client);
console.log(`Search V2 built: ${finalIndex.length} indexed routes, ${coreJson.length} core feeds, ${missionRoutes.length} boosted mission routes.`);
