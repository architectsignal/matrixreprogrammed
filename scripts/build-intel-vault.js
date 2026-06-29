const fs = require('fs');
const path = require('path');

const root = process.cwd();
const vaultPath = path.join(root, 'data', 'intel-vault.json');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value = '') {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function patchText(file, marker, block) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes(marker)) return;
  write(file, `${text.trim()}\n${block}\n`);
}

const vault = readJson('data/intel-vault.json', {
  updated: new Date().toISOString(),
  title: 'Intel Vault',
  purpose: 'Archived daily-update cards that expired out of the active seven-day window.',
  boundary: 'Vault items are historical public-source leads. Re-check the source before treating them as current or before upgrading any claim.',
  items: []
});

const items = (vault.items || []).slice(0, 300);
const byLane = new Map();
for (const item of items) {
  const lane = item.laneTitle || item.lane || 'Unclassified';
  if (!byLane.has(lane)) byLane.set(lane, []);
  byLane.get(lane).push(item);
}

const cards = items.map(item => `<article class="news-item"><span class="figure-caption">${esc(String(item.published || '').slice(0, 10) || 'undated')} · archived ${esc(String(item.archivedAt || '').slice(0, 10) || 'unknown')} · ${esc(item.laneTitle || item.lane || 'source lane')}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary || '')}</p><div class="grid"><div class="card"><span class="label">Archive Reason</span><h3>${esc(item.archiveReason || 'expired')}</h3><p>Archived items are preserved for research but are not current alerts.</p></div><div class="card"><span class="label">Evidence Boundary</span><h3>${esc(item.evidenceLevel || 'Historical source lead')}</h3><p>${esc(item.evidenceBoundary || vault.boundary)}</p></div></div><div class="cta-row small"><a class="btn" href="${esc(item.url || '#')}">Open Source</a><a class="btn alt" href="${esc(item.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a><a class="btn alt" href="live-intel.html">Current Live Intel</a></div></article>`).join('') || '<article class="card"><h3>No archived cards yet</h3><p>Expired daily update cards will appear here after they age out of the seven-day live window.</p></article>';

const laneStats = Array.from(byLane.entries()).map(([lane, list]) => `<article class="card"><span class="label">Vault Lane</span><h3>${esc(list.length)}</h3><p>${esc(lane)}</p></article>`).join('') || '<article class="card"><h3>0</h3><p>No archived lanes yet.</p></article>';

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Intel Vault | Matrix Reprogrammed</title><meta name="description" content="Archive of expired seven-day intelligence cards. Historical public-source leads are preserved here after leaving the live update window." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="intel-vault.html">Intel Vault</a><a href="epstein-files.html">Epstein</a><a href="control-system-tracker.html">Control Tracker</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Archive / Expired Daily Cards</div><h1>INTEL VAULT.</h1><p class="lead">${esc(vault.purpose)}</p><div class="cta-row"><a class="btn" href="downloads/intel-vault.json">Vault JSON</a><a class="btn alt" href="downloads/intel-vault.md">Vault Markdown</a><a class="btn alt" href="downloads/seven-day-intel.json">Current seven-day data</a><a class="btn alt" href="live-intel.html">Current Live Intel</a></div></section><section class="section wrap split"><div class="terminal">VAULT RULE\n&gt; 0–7 days: Live Intel\n&gt; 8+ days: Intel Vault\n&gt; Old card is not a current update\n&gt; Re-check source before sharing\n&gt; Boundary stays attached</div><aside class="card redline"><h2>Boundary</h2><p>${esc(vault.boundary)}</p></aside></section><section class="section wrap"><h2>Vault Stats</h2><div class="grid">${laneStats}</div></section><section class="section wrap"><h2>Archived Daily Update Cards</h2>${cards}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — current updates expire into the archive. The source route remains visible.</p><p class="warning">Vault items are historical leads, not active alerts or proof of wrongdoing.</p></footer></div><script src="matrix.js"></script></body></html>`;
write('intel-vault.html', html);
write('downloads/intel-vault.json', JSON.stringify(vault, null, 2));

const md = ['# Intel Vault', '', `Updated: ${vault.updated}`, '', '## Boundary', vault.boundary, '', '## Archived Items', '', ...items.map(item => `### ${item.title}\n\n- Published: ${item.published || 'unknown'}\n- Archived: ${item.archivedAt || 'unknown'}\n- Lane: ${item.laneTitle || item.lane || 'unknown'}\n- Source: ${item.url || 'missing'}\n- Reason: ${item.archiveReason || 'expired'}\n\n${item.summary || ''}\n`)].join('\n');
write('downloads/intel-vault.md', md);

const searchPath = path.join(root, 'search-index.json');
if (fs.existsSync(searchPath)) {
  const index = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
  if (!index.some(item => item.url === 'intel-vault.html')) {
    index.push({
      key: 'intel-vault',
      title: 'Intel Vault',
      subtitle: 'Expired daily-update archive',
      series: 'Live Intel',
      category: 'Archive',
      url: 'intel-vault.html',
      description: 'Archive of expired seven-day intelligence cards preserved as historical source leads.',
      keywords: ['intel vault', 'archive', 'expired updates', 'daily updates', 'source leads', 'Epstein File Watch']
    });
    write('search-index.json', JSON.stringify(index, null, 2));
  }
}

const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  if (!xml.includes('/intel-vault.html</loc>')) {
    xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/intel-vault.html</loc><lastmod>${String(vault.updated || new Date().toISOString()).slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>0.82</priority></url>\n</urlset>`);
    write('sitemap.xml', xml);
  }
}

patchText('llms.txt', '/intel-vault.html', '\nIntel Vault:\n- /intel-vault.html: archive of expired seven-day intelligence cards. Old daily updates move here after seven days and must not be displayed as current alerts.\n- /downloads/intel-vault.json: machine-readable archived public-source leads.');
console.log(`Built Intel Vault with ${items.length} archived item(s).`);
