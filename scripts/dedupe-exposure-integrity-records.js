'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');

function read(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
function write(relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  if (fs.existsSync(outputRoot)) {
    const out = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`);
  }
}
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value = '') { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function unique(values) { return [...new Set(array(values).map(clean).filter(Boolean))]; }
function mergeText(left, right) {
  const values = unique([left, right]);
  return values.join(' | ');
}
function rank(value) {
  return ({ fact_adjudicated: 1, fact_official_record: 2, fact_corroborated: 3, official_allegation: 4, attributed_allegation: 5, documented_association: 6, analytical_inference: 7, rumour: 8, speculation: 9, unsupported_or_debunked: 10 })[value] || 99;
}
function mergeRecord(existing, incoming) {
  const stronger = rank(incoming.classification) < rank(existing.classification) ? incoming : existing;
  return {
    ...existing,
    ...stronger,
    classification: stronger.classification,
    sourceRoutes: unique([...array(existing.sourceRoutes), ...array(incoming.sourceRoutes)]),
    conductDomains: unique([...array(existing.conductDomains), ...array(incoming.conductDomains)]),
    origin: unique([...(clean(existing.origin).split(' | ')), ...(clean(incoming.origin).split(' | '))]).join(' | '),
    summary: mergeText(existing.summary, incoming.summary),
    establishes: mergeText(existing.establishes, incoming.establishes),
    doesNotEstablish: mergeText(existing.doesNotEstablish, incoming.doesNotEstablish),
    rightOfReply: mergeText(existing.rightOfReply, incoming.rightOfReply),
    counterEvidence: mergeText(existing.counterEvidence, incoming.counterEvidence),
    missingEvidence: mergeText(existing.missingEvidence, incoming.missingEvidence),
    lastChecked: [clean(existing.lastChecked), clean(incoming.lastChecked)].filter(Boolean).sort().reverse()[0] || ''
  };
}
function dedupeEvidence(items) {
  const map = new Map();
  for (const item of array(items)) {
    const key = `${clean(item.title).toLowerCase()}::${clean(item.establishes || item.boundary).toLowerCase()}`;
    if (!map.has(key)) map.set(key, { ...item, sourceRoutes: unique(item.sourceRoutes) });
    else {
      const current = map.get(key);
      current.sourceRoutes = unique([...array(current.sourceRoutes), ...array(item.sourceRoutes)]);
      current.boundary = mergeText(current.boundary, item.boundary);
      map.set(key, current);
    }
  }
  return [...map.values()];
}

const ledger = read('data/exposure-evidence-ledger.json');
const hit = read('data/cinematic-hit-list.json');
const engine = read('data/exposure-integrity-engine.json');
const map = new Map();
let merged = 0;

for (const entry of array(ledger.entries)) {
  const key = `${clean(entry.entityId)}:${clean(entry.recordId)}`;
  if (!map.has(key)) map.set(key, entry);
  else {
    map.set(key, mergeRecord(map.get(key), entry));
    merged += 1;
  }
}
ledger.entries = [...map.values()];
ledger.count = ledger.entries.length;

for (const entry of array(hit.entries)) {
  entry.documentedEvidence = dedupeEvidence(entry.documentedEvidence);
  entry.allegationsOrHypotheses = dedupeEvidence(entry.allegationsOrHypotheses);
}
hit.count = array(hit.entries).length;

engine.summary.evidenceLedgerEntries = ledger.count;
engine.summary.duplicateLedgerRecordsMerged = merged;
engine.improvements = unique([...array(engine.improvements), merged ? `${merged} duplicate cross-registry evidence record(s) were merged while preserving all source routes and registry origins.` : 'No duplicate cross-registry evidence records required merging.']);

write('data/exposure-evidence-ledger.json', ledger);
write('data/cinematic-hit-list.json', hit);
write('data/exposure-integrity-engine.json', engine);
write('downloads/exposure-integrity-report.json', engine);

const keys = ledger.entries.map(entry => `${clean(entry.entityId)}:${clean(entry.recordId)}`);
if (new Set(keys).size !== keys.length) throw new Error('Exposure ledger still contains duplicate entity/record keys after merge');
console.log(`Exposure Integrity deduplication passed: ${merged} cross-registry duplicate(s) merged; ${ledger.count} canonical ledger record(s) remain.`);
