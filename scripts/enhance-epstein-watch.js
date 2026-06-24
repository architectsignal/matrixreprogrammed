const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-evidence-watch.json');
const pageFile = path.join(root, 'epstein-files.html');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile)) {
  console.log('No Epstein watch data found. Skipping enhancer.');
  process.exit(0);
}
if (!fs.existsSync(pageFile)) {
  console.log('No epstein-files.html found yet. Skipping enhancer.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-source-watch.json';
const mdOut = 'downloads/epstein-evidence-watch.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(root, mdOut), [
  '# Epstein Evidence Watch',
  '',
  `Updated: ${data.updated || '2026-06-24'}`,
  '',
  '## Evidence Boundary',
  data.boundary || '',
  '',
  '## Source Lanes',
  ...(data.watchSources || []).map(source => `- ${source.title}: ${source.sourceUrl}`),
  '',
  '## Dated Bulletins',
  ...(data.bulletins || []).map(item => `- ${item.date} — ${item.title}: ${item.summary}`),
  '',
  '## Reader Route',
  `- Free brief: ${data.moneyRoutes && data.moneyRoutes.optin || 'optin-black-file-brief.html'}`,
  `- Offer: ${data.moneyRoutes && data.moneyRoutes.offer || 'offer-starter-library.html'}`,
  `- Store: ${data.moneyRoutes && data.moneyRoutes.store || 'amazon-store-books.html'}`,
  `- Video: ${data.moneyRoutes && data.moneyRoutes.video || 'videos.html'}`
].join('\n'));

const sourceCards = (data.watchSources || []).map(source => `<article class="card redline"><span class="label">${esc(source.type)} · ${esc(source.priority)}</span><h3>${esc(source.title)}</h3><p>${esc(source.use)}</p><div class="cta-row small"><a class="btn" href="${esc(source.sourceUrl)}">Open Source</a><a class="btn alt" href="${esc(source.route)}">Site Route</a></div></article>`).join('');
const bulletinCards = (data.bulletins || []).map(item => `<article class="news-item"><span class="figure-caption">${esc(item.date)} · ${esc(item.label)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="cta-row small"><a class="btn" href="${esc(item.sourceRoute)}">Source Route</a><a class="btn alt" href="${esc(item.videoRoute)}">Video Route</a><a class="btn alt" href="${esc(item.offerRoute)}">Book Route</a></div></article>`).join('');
const routes = data.moneyRoutes || {};
const section = `<section id="epstein-watch-enhanced" class="section wrap"><h2>Source Watch / Freedom Intelligence Engine</h2><p class="lead">This hub turns public-record updates into dated bulletins, source lanes, downloads, Rumble/video routes, free briefs, offers, book pages, and Amazon store paths.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Source Watch JSON</a><a class="btn alt" href="${mdOut}">Markdown Brief</a><a class="btn alt" href="${esc(routes.video || 'videos.html')}">Rumble Channels</a><a class="btn alt" href="${esc(routes.store || 'amazon-store-books.html')}">Books / Store</a></div><div class="terminal">EPSTEIN WATCH STATUS\n&gt; Source lanes: ${(data.watchSources || []).length}\n&gt; Bulletins: ${(data.bulletins || []).length}\n&gt; Opt-in route: ${esc(routes.optin || 'optin-black-file-brief.html')}\n&gt; Offer route: ${esc(routes.offer || 'offer-starter-library.html')}\n&gt; Store route: ${esc(routes.store || 'amazon-store-books.html')}\n&gt; Video route: ${esc(routes.video || 'videos.html')}</div><h2>Document And Source Lanes</h2><div class="grid">${sourceCards}</div><h2>Dated Bulletins</h2>${bulletinCards}</section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (!html.includes('id="epstein-watch-enhanced"')) {
  html = html.replace('</main>', `${section}</main>`);
}
html = html.replace('A live public-record hub for Epstein file drops, elite connections, trafficking evidence, court records, Maxwell case materials, flight-log references, institutional failure, occult-symbolism claims, and evidence-boundary analysis.', 'A source-first public-record hub for document drops, court records, official releases, archive material, dated bulletins, Rumble/video routes, free briefs, offers, and book paths.');
fs.writeFileSync(pageFile, html);

console.log(`Enhanced Epstein Evidence Watch with ${(data.watchSources || []).length} source lanes, ${(data.bulletins || []).length} bulletins, and download outputs.`);
