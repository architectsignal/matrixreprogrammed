const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const facetsPath = path.join(root, 'data', 'search-facets.json');
const reportPath = path.join(root, 'downloads', 'search-v3-build-report.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
}
function clean(value = '') {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function values(value) {
  if (Array.isArray(value)) return value.flatMap(values).filter(Boolean);
  if (value == null || value === '') return [];
  if (typeof value === 'object') return Object.values(value).flatMap(values).filter(Boolean);
  return [clean(value)].filter(Boolean);
}
function unique(list, limit = 500) {
  const seen = new Set();
  const out = [];
  for (const item of values(list)) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
function terms(value, limit = 300) {
  return unique(clean(values(value).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 1), limit);
}
function safeDate(...candidates) {
  for (const value of candidates.flatMap(values)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 1900 && parsed.getUTCFullYear() <= 2200) return parsed.toISOString();
  }
  return '';
}
function grade(value, fallback = '') {
  const match = String(value || '').toUpperCase().match(/\b([ABCD])\b/);
  return match ? match[1] : fallback;
}
function jurisdictionFrom(url = '', explicit = '') {
  if (clean(explicit)) return clean(explicit);
  let host = '';
  try { host = new URL(String(url || '')).hostname.toLowerCase(); } catch {}
  const checks = [
    [/\.gov$|\.mil$|justice\.gov|sec\.gov|federalregister\.gov|govinfo\.gov|usaspending\.gov|fec\.gov|oversight\.gov|courtlistener\.com/, 'United States'],
    [/\.gov\.uk$|judiciary\.uk|sfo\.gov\.uk/, 'United Kingdom'],
    [/europa\.eu|eppo\.europa\.eu|curia\.europa\.eu/, 'European Union'],
    [/\.gouv\.fr$|hatvp\.fr|legifrance\.gouv\.fr/, 'France'],
    [/bund\.de|bundestag\.de|bafin\.de/, 'Germany'],
    [/canada\.ca|gc\.ca/, 'Canada'],
    [/gov\.au|aph\.gov\.au/, 'Australia'],
    [/gov\.nz/, 'New Zealand'],
    [/admin\.ch|fedlex\.admin\.ch/, 'Switzerland'],
    [/icij\.org|wikileaks\.org/, 'International'],
  ];
  for (const [pattern, label] of checks) if (pattern.test(host)) return label;
  return '';
}
function authority(value = '', url = '') {
  const text = clean(value).toLowerCase();
  if (text) return text;
  const jurisdiction = jurisdictionFrom(url);
  return jurisdiction && jurisdiction !== 'International' ? 'primary-official' : '';
}
function isPrimary(item = {}) {
  const auth = authority(item.sourceAuthority || item.authority, item.sourceUrl || item.url);
  const status = clean(item.factualStatus || item.status).toLowerCase();
  return Boolean(item.primarySource || auth === 'primary-official' || /final official|court judgment|conviction|guilty plea|regulator order|authenticated primary|official filing|official charge|inspector-general|audit finding/.test(status));
}
function statusClass(item = {}) {
  const text = clean(`${item.statusClass || ''} ${item.factualStatus || ''} ${item.status || ''} ${item.category || ''}`).toLowerCase();
  const evidenceGrade = grade(item.evidenceGrade);
  if (evidenceGrade === 'D' || /unverified|speculation|anonymous allegation|unauthenticated|rumour|rumor/.test(text)) return 'unverified';
  if (/conviction|guilty plea|court judgment|final judgment|final official|regulator order|established wrongdoing|officially established|final enforcement|sanctioned/.test(text)) return 'established';
  if (/charge|charged|indictment|indicted|complaint|allegation|alleged|accused|unproven/.test(text)) return 'allegation';
  if (/enforcement|audit|inspector-general|official filing|government filing|sanction|debarment|misconduct finding/.test(text)) return 'enforcement';
  if (/source-change|source change|removed|restored|unavailable|missing record|redaction/.test(text)) return 'source-change';
  if (/document|source|record|registry|relationship|entity/.test(text)) return 'source-record';
  return 'context';
}
function resultKind(item = {}) {
  if (item.resultKind) return item.resultKind;
  const type = String(item.sourceType || '').toLowerCase();
  if (type.includes('document')) return 'document';
  if (type.includes('finding')) return 'finding';
  if (type.includes('relationship')) return 'relationship';
  if (type.includes('entity')) return 'entity';
  if (type.includes('source')) return 'source-record';
  if (type.includes('json')) return 'dataset';
  return 'route';
}
function normalize(item = {}) {
  const title = clean(item.title || item.name || 'Untitled result');
  const aliases = unique(item.aliases || []);
  const identifiers = unique((item.identifiers || []).map(value => typeof value === 'object' ? `${value.type || 'identifier'} ${value.value || ''}` : value));
  const sourceUrl = clean(item.sourceUrl || item.originalUrl || '');
  const url = clean(item.url || sourceUrl);
  const evidenceGrade = grade(item.evidenceGrade, '');
  const factualStatus = clean(item.factualStatus || item.status || '');
  const normalized = {
    ...item,
    searchVersion: 3,
    id: clean(item.id || item.entityId || item.documentHash || item.relationshipId || url || title).slice(0, 300),
    url,
    title,
    category: clean(item.category || 'Search Result'),
    layer: clean(item.layer || 'general'),
    description: clean(item.description || item.summary || item.establishes || 'Open this result for the cited record and evidence boundary.').slice(0, 1200),
    keywords: unique(item.keywords || [], 1800),
    aliases,
    identifiers,
    exactTerms: unique([title, ...aliases, ...identifiers, ...(item.exactTerms || [])], 100),
    sourceType: clean(item.sourceType || 'route'),
    resultKind: resultKind(item),
    sourceAuthority: authority(item.sourceAuthority || item.authority, sourceUrl || url),
    primarySource: isPrimary({ ...item, sourceUrl, url }),
    evidenceGrade,
    factualStatus,
    statusClass: statusClass({ ...item, evidenceGrade, factualStatus }),
    reviewStatus: clean(item.reviewStatus || ''),
    jurisdiction: jurisdictionFrom(sourceUrl || url, item.jurisdiction),
    entityType: clean(item.entityType || item.type || ''),
    entity: clean(item.entity || item.subject || item.sourceLabel || ''),
    sourceUrl,
    publicationDate: safeDate(item.publicationDate, item.published, item.date),
    retrievalDate: safeDate(item.retrievalDate, item.retrievedAt, item.lastSeen, item.firstSeen),
    date: safeDate(item.date, item.publicationDate, item.published, item.retrievalDate, item.retrievedAt, item.lastSeen),
    priority: Number(item.priority || 0)
  };
  normalized.keywords = unique([
    ...normalized.keywords,
    ...terms([normalized.title, normalized.aliases, normalized.identifiers, normalized.entity, normalized.entityType, normalized.factualStatus, normalized.statusClass, normalized.jurisdiction], 300)
  ], 1800);
  return normalized;
}
function upsert(map, item) {
  const normalized = normalize(item);
  if (!normalized.url || !normalized.title) return;
  const prior = map.get(normalized.url);
  if (!prior) { map.set(normalized.url, normalized); return; }
  const merged = normalize({
    ...prior,
    ...normalized,
    keywords: unique([...(prior.keywords || []), ...(normalized.keywords || [])], 1800),
    aliases: unique([...(prior.aliases || []), ...(normalized.aliases || [])], 200),
    identifiers: unique([...(prior.identifiers || []), ...(normalized.identifiers || [])], 200),
    exactTerms: unique([...(prior.exactTerms || []), ...(normalized.exactTerms || [])], 200),
    priority: Math.max(Number(prior.priority || 0), Number(normalized.priority || 0)),
    primarySource: Boolean(prior.primarySource || normalized.primarySource),
    sourceUrl: normalized.sourceUrl || prior.sourceUrl,
    evidenceGrade: normalized.evidenceGrade || prior.evidenceGrade,
    factualStatus: normalized.factualStatus || prior.factualStatus,
    jurisdiction: normalized.jurisdiction || prior.jurisdiction,
    entityType: normalized.entityType || prior.entityType,
    entity: normalized.entity || prior.entity
  });
  map.set(merged.url, merged);
}

let baseIndex = readJson('search-index.json', []);
if (!Array.isArray(baseIndex)) baseIndex = [];
const map = new Map();
for (const item of baseIndex) upsert(map, item);

const sourceRegistry = readJson('data/investigation-source-registry.json', { sources: [] });
const sources = new Map((sourceRegistry.sources || []).map(source => [source.id, source]));
for (const source of sourceRegistry.sources || []) {
  upsert(map, {
    url: `investigation-source-ledger.html?source=${encodeURIComponent(source.id)}`,
    title: source.label || source.id,
    category: 'Investigation Source',
    layer: source.lane || 'disclosure-black-files',
    description: `Registered ${source.authority || 'public'} source monitored ${(source.frequency || []).join(' and ') || 'regularly'}.`,
    keywords: [source.id, ...(source.keywords || []), source.url],
    priority: source.authority === 'primary-official' ? 99 : 90,
    sourceType: 'source-registry',
    resultKind: 'source-record',
    sourceAuthority: source.authority,
    primarySource: source.authority === 'primary-official',
    factualStatus: 'registered public source',
    statusClass: 'source-record',
    jurisdiction: source.jurisdiction,
    entity: source.operator || source.label,
    sourceUrl: source.url,
    retrievalDate: source.lastSuccess || source.updated
  });
}

const daily = readJson('data/daily-investigation-conclusions.json', { strongestFindings: [] });
const weekly = readJson('data/weekly-investigation-conclusions.json', { strongestFindings: [] });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const findings = [...(ledger.findings || []), ...(daily.strongestFindings || []), ...(weekly.strongestFindings || [])];
const seenFindings = new Set();
for (const finding of findings) {
  if (!finding || !finding.id || seenFindings.has(finding.id)) continue;
  seenFindings.add(finding.id);
  const source = sources.get(finding.sourceId) || {};
  const sourceUrl = finding.sourceUrl || finding.itemUrl || source.url || '';
  const factualStatus = finding.factualStatus || finding.status || '';
  upsert(map, {
    url: `daily-investigation-conclusions.html?finding=${encodeURIComponent(finding.id)}`,
    id: finding.id,
    title: finding.title || 'Investigation finding',
    category: `Investigation Finding${finding.evidenceGrade ? ` · Grade ${finding.evidenceGrade}` : ''}`,
    layer: finding.lane || source.lane || 'government-enforcement',
    description: clean(`${finding.conclusion || finding.summary || ''} ${finding.mechanism || ''} ${finding.evidenceBoundary || ''}`),
    keywords: terms([finding.title, finding.summary, finding.conclusion, finding.mechanism, finding.implication, finding.wrongdoingIndicators, finding.keywordMatches, finding.sourceLabel, finding.sourceId], 400),
    priority: 98 + Number(finding.severity || 0),
    sourceType: 'investigation-finding',
    resultKind: 'finding',
    sourceAuthority: finding.authority || source.authority,
    primarySource: (finding.authority || source.authority) === 'primary-official',
    evidenceGrade: finding.evidenceGrade,
    factualStatus,
    statusClass: statusClass({ evidenceGrade: finding.evidenceGrade, factualStatus }),
    reviewStatus: finding.reviewStatus || 'machine-classified-unreviewed',
    jurisdiction: finding.jurisdiction || source.jurisdiction,
    entityType: finding.entityType,
    entity: finding.entity || finding.subject || finding.sourceLabel,
    sourceUrl,
    publicationDate: finding.publicationDate || finding.published,
    retrievalDate: finding.retrievalDate || finding.lastSeen || finding.firstSeen
  });
}

const sourceChanges = readJson('data/source-change-public.json', { changes: [] });
for (const change of sourceChanges.changes || []) {
  if (!change?.id) continue;
  const source = sources.get(change.sourceId) || {};
  upsert(map, {
    url: `source-changes.html?change=${encodeURIComponent(change.id)}`,
    id: change.id,
    title: change.title || `${change.sourceLabel || change.sourceId} — ${String(change.changeType || 'source change').replace(/-/g, ' ')}`,
    category: `Source Change${change.evidenceGrade ? ` · Grade ${change.evidenceGrade}` : ''}`,
    layer: change.lane || source.lane || 'disclosure-black-files',
    description: clean(`${change.established || ''} ${change.notEstablished || ''} ${change.mechanism || ''}`),
    keywords: terms([change.sourceLabel, change.sourceId, change.changeType, change.status, change.additions, change.removals, change.previousHash, change.currentHash], 300),
    priority: change.changeType === 'source-unavailable' ? 106 : 103,
    sourceType: 'source-change',
    resultKind: 'source-record',
    sourceAuthority: change.authority || source.authority,
    primarySource: (change.authority || source.authority) === 'primary-official',
    evidenceGrade: change.evidenceGrade,
    factualStatus: change.factualStatus || change.status || 'source-change observation',
    statusClass: 'source-change',
    reviewStatus: change.reviewStatus || 'machine-classified-unreviewed',
    jurisdiction: change.jurisdiction || source.jurisdiction,
    entity: change.sourceLabel || source.label,
    sourceUrl: change.sourceUrl || source.url,
    publicationDate: change.publicationDate,
    retrievalDate: change.retrievalDate || change.detectedAt
  });
}

const documents = readJson('data/document-extraction-index.json', { documents: [] });
for (const document of documents.documents || []) {
  if (!document?.id && !document?.sha256) continue;
  const provenance = document.provenance?.[0] || {};
  const source = sources.get(provenance.sourceId) || {};
  const documentId = document.id || document.sha256;
  const sourceUrl = provenance.documentUrl || provenance.sourcePageUrl || document.sourceUrls?.[0] || '';
  upsert(map, {
    url: `document-library.html?document=${encodeURIComponent(documentId)}`,
    id: documentId,
    title: document.title || document.originalFileName || 'Extracted public document',
    category: `Extracted Document · ${document.reviewStatus || 'Unreviewed'}${document.evidenceGrade ? ` · Grade ${document.evidenceGrade}` : ''}`,
    layer: provenance.lane || source.lane || 'disclosure-black-files',
    description: `Hash-preserved source document extracted using ${document.extraction?.method || 'document extraction'}. Searchability does not establish guilt or authenticate every statement.`,
    keywords: terms([document.title, document.originalFileName, document.identifiers, document.metadata, document.sourceUrls, provenance.sourceLabel, provenance.sourceId], 500),
    identifiers: document.identifiers,
    priority: document.evidenceGrade === 'A' ? 99 : document.evidenceGrade === 'B' ? 94 : 86,
    sourceType: 'document-extraction',
    resultKind: 'document',
    sourceAuthority: provenance.authority || source.authority,
    primarySource: (provenance.authority || source.authority) === 'primary-official',
    evidenceGrade: document.evidenceGrade,
    factualStatus: 'unreviewed source document',
    statusClass: 'source-record',
    reviewStatus: document.reviewStatus || 'unreviewed-source-document',
    jurisdiction: provenance.jurisdiction || source.jurisdiction,
    entity: provenance.sourceLabel || source.label,
    sourceUrl,
    publicationDate: document.publicationDate || provenance.publicationDate,
    retrievalDate: document.lastSeen || provenance.retrievedAt,
    documentHash: document.sha256
  });
}

const graph = readJson('data/investigation-knowledge-graph.json', { entities: [], relationships: [] });
const entityById = new Map((graph.entities || []).map(entity => [entity.id, entity]));
for (const entity of graph.entities || []) {
  const evidence = entity.evidenceRefs?.[0] || {};
  upsert(map, {
    url: `entity-registry.html#entity-${encodeURIComponent(entity.id)}`,
    id: entity.id,
    title: entity.name,
    category: `Entity · ${entity.type}`,
    layer: entity.layer || 'disclosure-black-files',
    description: `${entity.type} record · ${entity.reviewStatus || 'unreviewed'}. ${evidence.doesNotEstablish || graph.evidenceBoundary || ''}`,
    keywords: terms([entity.name, entity.aliases, entity.roles, entity.identifiers, entity.type, evidence.sourceTitle, evidence.factualStatus], 500),
    aliases: entity.aliases,
    identifiers: entity.identifiers,
    priority: 78 + (entity.reviewStatus === 'human-reviewed' ? 18 : entity.reviewStatus === 'registry-defined' ? 12 : 2),
    sourceType: 'structured-entity',
    resultKind: 'entity',
    sourceAuthority: evidence.authority,
    primarySource: evidence.authority === 'primary-official',
    evidenceGrade: evidence.evidenceGrade,
    factualStatus: evidence.factualStatus || 'structured entity record',
    statusClass: 'source-record',
    reviewStatus: entity.reviewStatus,
    jurisdiction: entity.jurisdiction || evidence.jurisdiction,
    entityType: entity.type,
    entity: entity.name,
    sourceUrl: evidence.sourceUrl,
    publicationDate: evidence.publicationDate,
    retrievalDate: evidence.retrievalDate
  });
}
for (const relationship of graph.relationships || []) {
  const from = entityById.get(relationship.from) || { name: relationship.from, type: '' };
  const to = entityById.get(relationship.to) || { name: relationship.to, type: '' };
  upsert(map, {
    url: `relationship-registry.html?relationship=${encodeURIComponent(relationship.id)}`,
    id: relationship.id,
    relationshipId: relationship.id,
    title: `${from.name} → ${relationship.label || relationship.type} → ${to.name}`,
    category: `Relationship · ${relationship.type}`,
    layer: relationship.lane || 'disclosure-black-files',
    description: clean(`${relationship.establishes || ''} ${relationship.doesNotEstablish || ''}`),
    keywords: terms([from.name, from.aliases, to.name, to.aliases, relationship.type, relationship.label, relationship.sourceTitle, relationship.establishes], 450),
    priority: 76 + (relationship.evidenceGrade === 'A' ? 18 : relationship.evidenceGrade === 'B' ? 12 : relationship.evidenceGrade === 'C' ? 5 : 0),
    sourceType: 'structured-relationship',
    resultKind: 'relationship',
    sourceAuthority: relationship.authority,
    primarySource: relationship.authority === 'primary-official',
    evidenceGrade: relationship.evidenceGrade,
    factualStatus: relationship.factualStatus || 'sourced relationship',
    statusClass: statusClass(relationship),
    reviewStatus: relationship.reviewStatus,
    jurisdiction: relationship.jurisdiction,
    entityType: `${from.type || ''}→${to.type || ''}`,
    entity: `${from.name}; ${to.name}`,
    sourceUrl: relationship.sourceUrl,
    publicationDate: relationship.publicationDate,
    retrievalDate: relationship.retrievalDate
  });
}

const finalIndex = [...map.values()]
  .filter(item => item.url && item.title)
  .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title).localeCompare(String(b.title)));
writeJson('search-index.json', finalIndex);

function counts(field) {
  const counter = new Map();
  for (const item of finalIndex) {
    const value = clean(item[field]);
    if (!value) continue;
    counter.set(value, (counter.get(value) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }));
}
const facets = {
  searchVersion: 3,
  updated: new Date().toISOString(),
  totalResults: finalIndex.length,
  evidenceBoundary: 'Search ranking and filtering organise cited records. They do not establish guilt, convert allegations into facts, or replace the underlying source.',
  filters: {
    evidenceGrade: counts('evidenceGrade'),
    sourceType: counts('sourceType'),
    statusClass: counts('statusClass'),
    jurisdiction: counts('jurisdiction'),
    entityType: counts('entityType'),
    resultKind: counts('resultKind')
  }
};
writeJson('data/search-facets.json', facets);
writeJson('downloads/search-v3-build-report.json', {
  ok: true,
  generatedAt: facets.updated,
  totalResults: finalIndex.length,
  primarySources: finalIndex.filter(item => item.primarySource).length,
  evidenceGraded: finalIndex.filter(item => item.evidenceGrade).length,
  findings: finalIndex.filter(item => item.resultKind === 'finding').length,
  documents: finalIndex.filter(item => item.resultKind === 'document').length,
  entities: finalIndex.filter(item => item.resultKind === 'entity').length,
  relationships: finalIndex.filter(item => item.resultKind === 'relationship').length,
  facets: Object.fromEntries(Object.entries(facets.filters).map(([key, list]) => [key, list.length]))
});
console.log(`Search V3 index built: ${finalIndex.length} results, ${facets.filters.sourceType.length} source types and ${facets.filters.statusClass.length} status classes.`);
