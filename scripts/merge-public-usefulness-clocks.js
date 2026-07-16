'use strict';

const fs = require('fs');
const path = require('path');
const clocks = require('./all-reader-clocks.js');

const root = process.cwd();
const target = path.join(root, 'data', 'global-risk-clocks.json');
const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : { clocks: [] };

const tracker = {
  'speech-and-platform-governance': ['Speech / Platforms / Search / Payment Access', 'control-system-tracker.html#speech-and-platform-governance'],
  'digital-id': ['Digital ID / Biometrics / Identity Wallets', 'control-system-tracker.html#digital-id'],
  'security-and-war-powers': ['War / Security / Emergency Powers', 'control-system-tracker.html#security-and-war-powers'],
  'food-water-land-and-supply-chains': ['Food / Water / Land / Supply Chains', 'control-system-tracker.html#food-water-land-and-supply-chains'],
  'programmable-money': ['CBDC / Tokenized Money / Programmable Finance', 'control-system-tracker.html#programmable-money'],
  'agenda-2030-and-global-standards': ['Agenda 2030 / Global Standards / Policy Harmonisation', 'control-system-tracker.html#agenda-2030-and-global-standards'],
  'health-and-biosecurity': ['Health Governance / Biosecurity / Emergency Health Powers', 'control-system-tracker.html#health-and-biosecurity'],
  'climate-energy-and-carbon': ['Climate / Energy / Carbon / Mobility', 'control-system-tracker.html#climate-energy-and-carbon']
};

function policyLinks(clock) {
  if (!clock.trackerLane || !tracker[clock.trackerLane]) return [];
  const [title, route] = tracker[clock.trackerLane];
  return [{
    trackerLane: clock.trackerLane,
    trackerTitle: title,
    readerQuestion: clock.readerQuestion,
    timerTrigger: clock.raiseRule,
    escalationRule: clock.raiseRule,
    trackerRoute: route
  }];
}

const existing = new Map((current.clocks || []).map(clock => [clock.slug, clock]));
for (const definition of clocks) {
  const prior = existing.get(definition.slug) || {};
  existing.set(definition.slug, {
    ...prior,
    ...definition,
    score: Number.isFinite(Number(prior.score)) ? Number(prior.score) : Number(definition.score),
    baselineScore: Number(definition.baselineScore),
    policyConvergenceLinks: policyLinks(definition),
    timerUpdateRule: `${definition.raiseRule} ${definition.lowerRule}`,
    latestDrops: Array.isArray(prior.latestDrops) ? prior.latestDrops : [],
    evidenceFingerprint: prior.evidenceFingerprint || '',
    lastEvidenceChangeAt: prior.lastEvidenceChangeAt || '',
    automaticUpdateStatus: prior.automaticUpdateStatus || 'awaiting-first-evidence-fingerprint'
  });
}

const originalOrder = (current.clocks || []).map(clock => clock.slug);
const newOrder = clocks.map(clock => clock.slug).filter(slug => !originalOrder.includes(slug));
const merged = [...originalOrder, ...newOrder].map(slug => existing.get(slug)).filter(Boolean);
const practicalCount = clocks.filter(clock => !clock.speculationOnly).length;
const speculationCount = clocks.filter(clock => clock.speculationOnly).length;

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({
  ...current,
  updated: new Date().toISOString(),
  summary: 'Evidence-fed pressure indexes with reader-facing categories, bounded automatic movement, source trails, counter-signals, useful actions and a separately gated speculation registry.',
  automaticUpdatePolicy: 'Scores move only when a clock evidence fingerprint changes. Movement is capped per build and repetition alone cannot raise a score. Speculation clocks apply claim-class-specific evidence gates; mythology, paranormal and unsupported extreme allegations cannot rise automatically from mentions.',
  practicalReaderClockCount: practicalCount,
  speculativeReaderClockCount: speculationCount,
  clockRegistryCount: clocks.length,
  clocks: merged
}, null, 2));

console.log(`Reader clock merge complete: ${practicalCount} practical clocks, ${speculationCount} speculation clocks; ${merged.length} canonical clocks total.`);
