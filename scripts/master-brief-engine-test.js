const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function json(name){ return JSON.parse(read(name)); }
const failures = [];
function file(name){ if (!exists(name)) failures.push(`${name} missing`); }
function text(name, marker){ if (!exists(name) || !read(name).includes(marker)) failures.push(`${name} missing ${marker}`); }
[
  'data/master-brief-engine.json',
  'data/daily-command-brief.json',
  'data/brief-quality-report.json',
  'data/missing-records.json',
  'data/billionaire-control-index.json',
  'data/institution-control-index.json',
  'data/subject-briefs.json',
  'data/contradictions.json',
  'data/main-player-profiles.json',
  'data/entity-timelines.json',
  'daily-command-brief.html',
  'brief-quality-report.html',
  'daily-missing-records.html',
  'billionaire-control-tracker.html',
  'institution-control-tracker.html',
  'subject-briefs.html',
  'contradiction-watch.html',
  'main-player-profiles.html',
  'entity-timelines.html',
  'downloads/daily-command-brief.md',
  'downloads/master-brief-engine.md'
].forEach(file);
if (exists('data/master-brief-engine.json')) {
  const data = json('data/master-brief-engine.json');
  if (!Array.isArray(data.outputs)) failures.push('master brief outputs must be array');
  if (!String(data.boundary || '').includes('source-grade')) failures.push('master brief boundary missing source-grade marker');
}
if (exists('data/daily-command-brief.json')) {
  const data = json('data/daily-command-brief.json');
  if (!Array.isArray(data.topContractors)) failures.push('command brief topContractors must be array');
  if (!Array.isArray(data.missingRecords)) failures.push('command brief missingRecords must be array');
}
if (exists('data/billionaire-control-index.json')) {
  const data = json('data/billionaire-control-index.json');
  if (!Array.isArray(data.profiles) || data.profiles.length < 5) failures.push('billionaire tracker needs seed profiles');
}
if (exists('data/institution-control-index.json')) {
  const data = json('data/institution-control-index.json');
  if (!Array.isArray(data.profiles) || data.profiles.length < 5) failures.push('institution tracker needs seed profiles');
}
text('daily-command-brief.html', 'DAILY COMMAND BRIEF');
text('billionaire-control-tracker.html', 'BILLIONAIRE CONTROL TRACKER');
text('institution-control-tracker.html', 'INSTITUTION CONTROL TRACKER');
text('subject-briefs.html', 'SUBJECT BRIEFS');
text('data/daily-brain-brief.json', 'masterBriefEngine');
if (failures.length) {
  console.error('MASTER BRIEF ENGINE TEST FAILED');
  for (const f of failures) console.error('- ' + f);
  process.exit(1);
}
console.log('MASTER BRIEF ENGINE TEST PASSED');
