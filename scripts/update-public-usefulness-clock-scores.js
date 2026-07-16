'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'global-risk-clocks.json');
const wallPath = path.join(root, 'data', 'clock-wall.json');
const registry = require('./public-usefulness-clocks.js');
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
function analyse(clock, wallClock, definition) {
  const windowDays = Number(definition.evidenceWindowDays || 180);
  const evidence = uniqueEvidence([...(wallClock?.evidenceInputs || []), ...(clock.latestDrops || [])]);
  const fresh = evidence.filter(item => {
    const age = ageDays(item.published);
    return age >= 0 && age <= windowDays;
  });
  const authoritative = fresh.filter(item => /official|court|regulator|primary|audited|legislation|judgment|filing|government|parliament|central bank/i.test(`${item.evidenceLevel || ''} ${item.sourceFile || ''}`));
  const implementation = fresh.filter(item => /adopted|enacted|mandatory|required|implemented|implementation|rollout|launched|approved|signed|contract|procurement|enforcement|judgment|ordered|fine|sanction|outage|shortage|closure|increase|expanded|integrated|pilot|ratification/i.test(`${item.title || ''} ${item.summary || ''}`));
  const counter = fresh.filter(item => /repealed|blocked|overturned|cancelled|withdrawn|reversed|restored|reduced|improved|expired|sunset|postponed|defunded|rejected|struck down/i.test(`${item.title || ''} ${item.summary || ''}`));
  const score = authoritative.length * 2 + Math.max(0, fresh.length - authoritative.length) + implementation.length - counter.length * 2;
  let movement = 0;
  if (score >= 9) movement = 2;
  else if (score >= 4) movement = 1;
  else if (score <= -4) movement = -2;
  else if (score < 0) movement = -1;
  const cap = Math.max(1, Number(definition.maxMovementPerBuild || 3));
  movement = Math.max(-cap, Math.min(cap, movement));
  return {
    movement,
    freshCount: fresh.length,
    authoritativeCount: authoritative.length,
    implementationCount: implementation.length,
    counterSignalCount: counter.length,
    evidenceCount: evidence.length,
    reason: `Evidence change: ${fresh.length} fresh records, ${authoritative.length} primary/official, ${implementation.length} implementation signals, ${counter.length} counter-signals. Repetition alone does not move the score.`
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
    status = movement === 0 ? 'evidence-changed-no-threshold-movement' : 'evidence-changed-score-updated';
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
    automaticEvidenceCounts: {
      total: analysis.evidenceCount,
      fresh: analysis.freshCount,
      primaryOrOfficial: analysis.authoritativeCount,
      implementation: analysis.implementationCount,
      counterSignals: analysis.counterSignalCount
    }
  };
});

source.updated = new Date().toISOString();
source.automaticUpdatePolicy = 'Reader-facing clocks use evidence fingerprints, source freshness, primary-record weight, implementation signals, counter-signals, score floors/ceilings and capped movement. Duplicate reporting alone cannot raise a score.';
fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
console.log(`Public usefulness clock scoring complete: ${registry.length} clocks checked; ${changed} fingerprints initialised or changed.`);
