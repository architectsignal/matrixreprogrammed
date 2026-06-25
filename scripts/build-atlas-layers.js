const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'atlas-layers.json');
if (!fs.existsSync(dataPath)) {
  console.log('No data/atlas-layers.json found. Skipping Atlas Layers build.');
  process.exit(0);
}
const atlasLayers = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const outFile = 'atlas-layers.html';

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="power-atlas.html">Power Atlas</a><a href="atlas-layers.html">Atlas Layers</a><a href="atlas-index.html">Atlas Nodes</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a><a href="search.html">Search</a></nav></header>`;
}
function layout({ title, description, body }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="fixes.css" /><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Dataset', name: title, description, dateModified: atlasLayers.updated || new Date().toISOString().slice(0,10), creator: { '@type': 'Organization', name: 'Matrix Reprogrammed' } })}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Atlas boundary: entries are public-record navigation leads, not accusations. Every relationship must be labelled by evidence type.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function entryCard(entry = {}) {
  return `<article class="card"><span class="label">${esc(entry.relationshipType || 'Atlas entry')}</span><h3>${esc(entry.name || 'Entry pending')}</h3><p><strong>${esc(entry.role || 'Role/source lane pending')}</strong></p><p>${esc(entry.why || 'This entry is ready for weekly source enrichment.')}</p><p><span class="pill">${esc(entry.evidenceClass || 'Source check pending')}</span><span class="pill">Checked: ${esc(entry.checked || atlasLayers.updated || 'pending')}</span></p>${entry.sourceUrl ? `<a class="btn alt" href="${esc(entry.sourceUrl)}">${esc(entry.sourceLabel || 'Open source')}</a>` : ''}</article>`;
}
function layerSection(layer) {
  const entries = Array.isArray(layer.entries) && layer.entries.length
    ? layer.entries.map(entryCard).join('')
    : `<article class="card"><span class="label">Update lane ready</span><h3>${esc(layer.title)} entries pending</h3><p>This layer is structurally ready. Add current entries with source link, date checked, evidence class, update rule, and relationship type before publishing as a live intelligence list.</p></article>`;
  return `<section id="layer-${esc(layer.slug)}" class="section wrap atlas-layer-section"><div class="split"><div><span class="label">Atlas Layer</span><h2>${esc(layer.title)}</h2><p class="lead">${esc(layer.definition)}</p></div><aside class="card redline"><h3>Update Rule</h3><p>${esc(layer.updateRule || 'Review weekly and replace stale entries.')}</p></aside></div><div class="grid">${entries}</div></section>`;
}
function patchSearchIndex() {
  const indexPath = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexPath)) return;
  const search = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!search.some(item => item.url === outFile)) {
    search.push({ key: 'atlas-layers', title: 'Atlas Layers', subtitle: 'Power Atlas', series: 'Power Atlas', category: 'Atlas Layers', url: outFile, description: atlasLayers.pageSubtitle || 'Living Atlas layer map.', keywords: ['atlas layers','people','institutions','operations','money flows','legal records','symbolic layer','human cost'] });
    fs.writeFileSync(indexPath, JSON.stringify(search, null, 2));
  }
}
function patchSitemap() {
  const sitemapPath = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return;
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  if (!xml.includes(`/${outFile}</loc>`)) {
    xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/${outFile}</loc><lastmod>${esc(atlasLayers.updated || '2026-06-25')}</lastmod><changefreq>weekly</changefreq><priority>0.88</priority></url>\n</urlset>`);
    fs.writeFileSync(sitemapPath, xml);
  }
}
function patchLlms() {
  const llmsPath = path.join(root, 'llms.txt');
  if (!fs.existsSync(llmsPath)) return;
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('/atlas-layers.html')) {
    llms = `${llms.trim()}\n- /atlas-layers.html: living Power Atlas layer map for entity-page routing and weekly source checks.\n`;
    fs.writeFileSync(llmsPath, llms);
  }
}

const layerNav = (atlasLayers.layers || []).map(layer => `<a class="btn alt" href="#layer-${esc(layer.slug)}">${esc(layer.title)}</a>`).join('');
const body = `<main><section class="hero wrap"><div class="eyebrow">Power Atlas</div><h1>ATLAS LAYERS.</h1><p class="lead">${esc(atlasLayers.pageSubtitle || 'A living public-record map for entity pages, source checks, and reader navigation.')}</p><div class="cta-row"><a class="btn" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="atlas-index.html">Atlas Nodes</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt machine-data-link" href="data/atlas-layers.json">Machine-readable data</a></div></section><section class="section wrap split"><div class="terminal">ATLAS LAYER STATUS\n&gt; Layers: ${(atlasLayers.layers || []).length}\n&gt; Update cadence: ${esc(atlasLayers.updateCadence || 'weekly')}\n&gt; Date checked: ${esc(atlasLayers.updated || 'pending')}\n&gt; Entity-page rule: active\n&gt; Relationship labels required</div><aside class="card redline"><h2>Entity Page Rule</h2><p>${esc(atlasLayers.entityPageRule || 'Every future entity page must attach to one or more Atlas Layers.')}</p><p>${esc(atlasLayers.boundary || 'Atlas entries are navigation leads, not accusations.')}</p></aside></section><section class="section wrap"><h2>Layer Navigation</h2><div class="cta-row small">${layerNav}</div></section>${(atlasLayers.layers || []).map(layerSection).join('')}</main>`;

fs.writeFileSync(path.join(root, outFile), layout({ title: 'Atlas Layers | Matrix Reprogrammed', description: atlasLayers.pageSubtitle || 'Living Power Atlas layer map.', body }));
patchSearchIndex();
patchSitemap();
patchLlms();
console.log(`Built Atlas Layers page with ${(atlasLayers.layers || []).length} layers.`);
