const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-evidence-watch.json');
const emailSignalsFile = path.join(root, 'data', 'epstein-email-signals.json');
const peopleIndexFile = path.join(root, 'data', 'epstein-people-index.json');
const fileCockpitFile = path.join(root, 'data', 'epstein-file-cockpit.json');
const networkMatrixFile = path.join(root, 'data', 'epstein-network-architecture.json');
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
const peopleIndex = fs.existsSync(peopleIndexFile) ? JSON.parse(fs.readFileSync(peopleIndexFile, 'utf8')) : { evidenceClasses: [], people: [] };
const fileCockpit = fs.existsSync(fileCockpitFile) ? JSON.parse(fs.readFileSync(fileCockpitFile, 'utf8')) : { doors: [], howToUse: [] };
const networkMatrix = fs.existsSync(networkMatrixFile) ? JSON.parse(fs.readFileSync(networkMatrixFile, 'utf8')) : { functions: [], readerMethod: [] };
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-source-watch.json';
const mdOut = 'downloads/epstein-evidence-watch.md';
const emailJsonOut = 'downloads/epstein-email-signals.json';
const emailMdOut = 'downloads/epstein-email-signals.md';
const peopleJsonOut = 'downloads/epstein-people-index.json';
const peopleMdOut = 'downloads/epstein-people-index.md';
const cockpitJsonOut = 'downloads/epstein-file-cockpit.json';
const cockpitMdOut = 'downloads/epstein-file-cockpit.md';
const networkJsonOut = 'downloads/epstein-network-architecture.json';
const networkMdOut = 'downloads/epstein-network-architecture.md';

fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(root, emailJsonOut), JSON.stringify(emailSignals, null, 2));
fs.writeFileSync(path.join(root, peopleJsonOut), JSON.stringify(peopleIndex, null, 2));
fs.writeFileSync(path.join(root, cockpitJsonOut), JSON.stringify(fileCockpit, null, 2));
fs.writeFileSync(path.join(root, networkJsonOut), JSON.stringify(networkMatrix, null, 2));

fs.writeFileSync(path.join(root, mdOut), [
  '# Epstein Evidence Watch', '',
  `Updated: ${data.updated || '2026-06-25'}`, '',
  '## Evidence Boundary', data.boundary || '', '',
  '## Source Lanes', ...(data.watchSources || []).map(source => `- ${source.title}: ${source.sourceUrl}`), '',
  '## Latest Epstein Bulletins', ...(data.bulletins || []).map(item => `- ${item.date} — ${item.title}: ${item.summary}`), '',
  '## Reader Route',
  `- Free brief: ${data.moneyRoutes && data.moneyRoutes.optin || 'optin-black-file-brief.html'}`,
  `- Offer: ${data.moneyRoutes && data.moneyRoutes.offer || 'offer-starter-library.html'}`,
  `- Store: ${data.moneyRoutes && data.moneyRoutes.store || 'amazon-store-books.html'}`,
  `- Video: ${data.moneyRoutes && data.moneyRoutes.video || 'videos.html'}`
].join('\n'));
fs.writeFileSync(path.join(root, emailMdOut), [
  '# Epstein Email Signal Map', '',
  `Updated: ${emailSignals.updated || data.updated || '2026-06-25'}`, '',
  '## Boundary', emailSignals.boundary || data.boundary || '', '',
  '## Actual File / Research Routes', ...(emailSignals.primaryResearchRoutes || []).map(route => `- ${route.title}: ${route.url} — ${route.use}`), '',
  '## Most Telling Signals', ...(emailSignals.signals || []).map(item => `- ${item.rank}. ${item.title}: ${item.whatItSupports} Boundary: ${item.whatItDoesNotProve}`)
].join('\n'));
fs.writeFileSync(path.join(root, peopleMdOut), [
  '# Epstein People / Entity Tracker', '',
  `Updated: ${peopleIndex.updated || data.updated || '2026-06-25'}`, '',
  '## Boundary', peopleIndex.boundary || data.boundary || '', '',
  '## Evidence Class Legend', ...(peopleIndex.evidenceClasses || []).map(item => `- ${item}`), '',
  '## People / Entities', ...(peopleIndex.people || []).map(item => `- ${item.name} — ${item.type}. What the record shows: ${item.recordShows} Boundary: ${item.boundary}`)
].join('\n'));
fs.writeFileSync(path.join(root, cockpitMdOut), [
  '# Epstein Actual Files Cockpit', '',
  `Updated: ${fileCockpit.updated || data.updated || '2026-06-25'}`, '',
  '## Boundary', fileCockpit.boundary || data.boundary || '', '',
  '## Open These File Doors First', ...(fileCockpit.doors || []).map(door => `- ${door.title}: ${door.url} — ${door.use}`), '',
  '## How To Use The Cockpit', ...(fileCockpit.howToUse || []).map(rule => `- ${rule}`)
].join('\n'));
fs.writeFileSync(path.join(root, networkMdOut), [
  '# Epstein Network Architecture Matrix', '',
  `Updated: ${networkMatrix.updated || data.updated || '2026-06-25'}`, '',
  '## Boundary', networkMatrix.boundary || data.boundary || '', '',
  '## Speculation Rule', networkMatrix.speculationRule || '', '',
  '## Network Functions', ...(networkMatrix.functions || []).map(item => `- ${item.title}: ${item.whatToTrack} Evidence class: ${item.evidenceClass}`), '',
  '## Reader Method', ...(networkMatrix.readerMethod || []).map(rule => `- ${rule}`)
].join('\n'));

const sourceCards = (data.watchSources || []).map(source => `<article class="card redline"><span class="label">${esc(source.type)} · ${esc(source.priority)}</span><h3>${esc(source.title)}</h3><p>${esc(source.use)}</p><div class="cta-row small"><a class="btn" href="${esc(source.sourceUrl)}">Open Source</a><a class="btn alt" href="${esc(source.route)}">Document Link</a></div></article>`).join('');
const bulletinCards = (data.bulletins || []).map(item => `<article class="news-item"><span class="figure-caption">${esc(item.date)} · ${esc(item.label)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="cta-row small"><a class="btn" href="${esc(item.sourceRoute)}">Document Link</a><a class="btn alt" href="${esc(item.videoRoute)}">Video Link</a><a class="btn alt" href="${esc(item.offerRoute)}">Book Link</a></div></article>`).join('');
const primaryRouteCards = (emailSignals.primaryResearchRoutes || []).map(route => `<article class="card redline"><span class="label">Actual files / research route</span><h3>${esc(route.title)}</h3><p>${esc(route.use)}</p><a class="btn" href="${esc(route.url)}" target="_blank" rel="noopener">Open Actual File Route</a></article>`).join('');
const emailSignalCards = (emailSignals.signals || []).map(item => `<article class="card redline"><span class="label">Email Signal ${esc(item.rank)} · ${esc(item.recordType)}</span><h3>${esc(item.title)}</h3><p><strong>People / entities:</strong> ${esc((item.people || []).join(' · '))}</p><p><strong>What the file supports:</strong> ${esc(item.whatItSupports)}</p><p><strong>Boundary:</strong> ${esc(item.whatItDoesNotProve)}</p><p><strong>Why it matters:</strong> ${esc(item.whyItMatters)}</p><div class="cta-row small">${(item.links || []).map(link => `<a class="btn alt" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join('')}</div></article>`).join('');
const evidenceClassCards = (peopleIndex.evidenceClasses || []).map(item => `<span class="pill">${esc(item)}</span>`).join(' ');
const peopleCards = (peopleIndex.people || []).map(person => `<article class="card redline"><span class="label">${esc(person.evidenceClass)}</span><h3>${esc(person.name)}</h3><p><strong>Role / relationship type:</strong> ${esc(person.type)}</p><p><strong>What the record shows:</strong> ${esc(person.recordShows)}</p><p><strong>Network function:</strong> ${esc(person.networkFunction)}</p><p><strong>Boundary:</strong> ${esc(person.boundary)}</p><div class="cta-row small">${(person.sourceButtons || []).map(link => `<a class="btn alt" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join('')}</div></article>`).join('');
const cockpitCards = (fileCockpit.doors || []).map(door => `<article class="card redline"><span class="label">${esc(door.evidenceClass)}</span><h3>${esc(door.title)}</h3><p>${esc(door.use)}</p><p><strong>Best for:</strong> ${esc(door.bestFor)}</p><a class="btn" href="${esc(door.url)}" target="_blank" rel="noopener">Open Actual Files</a></article>`).join('');
const cockpitRules = (fileCockpit.howToUse || []).map(rule => `<li>${esc(rule)}</li>`).join('');
const networkCards = (networkMatrix.functions || []).map(item => `<article class="card redline"><span class="label">${esc(item.evidenceClass)}</span><h3>${esc(item.title)}</h3><p><strong>What to track:</strong> ${esc(item.whatToTrack)}</p><p><strong>Red flags:</strong> ${esc((item.redFlags || []).join(' · '))}</p><p><strong>Records needed:</strong> ${esc((item.recordsNeeded || []).join(' · '))}</p></article>`).join('');
const networkRules = (networkMatrix.readerMethod || []).map(rule => `<li>${esc(rule)}</li>`).join('');
const routes = data.moneyRoutes || {};
const evidenceBoundary = `<section id="epstein-evidence-boundary" class="section wrap"><h2>Evidence Boundary</h2><p class="lead">${esc(data.boundary || 'This hub tracks public records, court records, official releases, source pages, news bulletins, archive links, committee activity, and litigation movement. A named person appearing in a public record is not by itself proof of criminal conduct.')}</p><div class="terminal">EVIDENCE BOUNDARY\n&gt; If it is in the files, the document/item is supported\n&gt; A document mention proves the mention exists\n&gt; A contact proves contact, not automatic guilt\n&gt; A flight/log entry proves a record trail, not automatic motive\n&gt; A sworn claim is stronger than rumor but still must be tested\n&gt; A conviction, plea, court finding, or authenticated exhibit carries the highest weight</div></section>`;
const networkSection = `<section id="epstein-network-architecture" class="section wrap"><h2>Network Architecture Matrix</h2><p class="lead">This is the command layer: it shows what function each record may reveal — access, logistics, money, reputation repair, legal pressure, silence, media leverage, institutional failure, or open-question territory. The matrix lets the site go aggressive on the pattern while keeping every claim tied to evidence class.</p><div class="cta-row"><a class="btn" href="${networkJsonOut}">Open network source file</a><a class="btn alt" href="${networkMdOut}">Network matrix brief</a><a class="btn alt" href="${peopleJsonOut}">People tracker</a><a class="btn alt" href="${cockpitJsonOut}">Actual files cockpit</a></div><h2>Network Function Cards</h2><div class="grid">${networkCards}</div><div class="card redline"><h3>Speculation Quarantine</h3><p>${esc(networkMatrix.speculationRule || '')}</p><ul>${networkRules}</ul></div></section>`;
const cockpitSection = `<section id="epstein-file-cockpit" class="section wrap"><h2>Actual Files Cockpit</h2><p class="lead">Open the files first. This cockpit gives readers direct routes into official disclosures, congressional records, court dockets, email searches, archive searches, financial records, and influence-record databases. It is built for evidence work: open the document, identify the record type, then decide what the record supports.</p><div class="cta-row"><a class="btn" href="${cockpitJsonOut}">Open cockpit source file</a><a class="btn alt" href="${cockpitMdOut}">Cockpit brief</a><a class="btn alt" href="https://www.justice.gov/epstein/doj-disclosures" target="_blank" rel="noopener">DOJ Files</a><a class="btn alt" href="https://www.courtlistener.com/?q=Epstein&type=r&order_by=score%20desc" target="_blank" rel="noopener">Court Records</a></div><h2>Open These File Doors First</h2><div class="grid">${cockpitCards}</div><div class="card redline"><h3>How To Use The Cockpit</h3><ul>${cockpitRules}</ul></div></section>`;
const peopleSection = `<section id="epstein-people-tracker" class="section wrap"><h2>People / Entity Tracker</h2><p class="lead">This tracker names the visible nodes in the record and classifies what the files actually support: conviction, court record, sworn claim, email record, flight/contact record, financial access, contradiction, settlement, reputation management, or peripheral mention. It is built to expose the network function without pretending every mention is the same kind of evidence.</p><div class="cta-row"><a class="btn" href="${peopleJsonOut}">Open people source file</a><a class="btn alt" href="${peopleMdOut}">People tracker brief</a><a class="btn alt" href="https://www.courtlistener.com/?q=Epstein&type=r&order_by=score%20desc" target="_blank" rel="noopener">Court Records</a><a class="btn alt" href="https://jmail.world" target="_blank" rel="noopener">Email Archive</a></div><h2>Evidence Class Legend</h2><p>${evidenceClassCards}</p><h2>Network Function Cards</h2><div class="grid">${peopleCards}</div><div class="terminal">PEOPLE TRACKING METHOD\n&gt; Name in file = record item\n&gt; Evidence class decides meaning\n&gt; Conviction/court finding outranks claim\n&gt; Email/contact/log record proves a trail\n&gt; Repeated access reveals network function\n&gt; Boundary stays visible on every card</div></section>`;
const emailSection = `<section id="epstein-email-signals" class="section wrap"><h2>Most Telling Epstein Emails / Network Signals</h2><p class="lead">The purpose of this Command Center is to expose the network using the files themselves: emails, schedules, ledgers, testimony, court exhibits, visitor/contact records, travel records, and committee releases. The aggressive method is simple: document the record, classify what it proves, then map the function: access, leverage, reputation repair, legal pressure, money, logistics, silence, and institutional protection.</p><div class="cta-row"><a class="btn" href="${emailJsonOut}">Open email source file</a><a class="btn alt" href="${emailMdOut}">Email Signals Brief</a><a class="btn alt" href="https://jmail.world" target="_blank" rel="noopener">Open Jmail</a><a class="btn alt" href="https://search.wikileaks.org/?query=Epstein" target="_blank" rel="noopener">WikiLeaks Search</a></div><h2>Actual File / Research Routes</h2><div class="grid">${primaryRouteCards}</div><h2>Network Signal Cards</h2><div class="grid">${emailSignalCards}</div><div class="terminal">NETWORK EXPOSURE METHOD\n&gt; Person named in file = documented record item\n&gt; Repeated communication = relationship-frequency signal\n&gt; Scheduling/logistics = operational support signal\n&gt; Money/charity/access = influence-routing signal\n&gt; NDA/settlement/legal threat = silence-management signal\n&gt; Contradiction with public denial = credibility-pressure signal\n&gt; Criminal finding only where court/plea/conviction supports it</div></section>`;
const section = `<section id="epstein-watch-enhanced" class="section wrap"><h2>Source Watch / Freedom Intelligence Engine</h2><p class="lead">This hub turns public records into dated bulletins, document links, Rumble videos, free briefs, book pages, and store paths.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Source Watch JSON</a><a class="btn alt" href="${mdOut}">Markdown Brief</a><a class="btn alt" href="${esc(routes.video || 'videos.html')}">Rumble Channels</a><a class="btn alt" href="${esc(routes.store || 'amazon-store-books.html')}">Books / Store</a></div><div class="terminal">EPSTEIN WATCH STATUS\n&gt; Source lanes: ${(data.watchSources || []).length}\n&gt; Bulletins: ${(data.bulletins || []).length}\n&gt; Email/network signals: ${(emailSignals.signals || []).length}\n&gt; People/entity cards: ${(peopleIndex.people || []).length}\n&gt; Actual file doors: ${(fileCockpit.doors || []).length}\n&gt; Network functions: ${(networkMatrix.functions || []).length}\n&gt; Opt-in route: ${esc(routes.optin || 'optin-black-file-brief.html')}\n&gt; Offer route: ${esc(routes.offer || 'offer-starter-library.html')}\n&gt; Store route: ${esc(routes.store || 'amazon-store-books.html')}\n&gt; Video route: ${esc(routes.video || 'videos.html')}</div><h2>Document And Source Lanes</h2><div class="grid">${sourceCards}</div><h2>Latest Epstein Bulletins</h2>${bulletinCards}</section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (!html.includes('Evidence Boundary')) html = html.replace('</main>', `${evidenceBoundary}</main>`);
if (!html.includes('id="epstein-network-architecture"')) html = html.replace('</main>', `${networkSection}</main>`);
if (!html.includes('id="epstein-file-cockpit"')) html = html.replace('</main>', `${cockpitSection}</main>`);
if (!html.includes('id="epstein-people-tracker"')) html = html.replace('</main>', `${peopleSection}</main>`);
if (!html.includes('id="epstein-email-signals"')) html = html.replace('</main>', `${emailSection}</main>`);
if (!html.includes('id="epstein-watch-enhanced"')) html = html.replace('</main>', `${section}</main>`);
html = html.replace('A live public-record hub for Epstein file drops, elite connections, trafficking evidence, court records, Maxwell case materials, flight-log references, institutional failure, occult-symbolism claims, and evidence-boundary analysis.', 'A source-first public-record hub for document drops, court records, official releases, archive material, dated bulletins, Rumble/video routes, free briefs, offers, and book paths.');
fs.writeFileSync(pageFile, html);

console.log(`Enhanced Epstein Evidence Watch with ${(data.watchSources || []).length} source lanes, ${(data.bulletins || []).length} bulletins, ${(emailSignals.signals || []).length} email/network signals, ${(peopleIndex.people || []).length} people/entity cards, ${(fileCockpit.doors || []).length} actual file doors, ${(networkMatrix.functions || []).length} network functions, Evidence Boundary marker, and download outputs.`);