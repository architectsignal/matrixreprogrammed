const fs = require('fs');
const path = require('path');
const root = process.cwd();
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function json(parts){const p=path.join(root, ...parts); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : null;}
const page = path.join(root, ['epstein','files'].join('-') + '.html');
if (!fs.existsSync(page)) process.exit(0);
let html = fs.readFileSync(page,'utf8');
const watch = json(['data','epstein-watch.json']);
const docs = json(['data','epstein-docs.json']);
if (watch && !html.includes('id="epstein-deep-drop-feed"')) {
  const top = watch.topFigure || {};
  const topBox = `<section id="epstein-command-top" class="section wrap"><div class="digital-figure redline"><span>${esc(top.label||'Signal baseline')}</span><strong>${esc(top.figure||'WATCH ACTIVE')}</strong><em>${esc(top.subfigure||'')}</em><p>${esc(top.note||'')}</p><p><span class="pill">${esc(top.sourceLabel||'')}</span><span class="pill">Updated ${esc(watch.updated||'')}</span></p></div></section>`;
  const bullets = Array.isArray(watch.bulletins) ? watch.bulletins : [];
  const cards = bullets.map(b => `<article class="news-item redline"><span class="label">${esc(b.label||'File Watch')} · ${esc(b.date||'')}</span><span class="figure-caption">${esc(b.risk||'Watch Lane')}</span><h3>${esc(b.headline||'')}</h3><p>${esc(b.summary||'')}</p><p><strong>Why it matters:</strong> ${esc(b.why||'')}</p><p><span class="pill">${esc(b.evidenceClass||'Evidence boundary')}</span></p><p class="source-list">${esc(b.sourceLabel||'')}</p><a class="btn" href="${esc(b.path||'epstein-files.html')}">Open Command Center</a></article>`).join('');
  const feed = `<section id="epstein-deep-drop-feed" class="section wrap"><h2>Deep Drop Bulletin Feed</h2><p class="lead">A source-led feed for new records, source movement, archive material, court filings, public releases, and reputable reporting. Every item is classified before publication.</p><div class="grid">${cards}</div></section>`;
  const lanes = Array.isArray(watch.watchLanes) ? watch.watchLanes : [];
  const laneCards = lanes.map(l => `<article class="card"><h3>${esc(l)}</h3><p>Tracked as a separate evidence lane. New material must be sourced and classified before publication.</p></article>`).join('');
  const laneSection = `<section id="epstein-watch-lanes" class="section wrap"><h2>Deep Search Lanes</h2><div class="grid">${laneCards}</div></section>`;
  html = html.replace(/<section class="section wrap"><h2>Bulletin Template For Every Drop<\/h2>/, `${topBox}${feed}${laneSection}<section class="section wrap"><h2>Bulletin Template For Every Drop</h2>`);
}
if (docs && !html.includes('id="epstein-document-vault"')) {
  const items = Array.isArray(docs.documents) ? docs.documents : [];
  const cards = items.map(d => `<article class="vault-card"><span class="label">${esc(d.type||'Document')} · ${esc(d.evidenceClass||'Source')}</span><h3>${esc(d.title||'')}</h3><p>${esc(d.description||'')}</p><a class="btn" href="${esc(d.url||'#')}" target="${/^https?:/i.test(d.url||'')?'_blank':'_self'}" rel="noopener">${esc(d.button||'Open Source')}</a></article>`).join('');
  const vault = `<section id="epstein-document-vault" class="section wrap"><h2>Document Vault</h2><p class="lead">Direct routes to source pages, official releases, archive indexes, file drops, exhibit searches, and public document lanes.</p><div id="black-book-boundary" class="card redline"><h3>Black Book Boundary</h3><p>This source lane treats address-directory material as a provenance and documented-association question. A listing is not proof of wrongdoing.</p></div><div class="vault-grid">${cards}</div></section>`;
  html = html.replace(/<section class="section wrap"><h2>Evidence Classification<\/h2>/, `${vault}<section class="section wrap"><h2>Evidence Classification</h2>`);
}
if (!html.includes('id="black-book-boundary"')) {
  html = html.replace('</main>', `<section id="black-book-boundary" class="section wrap"><h2>Black Book Boundary</h2><p class="lead">Address-directory material is treated as a provenance and documented-association lane. A listing is not proof of wrongdoing.</p></section></main>`);
}
fs.writeFileSync(page, html);
console.log('Command center enhanced');
