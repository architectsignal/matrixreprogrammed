'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '_site');
const targetRoots = [projectRoot, ...(fs.existsSync(outputRoot) ? [outputRoot] : [])];
const EPSTEIN_START = '<!-- epstein-overlap-status:start -->';
const EPSTEIN_END = '<!-- epstein-overlap-status:end -->';
const CRIMINAL_START = '<!-- criminal-safeguarding-status:start -->';
const CRIMINAL_END = '<!-- criminal-safeguarding-status:end -->';

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value, maximum = 5000) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function esc(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normalize(value = '') {
  return clean(value, 700)
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:criminal investigation|intelligence dossier|complete dossier|deep card dossier|card dossier|dossier|profile|brief|historical case|current case|top 52 puppets of interest|matrix reprogrammed)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function relative(root, file) { return path.relative(root, file).replace(/\\/g, '/'); }
function hrefFrom(route, target) {
  if (/^https?:\/\//i.test(String(target || ''))) return target;
  const fromDirectory = path.posix.dirname(String(route || '').replace(/\\/g, '/'));
  const result = path.posix.relative(fromDirectory === '.' ? '' : fromDirectory, String(target || '').replace(/\\/g, '/'));
  return result || path.posix.basename(target);
}
function ensureParent(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function writeJson(file, value) { ensureParent(file); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function walk(directory, files = []) {
  const excluded = new Set(['.git', '.github', 'node_modules', 'data', 'downloads', 'scripts', 'tools', 'tests', 'functions', 'workers', '.wrangler', '.cache', '_cloudflare-site', '.netlify', 'dist', 'build']);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(full);
  }
  return files;
}
function isDossierRoute(route, html) {
  const base = path.basename(route).toLowerCase();
  if (base === 'index.html') return false;
  if (html.includes(CRIMINAL_START) || html.includes(EPSTEIN_START)) return true;
  if (/^(?:dossier|profile|person|entity)-.+\.html$/.test(base)) return true;
  if (/(?:^|\/)(?:top-52|billionaire|institution|family|contractor|agency|people|person|company)-briefs\//i.test(route)) return true;
  if (/\bdata-card-id=["'][^"']+["']/i.test(html) || /id=["']dossier-depth-core["']/i.test(html)) return true;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [, ''])[1];
  return /\b(?:dossier|subject profile|person profile|institution profile|family profile|intelligence brief|tracker brief)\b/i.test(`${title} ${description}`);
}
function titleFrom(html, route) {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1];
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
  return clean(h1 || String(title).split('|')[0] || path.basename(route, '.html').replace(/[-_]/g, ' '), 700);
}
function cardIdFrom(html) {
  return clean((html.match(/\bdata-card-id=["']([^"']+)["']/i) || [, ''])[1], 300);
}
function approvedRecords(subject) {
  return subject ? array(subject.records).filter(record => record.publicationStatus === 'approved' && /^https?:\/\//i.test(String(record.sourceUrl || ''))) : [];
}
function registrySubjects(registry) {
  return Object.entries(registry.subjects || {}).map(([key, subject]) => ({
    key,
    ...subject,
    __routes: unique(array(subject.dossierRoutes).concat(subject.dossierRoute || []))
  }));
}
function mergeSubjects(baseSubjects, extraSubjects) {
  const map = new Map(baseSubjects.map(subject => [subject.key, subject]));
  for (const subject of extraSubjects) {
    const existing = map.get(subject.key);
    if (!existing) {
      map.set(subject.key, subject);
      continue;
    }
    const records = new Map(array(subject.records).map(record => [record.id, record]));
    for (const record of array(existing.records)) records.set(record.id, record);
    map.set(subject.key, {
      ...subject,
      ...existing,
      aliases: unique([...array(subject.aliases), ...array(existing.aliases)]),
      __routes: unique([...array(subject.__routes), ...array(existing.__routes)]),
      records: [...records.values()]
    });
  }
  return [...map.values()];
}
function buildLookup(subjects) {
  const lookup = new Map();
  for (const subject of subjects) {
    for (const value of [subject.name, subject.key, subject.slug, ...array(subject.aliases), ...array(subject.__routes).map(route => path.basename(route, '.html'))]) {
      const key = normalize(value);
      if (key) lookup.set(key, subject);
    }
  }
  return lookup;
}
function matchSubject(subjects, lookup, route, title, cardId) {
  const exact = subjects.find(subject => array(subject.__routes).includes(route));
  return exact || lookup.get(normalize(cardId)) || lookup.get(normalize(title)) || lookup.get(normalize(path.basename(route, '.html'))) || null;
}
function replaceOrInsert(html, start, end, panel, beforeMarker = '') {
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`, 'g');
  if (pattern.test(html)) return html.replace(pattern, panel);
  if (beforeMarker && html.includes(beforeMarker)) return html.replace(beforeMarker, `${panel}${beforeMarker}`);
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${panel}</main>`);
  if (/<footer\b/i.test(html)) return html.replace(/<footer\b/i, `${panel}<footer`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${panel}</body>`);
  return `${html}${panel}`;
}
function recordList(records, route, kind) {
  if (!records.length) return '';
  return `<div class="accountability-records">${records.map(record => {
    const source = hrefFrom(route, record.sourceUrl);
    const supporting = record.supportingSourceUrl
      ? `<a href="${esc(hrefFrom(route, record.supportingSourceUrl))}" target="_blank" rel="noopener">Supporting source</a>`
      : '';
    const status = record.outcome || record.status || record.relationshipType || '';
    const boundary = record.notEstablished || record.boundary || record.counterEvidence || '';
    return `<article class="accountability-record"><span class="accountability-badge">${esc(record.evidenceGrade || 'Reviewed')} · ${esc(kind)}</span><h3>${esc(record.title)}</h3><p><strong>Status / relationship:</strong> ${esc(status)}</p><p>${esc(record.summary)}</p><p><strong>Established:</strong> ${esc(record.established || record.outcome || record.summary)}</p><p><strong>Not established:</strong> ${esc(boundary)}</p>${record.rightOfReply ? `<p><strong>Response / counter-evidence:</strong> ${esc(record.rightOfReply)}</p>` : ''}<p class="accountability-source"><a href="${esc(source)}" target="_blank" rel="noopener">Open primary source</a>${supporting ? ` · ${supporting}` : ''}</p></article>`;
  }).join('')}</div>`;
}
function sharedStyle() {
  return `<style>.accountability-shell{margin-top:1.25rem;border:1px solid rgba(216,181,106,.32);background:radial-gradient(circle at 12% 0,rgba(130,0,0,.18),transparent 40%),rgba(6,6,10,.97);padding:1rem;box-shadow:0 0 30px rgba(120,0,0,.12)}.accountability-top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.accountability-badge{display:inline-block;border:1px solid rgba(216,181,106,.44);padding:.22rem .48rem;margin:.14rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}.accountability-boundary{border-left:3px solid #d8b56a;padding-left:.8rem}.accountability-records{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.8rem;margin-top:.8rem}.accountability-record{border:1px solid rgba(216,181,106,.2);padding:.85rem;background:rgba(0,0,0,.38)}.accountability-source{font-size:.88rem}.accountability-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem}</style>`;
}
function criminalPanel(route, title, subject, categories) {
  const records = approvedRecords(subject);
  const known = records.length > 0;
  const summary = known
    ? clean(subject.legalStatusSummary, 2200)
    : 'No approved criminal-conduct, safeguarding, civil, regulatory or official-inquiry record is currently linked to this dossier in the authoritative registry.';
  const boundary = known
    ? clean(subject.conclusion?.doesNotProve || 'Read every item within its exact legal status. Charges, investigations, civil actions, association and proximity are not convictions.', 1800)
    : 'This is not a clearance statement, proof of a clean record or exoneration. It means no matching record has passed the source, identity, legal-status and editorial publication standard in this build.';
  const badges = known
    ? unique(records.map(record => categories[record.category]?.label || record.category)).map(value => `<span class="accountability-badge">${esc(value)}</span>`).join('')
    : '<span class="accountability-badge">No approved linked record</span>';
  const hub = hrefFrom(route, known && subject.dossierRoute ? subject.dossierRoute : 'criminal-investigations.html');
  return `${CRIMINAL_START}<section class="section wrap criminal-status-system" data-criminal-status-route="${esc(route)}" data-criminal-status-match="${known ? 'approved-registry-subject' : 'no-approved-match'}">${sharedStyle()}<div class="accountability-shell"><div class="accountability-top"><div><span class="label">Criminal &amp; Safeguarding Status</span><h2>${esc(title)}</h2></div><div>${badges}</div></div><h3>Exact status in the authoritative registry</h3><p>${esc(summary)}</p><p><strong>Approved public records:</strong> ${records.length}</p>${recordList(records, route, 'legal record')}<p class="accountability-boundary"><strong>Evidence boundary:</strong> ${esc(boundary)}</p><div class="accountability-actions"><a class="btn" href="${esc(hub)}">${known && subject.dossierRoute ? 'Open Complete Criminal Dossier' : 'Open Criminal Investigations'}</a><a class="btn alt" href="${esc(hrefFrom(route, 'predators-in-power.html'))}">Predators in Power</a><a class="btn alt" href="${esc(`${hrefFrom(route, 'predators-in-power.html')}#pip-signal-drop`)}">Submit Evidence or Correction</a></div></div></section>${CRIMINAL_END}`;
}
function epsteinPanel(route, title, subject, categories) {
  const records = approvedRecords(subject);
  const known = records.length > 0;
  const summary = known
    ? clean(subject.overlapStatusSummary || `${records.length} approved Epstein relationship record(s) are linked to this dossier.`, 2200)
    : 'No approved Epstein relationship, released-file mention, institutional relationship or adjudicated participation record is currently linked to this dossier.';
  const boundary = known
    ? 'A documented meeting, message, photograph, contact-book entry, flight record, financial service or released-file mention must be read in its exact context. It does not by itself establish knowledge of, participation in or responsibility for Epstein\'s crimes.'
    : 'This is not clearance, exoneration or proof that no connection existed. It means no identity-resolved, source-linked record has passed the publication standard in this build.';
  const badges = known
    ? unique(records.map(record => categories[record.category]?.label || record.category)).map(value => `<span class="accountability-badge">${esc(value)}</span>`).join('')
    : '<span class="accountability-badge">No approved linked overlap</span>';
  return `${EPSTEIN_START}<section class="section wrap epstein-overlap-system" data-epstein-overlap-route="${esc(route)}" data-epstein-overlap-match="${known ? 'approved-registry-subject' : 'no-approved-match'}">${sharedStyle()}<div class="accountability-shell"><div class="accountability-top"><div><span class="label">Epstein Relationship Intelligence</span><h2>${esc(title)}</h2></div><div>${badges}</div></div><h3>Documented overlap status</h3><p>${esc(summary)}</p><p><strong>Approved public records:</strong> ${records.length}</p>${recordList(records, route, 'Epstein record')}<p class="accountability-boundary"><strong>Evidence boundary:</strong> ${esc(boundary)}</p><div class="accountability-actions"><a class="btn" href="${esc(hrefFrom(route, 'epstein-email-network.html'))}">Open Epstein Relationship Map</a><a class="btn alt" href="${esc(hrefFrom(route, 'epstein-files.html'))}">Epstein Files Command Center</a><a class="btn alt" href="${esc(hrefFrom(route, 'source-intake.html'))}">Submit Evidence or Correction</a></div></div></section>${EPSTEIN_END}`;
}
function removeStaleNoSourceClaims(html) {
  return html
    .replace(/no reviewed public-source entry yet/gi, 'approved Epstein-overlap records are listed in the relationship panel below')
    .replace(/No source route recorded yet\./gi, 'Approved source routes are listed in the Epstein relationship panel below.')
    .replace(/No current item recorded\./gi, 'Approved Epstein-overlap records are listed in the relationship panel below.')
    .replace(/No reviewed related-card entries yet\./gi, 'Reviewed Epstein-overlap records are listed in the relationship panel below.');
}
function dynamicSubjectsFromRelationshipData(data) {
  const entities = array(data.entities);
  const relationships = array(data.relationships);
  const byId = new Map(entities.map(entity => [entity.entity_id, entity]));
  const epsteinEntity = entities.find(entity => normalize(entity.name) === 'jeffrey epstein' || entity.entity_id === 'jeffrey-epstein');
  if (!epsteinEntity) return [];
  const subjects = new Map();
  for (const relationship of relationships) {
    const touchesEpstein = relationship.source_entity_id === epsteinEntity.entity_id || relationship.target_entity_id === epsteinEntity.entity_id;
    if (!touchesEpstein) continue;
    const evidence = array(relationship.evidence).filter(item => /^https?:\/\//i.test(String(item.source_url || '')));
    const tier = Number(relationship.strength?.tier || 99);
    const documented = /documented|direct|adjudicated|verified/i.test(String(relationship.direct_or_inferred || '')) || tier <= 2;
    if (!documented || !evidence.length) continue;
    const otherId = relationship.source_entity_id === epsteinEntity.entity_id ? relationship.target_entity_id : relationship.source_entity_id;
    const entity = byId.get(otherId);
    if (!entity || !clean(entity.name)) continue;
    const first = evidence[0];
    const key = entity.entity_id || normalize(entity.name).replace(/\s+/g, '-');
    if (!subjects.has(key)) {
      subjects.set(key, {
        key,
        name: entity.name,
        aliases: array(entity.aliases),
        subjectType: entity.entity_type || 'person',
        __routes: array(entity.dossier_routes),
        overlapStatusSummary: 'Approved source-linked records in the Epstein relationship dataset are listed below.',
        records: []
      });
    }
    subjects.get(key).records.push({
      id: relationship.relationship_id || `epstein-edge-${key}-${subjects.get(key).records.length + 1}`,
      category: 'released_file_mention',
      title: clean(relationship.relationship_type || 'Documented Epstein relationship', 500),
      relationshipType: clean(relationship.relationship_type || 'documented relationship', 500),
      dateRange: [relationship.first_seen, relationship.last_seen].filter(Boolean).join('–'),
      summary: clean(relationship.public_safe_summary || first.public_safe_paraphrase || 'Approved relationship record.', 3500),
      sourceLabel: clean(first.source_label || first.locator || 'Open supporting record', 700),
      sourceUrl: first.source_url,
      sourceAuthority: 'approved_existing_relationship_dataset',
      evidenceGrade: tier <= 1 ? 'A' : 'B',
      publicationStatus: 'approved',
      established: clean(relationship.established || relationship.public_safe_summary || first.public_safe_paraphrase, 3500),
      notEstablished: clean(relationship.not_established || 'The relationship record does not by itself establish criminal knowledge, participation, shared intent or wrongdoing.', 2500),
      rightOfReply: clean(relationship.right_of_reply || relationship.counter_evidence || '', 2000),
      lastChecked: data.generated_at_utc || null
    });
  }
  return [...subjects.values()];
}
function mergeEntity(existing, addition) {
  return {
    ...existing,
    ...addition,
    aliases: unique([...array(existing?.aliases), ...array(addition.aliases)]),
    dossier_routes: unique([...array(existing?.dossier_routes), ...array(addition.dossier_routes)])
  };
}
function mergeById(existing, additions, field, merge = (_old, item) => item) {
  const map = new Map(array(existing).map(item => [item[field], item]));
  for (const item of additions) map.set(item[field], merge(map.get(item[field]), item));
  return [...map.values()];
}

const criminalRegistryPath = path.join(projectRoot, 'data', 'criminal-conduct-registry.json');
const epsteinRegistryPath = path.join(projectRoot, 'data', 'epstein-dossier-overlap-registry.json');
const relationshipPath = path.join(projectRoot, 'data', 'epstein-relationship-intelligence.json');
if (!fs.existsSync(criminalRegistryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
if (!fs.existsSync(epsteinRegistryPath)) throw new Error('Missing data/epstein-dossier-overlap-registry.json');
const criminalRegistry = readJson(criminalRegistryPath, null);
const epsteinRegistry = readJson(epsteinRegistryPath, null);
const existingRelationshipData = readJson(relationshipPath, { entities: [], relationships: [], events: [], financial_records: [], mentions: [], editorial_review: [] });
if (!criminalRegistry?.subjects || !epsteinRegistry?.subjects) throw new Error('Invalid criminal or Epstein registry.');
const criminalSubjects = registrySubjects(criminalRegistry);
const registryEpsteinSubjects = registrySubjects(epsteinRegistry);
const dynamicEpsteinSubjects = dynamicSubjectsFromRelationshipData(existingRelationshipData);
const epsteinSubjects = mergeSubjects(registryEpsteinSubjects, dynamicEpsteinSubjects);
const criminalLookup = buildLookup(criminalSubjects);
const epsteinLookup = buildLookup(epsteinSubjects);
const coverage = [];

for (const targetRoot of targetRoots) {
  const targetName = targetRoot === projectRoot ? 'source' : '_site';
  for (const file of walk(targetRoot)) {
    const route = relative(targetRoot, file);
    let html = fs.readFileSync(file, 'utf8');
    if (!isDossierRoute(route, html)) continue;
    const title = titleFrom(html, route);
    const cardId = cardIdFrom(html);
    const criminalSubject = matchSubject(criminalSubjects, criminalLookup, route, title, cardId);
    const epsteinSubject = matchSubject(epsteinSubjects, epsteinLookup, route, title, cardId);
    const criminalRecords = approvedRecords(criminalSubject);
    const epsteinRecords = approvedRecords(epsteinSubject);
    html = replaceOrInsert(html, CRIMINAL_START, CRIMINAL_END, criminalPanel(route, title, criminalSubject, criminalRegistry.categories || {}));
    html = replaceOrInsert(html, EPSTEIN_START, EPSTEIN_END, epsteinPanel(route, title, epsteinSubject, epsteinRegistry.categories || {}), CRIMINAL_START);
    if (epsteinRecords.length) html = removeStaleNoSourceClaims(html);
    fs.writeFileSync(file, html);
    coverage.push({
      target: targetName,
      route,
      title,
      cardId,
      criminalSubject: criminalSubject?.name || '',
      criminalApprovedRecords: criminalRecords.length,
      epsteinSubject: epsteinSubject?.name || '',
      epsteinApprovedRecords: epsteinRecords.length,
      criminalPanelPresent: html.includes(CRIMINAL_START),
      epsteinPanelPresent: html.includes(EPSTEIN_START)
    });
  }
}

const approvedEpsteinSubjects = epsteinSubjects.filter(subject => approvedRecords(subject).length);
const registryEntities = registryEpsteinSubjects.map(subject => ({
  entity_id: subject.key,
  name: subject.name,
  aliases: array(subject.aliases),
  entity_type: subject.subjectType || 'person',
  identity_confidence: 'verified',
  dossier_routes: array(subject.__routes)
}));
const registryRelationships = registryEpsteinSubjects.flatMap(subject => approvedRecords(subject)
  .filter(record => subject.key !== 'jeffrey-epstein')
  .map(record => ({
    relationship_id: record.id,
    source_entity_id: subject.key,
    target_entity_id: 'jeffrey-epstein',
    relationship_type: record.relationshipType || record.category,
    first_seen: String(record.dateRange || '').match(/\b\d{4}\b/)?.[0] || null,
    last_seen: [...String(record.dateRange || '').matchAll(/\b\d{4}\b/g)].at(-1)?.[0] || null,
    direct_or_inferred: /conviction|adjudicated/i.test(record.category) ? 'adjudicated' : 'documented',
    public_safe_summary: record.summary,
    established: record.established,
    not_established: record.notEstablished,
    strength: { tier: record.evidenceGrade === 'A' ? 1 : 2, label: record.evidenceGrade || 'reviewed' },
    evidence: [
      { source_url: record.sourceUrl, source_label: record.sourceLabel, evidence_level: 'primary_public_record', confidence: record.evidenceGrade || 'reviewed', public_safe_paraphrase: record.summary },
      ...(record.supportingSourceUrl ? [{ source_url: record.supportingSourceUrl, source_label: record.supportingSourceLabel || 'Supporting source', evidence_level: 'supporting_public_record', confidence: record.evidenceGrade || 'reviewed', public_safe_paraphrase: record.rightOfReply || record.summary }] : [])
    ]
  })));
const relationshipData = {
  ...existingRelationshipData,
  schema_version: existingRelationshipData.schema_version || '2.1.0',
  generated_at_utc: new Date().toISOString(),
  title: existingRelationshipData.title || 'THE EPSTEIN RELATIONSHIP INTELLIGENCE REGISTRY',
  evidence_notice: existingRelationshipData.evidence_notice || epsteinRegistry.publicationRule,
  publication_policy: {
    ...(existingRelationshipData.publication_policy || {}),
    mode: 'approved_public_record_only',
    automated_name_matches_publish: false,
    association_is_not_guilt: true
  },
  entities: mergeById(existingRelationshipData.entities, registryEntities, 'entity_id', mergeEntity),
  relationships: mergeById(existingRelationshipData.relationships, registryRelationships, 'relationship_id', (old, item) => ({ ...(old || {}), ...item })),
  events: array(existingRelationshipData.events),
  financial_records: array(existingRelationshipData.financial_records),
  mentions: array(existingRelationshipData.mentions),
  editorial_review: array(existingRelationshipData.editorial_review)
};
relationshipData.counts = {
  ...(existingRelationshipData.counts || {}),
  entities: relationshipData.entities.length,
  relationships: relationshipData.relationships.length,
  events: relationshipData.events.length,
  financial_records: relationshipData.financial_records.length,
  mentions: relationshipData.mentions.length,
  editorial_review: relationshipData.editorial_review.length
};
const byId = new Map(relationshipData.entities.map(entity => [entity.entity_id, entity]));
const profiles = {};
for (const entity of relationshipData.entities) {
  profiles[entity.entity_id] = {
    ...entity,
    connections: relationshipData.relationships
      .filter(item => item.source_entity_id === entity.entity_id || item.target_entity_id === entity.entity_id)
      .map(item => {
        const otherId = item.source_entity_id === entity.entity_id ? item.target_entity_id : item.source_entity_id;
        return {
          relationship_id: item.relationship_id,
          direction: item.source_entity_id === entity.entity_id ? 'outbound' : 'inbound',
          other_entity_id: otherId,
          other_name: byId.get(otherId)?.name || otherId,
          relationship_type: item.relationship_type,
          evidence_count: array(item.evidence).length,
          strength: item.strength || null,
          public_safe_summary: item.public_safe_summary || ''
        };
      })
  };
}
const profileIndex = {
  schema_version: relationshipData.schema_version,
  generated_at_utc: relationshipData.generated_at_utc,
  evidence_notice: relationshipData.evidence_notice,
  profiles
};
for (const base of targetRoots) {
  writeJson(path.join(base, 'data', 'epstein-relationship-intelligence.json'), relationshipData);
  writeJson(path.join(base, 'data', 'epstein-relationship-profile-index.json'), profileIndex);
  writeJson(path.join(base, 'downloads', 'epstein-relationship-intelligence.json'), relationshipData);
  writeJson(path.join(base, 'downloads', 'epstein-relationship-profile-index.json'), profileIndex);
}

const sourceCoverage = coverage.filter(item => item.target === 'source');
const missingPanels = sourceCoverage.filter(item => !item.criminalPanelPresent || !item.epsteinPanelPresent).map(item => item.route);
const gatesSubject = epsteinSubjects.find(subject => subject.key === 'bill-gates');
const gatesRoutes = array(gatesSubject?.__routes);
const gatesFailures = gatesRoutes.filter(route => {
  const item = sourceCoverage.find(entry => entry.route === route);
  return !item || item.epsteinApprovedRecords < 1;
});
const approvedRouteFailures = registryEpsteinSubjects.flatMap(subject => array(subject.__routes)
  .filter(route => fs.existsSync(path.join(projectRoot, route)) && !sourceCoverage.some(item => item.route === route && item.epsteinApprovedRecords > 0)));
const report = {
  ok: sourceCoverage.length > 0 && missingPanels.length === 0 && gatesFailures.length === 0 && approvedRouteFailures.length === 0 && relationshipData.relationships.length > 0,
  generatedAt: new Date().toISOString(),
  policy: 'Every detected dossier receives both a criminal/safeguarding panel and an Epstein-overlap panel. Only approved, source-linked records render; no-match is not clearance.',
  dossierPagesDetected: sourceCoverage.length,
  outputDossierPagesDetected: coverage.filter(item => item.target === '_site').length,
  criminalRegistrySubjects: criminalSubjects.length,
  registryEpsteinSubjects: registryEpsteinSubjects.length,
  dynamicEpsteinSubjects: dynamicEpsteinSubjects.length,
  approvedEpsteinSubjects: approvedEpsteinSubjects.length,
  totalEpsteinRelationshipsPreserved: relationshipData.relationships.length,
  criminalMatchedPages: sourceCoverage.filter(item => item.criminalApprovedRecords > 0).length,
  epsteinMatchedPages: sourceCoverage.filter(item => item.epsteinApprovedRecords > 0).length,
  missingPanels,
  gatesFailures,
  approvedRouteFailures,
  coverage
};
writeJson(path.join(projectRoot, 'data', 'dossier-accountability-coverage.json'), report);
writeJson(path.join(projectRoot, 'downloads', 'dossier-accountability-coverage.json'), report);
if (fs.existsSync(outputRoot)) {
  writeJson(path.join(outputRoot, 'data', 'dossier-accountability-coverage.json'), report);
  writeJson(path.join(outputRoot, 'downloads', 'dossier-accountability-coverage.json'), report);
}
if (!report.ok) {
  throw new Error(`Dossier accountability overlay failed: missingPanels=${missingPanels.length}, gatesFailures=${gatesFailures.join(',')}, approvedRouteFailures=${approvedRouteFailures.join(',')}, relationships=${relationshipData.relationships.length}`);
}
console.log(`Dossier accountability overlays PASS: ${sourceCoverage.length} source dossiers, ${report.outputDossierPagesDetected} output dossiers, ${report.criminalMatchedPages} criminal matches and ${report.epsteinMatchedPages} Epstein matches; ${relationshipData.relationships.length} existing relationship records preserved.`);
