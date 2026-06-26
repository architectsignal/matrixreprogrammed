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
  'scripts/build-source-document-vault.js',
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
for(const file of ['index.html','daily-drop.html','epstein-files.html','network-search.html','claim-classifier.html','evidence-vault.html','download-center.html','live-intel.html','news.html','books.html']) requireIncludes(file, 'source-document-vault-route', `${file} source document vault route patch`);

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

if(problems.length){
  console.error('\nSOURCE DOCUMENT VAULT PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SOURCE DOCUMENT VAULT PRESSURE TEST PASSED');
console.log('Checked actual-files-first vault, source doors, downloads, page patches, sitemap, llms.txt, search index, and build wiring.');
