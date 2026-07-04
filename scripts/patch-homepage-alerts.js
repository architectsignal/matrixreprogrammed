const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const timersPath = path.join(root, 'timers.html');
const clocksPath = path.join(root, 'data', 'global-risk-clocks.json');
const epsteinPath = path.join(root, 'data', 'epstein-homepage-alerts.json');
const commandPath = path.join(root, 'data', 'daily-command-brief.json');
const sevenDayPath = path.join(root, 'downloads', 'seven-day-intel.json');
const missingPath = path.join(root, 'data', 'missing-records.json');
const contractorPath = path.join(root, 'data', 'private-contractor-intelligence.json');
const today = new Date().toISOString().slice(0, 10);

function esc(s = '') { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function short(s = '', n = 230) { const text = String(s || '').replace(/\s+/g, ' ').trim(); return text.length > n ? text.slice(0, n - 1) + '…' : text; }
function activeEpstein(alert) { return alert && alert.active === true && (!alert.expiresAt || alert.expiresAt >= today) && alert.title && alert.route; }
function firstValid(items, test = x => x) { return (items || []).find(test); }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="daily-command-brief.html">Daily Brief</a><a href="control-structure.html">Power Map</a><a href="entities.html">Entities</a><a href="evidence-vault.html">Evidence</a><a href="investigations.html">Investigations</a><a href="books.html">Books</a><a href="search.html">Search</a></nav></header>`;
}
function layout(title, description, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, reader path clear.</p><p class="warning">Risk clocks, allegations, speculation, public-record investigation, symbolic analysis, fiction, and author interpretation are separated where needed.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function simplePage(file, title, description, cards) {
  const body = `<main><section class="hero wrap"><div class="eyebrow">Reader Route</div><h1>${esc(title).toUpperCase()}</h1><p class="lead">${esc(description)}</p></section><section class="section wrap"><div class="grid">${cards}</div></section></main>`;
  fs.writeFileSync(path.join(root, file), layout(`${title} | Matrix Reprogrammed`, description, body));
}
function patchTimers(clocks) {
  if (!fs.existsSync(timersPath)) return;
  const items = Array.isArray(clocks.clocks) ? clocks.clocks : [];
  const cards = items.map(clock => `<article class="card redline"><div class="pill">${esc(clock.status || 'Watch')}</div><h2>${esc(clock.title)}</h2><div class="metric"><strong>${esc(clock.score)}%</strong><span>${esc(clock.scoreLabel || 'Speculative pressure score')}</span></div><p><strong>Estimated window:</strong> ${esc(clock.window || 'Unknown')}</p><p>${esc(short(clock.signals || '', 420))}</p><div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; Static page, not a live counter\n&gt; Homepage rule: 90% or above only</div><a class="btn" href="${esc(clock.nextRoute || 'live-intel.html')}">Open Next Step</a></article>`).join('');
  const body = `<main><section class="hero wrap"><div class="eyebrow">Static Risk Signals</div><h1>GLOBAL RISK CLOCKS.</h1><p class="lead">Speculative pressure scores with dated signal lanes. They route readers to records; they are not predictions.</p><div class="cta-row"><a class="btn" href="live-intel.html">Live Intel</a><a class="btn alt" href="epstein-files.html">Epstein Files</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt machine-data-link" href="data/global-risk-clocks.json">Machine Data</a></div></section><section class="section wrap"><h2>Global Risk Clocks</h2><div class="grid">${cards}</div></section></main>`;
  fs.writeFileSync(timersPath, layout('Global Risk Clocks | Matrix Reprogrammed', 'Static speculative pressure scores for global risk lanes with evidence boundaries and homepage alert rules.', body));
}
function topCard(label, title, body, href, button = 'Open') {
  return `<article class="card redline"><span class="label">${esc(label)}</span><h3>${esc(title || 'Current Signal')}</h3><p>${esc(short(body || 'Open the route for the source trail.', 260))}</p><a class="btn" href="${esc(href || 'daily-command-brief.html')}">${esc(button)}</a></article>`;
}
function topMomentsSection(clocks, epstein, command, sevenDay, missing, contractors) {
  const hotClock = (clocks.clocks || []).filter(clock => Number(clock.score) >= 90).sort((a, b) => Number(b.score) - Number(a.score))[0];
  const latestIntel = (sevenDay.feedResults || []).slice().sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))[0];
  const activeAlert = (epstein.alerts || []).filter(activeEpstein)[0];
  const entity = firstValid(command.topEntityChanges || [], item => item && item.name && item.name !== '[object Object]');
  const contractor = (command.topContractors || [])[0] || (contractors.profiles || [])[0];
  const billionaire = (command.topBillionaires || [])[0];
  const institution = (command.topInstitutions || [])[0];
  const subject = (command.subjects || command.topSubjects || [])[0];
  const miss = (command.missingRecords || missing.records || [])[0];
  const moments = [];
  if (hotClock) moments.push(topCard(`Clock · ${hotClock.score}%`, hotClock.title, `${hotClock.scoreLabel || 'Risk pressure'} · ${hotClock.window || 'window unknown'} · ${hotClock.signals || ''}`, hotClock.nextRoute || 'timers.html', 'Open Clock'));
  if (latestIntel) moments.push(topCard('Latest Intel Drop', latestIntel.title, `${latestIntel.lane || 'live-intel'} · ${latestIntel.published || sevenDay.updated || ''}`, 'live-intel.html', 'Open Intel'));
  if (activeAlert) moments.push(topCard('File Alert', activeAlert.title, `${activeAlert.summary || ''} Evidence class: ${activeAlert.evidenceClass || 'public-record update'}`, activeAlert.route, 'Open File'));
  if (entity) moments.push(topCard('Top Entity Movement', entity.name, entity.judgement || 'Entity remains under public-record watch.', entity.route || 'entity-daily-briefs.html', 'Open Entity'));
  if (contractor) moments.push(topCard('Top Contractor', contractor.name, `Score: ${contractor.score || contractor.contractor_score || 'watch'} · ${contractor.contractor_level || 'contractor intelligence profile'}`, contractor.route || `contractor-briefs/${contractor.id || 'blackwater-constellis-lineage'}.html`, 'Open Contractor'));
  if (billionaire) moments.push(topCard('Top Billionaire Watch', billionaire.name, `Control score: ${billionaire.control_score || 'watch'} · ${(billionaire.ecosystems || []).slice(0, 4).join(', ')}`, `billionaire-briefs/${billionaire.id || 'elon-musk'}.html`, 'Open Profile'));
  if (institution) moments.push(topCard('Top Institution Watch', institution.name, `Control score: ${institution.control_score || 'watch'} · ${institution.kind || 'institution profile'}`, `institution-briefs/${institution.id || 'world-economic-forum'}.html`, 'Open Institution'));
  if (subject) moments.push(topCard('Top Subject Brief', subject.name || subject.title, `${(subject.control_layers || []).join(', ') || 'Subject tracking route'}`, `subject-briefs/${subject.id || 'digital-id-access'}.html`, 'Open Subject'));
  if (miss) moments.push(topCard('Top Missing Record', miss.entity || 'Record gap', miss.record || 'Primary record, docket, contract, filing, ownership record, oversight report or counter-source needed.', miss.route || 'daily-missing-records.html', 'Open Queue'));
  if (!moments.length) moments.push(topCard('Daily Command Brief', 'Open Today’s Brief', 'Top movements, entity changes, contractor signals, missing records and watch triggers.', 'daily-command-brief.html', 'Open Brief'));
  return `<section id="top-moments-now" class="section wrap"><div class="eyebrow">Current Site Signals</div><h2>Top Moments Now</h2><p class="lead">One strong signal from each major watch area: clocks, intel drops, entities, contractors, billionaires, institutions, subjects and missing records. All deeper machine pages remain available underneath.</p><div class="grid">${moments.slice(0, 9).join('')}</div></section>`;
}
function readerPathSection() {
  return `<section id="reader-paths" class="section wrap"><h2>Simple Reader Paths</h2><p class="lead">The machine stays deep. The reader gets clear doors.</p><div class="grid"><article class="card redline"><span class="label">Today</span><h3>Daily Command Brief</h3><p>Top movements, entity changes, contractor signals, missing records and watch triggers.</p><a class="btn" href="daily-command-brief.html">Read Brief</a></article><article class="card redline"><span class="label">Map</span><h3>Power Map</h3><p>Follow the control layers: money, identity, information, security, institutions and disclosure gaps.</p><a class="btn" href="control-structure.html">Open Map</a></article><article class="card redline"><span class="label">Track</span><h3>Entities</h3><p>People, contractors, companies, billionaires, agencies, institutions and missing-record routes.</p><a class="btn" href="entities.html">Open Entities</a></article><article class="card redline"><span class="label">Investigate</span><h3>Investigations</h3><p>Epstein files, contractors, billionaires, institutions, AI, digital ID, migration, gold, health and disclosure gaps.</p><a class="btn" href="investigations.html">Open Investigations</a></article><article class="card redline"><span class="label">Proof</span><h3>Evidence Vault</h3><p>Check source routes and evidence grades before sharing a claim.</p><a class="btn" href="evidence-vault.html">Check Evidence</a></article><article class="card"><span class="label">Machine Room</span><h3>Research Tools</h3><p>Digests, JSON feeds, brief quality, contradictions, source pulls and data outputs.</p><a class="btn alt" href="research-tools.html">Open Tools</a></article></div></section>`;
}
function researchToolsSection() {
  return `<section id="new-intelligence-tools" class="section wrap"><h2>Research Tools / Machine Room</h2><p class="lead">All advanced functions remain live, but they sit below the main reader surface.</p><div class="grid"><article class="card"><span class="label">Machine</span><h3>Machine Digest</h3><p>Latest public-record pulls, normalized events and entity observations.</p><a class="btn alt" href="machine-digest.html">Open Digest</a></article><article class="card"><span class="label">Quality</span><h3>Brief Quality</h3><p>Scores briefs by source strength, relationship depth and missing-record pressure.</p><a class="btn alt" href="brief-quality-report.html">Open Quality</a></article><article class="card"><span class="label">Records</span><h3>Missing Records</h3><p>The source gap queue: dockets, filings, contracts, ownership records and counter-sources.</p><a class="btn alt" href="daily-missing-records.html">Open Queue</a></article><article class="card"><span class="label">Review</span><h3>Contradiction Watch</h3><p>Mixed-grade and cross-lane prompts requiring primary records or counter-sources.</p><a class="btn alt" href="contradiction-watch.html">Open Watch</a></article><article class="card"><span class="label">Data</span><h3>Source Pulls</h3><p>Machine-readable feed attempts and source-pull outputs.</p><a class="btn alt" href="data/source-pulls/source-pull-index.json">Open JSON</a></article><article class="card"><span class="label">Freshness</span><h3>Site Freshness</h3><p>Daily and weekly checks for pages, figures, links and update health.</p><a class="btn alt" href="site-freshness-report.html">Open Report</a></article></div></section>`;
}
function makeHubPages() {
  const entityCards = `<article class="card redline"><h3>Entity Daily Briefs</h3><p>Plain-English briefs for tracked people, companies, agencies and institutions.</p><a class="btn" href="entity-daily-briefs.html">Open Briefs</a></article><article class="card redline"><h3>Private Contractors</h3><p>Contractor lineage, main players, contracts, records and missing documents.</p><a class="btn" href="private-contractor-tracker.html">Open Contractors</a></article><article class="card redline"><h3>Billionaire Control Tracker</h3><p>Elite-network watch profiles with control-layer scores and source gaps.</p><a class="btn" href="billionaire-control-tracker.html">Open Billionaires</a></article><article class="card redline"><h3>Institution Control Tracker</h3><p>Global bodies, policy institutions, finance, security and public-private routes.</p><a class="btn" href="institution-control-tracker.html">Open Institutions</a></article><article class="card"><h3>Main Player Profiles</h3><p>Founders, executives, company roles and watch routes.</p><a class="btn alt" href="main-player-profiles.html">Open Players</a></article><article class="card"><h3>Entity Timelines</h3><p>Source-route timelines for tracked entities.</p><a class="btn alt" href="entity-timelines.html">Open Timelines</a></article>`;
  simplePage('entities.html', 'Entities', 'One clean doorway for people, companies, contractors, billionaires, institutions and main-player tracking.', entityCards);
  const investigationCards = `<article class="card redline"><h3>Epstein Files</h3><p>File routes, evidence ladder, timeline, people/entity tracking and disclosure gaps.</p><a class="btn" href="epstein-files.html">Open Epstein Files</a></article><article class="card redline"><h3>Private Contractors</h3><p>Blackwater/Constellis and other contractor ecosystems.</p><a class="btn" href="private-contractor-tracker.html">Open Contractors</a></article><article class="card redline"><h3>Subject Briefs</h3><p>Digital ID, AI/data, banking rails, health systems, disclosure gaps and policy routes.</p><a class="btn" href="subject-briefs.html">Open Subjects</a></article><article class="card"><h3>Power Atlas</h3><p>People, institutions, operations, money flows, legal records and human cost.</p><a class="btn alt" href="power-atlas.html">Open Atlas</a></article><article class="card"><h3>Live Intel</h3><p>Dated public-source drops routed into evidence and briefings.</p><a class="btn alt" href="live-intel.html">Open Intel</a></article><article class="card"><h3>Speculation Review</h3><p>High-sensitivity claim routes with evidence boundaries and source requirements.</p><a class="btn alt" href="dark-speculation-lab.html">Open Review</a></article>`;
  simplePage('investigations.html', 'Investigations', 'The major subject doors: files, contractors, institutions, entities, evidence, speculation review and source trails.', investigationCards);
  const toolsCards = `<article class="card"><h3>Machine Digest</h3><p>Latest public-record pulls and normalized record events.</p><a class="btn alt" href="machine-digest.html">Open</a></article><article class="card"><h3>Daily Command JSON</h3><p>Machine-readable daily command brief.</p><a class="btn alt" href="data/daily-command-brief.json">Open JSON</a></article><article class="card"><h3>Record Events JSON</h3><p>Normalized public-record events.</p><a class="btn alt" href="data/record-events.json">Open JSON</a></article><article class="card"><h3>Brief Quality</h3><p>Brief quality scoring and gaps.</p><a class="btn alt" href="brief-quality-report.html">Open</a></article><article class="card"><h3>Missing Records</h3><p>Documents the system still needs.</p><a class="btn alt" href="daily-missing-records.html">Open</a></article><article class="card"><h3>Contradiction Watch</h3><p>Prompts needing review or counter-sources.</p><a class="btn alt" href="contradiction-watch.html">Open</a></article>`;
  simplePage('research-tools.html', 'Research Tools', 'The machine room for researchers: JSON, feeds, quality checks, missing records, source pulls and contradiction prompts.', toolsCards);
}

const clocks = readJson(clocksPath, { clocks: [] });
const epstein = readJson(epsteinPath, { alerts: [] });
const command = readJson(commandPath, {});
const sevenDay = readJson(sevenDayPath, {});
const missing = readJson(missingPath, { records: [] });
const contractors = readJson(contractorPath, { profiles: [] });
patchTimers(clocks);
makeHubPages();

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8')
    .replace(/<section id="homepage-alerts"[\s\S]*?<\/section>/, '')
    .replace(/<section id="top-moments-now"[\s\S]*?<\/section>/, '')
    .replace(/<section id="reader-paths"[\s\S]*?<\/section>/, '')
    .replace(/<section id="new-intelligence-tools"[\s\S]*?<\/section>/, '');
  const insert = `${topMomentsSection(clocks, epstein, command, sevenDay, missing, contractors)}${readerPathSection()}`;
  html = html.replace(/<section class="section wrap split">/, `${insert}<section class="section wrap split">`);
  html = html.replace('</main>', `${researchToolsSection()}</main>`);
  fs.writeFileSync(indexPath, html);
  console.log('Homepage patched: Top Moments Now, reader paths, hubs, and research tools inserted.');
}
console.log('Timers page patched from Global Risk Clocks data.');
