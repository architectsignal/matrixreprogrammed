const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-evidence-watch.json');
const emailSignalsFile = path.join(root, 'data', 'epstein-email-signals.json');
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
const emailSignals = fs.existsSync(emailSignalsFile) ? JSON.parse(fs.readFileSync(emailSignalsFile, 'utf8')) : { primaryResearchRoutes: [], signals: [] };
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-source-watch.json';
const mdOut = 'downloads/epstein-evidence-watch.md';
const emailJsonOut = 'downloads/epstein-email-signals.json';
const emailMdOut = 'downloads/epstein-email-signals.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(root, emailJsonOut), JSON.stringify(emailSignals, null, 2));
fs.writeFileSync(path.join(root, mdOut), [
  '# Epstein Evidence Watch',
  '',
  `Updated: ${data.updated || '2026-06-25'}`,
  '',
  '## Evidence Boundary',
  data.boundary || '',
  '',
  '## Source Lanes',
  ...(data.watchSources || []).map(source => `- ${source.title}: ${source.sourceUrl}`),
  '',
  '## Latest Epstein Bulletins',
  ...(data.bulletins || []).map(item => `- ${item.date} — ${item.title}: ${item.summary}`),
  '',
  '## Reader Route',
  `- Free brief: ${data.moneyRoutes && data.moneyRoutes.optin || 'optin-black-file-brief.html'}`,
  `- Offer: ${data.moneyRoutes && data.moneyRoutes.offer || 'offer-starter-library.html'}`,
  `- Store: ${data.moneyRoutes && data.moneyRoutes.store || 'amazon-store-books.html'}`,
  `- Video: ${data.moneyRoutes && data.moneyRoutes.video || 'videos.html'}`
].join('\n'));
fs.writeFileSync(path.join(root, emailMdOut), [
  '# Epstein Email Signal Map',
  '',
  `Updated: ${emailSignals.updated || data.updated || '2026-06-25'}`,
  '',
  '## Boundary',
  emailSignals.boundary || data.boundary || '',
  '',
  '## Actual File / Research Routes',
  ...(emailSignals.primaryResearchRoutes || []).map(route => `- ${route.title}: ${route.url} — ${route.use}`),
  '',
  '## Most Telling Signals',
  ...(emailSignals.signals || []).map(item => `- ${item.rank}. ${item.title}: ${item.whatItSupports} Boundary: ${item.whatItDoesNotProve}`)
].join('\n'));

const sourceCards = (data.watchSources || []).map(source => `<article class="card redline"><span class="label">${esc(source.type)} · ${esc(source.priority)}</span><h3>${esc(source.title)}</h3><p>${esc(source.use)}</p><div class="cta-row small"><a class="btn" href="${esc(source.sourceUrl)}">Open Source</a><a class="btn alt" href="${esc(source.route)}">Site Route</a></div></article>`).join('');
const bulletinCards = (data.bulletins || []).map(item => `<article class="news-item"><span class="figure-caption">${esc(item.date)} · ${esc(item.label)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="cta-row small"><a class="btn" href="${esc(item.sourceRoute)}">Source Route</a><a class="btn alt" href="${esc(item.videoRoute)}">Video Route</a><a class="btn alt" href="${esc(item.offerRoute)}">Book Route</a></div></article>`).join('');
const primaryRouteCards = (emailSignals.primaryResearchRoutes || []).map(route => `<article class="card redline"><span class="label">Actual files / research route</span><h3>${esc(route.title)}</h3><p>${esc(route.use)}</p><a class="btn" href="${esc(route.url)}" target="_blank" rel="noopener">Open Actual File Route</a></article>`).join('');
const emailSignalCards = (emailSignals.signals || []).map(item => `<article class="card redline"><span class="label">Email Signal ${esc(item.rank)} · ${esc(item.recordType)}</span><h3>${esc(item.title)}</h3><p><strong>People / entities:</strong> ${esc((item.people || []).join(' · '))}</p><p><strong>What the file supports:</strong> ${esc(item.whatItSupports)}</p><p><strong>Boundary:</strong> ${esc(item.whatItDoesNotProve)}</p><p><strong>Why it matters:</strong> ${esc(item.whyItMatters)}</p><div class="cta-row small">${(item.links || []).map(link => `<a class="btn alt" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join('')}</div></article>`).join('');
const routes = data.moneyRoutes || {};
const evidenceBoundary = `<section id="epstein-evidence-boundary" class="section wrap"><h2>Evidence Boundary</h2><p class="lead">${esc(data.boundary || 'This hub tracks public records, court records, official releases, source pages, news bulletins, archive links, committee activity, and litigation movement. A named person appearing in a public record is not by itself proof of criminal conduct.')}</p><div class="terminal">EVIDENCE BOUNDARY\n&gt; If it is in the files, the document/item is supported\n&gt; A document mention proves the mention exists\n&gt; A contact proves contact, not automatic guilt\n&gt; A flight/log entry proves a record trail, not automatic motive\n&gt; A sworn claim is stronger than rumor but still must be tested\n&gt; A conviction, plea, court finding, or authenticated exhibit carries the highest weight</div></section>`;
const emailSection = `<section id="epstein-email-signals" class="section wrap"><h2>Most Telling Epstein Emails / Network Signals</h2><p class="lead">The purpose of this Command Center is to expose the network using the files themselves: emails, schedules, ledgers, testimony, court exhibits, visitor/contact records, travel records, and committee releases. The aggressive method is simple: document the record, classify what it proves, then map the function: access, leverage, reputation repair, legal pressure, money, logistics, silence, and institutional protection.</p><div class="cta-row"><a class="btn" href="${emailJsonOut}">Email Signals JSON</a><a class="btn alt" href="${emailMdOut}">Email Signals Brief</a><a class="btn alt" href="https://jmail.world" target="_blank" rel="noopener">Open Jmail</a><a class="btn alt" href="https://search.wikileaks.org/?query=Epstein" target="_blank" rel="noopener">WikiLeaks Search</a></div><h2>Actual File / Research Routes</h2><div class="grid">${primaryRouteCards}</div><h2>Network Signal Cards</h2><div class="grid">${emailSignalCards}</div><div class="terminal">NETWORK EXPOSURE METHOD\n&gt; Person named in file = documented record item\n&gt; Repeated communication = relationship-frequency signal\n&gt; Scheduling/logistics = operational support signal\n&gt; Money/charity/access = influence-routing signal\n&gt; NDA/settlement/legal threat = silence-management signal\n&gt; Contradiction with public denial = credibility-pressure signal\n&gt; Criminal finding only where court/plea/conviction supports it</div></section>`;
const section = `<section id="epstein-watch-enhanced" class="section wrap"><h2>Source Watch / Freedom Intelligence Engine</h2><p class="lead">This hub turns public-record updates into dated bulletins, source lanes, downloads, Rumble/video routes, free briefs, offers, book pages, and Amazon store paths.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Source Watch JSON</a><a class="btn alt" href="${mdOut}">Markdown Brief</a><a class="btn alt" href="${esc(routes.video || 'videos.html')}">Rumble Channels</a><a class="btn alt" href="${esc(routes.store || 'amazon-store-books.html')}">Books / Store</a></div><div class="terminal">EPSTEIN WATCH STATUS\n&gt; Source lanes: ${(data.watchSources || []).length}\n&gt; Bulletins: ${(data.bulletins || []).length}\n&gt; Email/network signals: ${(emailSignals.signals || []).length}\n&gt; Opt-in route: ${esc(routes.optin || 'optin-black-file-brief.html')}\n&gt; Offer route: ${esc(routes.offer || 'offer-starter-library.html')}\n&gt; Store route: ${esc(routes.store || 'amazon-store-books.html')}\n&gt; Video route: ${esc(routes.video || 'videos.html')}</div><h2>Document And Source Lanes</h2><div class="grid">${sourceCards}</div><h2>Latest Epstein Bulletins</h2>${bulletinCards}</section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (!html.includes('Evidence Boundary')) {
  html = html.replace('</main>', `${evidenceBoundary}</main>`);
}
if (!html.includes('id="epstein-email-signals"')) {
  html = html.replace('</main>', `${emailSection}</main>`);
}
if (!html.includes('id="epstein-watch-enhanced"')) {
  html = html.replace('</main>', `${section}</main>`);
}
html = html.replace('A live public-record hub for Epstein file drops, elite connections, trafficking evidence, court records, Maxwell case materials, flight-log references, institutional failure, occult-symbolism claims, and evidence-boundary analysis.', 'A source-first public-record hub for document drops, court records, official releases, archive material, dated bulletins, Rumble/video routes, free briefs, offers, and book paths.');
fs.writeFileSync(pageFile, html);

console.log(`Enhanced Epstein Evidence Watch with ${(data.watchSources || []).length} source lanes, ${(data.bulletins || []).length} bulletins, ${(emailSignals.signals || []).length} email/network signals, Evidence Boundary marker, and download outputs.`);