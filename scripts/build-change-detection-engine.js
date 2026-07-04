const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(fp(name)), { recursive: true }); fs.writeFileSync(fp(name), value); }
function readJson(name, fallback){ try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; } }
function esc(value = ''){ return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function slug(value = 'item'){ return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'item'; }
function arr(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items){ return [...new Set(arr(items).map(clean).filter(Boolean))]; }
function hashRecord(value){ return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex').slice(0, 16); }

const updated = new Date().toISOString();
const eventsFeed = readJson('data/record-events.json', { events: [] });
const observationsFeed = readJson('data/entity-observations.json', { observations: [] });
const previousSnapshot = readJson('data/machine-state/record-event-snapshot.json', { updated: null, records: [] });
const currentEvents = arr(eventsFeed.events);
const previousRecords = arr(previousSnapshot.records);

function stableKey(event){ return event.id || event.source_record_id || event.source_url || slug(event.summary || event.source_lane || 'record'); }
function comparable(event){ return { date: event.date, lane: event.source_lane, type: event.record_type, grade: event.evidence_grade, source: event.source_url, summary: event.summary, names: uniq([...(event.entity_names || []), ...(event.institution_names || [])]).sort(), layers: arr(event.control_layers).sort() }; }
function snapshotRecord(event){ return { key: stableKey(event), hash: hashRecord(comparable(event)), summary: clean(event.summary), source_lane: event.source_lane, evidence_grade: event.evidence_grade, source_url: event.source_url, date: event.date, names: uniq([...(event.entity_names || []), ...(event.institution_names || [])]) }; }

const current = currentEvents.map(snapshotRecord);
const currentMap = new Map(current.map(r => [r.key, r]));
const previousMap = new Map(previousRecords.map(r => [r.key, r]));
const newRecords = current.filter(r => !previousMap.has(r.key));
const removedRecords = previousRecords.filter(r => !currentMap.has(r.key));
const changedRecords = current.filter(r => previousMap.has(r.key) && previousMap.get(r.key).hash !== r.hash).map(r => ({ before: previousMap.get(r.key), after: r }));

const gradeWeight = { 'proven / convicted': 8, 'charged / sued': 6, 'documented association': 5, 'public-record conflict': 4, 'credible allegation': 3, 'hypothesis': 2, 'signal only': 1, 'unsupported claim': 0 };
const relationshipMap = new Map();
for (const event of currentEvents) {
  const names = uniq([...(event.entity_names || []), ...(event.institution_names || [])]).filter(name => name.length > 2).slice(0, 12);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const key = [slug(a), slug(b)].sort().join('__');
      const prior = relationshipMap.get(key) || { id: key, from: a, to: b, count: 0, lanes: [], record_types: [], evidence_grades: [], source_events: [], control_layers: [], score: 0, grade: 'candidate' };
      prior.count += 1;
      prior.lanes = uniq([...prior.lanes, event.source_lane]);
      prior.record_types = uniq([...prior.record_types, event.record_type]);
      prior.evidence_grades = uniq([...prior.evidence_grades, event.evidence_grade]);
      prior.control_layers = uniq([...prior.control_layers, ...(event.control_layers || [])]);
      prior.source_events = uniq([...prior.source_events, event.id || event.source_url]).slice(0, 12);
      prior.score += 1 + (gradeWeight[event.evidence_grade] || 0) + Math.min(arr(event.control_layers).length, 4);
      relationshipMap.set(key, prior);
    }
  }
}
const relationships = [...relationshipMap.values()].map(link => {
  const score = Math.round(link.score);
  return { ...link, score, relationship_type: score >= 20 ? 'repeated public-record co-occurrence' : score >= 10 ? 'public-record co-occurrence' : 'weak co-occurrence signal', boundary: 'Relationship scoring means repeated co-appearance in records. It is not a claim of private coordination.' };
}).sort((a, b) => b.score - a.score).slice(0, 150);

const clockTriggers = newRecords.concat(changedRecords.map(x => x.after)).slice(0, 24).map(record => ({ id: record.key, lane: record.source_lane, evidence_grade: record.evidence_grade, summary: record.summary, trigger: `Review ${record.source_lane || 'record lane'} for clock movement.`, source_url: record.source_url }));
const evidenceUpgrades = changedRecords.filter(x => (gradeWeight[x.after.evidence_grade] || 0) > (gradeWeight[x.before.evidence_grade] || 0)).map(x => ({ id: x.after.key, from: x.before.evidence_grade, to: x.after.evidence_grade, summary: x.after.summary, source_url: x.after.source_url }));
const repeatedEntities = arr(observationsFeed.observations).filter(obs => Number(obs.count || 0) > 1).slice(0, 40);

const changeDetection = { updated, title: 'Change Detection Engine', purpose: 'Compare current public-record events with the previous machine snapshot. Detect new records, removed records, changed records, evidence movement and clock triggers.', boundary: 'Change detection flags movement. It does not interpret intent.', previousUpdated: previousSnapshot.updated || null, currentRecordCount: current.length, previousRecordCount: previousRecords.length, newRecords, removedRecords: removedRecords.slice(0, 80), changedRecords: changedRecords.slice(0, 80), evidenceUpgrades, clockTriggers, repeatedEntities };
const relationshipScores = { updated, title: 'Entity Relationship Scores', purpose: 'Score repeated public-record co-occurrences between names found in record events. These are candidates for review by the Power Entity Engine.', boundary: 'Scores are based on records, lanes, evidence grades and repetition. They are relationship candidates, not conclusions.', relationships };
write('data/change-detection.json', JSON.stringify(changeDetection, null, 2));
write('data/entity-relationship-scores.json', JSON.stringify(relationshipScores, null, 2));
write('data/machine-state/record-event-snapshot.json', JSON.stringify({ updated, records: current }, null, 2));

let brain = readJson('data/daily-brain-brief.json', null);
if (brain) {
  brain.changeDetection = { updated, newRecordCount: newRecords.length, changedRecordCount: changedRecords.length, removedRecordCount: removedRecords.length, relationshipCandidateCount: relationships.length, evidenceUpgradeCount: evidenceUpgrades.length, machineIntelligenceRoute: 'machine-intelligence.html', changeDetectionRoute: 'data/change-detection.json', relationshipScoresRoute: 'data/entity-relationship-scores.json', boundary: changeDetection.boundary };
  brain.topChangeSignals = newRecords.slice(0, 8).map(r => ({ lane: r.source_lane, grade: r.evidence_grade, summary: r.summary, source_url: r.source_url }));
  write('data/daily-brain-brief.json', JSON.stringify(brain, null, 2));
}

function recordCard(record){ return `<article class="card redline"><span class="label">${esc(record.evidence_grade || 'record')}</span><h3>${esc(record.summary || record.key)}</h3><p><strong>Lane:</strong> ${esc(record.source_lane || 'unknown')}</p><p><a class="btn alt" href="${esc(record.source_url || 'machine-digest.html')}" target="_blank" rel="noopener">Open source route</a></p></article>`; }
function linkCard(link){ return `<article class="card"><span class="label">SCORE ${esc(link.score)}</span><h3>${esc(link.from)} ↔ ${esc(link.to)}</h3><p>${esc(link.relationship_type)}</p><p><strong>Lanes:</strong> ${esc(link.lanes.join(', '))}</p><p><strong>Boundary:</strong> ${esc(link.boundary)}</p></article>`; }
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Machine Intelligence | Matrix Reprogrammed</title><meta name="description" content="Machine Intelligence: change detection, record movement, entity relationship scoring, evidence movement and clock triggers."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary"><a href="machine-digest.html">Machine Digest</a><a href="daily-brain-brief.html">Daily Brain</a><a href="power-entities.html">Power Entities</a><a href="evidence-vault.html">Evidence Vault</a><a href="search.html">Search</a></div><details class="nav-more"><summary>More</summary><div class="nav-drawer"><div class="nav-group"><strong>Machine Data</strong><a href="data/change-detection.json">Change Detection</a><a href="data/entity-relationship-scores.json">Relationship Scores</a><a href="data/record-events.json">Record Events</a><a href="data/entity-observations.json">Entity Observations</a></div></div></details></nav></header><main><section class="hero wrap"><div class="eyebrow">Change Detection · Relationship Scoring</div><h1>MACHINE INTELLIGENCE.</h1><p class="lead">The site now watches what changed, what appeared, what disappeared, which names repeat, and which public-record co-occurrences deserve review.</p><div class="cta-row"><a class="btn" href="data/change-detection.json">Change JSON</a><a class="btn alt" href="data/entity-relationship-scores.json">Relationship Scores</a><a class="btn alt" href="machine-digest.html">Machine Digest</a></div></section><section class="section wrap split"><div class="terminal">MACHINE INTELLIGENCE\n&gt; updated: ${esc(updated)}\n&gt; current records: ${current.length}\n&gt; previous records: ${previousRecords.length}\n&gt; new records: ${newRecords.length}\n&gt; changed records: ${changedRecords.length}\n&gt; relationship candidates: ${relationships.length}\n&gt; evidence upgrades: ${evidenceUpgrades.length}</div><aside class="card redline"><h2>Boundary</h2><p>Change detection observes movement. Relationship scores show public-record co-occurrence. Neither is a conclusion by itself.</p></aside></section><section class="section wrap"><h2>New Record Signals</h2><div class="grid">${newRecords.slice(0, 18).map(recordCard).join('') || '<article class="card redline"><h3>No new records against previous snapshot</h3><p>The machine will detect movement on the next run.</p></article>'}</div></section><section class="section wrap"><h2>Relationship Candidates</h2><div class="grid">${relationships.slice(0, 18).map(linkCard).join('') || '<article class="card"><h3>No relationship candidates yet</h3><p>Repeated names across events will appear here.</p></article>'}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — observe change, then follow the records.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script><script src="analytics.js"></script></body></html>`;
write('machine-intelligence.html', html);
const md = ['# Machine Intelligence', '', `Updated: ${updated}`, '', `Current records: ${current.length}`, `Previous records: ${previousRecords.length}`, `New records: ${newRecords.length}`, `Changed records: ${changedRecords.length}`, `Relationship candidates: ${relationships.length}`, '', '## New Records', '', ...newRecords.slice(0, 30).map(r => `- ${r.evidence_grade}: ${r.summary} — ${r.source_lane} — ${r.source_url}`), '', '## Relationship Candidates', '', ...relationships.slice(0, 30).map(r => `- Score ${r.score}: ${r.from} ↔ ${r.to} — ${r.relationship_type}`), ''].join('\n');
write('downloads/machine-intelligence.md', md);

if (exists('daily-brain-brief.html') && !read('daily-brain-brief.html').includes('id="machine-intelligence-section"')) {
  let page = read('daily-brain-brief.html');
  const block = `<section id="machine-intelligence-section" class="section wrap"><h2>Machine Intelligence Signals</h2><p class="lead">Change Detection Engine adds record movement and entity relationship scoring without replacing existing updates.</p><div class="cta-row"><a class="btn" href="machine-intelligence.html">Open Machine Intelligence</a><a class="btn alt" href="data/change-detection.json">Change Detection JSON</a><a class="btn alt" href="data/entity-relationship-scores.json">Relationship Scores</a></div></section>`;
  page = page.includes('</main>') ? page.replace('</main>', block + '</main>') : page + block;
  write('daily-brain-brief.html', page);
}
console.log(`Change Detection Engine complete: ${newRecords.length} new, ${changedRecords.length} changed, ${relationships.length} relationship candidates.`);
