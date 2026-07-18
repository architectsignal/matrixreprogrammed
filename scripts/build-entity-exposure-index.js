const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fp = name => path.join(root, name);
const exists = name => fs.existsSync(fp(name));
const read = name => fs.readFileSync(fp(name), 'utf8');
const write = (name, value) => {
  fs.mkdirSync(path.dirname(fp(name)), { recursive: true });
  fs.writeFileSync(fp(name), value);
};
function readJson(name, fallback) {
  try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; }
}
function scalarText(value, depth = 0) {
  if (value == null || depth > 5) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name', 'label', 'title', 'display_name', 'displayName', 'entity', 'value', 'text', 'description']) {
      const candidate = scalarText(value[key], depth + 1);
      if (candidate) return candidate;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function clean(value = '') {
  const text = scalarText(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return ['[object Object]', 'object Object', '[object Array]'].includes(text) ? '' : text;
}
function esc(value = '') {
  return clean(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
function slug(value = 'entity') {
  return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'entity';
}
function arr(value) { return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items) { return [...new Set(arr(items).map(clean).filter(Boolean))]; }

const updated = new Date().toISOString();
const recordFeed = readJson('data/record-events.json', { events: [] });
const briefFeed = readJson('data/entity-daily-briefs.json', { briefs: [] });
const relationshipFeed = readJson('data/entity-relationship-scores.json', { relationships: [] });

const wrongdoingPatterns = [
  { label: 'Proven / convicted wrongdoing', grade: 'proven / convicted', score: 100, terms: ['convicted', 'conviction', 'guilty plea', 'sentenced', 'criminal judgment'] },
  { label: 'Charged, sued or named in legal action', grade: 'charged / sued', score: 72, terms: ['charged', 'indictment', 'lawsuit', 'sued', 'complaint', 'docket', 'court', 'litigation'] },
  { label: 'Sanction, penalty, fine or enforcement record', grade: 'sanctioned / fined', score: 68, terms: ['sanction', 'fine', 'penalty', 'enforcement', 'ofac', 'settlement', 'cease and desist'] },
  { label: 'Public-record conflict or revolving-door risk', grade: 'public-record conflict', score: 44, terms: ['conflict of interest', 'revolving door', 'lobbying', 'related party', 'beneficial ownership', 'donor', 'committee'] },
  { label: 'Contract, procurement or public-money concentration', grade: 'documented association', score: 34, terms: ['contract', 'award', 'procurement', 'recipient', 'grant', 'usaspending', 'tender', 'supplier'] },
  { label: 'Disclosure gap, sealed record or missing document', grade: 'missing-record risk', score: 30, terms: ['sealed', 'redacted', 'withheld', 'missing record', 'not disclosed', 'undisclosed'] },
  { label: 'Signal only - primary record required', grade: 'signal only', score: 10, terms: ['signal only', 'news_signal', 'news signal', 'early warning'] }
];
const gradeOrder = {
  'proven / convicted': 8, 'charged / sued': 7, 'sanctioned / fined': 6,
  'public-record conflict': 5, 'documented association': 4, 'credible allegation': 3,
  'hypothesis': 2, 'signal only': 1, 'unsupported claim': 0, 'not graded': 0
};
function classifyText(text, fallbackGrade = 'documented association') {
  const haystack = clean(text).toLowerCase();
  const hits = wrongdoingPatterns.map(pattern => {
    const matched = pattern.terms.filter(term => haystack.includes(term));
    return matched.length ? { ...pattern, score: pattern.score + matched.length * 5, matched_terms: matched } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  if (hits.length) return hits[0];
  const grade = clean(fallbackGrade) || 'documented association';
  return {
    label: 'General public-record exposure route',
    grade,
    score: (gradeOrder[grade] || 2) * 5,
    matched_terms: []
  };
}
function severity(score) {
  if (score >= 100) return 'critical public-record exposure';
  if (score >= 70) return 'high public-record exposure';
  if (score >= 40) return 'moderate public-record exposure';
  if (score >= 15) return 'watch-list exposure';
  return 'low / insufficient record exposure';
}

const entities = new Map();
function ensureEntity(value) {
  const name = clean(value);
  if (!name || name.length < 2) return null;
  const id = slug(name);
  const existing = entities.get(id) || {
    id, name, exposure_score: 0, highest_evidence_grade: 'not graded',
    exposure_categories: [], records: [], relationships: [], missing_records: [], watch_next: []
  };
  entities.set(id, existing);
  return existing;
}
function upgradeGrade(entity, gradeValue) {
  const grade = clean(gradeValue) || 'documented association';
  if ((gradeOrder[grade] || 0) > (gradeOrder[entity.highest_evidence_grade] || 0)) entity.highest_evidence_grade = grade;
}
function addRecord(entity, record) {
  const title = clean(record.title) || entity.name;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url.trim() : 'machine-digest.html';
  entity.records.push({ ...record, title, url });
}

for (const brief of arr(briefFeed.briefs)) {
  const briefName = clean(brief.name);
  const entity = ensureEntity(briefName);
  if (!entity) continue;
  upgradeGrade(entity, brief.evidence_grade);
  entity.missing_records = uniq([...entity.missing_records, ...arr(brief.missing_records)]);
  entity.watch_next = uniq([...entity.watch_next, ...arr(brief.watch_next)]);
  for (const route of arr(brief.source_routes)) {
    const routeTitle = clean(route.title) || briefName;
    const routeGrade = clean(route.grade) || clean(brief.evidence_grade) || 'documented association';
    const top = classifyText(`${briefName} ${clean(brief.plain_english_judgement)} ${routeTitle} ${routeGrade}`, routeGrade);
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    addRecord(entity, {
      title: routeTitle,
      url: typeof route.url === 'string' ? route.url : 'entity-daily-briefs.html',
      grade: top.grade,
      category: top.label,
      matched_terms: top.matched_terms
    });
    upgradeGrade(entity, top.grade);
  }
}

for (const event of arr(recordFeed.events)) {
  const names = uniq([...arr(event.entity_names), ...arr(event.institution_names)]).slice(0, 16);
  const top = classifyText(`${clean(event.summary)} ${clean(event.record_type)} ${clean(event.evidence_grade)} ${clean(event.source_lane)}`, event.evidence_grade);
  for (const name of names) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    addRecord(entity, {
      title: clean(event.summary) || clean(event.source_lane) || entity.name,
      url: typeof event.source_url === 'string' ? event.source_url : 'machine-digest.html',
      grade: top.grade,
      category: top.label,
      source_lane: clean(event.source_lane),
      record_type: clean(event.record_type),
      matched_terms: top.matched_terms
    });
    entity.missing_records = uniq([...entity.missing_records, ...arr(event.missing_records)]);
    const lane = clean(event.source_lane) || 'this source lane';
    entity.watch_next = uniq([...entity.watch_next, `Watch ${lane} for follow-up records involving ${entity.name}.`]);
    upgradeGrade(entity, top.grade);
  }
}

for (const relationship of arr(relationshipFeed.relationships)) {
  const from = clean(relationship.from);
  const to = clean(relationship.to);
  if (!from || !to) continue;
  for (const name of [from, to]) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    entity.exposure_score += Math.max(5, Math.round(Number(relationship.score || 0) / 2));
    entity.relationships.push({
      with: from === name ? to : from,
      score: Number(relationship.score || 0),
      type: clean(relationship.relationship_type) || 'relationship candidate',
      boundary: clean(relationship.boundary)
    });
    entity.exposure_categories = uniq([...entity.exposure_categories, 'Relationship candidate for review']);
  }
}

if (!entities.size) ensureEntity('Control Structure');
const profiles = [...entities.values()].filter(entity => clean(entity.name)).map(entity => ({
  ...entity,
  exposure_score: Math.round(entity.exposure_score),
  exposure_level: severity(entity.exposure_score),
  records: entity.records.slice(0, 20),
  relationships: entity.relationships.slice(0, 12),
  missing_records: entity.missing_records.slice(0, 12),
  watch_next: entity.watch_next.slice(0, 12),
  public_reading: entity.exposure_score >= 40
    ? `${entity.name} deserves active public-record review. The score reflects records, categories, relationships or missing-document triggers, not a conclusion of wrongdoing.`
    : `${entity.name} is being watched. More primary records are needed before stronger conclusions are made.`,
  boundary: 'Exposure score is a public-record triage score. It is not a verdict, accusation or finding of private intent.'
})).sort((a, b) => b.exposure_score - a.exposure_score || a.name.localeCompare(b.name)).slice(0, 250);

const output = {
  updated,
  title: 'Entity Exposure Index',
  purpose: 'Evidence-graded exposure profiles for tracked entities: wrongdoing records, legal actions, sanctions, conflicts, contract concentration, disclosure gaps and source-route watch triggers.',
  boundary: 'This system separates proven wrongdoing, legal allegations, documented conflicts, source signals and unsupported claims. It does not accuse an entity without a record grade.',
  profiles
};
write('data/entity-exposure-index.json', `${JSON.stringify(output, null, 2)}\n`);

const list = items => arr(items).map(item => `<li>${esc(item)}</li>`).join('') || '<li>No items yet.</li>';
function profileCard(profile) {
  return `<article class="card redline"><span class="label">${esc(profile.exposure_level)} · ${esc(profile.highest_evidence_grade)}</span><h3>${esc(profile.name)}</h3><p>${esc(profile.public_reading)}</p><p><strong>Categories:</strong> ${esc(profile.exposure_categories.slice(0, 4).join(', ') || 'watch list')}</p><div class="cta-row small"><a class="btn" href="entity-exposure/${esc(profile.id)}.html">Open Exposure Brief</a><a class="btn alt" href="data/entity-exposure-index.json">JSON</a></div></article>`;
}
function profilePage(profile) {
  const records = profile.records.map(record => `<li><a href="${esc(record.url)}" target="_blank" rel="noopener">${esc(record.title)}</a> — ${esc(record.category)} — ${esc(record.grade)}</li>`).join('') || '<li>No direct exposure record attached yet.</li>';
  const relationships = profile.relationships.map(relationship => `<li>${esc(relationship.with)} — score ${esc(relationship.score)} — ${esc(relationship.type)}</li>`).join('') || '<li>No relationship candidate yet.</li>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(profile.name)} Exposure Brief | Matrix Reprogrammed</title><meta name="description" content="Evidence-graded exposure brief for ${esc(profile.name)}."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../entity-exposure-index.html">Exposure Index</a><a href="../entity-daily-briefs.html">Entity Briefs</a><a href="../evidence-vault.html">Evidence</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Entity Exposure Brief</div><h1>${esc(profile.name).toUpperCase()}</h1><p class="lead">${esc(profile.public_reading)}</p></section><section class="section wrap split"><div class="terminal">EXPOSURE PROFILE\n&gt; score: ${esc(profile.exposure_score)}\n&gt; level: ${esc(profile.exposure_level)}\n&gt; highest evidence: ${esc(profile.highest_evidence_grade)}\n&gt; boundary: triage score, not verdict</div><aside class="card redline"><h2>Boundary</h2><p>${esc(profile.boundary)}</p></aside></section><section class="section wrap"><div class="grid"><article class="card"><h2>Exposure Categories</h2><ul>${list(profile.exposure_categories)}</ul></article><article class="card"><h2>Source Routes</h2><ul>${records}</ul></article><article class="card"><h2>Relationship Candidates</h2><ul>${relationships}</ul></article><article class="card"><h2>Missing Records</h2><ul>${list(profile.missing_records)}</ul></article><article class="card"><h2>Watch Next</h2><ul>${list(profile.watch_next)}</ul></article></div></section></main><footer class="footer wrap"><p><strong>Matrix Reprogrammed boundary:</strong> record grade first, conclusion second.</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script></body></html>`;
}
for (const profile of profiles.slice(0, 120)) write(`entity-exposure/${profile.id}.html`, profilePage(profile));

const hub = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Entity Exposure Index | Matrix Reprogrammed</title><meta name="description" content="Evidence-graded exposure index for tracked entities, corruption signals, legal records, sanctions, conflicts, contracts and missing records."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="entity-daily-briefs.html">Entity Briefs</a><a href="machine-intelligence.html">Machine Intelligence</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Elite Control Exposure Machine</div><h1>ENTITY EXPOSURE INDEX.</h1><p class="lead">Every tracked entity can now be reviewed for public-record wrongdoing, legal action, sanctions, fines, conflicts, contract concentration, disclosure gaps, relationship candidates and missing records.</p><div class="cta-row"><a class="btn" href="data/entity-exposure-index.json">Exposure JSON</a><a class="btn alt" href="downloads/entity-exposure-index.md">Download Index</a></div></section><section class="section wrap split"><div class="terminal">EXPOSURE ENGINE\n&gt; updated: ${esc(updated)}\n&gt; profiles: ${profiles.length}\n&gt; method: evidence ladder + source routes\n&gt; boundary: not a verdict\n&gt; mission: expose control structure through public records</div><aside class="card redline"><h2>Evidence Boundary</h2><p>This page tracks records and risk signals. It separates proven wrongdoing, legal allegations, documented conflicts, source signals and unsupported claims.</p></aside></section><section class="section wrap"><h2>Highest Exposure Profiles</h2><div class="grid">${profiles.slice(0, 80).map(profileCard).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — expose control through records.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
write('entity-exposure-index.html', hub);
const markdown = ['# Entity Exposure Index', '', `Updated: ${updated}`, '', ...profiles.slice(0, 120).map(profile => `## ${profile.name}\n\nScore: ${profile.exposure_score}\n\nLevel: ${profile.exposure_level}\n\nHighest evidence: ${profile.highest_evidence_grade}\n\nReading: ${profile.public_reading}\n`)].join('\n');
write('downloads/entity-exposure-index.md', `${markdown}\n`);

const generatedText = [JSON.stringify(output), hub, markdown, ...profiles.slice(0, 120).map(profilePage)].join('\n');
if (/\[object Object\]|\bobject Object\b/.test(generatedText)) throw new Error('Entity exposure generator produced an object placeholder');
console.log(`Entity Exposure Index built safely: ${profiles.length} profiles.`);
