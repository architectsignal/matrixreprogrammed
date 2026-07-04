const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function json(name){ return JSON.parse(read(name)); }
const failures = [];
function file(name){ if (!exists(name)) failures.push(`${name} missing`); }
function text(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }

['data/entity-daily-briefs.json','entity-daily-briefs.html','downloads/entity-daily-briefs.md'].forEach(file);
if (exists('data/entity-daily-briefs.json')) {
  const data = json('data/entity-daily-briefs.json');
  if (!Array.isArray(data.briefs)) failures.push('entity-daily-briefs briefs must be array');
  if (!data.briefs.length) failures.push('entity-daily-briefs must contain at least one brief');
  const first = data.briefs[0] || {};
  ['at_a_glance','what_changed','why_it_matters','evidence_grade','plain_english_judgement','source_routes','missing_records','watch_next'].forEach(key => { if (!(key in first)) failures.push(`brief missing ${key}`); });
  if (!String(data.boundary || '').includes('source review')) failures.push('brief data missing source review boundary');
}
text('entity-daily-briefs.html', 'ENTITY DAILY BRIEFS');
text('entity-daily-briefs.html', 'Plain-English briefs');
text('downloads/entity-daily-briefs.md', 'At a glance:');
if (failures.length) {
  console.error('ENTITY DAILY BRIEFS TEST FAILED');
  for (const f of failures) console.error('- ' + f);
  process.exit(1);
}
console.log('ENTITY DAILY BRIEFS TEST PASSED');
