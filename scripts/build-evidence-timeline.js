const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n'); };
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 18);
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const dateOnly = value => { const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/); return match ? match[0] : ''; };
const arrayFrom = (payload, keys) => Array.isArray(payload) ? payload : (keys.map(key => payload?.[key]).find(Array.isArray) || []);

const entityPayload = readJson('data/entity-registry.json', {});
const entities = arrayFrom(entityPayload, ['entities', 'records', 'items']);
const entityName = new Map(entities.map(entity => [entity.id, entity.name || entity.caption || entity.id]));
const relationshipPayload = readJson('data/relationship-registry.json', {});
const relationships = arrayFrom(relationshipPayload, ['relationships', 'records', 'items']);
const ledgerPayload = readJson('data/investigation-ledger.json', {});
const findings = arrayFrom(ledgerPayload, ['findings', 'records', 'items']);
const changePayload = readJson('data/source-change-public.json', {});
const sourceChanges = arrayFrom(changePayload, ['changes', 'records', 'items']);
const market = readJson('data/market-activity.json', { insiderTransactions: [], positionChanges: [] });

const events = [];
function add(event) {
  const date = dateOnly(event.date);
  if (!date || !event.title) return;
  const evidenceGrade = String(event.evidenceGrade || 'C').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1) || 'C';
  const sourceUrl = clean(event.sourceUrl);
  const id = event.id || `timeline-${hash([date, event.type, event.title, sourceUrl].join('|'))}`;
  events.push({
    id,
    date,
    endDate: dateOnly(event.endDate),
    title: clean(event.title),
    summary: clean(event.summary),
    entity: clean(event.entity),
    relatedEntity: clean(event.relatedEntity),
    type: clean(event.type || 'record'),
    evidenceGrade,
    factualStatus: clean(event.factualStatus || 'public record'),
    source: clean(event.source || 'Public record'),
    sourceUrl,
    established: clean(event.established || 'The cited record establishes the time-bounded event described in the title and summary.'),
    notEstablished: clean(event.notEstablished || 'The record does not establish motive, broader coordination, unrelated wrongdoing or facts beyond its stated scope.'),
    correctionRoute: clean(event.correctionRoute || 'Submit the event ID and a conflicting primary record through the Matrix correction route.'),
    jurisdiction: clean(event.jurisdiction),
    reviewStatus: clean(event.reviewStatus || 'machine-normalised-public-record')
  });
}

for (const relationship of relationships) {
  add({
    id: `relationship-${relationship.id}`,
    date: relationship.publicationDate || relationship.date || relationship.retrievalDate,
    title: `${entityName.get(relationship.source) || relationship.source || 'Entity'} — ${relationship.label || relationship.type || 'relationship'} — ${entityName.get(relationship.target) || relationship.target || 'Entity'}`,
    summary: relationship.mechanism || relationship.implication || relationship.established,
    entity: entityName.get(relationship.source) || relationship.source,
    relatedEntity: entityName.get(relationship.target) || relationship.target,
    type: relationship.type || 'relationship',
    evidenceGrade: relationship.evidenceGrade,
    factualStatus: relationship.factualStatus,
    source: relationship.sourceTitle || relationship.sourceName || relationship.sourceType,
    sourceUrl: relationship.sourceUrl,
    established: relationship.established,
    notEstablished: relationship.notEstablished,
    correctionRoute: relationship.correctionRoute,
    jurisdiction: relationship.jurisdiction,
    reviewStatus: relationship.reviewStatus
  });
}

for (const finding of findings) {
  add({
    id: `finding-${finding.id || hash(finding.title)}`,
    date: finding.publicationDate || finding.date || finding.retrievalDate || finding.observedAt,
    title: finding.title || finding.headline || 'Investigation finding',
    summary: finding.conclusion || finding.summary || finding.mechanism,
    entity: finding.entity || finding.subject || finding.person || finding.institution,
    relatedEntity: finding.relatedEntity || finding.company || finding.agency,
    type: finding.type || finding.category || 'investigation finding',
    evidenceGrade: finding.evidenceGrade || finding.grade,
    factualStatus: finding.factualStatus || finding.status,
    source: finding.source || finding.sourceName,
    sourceUrl: finding.sourceUrl || finding.url,
    established: finding.established || finding.whatIsEstablished || finding.conclusion,
    notEstablished: finding.notEstablished || finding.whatIsNotEstablished || finding.boundary,
    correctionRoute: finding.correctionRoute,
    jurisdiction: finding.jurisdiction,
    reviewStatus: finding.reviewStatus
  });
}

for (const change of sourceChanges) {
  add({
    id: `source-change-${change.id || hash(change.url || change.title)}`,
    date: change.observedAt || change.detectedAt || change.retrievalDate || change.date,
    title: change.title || `${change.changeType || 'Source change'} detected`,
    summary: change.summary || change.publicSummary || change.additions || change.removals,
    entity: change.sourceName || change.source,
    type: `source-${change.changeType || change.status || 'change'}`,
    evidenceGrade: change.evidenceGrade || 'B',
    factualStatus: change.factualStatus || 'source change detected',
    source: change.sourceName || change.source,
    sourceUrl: change.sourceUrl || change.url,
    established: change.established || 'The preservation system observed a change between retrieved versions of the registered source.',
    notEstablished: change.notEstablished || 'A detected wording or availability change does not by itself establish intent, concealment or wrongdoing.',
    correctionRoute: change.correctionRoute,
    jurisdiction: change.jurisdiction,
    reviewStatus: change.reviewStatus
  });
}

for (const transaction of market.insiderTransactions || []) {
  const owner = transaction.reportingOwnerNames?.[0] || transaction.reportingOwners?.[0]?.name || 'Reported insider';
  const issuer = transaction.issuer?.name || transaction.trackedSubjectName || 'Issuer';
  add({
    id: transaction.id,
    date: transaction.transactionDate || transaction.filingDate,
    title: `${owner} — ${transaction.transactionLabel || transaction.transactionCode || 'reported transaction'} — ${issuer}`,
    summary: `${transaction.shares ?? 'Unstated'} shares${transaction.pricePerShare != null ? ` at reported price ${transaction.pricePerShare}` : ''}.`,
    entity: owner,
    relatedEntity: issuer,
    type: transaction.marketTrade ? 'insider market transaction' : 'insider other transaction',
    evidenceGrade: transaction.evidenceGrade || 'A',
    factualStatus: transaction.factualStatus,
    source: 'SEC Form 4',
    sourceUrl: transaction.sourceUrl,
    established: transaction.establishes,
    notEstablished: transaction.doesNotEstablish,
    reviewStatus: transaction.reviewStatus,
    jurisdiction: 'United States'
  });
}

for (const change of market.positionChanges || market.institutionalChanges || []) {
  add({
    id: change.id,
    date: change.currentReportDate || change.currentFilingDate,
    title: `${change.managerName || 'Institution'} — ${String(change.changeType || 'position change').replace(/-/g, ' ')} — ${change.issuerName || 'Security'}`,
    summary: `${change.previousShares ?? 0} previous shares; ${change.currentShares ?? 0} current shares; ${change.shareChange ?? 0} reported change.`,
    entity: change.managerName,
    relatedEntity: change.issuerName,
    type: 'institutional position change',
    evidenceGrade: change.evidenceGrade || 'A',
    factualStatus: change.factualStatus,
    source: 'SEC Form 13F comparison',
    sourceUrl: change.currentSourceUrl || change.sourceUrl,
    established: change.establishes,
    notEstablished: change.doesNotEstablish,
    reviewStatus: change.reviewStatus,
    jurisdiction: 'United States'
  });
}

const deduped = [...new Map(events.map(event => [event.id, event])).values()]
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
  .slice(0, 8000);

const payload = {
  ok: true,
  version: 1,
  generatedAt: new Date().toISOString(),
  engine: 'vis-timeline',
  engineLicense: 'Apache-2.0 / MIT ecosystem',
  evidenceBoundary: 'Timeline position shows when a source reports, files or records an event. It does not convert association, chronology, proximity or a filing into proof of motive, coordination or wrongdoing.',
  counts: {
    events: deduped.length,
    gradeA: deduped.filter(event => event.evidenceGrade === 'A').length,
    gradeB: deduped.filter(event => event.evidenceGrade === 'B').length,
    relationships: deduped.filter(event => /relationship/i.test(event.type)).length,
    marketActivity: deduped.filter(event => /transaction|position change/i.test(event.type)).length,
    sourceChanges: deduped.filter(event => event.type.startsWith('source-')).length
  },
  events: deduped
};
writeJson('data/evidence-timeline.json', payload);

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Evidence Timeline | Matrix Reprogrammed</title><meta name="description" content="Evidence-led timeline of official filings, investigation findings, source changes and documented relationships."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><link rel="stylesheet" href="reader-experience.css"/><style>.timeline-controls{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:.7rem}.timeline-controls input,.timeline-controls select{width:100%;box-sizing:border-box;padding:.7rem;background:#090806;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:8px}#evidence-timeline-stage{min-height:480px;background:#0a0907;border:1px solid rgba(216,181,106,.25);border-radius:12px;padding:.5rem}.timeline-list{max-height:70vh;overflow:auto}.timeline-event{margin:.65rem 0}.timeline-event[hidden]{display:none}.timeline-detail{border-left:3px solid #d8b56a}.boundary{border-left:3px solid #d8b56a;padding:.85rem;background:rgba(216,181,106,.07)}@media(max-width:850px){.timeline-controls{grid-template-columns:1fr}#evidence-timeline-stage{min-height:350px}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="evidence-timeline.html" aria-current="page">Evidence Timeline</a><a href="evidence-reader.html">Evidence Reader</a><a href="evidence-network-map.html">Network Map</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Open-source vis-timeline interface</div><h1>EVIDENCE TIMELINE.</h1><p class="lead">Move from isolated records to dated sequences while retaining the source, grade, factual status and explicit limitation for every event.</p><p class="boundary"><strong>Boundary:</strong> Chronology can reveal sequence and overlap. It does not prove causation, coordination, motive or wrongdoing without records that establish those claims.</p></section><section class="section wrap"><div class="timeline-controls"><input id="timeline-q" type="search" placeholder="Search entity, institution, filing or event"/><select id="timeline-grade"><option value="">All evidence grades</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option><option value="D">Grade D</option></select><select id="timeline-type"><option value="">All event types</option></select><select id="timeline-year"><option value="">All years</option></select></div><p id="timeline-status" class="figure-caption">Loading evidence timeline…</p><div id="evidence-timeline-stage"></div></section><section class="section wrap split"><article id="timeline-detail" class="card timeline-detail"><span class="label">SELECT AN EVENT</span><h2>Event evidence boundary</h2><p>Choose an event in the interactive timeline or accessible list.</p></article><aside class="card timeline-list"><h2>Accessible event list</h2><div id="timeline-list"></div></aside></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — chronology with evidence boundaries attached.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script><script src="evidence-timeline.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'evidence-timeline.html'), html);
fs.writeFileSync(path.join(root, 'evidence-timeline'), html);
console.log(`Evidence timeline built with ${deduped.length} events.`);
