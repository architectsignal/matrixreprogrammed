const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const schema = readJson(path.join(dataDir, 'investigation-entity-schema.json'), { schemaVersion: '1.0.0', entityTypes: {}, relationshipTypes: {} });
const registry = readJson(path.join(dataDir, 'investigation-source-registry.json'), { sources: [], lanes: [] });
const ledger = readJson(path.join(dataDir, 'investigation-ledger.json'), { findings: [] });
const documents = readJson(path.join(dataDir, 'document-extraction-index.json'), { documents: [] });
const sourceChanges = readJson(path.join(dataDir, 'source-change-public.json'), { changes: [] });
const overrides = readJson(path.join(dataDir, 'structured-investigation-overrides.json'), { entities: [], relationships: [], suppressedEntityIds: [], suppressedRelationshipIds: [] });
const generatedAt = new Date().toISOString();
const evidenceBoundary = schema.evidenceBoundary || 'A structured record does not by itself establish guilt or wrongdoing.';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function clean(value = '', max = 700) {
  const text = String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function normaliseName(value = '') {
  return clean(value, 300).toLowerCase().replace(/[’']/g, "'").replace(/\bthe\b/g, ' ').replace(/[^a-z0-9$€£&.'-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function stableId(prefix, value) { return `${prefix}-${sha(value).slice(0, 20)}`; }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function csvCell(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
}
function firstDate(...values) {
  for (const value of values) {
    const parsed = new Date(value || 0);
    if (Number.isFinite(parsed.getTime()) && parsed.getTime() > 0) return parsed.toISOString();
  }
  return null;
}
function evidenceFrom(record = {}, fallback = {}) {
  return {
    sourceId: clean(record.sourceId || fallback.sourceId || 'unknown-source', 160),
    sourceTitle: clean(record.sourceLabel || record.source || fallback.sourceTitle || fallback.sourceLabel || 'Public source', 220),
    sourceUrl: clean(record.itemUrl || record.sourceUrl || fallback.sourceUrl || '', 1000),
    publicationDate: firstDate(record.published, record.publicationDate, fallback.publicationDate),
    retrievalDate: firstDate(record.lastSeen, record.retrievalDate, record.detectedAt, fallback.retrievalDate, generatedAt),
    evidenceGrade: clean(record.evidenceGrade || fallback.evidenceGrade || 'C', 2),
    factualStatus: clean(record.status || record.factualStatus || fallback.factualStatus || 'record-observation', 120),
    establishes: clean(record.conclusion || record.established || record.summary || fallback.establishes || 'The cited record contains the stated observation.', 700),
    doesNotEstablish: clean(record.evidenceBoundary || record.notEstablished || fallback.doesNotEstablish || evidenceBoundary, 700),
    reviewStatus: clean(record.reviewStatus || fallback.reviewStatus || 'machine-extracted-unreviewed', 120)
  };
}
function evidenceKey(evidence) {
  return [evidence.sourceId, evidence.sourceUrl, evidence.retrievalDate, evidence.factualStatus].join('|');
}

const entityMap = new Map();
const relationshipMap = new Map();
const findingRecords = [];
const documentRecords = [];
const missingRecordRecords = [];
const sourceById = new Map((registry.sources || []).map(source => [source.id, source]));
const suppressedEntities = new Set(overrides.suppressedEntityIds || []);
const suppressedRelationships = new Set(overrides.suppressedRelationshipIds || []);

function upsertEntity(input) {
  const type = schema.entityTypes?.[input.type] ? input.type : 'Organization';
  const name = clean(input.name, 300);
  if (!name) return null;
  const key = input.id || `${type}|${normaliseName(name)}`;
  const id = input.id || stableId(`entity-${type.toLowerCase()}`, key);
  if (suppressedEntities.has(id)) return null;
  const prior = entityMap.get(id) || {
    id,
    type,
    followTheMoneySchema: schema.entityTypes?.[type]?.followTheMoney || 'Thing',
    name,
    aliases: [],
    roles: [],
    identifiers: [],
    properties: {},
    evidenceRefs: [],
    reviewStatus: input.reviewStatus || 'machine-extracted-unreviewed',
    firstSeen: input.firstSeen || null,
    lastSeen: input.lastSeen || null
  };
  prior.name = prior.name || name;
  prior.aliases = unique([...(prior.aliases || []), ...(input.aliases || []), ...(prior.name !== name ? [name] : [])]).slice(0, 30);
  prior.roles = unique([...(prior.roles || []), ...(input.roles || [])]).slice(0, 30);
  prior.identifiers = [...(prior.identifiers || []), ...(input.identifiers || [])]
    .filter((item, index, all) => item && item.value && all.findIndex(other => other.type === item.type && String(other.value).toLowerCase() === String(item.value).toLowerCase()) === index)
    .slice(0, 60);
  prior.properties = { ...(prior.properties || {}), ...(input.properties || {}) };
  prior.reviewStatus = input.reviewStatus === 'human-reviewed' ? 'human-reviewed' : prior.reviewStatus;
  prior.firstSeen = firstDate(prior.firstSeen, input.firstSeen) || prior.firstSeen || input.firstSeen || null;
  const latest = [prior.lastSeen, input.lastSeen].filter(Boolean).sort().pop();
  prior.lastSeen = latest || null;
  for (const evidence of input.evidenceRefs || []) {
    if (!prior.evidenceRefs.some(existing => evidenceKey(existing) === evidenceKey(evidence))) prior.evidenceRefs.push(evidence);
  }
  prior.evidenceRefs = prior.evidenceRefs.slice(0, 50);
  entityMap.set(id, prior);
  return prior;
}

function upsertRelationship(input) {
  if (!input.from || !input.to || !input.type) return null;
  const evidence = input.evidence || evidenceFrom({}, {});
  const id = input.id || stableId('relationship', [input.type, input.from, input.to, input.sourceRecordId || '', evidence.sourceId, evidence.sourceUrl].join('|'));
  if (suppressedRelationships.has(id)) return null;
  const prior = relationshipMap.get(id) || {
    id,
    type: schema.relationshipTypes?.[input.type] ? input.type : 'relatedTo',
    from: input.from,
    to: input.to,
    label: clean(input.label || input.type, 180),
    date: input.date || evidence.publicationDate || evidence.retrievalDate,
    sourceRecordId: input.sourceRecordId || null,
    sourceId: evidence.sourceId,
    sourceTitle: evidence.sourceTitle,
    sourceUrl: evidence.sourceUrl,
    publicationDate: evidence.publicationDate,
    retrievalDate: evidence.retrievalDate,
    evidenceGrade: evidence.evidenceGrade,
    factualStatus: evidence.factualStatus,
    establishes: clean(input.establishes || evidence.establishes, 700),
    doesNotEstablish: clean(input.doesNotEstablish || evidence.doesNotEstablish, 700),
    reviewStatus: input.reviewStatus || evidence.reviewStatus,
    extractionMethod: input.extractionMethod || 'structured-source-link',
    confidence: Number.isFinite(input.confidence) ? input.confidence : 1
  };
  relationshipMap.set(id, { ...prior, ...input, id, evidence: undefined });
  return relationshipMap.get(id);
}

function addMention(containerEntity, mentionedEntity, evidence, sourceRecordId, method, confidence = 0.55) {
  if (!containerEntity || !mentionedEntity || containerEntity.id === mentionedEntity.id) return;
  upsertRelationship({
    type: 'mentions',
    from: containerEntity.id,
    to: mentionedEntity.id,
    label: 'mentions',
    evidence,
    sourceRecordId,
    establishes: `The cited record names ${mentionedEntity.name}.`,
    doesNotEstablish: 'A textual mention does not establish guilt, control, ownership, payment, coordination or any other substantive relationship.',
    reviewStatus: 'machine-extracted-unreviewed',
    extractionMethod: method,
    confidence
  });
}

const organisationSuffix = '(?:Department|Commission|Agency|Office|Committee|Court|Authority|Administration|Bureau|Ministry|University|Foundation|Trust|Council|Parliament|Congress|Senate|Treasury|Service|Institute|Board)';
const companySuffix = '(?:Inc\\.?|Incorporated|LLC|L\\.L\\.C\\.|Ltd\\.?|Limited|PLC|Corp\\.?|Corporation|Company|Co\\.?|Bank|Holdings?|Partners?|Group)';
const companyRegex = new RegExp(`\\b([A-Z][A-Za-z0-9&’'.-]*(?:\\s+[A-Z][A-Za-z0-9&’'.-]*){0,6}\\s+${companySuffix})\\b`, 'g');
const organisationRegex = new RegExp(`\\b([A-Z][A-Za-z&’'.-]*(?:\\s+(?:of|the|and|for|on|[A-Z][A-Za-z&’'.-]*)){0,8}\\s+${organisationSuffix})\\b`, 'g');
const contextualPersonRegex = /\b(?:against|defendant|respondent|charged|sentenced|convicted|arrested|indicted|named|director|officer|president|chairman|founder|owner)\s+([A-Z][A-Za-z’'.-]+(?:\s+[A-Z][A-Za-z’'.-]+){1,3})\b/g;
const moneyRegex = /(?:USD|EUR|GBP|US\$|\$|€|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|m|bn))?/gi;
const legalAuthorityRegex = /\b([A-Z][A-Za-z]*(?:\s+(?:of|the|and|[A-Z][A-Za-z]*)){0,6}\s+(?:Act|Code|Rule|Regulation|Statute))(?:\s+of\s+\d{4})?\b/g;

function extractNamedEntities(text, evidence, contextEntity, sourceRecordId) {
  const value = clean(text, 24000);
  const seen = new Set();
  const candidates = [];
  function collect(regex, type, method, confidence) {
    regex.lastIndex = 0;
    for (const match of value.matchAll(regex)) {
      const name = clean(match[1] || match[0], 240).replace(/^[,.:;-]+|[,.:;-]+$/g, '').trim();
      const key = `${type}|${normaliseName(name)}`;
      if (!name || name.length < 4 || seen.has(key)) continue;
      if (/^(?:United States|Current Filings|Final Judgment|Justice News|Public Record)$/i.test(name)) continue;
      seen.add(key);
      candidates.push({ type, name, method, confidence });
      if (candidates.length >= 80) break;
    }
  }
  collect(companyRegex, 'Company', 'company-suffix-regex', 0.72);
  collect(organisationRegex, 'Organization', 'organisation-suffix-regex', 0.67);
  collect(contextualPersonRegex, 'Person', 'contextual-person-regex', 0.62);
  collect(legalAuthorityRegex, 'LegalAuthority', 'legal-authority-regex', 0.64);
  for (const candidate of candidates) {
    const entity = upsertEntity({
      type: candidate.type,
      name: candidate.name,
      roles: ['named-in-public-record'],
      evidenceRefs: [evidence],
      reviewStatus: 'machine-extracted-unreviewed',
      firstSeen: evidence.retrievalDate,
      lastSeen: evidence.retrievalDate,
      properties: { extractionMethod: candidate.method, extractionConfidence: candidate.confidence }
    });
    addMention(contextEntity, entity, evidence, sourceRecordId, candidate.method, candidate.confidence);
  }
  return candidates;
}

function sourceEntity(source) {
  if (!source) return null;
  return upsertEntity({
    id: `source-${source.id}`,
    type: 'Source',
    name: source.label || source.id,
    roles: ['registered-investigation-source', source.authority || 'source'],
    identifiers: source.url ? [{ type: 'url', value: source.url }] : [],
    properties: { sourceId: source.id, url: source.url || '', lane: source.lane || '', authority: source.authority || '', frequency: source.frequency || [] },
    reviewStatus: 'registry-defined',
    firstSeen: generatedAt,
    lastSeen: generatedAt,
    evidenceRefs: [evidenceFrom({}, { sourceId: source.id, sourceTitle: source.label, sourceUrl: source.url, evidenceGrade: source.authority === 'primary-official' ? 'B' : 'C', factualStatus: 'registered-source', reviewStatus: 'registry-defined' })]
  });
}

for (const source of registry.sources || []) sourceEntity(source);

for (const finding of ledger.findings || []) {
  if (!finding?.id || !finding?.title) continue;
  const evidence = evidenceFrom(finding);
  const findingEntity = upsertEntity({
    id: `finding-${finding.id}`,
    type: 'Finding',
    name: finding.title,
    aliases: [],
    roles: [finding.status || 'record-update', finding.lane || 'unclassified'],
    properties: {
      findingId: finding.id,
      lane: finding.lane || '',
      status: finding.status || 'record-update',
      evidenceGrade: finding.evidenceGrade || 'C',
      severity: Number(finding.severity || 1),
      summary: clean(finding.summary || '', 900),
      conclusion: clean(finding.conclusion || '', 900),
      evidenceBoundary: clean(finding.evidenceBoundary || evidenceBoundary, 900),
      mechanism: clean(finding.mechanism || '', 900),
      implication: clean(finding.implication || '', 900),
      nextRecords: (finding.nextRecords || []).map(item => clean(item, 300)).slice(0, 8)
    },
    reviewStatus: finding.reviewStatus || 'machine-classified',
    firstSeen: finding.firstSeen || evidence.retrievalDate,
    lastSeen: finding.lastSeen || evidence.retrievalDate,
    evidenceRefs: [evidence]
  });
  findingRecords.push({ id: finding.id, entityId: findingEntity.id, title: finding.title, status: finding.status || 'record-update', evidenceGrade: finding.evidenceGrade || 'C', sourceId: finding.sourceId || '', sourceUrl: evidence.sourceUrl, published: evidence.publicationDate, reviewStatus: finding.reviewStatus || 'machine-classified' });
  const source = sourceById.get(finding.sourceId);
  const sourceNode = source ? sourceEntity(source) : null;
  if (sourceNode) upsertRelationship({ type: 'published', from: sourceNode.id, to: findingEntity.id, label: 'published finding record', evidence, sourceRecordId: finding.id, establishes: `The registered source published or hosts the record titled “${clean(finding.title, 220)}”.`, doesNotEstablish: evidence.doesNotEstablish, reviewStatus: 'registry-linked', extractionMethod: 'source-id-link', confidence: 1 });

  const text = [finding.title, finding.summary, finding.conclusion, finding.mechanism, finding.implication].filter(Boolean).join(' ');
  extractNamedEntities(text, evidence, findingEntity, finding.id);

  const amounts = unique((text.match(moneyRegex) || []).map(item => clean(item, 80))).slice(0, 20);
  for (const amount of amounts) {
    const payment = upsertEntity({
      id: stableId('payment', `${finding.id}|${amount}`),
      type: 'Payment',
      name: `${amount} money event`,
      roles: ['amount-mentioned-in-record'],
      properties: { amountText: amount, sourceFindingId: finding.id },
      reviewStatus: 'machine-extracted-unreviewed',
      firstSeen: evidence.retrievalDate,
      lastSeen: evidence.retrievalDate,
      evidenceRefs: [evidence]
    });
    addMention(findingEntity, payment, evidence, finding.id, 'money-regex', 0.78);
  }

  if (/\b(?:contract|procurement|award|grant|tender)\b/i.test(text) || finding.lane === 'money-contracts') {
    const contract = upsertEntity({
      id: stableId('contract', finding.id),
      type: 'Contract',
      name: clean(finding.title, 260),
      roles: ['contract-or-award-record'],
      properties: { sourceFindingId: finding.id, identifiers: finding.rawMeta?.identifiers || [] },
      reviewStatus: 'machine-classified-unreviewed',
      firstSeen: evidence.retrievalDate,
      lastSeen: evidence.retrievalDate,
      evidenceRefs: [evidence]
    });
    upsertRelationship({ type: 'subjectOf', from: contract.id, to: findingEntity.id, label: 'contract record subject', evidence, sourceRecordId: finding.id, establishes: 'The cited record is classified as concerning a contract, award, grant, tender or procurement matter.', doesNotEstablish: 'Classification does not establish improper contracting, payment, ownership or corruption.', reviewStatus: 'machine-classified-unreviewed', extractionMethod: 'contract-keyword-classifier', confidence: 0.72 });
  }
  if (/\b(?:case|court|judgment|complaint|indictment|defendant|docket|civil action|criminal action)\b/i.test(text) || ['established-wrongdoing','official-charge-or-allegation'].includes(finding.status)) {
    const courtCase = upsertEntity({
      id: stableId('courtcase', finding.id),
      type: 'CourtCase',
      name: clean(finding.title, 260),
      roles: [finding.status || 'court-record'],
      properties: { sourceFindingId: finding.id },
      reviewStatus: 'machine-classified-unreviewed',
      firstSeen: evidence.retrievalDate,
      lastSeen: evidence.retrievalDate,
      evidenceRefs: [evidence]
    });
    upsertRelationship({ type: 'subjectOf', from: courtCase.id, to: findingEntity.id, label: 'court record subject', evidence, sourceRecordId: finding.id, establishes: 'The cited record is classified as a court, complaint, charge, indictment or judgment record.', doesNotEstablish: 'A charge, complaint, arrest or indictment is not guilt. A final outcome applies only to the parties and conduct stated in the official record.', reviewStatus: 'machine-classified-unreviewed', extractionMethod: 'legal-keyword-classifier', confidence: 0.78 });
  }
  if (/\b(?:sanction|debar|penalty|fine|restriction|ofac)\b/i.test(text)) {
    const sanction = upsertEntity({ id: stableId('sanction', finding.id), type: 'Sanction', name: clean(finding.title, 260), roles: ['sanction-or-penalty-record'], properties: { sourceFindingId: finding.id }, reviewStatus: 'machine-classified-unreviewed', firstSeen: evidence.retrievalDate, lastSeen: evidence.retrievalDate, evidenceRefs: [evidence] });
    upsertRelationship({ type: 'subjectOf', from: sanction.id, to: findingEntity.id, label: 'sanction record subject', evidence, sourceRecordId: finding.id, establishes: 'The cited record contains sanction, penalty, fine, restriction or debarment terminology.', doesNotEstablish: 'The classification does not extend the official action beyond the named parties, conduct, jurisdiction or period.', reviewStatus: 'machine-classified-unreviewed', extractionMethod: 'sanction-keyword-classifier', confidence: 0.8 });
  }
  if (/\b(?:investigation|audit|inquiry|inspector general|oversight report)\b/i.test(text)) {
    const investigation = upsertEntity({ id: stableId('investigation', finding.id), type: 'Investigation', name: clean(finding.title, 260), roles: ['investigation-or-audit-record'], properties: { sourceFindingId: finding.id }, reviewStatus: 'machine-classified-unreviewed', firstSeen: evidence.retrievalDate, lastSeen: evidence.retrievalDate, evidenceRefs: [evidence] });
    upsertRelationship({ type: 'subjectOf', from: investigation.id, to: findingEntity.id, label: 'investigation record subject', evidence, sourceRecordId: finding.id, establishes: 'The cited record is classified as an investigation, audit, inquiry or oversight matter.', doesNotEstablish: 'An investigation or audit does not automatically establish criminal conduct or guilt.', reviewStatus: 'machine-classified-unreviewed', extractionMethod: 'investigation-keyword-classifier', confidence: 0.76 });
  }
}

const findingByUrl = new Map();
for (const finding of ledger.findings || []) {
  for (const value of [finding.itemUrl, finding.sourceUrl].filter(Boolean)) {
    try { findingByUrl.set(new URL(value).href, finding); } catch {}
  }
}

for (const document of documents.documents || []) {
  if (!document?.id || !document?.sha256) continue;
  const firstProvenance = document.provenance?.[0] || {};
  const evidence = evidenceFrom({}, {
    sourceId: firstProvenance.sourceId || 'document-library',
    sourceTitle: firstProvenance.sourceLabel || document.title || document.originalFileName || 'Public document',
    sourceUrl: firstProvenance.documentUrl || document.sourceUrls?.[0] || '',
    publicationDate: document.metadata?.creationDate || document.metadata?.modificationDate || null,
    retrievalDate: document.lastSeen || document.firstSeen || generatedAt,
    evidenceGrade: document.evidenceGrade || 'C',
    factualStatus: document.reviewStatus || 'unreviewed-source-document',
    establishes: 'The document bytes were retrieved, hashed and processed for searchable text with provenance attached.',
    doesNotEstablish: document.evidenceBoundary || 'Searchability does not authenticate every statement or establish guilt.',
    reviewStatus: document.reviewStatus || 'unreviewed-source-document'
  });
  const docEntity = upsertEntity({
    id: `document-${document.id}`,
    type: 'Document',
    name: document.title || document.originalFileName || `Document ${document.id}`,
    aliases: [document.originalFileName].filter(Boolean),
    roles: ['hash-preserved-public-document', document.extraction?.method || 'document-extraction'],
    identifiers: [{ type: 'sha256', value: document.sha256 }, ...(document.identifiers || [])],
    properties: {
      documentId: document.id,
      sha256: document.sha256,
      bytes: document.bytes || null,
      sourceUrls: document.sourceUrls || [],
      metadata: document.metadata || {},
      extraction: document.extraction || {},
      evidenceGrade: document.evidenceGrade || 'C',
      evidenceBoundary: document.evidenceBoundary || evidenceBoundary
    },
    reviewStatus: document.reviewStatus || 'unreviewed-source-document',
    firstSeen: document.firstSeen || evidence.retrievalDate,
    lastSeen: document.lastSeen || evidence.retrievalDate,
    evidenceRefs: [evidence]
  });
  documentRecords.push({ id: document.id, entityId: docEntity.id, title: docEntity.name, sha256: document.sha256, reviewStatus: docEntity.reviewStatus, evidenceGrade: document.evidenceGrade || 'C', sourceUrls: document.sourceUrls || [] });

  for (const provenance of document.provenance || []) {
    const source = sourceById.get(provenance.sourceId) || { id: provenance.sourceId || stableId('source', provenance.sourceLabel || provenance.sourcePageUrl || provenance.documentUrl), label: provenance.sourceLabel || provenance.sourceId || 'Public source', url: provenance.sourcePageUrl || provenance.documentUrl || '', lane: provenance.lane || '', authority: provenance.authority || '' };
    const sourceNode = sourceEntity(source);
    const provenanceEvidence = evidenceFrom({}, { sourceId: source.id, sourceTitle: source.label, sourceUrl: provenance.documentUrl || provenance.sourcePageUrl || source.url, retrievalDate: provenance.retrievedAt || evidence.retrievalDate, evidenceGrade: document.evidenceGrade || (source.authority === 'primary-official' ? 'B' : 'C'), factualStatus: 'document-retrieval', establishes: 'The document was retrieved from the stated source route and preserved by content hash.', doesNotEstablish: document.evidenceBoundary || evidenceBoundary, reviewStatus: document.reviewStatus || 'unreviewed-source-document' });
    upsertRelationship({ type: 'retrievedFrom', from: docEntity.id, to: sourceNode.id, label: 'retrieved from source', evidence: provenanceEvidence, sourceRecordId: document.id, establishes: provenanceEvidence.establishes, doesNotEstablish: provenanceEvidence.doesNotEstablish, reviewStatus: provenanceEvidence.reviewStatus, extractionMethod: 'document-provenance-link', confidence: 1 });
    const possibleFinding = findingByUrl.get(provenance.documentUrl || '') || findingByUrl.get(provenance.sourcePageUrl || '');
    if (possibleFinding) {
      upsertRelationship({ type: 'supports', from: docEntity.id, to: `finding-${possibleFinding.id}`, label: 'directly linked source document', evidence: provenanceEvidence, sourceRecordId: possibleFinding.id, establishes: 'The preserved document URL is directly linked to this finding record.', doesNotEstablish: possibleFinding.evidenceBoundary || evidenceBoundary, reviewStatus: 'url-linked-unreviewed', extractionMethod: 'exact-url-match', confidence: 1 });
    }
  }
  let extractedText = '';
  try { extractedText = fs.readFileSync(path.join(root, document.extraction?.textPath || ''), 'utf8').slice(0, 24000); } catch {}
  extractNamedEntities([docEntity.name, extractedText].join(' '), evidence, docEntity, document.id);
}

for (const change of sourceChanges.changes || []) {
  if (!change?.id) continue;
  const type = String(change.changeType || 'source-change');
  if (!/removed|unavailable|restored|changed/i.test(type)) continue;
  const evidence = evidenceFrom(change, { factualStatus: 'source-change-observation', establishes: change.established || 'The source monitor observed a change in the registered source.', doesNotEstablish: change.notEstablished || evidenceBoundary, reviewStatus: 'automated-source-monitor' });
  const missing = upsertEntity({
    id: `missing-record-${change.id}`,
    type: 'MissingRecord',
    name: change.title || `${type}: ${change.sourceLabel || change.sourceId || 'source'}`,
    roles: [type],
    properties: { changeType: type, additions: change.additions || [], removals: change.removals || [], previousHash: change.previousHash || null, currentHash: change.currentHash || null },
    reviewStatus: 'automated-source-monitor',
    firstSeen: change.detectedAt || evidence.retrievalDate,
    lastSeen: change.detectedAt || evidence.retrievalDate,
    evidenceRefs: [evidence]
  });
  missingRecordRecords.push({ id: change.id, entityId: missing.id, title: missing.name, changeType: type, sourceId: change.sourceId || '', detectedAt: change.detectedAt || evidence.retrievalDate, evidenceGrade: change.evidenceGrade || 'C' });
  const source = sourceById.get(change.sourceId) || { id: change.sourceId || stableId('source', change.sourceLabel || change.sourceUrl), label: change.sourceLabel || change.sourceId || 'Public source', url: change.sourceUrl || '', lane: change.lane || '', authority: change.authority || '' };
  const sourceNode = sourceEntity(source);
  upsertRelationship({ type: /removed|unavailable/i.test(type) ? 'missingFrom' : 'changedAt', from: missing.id, to: sourceNode.id, label: /removed|unavailable/i.test(type) ? 'missing or unavailable from source' : 'changed at source', evidence, sourceRecordId: change.id, establishes: evidence.establishes, doesNotEstablish: evidence.doesNotEstablish, reviewStatus: 'automated-source-monitor', extractionMethod: 'source-change-monitor', confidence: 1 });
}

for (const entity of overrides.entities || []) upsertEntity({ ...entity, reviewStatus: entity.reviewStatus || 'human-reviewed' });
for (const relationship of overrides.relationships || []) upsertRelationship({ ...relationship, reviewStatus: relationship.reviewStatus || 'human-reviewed', evidence: evidenceFrom(relationship, relationship) });

const entities = [...entityMap.values()]
  .filter(entity => !suppressedEntities.has(entity.id))
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
const entityIds = new Set(entities.map(entity => entity.id));
const relationships = [...relationshipMap.values()]
  .filter(relationship => entityIds.has(relationship.from) && entityIds.has(relationship.to) && !suppressedRelationships.has(relationship.id))
  .map(({ evidence, ...relationship }) => relationship)
  .sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
const countsByType = Object.fromEntries(Object.keys(schema.entityTypes || {}).map(type => [type, entities.filter(entity => entity.type === type).length]));
const countsByRelationship = Object.fromEntries(Object.keys(schema.relationshipTypes || {}).map(type => [type, relationships.filter(relationship => relationship.type === type).length]));
const reviewCounts = entities.reduce((counts, entity) => { counts[entity.reviewStatus] = (counts[entity.reviewStatus] || 0) + 1; return counts; }, {});

const graph = {
  ok: true,
  schemaVersion: schema.schemaVersion || '1.0.0',
  generatedAt,
  model: 'Lightweight FollowTheMoney-compatible public-record graph',
  evidenceBoundary,
  rules: [
    'Every relationship carries source, date, grade, factual status, establishes, does-not-establish and review status fields.',
    'Machine-extracted names are unreviewed mentions until confirmed against the underlying record.',
    'A mention is never upgraded automatically into ownership, payment, affiliation, criminal conduct or guilt.',
    'Grade B, C and D material is not described as proven criminal wrongdoing.',
    'Human-reviewed overrides may add aliases, corrections, narrower classifications or sourced relationships without rewriting source evidence.'
  ],
  totals: { entities: entities.length, relationships: relationships.length, findings: findingRecords.length, documents: documentRecords.length, missingRecords: missingRecordRecords.length },
  countsByType,
  countsByRelationship,
  reviewCounts,
  entities,
  relationships,
  findings: findingRecords,
  documents: documentRecords,
  missingRecords: missingRecordRecords
};
writeJson(path.join(dataDir, 'investigation-knowledge-graph.json'), graph);
writeJson(path.join(dataDir, 'entity-registry.json'), { ok: true, schemaVersion: graph.schemaVersion, generatedAt, evidenceBoundary, totals: { entities: entities.length }, countsByType, reviewCounts, entities });
writeJson(path.join(dataDir, 'relationship-registry.json'), { ok: true, schemaVersion: graph.schemaVersion, generatedAt, evidenceBoundary, totals: { relationships: relationships.length }, countsByRelationship, relationships });

const entityCsv = [['id','type','follow_the_money_schema','name','aliases','roles','review_status','first_seen','last_seen','evidence_count'], ...entities.map(entity => [entity.id, entity.type, entity.followTheMoneySchema, entity.name, entity.aliases.join(' | '), entity.roles.join(' | '), entity.reviewStatus, entity.firstSeen || '', entity.lastSeen || '', entity.evidenceRefs.length])];
const relationshipCsv = [['id','type','from','to','source_id','source_title','source_url','publication_date','retrieval_date','evidence_grade','factual_status','establishes','does_not_establish','review_status','extraction_method','confidence'], ...relationships.map(item => [item.id,item.type,item.from,item.to,item.sourceId,item.sourceTitle,item.sourceUrl,item.publicationDate || '',item.retrievalDate || '',item.evidenceGrade,item.factualStatus,item.establishes,item.doesNotEstablish,item.reviewStatus,item.extractionMethod,item.confidence])];
fs.writeFileSync(path.join(downloadsDir, 'investigation-entities.csv'), entityCsv.map(row => row.map(csvCell).join(',')).join('\n'));
fs.writeFileSync(path.join(downloadsDir, 'investigation-relationships.csv'), relationshipCsv.map(row => row.map(csvCell).join(',')).join('\n'));

const cards = entities.slice(0, 500).map(entity => {
  const aliases = entity.aliases.length ? `<p><strong>Aliases:</strong> ${esc(entity.aliases.join(' · '))}</p>` : '';
  const identifiers = entity.identifiers.length ? `<p><strong>Identifiers:</strong> ${entity.identifiers.slice(0, 8).map(item => `${esc(item.type)}: ${esc(item.value)}`).join(' · ')}</p>` : '';
  const evidence = entity.evidenceRefs.slice(0, 3).map(ref => `<li>${ref.sourceUrl ? `<a href="${esc(ref.sourceUrl)}" rel="noopener">${esc(ref.sourceTitle)}</a>` : esc(ref.sourceTitle)} · Grade ${esc(ref.evidenceGrade)} · ${esc(ref.factualStatus)}</li>`).join('');
  return `<article class="entity-card" data-type="${esc(entity.type)}" data-review="${esc(entity.reviewStatus)}" data-search="${esc(`${entity.name} ${entity.aliases.join(' ')} ${entity.roles.join(' ')}`.toLowerCase())}"><div class="entity-meta"><span>${esc(entity.type)}</span><span>${esc(entity.followTheMoneySchema)}</span><span>${esc(entity.reviewStatus)}</span></div><h2>${esc(entity.name)}</h2>${aliases}${identifiers}<p><strong>Roles:</strong> ${esc(entity.roles.join(' · ') || 'record entity')}</p><h3>Evidence references</h3><ul>${evidence || '<li>No public evidence reference attached.</li>'}</ul><p class="boundary"><strong>Boundary:</strong> ${esc(entity.evidenceRefs[0]?.doesNotEstablish || evidenceBoundary)}</p></article>`;
}).join('\n');
const typeOptions = Object.entries(countsByType).filter(([, count]) => count > 0).map(([type, count]) => `<option value="${esc(type)}">${esc(type)} (${count})</option>`).join('');
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entity Registry | Matrix Reprogrammed</title><meta name="description" content="Structured public-record entities and evidence-bound relationships using a lightweight FollowTheMoney-compatible model."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><style>.registry-wrap{max-width:1180px;margin:auto;padding:2rem 1rem}.registry-tools{display:grid;grid-template-columns:2fr 1fr 1fr;gap:.7rem;margin:1rem 0}.registry-tools input,.registry-tools select{padding:.8rem;border:1px solid rgba(216,181,106,.35);background:#090909;color:#eee;border-radius:8px}.entity-card{border:1px solid rgba(216,181,106,.28);border-radius:16px;padding:1.2rem;margin:1rem 0;background:rgba(0,0,0,.84)}.entity-meta{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem;text-transform:uppercase}.entity-meta span{border:1px solid rgba(216,181,106,.3);border-radius:999px;padding:.25rem .55rem}.boundary{font-size:.88rem;color:#c8b98c}.registry-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.8rem}.registry-summary div{border:1px solid rgba(216,181,106,.25);padding:.8rem;border-radius:12px}@media(max-width:720px){.registry-tools{grid-template-columns:1fr}}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="document-library.html">Documents</a><a href="evidence-network-map.html">Evidence Map</a><a href="search.html">Search</a></nav></header><main class="registry-wrap"><div class="eyebrow">Phase 3 · Structured investigation data</div><h1>ENTITY REGISTRY</h1><p class="lead">People, institutions, companies, contracts, payments, cases, investigations, documents and missing-record observations are normalised into stable public records.</p><p><strong>Evidence boundary:</strong> ${esc(evidenceBoundary)}</p><div class="registry-summary"><div><strong>${entities.length}</strong><br>entities</div><div><strong>${relationships.length}</strong><br>sourced relationships</div><div><strong>${findingRecords.length}</strong><br>findings linked</div><div><strong>${documentRecords.length}</strong><br>documents linked</div></div><div class="cta-row"><a class="btn" href="data/investigation-knowledge-graph.json">Knowledge Graph JSON</a><a class="btn alt" href="data/relationship-registry.json">Relationships JSON</a><a class="btn alt" href="downloads/investigation-entities.csv">Entities CSV</a><a class="btn alt" href="downloads/investigation-relationships.csv">Relationships CSV</a></div><div class="registry-tools"><input id="entity-query" type="search" placeholder="Search names, aliases and roles"><select id="entity-type"><option value="">All entity types</option>${typeOptions}</select><select id="entity-review"><option value="">All review states</option><option value="human-reviewed">Human reviewed</option><option value="registry-defined">Registry defined</option><option value="machine-classified">Machine classified</option><option value="machine-extracted-unreviewed">Machine extracted, unreviewed</option><option value="unreviewed-source-document">Unreviewed source document</option></select></div><p id="entity-count">Showing ${Math.min(entities.length, 500)} records.</p><section id="entity-list">${cards || '<article class="entity-card"><h2>No structured entity records yet</h2><p>The builder is active. This neutral state does not imply that no entities exist in source documents.</p></article>'}</section></main></div><script>const q=document.getElementById('entity-query'),t=document.getElementById('entity-type'),r=document.getElementById('entity-review'),cards=[...document.querySelectorAll('.entity-card')],count=document.getElementById('entity-count');function filter(){const query=q.value.trim().toLowerCase();let shown=0;for(const card of cards){const ok=(!query||card.dataset.search.includes(query))&&(!t.value||card.dataset.type===t.value)&&(!r.value||card.dataset.review===r.value);card.hidden=!ok;if(ok)shown++}count.textContent='Showing '+shown+' records.'}q.addEventListener('input',filter);t.addEventListener('change',filter);r.addEventListener('change',filter);</script><script src="investigation-pulse.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'entity-registry.html'), page);
writeJson(path.join(downloadsDir, 'structured-investigation-data-build.json'), { ok: true, generatedAt, schemaVersion: graph.schemaVersion, totals: graph.totals, countsByType, countsByRelationship, routes: ['entity-registry.html','data/investigation-knowledge-graph.json','data/entity-registry.json','data/relationship-registry.json','downloads/investigation-entities.csv','downloads/investigation-relationships.csv'], software: 'Node.js with FollowTheMoney-compatible concepts; no paid service or external database required.' });
console.log(`Structured investigation graph built: ${entities.length} entities, ${relationships.length} relationships, ${findingRecords.length} findings, ${documentRecords.length} documents.`);
