const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
  catch { return fallback; }
};
const writeJson = (file, value) => {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};
const slug = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'record';
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const first = (value, fallback = '') => Array.isArray(value) ? (value[0] || fallback) : (value || fallback);
const unique = values => [...new Set((values || []).filter(Boolean))];
const validDate = value => {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : null;
};

const schema = readJson('data/investigation-entity-schema.json', { entityTypes: {}, relationshipTypes: {} });
const activity = readJson('data/market-activity.json', { insiderTransactions: [], positionChanges: [] });
const insiderTransactions = (activity.insiderTransactions || []).map(record => ({
  ...record,
  recordType: 'insider-transaction',
  subjectName: first(record.reportingOwnerNames, first(record.reportingOwners, {}).name || 'Reported insider'),
  subjectCik: first(record.reportingOwners, {}).cik || '',
  issuerName: record.issuer?.name || record.issuerName || record.trackedSubjectName || 'Issuer',
  issuerCik: record.issuer?.cik || '',
  ticker: record.issuer?.ticker || record.ticker || '',
  formType: record.filingType || '4',
  accessionNumber: record.filingAccession || '',
  action: record.transactionCategory || record.direction || 'other',
  sourceUrl: record.sourceUrl || '',
  filingDate: record.filingDate || '',
  eventDate: record.transactionDate || record.filingDate || '',
  reportedValue: record.reportedTransactionValue,
  established: record.establishes,
  notEstablished: record.doesNotEstablish
}));
const positionChanges = (activity.positionChanges || activity.institutionalChanges || []).map(record => ({
  ...record,
  recordType: 'institutional-position-change',
  subjectName: record.managerName || 'Reporting institution',
  subjectCik: record.managerCik || '',
  issuerName: record.issuerName || 'Reported security',
  ticker: record.ticker || '',
  formType: '13F-HR',
  accessionNumber: record.currentAccessionNumber || '',
  action: record.changeType || 'position-change',
  sourceUrl: record.currentSourceUrl || record.sourceUrl || '',
  filingDate: record.currentFilingDate || record.filingDate || '',
  eventDate: record.currentReportDate || record.currentFilingDate || '',
  reportedValue: record.currentValueUsd ?? record.previousValueUsd ?? null,
  established: record.establishes,
  notEstablished: record.doesNotEstablish
}));
const records = [...insiderTransactions, ...positionChanges];

const entityPayload = readJson('data/entity-registry.json', { schemaVersion: '1.0.0', entities: [] });
const relationshipPayload = readJson('data/relationship-registry.json', { schemaVersion: '1.0.0', relationships: [] });
const entities = Array.isArray(entityPayload) ? entityPayload : (entityPayload.entities || []);
const relationships = Array.isArray(relationshipPayload) ? relationshipPayload : (relationshipPayload.relationships || []);
const byKey = new Map();

function identifierArray(value) {
  if (Array.isArray(value)) return value.filter(item => item && item.type && item.value).map(item => ({ type: String(item.type), value: String(item.value) }));
  if (value && typeof value === 'object') return Object.entries(value).filter(([, itemValue]) => itemValue).map(([type, itemValue]) => ({ type, value: String(itemValue) }));
  return [];
}
function identifierValues(value) { return identifierArray(value).map(item => item.value); }
function mergeIdentifiers(current, additions) {
  const all = [...identifierArray(current), ...identifierArray(additions)];
  return all.filter((item, index) => all.findIndex(other => other.type === item.type && other.value.toLowerCase() === item.value.toLowerCase()) === index).slice(0, 60);
}
function indexEntity(entity) {
  for (const key of [entity.id, entity.name, ...(entity.aliases || []), ...identifierValues(entity.identifiers)].filter(Boolean)) byKey.set(String(key).toLowerCase(), entity);
}
for (const entity of entities) indexEntity(entity);

function evidenceRef(record, insider) {
  return {
    sourceId: insider ? 'sec-form4' : 'sec-form13f',
    sourceTitle: insider ? `SEC Form 4 ${record.accessionNumber || ''}`.trim() : `SEC Form 13F comparison ${record.eventDate || ''}`.trim(),
    sourceUrl: record.sourceUrl || '',
    publicationDate: validDate(record.filingDate),
    retrievalDate: validDate(record.retrievalDate || activity.generatedAt || new Date().toISOString()),
    evidenceGrade: record.evidenceGrade || 'A',
    factualStatus: record.factualStatus || 'authenticated primary record',
    establishes: record.established || (insider
      ? 'The authenticated Form 4 reports the coded transaction and stated ownership fields.'
      : 'Consecutive authenticated Form 13F reports support the stated change between quarter-end positions.'),
    doesNotEstablish: record.notEstablished || (insider
      ? 'The filing does not establish motive, investment merit, present ownership, coordination or wrongdoing.'
      : 'The comparison does not establish exact trade dates, execution prices, present ownership, motive or wrongdoing.'),
    reviewStatus: record.reviewStatus || 'official-filing-machine-parsed'
  };
}
function evidenceKey(ref) { return [ref.sourceId, ref.sourceUrl, ref.publicationDate, ref.factualStatus].join('|'); }

function ensureEntity(name, type, aliases = [], identifiers = {}, ref = null) {
  const idList = identifierArray(identifiers);
  const keys = [name, ...aliases, ...idList.map(item => item.value)].filter(Boolean).map(value => String(value).toLowerCase());
  let found = keys.map(key => byKey.get(key)).find(Boolean);
  if (found) {
    found.aliases = unique([...(found.aliases || []), ...aliases]).slice(0, 30);
    found.identifiers = mergeIdentifiers(found.identifiers, idList);
    found.evidenceRefs = Array.isArray(found.evidenceRefs) ? found.evidenceRefs : [];
    if (ref && !found.evidenceRefs.some(existing => evidenceKey(existing) === evidenceKey(ref))) found.evidenceRefs.push(ref);
    found.evidenceRefs = found.evidenceRefs.slice(0, 50);
    found.lastSeen = validDate(ref?.retrievalDate || found.lastSeen) || found.lastSeen || null;
    indexEntity(found);
    return found;
  }
  const id = `market-${type.toLowerCase()}-${slug(name)}-${hash(name + '|' + idList.map(item => `${item.type}:${item.value}`).join('|'))}`;
  found = {
    id,
    type,
    followTheMoneySchema: schema.entityTypes?.[type]?.followTheMoney || (type === 'Person' ? 'Person' : type === 'Company' ? 'Company' : 'Organization'),
    name,
    aliases: unique(aliases).slice(0, 30),
    roles: ['named-in-official-market-disclosure'],
    identifiers: idList,
    properties: { sourceSystem: 'SEC EDGAR market activity tracker' },
    evidenceRefs: ref ? [ref] : [],
    reviewStatus: 'official-filing-machine-parsed',
    firstSeen: validDate(ref?.retrievalDate) || null,
    lastSeen: validDate(ref?.retrievalDate) || null
  };
  entities.push(found);
  indexEntity(found);
  return found;
}

const existingRelationshipIds = new Set(relationships.map(record => record.id));
const addedRelationships = [];
const searchPayload = readJson('search-index.json', []);
const searchRecords = Array.isArray(searchPayload) ? searchPayload : (searchPayload.records || []);
const searchIds = new Set(searchRecords.map(record => record.id));

for (const record of records) {
  const insider = record.recordType === 'insider-transaction';
  const ref = evidenceRef(record, insider);
  if (!ref.sourceUrl) continue;
  const subject = ensureEntity(
    record.subjectName,
    insider ? 'Person' : 'Organization',
    [],
    insider ? { secReportingOwnerCik: record.subjectCik } : { secCik: record.subjectCik },
    ref
  );
  const issuer = ensureEntity(
    record.issuerName,
    'Company',
    record.ticker ? [record.ticker] : [],
    { ticker: record.ticker || '', cusip: record.cusip || '', secCik: record.issuerCik || '' },
    ref
  );

  const relationshipType = insider ? 'reportedTransaction' : 'reportedPositionChange';
  const key = [relationshipType, subject.id, issuer.id, record.id || record.accessionNumber || record.sourceUrl, record.eventDate, record.transactionCode || record.changeType].join('|');
  const relationshipId = `market-rel-${hash(key)}`;
  if (!existingRelationshipIds.has(relationshipId)) {
    const relationship = {
      id: relationshipId,
      type: schema.relationshipTypes?.[relationshipType] ? relationshipType : 'relatedTo',
      from: subject.id,
      to: issuer.id,
      label: insider
        ? (record.transactionLabel || record.action || record.transactionCode || 'reported transaction')
        : String(record.changeType || 'reported position change').replace(/-/g, ' '),
      date: validDate(record.eventDate || record.filingDate),
      sourceRecordId: record.id || record.accessionNumber || null,
      sourceId: ref.sourceId,
      sourceTitle: ref.sourceTitle,
      sourceUrl: ref.sourceUrl,
      publicationDate: ref.publicationDate,
      retrievalDate: ref.retrievalDate,
      evidenceGrade: ref.evidenceGrade,
      factualStatus: ref.factualStatus,
      establishes: ref.establishes,
      doesNotEstablish: ref.doesNotEstablish,
      reviewStatus: ref.reviewStatus,
      extractionMethod: insider ? 'SEC Form 4 XML parser' : 'comparison of consecutive SEC Form 13F information tables',
      confidence: 0.98,
      properties: {
        formType: record.formType || '',
        accessionNumber: record.accessionNumber || '',
        transactionCode: record.transactionCode || '',
        action: record.action || record.changeType || '',
        transactionDate: record.transactionDate || '',
        periodEnd: record.currentReportDate || record.periodEnd || '',
        filingDate: record.filingDate || '',
        shares: record.shares ?? record.currentShares ?? null,
        previousShares: record.previousShares ?? null,
        currentShares: record.currentShares ?? null,
        shareChange: record.shareChange ?? null,
        reportedValue: record.reportedValue ?? null,
        ticker: record.ticker || ''
      }
    };
    relationships.push(relationship);
    addedRelationships.push(relationship);
    existingRelationshipIds.add(relationshipId);
  }

  const searchId = `search-${relationshipId}`;
  if (!searchIds.has(searchId)) {
    searchRecords.push({
      id: searchId,
      title: insider
        ? `${record.subjectName}: ${record.transactionLabel || record.action || record.transactionCode || 'reported transaction'} in ${record.issuerName}`
        : `${record.subjectName}: ${String(record.changeType || 'position change').replace(/-/g, ' ')} in ${record.issuerName}`,
      url: `market-activity.html#market-${record.id || relationshipId}`,
      description: insider
        ? `Official SEC Form 4 record: ${record.shares ?? '—'} shares; transaction ${record.transactionCode || record.action || 'other'}; filed ${record.filingDate || '—'}.`
        : `Official SEC Form 13F comparison: ${record.shareChange ?? '—'} share change between reported quarter ends; filed ${record.filingDate || '—'}.`,
      content: [record.subjectName, record.issuerName, record.ticker, record.transactionCode, record.transactionLabel, record.changeType, ref.establishes, ref.doesNotEstablish].filter(Boolean).join(' '),
      resultKind: insider ? 'insider transaction' : 'institutional position change',
      sourceType: 'SEC filing',
      sourceAuthority: 'official',
      primarySource: true,
      evidenceGrade: ref.evidenceGrade,
      factualStatus: ref.factualStatus,
      publicationDate: record.filingDate || '',
      retrievalDate: record.retrievalDate || activity.generatedAt || '',
      jurisdiction: 'United States',
      entity: record.subjectName,
      entityType: insider ? 'Person' : 'Organization',
      aliases: [record.ticker, record.issuerName].filter(Boolean),
      identifiers: [record.accessionNumber, record.transactionCode, record.cusip].filter(Boolean),
      reviewStatus: ref.reviewStatus,
      statusClass: 'official-record'
    });
    searchIds.add(searchId);
  }
}

writeJson('data/entity-registry.json', Array.isArray(entityPayload) ? entities : { ...entityPayload, updated: new Date().toISOString(), entities });
writeJson('data/relationship-registry.json', Array.isArray(relationshipPayload) ? relationships : { ...relationshipPayload, updated: new Date().toISOString(), relationships });
writeJson('search-index.json', Array.isArray(searchPayload) ? searchRecords : { ...searchPayload, updated: new Date().toISOString(), records: searchRecords });
writeJson('downloads/phase6-data-integration.json', {
  ok: true,
  generatedAt: new Date().toISOString(),
  activityRecords: records.length,
  insiderTransactions: insiderTransactions.length,
  positionChanges: positionChanges.length,
  entities: entities.length,
  relationships: relationships.length,
  marketRelationshipsAdded: addedRelationships.length,
  searchRecords: searchRecords.length,
  canonicalGraphContract: {
    entityIdentifiers: 'array of {type,value}',
    relationshipEndpoints: ['from', 'to'],
    relationshipTypes: ['reportedTransaction', 'reportedPositionChange']
  },
  evidenceBoundary: 'Financial disclosure relationships report official filings only and do not establish motive, present ownership, coordination, investment merit or wrongdoing.'
});
console.log(`Phase 6 integrated: ${records.length} activity records, ${addedRelationships.length} new graph relationships.`);
