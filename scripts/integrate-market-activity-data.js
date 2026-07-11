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

const activity = readJson('data/market-activity.json', { insiderTransactions: [], positionChanges: [] });
const insiderTransactions = (activity.insiderTransactions || []).map(record => ({
  ...record,
  recordType: 'insider-transaction',
  subjectName: first(record.reportingOwnerNames, first(record.reportingOwners, {}).name || 'Reported insider'),
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
for (const entity of entities) {
  for (const key of [entity.id, entity.name, ...(entity.aliases || []), ...(entity.identifiers ? Object.values(entity.identifiers) : [])].filter(Boolean)) {
    byKey.set(String(key).toLowerCase(), entity);
  }
}

function ensureEntity(name, schema, aliases = [], identifiers = {}) {
  const keys = [name, ...aliases, ...Object.values(identifiers)].filter(Boolean).map(value => String(value).toLowerCase());
  let found = keys.map(key => byKey.get(key)).find(Boolean);
  if (found) {
    found.aliases = [...new Set([...(found.aliases || []), ...aliases].filter(Boolean))];
    found.identifiers = { ...(found.identifiers || {}), ...Object.fromEntries(Object.entries(identifiers).filter(([, value]) => value)) };
    return found;
  }
  const id = `market-${schema.toLowerCase()}-${slug(name)}-${hash(name)}`;
  found = {
    id,
    schema,
    name,
    caption: name,
    aliases: [...new Set(aliases.filter(Boolean))],
    identifiers: Object.fromEntries(Object.entries(identifiers).filter(([, value]) => value)),
    reviewStatus: 'source-registry',
    extractionMethod: 'official-filing-watchlist',
    confidence: 1,
    sourceCount: 0,
    evidenceBoundary: 'Inclusion in the market tracker reports a public filing identity. It does not imply wrongdoing, motive, endorsement or investment advice.'
  };
  entities.push(found);
  for (const key of [id, name, ...aliases, ...Object.values(identifiers)].filter(Boolean)) byKey.set(String(key).toLowerCase(), found);
  return found;
}

const sec = ensureEntity('U.S. Securities and Exchange Commission', 'GovernmentAgency', ['SEC'], { jurisdiction: 'US' });
const existingRelationshipIds = new Set(relationships.map(record => record.id));
const addedRelationships = [];
const searchPayload = readJson('search-index.json', []);
const searchRecords = Array.isArray(searchPayload) ? searchPayload : (searchPayload.records || []);
const searchIds = new Set(searchRecords.map(record => record.id));

for (const record of records) {
  const insider = record.recordType === 'insider-transaction';
  const subject = ensureEntity(
    record.subjectName,
    insider ? 'Person' : 'Organization',
    [],
    insider
      ? { secReportingOwnerCik: first(record.reportingOwners, {}).cik || '' }
      : { secCik: record.managerCik || '' }
  );
  const issuer = ensureEntity(
    record.issuerName,
    'Company',
    record.ticker ? [record.ticker] : [],
    { ticker: record.ticker || '', cusip: record.cusip || '', secCik: record.issuerCik || '' }
  );
  subject.sourceCount = (subject.sourceCount || 0) + 1;
  issuer.sourceCount = (issuer.sourceCount || 0) + 1;
  sec.sourceCount = (sec.sourceCount || 0) + 1;

  const relationshipType = insider ? 'reportedTransaction' : 'reportedPositionChange';
  const key = [relationshipType, subject.id, issuer.id, record.id || record.accessionNumber || record.sourceUrl, record.eventDate, record.transactionCode || record.changeType].join('|');
  const relationshipId = `market-rel-${hash(key)}`;
  if (!existingRelationshipIds.has(relationshipId)) {
    const relationship = {
      id: relationshipId,
      source: subject.id,
      target: issuer.id,
      type: relationshipType,
      label: insider
        ? (record.transactionLabel || record.action || record.transactionCode || 'reported transaction')
        : String(record.changeType || 'reported position change').replace(/-/g, ' '),
      sourceUrl: record.sourceUrl || '',
      sourceTitle: `SEC ${record.formType || 'filing'} ${record.accessionNumber || ''}`.trim(),
      sourceAuthority: 'official',
      sourceType: 'regulatory filing',
      publicationDate: record.filingDate || '',
      retrievalDate: record.retrievalDate || activity.generatedAt || '',
      evidenceGrade: record.evidenceGrade || 'A',
      factualStatus: record.factualStatus || 'authenticated primary record',
      reviewStatus: record.reviewStatus || 'automated-official-source',
      extractionMethod: insider ? 'SEC Form 4 XML parser' : 'comparison of consecutive SEC Form 13F information tables',
      confidence: 0.98,
      established: record.established || (insider
        ? 'The SEC filing reports the stated transaction, code, shares and ownership fields.'
        : 'Successive SEC Form 13F reports support the stated change between reported quarter-end positions.'),
      notEstablished: record.notEstablished || (insider
        ? 'The filing does not by itself establish motive, investment merit, current ownership, coordination or wrongdoing.'
        : 'The comparison does not establish the exact trade date, execution price, beneficial owner, motive or whether the position remains held today.'),
      mechanism: insider
        ? 'A reporting owner filed a Form 4 transaction relating to an issuer security.'
        : 'A reporting manager disclosed quarter-end holdings on Form 13F; successive reports were compared.',
      implication: 'The official filing adds a time-bounded financial-disclosure relationship to the public entity graph.',
      alternativeExplanation: insider
        ? 'The event may be an award, option exercise, gift, tax withholding or other coded transaction rather than an open-market purchase or sale.'
        : 'The change may reflect trading, mergers, corporate actions, manager transfers, corrections or confidential-treatment changes.',
      nextRecordRequired: insider
        ? 'Review the complete Form 4, footnotes, transaction code and later amendments.'
        : 'Review both complete 13F information tables, amendments, issuer corporate actions and the next quarterly filing.',
      correctionRoute: 'Use the Matrix correction route with the SEC accession number and the conflicting primary record.',
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
      url: `market-activity.html#${relationshipId}`,
      description: insider
        ? `Official SEC Form 4 record: ${record.shares ?? '—'} shares; transaction ${record.transactionCode || record.action || 'other'}; filed ${record.filingDate || '—'}.`
        : `Official SEC Form 13F comparison: ${record.shareChange ?? '—'} share change between reported quarter ends; filed ${record.filingDate || '—'}.`,
      content: [record.subjectName, record.issuerName, record.ticker, record.transactionCode, record.transactionLabel, record.changeType, record.established, record.notEstablished].filter(Boolean).join(' '),
      resultKind: insider ? 'insider transaction' : 'institutional position change',
      sourceType: 'SEC filing',
      sourceAuthority: 'official',
      primarySource: true,
      evidenceGrade: record.evidenceGrade || 'A',
      factualStatus: record.factualStatus || 'authenticated primary record',
      publicationDate: record.filingDate || '',
      retrievalDate: record.retrievalDate || activity.generatedAt || '',
      jurisdiction: 'United States',
      entity: record.subjectName,
      entityType: insider ? 'Person' : 'Organization',
      aliases: [record.ticker, record.issuerName].filter(Boolean),
      identifiers: [record.accessionNumber, record.transactionCode, record.cusip].filter(Boolean),
      reviewStatus: record.reviewStatus || 'automated-official-source',
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
  evidenceBoundary: 'Financial disclosure relationships report official filings only and do not establish motive, present ownership, coordination, investment merit or wrongdoing.'
});
console.log(`Phase 6 integrated: ${records.length} activity records, ${addedRelationships.length} new graph relationships.`);
