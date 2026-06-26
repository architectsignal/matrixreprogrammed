const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value = '') { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function safeDate(value = '') { return String(value || '').slice(0, 10) || 'undated'; }
function safeRoute(value = '#') { const v = String(value || '#'); return v || '#'; }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="daily-drop.html">Daily Drop</a><a href="epstein-files.html">Epstein Command Center</a><a href="network-search.html">Network Search</a><a href="evidence-vault.html">Evidence Vault</a><a href="download-center.html">Downloads</a><a href="amazon-store-books.html">Books</a></nav></header>`;
}
function layout(title, desc, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description:desc,dateModified:new Date().toISOString()})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, network exposed.</p><p class="warning">Evidence boundary: this site tracks public records and open-source reporting. It does not convert association, contact, allegation, settlement, or commentary into guilt.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function badge(label) { return `<span class="pill">${esc(label || 'Source-linked')}</span>`; }
function evidenceBox(item) {
  const evidence = clean(item.evidenceLevel || item.evidenceClass || 'Source-linked record');
  const boundary = clean(item.evidenceBoundary || item.boundary || 'Open the source and preserve the evidence class before sharing a claim.');
  const proves = clean(item.recordShows || item.summary || item.title || 'A public-source record exists and needs classification.');
  return `<div class="grid"><article class="card redline"><span class="label">What the record proves</span><h3>${esc(evidence)}</h3><p>${esc(proves)}</p></article><article class="card"><span class="label">What it does not prove</span><h3>Boundary</h3><p>${esc(boundary)}</p></article><article class="card"><span class="label">What would strengthen it</span><h3>Source Route</h3><p>Primary documents, court records, sworn testimony, official releases, authenticated files, and dated source trails strengthen the claim. Commentary alone does not.</p></article></div>`;
}
function ctaRow(items) {
  return `<div class="cta-row small">${items.filter(Boolean).map(item => `<a class="btn${item.alt ? ' alt' : ''}" href="${esc(item.href)}">${esc(item.label)}</a>`).join('')}</div>`;
}

const liveIntel = readJson('data/live-intel.json', { updated: new Date().toISOString(), items: [] });
const epsteinWatch = readJson('data/epstein-evidence-watch.json', { watchSources: [], bulletins: [], moneyRoutes: {} });
const peopleIndex = readJson('data/epstein-people-index.json', { people: [], evidenceClasses: [] });
const fileCockpit = readJson('data/epstein-file-cockpit.json', { doors: [] });
const evidenceVault = readJson('data/evidence-vault.json', { sourceCards: [], sourceLanes: [], claimRules: [] });
const timeline = readJson('data/epstein-timeline-map.json', { items: [] });
const liveItems = (liveIntel.items || []).map(item => ({ ...item, title: clean(item.title), summary: clean(item.summary) })).filter(item => item.title);
const epsteinItems = liveItems.filter(item => String(item.lane || '').includes('epstein')).slice(0, 8);
const nonEpsteinItems = liveItems.filter(item => !String(item.lane || '').includes('epstein')).slice(0, 10);

function buildDailyDrop() {
  const latest = liveItems.slice(0, 14);
  const epsteinCards = epsteinItems.map(item => `<article class="card redline"><span class="label">${esc(safeDate(item.published))} · ${esc(item.sourceLabel || item.laneTitle)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p>${evidenceBox(item)}${ctaRow([{label:'Open Source',href:item.url},{label:'Evidence Route',href:item.evidenceRoute || 'evidence-vault.html',alt:true},{label:'Free Brief',href:item.optinRoute || 'optin-center.html',alt:true},{label:'Book Route',href:item.bookRoute || 'books.html',alt:true}])}</article>`).join('');
  const updateCards = latest.map(item => `<article class="news-item"><span class="figure-caption">${esc(safeDate(item.published))} · ${esc(item.laneTitle || item.lane)} · ${esc(item.sourceLabel)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><p>${badge(item.evidenceLevel || 'Public-source lead')} ${badge(item.laneTitle || item.lane)}</p>${ctaRow([{label:'Open Source',href:item.url},{label:'Evidence',href:item.evidenceRoute || 'evidence-vault.html',alt:true},{label:'Video',href:item.videoRoute || 'videos.html',alt:true},{label:'Store',href:item.storeRoute || 'amazon-store-books.html',alt:true}])}</article>`).join('');
  const sourcePull = {
    updated: new Date().toISOString(),
    liveIntelUpdated: liveIntel.updated,
    totalItems: liveItems.length,
    epsteinItems: epsteinItems.length,
    nonEpsteinItems: nonEpsteinItems.length,
    epsteinBulletins: (epsteinWatch.bulletins || []).length,
    watchSources: (epsteinWatch.watchSources || []).length,
    peopleTracked: (peopleIndex.people || []).length,
    sourceCards: (evidenceVault.sourceCards || []).length,
    status: 'daily-drop-generated'
  };
  fs.writeFileSync(path.join(root, 'downloads', 'daily-drop.json'), JSON.stringify({ ...sourcePull, latest, epsteinItems, watchSources: epsteinWatch.watchSources || [] }, null, 2));
  fs.writeFileSync(path.join(root, 'downloads', 'daily-drop.md'), `# Matrix Reprogrammed Daily Drop\n\nUpdated: ${sourcePull.updated}\n\n## Status\n\n- Live Intel items: ${sourcePull.totalItems}\n- Epstein items: ${sourcePull.epsteinItems}\n- Epstein source lanes: ${sourcePull.watchSources}\n- People/entities tracked: ${sourcePull.peopleTracked}\n- Source cards: ${sourcePull.sourceCards}\n\n## Latest Items\n\n${latest.map(item => `- ${safeDate(item.published)} — ${item.title}\n  - Source: ${item.url}\n  - Evidence: ${item.evidenceLevel || 'Public-source lead'}\n  - Boundary: ${item.evidenceBoundary || 'Open source first.'}`).join('\n')}\n`);
  const body = `<main><section class="hero wrap"><div class="eyebrow">Daily Drop Room</div><h1>WHAT CHANGED TODAY?</h1><p class="lead">A daily public-record control room for Epstein files, source-watch updates, declassified/archive movement, crime-state overlap, war-machine signals, evidence boundaries, free briefs, and book routes.</p><div class="cta-row"><a class="btn" href="downloads/daily-drop.json">Machine-readable Daily Drop</a><a class="btn alt" href="downloads/daily-drop.md">Markdown Brief</a><a class="btn alt" href="epstein-files.html">Epstein Command Center</a><a class="btn alt" href="network-search.html">Network Search</a></div></section><section class="section wrap split"><div class="terminal">DAILY DROP STATUS\n&gt; Generated: ${esc(sourcePull.updated)}\n&gt; Live Intel updated: ${esc(sourcePull.liveIntelUpdated)}\n&gt; Items available: ${sourcePull.totalItems}\n&gt; Epstein lane items: ${sourcePull.epsteinItems}\n&gt; Watch sources: ${sourcePull.watchSources}\n&gt; People/entity cards: ${sourcePull.peopleTracked}\n&gt; Source cards: ${sourcePull.sourceCards}\n&gt; Rule: source first, claim second, network exposed</div><aside class="card redline"><h2>How To Read The Drop</h2><p>Start with what changed, open the source, classify the evidence, read what it does not prove, then follow the evidence route, free brief, video hook, and book path.</p></aside></section><section class="section wrap"><h2>Epstein File Movement</h2><p class="lead">Current Epstein-linked updates and source-watch items with visible evidence boundaries.</p><div class="grid">${epsteinCards || '<article class="card"><h3>No new Epstein item today</h3><p>The lane remains active. Open the command center for the last watch state and source doors.</p></article>'}</div></section><section class="section wrap"><h2>Latest Actionable Updates</h2>${updateCards || '<article class="card"><h3>No live-intel items available</h3><p>The source lanes are configured and will populate when feeds return usable public records.</p></article>'}</section><section class="section wrap"><h2>Source Pull Log</h2><div class="grid"><article class="card"><span class="label">Feeds checked</span><h3>${sourcePull.watchSources} Epstein lanes</h3><p>Court records, Maxwell litigation, DOJ/FBI records, congressional oversight, news bulletins, archives, and video routes stay active.</p></article><article class="card"><span class="label">Archive depth</span><h3>${sourcePull.sourceCards} source cards</h3><p>The Evidence Vault routes claims through court records, official datasets, archives, regulators, oversight records, and credible reporting.</p></article><article class="card"><span class="label">Network depth</span><h3>${sourcePull.peopleTracked} people/entities</h3><p>People are tracked by what the record shows, what function they serve in the network map, and what the record does not prove.</p></article></div></section></main>`;
  write('daily-drop.html', layout('Daily Drop | Matrix Reprogrammed', 'Daily public-record source-watch room for Epstein files, elite networks, evidence lanes, and updated reader routes.', body));
}

function buildNetworkSearch() {
  const people = peopleIndex.people || [];
  const cards = people.map(person => {
    const sources = (person.sourceButtons || []).map(button => `<a class="btn alt" href="${esc(button.url)}">${esc(button.label)}</a>`).join('');
    const search = [person.name, person.type, person.evidenceClass, person.recordShows, person.networkFunction, person.boundary].map(clean).join(' ').toLowerCase();
    return `<article class="card redline network-card" data-network-card="true" data-search="${esc(search)}" data-evidence="${esc(clean(person.evidenceClass))}"><span class="label">${esc(person.evidenceClass)}</span><h3>${esc(person.name)}</h3><p><strong>Role:</strong> ${esc(person.type)}</p><p><strong>Record shows:</strong> ${esc(person.recordShows)}</p><p><strong>Network function:</strong> ${esc(person.networkFunction)}</p><p><strong>Boundary:</strong> ${esc(person.boundary)}</p><div class="cta-row small">${sources}</div></article>`;
  }).join('');
  const jsonData = { updated: new Date().toISOString(), evidenceClasses: peopleIndex.evidenceClasses || [], people };
  fs.writeFileSync(path.join(root, 'downloads', 'network-search.json'), JSON.stringify(jsonData, null, 2));
  fs.writeFileSync(path.join(root, 'downloads', 'network-search.md'), `# Network Search\n\nUpdated: ${jsonData.updated}\n\n${people.map(p => `## ${p.name}\n\n- Evidence class: ${p.evidenceClass}\n- Role: ${p.type}\n- Record shows: ${p.recordShows}\n- Network function: ${p.networkFunction}\n- Boundary: ${p.boundary}\n`).join('\n')}`);
  const filters = (peopleIndex.evidenceClasses || []).map(label => `<button class="btn alt" type="button" data-filter-evidence="${esc(label)}">${esc(label)}</button>`).join('');
  const script = `<script>(function(){const input=document.querySelector('[data-network-search-input]');const cards=[...document.querySelectorAll('[data-network-card]')];function run(q='',ev=''){q=String(q||'').toLowerCase();cards.forEach(card=>{const okText=!q||card.dataset.search.includes(q);const okEv=!ev||card.dataset.evidence===ev;card.style.display=okText&&okEv?'':'none';});}if(input)input.addEventListener('input',()=>run(input.value));document.querySelectorAll('[data-filter-evidence]').forEach(btn=>btn.addEventListener('click',()=>run(input&&input.value,btn.dataset.filterEvidence)));const clear=document.querySelector('[data-filter-clear]');if(clear)clear.addEventListener('click',()=>{if(input)input.value='';run();});})();</script>`;
  const body = `<main><section class="hero wrap"><div class="eyebrow">Searchable Network Database</div><h1>PEOPLE. ENTITIES. RECORDS. BOUNDARIES.</h1><p class="lead">Search the Epstein people/entity board by name, role, evidence class, record function, money/access lane, testimony, settlement, contradiction, email, flight/contact record, and source path.</p><div class="cta-row"><a class="btn" href="downloads/network-search.json">Network JSON</a><a class="btn alt" href="downloads/network-search.md">Network Markdown</a><a class="btn alt" href="epstein-files.html">Command Center</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section><section class="section wrap"><div class="card redline"><label class="label" for="network-search-box">Search network records</label><input id="network-search-box" data-network-search-input="true" type="search" placeholder="Search name, record, role, settlement, email, testimony, money, access..." style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(0,255,102,.35);background:#050805;color:#eaffef;margin-top:10px;" /><div class="cta-row small" style="margin-top:14px;">${filters}<button class="btn" type="button" data-filter-clear="true">Clear Filters</button></div></div></section><section class="section wrap"><h2>Evidence Classes</h2><div class="grid">${(peopleIndex.evidenceClasses || []).map(label => `<article class="card"><span class="label">Evidence class</span><h3>${esc(label)}</h3><p>This label controls what the record can safely support. It is not a guilt label unless the record class says conviction, plea, admission, or court finding.</p></article>`).join('')}</div></section><section class="section wrap"><h2>People / Entity Cards</h2><div class="grid">${cards}</div></section>${script}</main>`;
  write('network-search.html', layout('Network Search | Matrix Reprogrammed', 'Searchable people/entity database for Epstein public records, evidence classes, network functions, and source boundaries.', body));
}

function commandCenterPatch() {
  const bulletins = (epsteinWatch.bulletins || []).slice(0, 4).map(b => `<article class="card redline"><span class="label">${esc(b.date)} · ${esc(b.label)}</span><h3>${esc(b.title)}</h3><p>${esc(b.summary)}</p>${ctaRow([{label:'Source Route',href:b.sourceRoute || 'epstein-files.html'},{label:'Download',href:b.pdfRoute || 'downloads/epstein-evidence-watch.md',alt:true},{label:'Book Route',href:b.bookRoute || 'book-black-file.html',alt:true}])}</article>`).join('');
  const fileDoors = (fileCockpit.doors || []).slice(0, 8).map(door => `<article class="card"><span class="label">${esc(door.evidenceClass || 'Actual file')}</span><h3>${esc(door.title)}</h3><p>${esc(door.use || door.bestFor || '')}</p><a class="btn alt" href="${esc(door.url)}">Open Actual File</a></article>`).join('');
  const people = (peopleIndex.people || []).slice(0, 8).map(person => `<article class="card redline"><span class="label">${esc(person.evidenceClass)}</span><h3>${esc(person.name)}</h3><p><strong>Network function:</strong> ${esc(person.networkFunction)}</p><p><strong>Does not prove:</strong> ${esc(person.boundary)}</p></article>`).join('');
  return `<section id="premier-epstein-command-center" class="section wrap"><h2>Epstein Command Center: Source First, Claim Second</h2><p class="lead">This command center exposes the network through records: court filings, testimony, emails, flight/contact records, settlements, oversight, actual source doors, and named evidence boundaries.</p><div class="cta-row"><a class="btn" href="daily-drop.html">Today’s Drop</a><a class="btn alt" href="network-search.html">Search People / Entities</a><a class="btn alt" href="downloads/network-search.json">Network Data</a><a class="btn alt" href="downloads/daily-drop.json">Daily Drop Data</a></div></section><section id="epstein-record-proves" class="section wrap"><h2>What The Record Proves / Does Not Prove</h2>${evidenceBox({ evidenceLevel:'Public-record command center', recordShows:'The page tracks source doors, legal movement, named record items, evidence classes, and network functions.', evidenceBoundary:'A name, contact, email, settlement, flight record, testimony reference, or news report is not automatic proof of criminal wrongdoing.' })}</section><section id="epstein-weekly-bulletins" class="section wrap"><h2>This Week In The Epstein Files</h2><div class="grid">${bulletins}</div></section><section id="epstein-top-file-doors" class="section wrap"><h2>Actual Files First</h2><p class="lead">Open primary doors before commentary. These links are evidence doors, not automatic verdicts.</p><div class="grid">${fileDoors}</div></section><section id="epstein-network-snapshot" class="section wrap"><h2>Network Function Snapshot</h2><div class="grid">${people}</div></section>`;
}

function patchPage(file, marker, section) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes(marker)) return;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(p, html);
}
function addToSitemap(files) {
  const p = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(p)) return;
  let xml = fs.readFileSync(p, 'utf8');
  const add = files.filter(f => !xml.includes(`/${f}</loc>`)).map(f => `  <url><loc>https://matrixreprogrammed.com/${f}</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>0.97</priority></url>`).join('\n');
  if (add) fs.writeFileSync(p, xml.replace('</urlset>', `${add}\n</urlset>`));
}
function patchLlms(files) {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return;
  let txt = fs.readFileSync(p, 'utf8');
  const block = `\n\nPremier Resource Upgrade:\n- /daily-drop.html: daily public-record source-watch room for what changed, source pull status, Epstein file movement, evidence boundaries, free briefs, and book routes.\n- /network-search.html: searchable people/entity database with evidence classes, record functions, source buttons, and association boundaries.\n- /downloads/daily-drop.json: machine-readable daily drop.\n- /downloads/network-search.json: machine-readable people/entity board.\n`;
  if (!txt.includes('/daily-drop.html')) fs.writeFileSync(p, `${txt.trim()}${block}`);
}
function patchSearchIndex() {
  const p = path.join(root, 'search-index.json');
  if (!fs.existsSync(p)) return;
  const index = JSON.parse(fs.readFileSync(p, 'utf8'));
  const existing = new Set(index.map(item => item.url));
  if (!existing.has('daily-drop.html')) index.push({ key:'daily-drop-room', title:'Daily Drop Room', subtitle:'What changed today', series:'Matrix Reprogrammed', category:'Daily Intelligence', url:'daily-drop.html', description:'Daily public-record source-watch room for Epstein files, elite networks, evidence boundaries, and reader routes.', keywords:['daily drop','Epstein files','live intel','public records','source watch','elite wrongdoing','evidence boundary'] });
  if (!existing.has('network-search.html')) index.push({ key:'network-search', title:'Network Search', subtitle:'People entities records boundaries', series:'Matrix Reprogrammed', category:'Network Database', url:'network-search.html', description:'Searchable people/entity database with evidence classes, public-record functions, and source buttons.', keywords:['network search','people tracker','Epstein','entity database','evidence class','public records','source buttons'] });
  fs.writeFileSync(p, JSON.stringify(index, null, 2));
}

buildDailyDrop();
buildNetworkSearch();
patchPage('epstein-files.html', 'id="premier-epstein-command-center"', commandCenterPatch());
const homepagePatch = `<section id="daily-drop-command-route" class="section wrap"><h2>Daily Drop / Command Center</h2><p class="lead">Return here daily for source-watch changes, Epstein file movement, evidence-class badges, people/entity updates, actual source doors, free briefs, and book routes.</p><div class="cta-row"><a class="btn" href="daily-drop.html">Open Today’s Drop</a><a class="btn alt" href="network-search.html">Search The Network</a><a class="btn alt" href="epstein-files.html#premier-epstein-command-center">Epstein Command Center</a><a class="btn alt" href="downloads/daily-drop.json">Daily Drop Data</a></div></section>`;
for (const file of ['index.html','live-intel.html','evidence-vault.html','download-center.html','books.html']) patchPage(file, 'id="daily-drop-command-route"', homepagePatch);
addToSitemap(['daily-drop.html','network-search.html']);
patchLlms(['daily-drop.html','network-search.html']);
patchSearchIndex();
console.log(`Premier resource upgrade built: daily-drop.html, network-search.html, Epstein command center patch, downloads, sitemap, llms, and search index.`);
