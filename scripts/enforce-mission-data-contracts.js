'use strict';

// Normalize daily source state and the active investigation ledger before any
// relationship, clock or conclusion product is allowed to consume them.
require('./repair-investigation-data-integrity.js');

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const writeJson = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), JSON.stringify(content, null, 2)); };
const clean = (value, max = 1400) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];

const relationshipBoundary = 'This edge records only the cited relationship, role, transaction, appointment, mention or association. It does not establish guilt, knowledge of another person’s conduct, shared motive, secret coordination or control beyond the documented mechanism.';
const clockBoundary = 'This clock is an evidence-linked research pressure indicator. It does not prove hidden intent, inevitability, a coordinated agenda or guilt. The score may move only when dated evidence changes the exact variable measured.';

let graphChanged = 0;
let graphEdges = 0;
if (exists('data/evidence-weighted-relationship-graph.json')) {
  const graph = readJson('data/evidence-weighted-relationship-graph.json', { nodes: [], edges: [] });
  graph.edges = array(graph.edges).map(edge => {
    graphEdges += 1;
    const next = { ...edge };
    if (!clean(next.relationshipType || next.type || next.predicate, 160)) {
      next.relationshipType = 'documented-relationship';
      graphChanged += 1;
    }
    if (!clean(next.evidenceGrade || next.grade || next.status, 120)) {
      next.evidenceGrade = 'ungraded-source-linked-record';
      graphChanged += 1;
    }
    if (!clean(next.evidenceBoundary || next.boundary, 500)) {
      next.evidenceBoundary = relationshipBoundary;
      graphChanged += 1;
    }
    const routes = unique([
      next.sourceRoute,
      next.evidenceRoute,
      next.route,
      ...array(next.sourceRoutes),
      ...array(next.sources).map(source => typeof source === 'string' ? source : source?.route || source?.url || source?.sourceRoute)
    ]);
    if (!array(next.sourceRoutes).length && routes.length) {
      next.sourceRoutes = routes.slice(0, 12);
      graphChanged += 1;
    }
    if (!routes.length && !clean(next.missingSourceReason, 500)) {
      next.missingSourceReason = 'No direct source route was attached to this legacy edge. Treat it as an unresolved graph record until provenance is restored.';
      graphChanged += 1;
    }
    return next;
  });
  graph.contractVersion = '2.0.0';
  graph.contractUpdated = new Date().toISOString();
  graph.relationshipBoundary = relationshipBoundary;
  writeJson('data/evidence-weighted-relationship-graph.json', graph);
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
  return candidates.map(item => {
    if (typeof item === 'string') return { title: item, sourceRoute: item, status: 'linked-source-input' };
    if (!item || typeof item !== 'object') return null;
    return {
      title: clean(item.title || item.label || item.name || item.summary || 'Dated evidence input', 300),
      sourceRoute: clean(item.sourceRoute || item.evidenceRoute || item.route || item.url || item.itemUrl, 900),
      published: clean(item.published || item.date || item.effectiveDate || item.updated, 100),
      evidenceLevel: clean(item.evidenceLevel || item.evidenceGrade || item.grade || item.sourceType || item.status, 180),
      claimBoundary: clean(item.claimBoundary || item.evidenceBoundary || item.boundary, 600)
    };
  }).filter(item => item && (item.title || item.sourceRoute)).slice(0, 30);
}

let clockChanged = 0;
let clockCount = 0;
let clocksWithoutDirectEvidence = 0;
if (exists('data/clock-wall.json')) {
  const wall = readJson('data/clock-wall.json', { clocks: [] });
  wall.clocks = array(wall.clocks).map(clock => {
    clockCount += 1;
    const next = { ...clock };
    const evidenceInputs = normaliseEvidence(next);
    if (!array(next.evidenceInputs).length && evidenceInputs.length) {
      next.evidenceInputs = evidenceInputs;
      clockChanged += 1;
    }
    if (!evidenceInputs.length) {
      clocksWithoutDirectEvidence += 1;
      if (!clean(next.noMovementReason, 700)) {
        next.noMovementReason = 'No qualifying dated evidence input was linked in this build. The presentation layer must show no new movement and must not infer score pressure from source volume alone.';
        clockChanged += 1;
      }
      if (next.scoreChanged !== false) {
        next.scoreChanged = false;
        clockChanged += 1;
      }
    }
    if (!clean(next.lastMovement, 900)) {
      const latest = evidenceInputs[0];
      next.lastMovement = latest ? `${latest.published ? `${latest.published}: ` : ''}${latest.title}` : next.noMovementReason;
      clockChanged += 1;
    }
    if (!clean(next.controlSystemMeaning, 1200)) {
      next.controlSystemMeaning = clean(next.missionRelevance || next.whyItMatters || next.readerQuestion || next.signals, 1200) || 'Tracks whether documented law, funding, procurement, infrastructure, identity, data or enforcement changes increase practical authority, dependency, interoperability or conditional access in this lane.';
      clockChanged += 1;
    }
    if (!clean(next.counterpoint, 1000)) {
      next.counterpoint = clean(next.lowerRule || next.strongestCounterargument || next.alternativeExplanation, 1000) || 'The concern weakens when participation remains optional, systems remain separated and reversible, competition and offline alternatives exist, and effective oversight and appeal are demonstrated.';
      clockChanged += 1;
    }
    if (!clean(next.boundary || next.evidenceBoundary || next.claimBoundary, 700)) {
      next.boundary = clockBoundary;
      clockChanged += 1;
    }
    return next;
  });
  wall.contractVersion = '2.0.0';
  wall.contractUpdated = new Date().toISOString();
  wall.clockBoundary = clockBoundary;
  writeJson('data/clock-wall.json', wall);
}

// Criminal accountability is a mandatory mission surface. The compact source
// file is expanded first, then the public index and every individual dossier
// are regenerated from the same authoritative registry. Finally every other
// dossier on the site receives the same criminal and safeguarding status lane.
require('./build-criminal-conduct-registry.js');
require('./build-predators-in-power.js');
require('./build-predators-in-power-dossiers.js');
require('./inject-criminal-status-all-dossiers.js');

const repair = readJson('downloads/investigation-data-integrity-repair.json', {});
const criminalAccountability = readJson('downloads/criminal-investigations-build-report.json', {});
const criminalDossierCoverage = readJson('downloads/criminal-status-dossier-coverage.json', {});
const report = {
  ok: repair.ok !== false && criminalAccountability.ok !== false && criminalDossierCoverage.ok !== false,
  generatedAt: new Date().toISOString(),
  investigationData: repair,
  criminalAccountability,
  criminalDossierCoverage,
  relationshipGraph: { edges: graphEdges, fieldsAddedOrRepaired: graphChanged, boundary: relationshipBoundary },
  clocks: { count: clockCount, fieldsAddedOrRepaired: clockChanged, withoutDirectEvidence: clocksWithoutDirectEvidence, noMovementRule: 'A clock without direct dated evidence must explicitly show no qualifying movement and cannot gain a score increase.' },
  rules: [
    'Every attempted daily source has a durable last-attempt state.',
    'The active investigation ledger is unique, bounded and evidence-complete; overflow and invalid-provenance records remain archived.',
    'Every relationship edge states what it records and what it does not prove.',
    'Every clock explains movement, mission meaning, counterpoint and claim boundary.',
    'Every approved criminal-accountability subject has an exact legal status, complete dossier, conclusion, sources, limitations and current or historical marker.',
    'Every dossier on the site contains a Criminal & Safeguarding Status panel; no approved match is never described as clearance or exoneration.',
    'The Predators in Power programme retains a minimum target of 100 evidence-qualified dossiers and reports progress on every build.',
    'Missing provenance or missing current evidence is exposed rather than silently filled with an accusation.'
  ]
};
writeJson('data/mission-data-contract-report.json', report);
writeJson('downloads/mission-data-contract-report.json', report);
if (!report.ok) throw new Error('Mission data contracts failed because investigation, criminal-accountability or dossier-coverage data did not complete.');
console.log(`Mission data contracts enforced: ${graphEdges} graph edges checked; ${clockCount} clocks checked; ${repair.ledger?.active || 0} active findings normalized; ${criminalAccountability.subjects || 0} accountability dossiers regenerated; ${criminalDossierCoverage.dossierPagesDetected || 0} dossier pages carry criminal status.`);
