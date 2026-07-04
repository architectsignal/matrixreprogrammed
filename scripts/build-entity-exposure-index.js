const fs = require('fs');
const path = require('path');

const root = process.cwd();
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(fp(name)), { recursive: true }); fs.writeFileSync(fp(name), value); }
function readJson(name, fallback){ try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; } }
function esc(value = ''){ return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function slug(value = 'entity'){ return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'entity'; }
function arr(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items){ return [...new Set(arr(items).map(clean).filter(Boolean))]; }

const updated = new Date().toISOString();
const recordFeed = readJson('data/record-events.json', { events: [] });
const briefFeed = readJson('data/entity-daily-briefs.json', { briefs: [] });
const relationshipFeed = readJson('data/entity-relationship-scores.json', { relationships: [] });
const changeFeed = readJson('data/change-detection.json', { newRecords: [], changedRecords: [] });

const wrongdoingPatterns = [
  { id: 'conviction', label: 'Proven / convicted wrongdoing', grade: 'proven / convicted', score: 100, terms: ['convicted','conviction','guilty plea','sentenced','criminal judgment'] },
  { id: 'charge-lawsuit', label: 'Charged, sued or named in legal action', grade: 'charged / sued', score: 72, terms: ['charged','indictment','lawsuit','sued','complaint','docket','court','litigation'] },
  { id: 'sanction-fine', label: 'Sanction, penalty, fine or enforcement record', grade: 'sanctioned / fined', score: 68, terms: ['sanction','fine','penalty','enforcement','ofac','settlement','cease and desist'] },
  { id: 'conflict', label: 'Public-record conflict or revolving-door risk', grade: 'public-record conflict', score: 44, terms: ['conflict of interest','revolving door','lobbying','related party','beneficial ownership','donor','committee'] },
  { id: 'contract-concentration', label: 'Contract, procurement or public-money concentration', grade: 'documented association', score: 34, terms: ['contract','award','procurement','recipient','grant','usaspending','tender','supplier'] },
  { id: 'disclosure-gap', label: 'Disclosure gap, sealed record or missing document', grade: 'missing-record risk', score: 30, terms: ['sealed','redacted','withheld','missing record','not disclosed','undisclosed'] },
  { id: 'signal-only', label: 'Signal only - primary record required', grade: 'signal only', score: 10, terms: ['signal only','news_signal','news signal','early warning'] }
];
const gradeOrder = { 'proven / convicted': 8, 'charged / sued': 7, 'sanctioned / fined': 6, 'public-record conflict': 5, 'documented association': 4, 'credible allegation': 3, 'hypothesis': 2, 'signal only': 1, 'unsupported claim': 0 };

function classifyText(text, fallbackGrade = 'documented association'){
  const hay = String(text || '').toLowerCase();
  const hits = [];
  for (const pattern of wrongdoingPatterns) {
    const matched = pattern.terms.filter(term => hay.includes(term));
    if (matched.length) hits.push({ id: pattern.id, label: pattern.label, grade: pattern.grade, score: pattern.score + matched.length * 5, matched_terms: matched });
  }
  if (!hits.length) hits.push({ id: 'general-public-record', label: 'General public-record exposure route', grade: fallbackGrade, score: gradeOrder[fallbackGrade] ? gradeOrder[fallbackGrade] * 5 : 12, matched_terms: [] });
  return hits.sort((a,b)=>b.score-a.score);
}
function severity(score){
  if (score >= 100) return 'critical public-record exposure';
  if (score >= 70) return 'high public-record exposure';
  if (score >= 40) return 'moderate public-record exposure';
  if (score >= 15) return 'watch-list exposure';
  return 'low / insufficient record exposure';
}

const entities = new Map();
function ensureEntity(name){
  const label = clean(name);
  if (!label || label.length < 2) return null;
  const id = slug(label);
  const prior = entities.get(id) || { id, name: label, exposure_score: 0, highest_evidence_grade: 'not graded', exposure_categories: [], records: [], relationships: [], missing_records: [], watch_next: [] };
  entities.set(id, prior);
  return prior;
}
function maybeUpgradeGrade(entity, grade){
  if ((gradeOrder[grade] || 0) > (gradeOrder[entity.highest_evidence_grade] || 0)) entity.highest_evidence_grade = grade;
}

for (const brief of arr(briefFeed.briefs)) {
  const entity = ensureEntity(brief.name);
  if (!entity) continue;
  maybeUpgradeGrade(entity, brief.evidence_grade || 'documented association');
  entity.missing_records = uniq([...entity.missing_records, ...(brief.missing_records || [])]);
  entity.watch_next = uniq([...entity.watch_next, ...(brief.watch_next || [])]);
  for (const route of arr(brief.source_routes)) {
    const text = `${brief.name} ${brief.evidence_grade} ${brief.plain_english_judgement} ${route.title} ${route.grade}`;
    const hits = classifyText(text, route.grade || brief.evidence_grade || 'documented association');
    const top = hits[0];
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    entity.records.push({ title: route.title || brief.name, url: route.url || 'entity-daily-briefs.html', grade: top.grade, category: top.label, matched_terms: top.matched_terms });
    maybeUpgradeGrade(entity, top.grade);
  }
}
for (const event of arr(recordFeed.events)) {
  const names = uniq([...(event.entity_names || []), ...(event.institution_names || [])]).slice(0, 16);
  const hits = classifyText(`${event.summary} ${event.record_type} ${event.evidence_grade} ${event.source_lane}`, event.evidence_grade || 'documented association');
  const top = hits[0];
  for (const name of names) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    entity.records.push({ title: event.summary || event.source_lane, url: event.source_url || 'machine-digest.html', grade: top.grade, category: top.label, source_lane: event.source_lane, record_type: event.record_type, matched_terms: top.matched_terms });
    entity.missing_records = uniq([...entity.missing_records, ...(event.missing_records || [])]);
    entity.watch_next = uniq([...entity.watch_next, `Watch ${event.source_lane || 'this lane'} for follow-up records involving ${name}.`]);
    maybeUpgradeGrade(entity, top.grade);
  }
}
for (const rel of arr(relationshipFeed.relationships)) {
  for (const name of [rel.from, rel.to]) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    const score = Math.max(5, Math.round(Number(rel.score || 0) / 2));
    entity.exposure_score += score;
    entity.relationships.push({ with: rel.from === name ? rel.to : rel.from, score: rel.score, type: rel.relationship_type, boundary: rel.boundary });
    entity.exposure_categories = uniq([...entity.exposure_categories, 'Relationship candidate for review']);
  }
}

if (!entities.size) ensureEntity('Control Structure');
const profiles = [...entities.values()].map(entity => ({
  ...entity,
  exposure_score: Math.round(entity.exposure_score),
  exposure_level: severity(entity.exposure_score),
  records: entity.records.slice(0, 20),
  relationships: entity.relationships.slice(0, 12),
  missing_records: entity.missing_records.slice(0, 12),
  watch_next: entity.watch_next.slice(0, 12),
  public_reading: entity.exposure_score >= 40 ? `${entity.name} deserves active public-record review. The score reflects records, categories, relationships or missing-document triggers, not a conclusion of wrongdoing.` : `${entity.name} is being watched. More primary records are needed before stronger conclusions are made.`,
  boundary: 'Exposure score is a public-record triage score. It is not a verdict, accusation or finding of private intent.'
})).sort((a,b)=>b.exposure_score-a.exposure_score || a.name.localeCompare(b.name)).slice(0, 250);

const out = { updated, title: 'Entity Exposure Index', purpose: 'Evidence-graded exposure profiles for tracked entities: wrongdoing records, legal actions, sanctions, conflicts, contract concentration, disclosure gaps and source-route watch triggers.', boundary: 'This system separates proven wrongdoing, legal allegations, documented conflicts, source signals and unsupported claims. It does not accuse an entity without a record grade.', profiles };
write('data/entity-exposure-index.json', JSON.stringify(out, null, 2));

function card(p){ return `<article class="card redline"><span class="label">${esc(p.exposure_level)} · ${esc(p.highest_evidence_grade)}</span><h3>${esc(p.name)}</h3><p>${esc(p.public_reading)}</p><p><strong>Categories:</strong> ${esc(arr(p.exposure_categories).slice(0,4).join(', ') || 'watch list')}</p><div class="cta-row small"><a class="btn" href="entity-exposure/${esc(p.id)}.html">Open Exposure Brief</a><a class="btn alt" href="data/entity-exposure-index.json">JSON</a></div></article>`; }
function page(p){
  const records = arr(p.records).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a> — ${esc(r.category)} — ${esc(r.grade)}</li>`).join('') || '<li>No direct exposure record attached yet.</li>';
  const rels = arr(p.relationships).map(r => `<li>${esc(r.with)} — score ${esc(r.score)} — ${esc(r.type)}</li>`).join('') || '<li>No relationship candidate yet.</li>';
  const list = items => arr(items).map(x => `<li>${esc(x)}</li>`).join('') || '<li>No items yet.</li>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(p.name)} Exposure Brief | Matrix Reprogrammed</title><meta name="description" content="Evidence-graded exposure brief for ${esc(p.name)}."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../entity-exposure-index.html">Exposure Index</a><a href="../entity-daily-briefs.html">Entity Briefs</a><a href="../evidence-vault.html">Evidence</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Entity Exposure Brief</div><h1>${esc(p.name).toUpperCase()}</h1><p class="lead">${esc(p.public_reading)}</p></section><section class="section wrap split"><div class="terminal">EXPOSURE PROFILE\n&gt; score: ${esc(p.exposure_score)}\n&gt; level: ${esc(p.exposure_level)}\n&gt; highest evidence: ${esc(p.highest_evidence_grade)}\n&gt; boundary: triage score, not verdict</div><aside class="card redline"><h2>Boundary</h2><p>${esc(p.boundary)}</p></aside></section><section class="section wrap"><div class="grid"><article class="card"><h2>Exposure Categories</h2><ul>${list(p.exposure_categories)}</ul></article><article class="card"><h2>Source Routes</h2><ul>${records}</ul></article><article class="card"><h2>Relationship Candidates</h2><ul>${rels}</ul></article><article class="card"><h2>Missing Records</h2><ul>${list(p.missing_records)}</ul></article><article class="card"><h2>Watch Next</h2><ul>${list(p.watch_next)}</ul></article></div></section></main><footer class="footer wrap"><p><strong>Matrix Reprogrammed boundary:</strong> record grade first, conclusion second.</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script></body></html>`;
}
for (const p of profiles.slice(0, 120)) write(`entity-exposure/${p.id}.html`, page(p));
const hub = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Entity Exposure Index | Matrix Reprogrammed</title><meta name="description" content="Evidence-graded exposure index for tracked entities, corruption signals, legal records, sanctions, conflicts, contracts and missing records."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="entity-daily-briefs.html">Entity Briefs</a><a href="machine-intelligence.html">Machine Intelligence</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Elite Control Exposure Machine</div><h1>ENTITY EXPOSURE INDEX.</h1><p class="lead">Every tracked entity can now be reviewed for public-record wrongdoing, legal action, sanctions, fines, conflicts, contract concentration, disclosure gaps, relationship candidates and missing records.</p><div class="cta-row"><a class="btn" href="data/entity-exposure-index.json">Exposure JSON</a><a class="btn alt" href="downloads/entity-exposure-index.md">Download Index</a></div></section><section class="section wrap split"><div class="terminal">EXPOSURE ENGINE\n&gt; updated: ${esc(updated)}\n&gt; profiles: ${profiles.length}\n&gt; method: evidence ladder + source routes\n&gt; boundary: not a verdict\n&gt; mission: expose control structure through public records</div><aside class="card redline"><h2>Evidence Boundary</h2><p>This page tracks records and risk signals. It separates proven wrongdoing, legal allegations, documented conflicts, source signals and unsupported claims.</p></aside></section><section class="section wrap"><h2>Highest Exposure Profiles</h2><div class="grid">${profiles.slice(0, 80).map(card).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — expose control through records.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
write('entity-exposure-index.html', hub);
const md = ['# Entity Exposure Index', '', `Updated: ${updated}`, '', ...profiles.slice(0, 120).map(p => `## ${p.name}\n\nScore: ${p.exposure_score}\n\nLevel: ${p.exposure_level}\n\nHighest evidence: ${p.highest_evidence_grade}\n\nReading: ${p.public_reading}\n`)].join('\n');
write('downloads/entity-exposure-index.md', md);
console.log(`Entity Exposure Index built: ${profiles.length} profiles.`);
