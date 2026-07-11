const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const reportsDir = path.join(root, 'scripts', 'reports');
const now = new Date().toISOString();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}
function countBy(values, key, declared = []) {
  const counts = Object.fromEntries(declared.map(name => [name, 0]));
  for (const value of values) {
    const name = String(value?.[key] || 'unknown');
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

const schemaPath = path.join(dataDir, 'investigation-entity-schema.json');
const graphPath = path.join(dataDir, 'investigation-knowledge-graph.json');
const entityPath = path.join(dataDir, 'entity-registry.json');
const relationshipPath = path.join(dataDir, 'relationship-registry.json');
const schema = readJson(schemaPath, { entityTypes: {}, relationshipTypes: {} });
const graph = readJson(graphPath, {});
const entityRegistry = readJson(entityPath, { entities: [] });
const relationshipRegistry = readJson(relationshipPath, { relationships: [] });
const entities = Array.isArray(entityRegistry) ? entityRegistry : (entityRegistry.entities || []);
const relationships = Array.isArray(relationshipRegistry) ? relationshipRegistry : (relationshipRegistry.relationships || []);
const findings = Array.isArray(graph.findings) ? graph.findings : [];
const documents = Array.isArray(graph.documents) ? graph.documents : [];
const missingRecords = Array.isArray(graph.missingRecords) ? graph.missingRecords : [];
const entityIds = new Set(entities.map(entity => entity.id));
const orphaned = relationships.filter(relationship => !entityIds.has(relationship.from) || !entityIds.has(relationship.to));
if (orphaned.length) throw new Error(`Cannot synchronize canonical graph: ${orphaned.length} relationship endpoint(s) are missing`);

const countsByType = countBy(entities, 'type', Object.keys(schema.entityTypes || {}));
const countsByRelationship = countBy(relationships, 'type', Object.keys(schema.relationshipTypes || {}));
const reviewCounts = countBy(entities, 'reviewStatus');
const evidenceBoundary = entityRegistry.evidenceBoundary || graph.evidenceBoundary || schema.evidenceBoundary || 'A structured public record does not establish guilt or wrongdoing beyond the cited source.';

const synchronizedGraph = {
  ...graph,
  ok: true,
  schemaVersion: schema.schemaVersion || graph.schemaVersion || '1.0.0',
  generatedAt: now,
  evidenceBoundary,
  totals: {
    entities: entities.length,
    relationships: relationships.length,
    findings: findings.length,
    documents: documents.length,
    missingRecords: missingRecords.length
  },
  countsByType,
  countsByRelationship,
  reviewCounts,
  entities,
  relationships,
  findings,
  documents,
  missingRecords
};
const synchronizedEntityRegistry = {
  ...(Array.isArray(entityRegistry) ? {} : entityRegistry),
  ok: true,
  schemaVersion: synchronizedGraph.schemaVersion,
  generatedAt: now,
  evidenceBoundary,
  totals: { entities: entities.length },
  countsByType,
  reviewCounts,
  entities
};
const synchronizedRelationshipRegistry = {
  ...(Array.isArray(relationshipRegistry) ? {} : relationshipRegistry),
  ok: true,
  schemaVersion: synchronizedGraph.schemaVersion,
  generatedAt: now,
  evidenceBoundary,
  totals: { relationships: relationships.length },
  countsByRelationship,
  relationships
};

writeJson(graphPath, synchronizedGraph);
writeJson(entityPath, synchronizedEntityRegistry);
writeJson(relationshipPath, synchronizedRelationshipRegistry);

fs.mkdirSync(downloadsDir, { recursive: true });
const entityCsv = [
  ['id','type','follow_the_money_schema','name','aliases','roles','review_status','first_seen','last_seen','evidence_count'],
  ...entities.map(entity => [
    entity.id,
    entity.type,
    entity.followTheMoneySchema,
    entity.name,
    entity.aliases || [],
    entity.roles || [],
    entity.reviewStatus,
    entity.firstSeen || '',
    entity.lastSeen || '',
    Array.isArray(entity.evidenceRefs) ? entity.evidenceRefs.length : 0
  ])
];
const relationshipCsv = [
  ['id','type','from','to','source_id','source_title','source_url','publication_date','retrieval_date','evidence_grade','factual_status','establishes','does_not_establish','review_status','extraction_method','confidence'],
  ...relationships.map(item => [
    item.id,
    item.type,
    item.from,
    item.to,
    item.sourceId,
    item.sourceTitle,
    item.sourceUrl,
    item.publicationDate || '',
    item.retrievalDate || '',
    item.evidenceGrade,
    item.factualStatus,
    item.establishes,
    item.doesNotEstablish,
    item.reviewStatus,
    item.extractionMethod,
    item.confidence
  ])
];
fs.writeFileSync(path.join(downloadsDir, 'investigation-entities.csv'), entityCsv.map(row => row.map(csvCell).join(',')).join('\n'));
fs.writeFileSync(path.join(downloadsDir, 'investigation-relationships.csv'), relationshipCsv.map(row => row.map(csvCell).join(',')).join('\n'));

writeJson(path.join(reportsDir, 'market-graph-sync-report.json'), {
  ok: true,
  generatedAt: now,
  totals: synchronizedGraph.totals,
  countsByType,
  countsByRelationship,
  orphanedRelationships: 0,
  synchronizedFiles: [
    'data/investigation-knowledge-graph.json',
    'data/entity-registry.json',
    'data/relationship-registry.json',
    'downloads/investigation-entities.csv',
    'downloads/investigation-relationships.csv'
  ],
  evidenceBoundary: 'Market-disclosure records are synchronized across all public graph outputs without changing their evidence grade or legal meaning.'
});
console.log(`Canonical graph synchronized: ${entities.length} entities and ${relationships.length} relationships.`);
