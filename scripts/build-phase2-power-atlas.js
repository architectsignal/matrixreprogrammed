const fs = require('fs');
const path = require('path');

const root = process.cwd();
const atlasPath = path.join(root, 'data', 'power-atlas.json');
if (!fs.existsSync(atlasPath)) {
  console.log('No data/power-atlas.json found. Skipping Phase 2 Power Atlas build.');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
const booksData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));
const books = booksData.books.filter(book => book.status !== 'planned' && book.status !== 'unpublished');

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function byKey(key) { return books.find(book => book.key === key); }
function urlFor(book) { return book && (book.generatedUrl || book.localUrl || 'books.html'); }
function nodeUrl(node) { return `atlas-${node.slug}.html`; }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="power-atlas.html">Power Atlas</a><a href="atlas-index.html">Atlas Nodes</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a><a href="black-file.html">Black File</a></nav></header>`;
}
function layout({ title, description, body, schema = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${schema}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Power Atlas boundary: relationship lines are labeled. Association is not guilt. A source lane is not proof of wrongdoing. Symbolic commentary is interpretation unless supported by records.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function articleSchema(name, desc, url) {
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: name, description: desc, author: { '@type': 'Person', name: 'Nicholas Matthews' }, publisher: { '@type': 'Organization', name: 'Matrix Reprogrammed' }, url: `https://matrixreprogrammed.com/${url}`, dateModified: atlas.updated || '2026-06-24' })}</script>`;
}
function pillList(items = [], cls = 'pill') { return items.map(item => `<span class="${cls}">${esc(item)}</span>`).join(''); }
function bookCards(keys = []) {
  return keys.map(key => byKey(key)).filter(Boolean).map(book => `<article class="card"><span class="label">${esc(book.category)}</span><h3>${esc(book.title)}</h3><p>${esc(book.description)}</p><a class="btn" href="${esc(urlFor(book))}">Open Book Route</a></article>`).join('');
}
function pageLinks(links = []) {
  return links.map(link => `<a class="btn alt" href="${esc(link)}">${esc(link.replace(/\.html$/, '').replace(/-/g, ' '))}</a>`).join('');
}
function addPagesToSitemap(files) {
  const sitemapPath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const additions = files.filter(file => !xml.includes(`/${file}</loc>`)).map(file => `  <url><loc>https://matrixreprogrammed.com/${file}</loc><lastmod>${esc(atlas.updated || '2026-06-24')}</lastmod><changefreq>weekly</changefreq><priority>0.86</priority></url>`).join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}
function patchLlms(files) {
  const llmsPath = path.join(root, 'llms.txt');
  if (!fs.existsSync(llmsPath)) return;
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (llms.includes('/atlas-index.html')) return;
  const insert = `\nPhase 2 Power Atlas engine:\n- /atlas-index.html: index of generated atlas nodes for institutions, networks, systems, cases, symbolic systems, and gateway maps.\n${files.slice(0, 12).map(file => `- /${file}: generated Power Atlas entity node.`).join('\n')}\n`;
  fs.writeFileSync(llmsPath, `${llms.trim()}\n${insert}\n`);
}
function patchPowerAtlas() {
  const powerPath = path.join(root, 'power-atlas.html');
  if (!fs.existsSync(powerPath)) return;
  let html = fs.readFileSync(powerPath, 'utf8');
  const nodeCards = atlas.nodes.map(node => `<article class="card redline"><span class="label">${esc(node.layer)}</span><h3>${esc(node.shortTitle || node.title)}</h3><p>${esc(node.summary)}</p><p><span class="pill">${esc(node.evidenceClass)}</span><span class="pill">${esc(node.type)}</span></p><a class="btn" href="${esc(nodeUrl(node))}">Open Node</a></article>`).join('');
  const section = `<section id="phase-two-atlas-engine" class="section wrap"><h2>Phase 2 Power Atlas Nodes</h2><p class="lead">Generated atlas nodes now give every major power lane a source boundary, evidence class, relationship-line language, and reader route.</p><div class="cta-row"><a class="btn" href="atlas-index.html">Open Full Atlas Index</a><a class="btn alt" href="network-maps.html">Relationship Rules</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a></div><div class="grid">${nodeCards}</div></section>`;
  if (!html.includes('id="phase-two-atlas-engine"')) {
    html = html.replace('</main>', `${section}</main>`);
    fs.writeFileSync(powerPath, html);
  }
}
function patchSearchIndex() {
  const indexPath = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexPath)) return;
  const search = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const existing = new Set(search.map(item => item.url));
  for (const node of atlas.nodes) {
    const url = nodeUrl(node);
    if (existing.has(url)) continue;
    search.push({
      key: `atlas-${node.slug}`,
      title: `${node.title} | Power Atlas`,
      subtitle: node.layer,
      series: 'Power Atlas',
      category: node.type,
      url,
      description: node.summary,
      keywords: [node.shortTitle, node.title, node.type, node.layer, node.evidenceClass, ...(node.relationshipTypes || [])].filter(Boolean)
    });
  }
  fs.writeFileSync(indexPath, JSON.stringify(search, null, 2));
}

const generatedFiles = [];
for (const node of atlas.nodes) {
  const file = nodeUrl(node);
  generatedFiles.push(file);
  const body = `<main><section class="hero wrap"><div class="eyebrow">Power Atlas Node · ${esc(node.type)}</div><h1>${esc(node.title)}</h1><p class="lead">${esc(node.summary)}</p><div class="cta-row"><a class="btn" href="atlas-index.html">Atlas Index</a><a class="btn alt" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a></div></section><section class="section wrap split"><div class="terminal">NODE FILE\n&gt; Type: ${esc(node.type)}\n&gt; Layer: ${esc(node.layer)}\n&gt; Evidence class: ${esc(node.evidenceClass)}\n&gt; Relationship lines must be labeled\n&gt; Association is not guilt\n&gt; Mention is not proof\n&gt; Symbolic commentary remains commentary</div><aside class="card redline"><h2>Why This Node Matters</h2><p>${esc(node.whyItMatters)}</p><p>${pillList([node.evidenceClass, node.layer, node.type])}</p></aside></section><section class="section wrap"><h2>Source Boundary</h2><div class="card"><p>${esc(node.sourceBoundary)}</p></div></section><section class="section wrap"><h2>Relationship-Line Types</h2><p class="lead">These labels define what a connection is allowed to mean on the map.</p><div class="grid">${(node.relationshipTypes || []).map(type => `<article class="card"><span class="label">Line Type</span><h3>${esc(type)}</h3><p>This connection must be supported by the correct evidence class before it is treated as meaningful.</p></article>`).join('')}</div></section><section class="section wrap"><h2>Book Routes</h2><p class="lead">Every atlas node routes readers into long-form books and deeper source lanes.</p><div class="grid">${bookCards(node.relatedBooks)}</div></section><section class="section wrap"><h2>Related Archive Pages</h2><div class="card"><div class="cta-row small">${pageLinks(node.relatedPages)}</div></div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout({ title: `${node.title} | Power Atlas`, description: node.summary, body, schema: articleSchema(`${node.title} | Power Atlas`, node.summary, file) }));
}

const grouped = atlas.nodes.reduce((acc, node) => { (acc[node.type] ||= []).push(node); return acc; }, {});
const typeSections = Object.entries(grouped).map(([type, nodes]) => `<section class="section wrap"><h2>${esc(type)}</h2><div class="grid">${nodes.map(node => `<article class="card"><span class="label">${esc(node.layer)}</span><h3>${esc(node.title)}</h3><p>${esc(node.summary)}</p><p><span class="pill">${esc(node.evidenceClass)}</span></p><a class="btn" href="${esc(nodeUrl(node))}">Open Node</a></article>`).join('')}</div></section>`).join('');
const indexBody = `<main><section class="hero wrap"><div class="eyebrow">Phase 2 Power Atlas</div><h1>ATLAS NODES.</h1><p class="lead">A generated index of public-record nodes for institutions, networks, contractors, cases, crime systems, symbolic systems, war machinery, medical power, and gateway maps.</p><div class="cta-row"><a class="btn" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="network-maps.html">Network Maps</a><a class="btn alt" href="search.html">Search Archive</a></div></section><section class="section wrap split"><div class="terminal">ATLAS ENGINE STATUS\n&gt; Nodes: ${atlas.nodes.length}\n&gt; Evidence classes: ${atlas.evidenceClasses.length}\n&gt; Relationship types: ${atlas.relationshipTypes.length}\n&gt; Generated pages: ${generatedFiles.length}\n&gt; Search index: expanded\n&gt; Sitemap: expanded</div><aside class="card redline"><h2>Line Discipline</h2><p>Every relationship must say what it is. Worked for, funded, met, named in court, alleged, disputed, and symbolic similarity are not the same thing.</p></aside></section>${typeSections}</main>`;
fs.writeFileSync(path.join(root, 'atlas-index.html'), layout({ title: 'Power Atlas Node Index | Matrix Reprogrammed', description: 'Generated Power Atlas index of public-record elite exposure nodes, evidence classes, relationship lines, and reader routes.', body: indexBody, schema: articleSchema('Power Atlas Node Index', 'Generated index of Power Atlas nodes.', 'atlas-index.html') }));
generatedFiles.push('atlas-index.html');

patchPowerAtlas();
patchSearchIndex();
addPagesToSitemap(generatedFiles);
patchLlms(generatedFiles);
console.log(`Built Phase 2 Power Atlas with ${atlas.nodes.length} nodes and ${generatedFiles.length} generated pages.`);
