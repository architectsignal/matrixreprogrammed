const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function readJson(name){ return JSON.parse(read(name)); }
const failures = [];
function expectFile(name){ if (!exists(name)) failures.push(`${name} missing`); }
function expectText(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }
function forbidText(name, marker){ if (exists(name) && read(name).includes(marker)) failures.push(`${name} contains forbidden ${marker}`); }

[
  'data/record-events.json',
  'data/entity-observations.json',
  'data/source-pulls/source-pull-index.json',
  'machine-digest.html',
  'downloads/machine-digest.md'
].forEach(expectFile);

if (exists('data/record-events.json')) {
  const events = readJson('data/record-events.json');
  if (!Array.isArray(events.events)) failures.push('record-events.json events must be an array');
  if (!Array.isArray(events.pullSummary)) failures.push('record-events.json pullSummary must be an array');
  if (!String(events.boundary || '').includes('evidence')) failures.push('record-events.json missing evidence boundary');
  for (const event of events.events || []) {
    for (const name of [...(event.entity_names || []), ...(event.institution_names || [])]) {
      if (String(name).includes('[object Object]')) failures.push(`record event ${event.id || 'unknown'} contains object-placeholder name`);
    }
  }
}
if (exists('data/entity-observations.json')) {
  const obs = readJson('data/entity-observations.json');
  if (!Array.isArray(obs.observations)) failures.push('entity-observations.json observations must be an array');
  if (!String(obs.purpose || '').includes('candidates')) failures.push('entity-observations.json missing candidate boundary');
  for (const item of obs.observations || []) if (!item?.name || String(item.name).includes('[object Object]')) failures.push(`invalid entity observation name: ${item?.id || 'unknown'}`);
}
expectText('machine-digest.html', 'MACHINE DIGEST');
expectText('machine-digest.html', 'data/record-events.json');
expectText('daily-brain-brief.html', 'public-record-feed-section');
expectText('data/daily-brain-brief.json', 'publicRecordFeed');
for (const file of ['machine-digest.html','daily-brain-brief.html','downloads/machine-digest.md','downloads/daily-brain-brief.md','data/daily-brain-brief.json']) forbidText(file, '[object Object]');

if (failures.length) {
  console.error('MACHINE FEED RUNNER TEST FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('MACHINE FEED RUNNER TEST PASSED');
