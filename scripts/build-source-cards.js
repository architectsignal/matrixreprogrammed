const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2)); }
function esc(value='') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function slug(value='') { return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90); }
function clean(value='') { return String(value || '').replace(/\s+/g, ' ').trim(); }
function classify(item) {
  const text = [item.title, item.evidenceLevel, item.summary, item.evidenceBoundary].join(' ').toLowerCase();
  if (/conviction|plea|court finding|sentence/.test(text)) return 'Court finding / conviction lane';
  if (/court|habeas|filing|testimony|oversight|congress/.test(text)) return 'Court / oversight record lane';
  if (/settlement|nda|silence/.test(text)) return 'Settlement / silence-management lane';
  if (/email|contact|logistics|schedule|travel/.test(text)) return 'Email / contact / logistics lane';
  if (/news|reuters|guardian|business insider|journal/.test(text)) return 'Sourced reporting lane';
  return item.evidenceLevel || 'Public-record lead';
}
function boundaryFor(item, evidenceClass) {
  if (item.evidenceBoundary) return item.evidenceBoundary;
  if (/settlement/i.test(evidenceClass)) return 'A settlement or NDA may indicate silence management, but it is not automatic admission.';
  if (/contact|email|logistics/i.test(evidenceClass)) return 'Contact, email, scheduling, or logistics evidence does not by itself prove knowledge, intent, or criminal participation.';
  if (/court/i.test(evidenceClass)) return 'Court records must be separated by filing, allegation, ruling, plea, conviction, and appeal status.';
  return 'This source card is a public-record lead. It does not prove more than the linked source and evidence class support.';
}
function nav() { return `<header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="epstein-files.html">Epstein Files</a><a href="source-cards.html">Source Cards</a><a href="evidence-vault.html">Evidence Vault</a><a href="optin-center.html">Free Briefs</a><a href="amazon-store-books.html">Store</a></nav></header>`; }
function layout(title, desc, body) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="stylesheet" href="styles.css" /></head><body><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second.</p></footer></div><script src="analytics.js"></script></body></html>`; }
function cardHtml(card) { return `<article class="card redline source-card"><span class="label">${esc(card.date)} · ${esc(card.evidenceClass)}</span><h3>${esc(card.claim)}</h3><p>${esc(card.summary)}</p><p><strong>What the record supports:</strong> ${esc(card.recordSupports)}</p><p><strong>What it does not prove:</strong> ${esc(card.notProven)}</p><p><strong>Evidence boundary:</strong> ${esc(card.evidenceBoundary)}</p><div class="cta-row small"><a class="btn" href="${esc(card.sourceUrl)}">Open Source</a><a class="btn alt" href="${esc(card.evidenceRoute)}">Evidence Route</a><a class="btn alt" href="${esc(card.bookRoute)}">Book Route</a></div></article>`; }
function sourceCardsFromLiveIntel() {
  const live = readJson('data/live-intel.json', { items: [] });
  return (live.items || []).filter(item => item && item.title && item.url).slice(0, 40).map(item => {
    const evidenceClass = classify(item);
    return {
      id: item.id || slug(`${item.lane}-${item.title}`),
      lane: item.lane || 'public-record',
      date: String(item.published || item.date || '').slice(0,10) || 'undated',
      claim: item.title,
      sourceLabel: item.sourceLabel || item.laneTitle || 'Source',
      sourceUrl: item.url,
      summary: clean(item.summary || item.title),
      evidenceClass,
      recordSupports: clean(item.whyItMatters || item.summary || 'The linked source supports a public-record lead that should be checked before sharing.'),
      notProven: 'This card does not prove criminal guilt, knowledge, intent, or participation unless the source itself is a court finding, plea, conviction, or other binding record.',
      evidenceBoundary: boundaryFor(item, evidenceClass),
      peopleEntities: item.people || [],
      nextSourceToOpen: item.evidenceRoute || 'evidence-vault.html',
      evidenceRoute: item.evidenceRoute || 'evidence-vault.html',
      bookRoute: item.bookRoute || 'books.html',
      videoRoute: item.videoRoute || 'videos.html',
      optinRoute: item.optinRoute || 'optin-center.html',
      offerRoute: item.offerRoute || 'offer-center.html'
    };
  });
}
const cards = sourceCardsFromLiveIntel();
const output = {
  updated: new Date().toISOString(),
  purpose: 'Reusable source cards that turn public-record leads into claim/evidence/source/boundary/next-step cards.',
  rules: [
    'Claim strength must never exceed the source type.',
    'A name in a document is not proof of guilt.',
    'A settlement is not automatic admission.',
    'A contact, email, flight, or logistics record is not automatic knowledge or participation.',
    'Court findings, pleas, and convictions outrank reporting and commentary.'
  ],
  cards
};
writeJson('data/source-cards.json', output);
writeJson('downloads/source-cards.json', output);
const md = `# Source Cards\n\nReusable claim/source/evidence-boundary cards.\n\n${cards.map(c => `## ${c.claim}\n\n- Date: ${c.date}\n- Evidence class: ${c.evidenceClass}\n- Source: ${c.sourceUrl}\n- Record supports: ${c.recordSupports}\n- Not proven: ${c.notProven}\n- Boundary: ${c.evidenceBoundary}\n- Next: ${c.evidenceRoute}\n`).join('\n')}`;
fs.writeFileSync(path.join(root, 'downloads', 'source-cards.md'), md);
const body = `<main><section class="hero wrap"><div class="eyebrow">Evidence Cards</div><h1>SOURCE CARDS.</h1><p class="lead">Every serious claim needs a source, evidence class, boundary, and next document to open. These cards stop the archive turning into rumor.</p><div class="cta-row"><a class="btn" href="downloads/source-cards.json">Source Cards JSON</a><a class="btn alt" href="downloads/source-cards.md">Markdown Cards</a><a class="btn alt" href="epstein-files.html">Epstein Command Center</a></div></section><section class="section wrap split"><div class="terminal">SOURCE CARD STATUS\n&gt; Cards: ${cards.length}\n&gt; Evidence classes: ${new Set(cards.map(c=>c.evidenceClass)).size}\n&gt; Boundary: active\n&gt; Next-source routing: active</div><aside class="card redline"><h2>Evidence boundary</h2><p>A source card does not upgrade a claim. It tells the reader what the linked record supports, what it does not prove, and where to go next.</p></aside></section><section class="section wrap"><h2>Latest Source Cards</h2><div class="grid">${cards.map(cardHtml).join('')}</div></section></main>`;
fs.writeFileSync(path.join(root, 'source-cards.html'), layout('Source Cards | Matrix Reprogrammed', 'Claim, source, evidence boundary, and next-step cards for Matrix Reprogrammed public-record research.', body));
function patch(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return;
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('id="source-card-system"')) return;
  const section = `<section id="source-card-system" class="section wrap"><h2>Source Cards</h2><p class="lead">Open the source card before sharing a strong claim: source, evidence class, what the record supports, what it does not prove, and next document route.</p><div class="cta-row"><a class="btn" href="source-cards.html">Open Source Cards</a><a class="btn alt" href="downloads/source-cards.json">Source Cards JSON</a></div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(full, html);
}
['epstein-files.html','evidence-vault.html','live-intel.html','black-file.html'].forEach(patch);
function patchSitemap() {
  const full = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(full)) return;
  let xml = fs.readFileSync(full, 'utf8');
  if (!xml.includes('/source-cards.html')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/source-cards.html</loc><lastmod>${output.updated.slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>0.92</priority></url>\n</urlset>`);
  fs.writeFileSync(full, xml);
}
function patchLlms() {
  const full = path.join(root, 'llms.txt');
  if (!fs.existsSync(full)) return;
  let txt = fs.readFileSync(full, 'utf8');
  const lines = ['- /source-cards.html: reusable source/evidence-boundary cards.', '- /downloads/source-cards.json: machine-readable source-card export.', '- /downloads/source-cards.md: markdown source-card export.'];
  const missing = lines.filter(line => !txt.includes(line));
  if (missing.length) fs.writeFileSync(full, `${txt.trim()}\n\nSource Card System:\n${missing.join('\n')}\n`);
}
function patchSearch() {
  const full = path.join(root, 'search-index.json');
  if (!fs.existsSync(full)) return;
  const search = readJson('search-index.json', []);
  if (!search.some(item => item.url === 'source-cards.html')) search.push({ key: 'source-cards', title: 'Source Cards | Matrix Reprogrammed', subtitle: 'Evidence Boundary Cards', series: 'Source Card System', category: 'Evidence', url: 'source-cards.html', description: 'Claim, source, evidence class, boundary, and next-step cards.', keywords: ['source cards','evidence boundary','claim classifier','Epstein files','source trail'] });
  writeJson('search-index.json', search);
}
patchSitemap(); patchLlms(); patchSearch();
console.log(`Built Source Card System with ${cards.length} cards.`);
