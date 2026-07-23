'use strict';

const fs = require('fs');
const path = require('path');
const definitions = require('./all-reader-clocks.js');

const root = process.cwd();
const read = (relative, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
};
const clean = (value, max = 2600) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const uniqueEvidence = items => {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = `${clean(item.route, 1200)}|${clean(item.title, 500).toLowerCase()}|${clean(item.evidenceRole, 80)}`;
    if (!clean(item.title, 500) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const clamp = (value, floor, ceiling) => Math.max(Number(floor ?? 0), Math.min(Number(ceiling ?? 100), Number(value)));

const sourcePath = 'data/global-risk-clocks.json';
const wallPath = 'data/clock-wall.json';
const source = read(sourcePath, { clocks: [] });
const wall = read(wallPath, { clocks: [] });
const practicalSweep = read('data/july-2026-practical-clock-sweep.json', { assessments: [] });
const catalogFile = read('data/july-2026-speculative-source-catalog.json', { sourceCatalog: {} });
const speculativeFiles = [
  'data/july-2026-speculative-assessments-control-system.json',
  'data/july-2026-speculative-assessments-elite-occult.json',
  'data/july-2026-speculative-assessments-metaphysical-uap.json',
  'data/july-2026-speculative-assessments-mind-psyops.json',
  'data/july-2026-speculative-assessments-exploitation-medical-history.json'
];
const speculativeAssessments = speculativeFiles.flatMap(file => read(file, { assessments: [] }).assessments || []);
const definitionLookup = new Map(definitions.map(item => [item.slug, item]));
const practicalLookup = new Map((practicalSweep.assessments || []).map(item => [item.slug, item]));
const speculativeLookup = new Map(speculativeAssessments.map(item => [item.slug, item]));
const sourceLookup = new Map((source.clocks || []).map(item => [item.slug, item]));
const wallLookup = new Map((wall.clocks || []).map(item => [item.slug, item]));
const catalog = catalogFile.sourceCatalog || {};
const revision = 'july-2026-full-clock-sweep-v1';
const referenceDate = '2026-07-23';
const reviewedAt = '2026-07-23T14:30:00.000Z';
const report = { ok: true, revision, referenceDate, practical: [], speculative: [], issues: [] };

function sourceRecord(sourceId, evidenceRole, assessment) {
  const record = catalog[sourceId];
  if (!record) {
    report.issues.push(`Unknown source ID ${sourceId} for ${assessment.slug}`);
    return null;
  }
  return {
    title: clean(record.title, 500),
    summary: `${evidenceRole === 'counter' ? 'Counter-signal' : 'Supporting record'} for the July 2026 assessment: ${clean(assessment.rationale, 1700)}`,
    route: clean(record.url, 1200),
    published: clean(record.published, 80),
    evidenceLevel: clean(record.type, 160),
    sourceType: clean(record.type, 160),
    sourceFile: 'data/july-2026-speculative-source-catalog.json',
    evidenceRole,
    july2026Sweep: true,
    matchScore: evidenceRole === 'support' ? 100 : 95
  };
}

function movementText(previous, next, assessment) {
  const delta = next - previous;
  return `July 2026 full evidence sweep: ${previous}% → ${next}% (${delta >= 0 ? '+' : ''}${delta}). ${clean(assessment.rationale, 1500)}`;
}

for (const [slug, assessment] of practicalLookup) {
  const definition = definitionLookup.get(slug);
  const sourceClock = sourceLookup.get(slug);
  const wallClock = wallLookup.get(slug);
  if (!definition || !sourceClock || !wallClock) {
    report.issues.push(`Practical clock missing from definitions/source/wall: ${slug}`);
    continue;
  }
  const previous = Number(sourceClock.score ?? wallClock.score ?? definition.score ?? 0);
  const next = clamp(assessment.recommendedScore, definition.scoreFloor, definition.scoreCeiling);
  const shared = {
    score: next,
    previousScore: previous,
    scoreChange: next - previous,
    lastMovement: movementText(previous, next, assessment),
    editorialScoreRevisionApplied: revision,
    editorialScoreRationale: clean(assessment.rationale, 2200),
    editorialScoreRecalibratedAt: reviewedAt,
    july2026Status: clean(assessment.status, 180),
    july2026CounterSignal: clean(assessment.counterSignal, 1800),
    currentAsOf: reviewedAt,
    documentedFactLayer: `Documented July 2026 position: ${clean(assessment.rationale, 2200)}`,
    speculationLayer: `Trajectory inference: the documented pressure could intensify if implementation broadens or safeguards weaken. Counter-signal: ${clean(assessment.counterSignal, 1800)} This is not proof of hidden motive, inevitability or a single coordinated controller.`,
    scoreConfidence: 'editorial-primary-source-recalibration',
    july2026Sweep: { revision, referenceDate, status: assessment.status, counterSignal: assessment.counterSignal }
  };
  Object.assign(sourceClock, shared);
  Object.assign(wallClock, shared);
  report.practical.push({ slug, previous, next, status: assessment.status });
}

for (const [slug, assessment] of speculativeLookup) {
  const definition = definitionLookup.get(slug);
  const sourceClock = sourceLookup.get(slug);
  const wallClock = wallLookup.get(slug);
  if (!definition || !definition.speculationOnly || !sourceClock || !wallClock) {
    report.issues.push(`Speculative clock missing from definitions/source/wall: ${slug}`);
    continue;
  }
  const previous = Number(sourceClock.score ?? wallClock.score ?? definition.score ?? 0);
  const next = clamp(assessment.recommendedScore, definition.scoreFloor, definition.scoreCeiling);
  const supportRecords = (assessment.supportSourceIds || []).map(id => sourceRecord(id, 'support', assessment)).filter(Boolean);
  const counterRecords = (assessment.counterSourceIds || []).map(id => sourceRecord(id, 'counter', assessment)).filter(Boolean);
  const sweepEvidence = uniqueEvidence([...supportRecords, ...counterRecords]);
  const noSourcePosition = sweepEvidence.length === 0;
  const factLayer = noSourcePosition
    ? `July 2026 evidence position: no authenticated primary or official record was identified that establishes this claim. ${clean(assessment.rationale, 2200)}`
    : `Documented July 2026 source position: ${clean(assessment.rationale, 2200)}`;
  const speculationLayer = `Classified claim boundary: this score measures evidence pressure, not truth or probability. ${clean(assessment.falsificationStandard, 1800)}`;
  const shared = {
    score: next,
    previousScore: previous,
    scoreChange: next - previous,
    lastMovement: movementText(previous, next, assessment),
    editorialScoreRevisionApplied: revision,
    editorialScoreRationale: clean(assessment.rationale, 2200),
    editorialScoreRecalibratedAt: reviewedAt,
    july2026Status: clean(assessment.currentStatus, 220),
    todayStatus: clean(assessment.currentStatus, 220),
    currentAsOf: reviewedAt,
    currentEvidenceWindowDays: 730,
    scoreConfidence: noSourcePosition ? 'evidence-quarantine' : (supportRecords.length >= 2 ? 'multi-source' : 'source-linked'),
    documentedFactLayer: factLayer,
    speculationLayer,
    falsificationStandard: clean(assessment.falsificationStandard, 1800),
    currentEvidencePolicy: 'A classified clock may rise only when evidence addresses its exact mechanism. Adjacent facts, symbols, repetition and association cannot be borrowed as proof.',
    currentEvidenceInputs: sweepEvidence,
    currentEvidenceCount: sweepEvidence.length,
    currentOfficialEvidenceCount: sweepEvidence.filter(item => /official|government|regulator|defense|justice|intergovernmental|archive|scientific|central-bank|museum|treaty/i.test(item.evidenceLevel || '')).length,
    currentImplementationCount: sweepEvidence.filter(item => /implementation|rollout|project|operation|report|monitoring|network|programme/i.test(`${item.title} ${item.summary}`)).length,
    currentImplementationMatrix: sweepEvidence.map(item => ({
      date: String(item.published || '').slice(0, 10),
      effectiveDate: '',
      jurisdiction: '',
      legalStatus: item.evidenceRole === 'counter' ? 'counter-source' : 'source-record',
      implementationStage: assessment.currentStatus,
      title: item.title,
      route: item.route,
      identityLink: '',
      factClass: item.evidenceRole === 'counter' ? 'counter-signal' : 'source-linked-assessment',
      claimBoundary: assessment.falsificationStandard
    })),
    july2026Sweep: {
      revision,
      referenceDate,
      status: assessment.currentStatus,
      supportSourceIds: assessment.supportSourceIds || [],
      counterSourceIds: assessment.counterSourceIds || [],
      noAuthenticatedPrimaryEvidenceFound: noSourcePosition,
      falsificationStandard: assessment.falsificationStandard
    }
  };
  Object.assign(sourceClock, shared, { latestDrops: uniqueEvidence([...sweepEvidence, ...(sourceClock.latestDrops || [])]) });
  Object.assign(wallClock, shared, { evidenceInputs: uniqueEvidence([...sweepEvidence, ...(wallClock.evidenceInputs || [])]) });
  report.speculative.push({ slug, previous, next, status: assessment.currentStatus, sources: sweepEvidence.length });
}

source.clocks = (source.clocks || []).map(item => sourceLookup.get(item.slug) || item);
wall.clocks = (wall.clocks || []).map(item => wallLookup.get(item.slug) || item);
source.july2026FullClockSweep = { revision, referenceDate, appliedAt: reviewedAt, practicalCount: report.practical.length, speculativeCount: report.speculative.length };
wall.july2026FullClockSweep = source.july2026FullClockSweep;
wall.updated = reviewedAt;
source.updated = reviewedAt;
report.ok = report.issues.length === 0;
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, sourcePath), JSON.stringify(source, null, 2));
fs.writeFileSync(path.join(root, wallPath), JSON.stringify(wall, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'july-2026-full-clock-sweep-report.json'), JSON.stringify(report, null, 2));
if (report.issues.length) {
  console.error('JULY 2026 FULL CLOCK SWEEP APPLY FAILED');
  for (const issue of report.issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`July 2026 full clock sweep applied: ${report.practical.length} practical and ${report.speculative.length} speculative clocks.`);
