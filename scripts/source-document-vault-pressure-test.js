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
function requirePdfText(file, text, label = text){
  if(!exists(file)) return fail(`missing required PDF: ${file}`);
  const pdf = read(file);
  if(!pdf.includes(text)) fail(`${file}: missing ${label}`);
}

for(const file of [
  'scripts/build-source-document-vault.js',
  'scripts/deep-cleanup-pass.js',
  'scripts/branded-pdf-mini-book.js',
  'scripts/build-all-branded-download-pdfs.js',
  'source-document-vault.html',
  'downloads/source-document-vault.json',
  'downloads/source-document-vault.md',
  'downloads/branded-download-index.json',
  'downloads/branded-download-index.md',
  'data/epstein-file-cockpit.json',
  'data/evidence-vault.json',
  'index.html',
  'daily-drop.html',
  'epstein-files.html',
  'claim-classifier.html',
  'evidence-vault.html',
  'download-center.html',
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
requireIncludes('scripts/build-source-document-vault.js', 'build-all-branded-download-pdfs.js', 'source vault builder runs branded PDF index');
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

requireIncludes('scripts/branded-pdf-mini-book.js', 'coverPage()', 'premium PDF cover generator');
requireIncludes('scripts/branded-pdf-mini-book.js', 'TABLE OF CONTENTS', 'premium PDF table of contents generator');
requireIncludes('scripts/branded-pdf-mini-book.js', 'PUBLIC-RECORD MINI BOOK', 'premium PDF cover label');
requireIncludes('scripts/branded-pdf-mini-book.js', 'AUTO-UPDATED FROM CURRENT SITE DATA', 'premium PDF cover badge');
requireIncludes('scripts/branded-pdf-mini-book.js', 'Related Matrix Reprogrammed books', 'premium PDF related books section');
requireIncludes('scripts/build-all-branded-download-pdfs.js', 'flagshipOrder', 'flagship PDF collection wiring');
requireIncludes('scripts/build-all-branded-download-pdfs.js', 'Flagship PDF Collection', 'download center flagship section wiring');
requireIncludes('download-center.html', 'Branded PDF Mini Books', 'download center branded PDF section');
requireIncludes('download-center.html', 'Flagship PDF Collection', 'download center flagship PDF collection');
requireIncludes('download-center.html', 'BRANDED PDF ENGINE', 'download center PDF engine status');
if(exists('downloads/branded-download-index.json')){
  const index = JSON.parse(read('downloads/branded-download-index.json'));
  if(!Array.isArray(index.premiumStructure) || !index.premiumStructure.includes('cover page') || !index.premiumStructure.includes('table of contents')) fail('branded-download-index.json missing premium PDF structure metadata');
  if(!Array.isArray(index.flagships) || index.flagships.length < 4) fail('branded-download-index.json expected at least 4 flagship PDFs');
  if(!Array.isArray(index.pdfs) || index.pdfs.length < 20) fail('branded-download-index.json expected at least 20 PDFs');
}
requireIncludes('downloads/branded-download-index.md', '## Flagship PDFs', 'branded index flagship section');
requireIncludes('downloads/branded-download-index.md', 'cover page, table of contents', 'branded index premium structure copy');
for(const pdf of ['downloads/lead-magnet-black-file-brief.pdf','downloads/share-kit-black-file-starter.pdf','downloads/dossier-pack-trust-evidence.pdf']){
  requirePdfText(pdf, 'PUBLIC-RECORD MINI BOOK', 'premium cover text');
  requirePdfText(pdf, 'TABLE OF CONTENTS', 'premium table of contents');
  requirePdfText(pdf, 'AUTO-UPDATED FROM CURRENT SITE DATA', 'premium auto-update badge');
  requirePdfText(pdf, 'Speculation Boundary', 'speculation boundary section');
}

if(problems.length){
  console.error('\nSOURCE DOCUMENT VAULT PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SOURCE DOCUMENT VAULT PRESSURE TEST PASSED');
console.log('Checked actual-files-first vault, source doors, downloads, premium PDF covers, table of contents, flagship PDF collection, sitemap, llms.txt, search index, deep cleanup guardrails, and build wiring.');
