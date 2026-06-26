const fs = require('fs');
const path = require('path');
const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }

for(const file of [
  'scripts/build-evidence-badge-system.js',
  'claim-classifier.html',
  'downloads/claim-classifier.json',
  'downloads/claim-classifier.md',
  'data/evidence-vault.json',
  'data/epstein-people-index.json',
  'index.html',
  'epstein-files.html',
  'daily-drop.html',
  'network-search.html',
  'evidence-vault.html',
  'search-index.json',
  'sitemap.xml',
  'llms.txt',
  'package.json'
]) requireFile(file);

for(const marker of ['CLAIM CLASSIFIER.', 'Evidence Badges', 'Source Hierarchy', 'Claim Rules', 'What it proves', 'What it does not prove', 'What strengthens it', 'Speculation Quarantine', 'Unsupported / Rejected']) requireIncludes('claim-classifier.html', marker, marker);
for(const file of ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html']) requireIncludes(file, 'evidence-badge-system-route', `${file} evidence badge route patch`);

if(exists('downloads/claim-classifier.json')){
  const data = JSON.parse(read('downloads/claim-classifier.json'));
  if(!data.updated) fail('downloads/claim-classifier.json missing updated');
  if(!Array.isArray(data.badges) || data.badges.length < 12) fail('downloads/claim-classifier.json expected at least 12 badges');
  if(!Array.isArray(data.sourceHierarchy) || data.sourceHierarchy.length < 8) fail('downloads/claim-classifier.json expected source hierarchy entries');
  if(!Array.isArray(data.claimRules) || data.claimRules.length < 8) fail('downloads/claim-classifier.json expected claim rules');
  for(const badge of data.badges || []){
    for(const field of ['label','strength','proves','doesNotProve','strengthensWith']) if(!badge[field]) fail(`badge ${badge.label || 'unknown'} missing ${field}`);
  }
}
requireIncludes('downloads/claim-classifier.md', '# Matrix Reprogrammed Claim Classifier', 'claim classifier markdown title');
requireIncludes('search-index.json', 'claim-classifier.html', 'claim classifier search-index route');
requireIncludes('sitemap.xml', '/claim-classifier.html', 'claim classifier sitemap route');
requireIncludes('llms.txt', '/claim-classifier.html', 'claim classifier llms route');
requireIncludes('package.json', 'build-evidence-badge-system.js', 'package build includes evidence badge builder');
requireIncludes('package.json', 'evidence-badge-pressure-test.js', 'package build includes evidence badge test');

if(problems.length){
  console.error('\nEVIDENCE BADGE PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('EVIDENCE BADGE PRESSURE TEST PASSED');
console.log('Checked claim classifier page, evidence badges, source hierarchy, claim rules, downloads, page patches, sitemap, llms.txt, search index, and build wiring.');
