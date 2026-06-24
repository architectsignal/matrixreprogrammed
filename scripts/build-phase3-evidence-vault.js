const fs = require('fs');
const path = require('path');

const root = process.cwd();
const vaultPath = path.join(root, 'data', 'evidence-vault.json');
if (!fs.existsSync(vaultPath)) {
  console.log('No data/evidence-vault.json found. Skipping Phase 3 Evidence Vault build.');
  process.exit(0);
}
const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
const atlasPath = path.join(root, 'data', 'power-atlas.json');
const atlas = fs.existsSync(atlasPath) ? JSON.parse(fs.readFileSync(atlasPath, 'utf8')) : { nodes: [], evidenceClasses: [] };

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function laneUrl(lane) { return `evidence-lane-${lane.slug}.html`; }
function sourceUrl(source) { return `source-${source.slug}.html`; }
function atlasUrl(slug) { return `atlas-${slug}.html`; }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="power-atlas.html">Power Atlas</a><a href="atlas-index.html">Atlas Nodes</a><a href="evidence-vault.html">Evidence Vault</a><a href="evidence-vault-index.html">Source Index</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a><a href="black-file.html">Black File</a></nav></header>`; }
function layout({ title, description, body, schema = '' }) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" />${schema}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Evidence Vault boundary: source links support specific claims only. A source card is not a verdict. Association is not guilt. Reports, allegations, compensation, causation, and confirmed records are separated.</p></footer></div><script src="matrix.js"></script></body></html>`; }
function articleSchema(name, desc, url) { return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: name, description: desc, author: { '@type': 'Person', name: 'Nicholas Matthews' }, publisher: { '@type': 'Organization', name: 'Matrix Reprogrammed' }, url: `https://matrixreprogrammed.com/${url}`, dateModified: vault.updated || '2026-06-24' })}</script>`; }
function pillList(items = []) { return items.map(item => `<span class="pill">${esc(item)}</span>`).join(''); }
function pageLinks(links = []) { return links.map(link => `<a class="btn alt" href="${esc(link)}">${esc(link.replace(/\.html$/, '').replace(/-/g, ' '))}</a>`).join(''); }
function relatedAtlasLinks(slugs = []) {
  return slugs.map(slug => {
    const node = (atlas.nodes || []).find(n => n.slug === slug);
    const label = node ? (node.shortTitle || node.title) : slug;
    return `<a class="btn alt" href="${esc(atlasUrl(slug))}">${esc(label)}</a>`;
  }).join('');
}
function sourceCardsForLane(slug) {
  return (vault.sourceCards || []).filter(source => source.relatedLane === slug).map(source => `<article class="card redline"><span class="label">${esc(source.sourceType)} · ${esc(source.evidenceClass)}</span><h3>${esc(source.title)}</h3><p>${esc(source.description)}</p><p><strong>Use for:</strong> ${esc(source.useFor)}</p><div class="cta-row small"><a class="btn" href="${esc(sourceUrl(source))}">Source Card</a><a class="btn alt" href="${esc(source.url)}" target="_blank" rel="noopener">Open Source</a></div></article>`).join('');
}
function addPagesToSitemap(files) {
  const sitemapPath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const additions = files.filter(file => !xml.includes(`/${file}</loc>`)).map(file => `  <url><loc>https://matrixreprogrammed.com/${file}</loc><lastmod>${esc(vault.updated || '2026-06-24')}</lastmod><changefreq>weekly</changefreq><priority>0.84</priority></url>`).join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}
function patchLlms(files) {
  const llmsPath = path.join(root, 'llms.txt');
  if (!fs.existsSync(llmsPath)) return;
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (llms.includes('/evidence-vault-index.html')) return;
  const insert = `\nPhase 3 Evidence Vault engine:\n- /evidence-vault-index.html: source lane index for court records, declassified archives, financial records, human-cost sources, symbolic records, and oversight material.\n${files.slice(0, 18).map(file => `- /${file}: generated evidence source lane or source card.`).join('\n')}\n`;
  fs.writeFileSync(llmsPath, `${llms.trim()}\n${insert}\n`);
}
function patchSearchIndex() {
  const indexPath = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexPath)) return;
  const search = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const existing = new Set(search.map(item => item.url));
  for (const lane of vault.sourceLanes || []) {
    const url = laneUrl(lane);
    if (!existing.has(url)) {
      search.push({ key: `evidence-lane-${lane.slug}`, title: `${lane.title} | Evidence Vault`, subtitle: lane.sourceType, series: 'Evidence Vault', category: lane.evidenceClass, url, description: lane.summary, keywords: [lane.title, lane.sourceType, lane.evidenceClass, lane.boundary, ...(lane.relatedAtlasNodes || [])].filter(Boolean) });
      existing.add(url);
    }
  }
  for (const source of vault.sourceCards || []) {
    const url = sourceUrl(source);
    if (!existing.has(url)) {
      search.push({ key: `source-${source.slug}`, title: `${source.title} | Source Card`, subtitle: source.sourceType, series: 'Evidence Vault Source Cards', category: source.evidenceClass, url, description: source.description, keywords: [source.title, source.sourceType, source.evidenceClass, source.useFor, source.relatedLane].filter(Boolean) });
      existing.add(url);
    }
  }
  fs.writeFileSync(indexPath, JSON.stringify(search, null, 2));
}
function patchEvidenceVaultHome() {
  const file = path.join(root, 'evidence-vault.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('id="phase-three-evidence-engine"')) return;
  const laneCards = (vault.sourceLanes || []).map(lane => `<article class="card redline"><span class="label">${esc(lane.sourceType)} · ${esc(lane.evidenceClass)}</span><h3>${esc(lane.title)}</h3><p>${esc(lane.summary)}</p><p><strong>Boundary:</strong> ${esc(lane.boundary)}</p><a class="btn" href="${esc(laneUrl(lane))}">Open Lane</a></article>`).join('');
  const section = `<section id="phase-three-evidence-engine" class="section wrap"><h2>Phase 3 Evidence Vault Engine</h2><p class="lead">The vault is now data-driven: source lanes, source cards, claim rules, source hierarchy, atlas routing, search visibility, sitemap entries, and AI-readable source structure.</p><div class="cta-row"><a class="btn" href="evidence-vault-index.html">Open Source Index</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a><a class="btn alt" href="power-atlas.html">Power Atlas</a></div><div class="grid">${laneCards}</div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(file, html);
}

const generatedFiles = [];
for (const lane of vault.sourceLanes || []) {
  const file = laneUrl(lane);
  generatedFiles.push(file);
  const body = `<main><section class="hero wrap"><div class="eyebrow">Evidence Vault Lane · ${esc(lane.sourceType)}</div><h1>${esc(lane.title)}</h1><p class="lead">${esc(lane.summary)}</p><div class="cta-row"><a class="btn" href="evidence-vault-index.html">Source Index</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a><a class="btn alt" href="power-atlas.html">Power Atlas</a></div></section><section class="section wrap split"><div class="terminal">SOURCE LANE\n&gt; Type: ${esc(lane.sourceType)}\n&gt; Evidence class: ${esc(lane.evidenceClass)}\n&gt; Claims must stay inside the source boundary\n&gt; Association is not guilt\n&gt; Evidence class must match the claim being made\n&gt; Corrections strengthen the archive</div><aside class="card redline"><h2>Source Boundary</h2><p>${esc(lane.boundary)}</p><p>${pillList([lane.sourceType, lane.evidenceClass])}</p></aside></section><section class="section wrap"><h2>Source Cards In This Lane</h2><div class="grid">${sourceCardsForLane(lane.slug) || '<article class="card"><h3>No source cards yet</h3><p>This lane is ready for source cards.</p></article>'}</div></section><section class="section wrap"><h2>Related Atlas Nodes</h2><div class="card"><div class="cta-row small">${relatedAtlasLinks(lane.relatedAtlasNodes)}</div></div></section><section class="section wrap"><h2>Related Archive Pages</h2><div class="card"><div class="cta-row small">${pageLinks(lane.relatedPages)}</div></div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout({ title: `${lane.title} | Evidence Vault`, description: lane.summary, body, schema: articleSchema(`${lane.title} | Evidence Vault`, lane.summary, file) }));
}
for (const source of vault.sourceCards || []) {
  const file = sourceUrl(source);
  generatedFiles.push(file);
  const lane = (vault.sourceLanes || []).find(l => l.slug === source.relatedLane);
  const body = `<main><section class="hero wrap"><div class="eyebrow">Evidence Source Card · ${esc(source.sourceType)}</div><h1>${esc(source.title)}</h1><p class="lead">${esc(source.description)}</p><div class="cta-row"><a class="btn" href="${esc(source.url)}" target="_blank" rel="noopener">Open Original Source</a><a class="btn alt" href="${esc(source.relatedLane ? laneUrl({ slug: source.relatedLane }) : 'evidence-vault-index.html')}">Source Lane</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a></div></section><section class="section wrap split"><div class="terminal">SOURCE CARD\n&gt; Source type: ${esc(source.sourceType)}\n&gt; Evidence class: ${esc(source.evidenceClass)}\n&gt; Related lane: ${esc(source.relatedLane)}\n&gt; Use source for its stated category only\n&gt; Do not inflate a source into claims it does not support</div><aside class="card redline"><h2>Use For</h2><p>${esc(source.useFor)}</p><p>${pillList([source.sourceType, source.evidenceClass, source.relatedLane])}</p></aside></section><section class="section wrap"><h2>Boundary</h2><div class="card"><p>${esc(lane ? lane.boundary : 'Use this source only within its source type and evidence class.')}</p></div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout({ title: `${source.title} | Evidence Source Card`, description: source.description, body, schema: articleSchema(`${source.title} | Evidence Source Card`, source.description, file) }));
}

const laneCards = (vault.sourceLanes || []).map(lane => `<article class="card redline"><span class="label">${esc(lane.sourceType)} · ${esc(lane.evidenceClass)}</span><h3>${esc(lane.title)}</h3><p>${esc(lane.summary)}</p><a class="btn" href="${esc(laneUrl(lane))}">Open Source Lane</a></article>`).join('');
const sourceCards = (vault.sourceCards || []).map(source => `<article class="card"><span class="label">${esc(source.sourceType)} · ${esc(source.evidenceClass)}</span><h3>${esc(source.title)}</h3><p>${esc(source.description)}</p><p><strong>Use for:</strong> ${esc(source.useFor)}</p><div class="cta-row small"><a class="btn" href="${esc(sourceUrl(source))}">Source Card</a><a class="btn alt" href="${esc(source.url)}" target="_blank" rel="noopener">Original</a></div></article>`).join('');
const claimRules = (vault.claimRules || []).map(rule => `<article class="card"><span class="label">Claim Rule</span><h3>${esc(rule)}</h3><p>This rule is enforced across the Evidence Vault, Power Atlas, Intel Desk, and book routes.</p></article>`).join('');
const indexBody = `<main><section class="hero wrap"><div class="eyebrow">Phase 3 Evidence Vault</div><h1>SOURCE LANES.</h1><p class="lead">A data-driven source index for court records, declassified archives, financial records, human-cost datasets, symbolic records, and intelligence oversight.</p><div class="cta-row"><a class="btn" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a><a class="btn alt" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="search.html">Search Archive</a></div></section><section class="section wrap split"><div class="terminal">EVIDENCE ENGINE STATUS\n&gt; Source lanes: ${(vault.sourceLanes || []).length}\n&gt; Source cards: ${(vault.sourceCards || []).length}\n&gt; Claim rules: ${(vault.claimRules || []).length}\n&gt; Source hierarchy levels: ${(vault.sourceHierarchy || []).length}\n&gt; Search index: expanded\n&gt; Sitemap: expanded</div><aside class="card redline"><h2>Vault Rule</h2><p>The source does not make the argument for you. It defines what can be responsibly claimed.</p></aside></section><section class="section wrap"><h2>Source Lanes</h2><div class="grid">${laneCards}</div></section><section class="section wrap"><h2>Source Cards</h2><div class="grid">${sourceCards}</div></section><section class="section wrap"><h2>Claim Rules</h2><div class="grid">${claimRules}</div></section></main>`;
fs.writeFileSync(path.join(root, 'evidence-vault-index.html'), layout({ title: 'Evidence Vault Source Index | Matrix Reprogrammed', description: 'Generated Matrix Reprogrammed Evidence Vault source index for public-record source lanes, source cards, claim rules, and evidence boundaries.', body: indexBody, schema: articleSchema('Evidence Vault Source Index', 'Generated source index for the Evidence Vault.', 'evidence-vault-index.html') }));
generatedFiles.push('evidence-vault-index.html');

patchEvidenceVaultHome();
patchSearchIndex();
addPagesToSitemap(generatedFiles);
patchLlms(generatedFiles);
console.log(`Built Phase 3 Evidence Vault with ${(vault.sourceLanes || []).length} lanes, ${(vault.sourceCards || []).length} source cards, and ${generatedFiles.length} generated pages.`);
