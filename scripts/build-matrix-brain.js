const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function addIndex(entry) {
  const indexPath = path.join(root, 'search-index.json');
  if (!fs.existsSync(indexPath)) return;
  const index = readJson('search-index.json', []);
  if (!index.some(item => item.url === entry.url)) index.push(entry);
  write('search-index.json', JSON.stringify(index, null, 2));
}
function addTextRoute(file, needle, block) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  const before = fs.readFileSync(p, 'utf8');
  if (before.includes(needle)) return;
  write(file, `${before.trim()}\n${block}\n`);
}

const core = readJson('data/site-intelligence-core.json', {});
const policy = readJson('data/policy-convergence-tracker.json', { lanes: [] });
const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
const dark = readJson('data/dark-speculation-claims.json', { claims: [] });
const darkDeep = readJson('data/dark-speculation-expansion.json', { dossiers: [] });
const epsteinPeople = readJson('data/epstein-people-index.json', { people: [] });
const epsteinDeep = readJson('data/epstein-network-deep-dive.json', { peopleToAddOrDeepen: [], networkLanes: [], locations: [] });
const maintenance = readJson('data/transparent-maintenance-policy.json', {});

const knowledge = [];
function add(type, title, summary, route, tags = [], boundary = '') {
  knowledge.push({ id: `${type}-${knowledge.length + 1}`, type, title, summary, route, tags, boundary });
}

for (const lane of policy.lanes || []) add('policy', lane.title, lane.plainEnglish || lane.readerQuestion || '', `control-system-tracker.html#${lane.id}`, [lane.id, ...(lane.track || []), ...(lane.actors || []), ...(lane.watchFor || [])], 'Policy lane. Check evidence level before conclusion.');
for (const clock of clocks.clocks || []) add('timer', clock.title || clock.slug, clock.summary || clock.signals || '', 'timers.html', [clock.slug, clock.status, ...(clock.policyConvergenceLinks || []).map(link => link.trackerLane)], 'Risk timer. Not a prediction or certainty claim.');
for (const claim of dark.claims || []) add('speculation', claim.title, claim.boundary || '', 'dark-speculation-lab.html', [claim.slug, claim.category, claim.label, ...(claim.keywords || [])], 'Speculation or motif lane. Classify before belief.');
for (const dossier of darkDeep.dossiers || []) add('deep-dossier', dossier.title, dossier.currentStatus || dossier.whyItMatters || '', `dark-speculation-lab.html#${dossier.slug}`, [dossier.slug, dossier.category, dossier.classification, ...(dossier.whatToTrack || [])], dossier.boundary || 'Deep speculation dossier.');
for (const person of epsteinPeople.people || []) add('epstein-person', person.name, person.recordShows || person.networkFunction || '', 'epstein-files.html#epstein-people-tracker', [person.name, person.type, person.evidenceClass], person.boundary || 'Record lane, not proof of criminal conduct.');
for (const person of epsteinDeep.peopleToAddOrDeepen || []) add('epstein-target', person.name, person.recordFocus || '', 'epstein-files.html#epstein-deep-dive-matrix', [person.name, person.type, person.evidenceClass, ...(person.institutionalOverlap || [])], person.claimBoundary || 'Research target, not an accusation.');

const graph = {
  updated: new Date().toISOString(),
  mission: core.publicMissionLine || 'Expose wrongdoing. Help humanity. Follow the documents. Map the system.',
  boundary: core.boundary || '',
  maintenanceRule: maintenance.visibilityRule || 'Visible reports and logs only.',
  counts: {
    knowledgeItems: knowledge.length,
    policyLanes: (policy.lanes || []).length,
    riskClocks: (clocks.clocks || []).length,
    speculationClaims: (dark.claims || []).length,
    deepDossiers: (darkDeep.dossiers || []).length,
    epsteinPeople: (epsteinPeople.people || []).length,
    epsteinTargets: (epsteinDeep.peopleToAddOrDeepen || []).length
  },
  signalClasses: core.signalClasses || [],
  knowledge
};

write('downloads/site-intelligence-core.json', JSON.stringify(core, null, 2));
write('downloads/site-intelligence-graph.json', JSON.stringify(graph, null, 2));
write('downloads/site-intelligence-core.md', [
  '# Matrix Brain',
  '',
  graph.mission,
  '',
  '## Boundary',
  graph.boundary,
  '',
  '## Maintenance Rule',
  graph.maintenanceRule,
  '',
  '## Counts',
  ...Object.entries(graph.counts).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Signal Classes',
  ...(graph.signalClasses || []).map(item => `- ${item.label}: ${item.meaning}`)
].join('\n'));

const stats = Object.entries(graph.counts).map(([key, value]) => `<article class="card"><span class="label">Brain Count</span><h3>${esc(value)}</h3><p>${esc(key.replace(/([A-Z])/g, ' $1').toLowerCase())}</p></article>`).join('');
const classes = (graph.signalClasses || []).map(item => `<article class="card"><span class="label">Signal Class</span><h3>${esc(item.label)}</h3><p>${esc(item.meaning)}</p></article>`).join('');
const rules = (core.rules || []).map(rule => `<li>${esc(rule)}</li>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Matrix Brain | Matrix Reprogrammed</title><meta name="description" content="Public intelligence console for Matrix Reprogrammed trackers, risk timers, evidence classes and source routes." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="site-intelligence-core.html">Brain</a><a href="control-system-tracker.html">Control Tracker</a><a href="timers.html">Timers</a><a href="epstein-files.html">Epstein</a><a href="dark-speculation-lab.html">Dark Lab</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Matrix Brain</div><h1>THE SITE THINKS IN PUBLIC RECORDS.</h1><p class="lead">${esc(graph.mission)}</p><div class="cta-row"><a class="btn" href="downloads/site-intelligence-graph.json">Open brain graph</a><a class="btn alt" href="downloads/site-intelligence-core.md">Brain brief</a><a class="btn alt" href="matrix-brain.js">Brain JS</a><a class="btn alt" href="control-system-tracker.html">Control Tracker</a></div></section><section class="section wrap split"><div><h2>Operational Self-Awareness</h2><p class="lead">The site does not claim consciousness. It knows its mission, trackers, public routes, risk timers, evidence classes, boundaries, missing outputs and upgrade priorities.</p><div class="terminal">BRAIN METHOD\n&gt; Source first\n&gt; Claim second\n&gt; Classify signal\n&gt; Connect lane\n&gt; Route to evidence\n&gt; Keep boundary visible</div></div><aside class="card redline"><h2>Boundary</h2><p>${esc(graph.boundary)}</p></aside></section><section class="section wrap"><h2>Brain Counts</h2><div class="grid">${stats}</div></section><section class="section wrap"><h2>Signal Classes</h2><div class="grid">${classes}</div></section><section class="section wrap"><h2>Operating Rules</h2><article class="card redline"><ul>${rules}</ul></article></section><section class="section wrap"><h2>Ask The Matrix Brain</h2><p class="lead">Type a subject. The browser-side brain searches local site data and routes you to the right tracker.</p><div class="card redline"><input id="matrix-brain-query" type="search" placeholder="Ask: digital ID, CBDC, Epstein flights, Agenda 2030, Blue Beam, adrenochrome motif..." /><div id="matrix-brain-answer" class="terminal">Type a signal to classify it.</div></div></section></main><footer class="footer wrap"><p><strong>MATRIX BRAIN</strong> — public intelligence console. No secret claims. Follow the source route.</p><p class="warning">Boundary: association is not guilt. Speculation is not evidence. A timer is not a prediction.</p></footer></div><script src="matrix.js"></script><script src="matrix-brain.js"></script></body></html>`;
write('site-intelligence-core.html', html);

addIndex({ key: 'site-intelligence-core', title: 'Matrix Brain', subtitle: 'Public intelligence console', series: 'Matrix Brain', category: 'Evidence Engine', url: 'site-intelligence-core.html', description: 'Public intelligence console that classifies site signals and routes users to tracker evidence.', keywords: ['matrix brain', 'public records', 'evidence classifier', 'policy convergence', 'epstein tracker', 'dark speculation', 'timers'] });
addTextRoute('llms.txt', '/site-intelligence-core.html', '\nMatrix Brain:\n- /site-intelligence-core.html: public intelligence console for Matrix Reprogrammed trackers, evidence classes, risk timers, public-record routes and operational self-awareness.\n- /downloads/site-intelligence-graph.json: local knowledge graph for the Matrix Brain.');
console.log(`Built Matrix Brain with ${knowledge.length} local knowledge items.`);
