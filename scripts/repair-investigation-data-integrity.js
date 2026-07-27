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
const unique = values => [...new Set(values.filter(Boolean))];
const validHttp = value => { try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol); } catch { return false; } };
const stamp = value => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : 0; };
const hashId = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const registry = readJson('data/investigation-source-registry.json', { sources: [] });
const state = readJson('data/investigation-source-state.json', { sources: {} });
const pull = readJson('data/investigation-source-pulls/daily-latest.json', { results: [] });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const originalFindingCount = array(ledger.findings).length;
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
state.integrityVersion = '2.1.0';
writeJson('data/investigation-source-state.json', state);

const defaultBoundary = 'This record establishes only the cited source update, legal status, transaction, role or relationship. It does not establish guilt, hidden intent, shared motive, secret coordination or control beyond the documented mechanism.';
const defaultMechanism = 'Trace the source-linked chain through the named entity, legal authority, ownership or appointment right, payment or contract, operational decision, affected institution, oversight route and practical consequence.';
const defaultAlternative = 'The event may be ordinary, lawful, limited to the exact role or transaction described, and constrained by independent boards, courts, regulators, markets, contractual limits or effective appeal.';
const defaultNextRecords = [
  'Open and preserve the underlying primary document or official case page.',
  'Identify the named parties, dates, amounts, legal authority, decision-maker and any appeal, correction or counter-record.',
  'Test whether the claimed mechanism produces a documented decision, transfer of control, payment, access condition or safeguarding failure.'
];

function evidenceStrength(item) {
  const grade = String(item.evidenceGrade || '').toUpperCase();
  const text = `${item.status || ''} ${item.title || ''} ${item.authority || ''}`.toLowerCase();
  if (/final adjudication|final judgment|convict|guilty plea|official sanction/.test(text)) return 'E5–E6 — official finding or final adjudication within the exact scope of the cited record';
  if (/charge|indict|complaint|investigat/.test(text)) return 'E4–E5 — primary official allegation or investigation; not proof of guilt';
  if (grade === 'A') return 'E5 — high-authority official or adjudicated record';
  if (grade === 'B') return 'E4 — primary-source or official public record';
  if (grade === 'C') return 'E3 — credible secondary or corroborated evidence';
  if (grade === 'D') return 'E2 — documented mention or association';
  return 'E1 — lead requiring verification';
}
function effectOnLane(item) {
  const text = `${item.status || ''} ${item.title || ''}`.toLowerCase();
  if (/acquit|dismiss|overturn|vacat|exonerat|corrected false|retract/.test(text)) return 'moderately-weakens';
  if (/final judgment|convict|guilty plea|official sanction|final enforcement/.test(text)) return 'strongly-strengthens';
  if (/charge|indict|official investigation|civil complaint/.test(text)) return 'new-investigative-lead';
  if (/changed|new filing|record-update|transaction|award|appointment/.test(text)) return 'adds-context';
  return 'slightly-strengthens';
}
function confidence(item) {
  const strength = evidenceStrength(item);
  if (/E5–E6|E5 —/.test(strength)) return 'high';
  if (/E4/.test(strength)) return 'moderate-to-high';
  if (/E3/.test(strength)) return 'moderate';
  return 'low-to-moderate';
}
function missionFields(item) {
  const lane = clean(item.laneTitle || item.lane || 'Public-record investigation', 240);
  const summary = clean(item.summary, 1000);
  const conclusion = clean(item.conclusion, 1000);
  const implication = clean(item.implication || item.whyItMatters, 1200);
  const mechanism = clean(item.mechanism, 1400) || defaultMechanism;
  const boundary = clean(item.evidenceBoundary, 1200) || defaultBoundary;
  const nextQuestions = array(item.nextRecords).map(value => clean(value, 800)).filter(Boolean);
  const statusLabel = clean(item.status, 160).replace(/-/g, ' ');
  const sourceRoutes = unique([item.itemUrl, item.sourceUrl]).filter(validHttp);
  const childSensitive = /child|minor|csam|sexual exploitation|trafficking/i.test(`${item.title || ''} ${summary} ${lane}`);
  const exactLegalStatusPresent = /convict|charg|indict|judgment|complaint|investigat|acquit|dismiss|sanction/i.test(`${item.status || ''} ${item.title || ''}`);
  return {
    whatWasFound: conclusion || `${item.title}${summary ? ` — ${summary}` : ''}`,
    whyItMatters: implication || `This source belongs in the ${lane} lane because it may identify a documented authority, transaction, legal outcome, institutional decision, safeguarding issue or control mechanism that changes the wider evidence picture.`,
    investigativeLanes: unique([lane, clean(item.lane, 180)]).filter(Boolean),
    howItFits: mechanism,
    effectOnLane: effectOnLane(item),
    whatItPointsToward: `Closer examination of how the documented ${statusLabel || 'record'} affects authority, ownership, money, access, enforcement, institutional accountability or safeguarding inside the ${lane} lane.`,
    alternativeExplanation: clean(item.alternativeExplanation || item.counterpoint, 1200) || defaultAlternative,
    whatItDoesNotProve: boundary,
    evidenceStrength: evidenceStrength(item),
    confidence: confidence(item),
    sourceRoutes,
    nextQuestions,
    sensitiveReviewRequired: childSensitive,
    childSafeguardingStatus: childSensitive ? (exactLegalStatusPresent ? 'legal-status-language-present-human-review-required' : 'do-not-publicly-flag-until-exact-legal-status-is-established') : 'not-applicable'
  };
}

function completeness(item) {
  return ['title','itemUrl','sourceUrl','evidenceGrade','status','evidenceBoundary','mechanism','whatWasFound','whyItMatters','howItFits','whatItPointsToward','whatItDoesNotProve'].reduce((score, key) => score + (clean(item[key], 1600) ? 1 : 0) + Math.min(3, array(item.nextRecords).length) + Math.min(2, array(item.sourceRoutes).length);
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
  Object.assign(item, missionFields(item));
  item.integrityVersion = '2.1.0';
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
  const freshest = Math.max(stamp(item.lastSeen), stamp(item.firstSeen), stamp(item.published));
  const daysOld = freshest ? Math.floor((Date.now() - freshest) / 86400000) : 9999;
  const freshness = Math.min(20, Math.max(0, 20 - Math.max(0, daysOld)));
  return grade + legal + severity + freshness;
};
const ranked = [...deduped.values()].sort((a, b) => score(b) - score(a) || Math.max(stamp(b.lastSeen), stamp(b.firstSeen), stamp(b.published)) - Math.max(stamp(a.lastSeen), stamp(a.firstSeen), stamp(a.published)) || String(a.id).localeCompare(String(b.id)));
const ACTIVE_LIMIT = 2500;
const active = ranked.slice(0, ACTIVE_LIMIT);
for (const item of ranked.slice(ACTIVE_LIMIT)) archived.push({ ...item, archivedAt: now, archiveReason: 'active-ledger-cap-overflow' });

ledger.updated = now;
ledger.findingCount = active.length;
ledger.findings = active;
ledger.integrityVersion = '2.1.0';
ledger.activeLimit = ACTIVE_LIMIT;
ledger.archiveRoute = 'data/investigation-ledger-archive.json';
ledger.conclusionContract = ['whatWasFound','whyItMatters','investigativeLanes','howItFits','effectOnLane','whatItPointsToward','alternativeExplanation','whatItDoesNotProve','evidenceStrength','confidence','sourceRoutes','nextQuestions'];
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
pull.integrityVersion = '2.1.0';
writeJson('data/investigation-source-pulls/daily-latest.json', pull);
status.ledgerFindings = active.length;
status.updated = now;
status.integrityVersion = '2.1.0';
writeJson('data/investigation-status.json', status);

function enrichConclusionFile(relative) {
  if (!exists(relative)) return 0;
  const product = readJson(relative, {});
  const fields = array(product.strongestFindings);
  if (!fields.length) return 0;
  product.strongestFindings = fields.map((raw, index) => {
    const item = normaliseFinding(raw, index);
    return { ...raw, ...missionFields(item), evidenceBoundary: item.evidenceBoundary, mechanism: item.mechanism, nextRecords: item.nextRecords, itemUrl: item.itemUrl, sourceUrl: item.sourceUrl, evidenceGrade: item.evidenceGrade, status: item.status, integrityVersion: '2.1.0' };
  });
  product.conclusionContractVersion = '2.1.0';
  writeJson(relative, product);
  return product.strongestFindings.length;
}
const dailyEnriched = enrichConclusionFile('data/daily-investigation-conclusions.json');
const weeklyEnriched = enrichConclusionFile('data/weekly-investigation-conclusions.json');

const requiredMissionFields = ['whatWasFound','whyItMatters','howItFits','effectOnLane','whatItPointsToward','alternativeExplanation','whatItDoesNotProve','evidenceStrength','confidence'];
const invalidActive = active.filter(item => !item.id || !item.title || !validHttp(item.itemUrl || item.sourceUrl) || !item.evidenceGrade || !item.status || !item.evidenceBoundary || !item.mechanism || item.nextRecords.length < 2 || item.sourceRoutes.length < 1 || requiredMissionFields.some(field => !clean(item[field], 1800)) || !array(item.investigativeLanes).length || !array(item.nextQuestions).length);
const report = {
  ok: invalidActive.length === 0 && active.length > 0 && active.length <= ACTIVE_LIMIT,
  generatedAt: now,
  sourceState: { sources: Object.keys(state.sources).length, created: stateCreated, lastAttemptRepaired: stateLastAttemptRepaired },
  ledger: { before: originalFindingCount, active: active.length, archivedThisRun: archived.length, duplicateIdsRepaired: duplicateCount, invalidUrlsArchived: invalidUrlCount, activeLimit: ACTIVE_LIMIT, invalidActive: invalidActive.length, fullMissionConclusions: active.length },
  conclusionProducts: { dailyFindingsEnriched: dailyEnriched, weeklyFindingsEnriched: weeklyEnriched },
  boundary: 'This repair normalises provenance, active-ledger capacity and user-facing meaning. It does not change a legal allegation into an established fact or remove archived evidence from the historical record.'
};
writeJson('downloads/investigation-data-integrity-repair.json', report);
if (!report.ok) throw new Error(`Investigation data integrity repair left ${invalidActive.length} invalid active finding(s).`);
console.log(`Investigation data integrity repaired: ${active.length} active findings with full mission conclusions, ${archived.length} archived this run, ${stateLastAttemptRepaired} source attempts restored.`);

module.exports = report;
