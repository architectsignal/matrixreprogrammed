const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function json(name){ return JSON.parse(read(name)); }
const failures = [];
function file(name){ if (!exists(name)) failures.push(`${name} missing`); }
function text(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }
['data/private-contractor-intelligence.json','private-contractor-tracker.html','downloads/private-contractor-intelligence.md'].forEach(file);
if (exists('data/private-contractor-intelligence.json')) {
  const data = json('data/private-contractor-intelligence.json');
  if (!Array.isArray(data.profiles)) failures.push('private contractor profiles must be array');
  if (data.profiles.length < 5) failures.push('private contractor tracker should contain at least five profiles');
  const blackwater = data.profiles.find(p => String(p.name || '').toLowerCase().includes('blackwater'));
  if (!blackwater) failures.push('Blackwater / Constellis lineage missing');
  if (blackwater && !Array.isArray(blackwater.main_players)) failures.push('Blackwater profile missing main players');
  const first = data.profiles[0] || {};
  ['contractor_score','contractor_level','main_players','source_routes','missing_records','watch_next','boundary'].forEach(key => { if (!(key in first)) failures.push(`contractor profile missing ${key}`); });
  if (!String(data.boundary || '').includes('Association is not guilt')) failures.push('contractor tracker missing association boundary');
}
text('private-contractor-tracker.html', 'PRIVATE CONTRACTOR TRACKER');
text('private-contractor-tracker.html', 'Contractor Profiles');
text('data/daily-brain-brief.json', 'privateContractorIntelligence');
if (failures.length) {
  console.error('PRIVATE CONTRACTOR INTELLIGENCE TEST FAILED');
  for (const f of failures) console.error('- ' + f);
  process.exit(1);
}
console.log('PRIVATE CONTRACTOR INTELLIGENCE TEST PASSED');
