'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
const warnings = [];

function file(relative, base = root) { return path.join(base, relative); }
function exists(relative, base = root) { return fs.existsSync(file(relative, base)); }
function read(relative, base = root) {
  if (!exists(relative, base)) throw new Error(`Missing required file: ${path.relative(root, file(relative, base))}`);
  return fs.readFileSync(file(relative, base), 'utf8');
}
function json(relative, base = root) { return JSON.parse(read(relative, base)); }
function clean(value) { return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function absoluteUrl(value = '') { return /^https?:\/\//i.test(clean(value)); }
function internalRoute(value = '') { return clean(value).replace(/^\/+/, '').split('#')[0]; }
function routeExists(route, base = root) {
  const relative = internalRoute(route);
  if (!relative) return false;
  return exists(relative, base);
}

const required = [
  'data/exposure-integrity-policy.json',
  'scripts/build-exposure-integrity-engine.js',
  'data/exposure-evidence-ledger.json',
  'data/exposure-integrity-engine.json',
  'data/cinematic-hit-list.json',
  'downloads/exposure-integrity-report.json',
  'downloads/exposure-integrity-report.md',
  'hit-list.html',
  'cinematic-hit-list.html'
];
for (const relative of required) if (!exists(relative)) fail(`Missing ${relative}`);
if (failures.length) {
  console.error('EXPOSURE INTEGRITY PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

const policy = json('data/exposure-integrity-policy.json');
const ledger = json('data/exposure-evidence-ledger.json');
const engine = json('data/exposure-integrity-engine.json');
const hit = json('data/cinematic-hit-list.json');
const criminal = json('data/criminal-conduct-registry.json');
const graph = json('data/evidence-weighted-relationship-graph.json');

const laneKeys = ['fact_adjudicated','fact_official_record','fact_corroborated','official_allegation','attributed_allegation','documented_association','analytical_inference','rumour','speculation','unsupported_or_debunked'];
for (const lane of laneKeys) if (!policy.classificationLanes?.[lane]?.label || !policy.classificationLanes?.[lane]?.rule) fail(`Policy missing complete lane ${lane}`);
if (!clean(policy.hitListBoundary).includes('not a threat list')) fail('Hit List boundary must explicitly state that it is not a threat list');
if (!array(policy.sensitiveClaimRules).some(rule => /No automated system may upgrade/i.test(rule))) fail('Policy must prevent automated association-to-fact upgrades');
if (!array(policy.userExperienceRules).some(rule => /plain-English/i.test(rule))) fail('Policy lacks plain-English user experience rule');

if (ledger.count !== array(ledger.entries).length) fail('Evidence ledger count mismatch');
if (!ledger.count) fail('Evidence ledger is empty');
const ledgerIds = new Set();
for (const entry of array(ledger.entries)) {
  const id = `${entry.entityId}:${entry.recordId}`;
  if (ledgerIds.has(id)) fail(`Duplicate ledger record ${id}`);
  ledgerIds.add(id);
  if (!laneKeys.includes(entry.classification)) fail(`${id} has invalid classification ${entry.classification}`);
  if (!clean(entry.title)) fail(`${id} missing title`);
  if (!clean(entry.establishes)) fail(`${id} missing establishes field`);
  if (!clean(entry.doesNotEstablish)) fail(`${id} missing doesNotEstablish field`);
  if (/^fact_/.test(entry.classification) && !array(entry.sourceRoutes).some(absoluteUrl)) fail(`${id} is classified as fact without an external source route`);
  if (['official_allegation','attributed_allegation','analytical_inference','rumour','speculation','unsupported_or_debunked'].includes(entry.classification) && !clean(entry.doesNotEstablish)) fail(`${id} non-fact claim lacks boundary`);
}

if (hit.count !== array(hit.entries).length) fail('Hit List count mismatch');
if (!hit.count) fail('Hit List is empty');
const requiredHitFields = array(policy.hitListRequiredFields);
for (const entry of array(hit.entries)) {
  for (const field of requiredHitFields) {
    const value = entry[field];
    if (Array.isArray(value) ? false : !clean(value) && !['documentedEvidence','allegationsOrHypotheses','missingRecords','dossierRoutes','timerRoutes','sourceRoutes'].includes(field)) fail(`${entry.name || entry.id}: missing Hit List field ${field}`);
  }
  if (!laneKeys.includes(entry.primaryClassification)) fail(`${entry.name}: invalid primary classification`);
  if (!['A','B','C','D'].includes(entry.priorityCode)) fail(`${entry.name}: invalid priority code`);
  if (!clean(entry.plainEnglishReason)) fail(`${entry.name}: missing plain-English reason`);
  if (!clean(entry.powerMechanism)) fail(`${entry.name}: missing power mechanism`);
  if (!array(entry.doesNotProve).length) fail(`${entry.name}: missing does-not-prove boundary`);
  const actions = [...array(entry.dossierRoutes), ...array(entry.timerRoutes).map(item => item.route), ...array(entry.sourceRoutes)];
  if (!actions.length) fail(`${entry.name}: no investigation action route`);
  for (const route of array(entry.dossierRoutes)) if (!routeExists(route)) warn(`${entry.name}: dossier route not present in source tree: ${route}`);
}

if (!engine.ok) fail('Exposure Integrity Engine reports a failed state');
if (engine.summary?.evidenceLedgerEntries !== ledger.count) fail('Engine ledger count does not match ledger');
if (engine.summary?.hitListEntries !== hit.count) fail('Engine Hit List count does not match Hit List payload');
if (Number(engine.summary?.graphEdges || 0) !== array(graph.edges).length) fail('Engine graph-edge count mismatch');
if (Number(engine.summary?.unresolvedGraphEdges || 0) < 0) fail('Engine unresolved graph count invalid');
if (Number(engine.summary?.sensitiveRecordFailures || 0) !== 0) fail('Sensitive record integrity failures remain');
if (!clean(engine.operatingRule).includes('Facts require evidence')) fail('Engine operating rule is missing');

for (const [subjectKey, subject] of Object.entries(criminal.subjects || {})) {
  for (const record of array(subject.records)) {
    if (record.publicationStatus !== 'approved') continue;
    const sensitive = /child|minor|traffick|groom|sexual/i.test(`${record.title || ''} ${array(record.conductDomains).join(' ')}`);
    if (!sensitive) continue;
    for (const field of ['rightOfReply','counterEvidence','proofNeeded','boundary','lastChecked','sourceUrl']) if (!clean(record[field])) fail(`${subjectKey}/${record.id || 'record'} missing sensitive field ${field}`);
    if (!absoluteUrl(record.sourceUrl)) fail(`${subjectKey}/${record.id || 'record'} has invalid sensitive source URL`);
  }
}

function checkPage(relative, base = root) {
  const html = read(relative, base);
  for (const marker of [
    'THE HIT',
    'Investigative priority—not guilt',
    'Facts require evidence. Allegations remain allegations. Rumours remain rumours. Speculation remains speculation.',
    'id="hit-search"',
    'id="hit-priority"',
    'id="hit-classification"',
    'id="hit-type"',
    'data-hit-card',
    'Corrections and right of reply',
    'data/exposure-evidence-ledger.json'
  ]) if (!html.includes(marker)) fail(`${path.relative(root, file(relative, base))} missing marker: ${marker}`);
  if (/\[object Object\]/.test(html)) fail(`${relative} contains raw object placeholder`);
  if (!/<meta name="viewport"/i.test(html)) fail(`${relative} lacks responsive viewport`);
  if (!/aria-label="Search Hit List"/i.test(html)) fail(`${relative} lacks accessible search label`);
}
checkPage('hit-list.html');
checkPage('cinematic-hit-list.html');

for (const relative of ['index.html','timers.html']) {
  const html = read(relative);
  if (!html.includes('<!-- exposure-hit-list-route:start -->') || !html.includes('hit-list.html')) fail(`${relative} is not linked to the Hit List`);
}

if (exists('_site')) {
  for (const relative of ['hit-list.html','cinematic-hit-list.html','data/exposure-evidence-ledger.json','data/exposure-integrity-engine.json','data/cinematic-hit-list.json','downloads/exposure-integrity-report.json']) {
    if (!exists(relative, site)) fail(`Cloudflare output missing ${relative}`);
  }
  if (exists('hit-list.html', site)) checkPage('hit-list.html', site);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  evidenceLedgerEntries: ledger.count,
  hitListEntries: hit.count,
  graphNodes: array(graph.nodes).length,
  graphEdges: array(graph.edges).length,
  unresolvedGraphEdges: Number(engine.summary?.unresolvedGraphEdges || 0),
  sensitiveRecordsChecked: Object.values(criminal.subjects || {}).flatMap(subject => array(subject.records)).filter(record => record.publicationStatus === 'approved' && /child|minor|traffick|groom|sexual/i.test(`${record.title || ''} ${array(record.conductDomains).join(' ')}`)).length,
  warnings,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'exposure-integrity-pressure-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (exists('_site')) fs.copyFileSync(path.join(root, 'downloads', 'exposure-integrity-pressure-test.json'), path.join(site, 'downloads', 'exposure-integrity-pressure-test.json'));

if (failures.length) {
  console.error('EXPOSURE INTEGRITY PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Exposure Integrity pressure test passed: ${report.evidenceLedgerEntries} ledger entries, ${report.hitListEntries} Hit List entries, ${report.sensitiveRecordsChecked} sensitive records checked, ${report.unresolvedGraphEdges} unsourced legacy graph edges quarantined. Warnings: ${warnings.length}.`);
