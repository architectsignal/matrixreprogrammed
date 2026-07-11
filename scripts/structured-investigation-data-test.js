const fs = require('fs');
const path = require('path');

const root = process.cwd();
const schemaPath = path.join(root, 'data', 'investigation-entity-schema.json');
const graphPath = path.join(root, 'data', 'investigation-knowledge-graph.json');
const entityPath = path.join(root, 'data', 'entity-registry.json');
const relationshipPath = path.join(root, 'data', 'relationship-registry.json');
const searchPath = path.join(root, 'search-index.json');
const reportPath = path.join(root, 'downloads', 'structured-investigation-data-test.json');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
const schema = readJson(schemaPath, {});
const graph = readJson(graphPath, {});
const entityRegistry = readJson(entityPath, {});
const relationshipRegistry = readJson(relationshipPath, {});
const search = readJson(searchPath, []);
const failures = [];
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail: ok ? '' : detail }); if (!ok) failures.push({ name, detail }); }

const requiredEntityTypes = ['Person','Organization','Company','GovernmentAgency','Contractor','Foundation','Trust','Contract','Payment','Sanction','CourtCase','Investigation','Document','Finding','MissingRecord','Source','LegalAuthority','Decision','PublicGroup'];
const requiredRelationshipTypes = ['published','retrievedFrom','supports','mentions','subjectOf','affiliatedWith','owns','contractsWith','awardedTo','paid','sanctioned','partyTo','investigates','governedBy','decided','affects','overseenBy','missingFrom','changedAt','relatedTo'];
const requiredEvidenceFields = ['sourceId','sourceTitle','sourceUrl','retrievalDate','evidenceGrade','factualStatus','establishes','doesNotEstablish','reviewStatus'];
check('schema version present', /^\d+\.\d+\.\d+$/.test(String(schema.schemaVersion || '')), String(schema.schemaVersion || 'missing'));
check('all required entity types defined', requiredEntityTypes.every(type => schema.entityTypes?.[type]?.followTheMoney), JSON.stringify(requiredEntityTypes.filter(type => !schema.entityTypes?.[type]?.followTheMoney)));
check('all required relationship types defined', requiredRelationshipTypes.every(type => schema.relationshipTypes?.[type]), JSON.stringify(requiredRelationshipTypes.filter(type => !schema.relationshipTypes?.[type])));
check('required evidence fields declared', requiredEvidenceFields.every(field => (schema.requiredEvidenceFields || []).includes(field)), JSON.stringify(schema.requiredEvidenceFields || []));
check('graph generated successfully', graph.ok === true && Array.isArray(graph.entities) && Array.isArray(graph.relationships), JSON.stringify({ ok: graph.ok, entities: graph.entities?.length, relationships: graph.relationships?.length }));
check('graph totals match arrays', graph.totals?.entities === graph.entities?.length && graph.totals?.relationships === graph.relationships?.length, JSON.stringify(graph.totals || {}));
check('entity public feed matches graph', entityRegistry.entities?.length === graph.entities?.length, `${entityRegistry.entities?.length} vs ${graph.entities?.length}`);
check('relationship public feed matches graph', relationshipRegistry.relationships?.length === graph.relationships?.length, `${relationshipRegistry.relationships?.length} vs ${graph.relationships?.length}`);

const entityIds = new Set();
for (const entity of graph.entities || []) {
  check(`entity id present: ${entity.id || 'missing'}`, Boolean(entity.id), JSON.stringify(entity));
  check(`entity id unique: ${entity.id}`, !entityIds.has(entity.id), entity.id);
  entityIds.add(entity.id);
  check(`entity type valid: ${entity.id}`, Boolean(schema.entityTypes?.[entity.type]), entity.type);
  check(`entity name present: ${entity.id}`, Boolean(String(entity.name || '').trim()), entity.type);
  check(`FollowTheMoney mapping present: ${entity.id}`, Boolean(entity.followTheMoneySchema), entity.type);
  check(`entity review status present: ${entity.id}`, Boolean(entity.reviewStatus), entity.name);
  check(`entity evidence attached: ${entity.id}`, Array.isArray(entity.evidenceRefs) && entity.evidenceRefs.length > 0, entity.name);
  for (const evidence of entity.evidenceRefs || []) {
    const missing = ['sourceId','sourceTitle','retrievalDate','evidenceGrade','factualStatus','establishes','doesNotEstablish','reviewStatus'].filter(field => evidence[field] == null || evidence[field] === '');
    check(`entity evidence fields: ${entity.id}`, missing.length === 0, JSON.stringify(missing));
    check(`entity evidence grade valid: ${entity.id}`, /^[ABCD]$/.test(String(evidence.evidenceGrade || '')), evidence.evidenceGrade);
  }
}

const relationshipIds = new Set();
const strongTypes = new Set(['affiliatedWith','owns','contractsWith','awardedTo','paid','sanctioned','partyTo','investigates','governedBy','decided','affects','overseenBy']);
for (const relationship of graph.relationships || []) {
  check(`relationship id unique: ${relationship.id}`, !relationshipIds.has(relationship.id), relationship.id);
  relationshipIds.add(relationship.id);
  check(`relationship type valid: ${relationship.id}`, Boolean(schema.relationshipTypes?.[relationship.type]), relationship.type);
  check(`relationship source entity exists: ${relationship.id}`, entityIds.has(relationship.from), relationship.from);
  check(`relationship target entity exists: ${relationship.id}`, entityIds.has(relationship.to), relationship.to);
  const missing = requiredEvidenceFields.filter(field => relationship[field] == null || relationship[field] === '');
  check(`relationship evidence fields: ${relationship.id}`, missing.length === 0, JSON.stringify(missing));
  check(`relationship evidence grade valid: ${relationship.id}`, /^[ABCD]$/.test(String(relationship.evidenceGrade || '')), relationship.evidenceGrade);
  check(`relationship extraction method present: ${relationship.id}`, Boolean(relationship.extractionMethod), relationship.type);
  check(`relationship confidence bounded: ${relationship.id}`, Number(relationship.confidence) >= 0 && Number(relationship.confidence) <= 1, relationship.confidence);
  if (relationship.type === 'mentions') {
    check(`mention boundary explicit: ${relationship.id}`, /mention|does not|not establish|guilt|ownership|payment|coordination/i.test(String(relationship.doesNotEstablish || '')), relationship.doesNotEstablish);
  }
  if (strongTypes.has(relationship.type) && relationship.reviewStatus !== 'human-reviewed') {
    check(`strong relationship requires reviewed or exact source field: ${relationship.id}`, /official-structured-field|human-reviewed|exact-identifier/i.test(String(relationship.extractionMethod || '')), JSON.stringify({ type: relationship.type, reviewStatus: relationship.reviewStatus, extractionMethod: relationship.extractionMethod }));
  }
}

check('registered sources represented', (graph.countsByType?.Source || 0) > 0, JSON.stringify(graph.countsByType || {}));
check('findings represented', (graph.countsByType?.Finding || 0) > 0, JSON.stringify(graph.countsByType || {}));
if ((graph.documents || []).length > 0) {
  check('documents represented', (graph.countsByType?.Document || 0) > 0, JSON.stringify(graph.countsByType || {}));
  check('document provenance relationships represented', (graph.countsByRelationship?.retrievedFrom || 0) > 0, JSON.stringify(graph.countsByRelationship || {}));
}
if ((graph.missingRecords || []).length > 0) check('missing records represented', (graph.countsByType?.MissingRecord || 0) > 0, JSON.stringify(graph.countsByType || {}));
check('evidence boundary remains explicit', /does not|not convert|not establish/i.test(String(graph.evidenceBoundary || '')), graph.evidenceBoundary);
check('entity registry page generated', fs.existsSync(path.join(root, 'entity-registry.html')) && /ENTITY REGISTRY/.test(fs.readFileSync(path.join(root, 'entity-registry.html'), 'utf8')), 'entity-registry.html missing or incomplete');
check('relationship registry page generated', fs.existsSync(path.join(root, 'relationship-registry.html')) && /RELATIONSHIP REGISTRY/.test(fs.readFileSync(path.join(root, 'relationship-registry.html'), 'utf8')), 'relationship-registry.html missing or incomplete');
check('entity CSV generated', fs.existsSync(path.join(root, 'downloads', 'investigation-entities.csv')), 'entities CSV missing');
check('relationship CSV generated', fs.existsSync(path.join(root, 'downloads', 'investigation-relationships.csv')), 'relationships CSV missing');
check('entity registry indexed in search', Array.isArray(search) && search.some(item => item?.url === 'entity-registry.html'), 'entity registry search route missing');
check('relationship registry indexed in search', Array.isArray(search) && search.some(item => item?.url === 'relationship-registry.html'), 'relationship registry search route missing');
check('structured entity records indexed', Array.isArray(search) && search.some(item => item?.sourceType === 'structured-entity'), 'structured entity search entries missing');
const serializedPublic = JSON.stringify({ graph, entityRegistry, relationshipRegistry });
check('no raw document text exposed in graph', !/"(?:rawText|normalizedText|fullText|ocrText)"\s*:/i.test(serializedPublic), 'raw document text field exposed');
check('no credential-shaped fields exposed', !/"(?:apiKey|api_key|token|secret|password|authorization)"\s*:/i.test(serializedPublic), 'credential-shaped field exposed');

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), summary: { checks: checks.length, failures: failures.length, entities: graph.entities?.length || 0, relationships: graph.relationships?.length || 0 }, checks, failures };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (failures.length) {
  failures.slice(0, 40).forEach(item => console.error(`FAILED: ${item.name}: ${item.detail}`));
  process.exit(1);
}
