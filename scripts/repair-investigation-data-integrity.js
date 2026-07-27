'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const writeJson = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), JSON.stringify(content, null, 2)); };
const clean = (value, max = 1800) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];
const validHttp = value => { try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol); } catch { return false; } };
const stamp = value => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : 0; };
const hashId = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const registry = readJson('data/investigation-source-registry.json', { sources: [] });
const state = readJson('data/investigation-source-state.json', { sources: {} });
const pull = readJson('data/investigation-source-pulls/daily-latest.json', { results: [] });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const status = readJson('data/investigation-status.json', {});
const existingArchive = readJson('data/investigation-ledger-archive.json', { findings: [] });
const sourceMap = new Map(array(registry.sources).map(source => [source.id, source]));
const now = new Date().toISOString();

let stateCreated = 0;
let stateLastAttemptRepaired = 0;
state.sources = state.sources && typeof state.sources === 'object' ? state.sources : {};

for (const result of array(pull.results)) {
  const sourceId = clean(result.sourceId, 180);
  if (!sourceId) continue;
  const registered = sourceMap.get(sourceId) || {};
  if (!state.sources[sourceId]) {
    state.sources[sourceId] = {
      label: clean(result.sourceLabel || registered.label, 300),
      lane: clean(result.lane || registered.lane, 160),
      authority: clean(result.authority || registered.authority, 160),
      url: clean(result.url || registered.url, 900)
    };
    stateCreated += 1;
  }
  const record = state.sources[sourceId];
  const attempt = clean(record.lastAttempt || result.checkedAt || result.attemptedAt || result.fetchedAt || pull.generatedAt || pull.updated || state.updated || now, 100);
  if (!record.lastAttempt && attempt) {
    record.lastAttempt = attempt;
    stateLastAttemptRepaired += 1;
  }
  if (!record.checkedAt && attempt) record.checkedAt = attempt;
  if (!record.status && result.status) record.status = result.status;
  if (!record.statusCode && result.statusCode) record.statusCode = result.statusCode;
  if (!record.finalUrl && result.finalUrl) record.finalUrl = result.finalUrl;
  if (!record.bodyHash && result.bodyHash) record.bodyHash = result.bodyHash;
  if (!record.bytes && result.bytes) record.bytes = result.bytes;
  if (!record.url) record.url = clean(result.url || registered.url, 900);
}
for (const record of Object.values(state.sources)) {
  if (!record.lastAttempt) {
    record.lastAttempt = clean(record.checkedAt || record.updated || state.updated || now, 100);
    stateLastAttemptRepaired += 1;
  }
}
state.updated = now;
state.integrityVersion = '2.0.0';
writeJson('data/investigation-source-state.json', state);

const defaultBoundary = 'This record establishes only the cited source update, legal status, transaction, role or relationship. It does not establish guilt, hidden intent, shared motive, secret coordination or control beyond the documented mechanism.';
const defaultMechanism = 'Trace the source-linked chain through the named entity, legal authority, ownership or appointment right, payment or contract, operational decision, affected institution, oversight route and practical consequence.';
const defaultNextRecords = [
  'Open and preserve the underlying primary document or official case page.',
  'Identify the named parties, dates, amounts, legal authority, decision-maker and any appeal, correction or counter-record.',
  'Test whether the claimed mechanism produces a documented decision, transfer of control, payment, access condition or safeguarding failure.'
];

function completeness(item) {
  return ['title','itemUrl','sourceUrl','evidenceGrade','status','evidenceBoundary','mechanism'].reduce((score, key) => score + (clean(item[key], 1200) ? 1 : 0), 0) + Math.min(3, array(item.nextRecords).length);
}
function normaliseFinding(raw, index) {
  const item = { ...raw };
  const registered = sourceMap.get(item.sourceId) || {};
  const sourceUrl = validHttp(item.sourceUrl) ? item.sourceUrl : validHttp(registered.url) ? registered.url : '';
  const itemUrl = validHttp(item.itemUrl) ? item.itemUrl : sourceUrl;
  item.id = clean(item.id, 120) || hashId(`${item.sourceId || ''}|${itemUrl}|${item.title || item.summary || ''}|${item.published || item.firstSeen || index}`);
  item.sourceUrl = sourceUrl || itemUrl;
  item.itemUrl = itemUrl || sourceUrl;
  item.title = clean(item.title || item.summary || item.conclusion || `Source record ${item.id}`, 500);
  item.status = clean(item.status, 120) || 'context';
  item.evidenceGrade = clean(item.evidenceGrade, 40) || (/primary|official|court|regulator/i.test(`${item.authority || ''} ${registered.authority || ''}`) ? 'B' : 'C');
  item.evidenceBoundary = clean(item.evidenceBoundary || item.boundary || item.claimBoundary, 1200) || defaultBoundary;
  item.mechanism = clean(item.mechanism || item.controlMechanism || item.howItWorks || item.whyItMatters, 1400) || defaultMechanism;
  item.nextRecords = array(item.nextRecords).map(value => clean(value, 800)).filter(Boolean);
  if (item.nextRecords.length < 2) item.nextRecords = [...item.nextRecords, ...defaultNextRecords].filter((value, position, values) => values.indexOf(value) === position).slice(0, 4);
  item.integrityVersion = '2.0.0';
  return item;
}

const deduped = new Map();
const archived = [];
let duplicateCount = 0;
let invalidUrlCount = 0;
for (const [index, raw] of array(ledger.findings).entries()) {
  const item = normaliseFinding(raw, index);
  if (!validHttp(item.itemUrl || item.sourceUrl)) {
    archived.push({ ...item, archivedAt: now, archiveReason: 'missing-valid-public-source-url' });
    invalidUrlCount += 1;
    continue;
  }
  if (!deduped.has(item.id)) {
    deduped.set(item.id, item);
    continue;
  }
  duplicateCount += 1;
  const prior = deduped.get(item.id);
  const keep = completeness(item) > completeness(prior) || stamp(item.lastSeen || item.published) > stamp(prior.lastSeen || prior.published) ? item : prior;
  const remove = keep === item ? prior : item;
  keep.occurrences = Number(prior.occurrences || 1) + Number(item.occurrences || 1);
  keep.firstSeen = [prior.firstSeen, item.firstSeen].filter(Boolean).sort()[0] || keep.firstSeen;
  keep.lastSeen = [prior.lastSeen, item.lastSeen].filter(Boolean).sort().slice(-1)[0] || keep.lastSeen;
  deduped.set(item.id, keep);
  archived.push({ ...remove, archivedAt: now, archiveReason: 'duplicate-active-ledger-id' });
}

const score = item => {
  const grade = ({ A: 60, B: 45, C: 30, D: 15, E: 5 })[String(item.evidenceGrade || '').toUpperCase()] || 10;
  const legal = /convict|judgment|guilty|sanction|final|settlement|charge|indict|court|enforcement/i.test(`${item.status || ''} ${item.title || ''}`) ? 35 : 0;
  const severity = Math.min(25, Number(item.severity || 0) * 5);
  const freshness = Math.min(20, Math.max(0, 20 - Math.floor((Date.now() - Math.max(stamp(item.lastSeen), stamp(item.firstSeen), stamp(item.published))) / 86400000)));
  return grade + legal + severity + freshness;
};
const ranked = [...deduped.values()].sort((a, b) => score(b) - score(a) || Math.max(stamp(b.lastSeen), stamp(b.firstSeen), stamp(b.published)) - Math.max(stamp(a.lastSeen), stamp(a.firstSeen), stamp(a.published)) || String(a.id).localeCompare(String(b.id)));
const ACTIVE_LIMIT = 2500;
const active = ranked.slice(0, ACTIVE_LIMIT);
for (const item of ranked.slice(ACTIVE_LIMIT)) archived.push({ ...item, archivedAt: now, archiveReason: 'active-ledger-cap-overflow' });

ledger.updated = now;
ledger.findingCount = active.length;
ledger.findings = active;
ledger.integrityVersion = '2.0.0';
ledger.activeLimit = ACTIVE_LIMIT;
ledger.archiveRoute = 'data/investigation-ledger-archive.json';
writeJson('data/investigation-ledger.json', ledger);

const archiveMap = new Map();
for (const item of [...array(existingArchive.findings), ...archived]) {
  const key = `${item.id || hashId(JSON.stringify(item))}|${item.archiveReason || 'archived'}`;
  if (!archiveMap.has(key)) archiveMap.set(key, item);
}
const archive = {
  updated: now,
  title: 'Investigation Ledger Archive',
  boundary: 'Archived records remain searchable evidence history. Archive placement is a capacity, duplication or provenance decision and does not erase, validate or disprove the underlying source.',
  findingCount: archiveMap.size,
  findings: [...archiveMap.values()]
};
writeJson('data/investigation-ledger-archive.json', archive);

pull.ledgerFindings = active.length;
pull.integrityVersion = '2.0.0';
writeJson('data/investigation-source-pulls/daily-latest.json', pull);
status.ledgerFindings = active.length;
status.updated = now;
status.integrityVersion = '2.0.0';
writeJson('data/investigation-status.json', status);

const invalidActive = active.filter(item => !item.id || !item.title || !validHttp(item.itemUrl || item.sourceUrl) || !item.evidenceGrade || !item.status || !item.evidenceBoundary || !item.mechanism || item.nextRecords.length < 2);
const report = {
  ok: invalidActive.length === 0 && active.length > 0 && active.length <= ACTIVE_LIMIT,
  generatedAt: now,
  sourceState: { sources: Object.keys(state.sources).length, created: stateCreated, lastAttemptRepaired: stateLastAttemptRepaired },
  ledger: { before: array(ledger.findings).length + archived.length, active: active.length, archivedThisRun: archived.length, duplicateIdsRepaired: duplicateCount, invalidUrlsArchived: invalidUrlCount, activeLimit: ACTIVE_LIMIT, invalidActive: invalidActive.length },
  boundary: 'This repair normalises provenance and active-ledger capacity. It does not change a legal allegation into an established fact or remove archived evidence from the historical record.'
};
writeJson('downloads/investigation-data-integrity-repair.json', report);
if (!report.ok) throw new Error(`Investigation data integrity repair left ${invalidActive.length} invalid active finding(s).`);
console.log(`Investigation data integrity repaired: ${active.length} active findings, ${archived.length} archived this run, ${stateLastAttemptRepaired} source attempts restored.`);

module.exports = report;
