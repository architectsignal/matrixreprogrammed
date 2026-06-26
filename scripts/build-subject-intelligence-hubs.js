const fs = require('fs');
const path = require('path');

const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
const profilesPath = path.join(root, 'data', 'subject-intelligence-profiles.json');
if (!fs.existsSync(profilesPath)) {
  console.log('No data/subject-intelligence-profiles.json found. Skipping Subject Intelligence Hubs.');
  process.exit(0);
}
const profileData = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const liveIntel = readJson('data/live-intel.json', { items: [] });
const books = readJson('data/books.json', { books: [] }).books || [];
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value = '') { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function routeUrl(route = '') { const r = String(route || '').trim(); if (!r) return SITE; return /^https?:\/\//i.test(r) ? r : `${SITE}/${r.replace(/^\//, '')}`; }
function termsFor(profile) {
  return Array.from(new Set([profile.slug, profile.title, profile.label, profile.summary, ...(profile.keywords || []), ...(profile.relatedBookKeywords || []), ...(profile.mainPlayers || []), ...(profile.proofRoutes || [])]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 3)));
}
function scoreText(text, terms) {
  const hay = String(text || '').toLowerCase();
  return terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
}
function pickRelatedBooks(profile, limit = 6) {
  const terms = termsFor(profile);
  return books
    .map(book => ({ book, score: scoreText([book.title, book.subtitle, book.series, book.category, book.description, (book.keywords || []).join(' ')].join(' '), terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.book.priority || 0) - (a.book.priority || 0))
    .slice(0, limit)
    .map(x => x.book);
}
function pickLiveIntel(profile, limit = 6) {
  const terms = termsFor(profile);
  return (liveIntel.items || [])
    .map(item => ({ item, score: scoreText([item.lane, item.laneTitle, item.sourceLabel, item.title, item.summary, item.evidenceLevel, item.evidenceBoundary, item.nextAction, item.bookRoute, item.evidenceRoute].join(' '), terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.item);
}
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="subject-index.html">Subject Hubs</a><a href="download-center.html">Downloads</a><a href="source-document-vault.html">Sources</a><a href="claim-classifier.html">Claim Classifier</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a><a href="amazon-store-books.html">Store</a><a href="trust-center.html">Trust</a></nav></header>`;
}
function layout(title, desc, body, schema = {}) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description:desc,dateModified:new Date().toISOString(),...schema})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source routes, subject maps, evidence boundaries, and reader paths.</p><p class="warning">Subject hub boundary: a hub is an orientation route, not proof of guilt, causation, control, or hidden coordination.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function cardList(items = [], label = 'Item') {
  return items.map(item => `<article class="card"><span class="label">${esc(label)}</span><h3>${esc(item)}</h3></article>`).join('');
}
function routeCards(routes = []) {
  return routes.map(route => `<article class="card redline"><span class="label">Proof / Source Route</span><h3>${esc(route.replace(/^downloads\//, '').replace(/[-_]/g, ' ').replace(/\.html$|\.json$|\.pdf$/g, ''))}</h3><p>${esc(routeUrl(route))}</p><a class="btn alt" href="${esc(route)}">Open Route</a></article>`).join('');
}
function intelCards(items = []) {
  if (!items.length) return `<article class="card"><span class="label">No fresh subject match</span><h3>No matching live-intel item is attached yet</h3><p>The subject hub still has proof routes, PDF download, evidence boundaries, related books, and reader actions. This section updates when matching live-intel data appears.</p><a class="btn alt" href="live-intel.html">Open Live Intel</a></article>`;
  return items.map(item => `<article class="card redline"><span class="label">${esc(String(item.published || '').slice(0,10))} · ${esc(item.sourceLabel || item.laneTitle || 'Source')}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary || '')}</p><p><strong>Boundary:</strong> ${esc(item.evidenceBoundary || 'Open the source and classify the record before treating it as evidence.')}</p><div class="cta-row small"><a class="btn" href="${esc(item.url || 'live-intel.html')}">Open Source</a><a class="btn alt" href="${esc(item.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a></div></article>`).join('');
}
function bookCards(items = []) {
  if (!items.length) return `<article class="card"><span class="label">Related books</span><h3>No exact related-book match yet</h3><p>This hub still routes to the full Matrix Reprogrammed book library and Amazon store.</p><div class="cta-row small"><a class="btn" href="books.html">Books</a><a class="btn alt" href="amazon-store-books.html">Amazon Store</a></div></article>`;
  return items.map(book => `<article class="card redline"><span class="label">Related Book</span><h3>${esc(book.title)}</h3><p>${esc(book.description || book.subtitle || book.series || '')}</p><div class="cta-row small"><a class="btn" href="${esc(book.generatedUrl || 'books.html')}">Book Page</a>${book.amazonUs ? `<a class="btn alt" href="${esc(book.amazonUs)}">Amazon</a>` : `<a class="btn alt" href="amazon-store-books.html">Store</a>`}</div></article>`).join('');
}
function videoHook(profile) {
  return `Open with the subject question, show the strongest public source route first, name the evidence boundary, then send the viewer to ${routeUrl(`downloads/subject-${profile.slug}.pdf`)} for the mini-book.`;
}
function buildSubjectHub(profile) {
  const live = pickLiveIntel(profile);
  const related = pickRelatedBooks(profile);
  const file = `subject-${profile.slug}.html`;
  const pdf = `downloads/subject-${profile.slug}.pdf`;
  const body = `<main><section class="hero wrap"><div class="eyebrow">Subject Intelligence Hub</div><h1>${esc(profile.title)}</h1><p class="lead">${esc(profile.summary)}</p><div class="cta-row"><a class="btn" href="${esc(pdf)}">Download Subject PDF</a><a class="btn alt" href="source-document-vault.html">Source Vault</a><a class="btn alt" href="claim-classifier.html">Classify Claim</a><a class="btn alt" href="amazon-store-books.html">Amazon Store</a></div></section><section class="section wrap split"><div class="terminal">SUBJECT HUB STATUS\n&gt; Profile: ${esc(profile.slug)}\n&gt; Subject PDF: ${esc(pdf)}\n&gt; Proof routes: ${(profile.proofRoutes || []).length}\n&gt; Main players/entities: ${(profile.mainPlayers || []).length}\n&gt; Live-intel matches: ${live.length}\n&gt; Related books: ${related.length}\n&gt; Boundary: source first / claim second</div><aside class="card redline"><h2>Evidence Boundary</h2><p>This page is a subject route. It does not convert association, symbolism, search hits, or reporting into proof. Use the proof routes and claim classifier before repeating conclusions.</p></aside></section><section class="section wrap"><h2>Subject Overview</h2><article class="card redline"><p>${esc(profile.summary)}</p></article></section><section class="section wrap"><h2>Main Players / Entities</h2><div class="grid">${cardList(profile.mainPlayers || [], 'Entity')}</div></section><section class="section wrap"><h2>Proof / Source Routes</h2><div class="grid">${routeCards(profile.proofRoutes || [])}</div></section><section class="section wrap"><h2>What The Record Can Support</h2><div class="grid">${cardList(profile.recordSupports || [], 'Record Support')}</div></section><section class="section wrap"><h2>Speculation Boundary</h2><div class="grid">${cardList(profile.speculationBoundary || [], 'Boundary')}</div></section><section class="section wrap"><h2>Latest Live-Intel Matches</h2><div class="grid">${intelCards(live)}</div></section><section class="section wrap"><h2>Related Books</h2><div class="grid">${bookCards(related)}</div></section><section class="section wrap"><h2>Video / Social Hook</h2><article class="card redline"><h3>Source-first hook</h3><p>${esc(videoHook(profile))}</p><div class="cta-row small"><a class="btn" href="share-center.html">Share Center</a><a class="btn alt" href="daily-drop.html">Daily Drop</a></div></article></section><section class="section wrap"><h2>Next Reader Action</h2><div class="grid">${cardList(profile.actions || [], 'Action')}</div><div class="cta-row"><a class="btn" href="${esc(pdf)}">Download Subject PDF</a><a class="btn alt" href="download-center.html">All Downloads</a><a class="btn alt" href="books.html">Book Library</a></div></section></main>`;
  write(file, layout(`${profile.title} | Matrix Reprogrammed`, profile.summary, body, { about: profile.proofRoutes || [] }));
  return { file, pdf, title: profile.title, slug: profile.slug, liveIntelMatches: live.length, relatedBooks: related.length };
}
function buildIndex(hubs) {
  const cards = hubs.map(hub => `<article class="card redline"><span class="label">Subject Intelligence Hub</span><h3>${esc(hub.title)}</h3><p>Routes into its own subject PDF, proof paths, live-intel matches, related books, and claim boundary.</p><div class="cta-row small"><a class="btn" href="${esc(hub.file)}">Open Hub</a><a class="btn alt" href="${esc(hub.pdf)}">PDF</a></div></article>`).join('');
  const body = `<main><section class="hero wrap"><div class="eyebrow">Subject Intelligence Library</div><h1>SUBJECT INTELLIGENCE HUBS.</h1><p class="lead">Crawlable subject pages built from the same profiles that generate the branded PDF mini-books. Each hub gives the reader proof routes, main players/entities, boundaries, latest updates, related books, and a next action.</p><div class="cta-row"><a class="btn" href="download-center.html">Download Center</a><a class="btn alt" href="downloads/subject-hub-index.json">Hub Index JSON</a><a class="btn alt" href="downloads/subject-pdf-index.json">Subject PDF Index</a></div></section><section class="section wrap split"><div class="terminal">SUBJECT HUB ENGINE\n&gt; Hubs: ${hubs.length}\n&gt; Source data: data/subject-intelligence-profiles.json\n&gt; PDFs: downloads/subject-*.pdf\n&gt; Search index: patched\n&gt; Sitemap: patched\n&gt; LLM map: patched</div><aside class="card redline"><h2>Reader Rule</h2><p>Every subject page is a route into evidence, books, and downloads. It is not a verdict. The evidence strength belongs to the linked source route.</p></aside></section><section class="section wrap"><h2>All Subject Hubs</h2><div class="grid">${cards}</div></section></main>`;
  write('subject-index.html', layout('Subject Intelligence Hubs | Matrix Reprogrammed', 'Subject intelligence hub index for Matrix Reprogrammed public-record mini-books, proof routes, related books, and evidence boundaries.', body));
}
function writeDownloads(hubs) {
  const payload = { updated: new Date().toISOString(), source: 'data/subject-intelligence-profiles.json', purpose: 'Generated subject hub index. Each hub is a crawlable page paired with a subject PDF mini-book.', count: hubs.length, hubs };
  write('downloads/subject-hub-index.json', JSON.stringify(payload, null, 2));
  write('downloads/subject-hub-index.md', `# Subject Hub Index\n\nUpdated: ${payload.updated}\n\n${hubs.map(hub => `- ${hub.title}: ${hub.file} / ${hub.pdf}`).join('\n')}\n`);
}
function patchDownloadCenter(hubs) {
  const p = 'download-center.html';
  if (!exists(p)) return;
  let html = read(p);
  const cards = hubs.map(hub => `<article class="card redline"><span class="label">Subject Hub</span><h3>${esc(hub.title)}</h3><p>Open the crawlable hub or download the subject mini-book.</p><div class="cta-row small"><a class="btn" href="${esc(hub.file)}">Hub</a><a class="btn alt" href="${esc(hub.pdf)}">PDF</a></div></article>`).join('');
  const section = `<section id="subject-intelligence-hub-index" class="section wrap"><h2>Subject Intelligence Hubs</h2><p class="lead">Each subject hub is generated from the same profile that builds its branded PDF mini-book, giving readers crawlable proof routes, boundaries, related books, and next actions.</p><div class="grid">${cards}</div><div class="cta-row"><a class="btn" href="subject-index.html">Open Subject Hub Index</a><a class="btn alt" href="downloads/subject-hub-index.json">Hub Index JSON</a></div></section>`;
  if (html.includes('id="subject-intelligence-hub-index"')) html = html.replace(/<section id="subject-intelligence-hub-index"[\s\S]*?<\/section>/, section);
  else html = html.replace('</main>', `${section}</main>`);
  write(p, html);
}
function patchSitemap(hubs) {
  const p = 'sitemap.xml';
  if (!exists(p)) return;
  let xml = read(p);
  const today = new Date().toISOString().slice(0, 10);
  const routes = ['subject-index.html', ...hubs.map(h => h.file)];
  const add = routes.filter(route => !xml.includes(`/${route}</loc>`)).map(route => `  <url><loc>${SITE}/${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.91</priority></url>`).join('\n');
  if (add) xml = xml.replace('</urlset>', `${add}\n</urlset>`);
  write(p, xml);
}
function patchLlms(hubs) {
  const p = 'llms.txt';
  if (!exists(p)) return;
  let txt = read(p);
  const lines = ['Subject Intelligence Hubs:', '- /subject-index.html: generated index of crawlable subject intelligence pages linked to subject PDF mini-books.', ...hubs.map(h => `- /${h.file}: subject hub for ${h.title}.`), '- /downloads/subject-hub-index.json: machine-readable subject hub index.', '- /downloads/subject-hub-index.md: human-readable subject hub index.'];
  const missing = lines.filter(line => !txt.includes(line));
  if (missing.length) write(p, `${txt.trim()}\n\n${missing.join('\n')}\n`);
}
function patchSearchIndex(hubs) {
  const p = 'search-index.json';
  if (!exists(p)) return;
  const index = JSON.parse(read(p));
  const existing = new Set(index.map(item => item.url));
  if (!existing.has('subject-index.html')) index.push({ key: 'subject-index', title: 'Subject Intelligence Hubs', subtitle: 'Generated public-record subject routes', series: 'Subject Intelligence', category: 'Subject Hubs', url: 'subject-index.html', description: 'Crawlable index of Matrix Reprogrammed subject hubs linked to branded PDF mini-books.', keywords: ['subject hubs','subject intelligence','pdf mini books','proof routes','evidence boundaries'] });
  for (const hub of hubs) {
    if (!existing.has(hub.file)) index.push({ key: `subject-${hub.slug}`, title: hub.title, subtitle: 'Subject Intelligence Hub', series: 'Subject Intelligence', category: 'Subject Hubs', url: hub.file, description: `Subject hub with PDF, proof routes, boundaries, related books, and reader actions for ${hub.title}.`, keywords: [hub.title, hub.slug, 'subject hub', 'subject pdf', 'proof routes', 'evidence boundary'] });
  }
  write(p, JSON.stringify(index, null, 2));
}

const hubs = (profileData.subjects || []).map(buildSubjectHub);
buildIndex(hubs);
writeDownloads(hubs);
patchDownloadCenter(hubs);
patchSitemap(hubs);
patchLlms(hubs);
patchSearchIndex(hubs);
console.log(`Built Subject Intelligence Hubs with ${hubs.length} subject pages, index, downloads, sitemap, llms, search index, and Download Center patch.`);
