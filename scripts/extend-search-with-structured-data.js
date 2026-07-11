const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const graphPath = path.join(root, 'data', 'investigation-knowledge-graph.json');
const searchPagePath = path.join(root, 'search.html');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function terms(value = '', limit = 260) {
  return [...new Set(clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 1))].slice(0, limit);
}
function upsert(map, item) {
  const prior = map.get(item.url) || {};
  map.set(item.url, {
    ...prior,
    ...item,
    keywords: [...new Set([...(prior.keywords || []), ...(item.keywords || [])])],
    priority: Math.max(Number(prior.priority || 0), Number(item.priority || 0))
  });
}

let index = readJson(indexPath, []);
if (!Array.isArray(index)) index = [];
const graph = readJson(graphPath, { entities: [], relationships: [], totals: {}, countsByType: {} });
const map = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));

upsert(map, {
  url: 'entity-registry.html',
  title: 'Structured Investigation Entity Registry',
  category: 'Structured Investigation Data',
  layer: 'disclosure-black-files',
  description: 'People, organisations, companies, agencies, contractors, foundations, trusts, contracts, payments, sanctions, cases, investigations, documents, findings and missing records normalised into stable evidence-bounded records.',
  keywords: ['entity registry','structured investigation data','follow the money','people companies institutions contracts payments sanctions court cases investigations documents relationships aliases evidence grade missing records'],
  priority: 109,
  sourceType: 'structured-entity-registry'
});
upsert(map, {
  url: 'relationship-registry.html',
  title: 'Sourced Investigation Relationship Registry',
  category: 'Structured Investigation Data',
  layer: 'disclosure-black-files',
  description: 'Public relationships showing the source, date, evidence grade, factual status, review state, extraction method, what the record establishes and what it does not establish.',
  keywords: ['relationship registry','people institution company contract payment legal authority decision public oversight missing record relationship source evidence grade status'],
  priority: 108,
  sourceType: 'structured-relationship-registry'
});
upsert(map, {
  url: 'data/investigation-knowledge-graph.json',
  title: 'Structured Investigation Knowledge Graph JSON',
  category: 'Machine Data',
  layer: 'disclosure-black-files',
  description: 'Machine-readable typed entities, aliases, evidence references, findings, documents, missing records and sourced relationships.',
  keywords: ['knowledge graph json','entity relationship json','followthemoney','evidence graph','structured public records'],
  priority: 103,
  sourceType: 'json-feed'
});
upsert(map, {
  url: 'data/relationship-registry.json',
  title: 'Sourced Relationship Registry JSON',
  category: 'Machine Data',
  layer: 'disclosure-black-files',
  description: 'Machine-readable relationships with source URL, date, grade, factual status, what is established, what is not established, review state and extraction method.',
  keywords: ['relationship registry','source date evidence grade factual status establishes does not establish review status'],
  priority: 102,
  sourceType: 'json-feed'
});

const reviewWeight = {
  'human-reviewed': 18,
  'registry-defined': 14,
  'url-linked-unreviewed': 9,
  'machine-classified': 8,
  'machine-classified-unreviewed': 5,
  'unreviewed-source-document': 4,
  'machine-extracted-unreviewed': 1
};
const typeWeight = { GovernmentAgency: 15, Contractor: 15, Company: 14, Person: 14, Contract: 13, Payment: 13, CourtCase: 13, Sanction: 13, Investigation: 12, Foundation: 12, Trust: 12, Document: 11, MissingRecord: 11, Source: 9, Finding: 7 };

for (const entity of graph.entities || []) {
  if (!entity?.id || !entity?.name) continue;
  const identifiers = (entity.identifiers || []).map(item => `${item.type} ${item.value}`).join(' ');
  const evidence = (entity.evidenceRefs || []).map(item => `${item.sourceTitle || ''} ${item.sourceId || ''} ${item.factualStatus || ''} ${item.evidenceGrade || ''}`).join(' ');
  const description = `${entity.type} record · ${entity.reviewStatus}. ${(entity.roles || []).join(', ')}. ${entity.evidenceRefs?.[0]?.doesNotEstablish || graph.evidenceBoundary || ''}`;
  upsert(map, {
    url: `entity-registry.html#entity-${encodeURIComponent(entity.id)}`,
    title: entity.name,
    category: `Entity · ${entity.type}`,
    layer: 'disclosure-black-files',
    description: clean(description).slice(0, 700),
    keywords: terms(`${entity.name} ${(entity.aliases || []).join(' ')} ${(entity.roles || []).join(' ')} ${identifiers} ${evidence}`, 260),
    priority: 70 + Number(reviewWeight[entity.reviewStatus] || 0) + Number(typeWeight[entity.type] || 0),
    sourceType: 'structured-entity',
    entityType: entity.type,
    entityId: entity.id,
    reviewStatus: entity.reviewStatus,
    aliases: entity.aliases || [],
    evidenceGrade: entity.evidenceRefs?.[0]?.evidenceGrade || ''
  });
}

const finalIndex = [...map.values()].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title || '').localeCompare(String(b.title || '')));
fs.writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2));

if (fs.existsSync(searchPagePath)) {
  let html = fs.readFileSync(searchPagePath, 'utf8');
  html = html.replace('Search every investigation finding, government source, extracted document, person, institution, contract, filing, court record, leak, source change, missing file, book, briefing, or outcome.', 'Search every investigation finding, government source, extracted document, structured entity, alias, relationship, contract, payment, sanction, court record, leak, source change, missing file, book, briefing, or outcome.');
  if (!html.includes('data-q="entity registry people companies contracts payments cases"')) {
    html = html.replace('</div></section><section class="section wrap split">', '<button class="btn alt" data-q="entity registry people companies contracts payments cases">Entities & Relationships</button></div></section><section class="section wrap split">');
  }
  fs.writeFileSync(searchPagePath, html);
}

console.log(`Structured search extension complete: ${(graph.entities || []).length} entities indexed across ${finalIndex.length} public routes.`);
