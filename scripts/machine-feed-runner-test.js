const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function readJson(name){ return JSON.parse(read(name)); }
const failures = [];
function expectFile(name){ if (!exists(name)) failures.push(`${name} missing`); }
function expectText(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }

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
}
if (exists('data/entity-observations.json')) {
  const obs = readJson('data/entity-observations.json');
  if (!Array.isArray(obs.observations)) failures.push('entity-observations.json observations must be an array');
  if (!String(obs.purpose || '').includes('candidates')) failures.push('entity-observations.json missing candidate boundary');
}
expectText('machine-digest.html', 'MACHINE DIGEST');
expectText('machine-digest.html', 'data/record-events.json');
expectText('daily-brain-brief.html', 'public-record-feed-section');
expectText('data/daily-brain-brief.json', 'publicRecordFeed');
expectText('search-index.json', 'machine-digest.html');
expectText('search-index.json', 'data/record-events.json');

if (failures.length) {
  console.error('MACHINE FEED RUNNER TEST FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('MACHINE FEED RUNNER TEST PASSED');
