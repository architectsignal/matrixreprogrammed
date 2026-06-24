const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'conversion-funnel.json');
if (!fs.existsSync(dataPath)) {
  console.log('No data/conversion-funnel.json found. Skipping Phase 7 Conversion Funnel build.');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const books = fs.existsSync(path.join(root, 'data', 'books.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8')).books.filter(b => b.status !== 'planned' && b.status !== 'unpublished')
  : [];

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function bookByKey(key) { return books.find(b => b.key === key); }
function bookUrl(book) { return book && (book.generatedUrl || book.localUrl || 'books.html'); }
function titleFromFile(file) { return file.replace(/\.html$/, '').replace(/-/g, ' '); }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="book-universe.html">Book Universe</a><a href="conversion-funnel.html">Funnels</a><a href="answer-engine.html">AI Answers</a><a href="power-atlas.html">Power Atlas</a><a href="network-map-index.html">Map Index</a><a href="evidence-vault.html">Evidence Vault</a><a href="news.html">Intel Desk</a><a href="forum.html">Signal Board</a><a href="search.html">Search</a><a href="black-file.html">Black File</a></nav></header>`;
}
function layout({ title, desc, body, schema = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${schema}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Conversion boundary: no fake scarcity, fake counters, or unverifiable promises. Forms create reader routes into the archive.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function schema(f, file) {
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: f.title, description: f.promise, url: `https://matrixreprogrammed.com/${file}`, dateModified: data.updated || '2026-06-24' })}</script>`;
}
function bookCards(keys = []) {
  return keys.map(k => bookByKey(k)).filter(Boolean).map(b => `<article class="card"><span class="label">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><a class="btn" href="${esc(bookUrl(b))}">Open Book</a></article>`).join('');
}
function routeButtons(routes = []) {
  return routes.map(route => `<a class="btn alt" href="${esc(route)}">${esc(titleFromFile(route))}</a>`).join('');
}
function formHtml(f) {
  return `<form name="${esc(f.formName)}" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/${esc(f.thankYouPage)}"><input type="hidden" name="form-name" value="${esc(f.formName)}" /><p style="display:none"><label>Do not fill this in: <input name="bot-field" /></label></p><input name="name" required aria-label="Name" placeholder="Name" /><input name="email" type="email" required aria-label="Email" placeholder="Email" /><input name="reader-path" aria-label="Reader path" placeholder="What are you researching?" /><button class="btn" type="submit">${esc(f.primaryCta)}</button></form>`;
}
function funnelPage(f) {
  const file = `funnel-${f.slug}.html`;
  const downloadButton = f.download ? `<a class="btn alt" href="${esc(f.download)}" download>Direct Download</a>` : '';
  const body = `<main><section class="hero wrap"><div class="eyebrow">Phase 7 Conversion Funnel</div><h1>${esc(f.title)}</h1><p class="lead">${esc(f.promise)}</p><div class="cta-row"><a class="btn" href="#request">${esc(f.primaryCta)}</a>${downloadButton}<a class="btn alt" href="conversion-funnel.html">All Funnels</a></div></section><section class="section wrap split"><div class="terminal">FUNNEL STATUS\n&gt; Door: ${esc(f.title)}\n&gt; Audience: ${esc(f.audience)}\n&gt; Form: ${esc(f.formName)}\n&gt; Thank-you: ${esc(f.thankYouPage)}\n&gt; Routes: ${(f.routes || []).length}\n&gt; Book paths: ${(f.books || []).length}\n&gt; No fake scarcity</div><aside id="request" class="card redline"><h2>${esc(f.tagline)}</h2><p>${esc(f.promise)}</p>${formHtml(f)}<p class="warning">If the form fails, use the archive routes below. The goal is not spam. The goal is a clean path into the system.</p></aside></section><section class="section wrap"><h2>After You Enter</h2><p class="lead">This funnel routes readers into the correct part of the Matrix Reprogrammed archive.</p><div class="card"><div class="cta-row small">${routeButtons(f.routes)}</div></div></section><section class="section wrap"><h2>Book Path</h2><div class="grid">${bookCards(f.books)}</div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout({ title: `${f.title} | Matrix Reprogrammed`, desc: f.promise, body, schema: schema(f, file) }));
  return file;
}
function thankYouPage(f) {
  const file = f.thankYouPage;
  const downloadButton = f.download ? `<a class="btn" href="${esc(f.download)}" download>Download Now</a>` : `<a class="btn" href="black-file.html">Open Black File</a>`;
  const body = `<main><section class="hero wrap"><div class="eyebrow">Signal received</div><h1>${esc(f.title)} unlocked.</h1><p class="lead">Your next move is below. Start with the promised route, then go deeper into the Atlas, Evidence Vault, maps, books, and Intel Desk.</p><div class="cta-row">${downloadButton}<a class="btn alt" href="book-universe.html">Book Universe</a><a class="btn alt" href="network-map-index.html">Map Index</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section><section class="section wrap"><h2>Recommended Route</h2><div class="card"><div class="cta-row small">${routeButtons(f.routes)}</div></div></section><section class="section wrap"><h2>Books To Open Next</h2><div class="grid">${bookCards(f.books)}</div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout({ title: `${f.title} Access | Matrix Reprogrammed`, desc: `Access page for ${f.title}.`, body, schema: schema(f, file) }));
  return file;
}
function patchBlackFile() {
  const file = path.join(root, 'black-file.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('id="phase-seven-funnel-engine"')) return;
  const cards = (data.funnels || []).map(f => `<article class="card redline"><span class="label">${esc(f.audience)}</span><h3>${esc(f.title)}</h3><p>${esc(f.promise)}</p><a class="btn" href="funnel-${esc(f.slug)}.html">Open Funnel</a></article>`).join('');
  const section = `<section id="phase-seven-funnel-engine" class="section wrap"><h2>Phase 7 Conversion Funnel Engine</h2><p class="lead">Choose the correct door: Black File, Evidence Starter, Power Map, Intel Weekly, or Book Path.</p><div class="grid">${cards}</div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(file, html);
}
function addPagesToSitemap(files) {
  const p = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(p)) return;
  let xml = fs.readFileSync(p, 'utf8');
  const add = files.filter(f => !xml.includes(`/${f}</loc>`)).map(f => `  <url><loc>https://matrixreprogrammed.com/${f}</loc><lastmod>${esc(data.updated || '2026-06-24')}</lastmod><changefreq>weekly</changefreq><priority>0.94</priority></url>`).join('\n');
  if (add) xml = xml.replace('</urlset>', `${add}\n</urlset>`);
  fs.writeFileSync(p, xml);
}
function patchLlms(files) {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return;
  let llms = fs.readFileSync(p, 'utf8');
  if (llms.includes('/conversion-funnel.html')) return;
  fs.writeFileSync(p, `${llms.trim()}\n\nPhase 7 Conversion Funnel Engine:\n- /conversion-funnel.html: lead magnet and reader conversion hub.\n${files.slice(0, 20).map(f => `- /${f}: generated funnel or access page.`).join('\n')}\n`);
}
function patchSearchIndex(files) {
  const p = path.join(root, 'search-index.json');
  if (!fs.existsSync(p)) return;
  const search = JSON.parse(fs.readFileSync(p, 'utf8'));
  const existing = new Set(search.map(i => i.url));
  for (const f of data.funnels || []) {
    const url = `funnel-${f.slug}.html`;
    if (!existing.has(url)) {
      search.push({ key: `funnel-${f.slug}`, title: `${f.title} | Funnel`, subtitle: f.tagline, series: 'Conversion Funnel Engine', category: 'Lead Magnet', url, description: f.promise, keywords: [f.title, f.tagline, f.audience, f.promise, ...(f.routes || []), ...(f.books || [])] });
      existing.add(url);
    }
  }
  if (!existing.has('conversion-funnel.html')) search.push({ key: 'conversion-funnel', title: 'Conversion Funnel | Matrix Reprogrammed', subtitle: 'Phase 7 Funnel Engine', series: 'Conversion Funnel Engine', category: 'Lead Magnet Hub', url: 'conversion-funnel.html', description: 'Lead magnet and reader conversion hub for Matrix Reprogrammed.', keywords: ['lead magnet', 'black file', 'email capture', 'reader path', 'conversion funnel'] });
  fs.writeFileSync(p, JSON.stringify(search, null, 2));
}

const generated = [];
for (const f of data.funnels || []) {
  generated.push(funnelPage(f));
  generated.push(thankYouPage(f));
}
const cards = (data.funnels || []).map(f => `<article class="card redline"><span class="label">${esc(f.audience)}</span><h3>${esc(f.title)}</h3><p>${esc(f.promise)}</p><a class="btn" href="funnel-${esc(f.slug)}.html">Open Funnel</a></article>`).join('');
const rules = (data.rules || []).map(rule => `<article class="card"><span class="label">Conversion Rule</span><h3>${esc(rule)}</h3><p>This keeps the funnel useful, honest, and archive-driven.</p></article>`).join('');
const indexBody = `<main><section class="hero wrap"><div class="eyebrow">Phase 7 Conversion Funnel Engine</div><h1>CONVERSION FUNNEL.</h1><p class="lead">Turn archive traffic into reader paths: Black File, Evidence Starter, Power Map, Intel Weekly, and Book Path.</p><div class="cta-row"><a class="btn" href="funnel-black-file.html">Open Black File Funnel</a><a class="btn alt" href="black-file.html">Black File</a><a class="btn alt" href="book-universe.html">Book Universe</a></div></section><section class="section wrap split"><div class="terminal">CONVERSION ENGINE STATUS\n&gt; Funnels: ${(data.funnels || []).length}\n&gt; Rules: ${(data.rules || []).length}\n&gt; Netlify forms: active\n&gt; Thank-you pages: generated\n&gt; Search index: expanded\n&gt; Sitemap: expanded\n&gt; llms.txt: expanded</div><aside class="card redline"><h2>Funnel Rule</h2><p>The archive is deep. The funnel gives the reader one clean next step.</p></aside></section><section class="section wrap"><h2>Lead Magnet Doors</h2><div class="grid">${cards}</div></section><section class="section wrap"><h2>Conversion Rules</h2><div class="grid">${rules}</div></section></main>`;
fs.writeFileSync(path.join(root, 'conversion-funnel.html'), layout({ title: 'Conversion Funnel | Matrix Reprogrammed', desc: 'Lead magnet and reader conversion hub for Matrix Reprogrammed.', body: indexBody }));
generated.push('conversion-funnel.html');
patchBlackFile();
addPagesToSitemap(generated);
patchLlms(generated);
patchSearchIndex(generated);
console.log(`Built Phase 7 Conversion Funnel with ${(data.funnels || []).length} funnels and ${generated.length} generated pages.`);
