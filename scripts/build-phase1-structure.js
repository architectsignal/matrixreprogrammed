const fs = require('fs');
const path = require('path');

const root = process.cwd();
const booksData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));
const bulletinsData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'bulletins.json'), 'utf8'));
const humanCostData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'human-cost.json'), 'utf8'));
const books = booksData.books.filter(book => book.status !== 'planned' && book.status !== 'unpublished');

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function byKey(key) { return books.find(book => book.key === key); }
function urlFor(book) { return book && (book.generatedUrl || book.localUrl || 'books.html'); }
function sourceList(sources = []) { return sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · '); }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="power-atlas.html">Power Atlas</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a><a href="timers.html">Timers</a><a href="videos.html">Videos</a><a href="black-file.html">Black File</a></nav></header>`;
}
function layout({ title, description, body, schema = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${schema}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Evidence boundary: association is not guilt, mention is not proof, and symbolic commentary is interpretation. Confirmed records, court records, sworn claims, credible reporting, documented associations, disputed claims, and unsupported viral claims are separated.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function articleSchema(name, desc) {
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: name, description: desc, author: { '@type': 'Person', name: 'Nicholas Matthews' }, publisher: { '@type': 'Organization', name: 'Matrix Reprogrammed' }, dateModified: '2026-06-24' })}</script>`;
}
function bookButton(key, label) {
  const book = byKey(key);
  return book ? `<a class="btn alt" href="${esc(urlFor(book))}">${esc(label || book.title)}</a>` : '';
}
function bookCard(key, label) {
  const book = byKey(key);
  if (!book) return '';
  return `<article class="card"><span class="label">${esc(book.category)}</span><h3>${esc(label || book.title)}</h3><p>${esc(book.description)}</p><a class="btn" href="${esc(urlFor(book))}">Open Book Path</a></article>`;
}
function addPagesToSitemap(files) {
  const sitemapPath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const additions = files.filter(file => !xml.includes(`/${file}</loc>`)).map(file => `  <url><loc>https://matrixreprogrammed.com/${file}</loc><lastmod>2026-06-24</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`).join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}
function patchHome() {
  const homePath = path.join(root, 'index.html');
  if (!fs.existsSync(homePath)) return;
  let html = fs.readFileSync(homePath, 'utf8');
  if (html.includes('id="phase-one-structure"')) return;
  const section = `<section id="phase-one-structure" class="section wrap"><h2>The Public-Record Power Machine</h2><p class="lead">Matrix Reprogrammed is now structured as an elite-exposure archive: Power Atlas, Evidence Vault, Intel Desk, Human Cost, Network Maps, Book Archive, AI Answer Index, and Black File funnel.</p><div class="grid"><article class="card redline"><span class="label">Core Upgrade</span><h3>Power Atlas</h3><p>The main map of people, institutions, operations, money lanes, legal records, media power, symbolic claims, and evidence ratings.</p><a class="btn" href="power-atlas.html">Open Power Atlas</a></article><article class="card"><span class="label">Source Layer</span><h3>Evidence Vault</h3><p>The source library for court records, declassified files, official reports, financial records, intelligence archives, and public datasets.</p><a class="btn" href="evidence-vault.html">Open Evidence Vault</a></article><article class="card"><span class="label">Trust Layer</span><h3>Evidence Policy</h3><p>The rules that keep the archive dark, aggressive, and defensible: association is not guilt, symbolism is commentary, and unsupported claims are quarantined.</p><a class="btn" href="evidence-policy.html">Read Evidence Policy</a></article><article class="card"><span class="label">Map Layer</span><h3>Network Maps</h3><p>Relationship maps for intelligence, crime-state overlap, war machinery, money flows, Epstein records, and secret-society symbolism.</p><a class="btn" href="network-maps.html">Open Network Maps</a></article></div></section>`;
  html = html.replace('<section class="section wrap"><div class="card redline"><h2>Join The Signal</h2>', `${section}<section class="section wrap"><div class="card redline"><h2>Join The Signal</h2>`);
  fs.writeFileSync(homePath, html);
}
function patchStartHere() {
  const file = path.join(root, 'start-here.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('id="phase-one-paths"')) return;
  const section = `<section id="phase-one-paths" class="section wrap"><h2>Phase One Structure</h2><p class="lead">Use these doors when you want the whole system instead of one book lane.</p><div class="grid"><article class="card redline"><h3>Power Atlas</h3><p>Start here for elite-network mapping by person, institution, operation, money flow, legal record, and evidence class.</p><a class="btn" href="power-atlas.html">Open Atlas</a></article><article class="card"><h3>Evidence Vault</h3><p>Start here for source records, documents, official pages, court lanes, and archive hubs.</p><a class="btn" href="evidence-vault.html">Open Vault</a></article><article class="card"><h3>Evidence Policy</h3><p>Read the rating system before following dark claims, symbolic claims, or disputed public-record lanes.</p><a class="btn" href="evidence-policy.html">Read Policy</a></article></div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(file, html);
}

const evidenceClasses = [
  ['Confirmed Record', 'Official source, agency page, government report, public register, primary document, or direct institutional record.'],
  ['Court Record', 'Filing, exhibit, indictment, judgment, deposition, transcript, or docket material.'],
  ['Sworn Claim', 'Testimony, affidavit, or sworn statement. Logged as claim unless adjudicated or independently supported.'],
  ['Credible Reporting', 'Reputable sourced journalism or investigation with named sources, documents, or editorial accountability.'],
  ['Documented Association', 'Contact, employment, board membership, donation, travel, meeting, photograph, address book listing, or shared institution. Not guilt.'],
  ['Disputed Claim', 'A contested, denied, incomplete, or conflicting claim. Presented with the dispute visible.'],
  ['Symbolic Commentary', 'Logo, ritual language, fraternal symbolism, occult aesthetics, patch analysis, hand sign, or pattern reading. Interpretive only.'],
  ['Unsupported Viral Claim', 'Quarantined, debunked, or flagged as unverified. Never presented as fact.']
];
const atlasLayers = [
  ['People', 'politicians, financiers, intelligence figures, media owners, contractors, scientists, judges, lobbyists, fixers, and public institutional actors'],
  ['Institutions', 'agencies, NGOs, banks, foundations, universities, media groups, courts, contractors, think tanks, and standards bodies'],
  ['Operations', 'wars, scandals, trials, covert projects, sanctions, intelligence programs, procurement lanes, and public investigations'],
  ['Money Flows', 'donations, contracts, grants, lobbying, foundations, procurement, shell structures, settlements, fines, and compensation schemes'],
  ['Legal Records', 'indictments, civil suits, depositions, hearings, exhibits, judgments, congressional records, FOIA releases, and regulator findings'],
  ['Symbolic Layer', 'mission patches, logos, ritual architecture, fraternal claims, occult aesthetics, language systems, and public symbolism'],
  ['Human Cost', 'civilian casualties, migration, exploitation, vaccine compensation, displacement, food stress, medical collapse, and war effects']
];
const atlasCards = atlasLayers.map(([title, desc]) => `<article class="card"><span class="label">Atlas Layer</span><h3>${esc(title)}</h3><p>${esc(desc)}.</p></article>`).join('');
const evidenceCards = evidenceClasses.map(([title, desc]) => `<article class="card"><span class="label">Evidence Rating</span><h3>${esc(title)}</h3><p>${esc(desc)}</p></article>`).join('');
const latest = bulletinsData.bulletins.slice(0, 4);
const latestCards = latest.map(b => `<article class="news-item redline"><span class="label">${esc(b.label)} · ${esc(b.date)}</span><h3>${esc(b.headline)}</h3><p>${esc(b.summary)}</p><p><strong>Evidence lane:</strong> ${esc(b.why)}</p><p class="source-list">${sourceList(b.sources)}</p><a class="btn" href="${esc(b.path)}">Open Related Path</a></article>`).join('');
const humanCards = humanCostData.panels.slice(0, 6).map(p => `<div class="metric"><strong>${esc(p.figure)}</strong><span><b>${esc(p.title)}</b><br>${esc(p.description)}<em>${esc(p.sourceLabel)}</em></span></div>`).join('');

const powerAtlasBody = `<main><section class="hero wrap"><div class="eyebrow">Power Atlas</div><h1>THE PUBLIC-RECORD MAP OF HIDDEN POWER.</h1><p class="lead">The Power Atlas organizes elite exposure by people, institutions, operations, money flows, legal records, symbolic systems, and human cost. It is designed to be darker than mainstream media and cleaner than conspiracy media.</p><div class="cta-row"><a class="btn" href="evidence-vault.html">Open Evidence Vault</a><a class="btn alt" href="network-maps.html">Network Maps</a><a class="btn alt" href="news.html">Latest Intel</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a></div></section><section class="section wrap split"><div class="terminal">POWER ATLAS METHOD\n&gt; Person, institution, operation, money, legal, symbolic, human-cost layers\n&gt; Every dark claim gets an evidence rating\n&gt; Association is not guilt\n&gt; Symbolism is commentary unless supported by records\n&gt; Books become reader paths\n&gt; Intel Desk updates become dated signal cards\n&gt; Evidence Vault stores source lanes</div><aside class="card redline"><h2>Elite Exposure Rule</h2><p>The site should expose systems, not throw unsupported accusations. The stronger the claim, the stronger the source must be.</p><div class="cta-row small">${bookButton('elite-toolkit', 'Elite Toolkit')}${bookButton('power-overlap', 'Power Overlap')}${bookButton('as-above-so-below', 'D.O.G')}</div></aside></section><section class="section wrap"><h2>Atlas Layers</h2><p class="lead">Every future entity page should attach to one or more of these layers.</p><div class="grid">${atlasCards}</div></section><section class="section wrap"><h2>Primary Reader Routes</h2><div class="grid">${bookCard('elite-toolkit')}${bookCard('power-overlap')}${bookCard('cia')}${bookCard('albanian-mafia')}${bookCard('blackwater')}${bookCard('symbol')}${bookCard('as-above-so-below')}</div></section><section class="section wrap"><h2>Latest Signals Into The Atlas</h2><p class="lead">Intel Desk items become dated signal cards that point into the atlas rather than disappearing into a feed.</p><div class="grid">${latestCards}</div></section><section class="section wrap"><h2>Human Cost Feed</h2><p class="lead">The atlas tracks power by consequence: deaths, displacement, compensation, migration, exploitation, and institutional harm.</p><div class="metric-grid">${humanCards}</div></section></main>`;
fs.writeFileSync(path.join(root, 'power-atlas.html'), layout({ title: 'Power Atlas | Matrix Reprogrammed', description: 'The Matrix Reprogrammed public-record Power Atlas mapping people, institutions, operations, money flows, legal records, symbolic systems, and human cost.', body: powerAtlasBody, schema: articleSchema('Power Atlas', 'Public-record map of hidden power.') }));

const vaultSections = [
  ['Court Records', 'Filing lanes, dockets, indictments, exhibits, judgments, depositions, and legal archives.', ['epstein-files.html', 'book-cia.html', 'book-power-overlap.html']],
  ['Declassified Files', 'CIA Reading Room, FBI Vault, NARA, ODNI, national archives, congressional releases, and historical files.', ['book-cia.html', 'book-nsa.html', 'book-false-flags.html']],
  ['Financial Records', 'Sanctions, contracts, fines, settlements, lobbying, grants, procurement, and foundation links.', ['book-elite-toolkit.html', 'book-power-overlap.html', 'dashboard-human-cost.html']],
  ['Intelligence Archives', 'Agency records, oversight reports, commissions, leaks with provenance, and source-watch pages.', ['intelligence-hub.html', 'news.html', 'intel-archive.html']],
  ['Human Cost Sources', 'Conflict, displacement, migration, medical claims, vaccine compensation, food stress, and exploitation metrics.', ['news.html#human-cost', 'dashboard-human-cost.html', 'dashboard-migration.html']],
  ['Symbolic / Fraternal Records', 'Public lodge material, biographies, institutional records, mission patches, logos, and symbolism notes.', ['secret-societies-hub.html', 'book-symbol.html', 'book-as-above-so-below.html']]
];
const vaultCards = vaultSections.map(([title, desc, links]) => `<article class="card"><span class="label">Vault Lane</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><div class="cta-row small">${links.map((link, i) => `<a class="btn${i ? ' alt' : ''}" href="${esc(link)}">${i ? 'Related' : 'Open'}</a>`).join('')}</div></article>`).join('');
const vaultBody = `<main><section class="hero wrap"><div class="eyebrow">Evidence Vault</div><h1>SOURCES BEFORE SIGNALS.</h1><p class="lead">The Evidence Vault is the credibility layer behind Matrix Reprogrammed: court records, declassified files, official reports, financial records, intelligence archives, public datasets, and source hubs.</p><div class="cta-row"><a class="btn" href="evidence-policy.html">Evidence Policy</a><a class="btn alt" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="intel-archive.html">Bulletin Archive</a><a class="btn alt" href="black-file-index.html">Black File Index</a></div></section><section class="section wrap split"><div class="terminal">VAULT RULES\n&gt; Source before claim\n&gt; Date every record\n&gt; Keep estimates separate from confirmed records\n&gt; Separate allegation from adjudicated fact\n&gt; Preserve victim privacy\n&gt; Link source lanes back to books and atlas nodes\n&gt; Corrections improve the archive</div><aside class="card redline"><h2>Archive Standard</h2><p>The vault is not decoration. It is the proof layer that lets the site go deep without collapsing into rumor.</p></aside></section><section class="section wrap"><h2>Vault Lanes</h2><div class="grid">${vaultCards}</div></section><section class="section wrap"><h2>Evidence Ratings</h2><p class="lead">These labels should appear across every serious article, atlas node, and source card.</p><div class="grid">${evidenceCards}</div></section></main>`;
fs.writeFileSync(path.join(root, 'evidence-vault.html'), layout({ title: 'Evidence Vault | Matrix Reprogrammed', description: 'Matrix Reprogrammed source library for court records, declassified files, official reports, financial records, intelligence archives, public datasets, and evidence ratings.', body: vaultBody, schema: articleSchema('Evidence Vault', 'Source library and evidence layer.') }));

const policyBody = `<main><section class="hero wrap"><div class="eyebrow">Evidence Policy</div><h1>DARK CLAIMS NEED CLEAN SOURCES.</h1><p class="lead">Matrix Reprogrammed exposes systems while keeping clear boundaries between confirmed records, legal records, sworn claims, credible reporting, documented association, disputed claims, symbolic commentary, and unsupported viral claims.</p><div class="cta-row"><a class="btn" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="news.html">Intel Desk</a></div></section><section class="section wrap"><h2>Evidence Ratings</h2><div class="grid">${evidenceCards}</div></section><section class="section wrap split"><div class="terminal">PUBLICATION BOUNDARY\n&gt; Association is not guilt\n&gt; A name in a record is not proof of wrongdoing\n&gt; A photograph is not proof of participation\n&gt; A symbol is not proof of conspiracy\n&gt; Sworn claims are claims until proven or corroborated\n&gt; Victim privacy comes first\n&gt; Unsupported viral claims are quarantined or rejected\n&gt; Corrections are part of the system</div><aside class="card redline"><h2>Corrections Rule</h2><p>If a source is wrong, outdated, misread, or missing context, the archive should be corrected. The goal is not to win a rumor. The goal is to build the strongest resource.</p></aside></section><section class="section wrap"><h2>Source Hierarchy</h2><div class="grid"><article class="card"><h3>Primary Sources</h3><p>Official documents, court filings, regulator records, public registers, declassified files, agency pages, and direct records.</p></article><article class="card"><h3>Secondary Sources</h3><p>Credible reporting, books with citations, academic work, public-interest investigations, and official summaries.</p></article><article class="card"><h3>Interpretive Layer</h3><p>Symbolic reading, esoteric commentary, pattern analysis, historical analogy, and speculative framing must stay labeled.</p></article></div></section></main>`;
fs.writeFileSync(path.join(root, 'evidence-policy.html'), layout({ title: 'Evidence Policy | Matrix Reprogrammed', description: 'Matrix Reprogrammed evidence rating system and source policy for public-record investigation, elite exposure, symbolic commentary, and disputed claims.', body: policyBody, schema: articleSchema('Evidence Policy', 'Evidence rating system and source policy.') }));

const mapTypes = [
  ['Agency Map', 'CIA, NSA, GCHQ, MI6, Mossad, KGB, FSB, Five Eyes, liaison networks, oversight records, and contractor lanes.', ['book-cia.html', 'intelligence-hub.html']],
  ['Money Map', 'Contracts, grants, sanctions, fines, settlements, lobbying, foundations, donors, and public procurement.', ['book-elite-toolkit.html', 'book-power-overlap.html']],
  ['Crime-State Map', 'Organized crime, ports, banks, underground finance, logistics, corruption, and public-record cases.', ['crime-hub.html', 'book-cartels.html']],
  ['War Machine Map', 'States, contractors, weapons firms, intelligence, sanctions, NGOs, media narratives, and conflict consequences.', ['war-conflict-hub.html', 'book-blackwater.html']],
  ['Epstein Record Map', 'Court records, document drops, public associations, legal boundaries, institutions, and evidence classes.', ['epstein-files.html', 'answer-epstein-files.html']],
  ['Secret Society Map', 'Public members, symbols, rituals, fraternal records, institutional overlap, and symbolic commentary boundaries.', ['secret-societies-hub.html', 'book-symbol.html']]
];
const mapCards = mapTypes.map(([title, desc, links]) => `<article class="card redline"><span class="label">Map Type</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><div class="cta-row small">${links.map((link, i) => `<a class="btn${i ? ' alt' : ''}" href="${esc(link)}">${i ? 'Related Path' : 'Open Lane'}</a>`).join('')}</div></article>`).join('');
const mapsBody = `<main><section class="hero wrap"><div class="eyebrow">Network Maps</div><h1>NO RED STRING WITHOUT LABELS.</h1><p class="lead">Network Maps are the visual logic layer for Matrix Reprogrammed. Every line must mean something specific: funded, employed, met, named in court, shared board, documented contact, alleged, disputed, or symbolic commentary.</p><div class="cta-row"><a class="btn" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-policy.html">Evidence Rules</a><a class="btn alt" href="evidence-vault.html">Source Vault</a></div></section><section class="section wrap split"><div class="terminal">NETWORK LINE TYPES\n&gt; Worked for\n&gt; Funded\n&gt; Contracted with\n&gt; Board connection\n&gt; Met / documented contact\n&gt; Named in court record\n&gt; Sworn claim\n&gt; Credible reporting\n&gt; Disputed claim\n&gt; Symbolic similarity only</div><aside class="card"><h2>Map Rule</h2><p>A line without a meaning is decoration. A line with an evidence class becomes intelligence.</p></aside></section><section class="section wrap"><h2>Map Lanes</h2><div class="grid">${mapCards}</div></section></main>`;
fs.writeFileSync(path.join(root, 'network-maps.html'), layout({ title: 'Network Maps | Matrix Reprogrammed', description: 'Matrix Reprogrammed network map rules and map lanes for agency links, money flows, crime-state overlap, war machinery, Epstein records, and secret society symbolism.', body: mapsBody, schema: articleSchema('Network Maps', 'Network map rules and map lanes.') }));

patchHome();
patchStartHere();
addPagesToSitemap(['power-atlas.html', 'evidence-vault.html', 'evidence-policy.html', 'network-maps.html']);
const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  const insert = `\nPhase 1 structure pages:\n- /power-atlas.html: public-record map of people, institutions, operations, money flows, legal records, symbolic systems, and human cost.\n- /evidence-vault.html: source library for court records, declassified files, financial records, intelligence archives, public datasets, and evidence ratings.\n- /evidence-policy.html: evidence rating system and source boundary rules.\n- /network-maps.html: map lanes and relationship-line definitions for elite exposure research.\n`;
  if (!llms.includes('/power-atlas.html')) fs.writeFileSync(llmsPath, `${llms.trim()}\n${insert}`);
}
console.log('Built Phase 1 structure pages: Power Atlas, Evidence Vault, Evidence Policy, Network Maps, and homepage/start routing.');
