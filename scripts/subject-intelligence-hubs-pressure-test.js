const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ issues.push(msg); }
function needFile(file){ if(!exists(file)) fail(`missing ${file}`); }
function needText(file, text){ if(exists(file) && !read(file).includes(text)) fail(`${file} missing ${text}`); }

for(const file of [
  'data/subject-intelligence-profiles.json',
  'scripts/build-subject-intelligence-hubs.js',
  'subject-index.html',
  'downloads/subject-hub-index.json',
  'downloads/subject-hub-index.md',
  'download-center.html',
  'search-index.json',
  'sitemap.xml',
  'llms.txt',
  'package.json'
]) needFile(file);

const profiles = exists('data/subject-intelligence-profiles.json') ? JSON.parse(read('data/subject-intelligence-profiles.json')) : { subjects: [] };
if(!Array.isArray(profiles.subjects) || profiles.subjects.length < 6) fail('expected at least 6 subject profiles');

for(const subject of profiles.subjects || []){
  const page = `subject-${subject.slug}.html`;
  const pdf = `downloads/subject-${subject.slug}.pdf`;
  needFile(page);
  needFile(pdf);
  needText(page, 'Subject Intelligence Hub');
  needText(page, 'Download Subject PDF');
  needText(page, 'Proof / Source Routes');
  needText(page, 'Speculation Boundary');
  needText(page, 'Latest Live-Intel Matches');
  needText(page, 'Related Books');
  needText(page, 'Next Reader Action');
  needText(page, pdf);
  needText('search-index.json', page);
  needText('sitemap.xml', `/${page}`);
  needText('llms.txt', `/${page}`);
}

needText('subject-index.html', 'SUBJECT INTELLIGENCE HUBS.');
needText('subject-index.html', 'SUBJECT HUB ENGINE');
needText('subject-index.html', 'data/subject-intelligence-profiles.json');
needText('download-center.html', 'Subject Intelligence Hubs');
needText('download-center.html', 'subject-index.html');
needText('downloads/subject-hub-index.md', '# Subject Hub Index');
if(exists('downloads/subject-hub-index.json')){
  const index = JSON.parse(read('downloads/subject-hub-index.json'));
  if(!Array.isArray(index.hubs) || index.hubs.length < 6) fail('subject-hub-index.json expected at least 6 hubs');
  for(const hub of index.hubs || []){
    if(!hub.file || !hub.pdf || !hub.title || !hub.slug) fail('subject hub index item missing file/pdf/title/slug');
  }
}
needText('package.json', 'build-subject-intelligence-hubs.js');
needText('package.json', 'subject-intelligence-hubs-pressure-test.js');

if(issues.length){
  console.error('\nSUBJECT INTELLIGENCE HUBS PRESSURE TEST FAILED\n');
  for(const issue of issues) console.error(`- ${issue}`);
  console.error(`\n${issues.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SUBJECT INTELLIGENCE HUBS PRESSURE TEST PASSED');
console.log('Checked subject profiles, generated hub pages, PDF links, subject index, download center patch, sitemap, llms.txt, search index, and package wiring.');
