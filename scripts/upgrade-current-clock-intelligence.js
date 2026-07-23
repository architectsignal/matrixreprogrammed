'use strict';

const fs = require('fs');
const path = require('path');
const definitions = require('./all-reader-clocks.js');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'global-risk-clocks.json');
const wallPath = path.join(root, 'data', 'clock-wall.json');
const curatedPath = path.join(root, 'data', 'current-clock-evidence.json');
const reportPath = path.join(root, 'downloads', 'current-clock-intelligence.json');
const definitionLookup = new Map(definitions.map(clock => [clock.slug, clock]));

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value, max = 1800) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function validDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}
function ageDays(value, now) {
  const time = validDate(value);
  return time === null ? Infinity : Math.floor((now - time) / 86400000);
}
function isPrimary(item) {
  return /official|court|regulator|primary|audited|legislation|judgment|filing|government|parliament|commission|central bank|inspection|sanction|ministry|statutory/i.test(`${item.evidenceLevel || ''} ${item.sourceType || ''} ${item.title || ''}`);
}
function isImplementation(item) {
  return /in-force|enforcement|implemented|implementation|rollout|deployment|operational|compliance|mandatory|required|enacted|technical-standard-ready|customisation|active/i.test(`${item.legalStatus || ''} ${item.implementationStage || ''} ${item.title || ''} ${item.summary || ''}`);
}
function isLaw(item) {
  return /law-in-force|implementing-rules-in-force|statutory-duties-in-force|enacted/i.test(`${item.legalStatus || ''} ${item.evidenceLevel || ''}`);
}
function splitJurisdictions(value) {
  return String(value || '').split(/[;,|]/).map(item => clean(item, 120)).filter(Boolean);
}
function uniqueEvidence(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = `${clean(item.route, 1000)}|${clean(item.title, 400).toLowerCase()}|${clean(item.jurisdiction, 200)}`;
    if (!clean(item.title, 400) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function normaliseRecord(item) {
  return {
    title: clean(item.title, 500),
    summary: clean(item.summary, 1800),
    route: clean(item.route, 1200),
    published: clean(item.published, 80),
    effectiveDate: clean(item.effectiveDate, 80),
    evidenceLevel: clean(item.evidenceLevel, 240),
    sourceType: clean(item.sourceType, 120),
    jurisdiction: clean(item.jurisdiction, 300),
    legalStatus: clean(item.legalStatus, 160),
    implementationStage: clean(item.implementationStage, 220),
    identityLink: clean(item.identityLink, 1200),
    factClass: clean(item.factClass, 160),
    claimBoundary: clean(item.claimBoundary, 1200),
    sourceFile: 'data/current-clock-evidence.json',
    matchScore: 100,
    curatedCurrentEvidence: true
  };
}

const now = Date.now();
const asOf = new Date(now).toISOString();
const source = read(sourcePath, { clocks: [] });
const wall = read(wallPath, { clocks: [] });
const curated = read(curatedPath, { records: [] });
const curatedBySlug = new Map();
for (const record of curated.records || []) {
  for (const slug of record.clockSlugs || []) {
    if (!curatedBySlug.has(slug)) curatedBySlug.set(slug, []);
    curatedBySlug.get(slug).push(normaliseRecord(record));
  }
}

const sourceLookup = new Map((source.clocks || []).map(clock => [clock.slug, clock]));
const wallLookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));
const recalibrations = [];

for (const definition of definitions) {
  const sourceClock = sourceLookup.get(definition.slug);
  const wallClock = wallLookup.get(definition.slug);
  if (!sourceClock || !wallClock) continue;
  if (definition.editorialScoreRevision && Number.isFinite(Number(definition.editorialScore)) && sourceClock.editorialScoreRevisionApplied !== definition.editorialScoreRevision) {
    const previous = Number(sourceClock.score || definition.baselineScore || 0);
    const next = Math.max(Number(definition.scoreFloor || 0), Math.min(Number(definition.scoreCeiling || 100), Number(definition.editorialScore)));
    const movement = next - previous;
    const movementText = `Editorial recalibration on ${asOf.slice(0, 10)}: ${previous}% → ${next}% (${movement >= 0 ? '+' : ''}${movement}). ${clean(definition.editorialScoreRationale, 1400)}`;
    Object.assign(sourceClock, {
      score: next,
      previousScore: previous,
      scoreChange: movement,
      lastMovement: movementText,
      editorialScoreRevisionApplied: definition.editorialScoreRevision,
      editorialScoreRationale: definition.editorialScoreRationale,
      editorialScoreRecalibratedAt: asOf
    });
    Object.assign(wallClock, {
      score: next,
      previousScore: previous,
      scoreChange: movement,
      lastMovement: movementText,
      editorialScoreRevisionApplied: definition.editorialScoreRevision,
      editorialScoreRationale: definition.editorialScoreRationale,
      editorialScoreRecalibratedAt: asOf
    });
    recalibrations.push({ slug: definition.slug, previous, next, revision: definition.editorialScoreRevision });
  }
}

const coverage = [];
wall.clocks = (wall.clocks || []).map(clock => {
  const definition = definitionLookup.get(clock.slug) || {};
  const sourceClock = sourceLookup.get(clock.slug) || {};
  const currentWindowDays = Math.max(30, Number(definition.currentEvidenceWindowDays || Math.min(Number(definition.evidenceWindowDays || 180), definition.speculationOnly ? 180 : 120)));
  const curatedEvidence = curatedBySlug.get(clock.slug) || [];
  const combined = uniqueEvidence([
    ...curatedEvidence,
    ...(clock.evidenceInputs || []),
    ...(sourceClock.latestDrops || [])
  ]).map(item => ({ ...item, currentAgeDays: ageDays(item.published, now) }));
  combined.sort((a, b) => {
    const aCurrent = a.currentAgeDays >= 0 && a.currentAgeDays <= currentWindowDays ? 1 : 0;
    const bCurrent = b.currentAgeDays >= 0 && b.currentAgeDays <= currentWindowDays ? 1 : 0;
    return bCurrent - aCurrent || Number(isPrimary(b)) - Number(isPrimary(a)) || Number(isImplementation(b)) - Number(isImplementation(a)) || (validDate(b.published) || 0) - (validDate(a.published) || 0) || Number(b.matchScore || 0) - Number(a.matchScore || 0);
  });
  const currentEvidence = combined.filter(item => item.currentAgeDays >= 0 && item.currentAgeDays <= currentWindowDays);
  const official = currentEvidence.filter(isPrimary);
  const implementation = currentEvidence.filter(isImplementation);
  const jurisdictions = [...new Set(currentEvidence.flatMap(item => splitJurisdictions(item.jurisdiction)))];
  const stages = [...new Set(currentEvidence.map(item => clean(item.implementationStage, 220)).filter(Boolean))];
  const currentLawCount = currentEvidence.filter(isLaw).length;
  let todayStatus = 'current-evidence-gap';
  let scoreConfidence = 'low';
  if (official.length >= 2 && implementation.length >= 1 && jurisdictions.length >= 2) {
    todayStatus = 'current-multi-jurisdiction-implementation';
    scoreConfidence = 'high';
  } else if (official.length >= 1) {
    todayStatus = 'current-primary-evidence';
    scoreConfidence = 'medium';
  } else if (currentEvidence.length) {
    todayStatus = 'current-secondary-evidence-only';
    scoreConfidence = 'limited';
  }
  const top = currentEvidence.slice(0, 4);
  const todaySummary = top.length
    ? top.map(item => `${String(item.published || '').slice(0, 10)}${item.jurisdiction ? ` · ${item.jurisdiction}` : ''}${item.implementationStage ? ` · ${item.implementationStage}` : ''}: ${item.title}`).join(' | ')
    : `No dated record matched this clock inside the ${currentWindowDays}-day current-evidence window. The score is held as an editorial baseline and must not be described as a fresh movement.`;
  const documentedFactLayer = clean(definition.documentedCurrentPosition, 2400) || (official.length
    ? `Documented current position: ${official.length} primary or official records and ${implementation.length} implementation signals matched this clock across ${jurisdictions.length || 1} jurisdiction lane(s).`
    : `Documented current position: no primary or official record matched inside the ${currentWindowDays}-day window; current confidence is limited and the score must be read as a held baseline.`);
  const speculationLayer = clean(definition.speculationQuestion, 2400) || `Evidence-led hypothesis: if the documented pattern continues, this system may become more integrated, mandatory or difficult to avoid. That is a trajectory inference, not proof of hidden motive, inevitability or a single coordinated controller.`;
  const next = {
    ...clock,
    score: Number(sourceClock.score ?? clock.score),
    previousScore: sourceClock.previousScore ?? clock.previousScore,
    scoreChange: sourceClock.scoreChange ?? clock.scoreChange,
    lastMovement: sourceClock.lastMovement || clock.lastMovement,
    evidenceInputs: combined.slice(0, definition.speculationOnly ? 16 : 24).map(({ currentAgeDays, ...item }) => item),
    currentAsOf: asOf,
    currentEvidenceWindowDays,
    todayStatus,
    scoreConfidence,
    todaySummary,
    currentEvidenceInputs: currentEvidence.slice(0, 10).map(({ currentAgeDays, ...item }) => item),
    currentEvidenceCount: currentEvidence.length,
    currentOfficialEvidenceCount: official.length,
    currentImplementationCount: implementation.length,
    currentLawCount,
    jurisdictionCoverage: jurisdictions,
    implementationStages: stages,
    currentImplementationMatrix: currentEvidence.slice(0, 12).map(item => ({
      date: String(item.published || '').slice(0, 10),
      effectiveDate: item.effectiveDate || '',
      jurisdiction: item.jurisdiction || '',
      legalStatus: item.legalStatus || '',
      implementationStage: item.implementationStage || '',
      title: item.title || '',
      route: item.route || '',
      identityLink: item.identityLink || '',
      factClass: item.factClass || '',
      claimBoundary: item.claimBoundary || ''
    })),
    documentedFactLayer,
    speculationLayer,
    currentEvidencePolicy: 'Only dated records inside the published window count as current. Primary sources, enacted law and implementation carry more weight than repetition. A current-evidence gap is displayed openly and cannot be used to claim a fresh score movement.',
    calculationBasis: `${currentEvidence.length} current dated records inside ${currentWindowDays} days; ${official.length} primary-or-official; ${implementation.length} implementation; ${currentLawCount} enacted or in-force legal records; ${jurisdictions.length} jurisdiction lanes. ${clock.calculationBasis || ''}`
  };
  coverage.push({
    slug: clock.slug,
    title: clock.title,
    score: next.score,
    todayStatus,
    scoreConfidence,
    currentEvidenceCount: currentEvidence.length,
    officialCount: official.length,
    implementationCount: implementation.length,
    lawCount: currentLawCount,
    jurisdictions
  });
  return next;
});

source.clocks = (source.clocks || []).map(clock => sourceLookup.get(clock.slug) || clock);
source.updated = asOf;
source.currentClockPolicy = 'Every Mission Timer is evaluated against a dated current-evidence window. Current status, official-source count, implementation stage, jurisdiction coverage and evidence gaps are published separately from speculation.';
wall.updated = asOf;
wall.currentClockPolicy = source.currentClockPolicy;
wall.currentEvidenceAsOf = asOf;
wall.currentEvidenceGapCount = coverage.filter(item => item.todayStatus === 'current-evidence-gap').length;
wall.currentPrimaryCoverageCount = coverage.filter(item => item.officialCount > 0).length;
wall.currentMultiJurisdictionCount = coverage.filter(item => item.jurisdictions.length >= 2).length;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
fs.writeFileSync(wallPath, JSON.stringify(wall, null, 2));
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: asOf,
  policy: wall.currentClockPolicy,
  recalibrations,
  coverage
}, null, 2));
console.log(`Current clock intelligence upgraded: ${coverage.length} clocks; ${recalibrations.length} editorial recalibration(s); ${wall.currentEvidenceGapCount} current-evidence gap(s).`);