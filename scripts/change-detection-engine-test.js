const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function json(name){ return JSON.parse(read(name)); }
const failures = [];
function file(name){ if (!exists(name)) failures.push(`${name} missing`); }
function text(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }

['data/change-detection.json','data/entity-relationship-scores.json','data/machine-state/record-event-snapshot.json','machine-intelligence.html','downloads/machine-intelligence.md'].forEach(file);
if (exists('data/change-detection.json')) {
  const data = json('data/change-detection.json');
  if (!Array.isArray(data.newRecords)) failures.push('change-detection newRecords must be array');
  if (!Array.isArray(data.changedRecords)) failures.push('change-detection changedRecords must be array');
  if (!String(data.boundary || '').includes('movement')) failures.push('change-detection boundary missing movement marker');
}
if (exists('data/entity-relationship-scores.json')) {
  const data = json('data/entity-relationship-scores.json');
  if (!Array.isArray(data.relationships)) failures.push('relationship scores must be array');
  if (!String(data.boundary || '').includes('relationship candidates')) failures.push('relationship boundary missing candidate marker');
}
text('machine-intelligence.html', 'MACHINE INTELLIGENCE');
text('machine-intelligence.html', 'data/change-detection.json');
text('data/daily-brain-brief.json', 'changeDetection');
if (failures.length) {
  console.error('CHANGE DETECTION ENGINE TEST FAILED');
  for (const f of failures) console.error('- ' + f);
  process.exit(1);
}
console.log('CHANGE DETECTION ENGINE TEST PASSED');
