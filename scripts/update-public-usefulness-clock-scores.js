'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'global-risk-clocks.json');
const wallPath = path.join(root, 'data', 'clock-wall.json');
const registry = require('./all-reader-clocks.js');
const registryLookup = new Map(registry.map(clock => [clock.slug, clock]));

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function uniqueEvidence(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = `${clean(item.sourceFile)}|${clean(item.route)}|${clean(item.title).toLowerCase()}`;
    if (!clean(item.title) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function ageDays(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / 86400000) : Infinity;
}
function fingerprint(items, drops) {
  const stable = [...uniqueEvidence(items).map(item => ({
    title: clean(item.title),
    route: clean(item.route),
    published: clean(item.published),
    evidenceLevel: clean(item.evidenceLevel),
    sourceFile: clean(item.sourceFile)
  })), ...(drops || []).map(item => ({
    title: clean(item.title),
    route: clean(item.route),
    published: clean(item.published),
    evidenceLevel: clean(item.evidenceLevel),
    sourceFile: 'curated-drop'
  }))].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function primary(item) {
  return /official|court|regulator|primary|audited|legislation|judgment|filing|government|parliament|central bank|inspection|sanction|police|ministry|scientific|peer-reviewed/i.test(`${item.evidenceLevel || ''} ${item.sourceFile || ''} ${item.title || ''}`);
}
function implementationSignal(item) {
  return /adopted|enacted|mandatory|required|implemented|implementation|rollout|launched|approved|signed|contract|procurement|enforcement|judgment|ordered|fine|sanction|outage|shortage|closure|increase|expanded|integrated|pilot|ratification|inspection|indictment|conviction|finding|admission|authenticated/i.test(`${item.title || ''} ${item.summary || ''}`);
}
function counterSignal(item) {
  return /repealed|blocked|overturned|cancelled|withdrawn|reversed|restored|reduced|improved|expired|sunset|postponed|defunded|rejected|struck down|debunked|false|misidentified|correction|retraction|dismissed|not substantiated|no evidence/i.test(`${item.title || ''} ${item.summary || ''}`);
}
function caseRecord(item) {
  return /court|police|inspection|official report|investigation|indictment|conviction|authenticated|exhibit|physical evidence|forensic|sanction/i.test(`${item.evidenceLevel || ''} ${item.sourceFile || ''} ${item.title || ''} ${item.summary || ''}`);
}
function authenticatedMechanism(item) {
  return primary(item) && /authenticated|admission|contract|filing|judgment|official record|physical evidence|verified metadata|chain of custody|mechanism/i.test(`${item.title || ''} ${item.summary || ''} ${item.evidenceLevel || ''}`);
}
function baseAnalysis(clock, wallClock, definition) {
  const windowDays = Number(definition.evidenceWindowDays || 180);
  const evidence = uniqueEvidence([...(wallClock?.evidenceInputs || []), ...(clock.latestDrops || [])]);
  const fresh = evidence.filter(item => {
    const age = ageDays(item.published);
    return age >= 0 && age <= windowDays;
  });
  const authoritative = fresh.filter(primary);
  const implementation = fresh.filter(implementationSignal);
  const counter = fresh.filter(counterSignal);
  const caseSpecific = fresh.filter(caseRecord);
  const authenticated = fresh.filter(authenticatedMechanism);
  const raw = authoritative.length * 2 + Math.max(0, fresh.length - authoritative.length) + implementation.length - counter.length * 2;
  let movement = 0;
  if (raw >= 9) movement = 2;
  else if (raw >= 4) movement = 1;
  else if (raw <= -4) movement = -2;
  else if (raw < 0) movement = -1;
  const cap = Math.max(1, Number(definition.maxMovementPerBuild || 3));
  movement = Math.max(-cap, Math.min(cap, movement));
  return {
    movement,
    raw,
    evidence,
    fresh,
    authoritative,
    implementation,
    counter,
    caseSpecific,
    authenticated
  };
}
function applySpeculationGate(analysis, definition) {
  if (!definition.speculationOnly) {
    return { movement: analysis.movement, gateStatus: 'standard-evidence-gate', gatePassed: true };
  }
  if (analysis.movement < 0) {
    return { movement: analysis.movement, gateStatus: 'counter-evidence-lowering-allowed', gatePassed: true };
  }
  if (analysis.movement === 0) {
    return { movement: 0, gateStatus: 'no-threshold-movement', gatePassed: true };
  }
  const mode = definition.automaticRaiseMode;
  if (mode === 'automatic-increase-disabled') {
    return { movement: 0, gateStatus: 'automatic-increase-disabled-for-claim-class', gatePassed: false };
  }
  if (mode === 'primary-record-gated') {
    const passed = analysis.authoritative.length >= 1;
    return { movement: passed ? analysis.movement : 0, gateStatus: passed ? 'primary-record-gate-passed' : 'primary-record-gate-held', gatePassed: passed };
  }
  if (mode === 'primary-mechanism-gated') {
    const passed = analysis.authoritative.length >= 1 && analysis.implementation.length >= 1;
    return { movement: passed ? analysis.movement : 0, gateStatus: passed ? 'primary-mechanism-gate-passed' : 'primary-mechanism-gate-held', gatePassed: passed };
  }
  if (mode === 'multi-primary-implementation-gated') {
    const passed = analysis.authoritative.length >= 2 && analysis.implementation.length >= 1;
    return { movement: passed ? analysis.movement : 0, gateStatus: passed ? 'multi-primary-implementation-gate-passed' : 'multi-primary-implementation-gate-held', gatePassed: passed };
  }
  if (mode === 'case-record-gated') {
    const passed = analysis.caseSpecific.length >= 1 && analysis.authoritative.length >= 1;
    return { movement: passed ? analysis.movement : 0, gateStatus: passed ? 'case-record-gate-passed' : 'case-record-gate-held', gatePassed: passed };
  }
  if (mode === 'authenticated-mechanism-only') {
    const passed = analysis.authenticated.length >= 2;
    return { movement: passed ? Math.min(1, analysis.movement) : 0, gateStatus: passed ? 'authenticated-mechanism-gate-passed' : 'authenticated-mechanism-gate-held', gatePassed: passed };
  }
  return { movement: 0, gateStatus: 'unknown-speculation-gate-held', gatePassed: false };
}
function analyse(clock, wallClock, definition) {
  const base = baseAnalysis(clock, wallClock, definition);
  const gated = applySpeculationGate(base, definition);
  return {
    movement: gated.movement,
    gateStatus: gated.gateStatus,
    gatePassed: gated.gatePassed,
    freshCount: base.fresh.length,
    authoritativeCount: base.authoritative.length,
    implementationCount: base.implementation.length,
    counterSignalCount: base.counter.length,
    caseRecordCount: base.caseSpecific.length,
    authenticatedMechanismCount: base.authenticated.length,
    evidenceCount: base.evidence.length,
    reason: `Evidence change: ${base.fresh.length} fresh records, ${base.authoritative.length} primary/official, ${base.implementation.length} implementation signals, ${base.counter.length} counter-signals, ${base.caseSpecific.length} case records and ${base.authenticated.length} authenticated-mechanism indicators. Gate: ${gated.gateStatus}. Repetition alone does not move the score.`
  };
}

const source = read(sourcePath, { clocks: [] });
const wall = read(wallPath, { clocks: [] });
const wallLookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));
let changed = 0;

source.clocks = (source.clocks || []).map(clock => {
  const definition = registryLookup.get(clock.slug);
  if (!definition || !clock.automaticUpdate) return clock;
  const wallClock = wallLookup.get(clock.slug) || {};
  const nextFingerprint = fingerprint(wallClock.evidenceInputs || [], clock.latestDrops || []);
  const previousFingerprint = clean(clock.evidenceFingerprint);
  const firstRun = !previousFingerprint;
  const evidenceChanged = Boolean(previousFingerprint && previousFingerprint !== nextFingerprint);
  const analysis = analyse(clock, wallClock, definition);
  let score = Number(clock.score || definition.baselineScore || 0);
  let movement = 0;
  let status = 'evidence-unchanged-score-held';
  if (firstRun) {
    status = 'evidence-fingerprint-initialised-score-held';
  } else if (evidenceChanged) {
    movement = analysis.movement;
    score = Math.max(Number(definition.scoreFloor || 0), Math.min(Number(definition.scoreCeiling || 100), score + movement));
    if (!analysis.gatePassed && definition.speculationOnly) status = 'speculation-evidence-gate-held';
    else status = movement === 0 ? 'evidence-changed-no-threshold-movement' : 'evidence-changed-score-updated';
  }
  if (firstRun || evidenceChanged) changed += 1;
  return {
    ...clock,
    score,
    previousAutomaticScore: Number(clock.score || score),
    automaticScoreMovement: movement,
    evidenceFingerprint: nextFingerprint,
    lastEvidenceChangeAt: firstRun || evidenceChanged ? new Date().toISOString() : (clock.lastEvidenceChangeAt || ''),
    automaticUpdateStatus: status,
    automaticUpdateReason: analysis.reason,
    automaticEvidenceGate: {
      claimClass: definition.claimClass || '',
      mode: definition.automaticRaiseMode || 'standard-evidence-gated',
      status: analysis.gateStatus,
      passed: analysis.gatePassed,
      requirement: definition.evidenceGate || definition.raiseRule || ''
    },
    automaticEvidenceCounts: {
      total: analysis.evidenceCount,
      fresh: analysis.freshCount,
      primaryOrOfficial: analysis.authoritativeCount,
      implementation: analysis.implementationCount,
      counterSignals: analysis.counterSignalCount,
      caseRecords: analysis.caseRecordCount,
      authenticatedMechanisms: analysis.authenticatedMechanismCount
    }
  };
});

source.updated = new Date().toISOString();
source.automaticUpdatePolicy = 'Practical clocks use evidence fingerprints, freshness, primary-record weight, implementation signals, counter-signals and capped movement. Speculation clocks add claim-class gates. Internet mythology, paranormal claims and unsupported extreme allegations cannot rise automatically from mentions. Duplicate reporting alone cannot raise any clock.';
fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
console.log(`Reader-clock scoring complete: ${registry.length} clocks checked; ${changed} fingerprints initialised or changed.`);
