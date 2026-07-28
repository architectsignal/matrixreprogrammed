'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const policyPath = path.join(root, 'data', 'exposure-integrity-policy.json');
const HIT_START = '<!-- exposure-hit-list-route:start -->';
const HIT_END = '<!-- exposure-hit-list-route:end -->';
const DOSSIER_START = '<!-- exposure-dossier-route:start -->';
const DOSSIER_END = '<!-- exposure-dossier-route:end -->';

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}
function write(relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function copyToOutput(relative) {
  if (!fs.existsSync(outputRoot)) return;
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clean(value, maximum = 5000) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function esc(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normalize(value = '') {
  return clean(value, 1000).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(value = '') {
  return normalize(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'unnamed';
}
function unique(values) { return [...new Set(array(values).map(value => clean(value)).filter(Boolean))]; }
function absoluteUrl(value = '') { return /^https?:\/\//i.test(clean(value)); }
function internalRoute(value = '') { return clean(value).replace(/^\/+/, '').split('#')[0]; }
function routeExists(route) {
  const relative = internalRoute(route);
  if (!relative) return false;
  return [path.join(root, relative), path.join(outputRoot, relative)].some(file => fs.existsSync(file));
}
function replaceBlock(html, start, end, block) {
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (pattern.test(html)) return html.replace(pattern, block);
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return `${html}\n${block}\n`;
}
function patchFile(relative, transform) {
  for (const base of [root, outputRoot]) {
    if (base === outputRoot && !fs.existsSync(outputRoot)) continue;
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
}
function textTokens(values) {
  const stop = new Set(['and','the','for','with','from','into','that','this','route','profile','brief','public','record','records','power','active','priority','high']);
  return new Set(normalize(array(values).join(' ')).split(' ').filter(token => token.length >= 4 && !stop.has(token)));
}
function overlapScore(left, right) {
  let score = 0;
  for (const token of left) if (right.has(token)) score += token.length >= 8 ? 3 : 1;
  return score;
}
function classificationRank(value) {
  return ({
    fact_adjudicated: 1,
    fact_official_record: 2,
    fact_corroborated: 3,
    official_allegation: 4,
    attributed_allegation: 5,
    documented_association: 6,
    analytical_inference: 7,
    rumour: 8,
    speculation: 9,
    unsupported_or_debunked: 10
  })[value] || 99;
}
function classifyCriminal(record = {}) {
  const category = clean(record.category);
  if (category === 'conviction_final_judgment' || category === 'canonical_penal_judgment') return 'fact_adjudicated';
  if (category === 'charge_indictment_complaint' || category === 'investigation_inquiry') return 'official_allegation';
  if (category === 'civil_regulatory_action') return 'fact_official_record';
  if (category === 'substantiated_allegation') return 'attributed_allegation';
  if (category === 'suspected_conduct') return 'analytical_inference';
  if (category === 'rumor_speculation') return 'rumour';
  if (category === 'exculpatory_disposition') return 'fact_official_record';
  return 'speculation';
}
function classifyEpstein(record = {}) {
  const category = clean(record.category);
  if (category === 'adjudicated_co_conspirator') return 'fact_adjudicated';
  if (category === 'principal_subject' || category === 'institutional_financial_relationship') return 'fact_official_record';
  if (category === 'documented_contact' || category === 'released_file_mention') return 'documented_association';
  return 'speculation';
}
function classifyDark(claim = {}) {
  const label = normalize(claim.label);
  if (label.includes('public record fact')) return 'fact_corroborated';
  if (label.includes('public record adjacent')) return 'analytical_inference';
  if (label.includes('case specific')) return 'attributed_allegation';
  if (label.includes('unsupported')) return 'unsupported_or_debunked';
  if (label.includes('internet mythology') || label.includes('paranormal') || label.includes('symbolic occult')) return 'speculation';
  if (label.includes('control system hypothesis')) return 'analytical_inference';
  return 'rumour';
}
function primaryClassification(records) {
  return array(records).map(record => record.classification).sort((a, b) => classificationRank(a) - classificationRank(b))[0] || 'speculation';
}
function sourceFromRecord(record = {}) {
  return unique([record.sourceUrl, record.supportingSourceUrl, ...array(record.sourceUrls)]).filter(absoluteUrl);
}
function powerMechanismFor(entity) {
  const roles = array(entity.powerRoles).map(role => [role.title, role.organization, role.sector].filter(Boolean).join(' · '));
  if (roles.length) return roles.slice(0, 3).join(' | ');
  const notes = unique(entity.notes);
  if (notes.length) return notes.slice(0, 4).join(' · ');
  if (entity.layer) return clean(entity.layer).replace(/-/g, ' ');
  return 'Power mechanism requires further documentation.';
}
function plainReason(entity) {
  const records = array(entity.records);
  const best = records.slice().sort((a, b) => classificationRank(a.classification) - classificationRank(b.classification))[0];
  if (best) {
    const statement = clean(best.establishes || best.summary || best.claimText, 360);
    return statement || `${entity.name} has a mapped accountability record requiring reader review.`;
  }
  if (entity.nodeScore >= 90) return `${entity.name} is a high-connectivity power node with documented institutional, capital, policy or operational relevance.`;
  return `${entity.name} is mapped because of documented power relevance or an unresolved evidence question.`;
}
function priorityBand(entity) {
  const classifications = new Set(array(entity.records).map(record => record.classification));
  const childHarm = array(entity.records).some(record => /child|minor|traffick|groom|sexual abuse/i.test(`${record.title} ${record.summary} ${array(record.conductDomains).join(' ')}`));
  if (childHarm && classifications.has('fact_adjudicated')) return { code: 'A', label: 'Immediate documented accountability' };
  if (classifications.has('fact_adjudicated') && (entity.powerRoles.length || entity.nodeScore >= 60)) return { code: 'A', label: 'Documented accountability' };
  if (classifications.has('official_allegation') || classifications.has('fact_official_record')) return { code: 'B', label: 'High-priority record review' };
  if (entity.nodeScore >= 90 || classifications.has('documented_association')) return { code: 'B', label: 'Power and access review' };
  if (classifications.has('attributed_allegation') || classifications.has('analytical_inference')) return { code: 'C', label: 'Claim under investigation' };
  return { code: 'D', label: 'Research and provenance queue' };
}

if (!fs.existsSync(policyPath)) throw new Error('Missing data/exposure-integrity-policy.json');
const policy = readJson('data/exposure-integrity-policy.json');
const graph = readJson('data/evidence-weighted-relationship-graph.json', { nodes: [], edges: [] });
const clocksSource = readJson('data/clock-wall.json', readJson('data/global-risk-clocks.json', { clocks: [] }));
const criminal = readJson('data/criminal-conduct-registry.json', { subjects: {}, categories: {} });
const epstein = readJson('data/epstein-relationship-registry.json', { subjects: {}, categories: {} });
const dark = readJson('data/dark-speculation-claims.json', { claims: [] });
const clockItems = array(clocksSource.clocks || clocksSource.items || clocksSource.timers);
const clockSearch = clockItems.map(clock => ({
  clock,
  tokens: textTokens([clock.title, clock.category, clock.signals, clock.readerQuestion, ...array(clock.keywords), clock.controlSystemMeaning]),
  route: `timers.html${clock.slug ? `#${esc(clock.slug)}` : ''}`
}));

const entities = new Map();
function ensureEntity(key, input = {}) {
  const id = slug(key || input.name || input.title);
  if (!entities.has(id)) entities.set(id, {
    id,
    name: clean(input.name || input.title || key) || id,
    entityType: clean(input.entityType || input.subjectType || input.type || 'entity'),
    layer: clean(input.layer),
    nodeScore: Number(input.score || 0),
    notes: unique(input.notes),
    aliases: unique(input.aliases),
    powerRoles: array(input.powerRoles),
    records: [],
    dossierRoutes: unique([input.route, input.dossierRoute, ...array(input.dossierRoutes)]),
    sourceRoutes: [],
    missingRecords: [],
    graphEdges: []
  });
  const entity = entities.get(id);
  entity.nodeScore = Math.max(entity.nodeScore, Number(input.score || 0));
  entity.notes = unique([...entity.notes, ...array(input.notes)]);
  entity.aliases = unique([...entity.aliases, ...array(input.aliases)]);
  entity.powerRoles = [...entity.powerRoles, ...array(input.powerRoles)];
  entity.dossierRoutes = unique([...entity.dossierRoutes, input.route, input.dossierRoute, ...array(input.dossierRoutes)]);
  return entity;
}

for (const node of array(graph.nodes)) ensureEntity(node.id || node.name, node);

const ledger = [];
const sensitiveFailures = [];
for (const [key, subject] of Object.entries(object(criminal.subjects))) {
  const entity = ensureEntity(key, subject);
  for (const record of array(subject.records)) {
    if (record.publicationStatus !== 'approved') continue;
    const classification = classifyCriminal(record);
    const sources = sourceFromRecord(record);
    const normalized = {
      recordId: clean(record.id || `${key}-${slug(record.title)}`),
      classification,
      title: clean(record.title),
      summary: clean(record.summary, 1200),
      establishes: clean(record.established || record.summary, 1200),
      doesNotEstablish: clean(record.counterEvidence || record.boundary, 1200),
      rightOfReply: clean(record.rightOfReply, 1000),
      counterEvidence: clean(record.counterEvidence, 1000),
      missingEvidence: clean(record.proofNeeded, 1000),
      date: clean(record.date),
      lastChecked: clean(record.lastChecked),
      evidenceGrade: clean(record.evidenceGrade),
      conductDomains: array(record.conductDomains),
      sourceRoutes: sources,
      origin: 'criminal-conduct-registry'
    };
    entity.records.push(normalized);
    entity.sourceRoutes = unique([...entity.sourceRoutes, ...sources]);
    entity.missingRecords = unique([...entity.missingRecords, record.proofNeeded]);
    ledger.push({ entityId: entity.id, entityName: entity.name, ...normalized });
    if (/child|minor|traffick|groom|sexual/i.test(`${record.title} ${array(record.conductDomains).join(' ')}`)) {
      for (const field of ['rightOfReply', 'counterEvidence', 'proofNeeded', 'boundary', 'lastChecked', 'sourceUrl']) {
        if (!clean(record[field])) sensitiveFailures.push(`${entity.name}/${normalized.recordId} missing ${field}`);
      }
    }
  }
}

for (const [key, subject] of Object.entries(object(epstein.subjects))) {
  const entity = ensureEntity(key, subject);
  for (const record of array(subject.records)) {
    if (record.publicationStatus !== 'approved') continue;
    const classification = classifyEpstein(record);
    const sources = sourceFromRecord(record);
    const normalized = {
      recordId: clean(record.id || `${key}-${slug(record.title)}`),
      classification,
      title: clean(record.title),
      summary: clean(record.summary, 1200),
      establishes: clean(record.established || record.summary, 1200),
      doesNotEstablish: clean(record.notEstablished, 1200),
      rightOfReply: clean(record.rightOfReply, 1000),
      counterEvidence: clean(record.notEstablished, 1000),
      missingEvidence: unique(record.nextRecords).join(' | '),
      date: clean(record.dateRange),
      lastChecked: clean(record.lastChecked),
      evidenceGrade: clean(record.evidenceGrade),
      sourceRoutes: sources,
      origin: 'epstein-relationship-registry'
    };
    entity.records.push(normalized);
    entity.sourceRoutes = unique([...entity.sourceRoutes, ...sources]);
    entity.missingRecords = unique([...entity.missingRecords, ...array(record.nextRecords)]);
    ledger.push({ entityId: entity.id, entityName: entity.name, ...normalized });
  }
}

const darkClaims = [];
for (const claim of array(dark.claims)) {
  const classification = classifyDark(claim);
  const id = `claim-${slug(claim.slug || claim.title)}`;
  const record = {
    recordId: id,
    classification,
    title: clean(claim.title),
    summary: clean((array(claim.keywords).slice(0, 5).join(' · ') || claim.title), 800),
    establishes: classification === 'fact_corroborated' ? 'The underlying subject has a documented public-record lane; each case still requires its own evidence.' : 'The claim is publicly circulated or retained as an investigative hypothesis.',
    doesNotEstablish: clean(claim.boundary || 'The existence of a claim does not establish that it is true.', 1000),
    rightOfReply: 'No named-person finding is created by this claim card.',
    counterEvidence: clean(claim.boundary || 'Alternative explanations and counter-sources must be examined.', 1000),
    missingEvidence: 'Original source, authenticated records, named witnesses where lawful, physical or documentary evidence, independent corroboration and falsification testing.',
    date: clean(dark.updated),
    lastChecked: clean(dark.updated),
    evidenceGrade: classification === 'fact_corroborated' ? 'case-specific' : 'unproven',
    sourceRoutes: [],
    origin: 'dark-speculation-claims'
  };
  darkClaims.push({
    id,
    name: clean(claim.title),
    entityType: 'claim under test',
    records: [record],
    category: clean(claim.category),
    notes: unique(claim.keywords),
    boundary: clean(claim.boundary),
    dossierRoutes: ['dark-speculation-lab.html'],
    sourceRoutes: [],
    missingRecords: [record.missingEvidence],
    nodeScore: 0,
    powerRoles: [],
    graphEdges: []
  });
  ledger.push({ entityId: id, entityName: clean(claim.title), ...record });
}

const unresolvedEdges = [];
for (const edge of array(graph.edges)) {
  const from = ensureEntity(edge.from || 'unknown-from', { name: edge.from || 'Unknown source node' });
  const to = ensureEntity(edge.to || 'unknown-to', { name: edge.to || 'Unknown target node' });
  const sources = unique([edge.sourceUrl, ...array(edge.sourceUrls), ...array(edge.sourceIds)]).filter(Boolean);
  const directSource = sources.some(absoluteUrl) || array(edge.sourceIds).length > 0;
  const normalized = {
    from: from.id,
    to: to.id,
    type: clean(edge.type || edge.relationshipType || 'relationship'),
    weight: Number(edge.weight || 0),
    evidenceGrade: clean(edge.evidenceGrade || edge.grade || 'ungraded'),
    boundary: clean(edge.evidenceBoundary || edge.boundary),
    sourceRoutes: sources.filter(absoluteUrl),
    provenanceStatus: directSource ? 'source-linked' : 'provenance-missing'
  };
  from.graphEdges.push(normalized);
  to.graphEdges.push(normalized);
  if (!directSource) unresolvedEdges.push(normalized);
}

function timerRoutesFor(entity) {
  const recordText = array(entity.records).flatMap(record => [record.title, record.summary, record.establishes, ...array(record.conductDomains)]);
  const tokens = textTokens([entity.name, entity.layer, ...entity.notes, ...entity.aliases, powerMechanismFor(entity), ...recordText]);
  return clockSearch
    .map(item => ({ route: item.route, title: clean(item.clock.title || item.clock.name || item.clock.slug || 'Risk clock'), score: overlapScore(tokens, item.tokens), clockScore: Number(item.clock.score || 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.clockScore - a.clockScore)
    .slice(0, 4);
}

const allEntities = [...entities.values(), ...darkClaims];
const hitList = allEntities.map(entity => {
  const priority = priorityBand(entity);
  const timers = timerRoutesFor(entity);
  const classification = primaryClassification(entity.records);
  const facts = array(entity.records).filter(record => /^fact_/.test(record.classification));
  const allegations = array(entity.records).filter(record => ['official_allegation','attributed_allegation'].includes(record.classification));
  const hypotheses = array(entity.records).filter(record => ['analytical_inference','rumour','speculation','unsupported_or_debunked'].includes(record.classification));
  const doesNotProve = unique(array(entity.records).map(record => record.doesNotEstablish || record.counterEvidence)).slice(0, 4);
  const routes = unique(entity.dossierRoutes).filter(route => route && !/^https?:/i.test(route));
  return {
    id: entity.id,
    name: entity.name,
    entityType: entity.entityType,
    priorityCode: priority.code,
    priorityLabel: priority.label,
    primaryClassification: classification,
    primaryClassificationLabel: policy.classificationLanes?.[classification]?.label || classification,
    plainEnglishReason: plainReason(entity),
    powerMechanism: powerMechanismFor(entity),
    documentedEvidence: facts.slice(0, 4).map(record => ({ title: record.title, establishes: record.establishes || record.summary, sourceRoutes: record.sourceRoutes })),
    allegationsOrHypotheses: [...allegations, ...hypotheses].slice(0, 4).map(record => ({ classification: record.classification, title: record.title, boundary: record.doesNotEstablish })),
    doesNotProve: doesNotProve.length ? doesNotProve : ['Inclusion does not establish guilt, coordination, shared motive or criminal conduct.'],
    missingRecords: unique(entity.missingRecords).slice(0, 6),
    dossierRoutes: routes,
    timerRoutes: timers,
    sourceRoutes: unique(entity.sourceRoutes).slice(0, 8),
    unresolvedRelationshipCount: array(entity.graphEdges).filter(edge => edge.provenanceStatus === 'provenance-missing').length,
    lastReviewed: unique(array(entity.records).map(record => record.lastChecked || record.date)).sort().reverse()[0] || null
  };
}).filter(entry => entry.dossierRoutes.length || entry.timerRoutes.length || entry.documentedEvidence.length || entry.allegationsOrHypotheses.length)
  .sort((a, b) => a.priorityCode.localeCompare(b.priorityCode) || classificationRank(a.primaryClassification) - classificationRank(b.primaryClassification) || a.name.localeCompare(b.name));

const orphanDossierRoutes = unique(hitList.flatMap(entry => entry.dossierRoutes)).filter(route => !routeExists(route));
const entriesWithoutAction = hitList.filter(entry => !entry.dossierRoutes.length && !entry.timerRoutes.length && !entry.sourceRoutes.length);
const integrity = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  title: policy.title,
  boundary: policy.hitListBoundary,
  summary: {
    evidenceLedgerEntries: ledger.length,
    hitListEntries: hitList.length,
    graphNodes: array(graph.nodes).length,
    graphEdges: array(graph.edges).length,
    unresolvedGraphEdges: unresolvedEdges.length,
    sensitiveRecordFailures: sensitiveFailures.length,
    orphanDossierRoutes: orphanDossierRoutes.length,
    entriesWithoutAction: entriesWithoutAction.length,
    clocksAvailable: clockItems.length
  },
  criticalFailures: sensitiveFailures,
  improvements: [
    unresolvedEdges.length ? `${unresolvedEdges.length} graph edges remain in the provenance-restoration queue and cannot be used as facts or timer triggers.` : '',
    orphanDossierRoutes.length ? `${orphanDossierRoutes.length} dossier route(s) referenced by source registries are not present in the current build.` : '',
    entriesWithoutAction.length ? `${entriesWithoutAction.length} Hit List entry or entries lack a dossier, timer or source action.` : ''
  ].filter(Boolean),
  orphanDossierRoutes,
  unresolvedEdgeSample: unresolvedEdges.slice(0, 50),
  operatingRule: 'Facts require evidence. Allegations remain allegations. Rumours remain rumours. Speculation remains speculation. Proximity is mapped but never converted into guilt.'
};
integrity.ok = integrity.criticalFailures.length === 0 && entriesWithoutAction.length === 0;

const hitPayload = {
  schemaVersion: 1,
  generatedAt: integrity.generatedAt,
  title: 'The Investigative Hit List',
  subtitle: 'Power. Evidence. Missing records. Next move.',
  boundary: policy.hitListBoundary,
  classificationLanes: policy.classificationLanes,
  count: hitList.length,
  entries: hitList
};

write('data/exposure-evidence-ledger.json', `${JSON.stringify({ schemaVersion: 1, generatedAt: integrity.generatedAt, count: ledger.length, entries: ledger }, null, 2)}\n`);
write('data/exposure-integrity-engine.json', `${JSON.stringify(integrity, null, 2)}\n`);
write('data/cinematic-hit-list.json', `${JSON.stringify(hitPayload, null, 2)}\n`);
write('downloads/exposure-integrity-report.json', `${JSON.stringify(integrity, null, 2)}\n`);
write('downloads/exposure-integrity-report.md', `# Exposure Integrity Engine\n\nGenerated: ${integrity.generatedAt}\n\n**Status:** ${integrity.ok ? 'PASS' : 'FAIL'}\n\n**Operating rule:** ${integrity.operatingRule}\n\n## Coverage\n\n- Evidence ledger entries: ${integrity.summary.evidenceLedgerEntries}\n- Hit List entries: ${integrity.summary.hitListEntries}\n- Graph nodes: ${integrity.summary.graphNodes}\n- Graph edges: ${integrity.summary.graphEdges}\n- Unresolved graph provenance: ${integrity.summary.unresolvedGraphEdges}\n- Sensitive-record failures: ${integrity.summary.sensitiveRecordFailures}\n- Orphan dossier routes: ${integrity.summary.orphanDossierRoutes}\n- Clocks available: ${integrity.summary.clocksAvailable}\n\n## Improvements\n\n${integrity.improvements.length ? integrity.improvements.map(item => `- ${item}`).join('\n') : '- No critical integrity improvements identified by this run.'}\n`);

function links(items, empty) {
  return items.length ? items.map(item => `<a href="${esc(typeof item === 'string' ? item : item.route)}">${esc(typeof item === 'string' ? item : item.title)}</a>`).join('') : `<span>${esc(empty)}</span>`;
}
function evidenceCards(items) {
  if (!items.length) return '<p class="empty">No approved fact record is mapped yet. Open the dossier or missing-record route before drawing a conclusion.</p>';
  return items.map(item => `<article class="evidence"><h4>${esc(item.title)}</h4><p>${esc(item.establishes)}</p><div class="link-row">${links(item.sourceRoutes || [], 'Source route pending')}</div></article>`).join('');
}
function hypothesisCards(items) {
  if (!items.length) return '<p class="empty">No allegation or hypothesis is currently attached to this entry.</p>';
  return items.map(item => `<article class="hypothesis"><span>${esc(policy.classificationLanes?.[item.classification]?.label || item.classification)}</span><h4>${esc(item.title)}</h4><p>${esc(item.boundary || 'Not established as fact.')}</p></article>`).join('');
}
function hitCard(entry) {
  const hay = normalize([entry.name, entry.entityType, entry.primaryClassificationLabel, entry.priorityLabel, entry.powerMechanism, entry.plainEnglishReason].join(' '));
  return `<article class="hit-card" data-hit-card data-search="${esc(hay)}" data-priority="${esc(entry.priorityCode)}" data-classification="${esc(entry.primaryClassification)}" data-type="${esc(normalize(entry.entityType))}"><header><div><span class="priority">PRIORITY ${esc(entry.priorityCode)} · ${esc(entry.priorityLabel)}</span><h2>${esc(entry.name)}</h2><p class="classification">${esc(entry.primaryClassificationLabel)} · ${esc(entry.entityType)}</p></div><div class="pulse" aria-hidden="true"></div></header><p class="reason">${esc(entry.plainEnglishReason)}</p><dl><div><dt>Power mechanism</dt><dd>${esc(entry.powerMechanism)}</dd></div><div><dt>Unresolved graph routes</dt><dd>${entry.unresolvedRelationshipCount}</dd></div><div><dt>Last reviewed</dt><dd>${esc(entry.lastReviewed || 'Review date pending')}</dd></div></dl><details open><summary>What is documented</summary>${evidenceCards(entry.documentedEvidence)}</details><details><summary>Allegations, rumours and hypotheses</summary>${hypothesisCards(entry.allegationsOrHypotheses)}</details><details><summary>What this does not prove</summary><ul>${entry.doesNotProve.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details><details><summary>Missing records</summary><ul>${entry.missingRecords.length ? entry.missingRecords.map(item => `<li>${esc(item)}</li>`).join('') : '<li>No specific missing record is currently mapped.</li>'}</ul></details><div class="route-grid"><div><strong>Open dossier</strong>${links(entry.dossierRoutes, 'Dossier route pending')}</div><div><strong>Follow timers</strong>${links(entry.timerRoutes, 'No matching timer yet')}</div><div><strong>Verify sources</strong>${links(entry.sourceRoutes, 'Use the Evidence Vault')}</div></div></article>`;
}

const classificationOptions = Object.entries(policy.classificationLanes || {}).map(([key, item]) => `<option value="${esc(key)}">${esc(item.label)}</option>`).join('');
const typeOptions = unique(hitList.map(entry => normalize(entry.entityType))).sort().map(value => `<option value="${esc(value)}">${esc(value.replace(/\b\w/g, letter => letter.toUpperCase()))}</option>`).join('');
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>The Investigative Hit List | Matrix Reprogrammed</title><meta name="description" content="A cinematic, evidence-classified entry point into Matrix Reprogrammed dossiers, risk clocks, public records, allegations, rumours and unresolved evidence gaps."><link rel="stylesheet" href="styles.css"><style>:root{color-scheme:dark}.hit-hero{min-height:72vh;display:grid;align-content:center;position:relative;overflow:hidden}.hit-hero:before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(190,20,20,.22),transparent 36%),linear-gradient(180deg,transparent,rgba(0,0,0,.78));pointer-events:none}.hit-hero>*{position:relative}.hit-hero h1{font-size:clamp(3.2rem,10vw,8.5rem);line-height:.84;letter-spacing:-.07em;margin:.3rem 0}.hit-hero .lead{max-width:850px}.boundary{border:1px solid rgba(255,85,85,.55);background:rgba(100,0,0,.18);padding:1rem;border-radius:14px}.hit-controls{position:sticky;top:0;z-index:10;background:rgba(2,2,5,.94);backdrop-filter:blur(12px);border-block:1px solid rgba(255,255,255,.12);padding:1rem 0}.filter-grid{display:grid;grid-template-columns:2fr repeat(3,minmax(150px,1fr));gap:.7rem}.filter-grid input,.filter-grid select{width:100%;box-sizing:border-box;padding:.8rem;background:#09090d;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:8px}.hit-count{font-weight:900;letter-spacing:.08em;margin:.7rem 0 0}.hit-card{border:1px solid rgba(255,68,68,.34);background:linear-gradient(150deg,rgba(20,8,10,.96),rgba(4,4,8,.98));padding:clamp(1rem,3vw,2rem);margin:1rem 0;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.34)}.hit-card header{display:flex;justify-content:space-between;gap:1rem}.hit-card h2{font-size:clamp(1.8rem,5vw,3.5rem);margin:.25rem 0}.priority,.classification,.hypothesis span{font-size:.73rem;text-transform:uppercase;letter-spacing:.12em}.priority{color:#ff7676}.classification{opacity:.78}.pulse{width:18px;height:18px;border:2px solid #ff5050;border-radius:50%;box-shadow:0 0 0 0 rgba(255,80,80,.5);animation:pulse 2s infinite}@keyframes pulse{70%{box-shadow:0 0 0 18px rgba(255,80,80,0)}}.reason{font-size:1.12rem;max-width:900px}.hit-card dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.hit-card dl div,.evidence,.hypothesis,.route-grid>div{border:1px solid rgba(255,255,255,.12);padding:.8rem;border-radius:10px;background:rgba(255,255,255,.025)}.hit-card dt{font-size:.72rem;text-transform:uppercase;opacity:.65}.hit-card dd{margin:.25rem 0 0}.hit-card details{margin-top:.8rem;border-top:1px solid rgba(255,255,255,.12);padding-top:.8rem}.hit-card summary{cursor:pointer;font-weight:900}.evidence,.hypothesis{margin:.6rem 0}.route-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.7rem;margin-top:1rem}.route-grid strong{display:block;margin-bottom:.5rem}.link-row,.route-grid>div{display:grid;gap:.4rem}.link-row a,.route-grid a{color:#ffd1d1}.empty{opacity:.72}.hidden{display:none!important}@media(max-width:760px){.filter-grid{grid-template-columns:1fr}.hit-card header{display:block}.pulse{margin-top:.8rem}.hit-controls{position:static}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="hit-list.html" aria-current="page">Hit List</a><a href="timers.html">Timers</a><a href="subject-index.html">Dossiers</a><a href="predators-in-power.html">Predators in Power</a><a href="dark-speculation-lab.html">Dark Files</a><a href="source-document-vault.html">Sources</a></nav></header><main><section class="hero wrap hit-hero"><div class="eyebrow">Cinematic Investigation Entry Point</div><h1>THE HIT<br>LIST.</h1><p class="lead">Power. Evidence. Missing records. Next move. Every entry routes into the dossiers, timers and source trails that explain what is documented, what is alleged and what remains unproven.</p><div class="cta-row"><a class="btn" href="#hit-list">Enter the list</a><a class="btn alt" href="downloads/exposure-integrity-report.json">Integrity report</a><a class="btn alt" href="data/exposure-evidence-ledger.json">Evidence ledger</a></div></section><section class="section wrap"><div class="boundary"><h2>Investigative priority—not guilt</h2><p>${esc(policy.hitListBoundary)}</p><p><strong>Operating rule:</strong> Facts require evidence. Allegations remain allegations. Rumours remain rumours. Speculation remains speculation.</p></div></section><section class="hit-controls"><div class="wrap"><div class="filter-grid"><input id="hit-search" type="search" placeholder="Search a person, institution, mechanism or claim" aria-label="Search Hit List"><select id="hit-priority" aria-label="Filter by priority"><option value="">All priorities</option><option value="A">Priority A</option><option value="B">Priority B</option><option value="C">Priority C</option><option value="D">Priority D</option></select><select id="hit-classification" aria-label="Filter by evidence classification"><option value="">All evidence lanes</option>${classificationOptions}</select><select id="hit-type" aria-label="Filter by entity type"><option value="">All entity types</option>${typeOptions}</select></div><p id="hit-count" class="hit-count">${hitList.length} investigative entries</p></div></section><section id="hit-list" class="section wrap">${hitList.map(hitCard).join('')}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, conclusion bounded.</p><p><a href="corrections.html">Corrections and right of reply</a> · <a href="forum.html">Submit a source</a></p></footer></div><script src="matrix.js"></script><script>(()=>{const cards=[...document.querySelectorAll('[data-hit-card]')];const search=document.getElementById('hit-search');const priority=document.getElementById('hit-priority');const classification=document.getElementById('hit-classification');const type=document.getElementById('hit-type');const count=document.getElementById('hit-count');function apply(){const q=(search.value||'').toLowerCase().trim();let shown=0;for(const card of cards){const ok=(!q||card.dataset.search.includes(q))&&(!priority.value||card.dataset.priority===priority.value)&&(!classification.value||card.dataset.classification===classification.value)&&(!type.value||card.dataset.type===type.value);card.classList.toggle('hidden',!ok);if(ok)shown++}count.textContent=shown+' investigative entr'+(shown===1?'y':'ies')}for(const el of [search,priority,classification,type])el.addEventListener('input',apply)})();</script></body></html>`;
write('hit-list.html', page);
write('cinematic-hit-list.html', page.replace(/href="hit-list\.html" aria-current="page"/g, 'href="hit-list.html"'));

const homeBlock = `${HIT_START}<section class="section wrap exposure-entry"><article class="card redline"><span class="label">Cinematic investigation entry point</span><h2>THE HIT LIST</h2><p>Enter the evidence-classified map of powerful people, institutions, documented wrongdoing, public allegations, unresolved rumours and missing records. Every entry routes into dossiers, timers and sources.</p><a class="btn" href="hit-list.html">Open the Hit List</a></article></section>${HIT_END}`;
const timerBlock = `${HIT_START}<section class="section wrap exposure-entry"><article class="card redline"><span class="label">Evidence → timer → dossier</span><h2>Follow the people and institutions moving these clocks</h2><p>The Hit List links timer pressure to the documented entities, mechanisms, allegations and missing records behind each investigative lane.</p><a class="btn" href="hit-list.html">Open the Hit List</a></article></section>${HIT_END}`;
patchFile('index.html', html => replaceBlock(html, HIT_START, HIT_END, homeBlock));
patchFile('timers.html', html => replaceBlock(html, HIT_START, HIT_END, timerBlock));

const dossierRoutes = unique(hitList.flatMap(entry => entry.dossierRoutes)).filter(route => routeExists(route));
const dossierBlock = `${DOSSIER_START}<section class="section wrap exposure-dossier-route"><article class="card redline"><span class="label">Connected investigation routes</span><h2>Continue the investigation</h2><p>Open the cinematic Hit List for the priority explanation, follow linked risk clocks, verify source records and submit corrections or counter-evidence.</p><div class="cta-row"><a class="btn" href="/hit-list.html">Hit List</a><a class="btn alt" href="/timers.html">Risk Timers</a><a class="btn alt" href="/source-document-vault.html">Source Vault</a><a class="btn alt" href="/corrections.html">Corrections</a></div></article></section>${DOSSIER_END}`;
for (const route of dossierRoutes) patchFile(internalRoute(route), html => replaceBlock(html, DOSSIER_START, DOSSIER_END, dossierBlock));

for (const relative of ['data/exposure-evidence-ledger.json','data/exposure-integrity-engine.json','data/cinematic-hit-list.json','downloads/exposure-integrity-report.json','downloads/exposure-integrity-report.md','hit-list.html','cinematic-hit-list.html']) copyToOutput(relative);

if (!integrity.ok) throw new Error(`Exposure Integrity Engine failed: ${JSON.stringify(integrity.criticalFailures.concat(entriesWithoutAction.map(entry => `${entry.name}: no action route`)))}`);
console.log(`Exposure Integrity Engine built ${ledger.length} ledger entries, ${hitList.length} Hit List entries, ${clockItems.length} timer routes and ${dossierRoutes.length} linked dossier routes. ${unresolvedEdges.length} legacy graph edges remain quarantined for provenance restoration.`);
