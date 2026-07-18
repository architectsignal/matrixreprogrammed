const fs = require('fs');
const path = require('path');

const root = process.cwd();
const graphPath = path.join(root, 'data', 'investigation-knowledge-graph.json');
const reportPath = path.join(root, 'downloads', 'cloudflare-investigation-graph-projection.json');
const targetBytes = 23 * 1024 * 1024;
const hardLimitBytes = 25 * 1024 * 1024;

if (!fs.existsSync(graphPath)) throw new Error('data/investigation-knowledge-graph.json is missing');
const source = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
if (!source.ok || !Array.isArray(source.entities) || !Array.isArray(source.relationships)) {
  throw new Error('Investigation graph is malformed');
}

const profiles = [
  { id: 'balanced', aliases: 8, roles: 8, identifiers: 8, evidenceRefs: 2, title: 180, url: 500, text: 300, scalar: 120 },
  { id: 'compact', aliases: 6, roles: 6, identifiers: 6, evidenceRefs: 1, title: 160, url: 420, text: 240, scalar: 100 },
  { id: 'tight', aliases: 4, roles: 4, identifiers: 4, evidenceRefs: 1, title: 140, url: 320, text: 180, scalar: 84 },
  { id: 'minimum-safe', aliases: 3, roles: 3, identifiers: 3, evidenceRefs: 1, title: 120, url: 240, text: 140, scalar: 72 }
];

function clean(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trim()}…`;
}
function compactList(value, maxItems, maxChars) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, maxChars)).filter(Boolean))].slice(0, maxItems);
}
function compactIdentifiers(value, profile) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, profile.identifiers).map(item => ({
    type: clean(item?.type || 'identifier', profile.scalar),
    value: clean(item?.value || '', profile.title)
  })).filter(item => item.value);
}
function compactEvidence(ref, profile) {
  return {
    sourceId: clean(ref?.sourceId || 'unknown-source', profile.scalar),
    sourceTitle: clean(ref?.sourceTitle || 'Public source', profile.title),
    sourceUrl: clean(ref?.sourceUrl || 'about:blank', profile.url),
    publicationDate: ref?.publicationDate || null,
    retrievalDate: ref?.retrievalDate || source.generatedAt || new Date().toISOString(),
    evidenceGrade: clean(ref?.evidenceGrade || 'C', 2),
    factualStatus: clean(ref?.factualStatus || 'source-record', profile.scalar),
    establishes: clean(ref?.establishes || 'The cited source contains this record.', profile.text),
    doesNotEstablish: clean(ref?.doesNotEstablish || source.evidenceBoundary || 'This record does not establish guilt or wrongdoing.', profile.text),
    reviewStatus: clean(ref?.reviewStatus || 'unreviewed', profile.scalar)
  };
}
function compactEntity(entity, profile) {
  const refs = (Array.isArray(entity.evidenceRefs) ? entity.evidenceRefs : []).slice(0, profile.evidenceRefs).map(ref => compactEvidence(ref, profile));
  if (!refs.length) refs.push(compactEvidence({}, profile));
  return {
    id: entity.id,
    type: entity.type,
    followTheMoneySchema: entity.followTheMoneySchema || entity.type || 'Thing',
    name: clean(entity.name || entity.id, profile.title),
    aliases: compactList(entity.aliases, profile.aliases, profile.title),
    roles: compactList(entity.roles, profile.roles, profile.scalar),
    identifiers: compactIdentifiers(entity.identifiers, profile),
    reviewStatus: clean(entity.reviewStatus || 'unreviewed', profile.scalar),
    firstSeen: entity.firstSeen || null,
    lastSeen: entity.lastSeen || null,
    evidenceRefs: refs
  };
}
function compactRelationship(item, profile) {
  return {
    id: item.id,
    type: item.type,
    from: item.from,
    to: item.to,
    label: clean(item.label || item.type, profile.scalar),
    date: item.date || item.publicationDate || item.retrievalDate || null,
    sourceRecordId: item.sourceRecordId || '',
    sourceId: clean(item.sourceId || 'unknown-source', profile.scalar),
    sourceTitle: clean(item.sourceTitle || 'Public source', profile.title),
    sourceUrl: clean(item.sourceUrl || 'about:blank', profile.url),
    publicationDate: item.publicationDate || null,
    retrievalDate: item.retrievalDate || source.generatedAt || new Date().toISOString(),
    evidenceGrade: clean(item.evidenceGrade || 'C', 2),
    factualStatus: clean(item.factualStatus || 'source-record', profile.scalar),
    establishes: clean(item.establishes || 'The cited source records this relationship.', profile.text),
    doesNotEstablish: clean(item.doesNotEstablish || source.evidenceBoundary || 'This relationship does not establish guilt or wrongdoing.', profile.text),
    reviewStatus: clean(item.reviewStatus || 'unreviewed', profile.scalar),
    extractionMethod: clean(item.extractionMethod || 'structured-registry', profile.scalar),
    confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0
  };
}
function compactSummary(records, fields, limit = 10000) {
  return (Array.isArray(records) ? records : []).slice(0, limit).map(record => {
    const output = {};
    for (const field of fields) if (record?.[field] !== undefined && record?.[field] !== null) output[field] = record[field];
    return output;
  });
}
function build(profile) {
  const graph = {
    ok: true,
    schemaVersion: source.schemaVersion,
    generatedAt: source.generatedAt,
    model: source.model,
    evidenceBoundary: source.evidenceBoundary,
    rules: source.rules,
    totals: source.totals,
    countsByType: source.countsByType,
    countsByRelationship: source.countsByRelationship,
    reviewCounts: source.reviewCounts,
    deploymentProjection: {
      compact: true,
      profile: profile.id,
      completeEntityRegistry: 'data/entity-registry.json',
      completeRelationshipRegistry: 'data/relationship-registry.json',
      entityCsv: 'downloads/investigation-entities.csv',
      relationshipCsv: 'downloads/investigation-relationships.csv',
      boundary: 'This browser projection preserves every entity and relationship but shortens duplicated display metadata. Complete records remain in the linked registries and CSV exports.'
    },
    entities: source.entities.map(entity => compactEntity(entity, profile)),
    relationships: source.relationships.map(item => compactRelationship(item, profile)),
    findings: compactSummary(source.findings, ['id','entityId','title','status','evidenceGrade','sourceId','published','reviewStatus']),
    documents: compactSummary(source.documents, ['id','entityId','title','sha256','reviewStatus','evidenceGrade']),
    missingRecords: compactSummary(source.missingRecords, ['id','entityId','title','changeType','sourceId','detectedAt','evidenceGrade'])
  };
  const serialized = JSON.stringify(graph);
  return { graph, serialized, bytes: Buffer.byteLength(serialized), profile };
}

let selected;
for (const profile of profiles) {
  selected = build(profile);
  if (selected.bytes <= targetBytes) break;
}
if (!selected || selected.bytes > hardLimitBytes) {
  throw new Error(`Investigation graph projection remains too large: ${((selected?.bytes || 0) / 1024 / 1024).toFixed(2)} MiB`);
}
if (selected.graph.entities.length !== source.entities.length || selected.graph.relationships.length !== source.relationships.length) {
  throw new Error('Investigation graph projection lost entities or relationships');
}

fs.writeFileSync(graphPath, selected.serialized);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  profile: selected.profile.id,
  sourceBytes: Buffer.byteLength(JSON.stringify(source)),
  projectedBytes: selected.bytes,
  projectedMiB: Number((selected.bytes / 1024 / 1024).toFixed(2)),
  targetMiB: 23,
  hardLimitMiB: 25,
  entities: selected.graph.entities.length,
  relationships: selected.graph.relationships.length,
  completeEntityRegistry: 'data/entity-registry.json',
  completeRelationshipRegistry: 'data/relationship-registry.json'
}, null, 2)}\n`);
console.log(`Cloudflare investigation graph projection built: ${selected.graph.entities.length} entities, ${selected.graph.relationships.length} relationships, ${(selected.bytes / 1024 / 1024).toFixed(2)} MiB using ${selected.profile.id}.`);
