'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'current-office-holders.json');
const transitionsPath = path.join(root, 'data', 'current-office-holder-transitions.json');
const refreshPath = path.join(root, 'downloads', 'current-office-holder-evidence-refresh.json');
const universalPath = path.join(root, 'downloads', 'universal-criminal-dossier-coverage.json');
const outputPath = path.join(root, 'downloads', 'current-office-holder-intelligence-test.json');
const failures = [];

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing office-holder artifact: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const registry = readJson(registryPath);
const transitions = readJson(transitionsPath);
const refresh = readJson(refreshPath);
const universal = readJson(universalPath);
const conclusions = readJson(path.join(root, 'data', 'current-office-holder-conclusions.json'));
const timeline = readJson(path.join(root, 'data', 'current-office-holder-timeline.json'));
const edges = readJson(path.join(root, 'data', 'current-office-holder-relationship-edges.json'));
const clocks = readJson(path.join(root, 'data', 'current-office-holder-clock-reassessment.json'));
const pagePath = path.join(root, 'current-office-holders.html');

if (registry.schemaVersion !== 1) failures.push('office-holder registry schemaVersion must be 1');
if (!Array.isArray(registry.holders) || registry.holders.length < 15) failures.push('office-holder registry must contain at least 15 high-impact confirmed roles');
if (registry.policy?.historicalNamesPreserved !== true) failures.push('historical names must be preserved');
if (registry.policy?.automaticClockMovement !== false) failures.push('office changes must not automatically move clocks');
if (!Array.isArray(transitions.transitions) || transitions.transitions.length < 5) failures.push('transition ledger must contain at least five high-impact transitions');
if (transitions.policy?.clockMovementRequiresSeparateEvidence !== true) failures.push('transition policy must require separate evidence for clock movement');
if (!refresh.ok) failures.push('office-holder refresh report is not ok');
if ((refresh.unresolvedStaleCurrentClaims || []).length) failures.push('unresolved stale current-office claims remain');
if (!universal.ok) failures.push('universal criminal dossier coverage is not ok');

const ukPm = registry.holders.find(holder => holder.jurisdiction === 'United Kingdom' && holder.office === 'Prime Minister');
if (!ukPm || ukPm.name !== 'Andy Burnham' || ukPm.currentSince !== '2026-07-20' || ukPm.predecessor !== 'Keir Starmer') {
  failures.push('UK Prime Minister transition must identify Andy Burnham from 2026-07-20 and preserve Keir Starmer as predecessor');
}
const ukTransition = transitions.transitions.find(item => item.id === 'uk-prime-minister-2026-07-20');
if (!ukTransition || ukTransition.from !== 'Keir Starmer' || ukTransition.to !== 'Andy Burnham') failures.push('UK Prime Minister transition ledger entry missing or incorrect');
for (const field of ['found', 'whyItFits', 'effect', 'widerDirection', 'alternativeExplanation', 'doesNotProve', 'nextEvidence']) {
  if (!ukTransition?.conclusion?.[field] || (Array.isArray(ukTransition.conclusion[field]) && !ukTransition.conclusion[field].length)) failures.push(`UK transition conclusion missing ${field}`);
}

if (!fs.existsSync(pagePath)) failures.push('current-office-holders.html is missing');
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
for (const marker of ['CURRENT OFFICE-HOLDER INTELLIGENCE', 'data/current-office-holders.json', 'data/current-office-holder-transitions.json', 'data/current-office-holder-clock-reassessment.json']) {
  if (!page.includes(marker)) failures.push(`current office-holder page missing ${marker}`);
}
for (const holder of registry.holders) {
  for (const field of ['jurisdiction', 'office', 'name', 'currentSince', 'sourceUrl', 'evidenceClass', 'confidence']) {
    if (!String(holder[field] || '').trim()) failures.push(`${holder.name || '(unnamed holder)'} missing ${field}`);
  }
  if (!/^https:\/\//i.test(String(holder.sourceUrl || ''))) failures.push(`${holder.name} source must be HTTPS`);
  if (!page.includes(holder.name)) failures.push(`current office-holder page missing ${holder.name}`);
  if (!page.includes(holder.sourceUrl)) failures.push(`current office-holder page missing source for ${holder.name}`);
}

if (!conclusions.ok || (conclusions.conclusions || []).length < registry.holders.length) failures.push('current office-holder conclusions feed is incomplete');
if (!timeline.ok || !(timeline.events || []).some(item => item.id === 'transition-uk-prime-minister-2026-07-20')) failures.push('office-holder timeline missing UK transition');
if (!edges.ok || !(edges.edges || []).some(item => item.from === 'Andy Burnham' && item.active === true)) failures.push('active UK authority edge missing');
if (!(edges.edges || []).some(item => item.from === 'Keir Starmer' && item.active === false)) failures.push('former UK authority edge missing');
if (!clocks.ok || clocks.movementPolicy !== 'no-automatic-movement') failures.push('clock reassessment feed must preserve no-automatic-movement');
if (!(clocks.reassessments || []).every(item => item.movement === 'no-automatic-movement' && Array.isArray(item.evidenceNeeded) && item.evidenceNeeded.length)) failures.push('every transition clock reassessment needs evidence before movement');

const coveredNames = new Set();
for (const item of refresh.dossierMatches || []) coveredNames.add(normalize(item.name));
for (const relative of refresh.generatedDossiers || []) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`generated office-holder dossier missing ${relative}`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const name = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').trim() || path.basename(relative, '.html');
  coveredNames.add(normalize(name));
  if (!html.includes('data-current-office-holder-dossier="true"')) failures.push(`${relative} missing office-holder dossier marker`);
  if (!html.includes('data-criminal-dossier-coverage="true"')) failures.push(`${relative} missing universal criminal-investigation coverage`);
  if (!/No verified criminal or safeguarding match is currently attached\.|No sourced conduct record is currently attached\.|class="criminal-conduct-record"/.test(html)) failures.push(`${relative} missing criminal evidence or explicit no-match state`);
}

for (const match of refresh.dossierMatches || []) {
  const file = path.join(root, match.file);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('data-current-office-holder-intelligence="true"')) failures.push(`${match.file} missing office-holder intelligence panel`);
  if (!html.includes('data-criminal-dossier-coverage="true"')) failures.push(`${match.file} missing universal criminal-investigation coverage`);
}

for (const holder of registry.holders) {
  if (!coveredNames.has(normalize(holder.name))) failures.push(`no current-state dossier coverage found for ${holder.name}`);
  if (holder.predecessor && !coveredNames.has(normalize(holder.predecessor))) failures.push(`no historical dossier coverage found for predecessor ${holder.predecessor}`);
}

const universalRoutes = new Set((universal.surfaces || []).filter(item => item.scope === 'source').map(item => item.route));
for (const relative of refresh.generatedDossiers || []) {
  if (!universalRoutes.has(relative)) failures.push(`${relative} absent from universal criminal dossier census`);
}

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  holders: registry.holders.length,
  transitions: transitions.transitions.length,
  generatedDossiers: (refresh.generatedDossiers || []).length,
  matchedDossiers: (refresh.dossierMatches || []).length,
  staleClaimsRepaired: (refresh.staleClaimsRepaired || []).length,
  conclusions: (conclusions.conclusions || []).length,
  timelineEvents: (timeline.events || []).length,
  relationshipEdges: (edges.edges || []).length,
  clockReassessments: (clocks.reassessments || []).length,
  failures
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) {
  console.error('CURRENT OFFICE-HOLDER INTELLIGENCE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Current office-holder intelligence test passed: ${result.holders} confirmed holders, ${result.transitions} transitions, ${result.generatedDossiers} generated dossier(s), ${result.matchedDossiers} matched dossier(s), ${result.relationshipEdges} authority edges and ${result.clockReassessments} evidence-gated clock reassessments.`);
