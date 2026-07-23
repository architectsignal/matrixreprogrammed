'use strict';

const fs = require('fs');
const path = require('path');
const definitions = require('./public-usefulness-clocks.js');

const root = process.cwd();
const issues = [];
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const source = readJson('data/global-risk-clocks.json');
const wall = readJson('data/clock-wall.json');
const curated = readJson('data/current-clock-evidence.json');
const html = fs.readFileSync(path.join(root, 'timers.html'), 'utf8');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sourceLookup = new Map((source.clocks || []).map(clock => [clock.slug, clock]));
const wallLookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));
const officialPattern = /official|regulator|legislation|central-bank|intergovernmental|ombudsman|statistics|agency|commission|council/i;
const registryCoverage = new Map(definitions.map(definition => [definition.slug, 0]));
for (const record of curated.records || []) {
  for (const slug of record.clockSlugs || []) {
    if (registryCoverage.has(slug)) registryCoverage.set(slug, registryCoverage.get(slug) + 1);
  }
}

for (const definition of definitions) {
  const sourceClock = sourceLookup.get(definition.slug);
  const clock = wallLookup.get(definition.slug);
  if (!sourceClock || !clock) { issues.push(`${definition.slug} missing from canonical source or clock wall`); continue; }
  if (!clock.currentAsOf || Number.isNaN(Date.parse(clock.currentAsOf))) issues.push(`${definition.slug} missing valid currentAsOf`);
  if (!Number.isFinite(Number(clock.currentEvidenceWindowDays)) || Number(clock.currentEvidenceWindowDays) < 30) issues.push(`${definition.slug} invalid current evidence window`);
  if (!clock.todayStatus) issues.push(`${definition.slug} missing todayStatus`);
  if (!clock.scoreConfidence) issues.push(`${definition.slug} missing scoreConfidence`);
  if (!clock.todaySummary) issues.push(`${definition.slug} missing todaySummary`);
  if (!Array.isArray(clock.currentEvidenceInputs)) issues.push(`${definition.slug} missing currentEvidenceInputs`);
  if (!Array.isArray(clock.currentImplementationMatrix)) issues.push(`${definition.slug} missing currentImplementationMatrix`);
  if (!Array.isArray(clock.jurisdictionCoverage)) issues.push(`${definition.slug} missing jurisdictionCoverage`);
  if (!Array.isArray(clock.implementationStages)) issues.push(`${definition.slug} missing implementationStages`);
  if (!clock.documentedFactLayer) issues.push(`${definition.slug} missing documented fact layer`);
  if (!clock.speculationLayer) issues.push(`${definition.slug} missing speculation layer`);
  if (!/Only dated records/i.test(clock.currentEvidencePolicy || '')) issues.push(`${definition.slug} missing dated-current-evidence policy`);
  if (clock.todayStatus === 'current-evidence-gap') issues.push(`${definition.slug} still has a current evidence gap after online refresh`);
  if (Number(clock.currentEvidenceCount || 0) < 1) issues.push(`${definition.slug} has no current dated evidence`);
  if (Number(clock.currentOfficialEvidenceCount || 0) < 1) issues.push(`${definition.slug} has no current primary or official evidence`);
  if (Number(registryCoverage.get(definition.slug) || 0) < 1) issues.push(`${definition.slug} is not covered by the curated online evidence registry`);
  const hasCuratedOfficial = (clock.currentEvidenceInputs || []).some(item => item.curatedCurrentEvidence === true && officialPattern.test(`${item.evidenceLevel || ''} ${item.sourceType || ''}`));
  if (!hasCuratedOfficial) issues.push(`${definition.slug} has no current curated official online source in the rendered clock`);
  for (const item of clock.currentEvidenceInputs || []) {
    if (!item.published || Number.isNaN(Date.parse(item.published))) issues.push(`${definition.slug} current evidence contains undated record: ${item.title || 'untitled'}`);
    if (item.curatedCurrentEvidence && !/^https:\/\//i.test(item.route || '')) issues.push(`${definition.slug} curated current record lacks a direct HTTPS source: ${item.title || 'untitled'}`);
  }
  if (!html.includes(`id="${definition.slug}"`)) issues.push(`${definition.slug} card missing from timers page`);
}

const ageClock = wallLookup.get('childrens-digital-identity-age-gating');
const ageSource = sourceLookup.get('childrens-digital-identity-age-gating');
if (!ageClock || Number(ageClock.score) <= 90) issues.push('children age-gating clock must be above 90');
if (!ageSource || ageSource.editorialScoreRevisionApplied !== '2026-07-23-global-age-gating-recalibration-v1') issues.push('children age-gating editorial recalibration revision not applied');
if (Number(ageClock?.currentOfficialEvidenceCount || 0) < 3) issues.push('children age-gating clock needs at least three current official records');
if (Number(ageClock?.currentImplementationCount || 0) < 3) issues.push('children age-gating clock needs at least three current implementation signals');
for (const jurisdiction of ['Australia', 'United Kingdom', 'France', 'European Union']) {
  if (!(ageClock?.jurisdictionCoverage || []).includes(jurisdiction)) issues.push(`children age-gating clock missing ${jurisdiction} coverage`);
}
if (!/cover|policy route|hypothesis/i.test(ageClock?.speculationLayer || '')) issues.push('children age-gating speculation question missing');
if (!/does not prove|not prove|does not establish/i.test(ageClock?.speculationLayer || '')) issues.push('children age-gating speculation boundary missing');
if (!html.includes('What is happening now') || !html.includes('Documented fact layer') || !html.includes('Speculation / hypothesis layer')) issues.push('timers page missing current fact/speculation interface');
if (!html.includes('Current-evidence rule:')) issues.push('timers hero missing current-evidence rule');
if (!homepage.includes('Children’s Digital Identity and Age-Gating Clock') || !homepage.includes('Critical Clocks Over 90%')) issues.push('homepage missing recalibrated critical age-gating clock');
if (!Array.isArray(curated.records) || curated.records.length < 25) issues.push('current clock evidence registry is incomplete');
if (!wall.currentClockPolicy || !wall.currentEvidenceAsOf) issues.push('clock wall missing global current-evidence policy');
if (Number(wall.currentEvidenceGapCount) !== 0) issues.push(`clock wall still reports ${wall.currentEvidenceGapCount} current evidence gap(s)`);
if (Number(wall.currentPrimaryCoverageCount) < definitions.length) issues.push('not every practical clock has current primary evidence coverage');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  practicalClockCount: definitions.length,
  currentEvidenceAsOf: wall.currentEvidenceAsOf || null,
  currentEvidenceGapCount: wall.currentEvidenceGapCount,
  currentPrimaryCoverageCount: wall.currentPrimaryCoverageCount,
  currentMultiJurisdictionCount: wall.currentMultiJurisdictionCount,
  registryRecordCount: Array.isArray(curated.records) ? curated.records.length : 0,
  registryCoverage: Object.fromEntries(registryCoverage),
  ageGating: ageClock ? {
    score: ageClock.score,
    status: ageClock.todayStatus,
    officialEvidence: ageClock.currentOfficialEvidenceCount,
    implementationSignals: ageClock.currentImplementationCount,
    laws: ageClock.currentLawCount,
    jurisdictions: ageClock.jurisdictionCoverage
  } : null,
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'current-clock-intelligence-test.json'), JSON.stringify(report, null, 2));
if (issues.length) {
  console.error('CURRENT CLOCK INTELLIGENCE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`CURRENT CLOCK INTELLIGENCE TEST PASSED: all ${definitions.length} practical clocks publish current official online evidence; children's age-gating clock is ${ageClock.score}%.`);