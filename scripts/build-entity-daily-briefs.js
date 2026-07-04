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
const observationFeed = readJson('data/entity-observations.json', { observations: [] });
const relationshipFeed = readJson('data/entity-relationship-scores.json', { relationships: [] });
const changeFeed = readJson('data/change-detection.json', { newRecords: [], changedRecords: [], clockTriggers: [] });
const entityFeed = readJson('data/entities.json', { entities: [] });

const entityMap = new Map();
function ensureEntity(name, seed = {}){
  const label = clean(name);
  if (!label || label.length < 2) return null;
  const id = seed.id || slug(label);
  const prior = entityMap.get(id) || { id, name: label, type: seed.type || 'tracked entity', count: 0, control_layers: [], evidence_grades: [], source_events: [], relationships: [], records: [], missing_records: [], watch_next: [] };
  prior.name = prior.name || label;
  prior.type = seed.type || prior.type;
  prior.count += Number(seed.count || 0);
  prior.control_layers = uniq([...prior.control_layers, ...(seed.control_layers || [])]);
  prior.evidence_grades = uniq([...prior.evidence_grades, ...(seed.evidence_grades || [])]);
  prior.source_events = uniq([...prior.source_events, ...(seed.source_events || [])]).slice(0, 20);
  prior.records = [...prior.records, ...(seed.records || [])].slice(0, 30);
  prior.relationships = [...prior.relationships, ...(seed.relationships || [])].slice(0, 30);
  prior.missing_records = uniq([...prior.missing_records, ...(seed.missing_records || [])]).slice(0, 20);
  prior.watch_next = uniq([...prior.watch_next, ...(seed.watch_next || [])]).slice(0, 12);
  entityMap.set(id, prior);
  return prior;
}

for (const entity of arr(entityFeed.entities).slice(0, 250)) {
  ensureEntity(entity.name, { id: entity.id || slug(entity.name), type: entity.type || 'entity', count: 1, control_layers: entity.control_layers || [], evidence_grades: [entity.evidence_grade || 'documented association'], missing_records: entity.missing_records || [], watch_next: entity.watch_triggers || [] });
}
for (const obs of arr(observationFeed.observations)) {
  ensureEntity(obs.name, { id: obs.id || slug(obs.name), type: 'observed entity', count: obs.count || 1, control_layers: obs.lanes || [], evidence_grades: obs.evidence_grades || [], source_events: obs.source_events || [], watch_next: [`Watch ${obs.name} across ${arr(obs.lanes).join(', ') || 'future source lanes'}.`] });
}
for (const event of arr(recordFeed.events)) {
  const names = uniq([...(event.entity_names || []), ...(event.institution_names || [])]).slice(0, 16);
  for (const name of names) {
    ensureEntity(name, { count: 1, control_layers: event.control_layers || [], evidence_grades: [event.evidence_grade || 'signal'], source_events: [event.id || event.source_url], records: [event], missing_records: event.missing_records || [], watch_next: [`Check whether new ${event.source_lane || 'source'} records repeat this name.`] });
  }
}
for (const rel of arr(relationshipFeed.relationships)) {
  ensureEntity(rel.from, { relationships: [rel], count: Math.max(1, Math.round((rel.score || 1) / 10)), control_layers: rel.control_layers || [], evidence_grades: rel.evidence_grades || [] });
  ensureEntity(rel.to, { relationships: [rel], count: Math.max(1, Math.round((rel.score || 1) / 10)), control_layers: rel.control_layers || [], evidence_grades: rel.evidence_grades || [] });
}

if (!entityMap.size) {
  ensureEntity('Control Structure', { type: 'system', count: 1, control_layers: ['money','identity','information','security','institutions','disclosure'], evidence_grades: ['hypothesis'], missing_records: ['Feed runner has not produced entity observations yet.'], watch_next: ['Wait for the next scheduled Machine Feed Runner pull.'] });
}

function evidenceSummary(entity){
  const grades = arr(entity.evidence_grades);
  if (grades.includes('proven / convicted')) return 'highest record grade present';
  if (grades.includes('charged / sued')) return 'legal record present';
  if (grades.includes('documented association')) return 'documented public-record association';
  if (grades.includes('signal only')) return 'signal only; needs primary record before stronger use';
  if (grades.includes('hypothesis')) return 'hypothesis or review lane';
  return grades[0] || 'not graded yet';
}
function plainJudgement(entity){
  const recordCount = arr(entity.records).length;
  const relCount = arr(entity.relationships).length;
  const layers = arr(entity.control_layers).length;
  if (recordCount >= 3 && relCount >= 2) return 'High-interest tracked entity because it appears across records and relationship candidates.';
  if (recordCount >= 1 && relCount >= 1) return 'Worth watching because records and relationship signals both exist.';
  if (recordCount >= 1) return 'A source route exists. More records are needed before drawing a stronger conclusion.';
  if (layers >= 3) return 'A structural entity in the control map. It needs current public records attached.';
  return 'Early-stage tracked item. Treat as a watch target until records accumulate.';
}
function briefFor(entity){
  const topRecords = arr(entity.records).slice(0, 5);
  const topRelations = arr(entity.relationships).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0, 5);
  const layers = arr(entity.control_layers);
  const brief = {
    id: entity.id,
    name: entity.name,
    type: entity.type || 'tracked entity',
    updated,
    at_a_glance: `${entity.name} is currently tracked as ${entity.type || 'an entity'} with ${topRecords.length} recent record route(s), ${topRelations.length} relationship candidate(s), and ${layers.length} control layer tag(s).`,
    what_changed: topRecords.length ? topRecords.map(r => clean(r.summary || r.source_lane || 'Record route updated')).slice(0, 5) : ['No new record movement attached yet.'],
    why_it_matters: layers.length ? `This entity touches: ${layers.slice(0, 6).join(', ')}.` : 'It is being watched because it appeared in the machine tracking layer.',
    evidence_grade: evidenceSummary(entity),
    plain_english_judgement: plainJudgement(entity),
    source_routes: topRecords.map(r => ({ title: r.summary || r.source_lane, url: r.source_url || 'machine-digest.html', grade: r.evidence_grade || 'not graded' })),
    connections: topRelations.map(r => ({ with: r.from === entity.name ? r.to : r.from, score: r.score, type: r.relationship_type, boundary: r.boundary })),
    missing_records: arr(entity.missing_records).length ? arr(entity.missing_records).slice(0, 8) : ['More primary records are needed before stronger conclusions are made.'],
    watch_next: arr(entity.watch_next).length ? arr(entity.watch_next).slice(0, 8) : ['Watch for new filings, contracts, court records, policy moves or procurement records involving this entity.'],
    boundary: 'This is a user-friendly tracking brief. It summarizes public-record signals and evidence grades; it is not a claim of private intent or wrongdoing.'
  };
  return brief;
}

const briefs = [...entityMap.values()].sort((a,b)=>(b.count||0)-(a.count||0) || a.name.localeCompare(b.name)).slice(0, 200).map(briefFor);
write('data/entity-daily-briefs.json', JSON.stringify({ updated, title: 'Entity Daily Briefs', purpose: 'User-friendly daily briefs for tracked people, institutions, companies, agencies and control-structure contributors.', boundary: 'Briefs summarize public-record signals with evidence grades. They do not replace source review.', briefs }, null, 2));

function miniBrief(brief){
  return `<article class="card redline"><span class="label">${esc(brief.type)} · ${esc(brief.evidence_grade)}</span><h3>${esc(brief.name)}</h3><p>${esc(brief.at_a_glance)}</p><p><strong>Judgement:</strong> ${esc(brief.plain_english_judgement)}</p><div class="cta-row small"><a class="btn" href="entity-briefs/${esc(brief.id)}.html">Open Brief</a><a class="btn alt" href="data/entity-daily-briefs.json">JSON</a></div></article>`;
}
function fullBriefPage(brief){
  const list = items => arr(items).map(x => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('') || '<li>No items yet.</li>';
  const sourceList = arr(brief.source_routes).map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a> — ${esc(x.grade)}</li>`).join('') || '<li>No source route attached yet.</li>';
  const connList = arr(brief.connections).map(x => `<li>${esc(x.with)} — score ${esc(x.score)} — ${esc(x.type)}</li>`).join('') || '<li>No relationship candidates yet.</li>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(brief.name)} Brief | Matrix Reprogrammed</title><meta name="description" content="User-friendly Matrix Reprogrammed entity brief for ${esc(brief.name)}."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../entity-daily-briefs.html">Entity Briefs</a><a href="../machine-intelligence.html">Machine Intelligence</a><a href="../evidence-vault.html">Evidence</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Entity Daily Brief</div><h1>${esc(brief.name).toUpperCase()}</h1><p class="lead">${esc(brief.at_a_glance)}</p><div class="cta-row"><a class="btn" href="../data/entity-daily-briefs.json">Briefs JSON</a><a class="btn alt" href="../machine-digest.html">Machine Digest</a></div></section><section class="section wrap split"><div class="terminal">AT A GLANCE\n&gt; type: ${esc(brief.type)}\n&gt; evidence: ${esc(brief.evidence_grade)}\n&gt; updated: ${esc(brief.updated)}\n&gt; boundary: public-record tracking brief</div><aside class="card redline"><h2>Plain-English Judgement</h2><p>${esc(brief.plain_english_judgement)}</p></aside></section><section class="section wrap"><div class="grid"><article class="card"><h2>What Changed</h2><ul>${list(brief.what_changed)}</ul></article><article class="card"><h2>Why It Matters</h2><p>${esc(brief.why_it_matters)}</p></article><article class="card"><h2>Source Routes</h2><ul>${sourceList}</ul></article><article class="card"><h2>Connections</h2><ul>${connList}</ul></article><article class="card"><h2>Missing Records</h2><ul>${list(brief.missing_records)}</ul></article><article class="card"><h2>Watch Next</h2><ul>${list(brief.watch_next)}</ul></article></div></section></main><footer class="footer wrap"><p><strong>Boundary:</strong> ${esc(brief.boundary)}</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script></body></html>`;
}
for (const brief of briefs.slice(0, 120)) write(`entity-briefs/${brief.id}.html`, fullBriefPage(brief));
const hub = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Entity Daily Briefs | Matrix Reprogrammed</title><meta name="description" content="User-friendly daily briefs for tracked people, institutions, companies, agencies and control-structure contributors."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="machine-intelligence.html">Machine Intelligence</a><a href="machine-digest.html">Machine Digest</a><a href="power-entities.html">Power Entities</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">User-Friendly Briefing Layer</div><h1>ENTITY DAILY BRIEFS.</h1><p class="lead">Plain-English briefs for tracked people, institutions, companies, agencies and control-structure contributors. Each brief separates what changed, why it matters, evidence grade, source routes, missing records and watch next.</p><div class="cta-row"><a class="btn" href="data/entity-daily-briefs.json">Briefs JSON</a><a class="btn alt" href="downloads/entity-daily-briefs.md">Download Briefs</a></div></section><section class="section wrap split"><div class="terminal">ENTITY BRIEFING FACTORY\n&gt; updated: ${esc(updated)}\n&gt; briefs generated: ${briefs.length}\n&gt; pages generated: ${Math.min(briefs.length,120)}\n&gt; style: user friendly\n&gt; boundary: source routes before conclusions</div><aside class="card redline"><h2>Eventually</h2><p>This layer is built to support daily briefs for every person, institution, company, agency, bank, foundation, NGO, contractor, media group and control-structure contributor the site tracks.</p></aside></section><section class="section wrap"><h2>Latest Entity Briefs</h2><div class="grid">${briefs.slice(0, 60).map(miniBrief).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — every entity gets a brief, every brief follows the record.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
write('entity-daily-briefs.html', hub);
const md = ['# Entity Daily Briefs', '', `Updated: ${updated}`, '', `Briefs generated: ${briefs.length}`, '', ...briefs.slice(0, 80).map(b => `## ${b.name}\n\nAt a glance: ${b.at_a_glance}\n\nJudgement: ${b.plain_english_judgement}\n\nEvidence: ${b.evidence_grade}\n\nWatch next: ${arr(b.watch_next).join('; ')}\n`)].join('\n');
write('downloads/entity-daily-briefs.md', md);
console.log(`Entity Daily Briefs built: ${briefs.length} briefs.`);
