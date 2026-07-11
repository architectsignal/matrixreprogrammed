const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const schema = readJson(path.join(dataDir, 'investigation-entity-schema.json'), { entityTypes: {}, relationshipTypes: {} });
const registry = readJson(path.join(dataDir, 'investigation-source-registry.json'), { sources: [] });
const graph = readJson(path.join(dataDir, 'investigation-knowledge-graph.json'), { entities: [], relationships: [], findings: [], documents: [], missingRecords: [] });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function clean(value = '', max = 700) { const text = String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text; }
function normalise(value = '') { return clean(value, 300).toLowerCase().replace(/[’']/g, "'").replace(/\bthe\b/g, ' ').replace(/[^a-z0-9&.'-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function stableId(prefix, value) { return `${prefix}-${sha(value).slice(0, 20)}`; }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function csvCell(value) { const text = typeof value === 'string' ? value : JSON.stringify(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function evidenceKey(item = {}) { return [item.sourceId, item.sourceUrl, item.retrievalDate, item.factualStatus].join('|'); }
function mergeEntity(target, source) {
  target.aliases = unique([...(target.aliases || []), ...(source.aliases || []), ...(target.name !== source.name ? [source.name] : [])]).slice(0, 40);
  target.roles = unique([...(target.roles || []), ...(source.roles || [])]).slice(0, 40);
  target.identifiers = [...(target.identifiers || []), ...(source.identifiers || [])].filter((item, index, all) => item?.value && all.findIndex(other => other.type === item.type && String(other.value).toLowerCase() === String(item.value).toLowerCase()) === index).slice(0, 80);
  target.properties = { ...(target.properties || {}), ...(source.properties || {}) };
  for (const evidence of source.evidenceRefs || []) if (!(target.evidenceRefs || []).some(existing => evidenceKey(existing) === evidenceKey(evidence))) target.evidenceRefs.push(evidence);
  target.evidenceRefs = (target.evidenceRefs || []).slice(0, 60);
  target.firstSeen = [target.firstSeen, source.firstSeen].filter(Boolean).sort()[0] || null;
  target.lastSeen = [target.lastSeen, source.lastSeen].filter(Boolean).sort().pop() || null;
  if (source.reviewStatus === 'human-reviewed') target.reviewStatus = 'human-reviewed';
  return target;
}

const originalEntities = graph.entities || [];
const originalRelationships = graph.relationships || [];
const entityById = new Map(originalEntities.map(entity => [entity.id, entity]));
const contractorIds = new Set();
for (const relationship of originalRelationships) {
  if (relationship.type !== 'mentions') continue;
  const from = entityById.get(relationship.from);
  const to = entityById.get(relationship.to);
  if (!from || !to || to.type !== 'Company' || from.type !== 'Finding') continue;
  const context = `${from.name || ''} ${from.properties?.summary || ''} ${from.properties?.conclusion || ''} ${from.properties?.mechanism || ''}`;
  if (from.properties?.lane === 'money-contracts' && /\b(?:contract|procurement|award|grant|tender|vendor|supplier)\b/i.test(context)) contractorIds.add(to.id);
}

function refinedType(entity) {
  if (entity.type === 'Organization' && /\bfoundation\b/i.test(entity.name)) return 'Foundation';
  if ((entity.type === 'Organization' || entity.type === 'Company') && /\btrust\b/i.test(entity.name)) return 'Trust';
  if (entity.type === 'Organization' && /\b(?:department|commission|agency|office|committee|court|authority|administration|bureau|ministry|council|parliament|congress|senate|treasury|public prosecutor|inspector general)\b/i.test(entity.name)) return 'GovernmentAgency';
  if (entity.type === 'Company' && contractorIds.has(entity.id)) return 'Contractor';
  return entity.type;
}

const idMap = new Map();
const refinedMap = new Map();
for (const entity of originalEntities) {
  const type = refinedType(entity);
  const changesIdentity = type !== entity.type && /^entity-(?:organization|company)-/.test(entity.id);
  const id = changesIdentity ? stableId(`entity-${type.toLowerCase()}`, `${type}|${normalise(entity.name)}`) : entity.id;
  idMap.set(entity.id, id);
  const next = { ...entity, id, type, followTheMoneySchema: schema.entityTypes?.[type]?.followTheMoney || entity.followTheMoneySchema || 'Thing' };
  if (type !== entity.type) {
    next.roles = unique([...(next.roles || []), `refined-from-${entity.type.toLowerCase()}`]);
    next.properties = { ...(next.properties || {}), typeRefinement: 'context-and-name-rule', previousType: entity.type };
  }
  if (refinedMap.has(id)) mergeEntity(refinedMap.get(id), next); else refinedMap.set(id, { ...next, evidenceRefs: [...(next.evidenceRefs || [])] });
}

let relationships = originalRelationships.map(item => ({ ...item, from: idMap.get(item.from) || item.from, to: idMap.get(item.to) || item.to }));
const sourceEntityById = new Map([...refinedMap.values()].filter(entity => entity.type === 'Source').map(entity => [entity.properties?.sourceId || entity.id.replace(/^source-/, ''), entity]));
for (const source of registry.sources || []) {
  const sourceEntity = sourceEntityById.get(source.id) || refinedMap.get(`source-${source.id}`);
  if (!sourceEntity) continue;
  const operatorName = clean(String(source.label || source.id).split(/\s+[—–-]\s+/)[0], 240);
  const operatorType = source.authority === 'primary-official' ? 'GovernmentAgency' : 'Organization';
  const operatorId = stableId(`entity-${operatorType.toLowerCase()}`, `${operatorType}|${normalise(operatorName)}`);
  const evidence = sourceEntity.evidenceRefs?.[0] || {
    sourceId: source.id,
    sourceTitle: source.label || source.id,
    sourceUrl: source.url || '',
    publicationDate: null,
    retrievalDate: graph.generatedAt,
    evidenceGrade: source.authority === 'primary-official' ? 'B' : 'C',
    factualStatus: 'registered-source',
    establishes: 'The source registry identifies the named organisation as the publisher or operator of this source route.',
    doesNotEstablish: graph.evidenceBoundary,
    reviewStatus: 'registry-defined'
  };
  const operator = {
    id: operatorId,
    type: operatorType,
    followTheMoneySchema: schema.entityTypes?.[operatorType]?.followTheMoney || 'Organization',
    name: operatorName,
    aliases: [],
    roles: ['public-source-operator', source.authority || 'source-operator'],
    identifiers: source.url ? [{ type: 'source-url', value: source.url }] : [],
    properties: { sourceIds: [source.id], authority: source.authority || '', lane: source.lane || '' },
    evidenceRefs: [evidence],
    reviewStatus: 'registry-defined',
    firstSeen: graph.generatedAt,
    lastSeen: graph.generatedAt
  };
  if (refinedMap.has(operatorId)) {
    const existing = refinedMap.get(operatorId);
    mergeEntity(existing, operator);
    existing.properties.sourceIds = unique([...(existing.properties?.sourceIds || []), source.id]);
  } else refinedMap.set(operatorId, operator);
  relationships.push({
    id: stableId('relationship', `operatedBy|${sourceEntity.id}|${operatorId}|${source.id}`),
    type: 'operatedBy',
    from: sourceEntity.id,
    to: operatorId,
    label: 'operated or published by',
    date: evidence.retrievalDate,
    sourceRecordId: source.id,
    sourceId: evidence.sourceId,
    sourceTitle: evidence.sourceTitle,
    sourceUrl: evidence.sourceUrl,
    publicationDate: evidence.publicationDate || null,
    retrievalDate: evidence.retrievalDate,
    evidenceGrade: evidence.evidenceGrade,
    factualStatus: 'registered-source-operator',
    establishes: `The source registry identifies ${operatorName} as the named publisher or operator associated with this source route.`,
    doesNotEstablish: 'Operating or publishing a source does not establish wrongdoing, endorsement of every record, control of named subjects or responsibility for conduct described in individual documents.',
    reviewStatus: 'registry-defined',
    extractionMethod: 'registered-source-label',
    confidence: 1
  });
}

const entities = [...refinedMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
const entityIds = new Set(entities.map(entity => entity.id));
const relationshipMap = new Map();
for (const relationship of relationships) {
  if (!entityIds.has(relationship.from) || !entityIds.has(relationship.to)) continue;
  const key = [relationship.type, relationship.from, relationship.to, relationship.sourceRecordId || '', relationship.sourceId || '', relationship.sourceUrl || ''].join('|');
  if (!relationshipMap.has(key)) relationshipMap.set(key, relationship);
}
relationships = [...relationshipMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
const countsByType = Object.fromEntries(Object.keys(schema.entityTypes || {}).map(type => [type, entities.filter(entity => entity.type === type).length]));
const countsByRelationship = Object.fromEntries(Object.keys(schema.relationshipTypes || {}).map(type => [type, relationships.filter(item => item.type === type).length]));
const reviewCounts = entities.reduce((counts, entity) => { counts[entity.reviewStatus] = (counts[entity.reviewStatus] || 0) + 1; return counts; }, {});

graph.schemaVersion = schema.schemaVersion || graph.schemaVersion;
graph.refinedAt = new Date().toISOString();
graph.totals = { ...(graph.totals || {}), entities: entities.length, relationships: relationships.length };
graph.countsByType = countsByType;
graph.countsByRelationship = countsByRelationship;
graph.reviewCounts = reviewCounts;
graph.entities = entities;
graph.relationships = relationships;
writeJson(path.join(dataDir, 'investigation-knowledge-graph.json'), graph);
writeJson(path.join(dataDir, 'entity-registry.json'), { ok: true, schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt, refinedAt: graph.refinedAt, evidenceBoundary: graph.evidenceBoundary, totals: { entities: entities.length }, countsByType, reviewCounts, entities });
writeJson(path.join(dataDir, 'relationship-registry.json'), { ok: true, schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt, refinedAt: graph.refinedAt, evidenceBoundary: graph.evidenceBoundary, totals: { relationships: relationships.length }, countsByRelationship, relationships });

const entityCsv = [['id','type','follow_the_money_schema','name','aliases','roles','review_status','first_seen','last_seen','evidence_count'], ...entities.map(entity => [entity.id, entity.type, entity.followTheMoneySchema, entity.name, (entity.aliases || []).join(' | '), (entity.roles || []).join(' | '), entity.reviewStatus, entity.firstSeen || '', entity.lastSeen || '', (entity.evidenceRefs || []).length])];
const relationshipCsv = [['id','type','from','to','source_id','source_title','source_url','publication_date','retrieval_date','evidence_grade','factual_status','establishes','does_not_establish','review_status','extraction_method','confidence'], ...relationships.map(item => [item.id,item.type,item.from,item.to,item.sourceId,item.sourceTitle,item.sourceUrl,item.publicationDate || '',item.retrievalDate || '',item.evidenceGrade,item.factualStatus,item.establishes,item.doesNotEstablish,item.reviewStatus,item.extractionMethod,item.confidence])];
fs.writeFileSync(path.join(downloadsDir, 'investigation-entities.csv'), entityCsv.map(row => row.map(csvCell).join(',')).join('\n'));
fs.writeFileSync(path.join(downloadsDir, 'investigation-relationships.csv'), relationshipCsv.map(row => row.map(csvCell).join(',')).join('\n'));
const buildPath = path.join(downloadsDir, 'structured-investigation-data-build.json');
const build = readJson(buildPath, {});
writeJson(buildPath, { ...build, schemaVersion: graph.schemaVersion, refinedAt: graph.refinedAt, totals: graph.totals, countsByType, countsByRelationship, routes: unique([...(build.routes || []), 'relationship-registry.html']) });
console.log(`Structured type refinement complete: ${countsByType.GovernmentAgency || 0} agencies, ${countsByType.Contractor || 0} contractors, ${countsByType.Foundation || 0} foundations, ${countsByType.Trust || 0} trusts and ${countsByRelationship.operatedBy || 0} source-operator links.`);
