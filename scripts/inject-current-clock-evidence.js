'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'global-risk-clocks.json');
const wallPath = path.join(root, 'data', 'clock-wall.json');
const currentPath = path.join(root, 'data', 'current-clock-evidence.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value, max = 1800) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalise(item) {
  return {
    title: clean(item.title, 500),
    summary: clean(item.summary, 1800),
    route: clean(item.route, 1200),
    published: clean(item.published, 80),
    effectiveDate: clean(item.effectiveDate, 80),
    evidenceLevel: clean(item.evidenceLevel, 240),
    sourceType: clean(item.sourceType, 120),
    jurisdiction: clean(item.jurisdiction, 300),
    legalStatus: clean(item.legalStatus, 180),
    implementationStage: clean(item.implementationStage, 240),
    identityLink: clean(item.identityLink, 1400),
    factClass: clean(item.factClass, 180),
    claimBoundary: clean(item.claimBoundary, 1400),
    sourceFile: 'data/current-clock-evidence.json',
    matchScore: 100,
    curatedCurrentEvidence: true
  };
}
function unique(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = `${clean(item.route, 1200)}|${clean(item.title, 500).toLowerCase()}|${clean(item.jurisdiction, 300)}`;
    if (!clean(item.title, 500) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const source = read(sourcePath, { clocks: [] });
const wall = read(wallPath, { clocks: [] });
const current = read(currentPath, { records: [] });
const bySlug = new Map();
for (const raw of current.records || []) {
  const record = normalise(raw);
  for (const slug of raw.clockSlugs || []) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(record);
  }
}

let injectedClocks = 0;
let injectedRecords = 0;
source.clocks = (source.clocks || []).map(clock => {
  const records = bySlug.get(clock.slug) || [];
  if (!records.length) return clock;
  injectedClocks += 1;
  injectedRecords += records.length;
  return {
    ...clock,
    latestDrops: unique([...records, ...(clock.latestDrops || [])]),
    currentEvidenceRegistryUpdated: current.updated || '',
    currentEvidenceRegistryCount: records.length
  };
});
wall.clocks = (wall.clocks || []).map(clock => {
  const records = bySlug.get(clock.slug) || [];
  if (!records.length) return clock;
  return {
    ...clock,
    evidenceInputs: unique([...records, ...(clock.evidenceInputs || [])]),
    currentEvidenceRegistryUpdated: current.updated || '',
    currentEvidenceRegistryCount: records.length
  };
});
source.currentEvidenceRegistry = 'data/current-clock-evidence.json';
source.currentEvidenceRegistryUpdated = current.updated || '';
wall.currentEvidenceRegistry = 'data/current-clock-evidence.json';
wall.currentEvidenceRegistryUpdated = current.updated || '';
fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
fs.writeFileSync(wallPath, JSON.stringify(wall, null, 2));
console.log(`Current clock evidence injected before scoring: ${injectedRecords} clock-record links across ${injectedClocks} clocks.`);
