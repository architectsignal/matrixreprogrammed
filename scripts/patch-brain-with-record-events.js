const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(file(name)), { recursive: true }); fs.writeFileSync(file(name), value); }
function readJson(name, fallback){ try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; } }
function esc(value = ''){ return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function arr(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }

const recordEvents = readJson('data/record-events.json', { events: [], pullSummary: [] });
const entityObservations = readJson('data/entity-observations.json', { observations: [] });
const brain = readJson('data/daily-brain-brief.json', null);
const events = arr(recordEvents.events).slice(0, 12);
const observations = arr(entityObservations.observations).slice(0, 12);

if (brain) {
  brain.publicRecordFeed = {
    updated: recordEvents.updated || new Date().toISOString(),
    eventCount: arr(recordEvents.events).length,
    feedCount: arr(recordEvents.pullSummary).length,
    reachedFeedCount: arr(recordEvents.pullSummary).filter(x => x && x.ok).length,
    entityObservationCount: arr(entityObservations.observations).length,
    digestRoute: 'machine-digest.html',
    recordEventsRoute: 'data/record-events.json',
    boundary: 'Public-record feed events are additive machine inputs. They do not replace existing Live Intel or Daily Brain updates.'
  };
  brain.topRecordEvents = events.map(event => ({ id: event.id, date: event.date, lane: event.source_lane, evidence_grade: event.evidence_grade, summary: event.summary, source_url: event.source_url, send_to: event.send_to }));
  brain.entityObservationSignals = observations.map(obs => ({ id: obs.id, name: obs.name, count: obs.count, lanes: obs.lanes, record_types: obs.record_types }));
  brain.missingRecords = [...arr(brain.missingRecords), ...events.flatMap(event => arr(event.missing_records).map(record => ({ section: event.source_lane, record })))].slice(0, 24);
  brain.tomorrowWatchList = [...arr(brain.tomorrowWatchList), 'Review Machine Digest for any new public-record event that should upgrade an entity file, risk clock, evidence vault route or outcome briefing.'].slice(0, 12);
  write('data/daily-brain-brief.json', JSON.stringify(brain, null, 2));
}

function eventCard(event){
  return `<article class="card redline"><span class="label">${esc(event.evidence_grade)} · ${esc(event.source_lane)}</span><h3>${esc(event.summary)}</h3><p><strong>Record type:</strong> ${esc(event.record_type)}</p><p><a class="btn alt" href="${esc(event.source_url || 'machine-digest.html')}" target="_blank" rel="noopener">Open source route</a></p></article>`;
}
function obsCard(obs){
  return `<article class="card"><span class="label">ENTITY OBSERVATION</span><h3>${esc(obs.name)}</h3><p><strong>Mentions:</strong> ${esc(obs.count)}</p><p><strong>Lanes:</strong> ${esc(arr(obs.lanes).join(', '))}</p></article>`;
}

if (exists('daily-brain-brief.html') && !read('daily-brain-brief.html').includes('id="public-record-feed-section"')) {
  let html = read('daily-brain-brief.html');
  const block = `<section id="public-record-feed-section" class="section wrap"><h2>Public Record Feed Inputs</h2><p class="lead">Machine Feed Runner adds source-first public-record events to the brain without replacing existing updates.</p><div class="cta-row"><a class="btn" href="machine-digest.html">Open Machine Digest</a><a class="btn alt" href="data/record-events.json">Record Events JSON</a><a class="btn alt" href="data/entity-observations.json">Entity Observations</a></div><div class="grid">${events.slice(0, 6).map(eventCard).join('') || '<article class="card redline"><h3>No pulled records yet</h3><p>The intake system is ready. Events will appear when public endpoints return records.</p></article>'}</div></section><section class="section wrap"><h2>Entity Observation Signals</h2><div class="grid">${observations.slice(0, 6).map(obsCard).join('') || '<article class="card"><h3>No entity observations yet</h3><p>Repeated names from records will appear here after feed pulls.</p></article>'}</div></section>`;
  html = html.includes('</main>') ? html.replace('</main>', block + '</main>') : html + block;
  write('daily-brain-brief.html', html);
}

if (exists('downloads/daily-brain-brief.md') && !read('downloads/daily-brain-brief.md').includes('## Public Record Feed Inputs')) {
  const md = read('downloads/daily-brain-brief.md') + ['','## Public Record Feed Inputs','',`Machine Digest: machine-digest.html`,`Record events: ${events.length}`,`Entity observations: ${observations.length}`,'',...events.slice(0, 12).map(event => `- ${event.evidence_grade}: ${event.summary} — ${event.source_lane} — ${event.source_url}`),''].join('\n');
  write('downloads/daily-brain-brief.md', md);
}

console.log(`Daily Brain record-event patch complete: ${events.length} events, ${observations.length} observations.`);
