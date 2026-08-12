const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputPath = path.join(root, 'data', 'public-investigation-corpus.json');
const sourceAssets = [
  'search-index.json',
  'data/record-events.json',
  'data/intel-vault.json',
  'data/verified-record-cards.json',
  'data/verified-record-cards-batch-001.json',
  'data/entity-registry.json',
  'data/relationship-registry.json',
  'data/money-relationship-feed.json',
  'data/criminal-accountability-relationship-graph.json',
  'data/entity-observations.json',
  'data/entity-relationship-scores.json',
  'data/missing-records.json'
];

function readText(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function readJson(relative, fallback = {}) {
  try { return JSON.parse(readText(relative)); } catch { return fallback; }
}

function compact(value, maximum = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function list(values, maximum = 20) {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(source.map(value => compact(value, 240)).filter(Boolean))].slice(0, maximum);
}

function validRoute(value) {
  const route = compact(value, 1000);
  if (!route || /^(?:javascript|data):/i.test(route)) return '';
  return route;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceFingerprint(relative) {
  if (!fs.existsSync(path.join(root, relative))) return null;
  const text = readText(relative);
  return { path: relative, sha256: sha256(text), bytes: Buffer.byteLength(text) };
}

function newest(values) {
  return values.map(value => compact(value, 80)).filter(Boolean).sort().at(-1) || 'unknown';
}

function prune(value) {
  if (Array.isArray(value)) return value.map(prune).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, prune(item)])
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
  }
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

const searchIndex = readJson('search-index.json', []);
const recordEvents = readJson('data/record-events.json', {});
const intelVault = readJson('data/intel-vault.json', {});
const verified = readJson('data/verified-record-cards.json', {});
const verifiedBatch = readJson('data/verified-record-cards-batch-001.json', {});
const entityRegistry = readJson('data/entity-registry.json', {});
const relationshipRegistry = readJson('data/relationship-registry.json', {});
const moneyRelationships = readJson('data/money-relationship-feed.json', {});
const criminalGraph = readJson('data/criminal-accountability-relationship-graph.json', {});
const entityObservations = readJson('data/entity-observations.json', {});
const entityScores = readJson('data/entity-relationship-scores.json', {});
const missingRecords = readJson('data/missing-records.json', {});

const entityNames = new Map((entityRegistry.entities || []).map(entity => [String(entity.id), compact(entity.name || entity.label || entity.id, 240)]));
for (const node of criminalGraph.nodes || []) entityNames.set(String(node.id), compact(node.name || node.id, 240));

const evidence = new Map();
function addEvidence(record) {
  const id = compact(record.evidence_id, 300);
  const sourceRoute = validRoute(record.source_route);
  if (!id || !record.title || !sourceRoute || evidence.has(id)) return;
  evidence.set(id, {
    evidence_id: id,
    source_asset: compact(record.source_asset, 180),
    source_record_id: compact(record.source_record_id || id, 300),
    title: compact(record.title, 420),
    summary: compact(record.summary, 1000),
    establishes: compact(record.establishes, 1000),
    does_not_establish: compact(record.does_not_establish, 1000),
    evidence_boundary: compact(record.evidence_boundary || record.does_not_establish, 1000),
    evidence_grade: compact(record.evidence_grade || 'ungraded', 140),
    factual_status: compact(record.factual_status || 'unreviewed', 160),
    claim_class: compact(record.claim_class || 'unknown', 80),
    source_type: compact(record.source_type || 'public-record', 160),
    source_publisher: compact(record.source_publisher, 240),
    source_route: sourceRoute,
    matrix_route: validRoute(record.matrix_route),
    published_at: compact(record.published_at, 80),
    retrieved_at: compact(record.retrieved_at, 80),
    related_entities: list(record.related_entities, 24),
    related_investigations: list(record.related_investigations, 12),
    missing_records: list(record.missing_records, 16),
    relationship: record.relationship ? {
      from: compact(record.relationship.from, 240),
      to: compact(record.relationship.to, 240),
      type: compact(record.relationship.type, 220)
    } : null
  });
}

for (const event of recordEvents.events || []) {
  addEvidence({
    evidence_id: `record-event:${event.id}`,
    source_asset: 'data/record-events.json',
    source_record_id: event.source_record_id || event.id,
    title: event.summary || event.source_name || event.id,
    summary: event.summary,
    establishes: `Matrix preserved a ${event.record_type || 'public'} record from ${event.source_name || event.source_lane || 'the registered source'}.`,
    does_not_establish: event.boundary || 'The record route does not establish claims beyond the document itself.',
    evidence_boundary: event.boundary,
    evidence_grade: event.evidence_grade || 'documented association',
    factual_status: 'source-record',
    claim_class: 'fact',
    source_type: event.record_type || 'official-public-record',
    source_publisher: event.source_name,
    source_route: event.source_url,
    matrix_route: (event.send_to || []).includes('daily-brain-brief') ? 'daily-brain-brief.html' : 'investigation-machine.html',
    published_at: event.date,
    retrieved_at: event.pulled_at,
    related_entities: [...(event.entity_names || []), ...(event.institution_names || [])],
    related_investigations: event.send_to,
    missing_records: event.missing_records
  });
}

for (const card of verified.verifiedCards || []) {
  addEvidence({
    evidence_id: `verified-card:${card.recordId}`,
    source_asset: 'data/verified-record-cards.json',
    source_record_id: card.recordId,
    title: card.title,
    summary: card.recordShows,
    establishes: card.recordShows,
    does_not_establish: card.recordDoesNotShow,
    evidence_boundary: card.boundary,
    evidence_grade: card.evidenceGrade,
    factual_status: 'verified-record-card',
    claim_class: 'fact',
    source_type: card.sourceType,
    source_route: card.sourceRoute,
    matrix_route: 'evidence-vault.html',
    published_at: card.recordDate,
    retrieved_at: card.pulledDate,
    related_entities: card.claimsSupported,
    related_investigations: card.feedsTrackers,
    missing_records: [card.nextRecordToPull]
  });
}

for (const card of verifiedBatch.cards || []) {
  addEvidence({
    evidence_id: `verified-card:${card.id}`,
    source_asset: 'data/verified-record-cards-batch-001.json',
    source_record_id: card.id,
    title: card.recordTitle || card.target,
    summary: (card.supports || []).join(' '),
    establishes: (card.supports || []).join(' '),
    does_not_establish: (card.doesNotSupport || []).join(' '),
    evidence_boundary: verifiedBatch.boundary,
    evidence_grade: card.status || 'preliminary verified record card',
    factual_status: card.status || 'preliminary',
    claim_class: 'fact',
    source_type: card.recordType,
    source_publisher: card.sourceAuthority,
    source_route: card.sourceUrl,
    matrix_route: (card.feeds || [])[0] || 'findings-dashboard.html',
    related_entities: [card.target],
    related_investigations: card.feeds,
    missing_records: card.classificationNeeded
  });
}

const relationshipCandidates = (relationshipRegistry.relationships || [])
  .filter(item => item && item.sourceUrl && /^[AB](?:\b|$)/i.test(String(item.evidenceGrade || '')))
  .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0) || String(right.retrievalDate || right.date || '').localeCompare(String(left.retrievalDate || left.date || '')))
  .slice(0, 1000);

for (const relationship of relationshipCandidates) {
  const from = entityNames.get(String(relationship.from)) || compact(relationship.from, 240);
  const to = entityNames.get(String(relationship.to)) || compact(relationship.to, 240);
  addEvidence({
    evidence_id: `relationship:${relationship.id}`,
    source_asset: 'data/relationship-registry.json',
    source_record_id: relationship.sourceRecordId || relationship.id,
    title: `${from} — ${relationship.label || relationship.type || 'public-record relationship'} — ${to}`,
    summary: relationship.establishes,
    establishes: relationship.establishes,
    does_not_establish: relationship.doesNotEstablish,
    evidence_boundary: relationship.doesNotEstablish,
    evidence_grade: relationship.evidenceGrade,
    factual_status: relationship.factualStatus,
    claim_class: 'documented_association',
    source_type: relationship.extractionMethod || relationship.type || 'relationship-record',
    source_publisher: relationship.sourceTitle,
    source_route: relationship.sourceUrl,
    matrix_route: 'relationship-registry.html',
    published_at: relationship.publicationDate || relationship.date,
    retrieved_at: relationship.retrievalDate,
    related_entities: [from, to],
    related_investigations: ['relationship-registry'],
    relationship: { from, to, type: relationship.label || relationship.type }
  });
}

for (const relationship of (moneyRelationships.relationships || []).slice(0, 600)) {
  addEvidence({
    evidence_id: `money-relationship:${relationship.id}`,
    source_asset: 'data/money-relationship-feed.json',
    source_record_id: relationship.id,
    title: `${relationship.from} — ${relationship.type || 'money relationship'} — ${relationship.to}`,
    summary: relationship.established,
    establishes: relationship.established,
    does_not_establish: relationship.notEstablished,
    evidence_boundary: relationship.notEstablished,
    evidence_grade: relationship.evidenceClass || 'source-linked association',
    factual_status: 'source-linked-relationship',
    claim_class: 'documented_association',
    source_type: 'money-relationship-record',
    source_route: relationship.sourceUrl,
    matrix_route: 'follow-the-money.html',
    published_at: relationship.sourceDate,
    related_entities: [relationship.from, relationship.to],
    related_investigations: ['follow-the-money'],
    relationship: { from: relationship.from, to: relationship.to, type: relationship.type }
  });
}

for (const edge of criminalGraph.edges || []) {
  const sourceRoute = (edge.sourceRoutes || [])[0];
  addEvidence({
    evidence_id: `accountability-relationship:${edge.id}`,
    source_asset: 'data/criminal-accountability-relationship-graph.json',
    source_record_id: edge.id,
    title: `${entityNames.get(String(edge.source)) || edge.source} — ${edge.relationshipType || 'relationship'} — ${entityNames.get(String(edge.target)) || edge.target}`,
    summary: edge.relationshipType,
    establishes: `The cited public record documents the stated ${edge.relationshipType || 'relationship'} context.`,
    does_not_establish: edge.evidenceBoundary,
    evidence_boundary: edge.evidenceBoundary,
    evidence_grade: edge.evidenceGrade,
    factual_status: 'accountability-record',
    claim_class: 'fact',
    source_type: 'court-or-enforcement-record',
    source_route: sourceRoute,
    matrix_route: 'criminal-accountability-relationship-graph.html',
    published_at: edge.dateRange,
    related_entities: [entityNames.get(String(edge.source)) || edge.source, entityNames.get(String(edge.target)) || edge.target],
    related_investigations: ['criminal-accountability'],
    relationship: {
      from: entityNames.get(String(edge.source)) || edge.source,
      to: entityNames.get(String(edge.target)) || edge.target,
      type: edge.relationshipType
    }
  });
}

for (const item of intelVault.items || []) {
  addEvidence({
    evidence_id: `intel-lead:${item.id}`,
    source_asset: 'data/intel-vault.json',
    source_record_id: item.id,
    title: item.title,
    summary: item.summary,
    establishes: 'Matrix preserved this dated public source lead for follow-up.',
    does_not_establish: item.evidenceBoundary || intelVault.boundary,
    evidence_boundary: item.evidenceBoundary || intelVault.boundary,
    evidence_grade: item.evidenceLevel || 'public-record lead',
    factual_status: item.status || 'lead',
    claim_class: 'allegation_or_disputed',
    source_type: item.sourceTier || 'news-or-archive-lead',
    source_publisher: item.sourceLabel,
    source_route: item.url,
    matrix_route: item.evidenceRoute || 'live-intel.html',
    published_at: item.published,
    retrieved_at: item.fetchedAt,
    related_investigations: [item.lane, item.laneTitle]
  });
}

const entityContextByName = new Map();
for (const item of entityObservations.observations || []) {
  const name = compact(item.name, 240);
  if (!name) continue;
  entityContextByName.set(name.toLowerCase(), {
    id: compact(item.id, 240) || `entity:${sha256(name).slice(0, 20)}`,
    name,
    count: Number(item.count || 0),
    lanes: list(item.lanes, 12),
    record_types: list(item.record_types, 12),
    evidence_grades: list(item.evidence_grades, 12),
    source_events: list(item.source_events, 30),
    last_seen: compact(item.last_seen, 80)
  });
}
// A no-new-observations run must not erase entity context that is still
// present in admitted public evidence. Reconstruct that bounded layer from
// cited records while retaining richer observation metadata when available.
for (const item of evidence.values()) {
  for (const rawName of item.related_entities || []) {
    const name = compact(rawName, 240);
    if (!name) continue;
    const key = name.toLowerCase();
    const prior = entityContextByName.get(key);
    if (prior) {
      prior.count += 1;
      prior.lanes = list([...prior.lanes, ...(item.related_investigations || [])], 12);
      prior.record_types = list([...prior.record_types, item.source_type], 12);
      prior.evidence_grades = list([...prior.evidence_grades, item.evidence_grade], 12);
      prior.source_events = list([...prior.source_events, item.evidence_id], 30);
      prior.last_seen = newest([prior.last_seen === 'unknown' ? '' : prior.last_seen, item.published_at, item.retrieved_at]);
      continue;
    }
    entityContextByName.set(key, {
      id: `evidence-entity:${sha256(name).slice(0, 20)}`,
      name,
      count: 1,
      lanes: list(item.related_investigations, 12),
      record_types: list([item.source_type], 12),
      evidence_grades: list([item.evidence_grade], 12),
      source_events: [item.evidence_id],
      last_seen: newest([item.published_at, item.retrieved_at])
    });
  }
}
const entityContext = [...entityContextByName.values()];

// The score feed can legitimately be empty when a current collection run has
// no co-occurrence observations. Preserve the independently sourced relation
// records already admitted to the evidence corpus instead of publishing an
// empty relationship layer in that case.
const relationshipContextById = new Map();
for (const item of entityScores.relationships || []) {
  const id = compact(item.id, 300);
  if (!id) continue;
  relationshipContextById.set(id, {
    id,
    from: compact(item.from, 240),
    to: compact(item.to, 240),
    count: Number(item.count || 0),
    score: Number(item.score || 0),
    grade: compact(item.grade, 80),
    relationship_type: compact(item.relationship_type, 180),
    boundary: compact(item.boundary, 600),
    source_events: list(item.source_events, 30),
    lanes: list(item.lanes, 12)
  });
}
for (const item of evidence.values()) {
  if (!item.relationship?.from || !item.relationship?.to || relationshipContextById.has(item.evidence_id)) continue;
  relationshipContextById.set(item.evidence_id, {
    id: item.evidence_id,
    from: compact(item.relationship.from, 240),
    to: compact(item.relationship.to, 240),
    count: 1,
    score: /^[AB](?:\b|$)/i.test(item.evidence_grade || '') ? 1 : 0.5,
    grade: compact(item.evidence_grade, 80),
    relationship_type: compact(item.relationship.type, 180),
    boundary: compact(item.evidence_boundary, 600),
    source_events: [item.evidence_id],
    lanes: list(item.related_investigations, 12),
    source_route: item.source_route
  });
}
const relationshipContext = [...relationshipContextById.values()];

const missingContext = (missingRecords.records || []).slice(0, 500).map(item => ({
  entity: compact(item.entity, 240),
  record: compact(item.record, 500),
  route: validRoute(item.route),
  type: compact(item.type, 120)
}));

const routes = (Array.isArray(searchIndex) ? searchIndex : []).map(item => ({
  title: compact(item.title, 320),
  url: validRoute(item.url),
  description: compact(item.description || item.subtitle, 520),
  category: compact(item.category, 120),
  layer: compact(item.layer, 120),
  source_type: compact(item.sourceType, 100),
  entity: compact(item.entity, 220),
  jurisdiction: compact(item.jurisdiction, 120),
  priority: Number(item.priority || 0),
  keywords: list(item.keywords, 16)
})).filter(item => item.title && item.url);

const generatedAt = newest([
  recordEvents.updated,
  intelVault.updated,
  verified.updated,
  verifiedBatch.updated,
  entityRegistry.updated || entityRegistry.generatedAt,
  relationshipRegistry.updated || relationshipRegistry.generatedAt,
  moneyRelationships.generatedAt,
  criminalGraph.generatedAt,
  entityObservations.updated,
  entityScores.updated,
  missingRecords.updated
]);

const output = {
  schema_version: 'matrix-public-investigation-corpus-v1',
  generated_at: generatedAt,
  evidence_boundary: 'Retrieval relevance is not proof. Official records, verified record cards, documented associations, source-linked relationships, allegations and leads retain their original evidence boundaries. A name, link, contact or co-occurrence does not establish guilt, knowledge, coordination or motive.',
  source_assets: sourceAssets.map(sourceFingerprint).filter(Boolean),
  counts: {
    evidence: evidence.size,
    routes: routes.length,
    entities: entityContext.length,
    relationships: relationshipContext.length,
    missing_records: missingContext.length
  },
  evidence: [...evidence.values()],
  routes,
  entities: entityContext,
  relationships: relationshipContext,
  missing_records: missingContext
};

const serialized = JSON.stringify(prune(output));
fs.writeFileSync(outputPath, serialized);
const siteOutputPath = path.join(root, '_site', 'data', 'public-investigation-corpus.json');
if (fs.existsSync(path.join(root, '_site'))) {
  fs.mkdirSync(path.dirname(siteOutputPath), { recursive: true });
  fs.writeFileSync(siteOutputPath, serialized);
}
console.log(`Built public investigation corpus with ${output.counts.evidence} evidence records, ${output.counts.routes} routes and ${output.counts.relationships} relationship summaries.`);
