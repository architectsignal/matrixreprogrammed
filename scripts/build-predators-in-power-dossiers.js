'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const policyPath = path.join(root, 'data', 'predators-in-power-policy.json');
const indexPath = path.join(root, 'criminal-investigations.html');
const dataPath = path.join(root, 'data', 'criminal-investigations.json');
const downloadPath = path.join(root, 'downloads', 'criminal-investigations.json');
const graphPath = path.join(root, 'data', 'criminal-accountability-relationship-graph.json');
const reportPath = path.join(root, 'downloads', 'criminal-investigations-build-report.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value, maximum = 2400) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maximum); }
function esc(value = '') { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function slug(value = '') { return clean(value, 300).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function absolute(value = '') { return /^https?:\/\//i.test(String(value)); }

for (const file of [registryPath, policyPath]) if (!fs.existsSync(file)) throw new Error(`Missing dossier source: ${path.relative(root, file)}`);
const registry = readJson(registryPath);
const policy = readJson(policyPath);
const categories = registry.categories || {};
const powerSectors = policy.powerSectors || {};
const conductDomains = policy.conductDomains || {};
const failures = [];
const subjects = Object.entries(registry.subjects || {}).map(([key, subject]) => ({ key, ...subject })).filter(subject => subject.predatorsInPowerEligible === true);
const conclusionFields = ['finding','whyItMatters','mechanism','effect','widerDirection','alternativeExplanation','doesNotProve','evidenceStrength','confidence'];

for (const subject of subjects) {
  for (const field of ['name','dossierRoute','legalStatusSummary','publicSummary']) if (!clean(subject[field])) failures.push(`${subject.key}: missing ${field}`);
  if (!array(subject.powerRoles).length) failures.push(`${subject.name}: no power roles`);
  if (!array(subject.records).filter(record => record.publicationStatus === 'approved').length) failures.push(`${subject.name}: no approved records`);
  for (const field of conclusionFields) if (!clean(subject.conclusion?.[field])) failures.push(`${subject.name}: conclusion missing ${field}`);
  if (!array(subject.conclusion?.lanes).length) failures.push(`${subject.name}: conclusion missing lanes`);
  if (!array(subject.conclusion?.nextQuestions).length) failures.push(`${subject.name}: conclusion missing next questions`);
  for (const record of array(subject.records)) if (!absolute(record.sourceUrl)) failures.push(`${subject.name}/${record.id}: invalid source URL`);
}
if (failures.length) throw new Error(`Criminal dossier validation failed: ${failures.join('; ')}`);

const globalBoundary = 'A name appears because an approved official record and a separately sourced position of power or institutional access met the publication rules. Association, friendship, correspondence, employment, honours, photographs or proximity do not prove knowledge or complicity. Where evidence establishes knowledge, facilitation, concealment, participation or obstruction, the exact act and legal status must be stated and sourced.';
const head = title => `<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="Evidence-classified criminal investigation dossier with legal status, power access, institutional response, conclusions and primary sources."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><style>.case-hero{max-width:1100px}.case-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.case-card{border:1px solid rgba(255,80,80,.35);background:rgba(8,8,12,.94);padding:1rem}.case-status{border-left:4px solid #ff5050;padding:1rem;background:rgba(120,0,0,.13)}.case-badge{display:inline-block;border:1px solid rgba(255,90,90,.55);padding:.25rem .55rem;margin:.15rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}.case-record{border:1px solid rgba(255,255,255,.13);padding:1rem;margin:1rem 0;background:rgba(255,255,255,.025)}.case-record dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}.case-record dt{font-size:.72rem;text-transform:uppercase;opacity:.7}.case-record dd{margin:0}.case-boundary{border-left:3px solid #ff5050;padding-left:.8rem}.case-source{overflow-wrap:anywhere}.case-conclusion{border:1px solid rgba(255,80,80,.5);box-shadow:0 0 32px rgba(160,0,0,.16);padding:1rem}.case-conclusion h3{margin-top:1.2rem}.case-filter{display:grid;grid-template-columns:2fr 1fr 1fr;gap:.7rem}.case-filter input,.case-filter select{width:100%;box-sizing:border-box}.case-hidden{display:none!important}@media(max-width:760px){.case-filter{grid-template-columns:1fr}}</style>`;
const header = `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="criminal-investigations.html">Criminal Investigations</a><a href="predators-in-power.html">Predators in Power</a><a href="wrongdoing-tracker.html">Wrongdoing Tracker</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header>`;
const footer = `<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — exact legal status, primary sources, survivor dignity and evidence before inference.</p><p class="warning">This public-source research is not a substitute for court records or safeguarding services. Do not use it to harass subjects, witnesses, survivors, relatives or associates.</p></footer>`;

function sourceLink(label, url) {
  return absolute(url) ? `<a class="case-source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label || url)}</a>` : `<span>${esc(label || 'Source unavailable')}</span>`;
}
function roleCards(subject) {
  return array(subject.powerRoles).map(role => `<article class="case-card"><span class="case-badge">${esc(powerSectors[role.sector] || role.sector)}</span><h3>${esc(role.title)}</h3><p>${esc(role.organization)}${role.from || role.to ? ` · ${esc([role.from, role.to].filter(Boolean).join(' – '))}` : ''}</p><p>${sourceLink(`Verify role: ${role.sourceLabel}`, role.sourceUrl)}</p></article>`).join('');
}
function recordCards(subject) {
  return array(subject.records).filter(record => record.publicationStatus === 'approved').map(record => `<article class="case-record"><div><span class="case-badge">${esc(categories[record.category]?.label || record.category)}</span><span class="case-badge">Evidence ${esc(record.evidenceGrade || 'not stated')}</span></div><h3>${esc(record.title)}</h3><p>${esc(record.summary)}</p><div>${array(record.conductDomains).map(domain => `<span class="case-badge">${esc(conductDomains[domain] || domain)}</span>`).join('')}${array(record.victimClass).map(value => `<span class="case-badge">Victim class: ${esc(value)}</span>`).join('')}</div><dl><div><dt>Date</dt><dd>${esc(record.date)}</dd></div><div><dt>Jurisdiction</dt><dd>${esc(record.jurisdiction)}</dd></div><div><dt>Status</dt><dd>${esc(record.status)}</dd></div><div><dt>Outcome</dt><dd>${esc(record.outcome)}</dd></div><div><dt>Last checked</dt><dd>${esc(record.lastChecked)}</dd></div></dl><p><strong>Response / right of reply:</strong> ${esc(record.rightOfReply)}</p><p><strong>Counter-evidence or limitation:</strong> ${esc(record.counterEvidence)}</p><p><strong>Next record needed:</strong> ${esc(record.proofNeeded)}</p><p class="case-boundary"><strong>Legal and evidence boundary:</strong> ${esc(record.boundary || categories[record.category]?.boundary)}</p><p>${sourceLink(`Open primary source: ${record.sourceLabel}`, record.sourceUrl)}</p></article>`).join('');
}
function relationshipCards(subject) {
  const items = array(subject.relationships);
  if (!items.length) return '<p>No separate relationship record is approved for publication.</p>';
  return items.map(item => `<article class="case-card"><span class="case-badge">Documented access / relationship</span><h3>${esc(item.entity)}</h3><p><strong>Type:</strong> ${esc(item.relationshipType)}</p><p><strong>Period:</strong> ${esc(item.dateRange || 'Not stated')}</p><p>${sourceLink(item.sourceLabel, item.sourceUrl)}</p><p class="case-boundary"><strong>Boundary:</strong> ${esc(item.boundary || globalBoundary)}</p></article>`).join('');
}
function conclusionBlock(subject) {
  const c = subject.conclusion || {};
  return `<section class="section wrap"><div class="case-conclusion"><span class="label">User-Friendly Intelligence Conclusion</span><h2>How this evidence fits the mission</h2><h3>What the evidence shows</h3><p>${esc(c.finding)}</p><h3>Investigative lanes</h3><p>${array(c.lanes).map(value => `<span class="case-badge">${esc(value)}</span>`).join('')}</p><h3>Why it matters</h3><p>${esc(c.whyItMatters)}</p><h3>Mechanism</h3><p>${esc(c.mechanism)}</p><h3>Effect on the lane</h3><p>${esc(c.effect)}</p><h3>What it points toward</h3><p>${esc(c.widerDirection)}</p><h3>Strongest alternative explanation</h3><p>${esc(c.alternativeExplanation)}</p><h3>What it does not prove</h3><p class="case-boundary">${esc(c.doesNotProve)}</p><h3>Evidence position</h3><p><strong>${esc(c.evidenceStrength)}</strong> · Confidence: ${esc(c.confidence)}</p><h3>Next investigative questions</h3><ol>${array(c.nextQuestions).map(value => `<li>${esc(value)}</li>`).join('')}</ol></div></section>`;
}
function dossierPage(subject) {
  const marker = subject.historicalCase ? 'Historical Case' : 'Current / Living Case';
  return `<!DOCTYPE html><html lang="en"><head>${head(`${subject.name} Criminal Investigation Dossier`)}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${header}<main><section class="hero wrap case-hero"><div class="eyebrow">Predators in Power · ${esc(marker)}</div><h1>${esc(subject.name.toUpperCase())}</h1><p class="lead">${esc(subject.publicSummary)}</p><div class="cta-row"><a class="btn" href="#legal-record">Open Legal Record</a><a class="btn alt" href="#access-map">Access & Institutions</a><a class="btn alt" href="predators-in-power.html">Return to Index</a><a class="btn alt" href="predators-in-power.html#pip-signal-drop">Submit Evidence</a></div></section><section class="section wrap"><div class="case-status"><span class="case-badge">${esc(marker)}</span><span class="case-badge">${esc(subject.lifeStatus || 'status not stated')}</span><h2>Exact legal status</h2><p>${esc(subject.legalStatusSummary)}</p><p><strong>Case era:</strong> ${esc(subject.caseEra || 'Not stated')}</p><p class="case-boundary"><strong>Global boundary:</strong> ${esc(globalBoundary)}</p></div></section><section id="access-map" class="section wrap"><h2>Documented positions of power and access</h2><div class="case-grid">${roleCards(subject)}</div></section><section id="legal-record" class="section wrap"><h2>Conduct records and legal posture</h2>${recordCards(subject)}</section><section class="section wrap"><h2>Documented relationships and proximity to power</h2><div class="case-grid">${relationshipCards(subject)}</div></section><section class="section wrap"><h2>Institutional failures and missed safeguards</h2><div class="case-grid">${array(subject.institutionalFailures).map(value => `<article class="case-card"><p>${esc(value)}</p></article>`).join('')}</div></section>${conclusionBlock(subject)}<section class="section wrap"><div class="card redline"><h2>Corrections, responses and new evidence</h2><p>Use the Signal Drop to submit an official record, correction, acquittal, reversal, appeal, right of reply or contradicting evidence. Submissions do not publish automatically.</p><div class="cta-row"><a class="btn" href="predators-in-power.html#pip-signal-drop">Submit Evidence</a><a class="btn alt" href="source-document-vault.html">Open Source Vault</a></div></div></section></main>${footer}</div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
}

subjects.sort((a, b) => Number(a.historicalCase) - Number(b.historicalCase) || a.name.localeCompare(b.name));
for (const subject of subjects) write(path.join(root, subject.dossierRoute), dossierPage(subject));

const historical = subjects.filter(subject => subject.historicalCase);
const current = subjects.filter(subject => !subject.historicalCase);
const indexCards = items => items.map(subject => `<article class="case-card" data-case-card data-name="${esc(`${subject.name} ${array(subject.aliases).join(' ')}`.toLowerCase())}" data-era="${subject.historicalCase ? 'historical' : 'current'}" data-lanes="${esc(array(subject.conclusion?.lanes).join(' ').toLowerCase())}"><span class="case-badge">${subject.historicalCase ? 'Historical Case' : 'Current / Living Case'}</span><h2>${esc(subject.name)}</h2><p>${esc(subject.publicSummary)}</p><p><strong>Legal status:</strong> ${esc(subject.legalStatusSummary)}</p><p><strong>Why this matters:</strong> ${esc(subject.conclusion?.whyItMatters)}</p><p class="case-boundary"><strong>Does not prove:</strong> ${esc(subject.conclusion?.doesNotProve)}</p><a class="btn" href="${esc(subject.dossierRoute)}">Open Complete Dossier</a></article>`).join('');
const indexPage = `<!DOCTYPE html><html lang="en"><head>${head('Criminal Investigations')}</head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${header}<main><section class="hero wrap case-hero"><div class="eyebrow">Criminal Accountability Intelligence</div><h1>CRIMINAL INVESTIGATIONS.</h1><p class="lead">Complete source-led case files connecting exact legal status, offenses, official inquiries, institutional access, missed safeguards, documented relationships and user-friendly conclusions.</p><div class="cta-row"><a class="btn" href="#current-cases">Current Cases</a><a class="btn alt" href="#historical-cases">Historical Cases</a><a class="btn alt" href="predators-in-power.html">Predators in Power</a><a class="btn alt" href="predators-in-power.html#pip-signal-drop">Submit Evidence</a></div></section><section class="section wrap"><div class="case-status"><h2>Evidence boundary</h2><p>${esc(globalBoundary)}</p></div></section><section class="section wrap"><div class="case-filter"><input id="case-search" type="search" placeholder="Search person, alias or lane"/><select id="case-era"><option value="">All cases</option><option value="current">Current / living</option><option value="historical">Historical</option></select><select id="case-lane"><option value="">All lanes</option>${unique(subjects.flatMap(subject => array(subject.conclusion?.lanes))).sort().map(value => `<option value="${esc(value.toLowerCase())}">${esc(value)}</option>`).join('')}</select></div><p id="case-count"><strong>${subjects.length}</strong> dossiers shown</p></section><section id="current-cases" class="section wrap"><h2>Current / Living Cases</h2><div class="case-grid">${indexCards(current)}</div></section><section id="historical-cases" class="section wrap"><h2>Historical Cases</h2><p class="lead">These cases are clearly marked historical. Their value is to expose recurring access mechanisms, institutional failures and missed warning patterns.</p><div class="case-grid">${indexCards(historical)}</div></section><section class="section wrap"><div class="card redline"><h2>Every existing accountability dossier is now part of the audit</h2><p>Each mission build regenerates the approved registry dossiers and fails when legal status, source provenance, conclusion fields or evidence boundaries are incomplete.</p></div></section></main>${footer}</div><script src="matrix.js"></script><script>(()=>{const cards=[...document.querySelectorAll('[data-case-card]')];const q=document.getElementById('case-search');const era=document.getElementById('case-era');const lane=document.getElementById('case-lane');const count=document.getElementById('case-count');function apply(){const term=(q.value||'').trim().toLowerCase();let visible=0;for(const card of cards){const ok=(!term||(card.dataset.name+' '+card.dataset.lanes).includes(term))&&(!era.value||card.dataset.era===era.value)&&(!lane.value||card.dataset.lanes.includes(lane.value));card.classList.toggle('case-hidden',!ok);if(ok)visible++;}count.innerHTML='<strong>'+visible+'</strong> dossiers shown';}q.addEventListener('input',apply);era.addEventListener('change',apply);lane.addEventListener('change',apply)})();</script><script src="analytics.js"></script></body></html>`;
write(indexPath, indexPage);

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  boundary: globalBoundary,
  count: subjects.length,
  currentCount: current.length,
  historicalCount: historical.length,
  subjects
};
write(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
write(downloadPath, `${JSON.stringify(payload, null, 2)}\n`);

const nodes = [];
const edges = [];
for (const subject of subjects) {
  const subjectId = `criminal-subject:${subject.key}`;
  nodes.push({ id: subjectId, name: subject.name, type: 'criminal-accountability-dossier', route: subject.dossierRoute, historicalCase: subject.historicalCase === true, legalStatusSummary: subject.legalStatusSummary });
  for (const relationship of array(subject.relationships)) {
    const targetId = `criminal-related:${slug(relationship.entity)}`;
    nodes.push({ id: targetId, name: relationship.entity, type: 'documented-related-entity', route: '' });
    edges.push({ id: `${subjectId}->${targetId}:${slug(relationship.relationshipType)}`, source: subjectId, target: targetId, relationshipType: relationship.relationshipType, dateRange: relationship.dateRange || '', evidenceGrade: relationship.evidenceGrade || 'A', sourceRoutes: [relationship.sourceUrl].filter(absolute), evidenceBoundary: relationship.boundary || globalBoundary });
  }
  for (const role of array(subject.powerRoles)) {
    const targetId = `criminal-institution:${slug(role.organization)}`;
    nodes.push({ id: targetId, name: role.organization, type: 'institutional-access-node', route: '' });
    edges.push({ id: `${subjectId}->${targetId}:${slug(role.title)}`, source: subjectId, target: targetId, relationshipType: 'documented-position-of-power-or-access', role: role.title, dateRange: [role.from, role.to].filter(Boolean).join(' – '), evidenceGrade: 'A', sourceRoutes: [role.sourceUrl].filter(absolute), evidenceBoundary: globalBoundary });
  }
}
write(graphPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), boundary: globalBoundary, nodes: [...new Map(nodes.map(node => [node.id, node])).values()], edges }, null, 2)}\n`);

function patchWrongdoingTracker() {
  const file = path.join(root, 'wrongdoing-tracker.html');
  if (!fs.existsSync(file)) return false;
  const start = '<!-- criminal-investigations-route:start -->';
  const end = '<!-- criminal-investigations-route:end -->';
  const block = `${start}<section class="section wrap"><article class="card redline"><span class="label">Criminal Accountability</span><h2>Criminal Investigations</h2><p>Open complete current and historical dossiers with exact legal status, power access, institutional failures, sources, limitations and next questions.</p><div class="cta-row"><a class="btn" href="criminal-investigations.html">Open Criminal Investigations</a><a class="btn alt" href="predators-in-power.html">Predators in Power</a></div></article></section>${end}`;
  const before = fs.readFileSync(file, 'utf8');
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  const after = pattern.test(before) ? before.replace(pattern, block) : before.replace('</main>', `${block}</main>`);
  if (after !== before) fs.writeFileSync(file, after);
  return true;
}
patchWrongdoingTracker();

const generatedRoutes = subjects.map(subject => subject.dossierRoute);
for (const route of generatedRoutes) if (!fs.existsSync(path.join(root, route))) failures.push(`Generated dossier missing: ${route}`);
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  subjects: subjects.length,
  current: current.length,
  historical: historical.length,
  approvedRecords: subjects.reduce((sum, subject) => sum + array(subject.records).filter(record => record.publicationStatus === 'approved').length, 0),
  generatedRoutes,
  relationshipEdges: edges.length,
  boundary: globalBoundary,
  failures
};
write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Criminal investigations build failed: ${failures.join('; ')}`);
console.log(`Criminal investigations built: ${subjects.length} complete dossiers (${historical.length} historical, ${current.length} current) and ${edges.length} sourced access edges.`);
