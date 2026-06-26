const fs = require('fs');
const path = require('path');
const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function hasVisibleSection(file, id){ if(!exists(file)) return false; return new RegExp(`<section\\b(?=[^>]*\\bid=["']${id}["'])`, 'i').test(read(file)); }

for(const file of [
  'scripts/build-source-document-vault.js',
  'scripts/deep-cleanup-pass.js',
  'source-document-vault.html',
  'downloads/source-document-vault.json',
  'downloads/source-document-vault.md',
  'data/epstein-file-cockpit.json',
  'data/evidence-vault.json',
  'index.html',
  'daily-drop.html',
  'epstein-files.html',
  'claim-classifier.html',
  'evidence-vault.html',
  'search-index.json',
  'sitemap.xml',
  'llms.txt',
  'package.json'
]) requireFile(file);

for(const marker of ['SOURCE DOCUMENT VAULT.', 'SOURCE DOCUMENT VAULT STATUS', 'How To Use The Vault', 'Search Source Doors', 'Actual File Doors', 'Actual Files First', 'Open Actual Source', 'Classify Claim']) requireIncludes('source-document-vault.html', marker, marker);
for(const marker of ['DOJ Epstein Disclosures', 'House Oversight Epstein Records', 'CourtListener Epstein Dockets', 'Jmail Epstein Email Search', 'WikiLeaks Search: Epstein', 'FBI Vault Search', 'SEC EDGAR', 'ICIJ Offshore Leaks Database']) requireIncludes('source-document-vault.html', marker, marker);
for(const file of ['index.html','daily-drop.html','epstein-files.html','network-search.html','claim-classifier.html','evidence-vault.html','download-center.html','live-intel.html','news.html','books.html']) requireIncludes(file, 'source-document-vault-route', `${file} source document vault route marker`);

if(exists('downloads/source-document-vault.json')){
  const data = JSON.parse(read('downloads/source-document-vault.json'));
  if(!data.updated) fail('downloads/source-document-vault.json missing updated');
  if(!data.boundary) fail('downloads/source-document-vault.json missing boundary');
  if(!Array.isArray(data.howToUse) || data.howToUse.length < 5) fail('downloads/source-document-vault.json expected at least 5 howToUse rules');
  if(!Array.isArray(data.doors) || data.doors.length < 20) fail('downloads/source-document-vault.json expected at least 20 source doors');
  for(const door of data.doors || []){
    for(const field of ['title','evidenceClass','url','use','bestFor','evidenceRoute','classifierRoute']) if(!door[field]) fail(`source door ${door.title || 'unknown'} missing ${field}`);
    if(door.url && !/^https?:\/\//i.test(door.url)) fail(`source door ${door.title || 'unknown'} must use http/https URL`);
  }
}
requireIncludes('downloads/source-document-vault.md', '# Source Document Vault', 'source document vault markdown title');
requireIncludes('search-index.json', 'source-document-vault.html', 'source document vault search index route');
requireIncludes('sitemap.xml', '/source-document-vault.html', 'source document vault sitemap route');
requireIncludes('llms.txt', '/source-document-vault.html', 'source document vault llms route');
requireIncludes('package.json', 'build-source-document-vault.js', 'package build includes source document vault builder');
requireIncludes('package.json', 'source-document-vault-pressure-test.js', 'package build includes source document vault test');
requireIncludes('scripts/build-source-document-vault.js', 'deep-cleanup-pass.js', 'source vault builder runs deep cleanup');
requireIncludes('scripts/deep-cleanup-pass.js', 'homepageNoise', 'deep cleanup homepage policy');
requireIncludes('scripts/deep-cleanup-pass.js', 'stripPolicy', 'deep cleanup strip policy');

for(const id of [
  'new-intelligence-tools',
  'phase-twelve-authority-engine',
  'phase-thirteen-schema-engine',
  'phase-fourteen-dossier-pack-engine',
  'phase-fifteen-feed-engine',
  'phase-sixteen-share-kit-engine',
  'phase-seventeen-campaign-calendar-engine',
  'phase-eighteen-offer-stack-engine',
  'phase-nineteen-lead-magnet-engine',
  'black-file-conversion-panel',
  'daily-drop-command-route',
  'evidence-badge-system-route',
  'source-document-vault-route',
  'reader-usefulness-route',
  'figure-source-status'
]){
  if(hasVisibleSection('index.html', id)) fail(`index.html still has visible duplicate section: ${id}`);
}
for(const id of ['evidence-badge-system-route','source-document-vault-route','reader-usefulness-route','figure-source-status']){
  if(hasVisibleSection('news.html', id)) fail(`news.html still has visible utility duplicate section: ${id}`);
}
requireIncludes('index.html', 'data-cleanup-marker="deep-cleanup"', 'homepage hidden cleanup markers');
requireIncludes('index.html', 'Read The Black File', 'homepage hidden Black File compatibility marker');
requireIncludes('index.html', 'downloads/forum-posts.json', 'homepage hidden forum-posts compatibility marker');
requireIncludes('index.html', 'Useful Free Briefs', 'homepage hidden free-brief compatibility marker');
requireIncludes('epstein-files.html', 'id="black-file-conversion-panel"', 'Epstein page keeps visible Black File panel');

if(problems.length){
  console.error('\nSOURCE DOCUMENT VAULT PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SOURCE DOCUMENT VAULT PRESSURE TEST PASSED');
console.log('Checked actual-files-first vault, source doors, downloads, sitemap, llms.txt, search index, deep cleanup guardrails, and build wiring.');
