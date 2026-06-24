const fs = require('fs');
const path = require('path');

const root = process.cwd();
const booksPath = path.join(root, 'data', 'books.json');
if (!fs.existsSync(booksPath)) {
  console.log('No data/books.json found. Skipping Phase 4 Book Universe build.');
  process.exit(0);
}
const books = JSON.parse(fs.readFileSync(booksPath, 'utf8')).books
  .filter(book => book.status !== 'planned' && book.status !== 'unpublished');
const atlas = fs.existsSync(path.join(root, 'data', 'power-atlas.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'power-atlas.json'), 'utf8')) : { nodes: [] };
const vault = fs.existsSync(path.join(root, 'data', 'evidence-vault.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'evidence-vault.json'), 'utf8')) : { sourceLanes: [], sourceCards: [] };

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function urlFor(book) { return book.generatedUrl || book.localUrl || 'books.html'; }
function byKey(key) { return books.find(book => book.key === key); }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="book-universe.html">Book Universe</a><a href="power-atlas.html">Power Atlas</a><a href="evidence-vault.html">Evidence Vault</a><a href="evidence-vault-index.html">Source Index</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a><a href="black-file.html">Black File</a></nav></header>`; }
function layout({ title, description, body, schema = '' }) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${schema}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Book Universe boundary: books are reader routes. Claims still inherit the evidence class and source boundary of their atlas node or source lane.</p></footer></div><script src="matrix.js"></script></body></html>`; }
function articleSchema(name, desc, url) { return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', name, description: desc, url: `https://matrixreprogrammed.com/${url}`, dateModified: '2026-06-24' })}</script>`; }
function textFor(book) { return [book.key, book.title, book.subtitle, book.series, book.category, book.description, book.readerPath, ...(book.keywords || [])].join(' ').toLowerCase(); }
function matchAny(text, terms) { return terms.some(term => text.includes(term)); }
function atlasNode(slug) { return (atlas.nodes || []).find(node => node.slug === slug); }
function lane(slug) { return (vault.sourceLanes || []).find(item => item.slug === slug); }
function getRoutes(book) {
  const text = textFor(book);
  const atlasSlugs = new Set();
  const laneSlugs = new Set();
  if (matchAny(text, ['cia','nsa','mi6','gchq','mossad','kgb','fsb','intelligence','surveillance','covert','agency'])) { atlasSlugs.add('cia'); atlasSlugs.add('nsa'); atlasSlugs.add('five-eyes'); laneSlugs.add('declassified-archives'); laneSlugs.add('intelligence-oversight'); }
  if (matchAny(text, ['blackwater','contractor','war','wwiii','drone','collapse','conflict','energy shock'])) { atlasSlugs.add('blackwater'); atlasSlugs.add('war-machine'); laneSlugs.add('financial-records'); laneSlugs.add('human-cost-sources'); }
  if (matchAny(text, ['cartel','mafia','ndrangheta','albanian','triad','outlaws','crime','cocaine','laundering'])) { atlasSlugs.add('cartels'); laneSlugs.add('court-records'); laneSlugs.add('financial-records'); }
  if (matchAny(text, ['masonic','freemason','degree','symbol','d.o.g','dog','architect','occult','secret societies','esoteric'])) { atlasSlugs.add('freemasonry-symbols'); atlasSlugs.add('black-file'); laneSlugs.add('symbolic-records'); }
  if (matchAny(text, ['epstein','elite network','black file','overlap','elite toolkit','power'])) { atlasSlugs.add('epstein-records'); atlasSlugs.add('black-file'); laneSlugs.add('court-records'); laneSlugs.add('financial-records'); }
  if (matchAny(text, ['medicine','vaccine','medical','pharma','health','biosecurity','pandemic'])) { atlasSlugs.add('medical-power'); laneSlugs.add('human-cost-sources'); laneSlugs.add('financial-records'); }
  if (!atlasSlugs.size) atlasSlugs.add('black-file');
  if (!laneSlugs.size) laneSlugs.add('court-records');
  return { atlasSlugs: [...atlasSlugs].slice(0, 4), laneSlugs: [...laneSlugs].slice(0, 4) };
}
function bookPromise(book) {
  const category = (book.category || '').toLowerCase();
  if (category.includes('intelligence')) return 'A public-record route into agencies, oversight, covert architecture, surveillance, contractors, and the documents that show how state power hides in plain sight.';
  if (category.includes('crime')) return 'A crime-state route into logistics, money, corruption, violence, ports, underground finance, and the legal records that separate fact from folklore.';
  if (category.includes('masonic') || category.includes('esoteric')) return 'A symbolic route into ritual architecture, degree systems, occult inheritance, institutional language, and the boundary between record and interpretation.';
  if (category.includes('survival') || category.includes('war')) return 'A collapse-route for readers tracking war, energy, food, water, emergency power, civil stress, and practical psychological control.';
  if (category.includes('psychology')) return 'A deprogramming route into identity, influence, manipulation, subconscious loops, and the mechanics of attention capture.';
  return 'A reader route into the Matrix Reprogrammed archive, built to connect the book to the wider atlas, source vault, and Black File funnel.';
}
function atlasCards(slugs) {
  return slugs.map(slug => atlasNode(slug)).filter(Boolean).map(node => `<article class="card redline"><span class="label">Power Atlas · ${esc(node.evidenceClass)}</span><h3>${esc(node.shortTitle || node.title)}</h3><p>${esc(node.summary)}</p><a class="btn" href="atlas-${esc(node.slug)}.html">Open Atlas Node</a></article>`).join('');
}
function laneCards(slugs) {
  return slugs.map(slug => lane(slug)).filter(Boolean).map(item => `<article class="card"><span class="label">Evidence Vault · ${esc(item.evidenceClass)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><a class="btn alt" href="evidence-lane-${esc(item.slug)}.html">Open Source Lane</a></article>`).join('');
}
function amazonButtons(book) {
  const parts = [];
  if (book.amazonUs) parts.push(`<a class="btn" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon US</a>`);
  if (book.amazonUk) parts.push(`<a class="btn alt" href="${esc(book.amazonUk)}" target="_blank" rel="noopener">Amazon UK</a>`);
  parts.push(`<a class="btn alt" href="black-file.html">Black File</a>`);
  parts.push(`<a class="btn alt" href="book-universe.html">Book Universe</a>`);
  return `<div class="cta-row">${parts.join('')}</div>`;
}
function patchBookPage(book) {
  const file = path.join(root, urlFor(book));
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('id="phase-four-book-universe"')) return true;
  const routes = getRoutes(book);
  const section = `<section id="phase-four-book-universe" class="section wrap"><h2>Book Universe Route</h2><p class="lead">${esc(bookPromise(book))}</p><div class="grid"><article class="card redline"><span class="label">Reader Promise</span><h3>What this door gives you</h3><p>${esc(book.readerPath || book.description || 'A direct route into one layer of the hidden system.')}</p></article><article class="card"><span class="label">Evidence Boundary</span><h3>How to read it</h3><p>This book is a reader path. Claims remain separated by confirmed record, court record, credible reporting, documented association, disputed claim, and symbolic commentary.</p></article><article class="card"><span class="label">Next Move</span><h3>Follow the system</h3><p>Read the book, then move into the Power Atlas and Evidence Vault routes connected below.</p></article></div><h2>Connected Power Atlas Nodes</h2><div class="grid">${atlasCards(routes.atlasSlugs)}</div><h2>Connected Evidence Vault Lanes</h2><div class="grid">${laneCards(routes.laneSlugs)}</div><div class="card redline"><h2>Buy / Continue</h2><p>Use this page as a sales door and an archive route. The book sells the deep dive; the atlas and vault prove the system around it.</p>${amazonButtons(book)}</div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(file, html);
  return true;
}

let patched = 0;
for (const book of books) if (patchBookPage(book)) patched++;

const groups = books.reduce((acc, book) => { (acc[book.series || book.category || 'Archive'] ||= []).push(book); return acc; }, {});
const routeCards = Object.entries(groups).map(([group, list]) => `<section class="section wrap"><h2>${esc(group)}</h2><p class="lead">${esc(list.length)} live book route${list.length === 1 ? '' : 's'} connected into the sales funnel, Power Atlas, and Evidence Vault.</p><div class="grid">${list.slice(0, 12).map(book => `<article class="card"><span class="label">${esc(book.category)}</span><h3>${esc(book.title)}</h3><p>${esc(book.subtitle || book.description)}</p><a class="btn" href="${esc(urlFor(book))}">Open Book Door</a></article>`).join('')}</div></section>`).join('');
const body = `<main><section class="hero wrap"><div class="eyebrow">Phase 4 Book Universe</div><h1>BOOKS THAT ROUTE INTO THE MACHINE.</h1><p class="lead">Every Matrix Reprogrammed book page now works as a sales door, reader path, Power Atlas route, Evidence Vault route, and Black File funnel entry.</p><div class="cta-row"><a class="btn" href="books.html">Book Archive</a><a class="btn alt" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="black-file.html">Black File</a></div></section><section class="section wrap split"><div class="terminal">BOOK UNIVERSE STATUS\n&gt; Live book pages patched: ${patched}\n&gt; Total live books: ${books.length}\n&gt; Atlas routing: active\n&gt; Source-lane routing: active\n&gt; Amazon CTAs: preserved\n&gt; Black File funnel: active\n&gt; Duplicate visible keywords: removed by cleanup</div><aside class="card redline"><h2>Sales Rule</h2><p>Do not make the book page a dead product card. Make it a path: hook, promise, evidence boundary, atlas node, source lane, next book, and buy button.</p></aside></section>${routeCards}</main>`;
fs.writeFileSync(path.join(root, 'book-universe.html'), layout({ title: 'Book Universe | Matrix Reprogrammed', description: 'Matrix Reprogrammed Phase 4 Book Universe: book pages upgraded into sales doors, reader paths, Power Atlas routes, Evidence Vault routes, and Black File funnel entries.', body, schema: articleSchema('Book Universe', 'Book sales and archive routing layer.', 'book-universe.html') }));

function addPagesToSitemap(files) {
  const sitemapPath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const additions = files.filter(file => !xml.includes(`/${file}</loc>`)).map(file => `  <url><loc>https://matrixreprogrammed.com/${file}</loc><lastmod>2026-06-24</lastmod><changefreq>weekly</changefreq><priority>0.88</priority></url>`).join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}
function patchLlms() {
  const llmsPath = path.join(root, 'llms.txt');
  if (!fs.existsSync(llmsPath)) return;
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (llms.includes('/book-universe.html')) return;
  fs.writeFileSync(llmsPath, `${llms.trim()}\n\nPhase 4 Book Universe engine:\n- /book-universe.html: book sales and archive routing layer connecting books to Power Atlas nodes, Evidence Vault lanes, Amazon CTAs, and Black File funnel.\n`);
}
function patchSearchIndex() {
  const indexPath = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexPath)) return;
  const search = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!search.some(item => item.url === 'book-universe.html')) {
    search.push({ key: 'book-universe', title: 'Book Universe | Matrix Reprogrammed', subtitle: 'Phase 4 Sales Funnel Layer', series: 'Book Universe', category: 'Archive System', url: 'book-universe.html', description: 'A sales and reader-path hub connecting every book into Power Atlas, Evidence Vault, Amazon CTAs, and the Black File funnel.', keywords: ['books','sales funnel','reader path','power atlas','evidence vault','black file'] });
    fs.writeFileSync(indexPath, JSON.stringify(search, null, 2));
  }
}
addPagesToSitemap(['book-universe.html']);
patchLlms();
patchSearchIndex();
console.log(`Built Phase 4 Book Universe. Patched ${patched} of ${books.length} live book pages.`);
