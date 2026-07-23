'use strict';

const fs = require('fs');
const path = require('path');
const definitions = require('./all-reader-clocks.js');
const practicalDefinitions = require('./public-usefulness-clocks.js');
const speculativeDefinitions = require('./speculation-clocks.js');

const root = process.cwd();
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const issues = [];
const source = read('data/global-risk-clocks.json');
const wall = read('data/clock-wall.json');
const practicalSweep = read('data/july-2026-practical-clock-sweep.json');
const baseCatalog = read('data/july-2026-speculative-source-catalog.json');
const supplementCatalog = read('data/july-2026-speculative-source-catalog-supplement.json');
const assessmentFiles = [
  'data/july-2026-speculative-assessments-control-system.json',
  'data/july-2026-speculative-assessments-elite-occult.json',
  'data/july-2026-speculative-assessments-metaphysical-uap.json',
  'data/july-2026-speculative-assessments-mind-psyops.json',
  'data/july-2026-speculative-assessments-exploitation-medical-history.json'
];
const speculativeAssessments = assessmentFiles.flatMap(file => read(file).assessments || []);
const catalog = { ...(baseCatalog.sourceCatalog || {}), ...(supplementCatalog.sourceCatalog || {}) };
const sourceLookup = new Map((source.clocks || []).map(item => [item.slug, item]));
const wallLookup = new Map((wall.clocks || []).map(item => [item.slug, item]));
const definitionLookup = new Map(definitions.map(item => [item.slug, item]));
const practicalLookup = new Map((practicalSweep.assessments || []).map(item => [item.slug, item]));
const speculativeLookup = new Map(speculativeAssessments.map(item => [item.slug, item]));
const html = fs.readFileSync(path.join(root, 'timers.html'), 'utf8');
const revision = 'july-2026-full-clock-sweep-v1';
const allowedNoSourceStatus = /paranormal|mythology|symbolic|pattern-inference|aesthetic-symbolism|unverifiable|evidence-quarantine/i;

if (definitions.length !== 69) issues.push(`expected 69 total clocks, found ${definitions.length}`);
if (practicalDefinitions.length !== 20) issues.push(`expected 20 practical clocks, found ${practicalDefinitions.length}`);
if (speculativeDefinitions.length !== 49) issues.push(`expected 49 speculative clocks, found ${speculativeDefinitions.length}`);
if (practicalLookup.size !== 20) issues.push(`expected 20 practical assessments, found ${practicalLookup.size}`);
if (speculativeLookup.size !== 49) issues.push(`expected 49 unique speculative assessments, found ${speculativeLookup.size}`);
if (speculativeAssessments.length !== speculativeLookup.size) issues.push('duplicate speculative assessment slug detected');

for (const definition of definitions) {
  const sourceClock = sourceLookup.get(definition.slug);
  const wallClock = wallLookup.get(definition.slug);
  if (!sourceClock || !wallClock) {
    issues.push(`${definition.slug} missing from canonical source or wall`);
    continue;
  }
  if (sourceClock.editorialScoreRevisionApplied !== revision || wallClock.editorialScoreRevisionApplied !== revision) issues.push(`${definition.slug} July revision not applied`);
  if (!Number.isFinite(Number(wallClock.score))) issues.push(`${definition.slug} score is not numeric`);
  if (Number(wallClock.score) < Number(definition.scoreFloor) || Number(wallClock.score) > Number(definition.scoreCeiling)) issues.push(`${definition.slug} score outside published bounds`);
  if (!wallClock.documentedFactLayer || !wallClock.speculationLayer) issues.push(`${definition.slug} missing fact/speculation separation`);
  if (!wallClock.currentAsOf || String(wallClock.currentAsOf).slice(0, 10) !== '2026-07-23') issues.push(`${definition.slug} currentAsOf is not July 23 2026`);
  if (!html.includes(`id="${definition.slug}"`)) issues.push(`${definition.slug} missing from rendered timer wall`);
}

for (const [slug, assessment] of practicalLookup) {
  const definition = definitionLookup.get(slug);
  const wallClock = wallLookup.get(slug);
  if (!definition || definition.speculationOnly) issues.push(`${slug} practical assessment points to an invalid definition`);
  if (!assessment.rationale || !assessment.counterSignal || !assessment.status) issues.push(`${slug} practical assessment incomplete`);
  const expected = Math.max(Number(definition?.scoreFloor || 0), Math.min(Number(definition?.scoreCeiling || 100), Number(assessment.recommendedScore)));
  if (Number(wallClock?.score) !== expected) issues.push(`${slug} applied score ${wallClock?.score} does not equal ${expected}`);
  if (Number(wallClock?.currentOfficialEvidenceCount || 0) < 1) issues.push(`${slug} lacks current official evidence`);
}

for (const [slug, assessment] of speculativeLookup) {
  const definition = definitionLookup.get(slug);
  const wallClock = wallLookup.get(slug);
  if (!definition || !definition.speculationOnly) issues.push(`${slug} speculative assessment points to an invalid definition`);
  if (!assessment.rationale || !assessment.currentStatus || !assessment.falsificationStandard) issues.push(`${slug} speculative assessment incomplete`);
  const sourceIds = [...(assessment.supportSourceIds || []), ...(assessment.counterSourceIds || [])];
  for (const sourceId of sourceIds) {
    const record = catalog[sourceId];
    if (!record) issues.push(`${slug} references unknown source ${sourceId}`);
    else {
      if (!/^https:\/\//i.test(record.url || '')) issues.push(`${sourceId} does not use a direct HTTPS source`);
      if (!record.published || Number.isNaN(Date.parse(record.published))) issues.push(`${sourceId} lacks a valid date`);
    }
  }
  if (!sourceIds.length && !allowedNoSourceStatus.test(assessment.currentStatus)) issues.push(`${slug} has no source and no explicit evidence-quarantine status`);
  const expected = Math.max(Number(definition?.scoreFloor || 0), Math.min(Number(definition?.scoreCeiling || 100), Number(assessment.recommendedScore)));
  if (Number(wallClock?.score) !== expected) issues.push(`${slug} applied score ${wallClock?.score} does not equal ${expected}`);
  if (!wallClock?.july2026Sweep || wallClock.july2026Sweep.referenceDate !== '2026-07-23') issues.push(`${slug} missing July sweep metadata`);
  if (!Array.isArray(wallClock?.currentEvidenceInputs)) issues.push(`${slug} current evidence array missing`);
}

const score = slug => Number(wallLookup.get(slug)?.score || 0);
if (score('childrens-digital-identity-age-gating') < 91) issues.push('children age-gating clock must remain above 90');
if (score('digital-identity-permissioned-access') < 80) issues.push('practical digital-identity clock is below advanced rollout pressure');
if (score('spec-digital-id-permission-layer') < 65) issues.push('speculative digital-ID permission layer is underweighted');
if (score('spec-controlled-ufo-disclosure') < 45) issues.push('official disclosure-management lane is underweighted');
if (score('spec-social-media-behaviour-grid') < 60) issues.push('documented social-media behavioural-design lane is underweighted');
for (const slug of ['spec-supply-chain-slavery','spec-organ-trafficking','spec-debt-slavery']) if (score(slug) < 65) issues.push(`${slug} public-record fact lane is underweighted`);
for (const slug of ['spec-grey-aliens-government','spec-dulce-base','spec-project-blue-beam','spec-fake-messiah-hologram','spec-reptilian-bloodlines','spec-tartaria-reset','spec-giants-hidden']) if (score(slug) >= 15) issues.push(`${slug} unsupported mythology is overinflated`);
if (score('spec-controlled-ufo-disclosure') <= score('spec-grey-aliens-government')) issues.push('UAP disclosure activity is not separated from alien-control speculation');
if (score('spec-digital-id-permission-layer') <= score('spec-digital-id-beast-system')) issues.push('digital-ID implementation is not separated from religious prophecy');

if (!source.july2026FullClockSweep || !wall.july2026FullClockSweep) issues.push('global July sweep marker missing');
if (Number(wall.july2026FullClockSweep?.practicalCount) !== 20 || Number(wall.july2026FullClockSweep?.speculativeCount) !== 49) issues.push('global July sweep count is incorrect');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  referenceDate: '2026-07-23',
  totalClocks: definitions.length,
  practicalClocks: practicalDefinitions.length,
  speculativeClocks: speculativeDefinitions.length,
  criticalPractical: practicalDefinitions.map(item => ({ slug: item.slug, score: score(item.slug) })).filter(item => item.score > 90),
  keySeparations: {
    digitalIdentityImplementation: score('spec-digital-id-permission-layer'),
    digitalIdentityProphecy: score('spec-digital-id-beast-system'),
    uapDisclosure: score('spec-controlled-ufo-disclosure'),
    alienGovernment: score('spec-grey-aliens-government')
  },
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'july-2026-all-clock-sweep-test.json'), JSON.stringify(report, null, 2));
if (issues.length) {
  console.error('JULY 2026 ALL CLOCK SWEEP TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`JULY 2026 ALL CLOCK SWEEP TEST PASSED: ${definitions.length} clocks evidence-reviewed and correctly separated.`);
