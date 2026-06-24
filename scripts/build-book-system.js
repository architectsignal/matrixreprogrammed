const fs = require('fs');
const path = require('path');

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));
const books = [...data.books]
  .filter(book => book.status !== 'planned' && book.status !== 'unpublished')
  .sort((a, b) => (b.priority || 0) - (a.priority || 0));

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function urlFor(book) { return book.generatedUrl || book.localUrl || 'books.html'; }
function byKey(key) { return books.find(b => b.key === key); }
function pick(keys) { return keys.map(byKey).filter(Boolean); }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="search.html">Search</a><a href="news.html">Intel Desk</a><a href="timers.html">Timers</a><a href="forum.html">Signal Board</a><a href="black-file.html">Black File</a><a href="transmissions.html">Rumble</a></nav></header>`;
}
function layout({ title, description, body, extraHead = '', extraScripts = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${extraHead}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Speculative dashboards, public-record investigation, symbolic analysis, esoteric commentary, fiction, and author interpretation are separated where needed. Risk timers are not predictions, advice, or claims of certainty.</p></footer></div><script src="matrix.js"></script>${extraScripts}</body></html>`;
}
function amazonButtons(book) {
  const parts = [];
  if (book.amazonUs) parts.push(`<a class="btn" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon US</a>`);
  if (book.amazonUk) parts.push(`<a class="btn alt" href="${esc(book.amazonUk)}" target="_blank" rel="noopener">Amazon UK</a>`);
  parts.push(`<a class="btn alt" href="start-here.html">Reader Paths</a>`);
  parts.push(`<a class="btn alt" href="black-file.html">Black File</a>`);
  return `<div class="cta-row">${parts.join('')}</div>`;
}
function bookCard(book, pill = book.category) {
  const buy = book.amazonUs ? `<a class="btn alt" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon</a>` : '';
  return `<article class="card book-card" data-category="${esc(book.category)}"><div><div class="pill">${esc(pill)}</div><h3>${esc(book.title)}</h3><p>${esc(book.subtitle || book.description)}</p><p>${(book.keywords || []).slice(0, 7).map(k => `<span class="pill">${esc(k)}</span>`).join('')}</p></div><div class="cta-row small"><a class="btn" href="${esc(urlFor(book))}">Open Door</a>${buy}</div></article>`;
}
function relatedCards(book) {
  const related = (book.related || []).map(byKey).filter(Boolean).slice(0, 4);
  if (!related.length) return '';
  return `<section class="section wrap"><h2>Related Doors</h2><div class="grid">${related.map(b => bookCard(b)).join('')}</div></section>`;
}

for (const book of books) {
  const schema = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Book', name: book.title, author: { '@type': 'Person', name: 'Nicholas Matthews' }, publisher: { '@type': 'Organization', name: 'Matrix Reprogrammed' }, description: book.description, url: `https://matrixreprogrammed.com/${urlFor(book)}` })}</script>`;
  const body = `<main><section class="hero wrap"><div class="eyebrow">${esc(book.series)}</div><h1>${esc(book.title)}</h1><p class="lead">${esc(book.subtitle || book.description)}</p>${amazonButtons(book)}</section><section class="section wrap split"><div class="terminal">READER PATH\n&gt; ${esc(book.readerPath || 'Open this door if it matches the signal you are following.')}\n&gt; Category: ${esc(book.category)}\n&gt; Series: ${esc(book.series)}\n&gt; Archive route: ${esc(book.key)}</div><aside class="card redline"><h2>Why This Book</h2><p>${esc(book.description)}</p><p>${(book.keywords || []).slice(0, 10).map(k => `<span class="pill">${esc(k)}</span>`).join('')}</p></aside></section>${relatedCards(book)}</main>`;
  fs.writeFileSync(path.join(root, book.generatedUrl), layout({ title: `${book.title} | Matrix Reprogrammed`, description: book.description, body, extraHead: schema }));
}

const grouped = books.reduce((acc, book) => { const group = book.series || book.category || 'Archive'; (acc[group] ||= []).push(book); return acc; }, {});
const archiveBody = `<main><section class="hero wrap"><div class="eyebrow">Database-driven archive</div><h1>THE BOOK ARCHIVE</h1><p class="lead">Every confirmed Matrix Reprogrammed doorway in one place: D.O.G The Architect, Intelligence Dossiers, Crime Dossiers, Contractor Dossiers, Masonic/esoteric work, survival, psychology, and control-system books.</p><div class="cta-row"><a class="btn" href="start-here.html">Start Here</a><a class="btn alt" href="search.html">Search Archive</a><a class="btn alt" href="timers.html">Risk Timers</a><a class="btn alt" href="news.html">Intel Desk</a><a class="btn alt" href="black-file.html">Black File</a></div></section><section class="section wrap split"><div class="terminal">ARCHIVE STATUS\n&gt; Source: data/books.json\n&gt; Live generated pages: ${books.length}\n&gt; Search index: active\n&gt; Reader paths: active\n&gt; Risk timers: active\n&gt; Black File funnel: active</div><aside class="card redline"><h2>How To Use This Archive</h2><p>Pick a confirmed doorway, follow the reader path, then move sideways through related books. The archive is designed as a system, not a shelf.</p></aside></section>${Object.entries(grouped).map(([group, list]) => `<section class="section wrap"><h2>${esc(group)}</h2><div class="grid">${list.map(b => bookCard(b)).join('')}</div></section>`).join('')}</main>`;
fs.writeFileSync(path.join(root, 'books.html'), layout({ title: 'Matrix Reprogrammed Book Archive', description: 'The Matrix Reprogrammed database-driven book archive.', body: archiveBody }));

const searchIndex = books.map(book => ({ key: book.key, title: book.title, subtitle: book.subtitle, series: book.series, category: book.category, url: urlFor(book), description: book.description, keywords: book.keywords || [] }));
fs.writeFileSync(path.join(root, 'search-index.json'), JSON.stringify(searchIndex, null, 2));
const searchBody = `<main><section class="hero wrap"><div class="eyebrow">Archive Search</div><h1>SEARCH THE SIGNAL.</h1><p class="lead">Search by title, topic, series, category, or keyword.</p><div class="wrap"><input id="archive-search" type="search" placeholder="Search: CIA, Gaza, masonic, cartels, AI, vaccines, WWIII, symbols..." /></div></section><section class="section wrap"><p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div></section></main>`;
fs.writeFileSync(path.join(root, 'search.html'), layout({ title: 'Search the Archive | Matrix Reprogrammed', description: 'Search Matrix Reprogrammed books and reader paths.', body: searchBody, extraScripts: '<script src="search.js"></script>' }));
fs.writeFileSync(path.join(root, 'search.js'), `(function(){const input=document.getElementById('archive-search'),results=document.getElementById('search-results'),count=document.getElementById('search-count');if(!input||!results)return;function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}function render(items){count.textContent=items.length+' archive door'+(items.length===1?'':'s')+' shown';results.innerHTML=items.map(b=>'<article class="card"><span class="label">'+esc(b.category)+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description)+'</p><p>'+((b.keywords||[]).slice(0,8).map(k=>'<span class="pill">'+esc(k)+'</span>').join(''))+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');}fetch('search-index.json').then(r=>r.json()).then(data=>{function run(){const q=input.value.trim().toLowerCase();render(!q?data:data.filter(b=>[b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q)));}input.addEventListener('input',run);render(data);});})();`);

const startCards = [
  ['D.O.G / Mystery Tradition', 'Symbol, temple, initiation, machine age, mystery-school architecture.', ['as-above-so-below','symbol','masonic-architecture-33','black-file']],
  ['Intelligence Agencies', 'CIA, NSA, GCHQ, MI6, Mossad, KGB, FSB, surveillance, covert action, and oversight failure.', ['cia','nsa','gchq','mi6','mossad','kgb','fsb']],
  ['Crime Networks', 'Cartels, mafia, underground banking, laundering, ports, biker groups, prison power, and crime-state overlap.', ['albanian-mafia','ndrangheta','cartels','triad','outlaws','ab-the-brand']],
  ['Masonic / Esoteric Path', 'Start with symbols, then move through the Scottish Rite degrees and institutional architecture.', ['symbol','degree-1','degree-13','degree-18','degree-30','degree-31','degree-32','degree-33']],
  ['War / Collapse / Survival', 'WWIII, water, fire, shelter, drone defence, panic control, and system shock.', ['wwiii','keep-calm','water','fire','earth','drone-defence']],
  ['Control Systems', 'Law, medicine, schooling, crisis dialectics, surveillance, CBDC logic, and hidden power machinery.', ['law','medicine','schooling','hegelian-crisis-dialectic','power-overlap','elite-toolkit']],
  ['Mind / Influence / Deprogramming', 'Identity, manipulation, dark psychology defence, reading people, and subconscious loops.', ['identity-trap','interruption','automatic','read-people','spot-narcissist','spot-manipulator','dark-arts-codex']],
  ['Everything At Once', 'The full map for readers who want the whole machine in one route.', ['black-file','elite-toolkit','power-overlap','as-above-so-below','timers']]
];
function pathCard([title, desc, keys]) { return `<article class="card"><h2>${esc(title)}</h2><p>${esc(desc)}</p>${keys.map(key => key === 'timers' ? { title: 'The Countdown Room', generatedUrl: 'timers.html' } : byKey(key)).filter(Boolean).map(b => `<p><a class="btn" href="${esc(urlFor(b))}">${esc(b.title)}</a></p>`).join('')}</article>`; }
const startBody = `<main><section class="hero wrap"><div class="eyebrow">Start Here</div><h1>CHOOSE YOUR DOOR.</h1><p class="lead">The archive is large by design. Pick the signal you are trying to understand and enter through the correct reader path.</p><div class="cta-row"><a class="btn" href="black-file.html">Open The Black File</a><a class="btn alt" href="timers.html">Risk Timers</a><a class="btn alt" href="search.html">Search Archive</a><a class="btn alt" href="news.html">Intel Desk</a></div></section><section class="section wrap grid">${startCards.map(pathCard).join('')}</section></main>`;
fs.writeFileSync(path.join(root, 'start-here.html'), layout({ title: 'Start Here | Matrix Reprogrammed', description: 'Choose the right Matrix Reprogrammed reader path: D.O.G, intelligence, crime, Masonic/esoteric, war, control systems, psychology, or the full Black File.', body: startBody }));

const timerData = [
  ['WWIII Escalation Clock',72,'Elevated','3–18 months','Ukraine, Gaza, Iran, Taiwan, Red Sea, nuclear rhetoric, sanctions, and alliance movement.','book-wwiii.html'],
  ['AI Breakout Clock',81,'High','2–15 years','Autonomous agents, military AI, labor displacement, model jumps, and regulatory panic.','book-as-above-so-below.html'],
  ['Surveillance State Clock',87,'Active','Already underway','Digital ID, facial recognition, censorship law, platform control, biometrics, and payment monitoring.','book-law.html'],
  ['Financial Reset Clock',64,'Elevated','6–36 months','Debt stress, bank instability, CBDC pilots, emergency central-bank action, gold movement, and bond pressure.','book-elite-toolkit.html'],
  ['CBDC Rollout Clock',76,'Active','0–5 years','Central-bank pilots, digital ID pairing, programmable-money language, and payment rails.','book-power-overlap.html'],
  ['Cyber Blackout Clock',43,'Watch','1–5 years','Grid warnings, ransomware, banking outages, state-backed cyber alerts, and telecom fragility.','book-cia.html'],
  ['Alien Disclosure Clock',31,'Watch','1–10 years','UAP hearings, whistleblower claims, NASA/DoD statements, anomalous object reports, and scientific shifts.','black-file.html'],
  ['Pandemic / Biosecurity Clock',29,'Watch','Unknown','WHO alerts, bird flu, lab-leak arguments, emergency planning, contracts, and biosecurity exercises.','news.html#vaccines'],
  ['Civil Unrest Clock',61,'Elevated','0–24 months','Elections, migration pressure, policing escalation, protests, censorship, and emergency laws.','book-keep-calm.html'],
  ['Food System Stress Clock',52,'Watch','1–3 years','Crop failure, fertilizer stress, export bans, livestock disease, water scarcity, and price shocks.','book-water.html'],
  ['Energy Shock Clock',58,'Elevated','6–24 months','Oil chokepoints, LNG stress, refinery outages, sanctions, grid strain, and Hormuz/Red Sea pressure.','book-fire.html'],
  ['Machine Convergence',73,'Classified','7 years 4 months','Hidden composite index. No public explanation.','black-file.html']
];
const timerCards = timerData.map(([name, score, status, window, signals, link]) => `<article class="card redline"><div class="pill">${esc(status)}</div><h2>${esc(name)}</h2><div class="metric"><strong>${esc(score)}%</strong><span>Speculative pressure score</span></div><p><strong>Estimated window:</strong> ${esc(window)}</p><p>${esc(signals)}</p><div class="terminal">SIGNALS INCREASING RISK\n&gt; Source-led updates\n&gt; Public-record movement\n&gt; Institutional panic\n&gt; Infrastructure stress\n&gt; Narrative acceleration\n\nSIGNALS REDUCING RISK\n&gt; De-escalation\n&gt; Oversight\n&gt; Transparency\n&gt; Market normalization\n&gt; Verified correction</div><a class="btn" href="${esc(link)}">Open Reader Path</a></article>`).join('');
const timersBody = `<main><section class="hero wrap"><div class="eyebrow">The Countdown Room</div><h1>DOOMSDAY IS A DASHBOARD.</h1><p class="lead">Speculative risk clocks based on public signals. These are not prophecies, claims of certainty, financial advice, medical advice, military advice, or legal advice. They are narrative pressure gauges for the Matrix Reprogrammed archive.</p><div class="cta-row"><a class="btn" href="news.html">Intel Desk</a><a class="btn alt" href="book-wwiii.html">WWIII Reader Path</a><a class="btn alt" href="black-file.html">Black File</a></div></section><section class="section wrap split"><div class="terminal">TIMER RULES\n&gt; Score = speculative pressure index\n&gt; Window = estimated narrative window\n&gt; Movement should be updated from sourced public signals\n&gt; No fake live counters\n&gt; No certainty language\n&gt; Every timer routes to a book path</div><aside class="card redline"><h2>Risk Scale</h2><p>0–25 Low · 26–50 Watch · 51–70 Elevated · 71–85 High · 86–100 Critical</p></aside></section><section class="section wrap"><h2>Global Risk Clocks</h2><div class="grid">${timerCards}</div></section></main>`;
fs.writeFileSync(path.join(root, 'timers.html'), layout({ title: 'The Countdown Room | Matrix Reprogrammed', description: 'Speculative Matrix Reprogrammed risk clocks for WWIII, AI, financial reset, surveillance, CBDCs, cyber blackout, alien disclosure, pandemic risk, food, energy, civil unrest, and machine convergence.', body: timersBody }));

console.log(`Built ${books.length} book pages, archive, start paths, search, and timers.`);
