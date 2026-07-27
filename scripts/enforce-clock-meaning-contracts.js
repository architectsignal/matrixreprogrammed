'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const wallPath = path.join(root, 'data', 'clock-wall.json');
const reportPath = path.join(root, 'downloads', 'clock-meaning-contract-report.json');
const boundary = 'This clock is an evidence-linked research pressure indicator. It does not prove hidden intent, inevitability, a coordinated agenda, criminal conduct or guilt. Its score may move only when dated evidence changes the exact variable measured.';

function clean(value, maximum = 1800) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
function uniqueBy(items, keyFn) {
  const output = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}
function normaliseEvidence(clock) {
  const candidates = [
    ...array(clock.evidenceInputs),
    ...array(clock.latestDrops),
    ...array(clock.currentEvidence),
    ...array(clock.evidence),
    ...array(clock.sources),
    ...array(clock.sourceRoutes),
    ...array(clock.sourceIds)
  ];
  const normalised = candidates.map(item => {
    if (typeof item === 'string') {
      const route = clean(item, 1200);
      return route ? { title: 'Linked evidence record', route, sourceRoute: route, evidenceLevel: 'source-linked record' } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const route = clean(item.route || item.sourceRoute || item.evidenceRoute || item.url || item.itemUrl, 1200);
    const title = clean(item.title || item.label || item.name || item.summary || 'Dated evidence input', 420);
    if (!title && !route) return null;
    return {
      title: title || 'Dated evidence input',
      route,
      sourceRoute: route,
      published: clean(item.published || item.date || item.effectiveDate || item.updated, 80),
      evidenceLevel: clean(item.evidenceLevel || item.evidenceGrade || item.grade || item.sourceType || item.status || 'source-linked record', 180),
      claimBoundary: clean(item.claimBoundary || item.evidenceBoundary || item.boundary || boundary, 900)
    };
  }).filter(Boolean);
  return uniqueBy(normalised, item => [item.title, item.route, item.published].join('|').toLowerCase()).slice(0, 30);
}

if (!fs.existsSync(wallPath)) throw new Error('data/clock-wall.json is required before clock contracts can be enforced.');
const wall = JSON.parse(fs.readFileSync(wallPath, 'utf8'));
const clocks = array(wall.clocks);
let repaired = 0;
let directEvidence = 0;
let explicitNoMovement = 0;
const failures = [];

wall.clocks = clocks.map((clock, index) => {
  const next = { ...clock };
  const evidenceInputs = normaliseEvidence(next);
  if (evidenceInputs.length) {
    directEvidence += 1;
    if (JSON.stringify(array(next.evidenceInputs)) !== JSON.stringify(evidenceInputs)) {
      next.evidenceInputs = evidenceInputs;
      repaired += 1;
    }
  } else {
    explicitNoMovement += 1;
    const reason = clean(next.noMovementReason, 1100) || 'No qualifying dated evidence input was linked in this build. The clock is held at its prior evidence position and must not move from source volume, narrative pressure or speculation alone.';
    if (next.noMovementReason !== reason) {
      next.noMovementReason = reason;
      repaired += 1;
    }
    if (next.scoreChanged !== false) {
      next.scoreChanged = false;
      repaired += 1;
    }
    next.evidenceInputs = [];
  }

  if (!clean(next.lastMovement, 1200)) {
    const latest = evidenceInputs[0];
    next.lastMovement = latest
      ? `${latest.published ? `${latest.published}: ` : ''}${latest.title}`
      : next.noMovementReason;
    repaired += 1;
  }
  if (!clean(next.controlSystemMeaning, 1600)) {
    next.controlSystemMeaning = clean(
      next.missionRelevance || next.whyItMatters || next.readerQuestion || next.plainEnglishConclusion || next.signals,
      1600
    ) || 'Tracks whether documented law, funding, procurement, infrastructure, identity, data or enforcement changes increase practical authority, dependency, interoperability, surveillance capacity or conditional access in this lane.';
    repaired += 1;
  }
  if (!clean(next.counterpoint, 1400)) {
    next.counterpoint = clean(next.lowerRule || next.strongestCounterargument || next.alternativeExplanation, 1400)
      || 'The concern weakens when participation remains optional, systems remain separated and reversible, competition and offline alternatives exist, and effective oversight, appeal and deletion rights are demonstrated.';
    repaired += 1;
  }
  if (!clean(next.boundary || next.evidenceBoundary || next.claimBoundary, 1000)) {
    next.boundary = boundary;
    repaired += 1;
  }

  if (!clean(next.lastMovement, 1200)) failures.push(`Clock ${index + 1} (${next.slug || next.title || 'unnamed'}) lacks lastMovement`);
  if (!clean(next.controlSystemMeaning, 1600)) failures.push(`Clock ${index + 1} (${next.slug || next.title || 'unnamed'}) lacks controlSystemMeaning`);
  if (!clean(next.boundary || next.evidenceBoundary || next.claimBoundary, 1000)) failures.push(`Clock ${index + 1} (${next.slug || next.title || 'unnamed'}) lacks boundary`);
  if (!evidenceInputs.length && !(clean(next.noMovementReason, 1100) && next.scoreChanged === false)) failures.push(`Clock ${index + 1} (${next.slug || next.title || 'unnamed'}) lacks explicit no-movement state`);
  return next;
});

wall.contractVersion = '2.1.0';
wall.contractUpdated = new Date().toISOString();
wall.clockBoundary = boundary;
fs.writeFileSync(wallPath, `${JSON.stringify(wall, null, 2)}\n`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  clocks: clocks.length,
  withDirectEvidence: directEvidence,
  withExplicitNoMovement: explicitNoMovement,
  fieldsRepaired: repaired,
  boundary,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Clock meaning contract failed: ${failures.join('; ')}`);
console.log(`Clock meaning contracts enforced: ${clocks.length} clocks; ${directEvidence} evidence-fed; ${explicitNoMovement} held with explicit no-movement state; ${repaired} field repairs.`);
