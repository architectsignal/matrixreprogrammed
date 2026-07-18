const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(fp(name)), { recursive: true }); fs.writeFileSync(fp(name), value); }
function readJson(name, fallback){ try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; } }
function scalarText(value, depth = 0){
  if (value == null || depth > 5) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name','label','title','display_name','displayName','entity','value','text','description','project_name','countryname','agency_name']) {
      const candidate = scalarText(value[key], depth + 1);
      if (candidate) return candidate;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function clean(value = ''){
  return scalarText(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[object Object\]|\bobject Object\b|\[object Array\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function esc(value = ''){ return clean(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
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

function stableKey(event){ return clean(event.id) || clean(event.source_record_id) || clean(event.source_url) || slug(event.summary || event.source_lane || 'record'); }
function eventNames(event){ return uniq([...arr(event.entity_names), ...arr(event.institution_names)]).filter(name => name.length > 2); }
function comparable(event){ return { date: clean(event.date), lane: clean(event.source_lane), type: clean(event.record_type), grade: clean(event.evidence_grade), source: clean(event.source_url), summary: clean(event.summary), names: eventNames(event).sort(), layers: uniq(event.control_layers).sort() }; }
function snapshotRecord(event){ return { key: stableKey(event), hash: hashRecord(comparable(event)), summary: clean(event.summary), source_lane: clean(event.source_lane), evidence_grade: clean(event.evidence_grade), source_url: clean(event.source_url), date: clean(event.date), names: eventNames(event) }; }

const current = currentEvents.map(snapshotRecord);
const currentMap = new Map(current.map(record => [record.key, record]));
const previousMap = new Map(previousRecords.map(record => [record.key, record]));
const newRecords = current.filter(record => !previousMap.has(record.key));
const removedRecords = previousRecords.filter(record => !currentMap.has(record.key));
const changedRecords = current.filter(record => previousMap.has(record.key) && previousMap.get(record.key).hash !== record.hash).map(record => ({ before: previousMap.get(record.key), after: record }));

const gradeWeight = { 'proven / convicted': 8, 'charged / sued': 6, 'documented association': 5, 'public-record conflict': 4, 'credible allegation': 3, 'hypothesis': 2, 'signal only': 1, 'unsupported claim': 0 };
const relationshipMap = new Map();
for (const event of currentEvents) {
  const names = eventNames(event).slice(0, 12);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      if (!a || !b || a === b) continue;
      const key = [slug(a), slug(b)].sort().join('__');
      const prior = relationshipMap.get(key) || { id: key, from: a, to: b, count: 0, lanes: [], record_types: [], evidence_grades: [], source_events: [], control_layers: [], score: 0, grade: 'candidate' };
      prior.count += 1;
      prior.lanes = uniq([...prior.lanes, event.source_lane]);
      prior.record_types = uniq([...prior.record_types, event.record_type]);
      prior.evidence_grades = uniq([...prior.evidence_grades, event.evidence_grade]);
      prior.control_layers = uniq([...prior.control_layers, ...arr(event.control_layers)]);
      prior.source_events = uniq([...prior.source_events, event.id || event.source_url]).slice(0, 12);
      prior.score += 1 + (gradeWeight[clean(event.evidence_grade)] || 0) + Math.min(uniq(event.control_layers).length, 4);
      relationshipMap.set(key, prior);
    }
  }
}
const relationships = [...relationshipMap.values()].map(link => {
  const score = Math.round(link.score);
  return { ...link, score, relationship_type: score >= 20 ? 'repeated public-record co-occurrence' : score >= 10 ? 'public-record co-occurrence' : 'weak co-occurrence signal', boundary: 'Relationship scoring means repeated co-appearance in records. It is not a claim of private coordination.' };
}).filter(link => clean(link.from) && clean(link.to)).sort((a, b) => b.score - a.score).slice(0, 150);

const clockTriggers = newRecords.concat(changedRecords.map(item => item.after)).slice(0, 24).map(record => ({ id: record.key, lane: record.source_lane, evidence_grade: record.evidence_grade, summary: record.summary, trigger: `Review ${record.source_lane || 'record lane'} for clock movement.`, source_url: record.source_url }));
const evidenceUpgrades = changedRecords.filter(item => (gradeWeight[item.after.evidence_grade] || 0) > (gradeWeight[item.before.evidence_grade] || 0)).map(item => ({ id: item.after.key, from: item.before.evidence_grade, to: item.after.evidence_grade, summary: item.after.summary, source_url: item.after.source_url }));
const repeatedEntities = arr(observationsFeed.observations).filter(observation => clean(observation.name) && Number(observation.count || 0) > 1).slice(0, 40);

const changeDetection = { updated, title: 'Change Detection Engine', purpose: 'Compare current public-record events with the previous machine snapshot. Detect new records, removed records, changed records, evidence movement and clock triggers.', boundary: 'Change detection flags movement. It does not interpret intent.', previousUpdated: previousSnapshot.updated || null, currentRecordCount: current.length, previousRecordCount: previousRecords.length, newRecords, removedRecords: removedRecords.slice(0, 80), changedRecords: changedRecords.slice(0, 80), evidenceUpgrades, clockTriggers, repeatedEntities };
const relationshipScores = { updated, title: 'Entity Relationship Scores', purpose: 'Score repeated public-record co-occurrences between names found in record events. These are candidates for review by the Power Entity Engine.', boundary: 'Scores are based on records, lanes, evidence grades and repetition. They are relationship candidates, not conclusions.', relationships };
write('data/change-detection.json', `${JSON.stringify(changeDetection, null, 2)}\n`);
write('data/entity-relationship-scores.json', `${JSON.stringify(relationshipScores, null, 2)}\n`);
write('data/machine-state/record-event-snapshot.json', `${JSON.stringify({ updated, records: current }, null, 2)}\n`);

let brain = readJson('data/daily-brain-brief.json', null);
if (brain) {
  brain.changeDetection = { updated, newRecordCount: newRecords.length, changedRecordCount: changedRecords.length, removedRecordCount: removedRecords.length, relationshipCandidateCount: relationships.length, evidenceUpgradeCount: evidenceUpgrades.length, machineIntelligenceRoute: 'machine-intelligence.html', changeDetectionRoute: 'data/change-detection.json', relationshipScoresRoute: 'data/entity-relationship-scores.json', boundary: changeDetection.boundary };
  brain.topChangeSignals = newRecords.slice(0, 8).map(record => ({ lane: record.source_lane, grade: record.evidence_grade, summary: record.summary, source_url: record.source_url }));
  write('data/daily-brain-brief.json', `${JSON.stringify(brain, null, 2)}\n`);
}

function recordCard(record){ return `<article class="card redline"><span class="label">${esc(record.evidence_grade || 'record')}</span><h3>${esc(record.summary || record.key)}</h3><p><strong>Lane:</strong> ${esc(record.source_lane || 'unknown')}</p><p><a class="btn alt" href="${esc(record.source_url || 'machine-digest.html')}" target="_blank" rel="noopener">Open source route</a></p></article>`; }
function linkCard(link){ return `<article class="card"><span class="label">SCORE ${esc(link.score)}</span><h3>${esc(link.from)} ↔ ${esc(link.to)}</h3><p>${esc(link.relationship_type)}</p><p><strong>Lanes:</strong> ${esc(link.lanes.join(', '))}</p><p><strong>Boundary:</strong> ${esc(link.boundary)}</p></article>`; }
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Machine Intelligence | Matrix Reprogrammed</title><meta name="description" content="Machine Intelligence: change detection, record movement, entity relationship scoring, evidence movement and clock triggers."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary"><a href="machine-digest.html">Machine Digest</a><a href="daily-brain-brief.html">Daily Brain</a><a href="power-entities.html">Power Entities</a><a href="evidence-vault.html">Evidence Vault</a><a href="search.html">Search</a></div></nav></header><main><section class="hero wrap"><div class="eyebrow">Change Detection · Relationship Scoring</div><h1>MACHINE INTELLIGENCE.</h1><p class="lead">The site watches what changed, what appeared, what disappeared, which names repeat, and which public-record co-occurrences deserve review.</p><div class="cta-row"><a class="btn" href="data/change-detection.json">Change JSON</a><a class="btn alt" href="data/entity-relationship-scores.json">Relationship Scores</a><a class="btn alt" href="machine-digest.html">Machine Digest</a></div></section><section class="section wrap split"><div class="terminal">MACHINE INTELLIGENCE\n&gt; updated: ${esc(updated)}\n&gt; current records: ${current.length}\n&gt; previous records: ${previousRecords.length}\n&gt; new records: ${newRecords.length}\n&gt; changed records: ${changedRecords.length}\n&gt; relationship candidates: ${relationships.length}\n&gt; evidence upgrades: ${evidenceUpgrades.length}</div><aside class="card redline"><h2>Boundary</h2><p>Change detection observes movement. Relationship scores show public-record co-occurrence. Neither is a conclusion by itself.</p></aside></section><section class="section wrap"><h2>New Record Signals</h2><div class="grid">${newRecords.slice(0, 18).map(recordCard).join('') || '<article class="card redline"><h3>No new records against previous snapshot</h3><p>The machine will detect movement on the next run.</p></article>'}</div></section><section class="section wrap"><h2>Relationship Candidates</h2><div class="grid">${relationships.slice(0, 18).map(linkCard).join('') || '<article class="card"><h3>No relationship candidates yet</h3><p>Repeated names across events will appear here.</p></article>'}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — observe change, then follow the records.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script><script src="analytics.js"></script></body></html>`;
write('machine-intelligence.html', html);
const markdown = ['# Machine Intelligence', '', `Updated: ${updated}`, '', `Current records: ${current.length}`, `Previous records: ${previousRecords.length}`, `New records: ${newRecords.length}`, `Changed records: ${changedRecords.length}`, `Relationship candidates: ${relationships.length}`, '', '## New Records', '', ...newRecords.slice(0, 30).map(record => `- ${record.evidence_grade}: ${record.summary} — ${record.source_lane} — ${record.source_url}`), '', '## Relationship Candidates', '', ...relationships.slice(0, 30).map(relationship => `- Score ${relationship.score}: ${relationship.from} ↔ ${relationship.to} — ${relationship.relationship_type}`), ''].join('\n');
write('downloads/machine-intelligence.md', `${markdown}\n`);

const generated = [JSON.stringify(changeDetection), JSON.stringify(relationshipScores), html, markdown].join('\n');
if (/\[object Object\]|\bobject Object\b/i.test(generated)) throw new Error('Change Detection Engine produced an object placeholder');
console.log(`Change Detection Engine complete: ${newRecords.length} new, ${changedRecords.length} changed, ${relationships.length} relationship candidates.`);