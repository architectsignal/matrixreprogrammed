const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(relativePath, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')); }
  catch { return fallback; }
}
function clean(value = '', max = 600) {
  const text = String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function validDate(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : '';
}
function gradeRank(value) { return ({ A: 4, B: 3, C: 2, D: 1 }[String(value || '').toUpperCase()] || 0); }
function strongestGrade(refs = []) {
  return refs.map(ref => String(ref?.evidenceGrade || '').toUpperCase()).sort((a, b) => gradeRank(b) - gradeRank(a))[0] || 'C';
}
function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function relationshipRoute(id) { return `relationship-registry.html#relationship-${encodeURIComponent(id)}`; }
function entityRoute(id) { return `entity-registry.html#entity-${encodeURIComponent(id)}`; }

const entityData = readJson('data/entity-registry.json', { entities: [], evidenceBoundary: '' });
const relationshipData = readJson('data/relationship-registry.json', { relationships: [], evidenceBoundary: '' });
const entityById = new Map((entityData.entities || []).filter(item => item?.id).map(item => [item.id, item]));
const exclusion = { orphaned: 0, unsourced: 0, malformed: 0 };
const relationships = [];

for (const item of relationshipData.relationships || []) {
  if (!item?.id || !item?.from || !item?.to || !item?.type) { exclusion.malformed += 1; continue; }
  if (!entityById.has(item.from) || !entityById.has(item.to)) { exclusion.orphaned += 1; continue; }
  if (!String(item.sourceUrl || '').trim()) { exclusion.unsourced += 1; continue; }
  relationships.push(item);
}

const usedEntityIds = new Set();
const degree = new Map();
for (const relationship of relationships) {
  usedEntityIds.add(relationship.from); usedEntityIds.add(relationship.to);
  degree.set(relationship.from, Number(degree.get(relationship.from) || 0) + 1);
  degree.set(relationship.to, Number(degree.get(relationship.to) || 0) + 1);
}

const conciseEntityBoundary = 'Association or mention does not establish guilt, wrongdoing or shared intent.';
const conciseRelationshipBoundary = 'This cited relationship does not establish guilt, wrongdoing or shared intent.';
const conciseMentionBoundary = 'A textual mention does not establish a substantive relationship, shared intent or guilt.';
const conciseEstablishes = 'The cited source records this relationship.';

const nodes = [...usedEntityIds].map(id => {
  const entity = entityById.get(id);
  const refs = Array.isArray(entity.evidenceRefs) ? entity.evidenceRefs : [];
  const grades = unique(refs.map(ref => ref.evidenceGrade));
  const statuses = unique(refs.map(ref => ref.factualStatus));
  const sources = unique(refs.map(ref => ref.sourceUrl));
  const evidenceRefs = refs.slice(0, 5).map(ref => ({
    sourceTitle: clean(ref.sourceTitle || ref.sourceId || 'Public source', 180),
    sourceUrl: String(ref.sourceUrl || ''),
    publicationDate: validDate(ref.publicationDate),
    retrievalDate: validDate(ref.retrievalDate),
    evidenceGrade: String(ref.evidenceGrade || 'C').toUpperCase(),
    factualStatus: clean(ref.factualStatus || 'source-record', 80),
    establishes: clean(ref.establishes || '', 420),
    doesNotEstablish: clean(ref.doesNotEstablish || conciseEntityBoundary, 420)
  }));
  const connections = Number(degree.get(id) || 0);
  return { data: {
    id,
    entityType: entity.type || 'Entity',
    followTheMoneySchema: entity.followTheMoneySchema || entity.type || 'Entity',
    label: clean(entity.name || id, 130),
    aliases: (entity.aliases || []).map(value => clean(value, 120)).slice(0, 20),
    roles: (entity.roles || []).map(value => clean(value, 100)).slice(0, 20),
    identifiers: (entity.identifiers || []).slice(0, 12),
    reviewStatus: entity.reviewStatus || 'unreviewed',
    firstSeen: validDate(entity.firstSeen),
    lastSeen: validDate(entity.lastSeen),
    grade: strongestGrade(refs),
    grades,
    factualStatuses: statuses,
    sourceCount: sources.length,
    connections,
    weight: Math.min(94, 24 + Math.sqrt(Math.max(1, connections)) * 9),
    route: entityRoute(id),
    evidenceRefs,
    boundary: clean(refs[0]?.doesNotEstablish || conciseEntityBoundary, 420)
  } };
});

const edges = relationships.map(item => {
  const grade = String(item.evidenceGrade || 'C').toUpperCase();
  const confidence = Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0;
  const reviewStatus = item.reviewStatus || 'unreviewed';
  const factualStatus = item.factualStatus || 'source-record';
  const weakMention = item.type === 'mentions';
  const official = ['A', 'B'].includes(grade) && !/unverified|leak|speculation/i.test(factualStatus);
  const reviewed = /human-reviewed|registry-defined|registry-linked|automated-source-monitor/i.test(reviewStatus);
  const core = !weakMention && grade !== 'D' && confidence >= 0.6;
  const sourceRecordId = String(item.sourceRecordId || '').trim();
  const sourceId = String(item.sourceId || '').trim();
  return { data: {
    id: item.id,
    source: item.from,
    target: item.to,
    relationshipType: item.type,
    label: clean(item.label || item.type, 100),
    ...(sourceRecordId ? { sourceRecordId } : {}),
    ...(sourceId ? { sourceId } : {}),
    sourceTitle: clean(item.sourceTitle || item.sourceId || 'Public source', 200),
    sourceUrl: String(item.sourceUrl || ''),
    date: validDate(item.date || item.publicationDate || item.retrievalDate),
    publicationDate: validDate(item.publicationDate),
    retrievalDate: validDate(item.retrievalDate),
    grade,
    factualStatus,
    establishes: clean(item.establishes || conciseEstablishes, 650),
    doesNotEstablish: clean(item.doesNotEstablish || (weakMention ? conciseMentionBoundary : conciseRelationshipBoundary), 650),
    reviewStatus,
    extractionMethod: clean(item.extractionMethod || 'structured-registry', 120),
    confidence,
    core,
    official,
    reviewed,
    weakMention,
    route: relationshipRoute(item.id)
  } };
});

const relationshipTypes = unique(edges.map(edge => edge.data.relationshipType)).sort();
const entityTypes = unique(nodes.map(node => node.data.entityType)).sort();
const grades = unique(edges.map(edge => edge.data.grade)).sort((a, b) => gradeRank(b) - gradeRank(a));
const factualStatuses = unique(edges.map(edge => edge.data.factualStatus)).sort();
const reviewStatuses = unique(edges.map(edge => edge.data.reviewStatus)).sort();
const dates = edges.map(edge => edge.data.date).filter(Boolean).sort();
const countsByRelationship = Object.fromEntries(relationshipTypes.map(type => [type, edges.filter(edge => edge.data.relationshipType === type).length]));
const countsByEntity = Object.fromEntries(entityTypes.map(type => [type, nodes.filter(node => node.data.entityType === type).length]));

const graph = {
  ok: true,
  schemaVersion: '2.0.0',
  generatedAt: new Date().toISOString(),
  sourceUpdatedAt: relationshipData.refinedAt || relationshipData.generatedAt || entityData.refinedAt || entityData.generatedAt || null,
  title: 'Matrix Reprogrammed Public Evidence Network',
  description: 'A public Cytoscape.js map of structured entities and sourced relationships generated from the Phase 3 registries.',
  boundary: 'Every line represents a relationship stated by a cited source or observed by a disclosed extraction method. It does not convert association, mention, office, proximity, wealth, a photograph, a flight entry, an allegation or an unauthenticated leak into guilt.',
  methodology: 'Only relationships with two registered endpoints and a public source URL enter the graph. Weak textual mentions are visually separated from substantive relationship types and remain explicitly unreviewed where applicable.',
  totals: {
    entities: nodes.length,
    relationships: edges.length,
    coreRelationships: edges.filter(edge => edge.data.core).length,
    officialRelationships: edges.filter(edge => edge.data.official).length,
    reviewedRelationships: edges.filter(edge => edge.data.reviewed).length,
    weakMentions: edges.filter(edge => edge.data.weakMention).length,
    excluded: exclusion
  },
  countsByRelationship,
  countsByEntity,
  dateRange: { from: dates[0] || null, to: dates[dates.length - 1] || null },
  filters: { relationshipTypes, entityTypes, grades, factualStatuses, reviewStatuses },
  views: {
    core: 'Non-mention relationships with Grade A–C evidence and confidence of at least 0.60.',
    official: 'Grade A or B relationships whose status is not labelled unverified, leak or speculation.',
    reviewed: 'Human-reviewed, registry-defined, registry-linked or automated source-monitor relationships.',
    mentions: 'Weak textual mentions. These do not establish a substantive relationship.',
    all: 'All sourced relationships admitted to the graph.'
  },
  elements: { nodes, edges }
};

const graphPath = path.join(dataDir, 'evidence-network-map.json');
// This file is loaded directly by the browser and must stay below Cloudflare's
// single-asset ceiling. Compact defaults, duplicated metadata removal and omission
// of empty optional identifiers preserve every record, source and evidence field.
fs.writeFileSync(graphPath, JSON.stringify(graph));
const graphBytes = fs.statSync(graphPath).size;
const cloudflareTargetBytes = 24 * 1024 * 1024;

const csvRows = [[
  'relationship_id','from_id','from_name','from_type','relationship_type','to_id','to_name','to_type','source_title','source_url','date','publication_date','retrieval_date','evidence_grade','factual_status','review_status','extraction_method','confidence','what_is_established','what_is_not_established'
]];
for (const edge of edges) {
  const from = entityById.get(edge.data.source) || {};
  const to = entityById.get(edge.data.target) || {};
  csvRows.push([
    edge.data.id, edge.data.source, from.name || edge.data.source, from.type || '', edge.data.relationshipType,
    edge.data.target, to.name || edge.data.target, to.type || '', edge.data.sourceTitle, edge.data.sourceUrl,
    edge.data.date, edge.data.publicationDate, edge.data.retrievalDate, edge.data.grade, edge.data.factualStatus,
    edge.data.reviewStatus, edge.data.extractionMethod, edge.data.confidence, edge.data.establishes, edge.data.doesNotEstablish
  ]);
}
fs.writeFileSync(path.join(downloadsDir, 'evidence-network-map.csv'), csvRows.map(row => row.map(csvCell).join(',')).join('\n'));
fs.writeFileSync(path.join(downloadsDir, 'evidence-network-map-build.json'), JSON.stringify({
  ok: graphBytes <= cloudflareTargetBytes,
  generatedAt: graph.generatedAt,
  schemaVersion: graph.schemaVersion,
  totals: graph.totals,
  dateRange: graph.dateRange,
  publicRoute: 'evidence-network-map.html',
  dataRoute: 'data/evidence-network-map.json',
  csvRoute: 'downloads/evidence-network-map.csv',
  software: 'Cytoscape.js',
  serialization: 'compact-json',
  compaction: 'concise-default-boundaries-redundant-metadata-removal-and-empty-optional-id-omission',
  graphBytes,
  graphMiB: Number((graphBytes / 1024 / 1024).toFixed(2)),
  cloudflareTargetBytes,
  withinCloudflareTarget: graphBytes <= cloudflareTargetBytes,
  boundary: graph.boundary
}, null, 2));
if (graphBytes > cloudflareTargetBytes) {
  console.error(`Evidence network map exceeds the 24 MiB Cloudflare safety target: ${(graphBytes / 1024 / 1024).toFixed(2)} MiB.`);
  process.exit(1);
}
console.log(`Phase 5 evidence network built: ${graph.totals.entities} entities, ${graph.totals.relationships} sourced relationships, ${graph.totals.coreRelationships} core relationships; compact browser graph ${(graphBytes / 1024 / 1024).toFixed(2)} MiB.`);
