const fs = require('fs');
const path = require('path');

const root = process.cwd();
const graphPath = path.join(root, 'data', 'investigation-knowledge-graph.json');
const reportPath = path.join(root, 'downloads', 'cloudflare-oversized-graph-contract-patch.json');
const maximumBytes = 24 * 1024 * 1024;
if (!fs.existsSync(graphPath)) throw new Error('data/investigation-knowledge-graph.json is missing');

const originalText = fs.readFileSync(graphPath, 'utf8');
const originalBytes = Buffer.byteLength(originalText);
let compactBytes = originalBytes;
let compacted = false;
let projection = null;

function clean(value, max = 1000) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
}
function scalarProperties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (item === null || ['string','number','boolean'].includes(typeof item)) output[key] = typeof item === 'string' ? clean(item, 500) : item;
    else if (Array.isArray(item)) output[key] = item.slice(0, 12).map(entry => typeof entry === 'string' ? clean(entry, 300) : entry).filter(entry => entry === null || ['string','number','boolean'].includes(typeof entry));
  }
  return output;
}
function evidence(ref = {}) {
  return {
    sourceId: clean(ref.sourceId, 160), sourceTitle: clean(ref.sourceTitle, 240), sourceUrl: clean(ref.sourceUrl, 1000),
    publicationDate: ref.publicationDate || null, retrievalDate: ref.retrievalDate || null,
    evidenceGrade: clean(ref.evidenceGrade, 4), factualStatus: clean(ref.factualStatus, 120),
    establishes: clean(ref.establishes, 700), doesNotEstablish: clean(ref.doesNotEstablish, 700), reviewStatus: clean(ref.reviewStatus, 120)
  };
}
function entity(item = {}) {
  return {
    id: clean(item.id, 220), type: clean(item.type, 100), followTheMoneySchema: clean(item.followTheMoneySchema, 120), name: clean(item.name, 300),
    aliases: (item.aliases || []).slice(0, 20).map(value => clean(value, 220)).filter(Boolean),
    roles: (item.roles || []).slice(0, 20).map(value => clean(value, 160)).filter(Boolean),
    identifiers: (item.identifiers || []).slice(0, 20).map(identifier => ({ type: clean(identifier?.type, 100), value: clean(identifier?.value, 500) })).filter(identifier => identifier.value),
    properties: scalarProperties(item.properties), evidenceRefs: (item.evidenceRefs || []).slice(0, 3).map(evidence),
    reviewStatus: clean(item.reviewStatus, 120), firstSeen: item.firstSeen || null, lastSeen: item.lastSeen || null
  };
}
function relationship(item = {}) {
  return {
    id: clean(item.id, 220), type: clean(item.type, 100), from: clean(item.from, 220), to: clean(item.to, 220), label: clean(item.label, 180),
    date: item.date || null, sourceRecordId: item.sourceRecordId || null, sourceId: clean(item.sourceId, 160), sourceTitle: clean(item.sourceTitle, 240), sourceUrl: clean(item.sourceUrl, 1000),
    publicationDate: item.publicationDate || null, retrievalDate: item.retrievalDate || null, evidenceGrade: clean(item.evidenceGrade, 4), factualStatus: clean(item.factualStatus, 120),
    establishes: clean(item.establishes, 700), doesNotEstablish: clean(item.doesNotEstablish, 700), reviewStatus: clean(item.reviewStatus, 120),
    extractionMethod: clean(item.extractionMethod, 160), confidence: Number.isFinite(item.confidence) ? item.confidence : null
  };
}
function rankRelationship(item = {}) {
  const grade = String(item.evidenceGrade || '').toUpperCase();
  const gradeScore = ({ A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 })[grade] || 0;
  const reviewScore = /human-reviewed|registry-defined/i.test(item.reviewStatus || '') ? 5 : /machine-classified/i.test(item.reviewStatus || '') ? 2 : 0;
  return reviewScore * 100 + gradeScore * 10 + (item.sourceUrl ? 3 : 0) + (Number(item.confidence) || 0);
}

if (originalBytes > maximumBytes) {
  const graph = JSON.parse(originalText);
  const compactEntities = (graph.entities || []).map(entity);
  const compactRelationships = (graph.relationships || []).map(relationship).sort((a, b) => rankRelationship(b) - rankRelationship(a) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  let relationshipLimit = compactRelationships.length;
  let entityLimit = compactEntities.length;
  let candidateText = '';
  let candidate = null;

  function buildCandidate() {
    const selectedRelationships = compactRelationships.slice(0, relationshipLimit);
    const linked = new Set(selectedRelationships.flatMap(item => [item.from, item.to]));
    const prioritisedEntities = compactEntities.slice().sort((a, b) => {
      const aScore = (linked.has(a.id) ? 10 : 0) + (/human-reviewed|registry-defined/i.test(a.reviewStatus) ? 5 : 0) + (a.evidenceRefs.length ? 1 : 0);
      const bScore = (linked.has(b.id) ? 10 : 0) + (/human-reviewed|registry-defined/i.test(b.reviewStatus) ? 5 : 0) + (b.evidenceRefs.length ? 1 : 0);
      return bScore - aScore || a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    }).slice(0, entityLimit);
    const ids = new Set(prioritisedEntities.map(item => item.id));
    const validRelationships = selectedRelationships.filter(item => ids.has(item.from) && ids.has(item.to));
    candidate = {
      ok: true, schemaVersion: graph.schemaVersion || '1.0.0', generatedAt: graph.generatedAt || new Date().toISOString(),
      model: graph.model || 'Lightweight FollowTheMoney-compatible public-record graph',
      evidenceBoundary: graph.evidenceBoundary || 'A structured record does not by itself establish guilt or wrongdoing.',
      rules: graph.rules || [], totals: graph.totals || { entities: compactEntities.length, relationships: compactRelationships.length },
      countsByType: graph.countsByType || {}, countsByRelationship: graph.countsByRelationship || {}, reviewCounts: graph.reviewCounts || {},
      publicProjection: {
        compact: true, completeSourceTotalsPreserved: true, includedEntities: prioritisedEntities.length, includedRelationships: validRelationships.length,
        omittedHeavyArrays: ['findings','documents','missingRecords'], fullRegistries: ['/data/entity-registry.json','/data/relationship-registry.json'],
        compactNetwork: '/data/evidence-network-map.json', searchIndex: '/search-index.json',
        boundary: 'This deployment-safe projection preserves sourced entity and relationship records. Complete build-time arrays are not shipped as one oversized static asset.'
      },
      entities: prioritisedEntities, relationships: validRelationships, findings: [], documents: [], missingRecords: []
    };
    candidateText = JSON.stringify(candidate);
    return Buffer.byteLength(candidateText);
  }

  compactBytes = buildCandidate();
  while (compactBytes > maximumBytes && relationshipLimit > 1000) {
    relationshipLimit = Math.max(1000, Math.floor(relationshipLimit * 0.82));
    compactBytes = buildCandidate();
  }
  while (compactBytes > maximumBytes && entityLimit > 1000) {
    entityLimit = Math.max(1000, Math.floor(entityLimit * 0.82));
    compactBytes = buildCandidate();
  }
  if (compactBytes > maximumBytes) throw new Error(`Compact investigation graph remains too large for Cloudflare: ${(compactBytes / 1024 / 1024).toFixed(1)} MiB`);

  fs.writeFileSync(graphPath, candidateText);
  compacted = true;
  projection = candidate.publicProjection;
  if (!globalThis.__matrixInvestigationGraphRestoreRegistered) {
    globalThis.__matrixInvestigationGraphRestoreRegistered = true;
    process.once('exit', () => { try { fs.writeFileSync(graphPath, originalText); } catch {} });
  }
}

// This module is the final same-process owner immediately before build-cloudflare-output
// walks the source tree. Reapply the complete D1 Signal Board here so late generators
// cannot ship an older browser client or public-reading copy into _site.
const signalBoardModule = require.resolve('./patch-persistent-signal-board.js');
delete require.cache[signalBoardModule];
require(signalBoardModule);

// Normalize canonical and backwards-compatible status IDs after the full board repair.
const statusNormalizer = require.resolve('./normalize-signal-board-status-ids.js');
delete require.cache[statusNormalizer];
require(statusNormalizer);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true, generatedAt: new Date().toISOString(), compacted, sourceBytes: originalBytes, stagedBytes: compactBytes, maximumBytes,
  publicRoute: 'data/investigation-knowledge-graph.json', projection,
  companionArtifacts: ['data/evidence-network-map.json','data/entity-registry.json','data/relationship-registry.json','search-index.json','data/search-facets.json'],
  restoration: compacted ? 'Full build-time graph restored automatically when the current Node process exits.' : 'No restoration required.',
  signalBoardFinalOwnerApplied: true,
  signalBoardStatusIdsNormalized: true,
  boundary: 'The public route remains schema-compatible while the complete oversized graph stays build-time only. The Signal Board is re-owned by the D1 implementation immediately before Cloudflare asset copying.'
}, null, 2));
console.log(compacted
  ? `Cloudflare graph projection staged: ${(originalBytes / 1024 / 1024).toFixed(1)} MiB source -> ${(compactBytes / 1024 / 1024).toFixed(1)} MiB public projection; persistent Signal Board reapplied.`
  : `Cloudflare graph projection not required: ${(originalBytes / 1024 / 1024).toFixed(1)} MiB; persistent Signal Board reapplied.`);