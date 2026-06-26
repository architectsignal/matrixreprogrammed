const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } }
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value = '') { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="daily-drop.html">Daily Drop</a><a href="source-document-vault.html">Actual Files</a><a href="claim-classifier.html">Claim Classifier</a><a href="network-search.html">Network Search</a><a href="epstein-files.html">Epstein</a><a href="evidence-vault.html">Evidence Vault</a></nav></header>`; }
function layout(title, desc, body) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description:desc,dateModified:new Date().toISOString()})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — actual files first, commentary second.</p><p class="warning">Document boundary: opening a file route is not a verdict. Classify the record before drawing a conclusion.</p></footer></div><script src="matrix.js"></script></body></html>`; }

const cockpit = readJson('data/epstein-file-cockpit.json', { updated: new Date().toISOString(), doors: [], howToUse: [] });
const evidenceVault = readJson('data/evidence-vault.json', { sourceCards: [], sourceLanes: [], sourceHierarchy: [] });
const sourceCards = evidenceVault.sourceCards || [];
const doors = [
  ...(cockpit.doors || []).map((door, index) => ({
    id: `epstein-door-${index + 1}`,
    title: clean(door.title),
    evidenceClass: clean(door.evidenceClass || 'Public source route'),
    url: door.url,
    use: clean(door.use),
    bestFor: clean(door.bestFor),
    lane: 'Epstein / elite-network actual-file door',
    route: 'epstein-files.html#epstein-top-file-doors',
    classifierRoute: 'claim-classifier.html',
    evidenceRoute: 'evidence-vault.html'
  })),
  ...sourceCards.slice(0, 16).map(card => ({
    id: `source-card-${card.slug}`,
    title: clean(card.title),
    evidenceClass: clean(card.sourceType || card.evidenceClass || 'Source card'),
    url: card.url,
    use: clean(card.useFor || card.use || card.description || 'Open this public source route and classify what the record supports.'),
    bestFor: clean(card.bestFor || card.description || card.useFor || 'Source-card research route.'),
    lane: clean(card.relatedLane || 'Evidence Vault'),
    route: `source-${card.slug}.html`,
    classifierRoute: 'claim-classifier.html',
    evidenceRoute: 'evidence-vault.html'
  }))
].filter(door => door.title && /^https?:\/\//i.test(String(door.url || '')));

const sourceDocumentVault = {
  updated: new Date().toISOString(),
  purpose: 'Actual-files-first public source vault for Matrix Reprogrammed. It gives readers direct source doors before interpretation, books, videos, or speculation.',
  boundary: cockpit.boundary || 'A document route is a starting point, not a conclusion.',
  howToUse: cockpit.howToUse || [],
  count: doors.length,
  doors
};
fs.writeFileSync(path.join(root, 'downloads', 'source-document-vault.json'), JSON.stringify(sourceDocumentVault, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'source-document-vault.md'), `# Source Document Vault\n\nUpdated: ${sourceDocumentVault.updated}\n\n${sourceDocumentVault.boundary}\n\n## How To Use\n\n${(sourceDocumentVault.howToUse || []).map(x => `- ${x}`).join('\n')}\n\n## Source Doors\n\n${doors.map(door => `### ${door.title}\n\n- Evidence class: ${door.evidenceClass}\n- Lane: ${door.lane}\n- Use: ${door.use}\n- Best for: ${door.bestFor}\n- URL: ${door.url}\n- Evidence route: ${door.evidenceRoute}\n- Classifier: ${door.classifierRoute}\n`).join('\n')}\n`);

function doorCards() {
  return doors.map(door => `<article class="card redline source-door" data-source-door="true" data-search="${esc([door.title, door.evidenceClass, door.use, door.bestFor, door.lane].join(' ').toLowerCase())}"><span class="label">${esc(door.evidenceClass)}</span><h3>${esc(door.title)}</h3><p><strong>Use:</strong> ${esc(door.use)}</p><p><strong>Best for:</strong> ${esc(door.bestFor)}</p><p><strong>Boundary:</strong> Open the file first. Do not treat a search hit, contact, mention, or archive result as a verdict.</p><div class="cta-row small"><a class="btn" href="${esc(door.url)}">Open Actual Source</a><a class="btn alt" href="${esc(door.route)}">Site Route</a><a class="btn alt" href="${esc(door.evidenceRoute)}">Evidence Vault</a><a class="btn alt" href="${esc(door.classifierRoute)}">Classify Claim</a></div></article>`).join('');
}
function howToUseCards() { return (sourceDocumentVault.howToUse || []).map(step => `<article class="card"><span class="label">Source discipline</span><p>${esc(step)}</p></article>`).join(''); }
const body = `<main><section class="hero wrap"><div class="eyebrow">Actual Files First</div><h1>SOURCE DOCUMENT VAULT.</h1><p class="lead">A public source-door vault for readers who want the actual files before commentary: official disclosures, congressional records, court dockets, archive searches, financial databases, influence records, political-money routes, and offshore-entity searches.</p><div class="cta-row"><a class="btn" href="downloads/source-document-vault.json">Vault JSON</a><a class="btn alt" href="downloads/source-document-vault.md">Vault Markdown</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a><a class="btn alt" href="epstein-files.html">Epstein Command Center</a></div></section><section class="section wrap split"><div class="terminal">SOURCE DOCUMENT VAULT STATUS\n&gt; Updated: ${esc(sourceDocumentVault.updated)}\n&gt; Source doors: ${doors.length}\n&gt; Epstein actual-file doors: ${(cockpit.doors || []).length}\n&gt; Evidence Vault cards imported: ${sourceCards.slice(0,16).length}\n&gt; Rule: actual file first, evidence class second, network interpretation third</div><aside class="card redline"><h2>Reader Rule</h2><p>${esc(sourceDocumentVault.boundary)}</p></aside></section><section class="section wrap"><h2>How To Use The Vault</h2><div class="grid">${howToUseCards()}</div></section><section class="section wrap"><h2>Search Source Doors</h2><div class="card redline"><label class="label" for="source-door-search">Search actual files, evidence class, source lane, use case</label><input id="source-door-search" data-source-door-search="true" type="search" placeholder="Search DOJ, court records, emails, WikiLeaks, FBI Vault, SEC, FARA, OpenSecrets, ICIJ..." style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(0,255,102,.35);background:#050805;color:#eaffef;margin-top:10px;" /></div></section><section class="section wrap"><h2>Actual File Doors</h2><div class="grid">${doorCards()}</div></section><script>(function(){const input=document.querySelector('[data-source-door-search]');const cards=[...document.querySelectorAll('[data-source-door]')];if(!input)return;input.addEventListener('input',()=>{const q=input.value.toLowerCase();cards.forEach(card=>{card.style.display=!q||card.dataset.search.includes(q)?'':'none';});});})();</script></main>`;
write('source-document-vault.html', layout('Source Document Vault | Matrix Reprogrammed', 'Actual-files-first public source vault for Epstein records, court records, archives, financial routes, influence records, and evidence classification.', body));

function patchPage(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('id="source-document-vault-route"')) return;
  const section = `<section id="source-document-vault-route" class="section wrap"><h2>Actual Files First</h2><p class="lead">Open the source door before the interpretation. The Source Document Vault routes readers to official disclosures, courts, archives, financial records, influence records, and evidence classification.</p><div class="cta-row"><a class="btn" href="source-document-vault.html">Open Source Document Vault</a><a class="btn alt" href="downloads/source-document-vault.json">Vault JSON</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a></div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(p, html);
}
for (const file of ['index.html','daily-drop.html','epstein-files.html','network-search.html','claim-classifier.html','evidence-vault.html','download-center.html','live-intel.html','news.html','books.html']) patchPage(file);
function patchSitemap() {
  const p = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(p)) return;
  let xml = fs.readFileSync(p, 'utf8');
  if (!xml.includes('/source-document-vault.html</loc>')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/source-document-vault.html</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.96</priority></url>\n</urlset>`);
  fs.writeFileSync(p, xml);
}
function patchLlms() {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return;
  let txt = fs.readFileSync(p, 'utf8');
  if (!txt.includes('/source-document-vault.html')) txt += `\n\nSource Document Vault:\n- /source-document-vault.html: actual-files-first source-door vault for official disclosures, court records, archives, financial routes, influence records, and evidence classification.\n- /downloads/source-document-vault.json: machine-readable source-door vault.\n- /downloads/source-document-vault.md: human-readable source-door brief.\n`;
  fs.writeFileSync(p, txt);
}
function patchSearchIndex() {
  const p = path.join(root, 'search-index.json');
  if (!fs.existsSync(p)) return;
  const index = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!index.some(item => item.url === 'source-document-vault.html')) index.push({ key:'source-document-vault', title:'Source Document Vault', subtitle:'Actual files first', series:'Matrix Reprogrammed', category:'Evidence System', url:'source-document-vault.html', description:'Actual-files-first source vault for official disclosures, court records, archives, financial routes, influence records, and evidence classification.', keywords:['source document vault','actual files','official disclosures','court records','Epstein files','archives','financial records','source doors'] });
  fs.writeFileSync(p, JSON.stringify(index, null, 2));
}
patchSitemap();
patchLlms();
patchSearchIndex();
console.log(`Source Document Vault built: ${doors.length} source doors, page patches, downloads, sitemap, llms, and search index.`);

try {
  require('./deep-cleanup-pass.js');
} catch (err) {
  console.error('Deep cleanup pass failed after Source Document Vault build.');
  throw err;
}
