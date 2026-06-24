const fs = require('fs');
const path = require('path');
const root = process.cwd();
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function readJson(rel){const p=path.join(root,rel);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;}
const file = path.join(root,'epstein-files.html');
if (fs.existsSync(file)) {
  const watch = readJson('data/epstein-watch.json');
  const docs = readJson('data/epstein-docs.json');
  let html = fs.readFileSync(file,'utf8');
  if ((watch || docs) && !html.includes('id="epstein-deep-drop-feed"')) {
    const top = (watch && watch.topFigure) || {};
    const bullets = watch && Array.isArray(watch.bulletins) ? watch.bulletins : [];
    const lanes = watch && Array.isArray(watch.watchLanes) ? watch.watchLanes : [];
    const documents = docs && Array.isArray(docs.documents) ? docs.documents : [];
    const topBox = `<section id="epstein-command-top" class="section wrap"><div class="card redline"><span class="figure-caption">${esc(top.label || 'Signal baseline')}</span><strong class="figure-block digital-clock">${esc(top.figure || 'WATCH ACTIVE')}</strong><p><strong>${esc(top.subfigure || '')}</strong></p><p>${esc(top.note || '')}</p><p><span class="pill">${esc(top.sourceLabel || '')}</span><span class="pill">Updated ${esc((watch && watch.updated) || '')}</span></p></div></section>`;
    const cards = bullets.map(b => `<article class="news-item redline"><span class="label">${esc(b.label || 'File Watch')} · ${esc(b.date || '')}</span><span class="figure-caption">${esc(b.risk || 'Watch Lane')}</span><h3>${esc(b.headline || '')}</h3><p>${esc(b.summary || '')}</p><p><strong>Why it matters:</strong> ${esc(b.why || '')}</p><p><span class="pill">${esc(b.evidenceClass || 'Evidence boundary')}</span></p><p class="source-list">${esc(b.sourceLabel || '')}</p><div class="cta-row small"><a class="btn" href="${esc(b.path || 'epstein-files.html')}">Open Command Center</a></div></article>`).join('');
    const feed = `<section id="epstein-deep-drop-feed" class="section wrap"><h2>Deep Drop Bulletin Feed</h2><p class="lead">A source-led watch feed for new records, document movement, archive material, court filings, public releases, and reputable reporting. Every item is classified before publication.</p><div class="grid">${cards}</div></section>`;
    const docCards = documents.map(d => `<article class="card redline"><span class="label">${esc(d.type || 'Document')}</span><span class="figure-caption">${esc(d.evidenceClass || 'Evidence class')}</span><h3>${esc(d.title || '')}</h3><p>${esc(d.description || '')}</p><div class="cta-row small"><a class="btn" href="${esc(d.url || 'epstein-files.html')}" target="${/^https?:/i.test(d.url || '') ? '_blank' : '_self'}" rel="noopener">${esc(d.button || 'Open Source')}</a></div></article>`).join('');
    const docVault = `<section id="epstein-document-vault" class="section wrap"><h2>Document Vault</h2><p class="lead">Download and source routes for official records, court filings, public archive material, exhibit searches, flight-log references, and government releases. The vault links to source pages rather than republishing private contact data.</p><div class="grid">${docCards}</div></section>`;
    const boundary = `<section id="black-book-boundary" class="section wrap"><div class="card redline"><h2>Black Book Boundary</h2><p>The Command Center may analyze the existence, provenance, and public-record relevance of address-book material. It does not republish private addresses, phone numbers, private emails, private victim details, or raw contact data. Being listed in any address book is not proof of wrongdoing.</p></div></section>`;
    const laneCards = lanes.map(l => `<article class="card"><h3>${esc(l)}</h3><p>Tracked as a separate evidence lane. New material must be sourced and classified before publication.</p></article>`).join('');
    const laneSection = `<section id="epstein-watch-lanes" class="section wrap"><h2>Deep Search Lanes</h2><div class="grid">${laneCards}</div></section>`;
    html = html.replace(/<section class="section wrap"><h2>Bulletin Template For Every Drop<\/h2>/, `${topBox}${feed}${docVault}${boundary}${laneSection}<section class="section wrap"><h2>Bulletin Template For Every Drop</h2>`);
    fs.writeFileSync(file, html);
    console.log('Watch Center enhanced: epstein-files.html');
  }
}
